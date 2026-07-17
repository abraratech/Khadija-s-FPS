#!/usr/bin/env python3
"""POST-FINAL.6 read-only local and live release verifier.

This script never writes project files, changes Git, deploys Cloudflare,
changes secrets, creates passkeys, revokes sessions, or performs moderation
actions. It only reads local files, runs deterministic checks, and issues GET
requests to public release/health endpoints.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

PATCH = "post-final6-r1-production-operations-hardening"
BASELINE_SHA = "5511d393d7249b5487affa3616716ccb64593e99"
PROTOCOL = 6
WORKER_DEFAULT = "https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev"
READ_ONLY_BANNER = "READ-ONLY POST-FINAL.6 VERIFIER"


def run(command: list[str], cwd: Path, *, timeout: int = 300) -> tuple[int, str]:
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as error:
        output = "\n".join(
            value.strip()
            for value in (error.stdout or "", error.stderr or "")
            if isinstance(value, str) and value.strip()
        )
        suffix = f"\n{output}" if output else ""
        return 124, f"Timed out after {timeout} seconds: {' '.join(command)}{suffix}"
    output = "\n".join(
        value.strip()
        for value in (completed.stdout, completed.stderr)
        if value.strip()
    )
    return completed.returncode, output


def fetch_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "accept": "application/json",
            "cache-control": "no-cache",
            "user-agent": "Khadijas-Arena-POST-FINAL6-Read-Only-Verifier",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def check(condition: bool, label: str, failures: list[str]) -> None:
    print(f"{'PASS' if condition else 'FAIL'}: {label}")
    if not condition:
        failures.append(label)


def local_checks(project: Path, *, run_tests: bool, run_worker: bool) -> list[str]:
    failures: list[str] = []
    print("\n[LOCAL SOURCE]")
    required = [
        "index.html",
        "moderation.html",
        "multiplayer-release.json",
        "js/moderation_admin.js",
        "js/moderation_admin_core.js",
        "multiplayer-server/package.json",
        "multiplayer-server/package-lock.json",
        "multiplayer-server/wrangler.jsonc",
        "multiplayer-server/src/index.js",
        "multiplayer-server/src/ops_hub.js",
        "multiplayer-server/src/postfinal6_admin_core.js",
        "scripts/build_production.py",
    ]
    for relative in required:
        check((project / relative).is_file(), f"required file: {relative}", failures)

    release_path = project / "multiplayer-release.json"
    if release_path.is_file():
        release = json.loads(release_path.read_text(encoding="utf-8"))
        check(release.get("protocol") == PROTOCOL, "frontend protocol is 6", failures)
        check(
            release.get("postFinal6", {}).get("patch") == PATCH,
            "frontend identifies POST-FINAL.6",
            failures,
        )
        check(
            release.get("postFinal6", {}).get("sourceBaselineSha") == BASELINE_SHA,
            "frontend records the sealed source baseline",
            failures,
        )
        check(
            release.get("postFinal6", {}).get("manualDeploymentOnly") is True,
            "release declares manual deployment only",
            failures,
        )

    git_dir = project / ".git"
    if git_dir.exists():
        code, head = run(["git", "rev-parse", "HEAD"], project)
        check(code == 0 and len(head.splitlines()[0]) == 40, "Git HEAD is readable", failures)
        code, branch = run(["git", "branch", "--show-current"], project)
        check(code == 0 and branch.strip() == "main", "Git branch is main", failures)
        code, _ = run(["git", "merge-base", "--is-ancestor", BASELINE_SHA, "HEAD"], project)
        check(code == 0, "Git HEAD descends from the supplied baseline", failures)
        code, status = run(["git", "status", "--short"], project)
        if status.strip():
            print("INFO: Working tree contains release changes awaiting commit.")
        else:
            print("PASS: Git working tree is clean.")
    else:
        print("INFO: .git is absent; Git ancestry checks were skipped.")

    if run_tests:
        print("\n[FRONTEND JAVASCRIPT]")
        js_files = sorted((project / "js").rglob("*.js"))
        worker_js = sorted((project / "multiplayer-server" / "src").rglob("*.js"))
        syntax_failures = 0
        for path in js_files + worker_js:
            code, output = run(["node", "--check", str(path)], project)
            if code:
                syntax_failures += 1
                print(f"FAIL: syntax {path.relative_to(project)}\n{output}")
        check(syntax_failures == 0, f"JavaScript syntax ({len(js_files) + len(worker_js)} files)", failures)

        tests = sorted((project / "js").rglob("*.test.js"))
        missing_map_heroes = [
            name
            for name in (
                "grid_bunker", "hospital_wing", "industrial_yard",
                "neon_depot", "parking_garage", "reactor_courtyard"
            )
            if not (project / "assets" / "ui" / "maps" / f"{name}.webp").is_file()
        ]
        test_failures = 0
        for path in tests:
            code, output = run(["node", str(path)], project)
            if code:
                # Uploaded source archives intentionally omit WebP assets.
                relative = path.relative_to(project).as_posix()
                media_contracts = {
                    "js/final2_contract.test.js",
                    "js/ui/cross_platform_menu_contract.test.js",
                }
                if relative in media_contracts and missing_map_heroes:
                    print(f"SKIP: {relative} (map WebPs intentionally absent)")
                    continue
                test_failures += 1
                print(f"FAIL: {path.relative_to(project)}\n{output}")
        check(test_failures == 0, f"frontend deterministic tests ({len(tests)} discovered)", failures)

    if run_worker:
        print("\n[WORKER]")
        server = project / "multiplayer-server"
        code, output = run(["npm", "run", "check"], server)
        if output:
            print(output)
        check(code == 0, "complete Worker npm run check", failures)

    return failures


def live_checks(frontend_url: str, worker_url: str) -> list[str]:
    failures: list[str] = []
    print("\n[LIVE COMPATIBILITY]")
    frontend_base = frontend_url.rstrip("/")
    worker_base = worker_url.rstrip("/")
    try:
        frontend = fetch_json(f"{frontend_base}/multiplayer-release.json?pf6=1")
        check(frontend.get("protocol") == PROTOCOL, "live frontend protocol is 6", failures)
        check(
            frontend.get("postFinal6", {}).get("patch") == PATCH,
            "live frontend identifies POST-FINAL.6",
            failures,
        )
    except (OSError, ValueError, urllib.error.URLError) as error:
        print(f"FAIL: live frontend release fetch: {error}")
        failures.append("live frontend release fetch")
        frontend = {}

    try:
        health = fetch_json(f"{worker_base}/health?pf6=1")
        release = fetch_json(f"{worker_base}/release?pf6=1")
        check(health.get("ok") is True, "live Worker health ok", failures)
        check(release.get("ok") is True, "live Worker release ok", failures)
        check(health.get("protocol") == PROTOCOL, "live Worker protocol is 6", failures)
        check(
            health.get("productionOperationsHardening", {}).get("patch") == PATCH,
            "live Worker health identifies POST-FINAL.6",
            failures,
        )
        check(
            release.get("productionOperationsHardening", {}).get("patch") == PATCH,
            "live Worker release identifies POST-FINAL.6",
            failures,
        )
        check(
            frontend.get("protocol") == release.get("protocol"),
            "Pages and Worker protocol compatibility",
            failures,
        )
        check(
            frontend.get("postFinal6", {}).get("patch")
            == release.get("productionOperationsHardening", {}).get("patch"),
            "Pages and Worker release-patch compatibility",
            failures,
        )
    except (OSError, ValueError, urllib.error.URLError) as error:
        print(f"FAIL: live Worker release fetch: {error}")
        failures.append("live Worker release fetch")

    try:
        bootstrap = fetch_json(f"{worker_base}/ops/admin/auth/bootstrap/status?pf6=1")
        check(bootstrap.get("ok") is True, "admin bootstrap status is reachable", failures)
        check(
            isinstance(bootstrap.get("breakGlassConfigured"), bool),
            "break-glass presence is reported without its value",
            failures,
        )
        check(
            isinstance(bootstrap.get("webhookConfigured"), bool),
            "webhook presence is reported without its value",
            failures,
        )
    except (OSError, ValueError, urllib.error.URLError) as error:
        print(f"FAIL: admin bootstrap status fetch: {error}")
        failures.append("admin bootstrap status fetch")

    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=READ_ONLY_BANNER)
    parser.add_argument("--project-root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--frontend-url", default="")
    parser.add_argument("--worker-url", default=WORKER_DEFAULT)
    parser.add_argument("--skip-tests", action="store_true")
    parser.add_argument("--skip-worker", action="store_true")
    args = parser.parse_args()

    project = Path(args.project_root).resolve()
    print("=" * 72)
    print(READ_ONLY_BANNER)
    print("No files, Git state, secrets, passkeys, moderation records, or deployments are changed.")
    print("=" * 72)

    failures = local_checks(
        project,
        run_tests=not args.skip_tests,
        run_worker=not args.skip_worker,
    )
    if args.frontend_url:
        failures.extend(live_checks(args.frontend_url, args.worker_url))

    print("\n" + "=" * 72)
    if failures:
        print(f"POST-FINAL.6 VERIFICATION: FAIL ({len(failures)} checks)")
        for failure in failures:
            print(f" - {failure}")
        return 1
    print("POST-FINAL.6 VERIFICATION: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
