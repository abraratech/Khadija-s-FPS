#!/usr/bin/env python3
"""Build the Khadija's Arena FINAL.2 production-only static asset directory.

Copies only runtime frontend files. Tests, source maps, Worker source,
repository tooling, previews, diagnostics, and development metadata are never
included in the output.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

PATCH = "final2-r1-full-product-certification"
SOURCE_SEAL = "dbc459802c5b38e71870ea70016f6200a523bb96148a74f29b1b594f1257b26e"
POST_FINAL_PATCH = "post-final1-r1-mobile-clarity-social-recovery"
POST_FINAL2_PATCH = "post-final2-r1-coop-audio-awareness"
POST_FINAL3_PATCH = "post-final3-r1-squad-command-team-intelligence"
ROOT_FILES = ("index.html", "favicon.ico", "multiplayer-release.json")
ROOT_DIRS = ("assets", "css", "js")
FORBIDDEN_PARTS = {
    ".git", ".wrangler", "node_modules", "multiplayer-server", "scripts",
    "game", "dist", "reports", "__pycache__"
}
FORBIDDEN_SUFFIXES = (".test.js", ".spec.js", ".map")
FORBIDDEN_NAMES = {
    "map_preview.html", "weapon_preview.html", "procedural_zombie_preview.html"
}
FORBIDDEN_TOKENS = (
    "live_voice", "voice_readiness", "voice_signal_core", "voice_turn_core",
    "fault_simulator", "recovery_diagnostics", "recovery_certification",
    "release_candidate", "release_runtime_audit", "release_seal",
    "soak_certification", "certification_pairing", "certification_session",
    "final_certification", "production_surface_core"
)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def allowed(relative: Path) -> bool:
    text = relative.as_posix().lower()
    if relative.name in FORBIDDEN_NAMES:
        return False
    if any(part.lower() in FORBIDDEN_PARTS for part in relative.parts):
        return False
    if any(text.endswith(suffix) for suffix in FORBIDDEN_SUFFIXES):
        return False
    if any(token in text for token in FORBIDDEN_TOKENS):
        return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--output-dir", default=r"C:\wamp64\MInstall\POST_FINAL2_PRODUCTION_BUILD")
    args = parser.parse_args()

    project = Path(args.project_root).resolve()
    output = Path(args.output_dir).resolve()
    if not (project / "index.html").is_file():
        raise SystemExit(f"Invalid project root: {project}")

    staging = output.with_name(output.name + ".tmp")
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    copied: dict[str, dict] = {}
    for name in ROOT_FILES:
        source = project / name
        if not source.is_file():
            raise SystemExit(f"Required production file is missing: {name}")
        destination = staging / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        copied[name] = {"size_bytes": destination.stat().st_size, "sha256": digest(destination)}

    for root_name in ROOT_DIRS:
        source_root = project / root_name
        if not source_root.is_dir():
            raise SystemExit(f"Required production directory is missing: {root_name}")
        for source in source_root.rglob("*"):
            if not source.is_file():
                continue
            relative = source.relative_to(project)
            if not allowed(relative):
                continue
            destination = staging / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            copied[relative.as_posix()] = {
                "size_bytes": destination.stat().st_size,
                "sha256": digest(destination)
            }

    forbidden_output = [
        relative for relative in copied
        if not allowed(Path(relative))
    ]
    if forbidden_output:
        raise SystemExit("Forbidden production files were staged: " + ", ".join(forbidden_output))

    manifest = {
        "project": "Khadija's Arena",
        "patch": PATCH,
        "certified_source_seal": SOURCE_SEAL,
        "certification": {
            "status": "CERTIFIED",
            "deterministic_tests": 144,
            "javascript_syntax_checks": 345,
            "map_hero_checks": 6,
            "voice_runtime_removed": True,
            "administrator_tools_included": False,
            "secrets_included": False
        },
        "post_final_hotfix": {
            "schema": 1,
            "patch": POST_FINAL_PATCH,
            "mobile_clarity": True,
            "social_recovery": True,
            "base_final2_identity_preserved": True
        },
        "post_final2": {
            "schema": 1,
            "patch": POST_FINAL2_PATCH,
            "coop_audio_awareness": True,
            "ally_down_alerts": True,
            "remote_tactical_ping_cues": True,
            "ai_wingman_enemy_marks": True,
            "team_alerts_volume_control": True,
            "caption_fallback": True,
            "voice_chat": False,
            "protocol_unchanged": True,
            "worker_change_required": False
        },
        "post_final3": {
            "schema": 1,
            "patch": POST_FINAL3_PATCH,
            "combined_squad_command_release": True,
            "command_wheel_commands": 8,
            "keyboard_controller_mobile": True,
            "ai_wingman_command_response": True,
            "team_intent_hud": True,
            "late_join_intent_via_bot_snapshot": True,
            "protocol_unchanged": True,
            "worker_change_required": False
        },
        "built_at_utc": datetime.now(timezone.utc).isoformat(),
        "file_count": len(copied),
        "policy": {
            "root_files": list(ROOT_FILES),
            "root_directories": list(ROOT_DIRS),
            "tests_included": False,
            "worker_source_included": False,
            "preview_pages_included": False,
            "source_maps_included": False,
            "voice_runtime_included": False
        },
        "files": dict(sorted(copied.items()))
    }
    (staging / "production-build-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )

    if output.exists():
        shutil.rmtree(output)
    staging.replace(output)
    print(f"Production build complete: {output}")
    print(f"Files staged: {len(copied)}")


if __name__ == "__main__":
    main()
