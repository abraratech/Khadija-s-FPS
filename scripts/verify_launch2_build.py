#!/usr/bin/env python3
"""Verify the LAUNCH.2 production-only frontend build."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote

PATCH = "launch2-r1-final-production-certification"
FORBIDDEN_PARTS = {
    ".git", ".wrangler", "node_modules", "multiplayer-server", "scripts",
    "reports", "backups", "__pycache__"
}
FORBIDDEN_SUFFIXES = (".test.js", ".spec.js", ".map", ".py", ".bat", ".zip")
FORBIDDEN_PUBLIC_MARKERS = (
    "mp-server-url",
    "recheck certified server",
    "certified server",
    "worker server",
    "multiplayer server url",
)
HTML_REF_RE = re.compile(r'''(?:src|href)\s*=\s*["']([^"']+)["']''', re.I)
CSS_REF_RE = re.compile(r'''url\(\s*["']?([^"')]+)''', re.I)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def local_reference(raw: str) -> str | None:
    value = unquote(str(raw or "").strip()).split("#", 1)[0].split("?", 1)[0]
    if not value or value.startswith(("#", "data:", "mailto:", "tel:", "javascript:")):
        return None
    if re.match(r"^[a-z][a-z0-9+.-]*://", value, re.I) or value.startswith("//"):
        return None
    return value.lstrip("/")


def verify_references(build: Path) -> int:
    checked = 0
    for html_name in ("index.html", "moderation.html"):
        html_path = build / html_name
        text = html_path.read_text(encoding="utf-8", errors="replace")
        for raw in HTML_REF_RE.findall(text):
            ref = local_reference(raw)
            if ref is None:
                continue
            checked += 1
            if not (build / ref).is_file():
                raise SystemExit(f"Missing production HTML reference: {html_name} -> {ref}")
    for css_path in (build / "css").rglob("*.css"):
        text = css_path.read_text(encoding="utf-8", errors="replace")
        for raw in CSS_REF_RE.findall(text):
            ref = local_reference(raw)
            if ref is None:
                continue
            target = (css_path.parent / ref).resolve()
            try:
                target.relative_to(build.resolve())
            except ValueError as exc:
                raise SystemExit(f"CSS reference escapes build root: {css_path.relative_to(build)} -> {ref}") from exc
            checked += 1
            if not target.is_file():
                raise SystemExit(f"Missing production CSS reference: {css_path.relative_to(build)} -> {ref}")
    return checked


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--build-dir", required=True)
    args = parser.parse_args()
    build = Path(args.build_dir).resolve()
    if not build.is_dir():
        raise SystemExit(f"Production build directory not found: {build}")

    manifest_path = build / "production-build-manifest.json"
    if not manifest_path.is_file():
        raise SystemExit("production-build-manifest.json is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    launch2 = manifest.get("launch2", {})
    if launch2.get("patch") != PATCH:
        raise SystemExit("LAUNCH.2 production manifest patch mismatch")
    for field in (
        "production_only_build", "runtime_reference_verification",
        "manifest_hash_verification", "tests_excluded", "worker_source_excluded",
        "repository_tools_excluded", "source_maps_excluded"
    ):
        if launch2.get(field) is not True:
            raise SystemExit(f"LAUNCH.2 production policy mismatch: {field}")
    if launch2.get("player_editable_service_endpoint") is not False:
        raise SystemExit("Player-editable service endpoint is not disabled")
    if launch2.get("player_facing_certification_controls") is not False:
        raise SystemExit("Player-facing certification controls are not disabled")

    post_launch4 = manifest.get("post_launch4", {})
    if post_launch4.get("patch") != "post-launch4-r1-update-delivery-cache-safety":
        raise SystemExit("POST-LAUNCH.4 production manifest patch mismatch")
    for required_root in ("release-version.json", "_headers"):
        if not (build / required_root).is_file():
            raise SystemExit(f"POST-LAUNCH.4 production root file is missing: {required_root}")
    release_descriptor = json.loads((build / "release-version.json").read_text(encoding="utf-8"))
    current_release = manifest.get("current_release", post_launch4)
    if release_descriptor.get("releaseId") != current_release.get("patch"):
        raise SystemExit("Current production release descriptor mismatch")
    if int(release_descriptor.get("releaseSequence", 0)) != int(current_release.get("release_sequence", -1)):
        raise SystemExit("Current production release sequence mismatch")
    pvp3 = manifest.get("pvp3", {})
    if current_release.get("patch") == "pvp3-r1-public-room-discovery-matchmaking-repair":
        if pvp3.get("patch") != current_release.get("patch"):
            raise SystemExit("PVP.3 production manifest patch mismatch")
        for field in ("difficulty_free_pvp", "explicit_room_browser_filters", "atomic_open_room_find", "worker_change_required", "frontend_and_worker"):
            if pvp3.get(field) is not True:
                raise SystemExit(f"PVP.3 production policy mismatch: {field}")
    post_seal1 = manifest.get("post_seal1", {})
    if current_release.get("patch") == "post-seal1-r1-console-lifecycle-form-hygiene":
        if post_seal1.get("patch") != current_release.get("patch"):
            raise SystemExit("POST-SEAL.1 production manifest patch mismatch")
        for field in ("deprecated_unload_removed", "page_lifecycle_bfcache_safe", "dynamic_form_field_identity"):
            if post_seal1.get(field) is not True:
                raise SystemExit(f"POST-SEAL.1 production policy mismatch: {field}")
    headers_text = (build / "_headers").read_text(encoding="utf-8", errors="replace")
    if "/index.html" not in headers_text or "/release-version.json" not in headers_text:
        raise SystemExit("POST-LAUNCH.4 cache header routes are incomplete")
    if "Cache-Control: no-cache, no-store, must-revalidate" not in headers_text:
        raise SystemExit("POST-LAUNCH.4 cache-control policy is incomplete")

    manifest_files = manifest.get("files", {})
    actual_files = {
        path.relative_to(build).as_posix(): path
        for path in build.rglob("*")
        if path.is_file() and path.name != manifest_path.name
    }
    if set(actual_files) != set(manifest_files):
        missing = sorted(set(manifest_files) - set(actual_files))
        extra = sorted(set(actual_files) - set(manifest_files))
        raise SystemExit(f"Production manifest file-set mismatch; missing={missing[:5]} extra={extra[:5]}")

    for relative, path in actual_files.items():
        lower_parts = {part.lower() for part in Path(relative).parts}
        if lower_parts & FORBIDDEN_PARTS:
            raise SystemExit(f"Forbidden production path: {relative}")
        if relative.lower().endswith(FORBIDDEN_SUFFIXES):
            raise SystemExit(f"Forbidden production file type: {relative}")
        expected = manifest_files[relative]
        if path.stat().st_size != int(expected.get("size_bytes", -1)):
            raise SystemExit(f"Production size mismatch: {relative}")
        if digest(path) != expected.get("sha256"):
            raise SystemExit(f"Production hash mismatch: {relative}")

    index_text = (build / "index.html").read_text(encoding="utf-8", errors="replace").lower()
    for marker in FORBIDDEN_PUBLIC_MARKERS:
        if marker in index_text:
            raise SystemExit(f"Player-facing infrastructure marker remains in index.html: {marker}")

    references = verify_references(build)
    print(f"LAUNCH.2 production build verification passed: {len(actual_files)} files, {references} local references.")


if __name__ == "__main__":
    main()
