#!/usr/bin/env python3
"""Build the Khadija's Arena production-only static asset directory.

Copies only runtime frontend files. Tests, source maps, Worker source,
repository tooling, previews, diagnostics, secrets, and development metadata
are never included. The protected moderation client is included without any
administrator credential; the Worker still requires its Bearer token.
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
POST_FINAL4_PATCH = "post-final4-r1-dynamic-operations-objective-director"
POST_FINAL5_PATCH = "post-final5-r1-moderation-player-safety-operations"
POST_FINAL6_PATCH = "post-final6-r1-production-operations-hardening"
POST_FINAL6_BASELINE_SHA = "5511d393d7249b5487affa3616716ccb64593e99"
POST_FINAL7_PATCH = "post-final7-r1-coop-operations-expansion"
POST_FINAL7_SOURCE_BASELINE_SHA = "83a44d5aad87b6785b8d466d8fb69bed0cb676f3"
POST_FINAL7_CERTIFIED_FRONTEND_BASELINE_SHA = "5511d393d7249b5487affa3616716ccb64593e99"
POST_FINAL8_PATCH = "post-final8-r1-enemy-factions-boss-replayability"
POST_FINAL8_SOURCE_BASELINE_SHA = "298ff47a5706c630ef48ed2d26625502440efb4f"
POST_FINAL8_CERTIFIED_FRONTEND_BASELINE_SHA = "5511d393d7249b5487affa3616716ccb64593e99"
ROOT_FILES = ("index.html", "moderation.html", "favicon.ico", "multiplayer-release.json")
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
            "deterministic_tests": 127,
            "javascript_syntax_checks": 369,
            "map_hero_checks": 6,
            "voice_runtime_removed": True,
            "administrator_tools_included": True,
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
        "post_final4": {
            "schema": 1,
            "patch": POST_FINAL4_PATCH,
            "combined_dynamic_operations_release": True,
            "operation_types": 6,
            "map_authored_safe_anchors": 6,
            "objective_director": True,
            "solo_and_coop_scaling": True,
            "ai_wingman_objective_response": True,
            "objective_hud_and_world_markers": True,
            "team_contribution_and_rewards": True,
            "late_join_reconnect_host_migration": True,
            "content1_snapshot_transport": True,
            "protocol_unchanged": True,
            "worker_change_required": False
        },
        "post_final5": {
            "schema": 1,
            "patch": POST_FINAL5_PATCH,
            "combined_moderation_player_safety_release": True,
            "protected_moderation_dashboard": True,
            "admin_token_embedded": False,
            "pending_queue_alerts": True,
            "privacy_reduced_report_history": True,
            "duplicate_report_grouping": True,
            "false_report_abuse_signals": True,
            "automatic_false_report_penalty": False,
            "report_forward_retry_queue": True,
            "authenticated_account_restrictions": True,
            "player_appeals": True,
            "reporter_status_privacy": "received-or-review-complete-only",
            "protocol_unchanged": True,
            "worker_change_required": True
        },
        "post_final6": {
            "schema": 1,
            "patch": POST_FINAL6_PATCH,
            "source_baseline_sha": POST_FINAL6_BASELINE_SHA,
            "administrator_authentication": "passkey",
            "legacy_token_use": "first-owner-bootstrap-only",
            "administrator_roles": [
                "viewer", "moderator", "senior-moderator", "owner"
            ],
            "administrator_session_hours": 8,
            "session_revocation": True,
            "staff_invitations": True,
            "destructive_action_confirmation": True,
            "moderator_assignment": True,
            "internal_case_notes": True,
            "case_timeline": True,
            "restriction_expiration_management": True,
            "audit_export": ["json", "csv"],
            "optional_webhook_alerts": True,
            "secret_values_included": False,
            "operational_visibility": True,
            "frontend_worker_compatibility": True,
            "manual_deployment_only": True,
            "protocol_unchanged": True,
            "worker_change_required": True
        },
        "post_final7": {
            "schema": 1,
            "patch": POST_FINAL7_PATCH,
            "source_baseline_sha": POST_FINAL7_SOURCE_BASELINE_SHA,
            "certified_frontend_baseline_sha": POST_FINAL7_CERTIFIED_FRONTEND_BASELINE_SHA,
            "mission_chains": 6,
            "stages_per_chain": 6,
            "map_specific_chains": True,
            "randomized_secondary_objectives": True,
            "elite_boss_stage": True,
            "extraction_risk_choices": ["SECURE", "OVERDRIVE"],
            "overdrive_reward_multiplier": 1.5,
            "ai_mission_awareness": True,
            "human_squad_command_override": True,
            "team_role_scoring": True,
            "mission_medals": True,
            "late_join_reconnect_host_migration_restore": True,
            "controller_mobile_support": True,
            "existing_content1_transport": True,
            "protocol_unchanged": True,
            "worker_change_required": False,
            "frontend_only": True
        },
        "post_final8": {
            "schema": 1,
            "patch": POST_FINAL8_PATCH,
            "source_baseline_sha": POST_FINAL8_SOURCE_BASELINE_SHA,
            "certified_frontend_baseline_sha": POST_FINAL8_CERTIFIED_FRONTEND_BASELINE_SHA,
            "enemy_factions": 4,
            "boss_candidates_per_faction": 2,
            "boss_phases": 3,
            "weak_point_and_stagger_tracking": True,
            "phase_reinforcement_escalation": True,
            "deterministic_mission_modifiers": True,
            "elite_affixes": True,
            "ai_boss_awareness": True,
            "human_squad_command_override": True,
            "late_join_reconnect_host_migration_restore": True,
            "mastery_grades_and_medals": True,
            "run_summary_integration": True,
            "controller_mobile_support": True,
            "existing_content1_transport": True,
            "protocol_unchanged": True,
            "worker_change_required": False,
            "frontend_only": True
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
            "voice_runtime_included": False,
            "protected_moderation_client_included": True,
            "administrator_credentials_included": False,
            "administrator_passkey_client_included": True,
            "legacy_shared_token_dashboard_authentication": False
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
