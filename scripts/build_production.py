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
POST_FINAL9_PATCH = "post-final9-r1-economy-rewards-long-term-progression"
POST_FINAL9_SOURCE_BASELINE_SHA = "bde3ff8d8fa5f29948c82ec4fa20959685e92846"
POST_FINAL9_CERTIFIED_FRONTEND_BASELINE_SHA = "5511d393d7249b5487affa3616716ccb64593e99"
POST_FINAL10_PATCH = "post-final10-r1-version1-stabilization-accessibility-performance"
POST_FINAL10_PRODUCT_VERSION = "1.0.0"
POST_FINAL10_SOURCE_BASELINE_SHA = "56e98d32e0bf2587a592e1e45faab218bbfbfda4"
POST_FINAL10_CERTIFIED_FRONTEND_BASELINE_SHA = "5511d393d7249b5487affa3616716ccb64593e99"
PVP1_PATCH = "pvp1-r1-isolated-team-elimination-foundation"
PVP1_PRODUCT_VERSION = "1.1.0-pvp1"
PVP1_SOURCE_BASELINE_SHA = "ddbdc3a4b478aa26a515e2dd8dbfc9449885c466"
PVP1_CERTIFIED_FRONTEND_BASELINE_SHA = "5511d393d7249b5487affa3616716ccb64593e99"
PVP2_PATCH = "pvp2-r2-public-custom-pvp-rooms"
PVP2_PRODUCT_VERSION = "1.1.0-pvp2"
PVP2_SOURCE_BASELINE_SHA = "014b0cf1921a3df3d8fbc3df9ad3be93e7e4fb0b"
PVP2_CERTIFIED_FRONTEND_BASELINE_SHA = "5511d393d7249b5487affa3616716ccb64593e99"
LAUNCH1_PATCH = "launch1-r1-first-run-welcome-production-language"
LAUNCH1_SOURCE_BASELINE_SHA = "aada1736cb2f404bda6e079bf175495957f19e1a"
LAUNCH2_PATCH = "launch2-r1-final-production-certification"
LAUNCH2_SOURCE_BASELINE_SHA = "aada1736cb2f404bda6e079bf175495957f19e1a"
POST_LAUNCH4_PATCH = "post-launch4-r1-update-delivery-cache-safety"
POST_LAUNCH4_SOURCE_BASELINE_SHA = "7f9b67e3168ab22c003b696420f1028f1dfa5dd8"
POST_LAUNCH4_RELEASE_SEQUENCE = 2026071801
POST_SEAL1_PATCH = "post-seal1-r1-console-lifecycle-form-hygiene"
POST_SEAL1_SOURCE_BASELINE_SHA = "cf13dce795e0d3f623cc27c01656bb24d5dd44c9"
POST_SEAL1_RELEASE_SEQUENCE = 2026071802
PVP3_PATCH = 'pvp3-r2-dedicated-rules-neutral-pickups'
PVP3_SOURCE_BASELINE_SHA = '484eccb0b96d396da839e7c25000f21cbcbc41fc'
PVP3_RELEASE_SEQUENCE = 2026071804
PVP4_PATCH = 'pvp4-r1-competitive-maps-dynamic-hot-drops'
PVP4_SOURCE_BASELINE_SHA = '1c6ef18390936d2c5c42689e728135ed393ed350'
PVP4_RELEASE_SEQUENCE = 2026071805
MPNET1_PATCH = 'mpnet1-r1-relay-transaction-resupply-integrity'
MPNET1_SOURCE_BASELINE_SHA = '1c6ef18390936d2c5c42689e728135ed393ed350'
MPNET1_RELEASE_SEQUENCE = 2026071806
PVP5_PATCH = 'pvp5-r1-competitive-match-completion-stabilization'
PVP5_FRONTEND_BASELINE_SHA = '9c57f5ab6516ac8fef0b1e70a0e9e0bf0d53ef87'
PVP5_WORKER_BASELINE_SHA = 'deecf81e933d3d9bcd4e3bc5a33da8dcc8aa00b7'
PVP5_RELEASE_SEQUENCE = 2026071807
PVP6_PATCH = 'pvp6-r1-final-pvp-certification-candidate'
PVP6_PRODUCT_VERSION = '1.1.0-pvp6-rc1'
PVP6_FRONTEND_BASELINE_SHA = '36c020aeddcf2c10bf117063167d6f6d2d59b556'
PVP6_WORKER_BASELINE_SHA = '334268d77dbd30b3ca1d7e3c3ad883cf27235944'
PVP6_BASELINE_WORKER_VERSION_ID = '76fbfcdc-178a-4394-97c9-5872fd0de52d'
PVP6_RELEASE_SEQUENCE = 2026071808
SOCIAL2_PATCH = 'social2-r1-arena-id-friend-discovery'
SOCIAL2_PRODUCT_VERSION = '1.1.0-social2-r1'
SOCIAL2_FRONTEND_BASELINE_SHA = '2d41fb1e0a23a12ca970184acf00272ead91d4ba'
SOCIAL2_WORKER_BASELINE_SHA = '24976152c3e9f0fe780cb20838627f5cf17dbedc'
SOCIAL2_BASELINE_WORKER_VERSION_ID = 'f1936d32-3c25-491a-b214-a16ab79e2c2f'
SOCIAL2_RELEASE_SEQUENCE = 2026071809
NET1_PATCH = 'net1-r1-webrtc-hybrid-transport'
NET1_PRODUCT_VERSION = '1.2.0-net1-r1'
NET1_FRONTEND_BASELINE_SHA = '8e0552196f9f59962a79905a2da55789ffc9d478'
NET1_WORKER_BASELINE_SHA = '1aa92025a774aa19d4dece995caae8b300fa28bf'
NET1_BASELINE_WORKER_VERSION_ID = '1ce125a4-d79c-43aa-914e-a1f689116618'
NET1_RELEASE_SEQUENCE = 2026071901
GAMEPLAY2_PATCH = 'gameplay2-r1-late-round-arena-mutations'
GAMEPLAY2_PRODUCT_VERSION = '1.3.0-gameplay2-r1'
GAMEPLAY2_SOURCE_BASELINE_SHA = 'debaeba8e15820d61158078ebd2ade55ef963aa5'
GAMEPLAY2_WORKER_BASELINE_SHA = '62a74627e24dc52dcf9fc524fddd8f949f2fd3cf'
GAMEPLAY2_BASELINE_WORKER_VERSION_ID = 'b4e4860b-78a4-4b63-8df4-e6ef596ec3ad'
GAMEPLAY2_RELEASE_SEQUENCE = 2026072001
GAMEPLAY3_PATCH = 'gameplay3-r1-interactive-evolving-maps'
GAMEPLAY3_PRODUCT_VERSION = '1.4.0-gameplay3-r1'
GAMEPLAY3_SOURCE_BASELINE_SHA = '336298a125d70f2b98f4299cea74f8c08c6cefca'
GAMEPLAY3_WORKER_BASELINE_SHA = '2a038bef08f3d27a71159ac6ef597139acfc58b1'
GAMEPLAY3_BASELINE_WORKER_VERSION_ID = '4f384856-891f-4563-b148-148c2f90cd98'
GAMEPLAY3_RELEASE_SEQUENCE = 2026072101
GAMEPLAY4_PATCH = 'gameplay4-r1-expanded-boss-encounters'
GAMEPLAY4_PRODUCT_VERSION = '1.5.0-gameplay4-r1'
GAMEPLAY4_SOURCE_BASELINE_SHA = 'f48d86332933f9a4e02c78b072cc5861d41d3e48'
GAMEPLAY4_WORKER_BASELINE_SHA = '2a038bef08f3d27a71159ac6ef597139acfc58b1'
GAMEPLAY4_BASELINE_WORKER_VERSION_ID = '4f384856-891f-4563-b148-148c2f90cd98'
GAMEPLAY4_RELEASE_SEQUENCE = 2026072102
GAMEPLAY5_PATCH = 'gameplay5-r1-narrative-operations'
GAMEPLAY5_PRODUCT_VERSION = '1.6.0-gameplay5-r1'
GAMEPLAY5_SOURCE_BASELINE_SHA = '1547495baab59056c5b89d4b207a8e1b2c660a69'
GAMEPLAY5_WORKER_BASELINE_SHA = '2a038bef08f3d27a71159ac6ef597139acfc58b1'
GAMEPLAY5_BASELINE_WORKER_VERSION_ID = '4f384856-891f-4563-b148-148c2f90cd98'
GAMEPLAY5_RELEASE_SEQUENCE = 2026072103
GAMEPLAY6_PATCH = 'gameplay6-r1-world-progression'
GAMEPLAY6_PRODUCT_VERSION = '1.7.0-gameplay6-r1'
GAMEPLAY6_SOURCE_BASELINE_SHA = 'b3544e114ce02047b3705af14fcc94428c8cdbe8'
GAMEPLAY6_WORKER_BASELINE_SHA = '2a038bef08f3d27a71159ac6ef597139acfc58b1'
GAMEPLAY6_BASELINE_WORKER_VERSION_ID = '4f384856-891f-4563-b148-148c2f90cd98'
GAMEPLAY6_RELEASE_SEQUENCE = 2026072104
GAMEPLAY7_PATCH = 'gameplay7-r1-dynamic-campaign-faction-control'
GAMEPLAY7_PRODUCT_VERSION = '1.8.0-gameplay7-r1'
GAMEPLAY7_SOURCE_BASELINE_SHA = 'ce039d5ecd87ad15ada567c9ed6849dcdde5f4b9'
GAMEPLAY7_WORKER_BASELINE_SHA = '2a038bef08f3d27a71159ac6ef597139acfc58b1'
GAMEPLAY7_BASELINE_WORKER_VERSION_ID = '4f384856-891f-4563-b148-148c2f90cd98'
GAMEPLAY7_RELEASE_SEQUENCE = 2026072105
LOADOUT2_PATCH = 'loadout2-r1-weapon-mastery-operator-specialization-melee'
LOADOUT2_PRODUCT_VERSION = '1.9.0-loadout2-r1'
LOADOUT2_SOURCE_BASELINE_SHA = '94fa816f099dec9ae6a6bc11047a2bf1331ee892'
LOADOUT2_WORKER_BASELINE_SHA = '2a038bef08f3d27a71159ac6ef597139acfc58b1'
LOADOUT2_BASELINE_WORKER_VERSION_ID = '4f384856-891f-4563-b148-148c2f90cd98'
LOADOUT2_RELEASE_SEQUENCE = 2026072201
QUALITY2_PATCH = 'quality2-r1-consolidated-low-gpu-rendering'
QUALITY2_PRODUCT_VERSION = '1.10.0-quality2-r1'
QUALITY2_SOURCE_BASELINE_SHA = 'd56ffa34d890f1cc2ac0ae8c98164e7c71edf9c7'
QUALITY2_WORKER_BASELINE_SHA = '2a038bef08f3d27a71159ac6ef597139acfc58b1'
QUALITY2_BASELINE_WORKER_VERSION_ID = '4f384856-891f-4563-b148-148c2f90cd98'
QUALITY2_RELEASE_SEQUENCE = 2026072202
ENDGAME1_PATCH = 'endgame1-r1-high-difficulty-operations'
ENDGAME1_PRODUCT_VERSION = '1.11.0-endgame1-r1'
ENDGAME1_SOURCE_BASELINE_SHA = 'b99543d4f233d8d5284f48ae0c6df0d4a528a362'
ENDGAME1_WORKER_BASELINE_SHA = '2a038bef08f3d27a71159ac6ef597139acfc58b1'
ENDGAME1_BASELINE_WORKER_VERSION_ID = '4f384856-891f-4563-b148-148c2f90cd98'
ENDGAME1_RELEASE_SEQUENCE = 2026072301
CONTENT2_PATCH = 'content2-r1-new-arena-enemy-expansion'
CONTENT2_PRODUCT_VERSION = '1.12.0-content2-r1'
CONTENT2_SOURCE_BASELINE_SHA = '501cc5ef8578569cbb727859188256c7ea81f5d9'
CONTENT2_WORKER_BASELINE_SHA = 'cde81e6cde6b1617b6cc0ecc90f2f532c66fb1ef'
CONTENT2_BASELINE_WORKER_VERSION_ID = '879cb83e-cfac-47eb-8b9a-f8d43f39aa97'
CONTENT2_RELEASE_SEQUENCE = 2026072302
QUALITY2_R2_PATCH = 'quality2-r2-consolidated-polish-certification'
QUALITY2_R2_PRODUCT_VERSION = '1.13.0-quality2-r2'
QUALITY2_R2_SOURCE_BASELINE_SHA = '762320f549f6a26a90b6c63f085b70bc53e0f00f'
QUALITY2_R2_WORKER_BASELINE_SHA = 'cde81e6cde6b1617b6cc0ecc90f2f532c66fb1ef'
QUALITY2_R2_BASELINE_WORKER_VERSION_ID = '9c8c2ec1-0299-4f85-aebf-4835e5791007'
QUALITY2_R2_RELEASE_SEQUENCE = 2026072303
LEGACY_FINAL2_PRODUCTION_BUILD = "FINAL2_PRODUCTION_BUILD"  # stable contract marker
ROOT_FILES = ("index.html", "moderation.html", "favicon.ico", "multiplayer-release.json", "release-version.json", "pvp-production-seal.json", "_headers")
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
    parser.add_argument("--output-dir", default=r"C:\wamp64\MInstall\LAUNCH2_PRODUCTION_BUILD")
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
            "deterministic_tests": 129,
            "javascript_syntax_checks": 370,
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
        "post_final9": {
            "schema": 1,
            "patch": POST_FINAL9_PATCH,
            "source_baseline_sha": POST_FINAL9_SOURCE_BASELINE_SHA,
            "certified_frontend_baseline_sha": POST_FINAL9_CERTIFIED_FRONTEND_BASELINE_SHA,
            "server_authoritative_currencies": ["arena_credits", "salvage", "faction_tokens"],
            "account_prestige": True,
            "prestige_cap": 20,
            "faction_reputation_tracks": 4,
            "weapon_loadout_mission_mastery": True,
            "boss_modifier_extraction_reward_balancing": True,
            "deterministic_cosmetic_collections": True,
            "duplicate_protection": "convert-to-salvage",
            "daily_weekly_economy_goals": True,
            "support_role_bonuses": True,
            "server_authoritative_reward_receipts": True,
            "idempotent_run_ledger": True,
            "offline_reconciliation": True,
            "cloud_profile_synchronization": True,
            "late_join_reconnect_host_migration_reward_integrity": True,
            "progression_and_run_summary_ui": True,
            "protocol_unchanged": True,
            "worker_change_required": True,
            "frontend_only": False
        },
        "post_final10": {
            "schema": 1,
            "patch": POST_FINAL10_PATCH,
            "product_version": POST_FINAL10_PRODUCT_VERSION,
            "source_baseline_sha": POST_FINAL10_SOURCE_BASELINE_SHA,
            "certified_frontend_baseline_sha": POST_FINAL10_CERTIFIED_FRONTEND_BASELINE_SHA,
            "accessibility": {
                "text_scale": True,
                "caption_scale": True,
                "reduced_motion": True,
                "reduced_flashes": True,
                "high_contrast": True,
                "color_vision_modes": 5,
                "color_independent_signals": True,
                "focus_assist": True
            },
            "performance_governor": True,
            "dynamic_particle_budget": True,
            "background_tab_conservation": True,
            "degraded_network_classification": True,
            "release_preflight_retries": 3,
            "controller_keyboard_mobile_certification": True,
            "frontend_worker_compatibility_verification": True,
            "certification": {
                "javascript_syntax_checks": 388,
                "frontend_deterministic_tests": 137,
                "worker_deterministic_tests": 37,
                "production_runtime_files": 252,
                "map_hero_checks": 6,
                "mp3_asset_checks": 43,
                "status": "CERTIFIED"
            },
            "version1_transition": True,
            "protocol_unchanged": True,
            "worker_change_required": True,
            "frontend_only": False
        },
        "pvp1": {
            "schema": 1,
            "patch": PVP1_PATCH,
            "product_version": PVP1_PRODUCT_VERSION,
            "source_baseline_sha": PVP1_SOURCE_BASELINE_SHA,
            "certified_frontend_baseline_sha": PVP1_CERTIFIED_FRONTEND_BASELINE_SHA,
            "feature_enabled": True,
            "feature_flag": "PVP1_ENABLED",
            "mode": "pvp-team-elimination",
            "private_rooms": True,
            "public_matchmaking": False,
            "supported_team_sizes": [1, 2],
            "best_of": 5,
            "rounds_to_win": 3,
            "server_authoritative_damage": True,
            "server_distance_validation": True,
            "friendly_fire_blocked": True,
            "separate_weapon_balance": True,
            "ai_enemies_disabled": True,
            "ai_wingman_disabled": True,
            "revive_disabled": True,
            "coop_objectives_disabled": True,
            "coop_reward_receipts_disabled": True,
            "reconnect_grace_ms": 45000,
            "host_migration_preserved": True,
            "protocol_unchanged": True,
            "worker_change_required": True,
            "frontend_only": False
        },
        "pvp2": {
            "schema": 1,
            "patch": PVP2_PATCH,
            "product_version": PVP2_PRODUCT_VERSION,
            "source_baseline_sha": PVP2_SOURCE_BASELINE_SHA,
            "certified_frontend_baseline_sha": PVP2_CERTIFIED_FRONTEND_BASELINE_SHA,
            "feature_enabled": True,
            "feature_flag": "PVP2_PUBLIC_MATCHMAKING_ENABLED",
            "mode": "pvp-team-elimination",
            "public_matchmaking": True,
            "public_team_size": 1,
            "public_custom_rooms": True,
            "public_custom_rooms_enabled": True,
            "custom_room_team_sizes": [1, 2],
            "custom_rooms_ranked": False,
            "custom_rooms_waiting_only": True,
            "private_pvp_preserved": True,
            "region_first_global_expansion": True,
            "no_backfill": True,
            "no_join_in_progress": True,
            "competitive_statistics": True,
            "competitive_leaderboards": ["global", "regional"],
            "rating_system": "elo-32",
            "idempotent_match_results": True,
            "spawn_protection_ms": 2000,
            "round_timeout_ms": 90000,
            "server_authoritative_timeout_resolution": True,
            "coop_isolation_preserved": True,
            "solo_isolation_preserved": True,
            "endpoints": ["/pvp2/stats", "/pvp2/leaderboard"],
            "protocol_unchanged": True,
            "worker_change_required": True,
            "frontend_only": False
        },
        "launch1": {
            "schema": 1,
            "patch": LAUNCH1_PATCH,
            "source_baseline_sha": LAUNCH1_SOURCE_BASELINE_SHA,
            "first_run_welcome": True,
            "welcome_replay_from_settings": True,
            "solo_and_multiplayer_shortcuts": True,
            "keyboard_focus_trap": True,
            "mobile_responsive": True,
            "reduced_motion_safe": True,
            "player_facing_worker_language_removed": True,
            "player_facing_certification_language_removed": True,
            "raw_service_errors_hidden": True,
            "gameplay_authority_unchanged": True,
            "worker_change_required": False,
            "frontend_only": True
        },
        "launch2": {
            "schema": 1,
            "patch": LAUNCH2_PATCH,
            "source_baseline_sha": LAUNCH2_SOURCE_BASELINE_SHA,
            "production_only_build": True,
            "runtime_reference_verification": True,
            "manifest_hash_verification": True,
            "tests_excluded": True,
            "worker_source_excluded": True,
            "repository_tools_excluded": True,
            "source_maps_excluded": True,
            "player_editable_service_endpoint": False,
            "player_facing_certification_controls": False,
            "approved_local_patches": [
                "hud1-r1-configurable-objective-display",
                "vis1-r1-visual-achievements-competitive-profile-hud-controls",
                "vis1-r1-1-pause-resume-visibility",
                "launch1-r1-first-run-welcome-production-language",
                "mpui2-r1-1-active-lobby-tab-isolation"
            ],
            "gameplay_authority_unchanged": True,
            "worker_change_required": False,
            "frontend_only": True
        },
        "post_launch4": {
            "schema": 1,
            "patch": POST_LAUNCH4_PATCH,
            "source_baseline_sha": POST_LAUNCH4_SOURCE_BASELINE_SHA,
            "release_sequence": POST_LAUNCH4_RELEASE_SEQUENCE,
            "release_descriptor": "release-version.json",
            "cache_control_headers": True,
            "stale_shell_detection": True,
            "active_match_refresh_deferred": True,
            "active_lobby_refresh_deferred": True,
            "matchmaking_refresh_deferred": True,
            "worker_change_required": False,
            "frontend_only": True
        },
        "post_seal1": {
            "schema": 1,
            "patch": POST_SEAL1_PATCH,
            "source_baseline_sha": POST_SEAL1_SOURCE_BASELINE_SHA,
            "release_sequence": POST_SEAL1_RELEASE_SEQUENCE,
            "deprecated_unload_removed": True,
            "page_lifecycle_bfcache_safe": True,
            "dynamic_form_field_identity": True,
            "worker_change_required": False,
            "frontend_only": True
        },
        "pvp3": {
            "schema": 2,
            "patch": PVP3_PATCH,
            "discovery_patch": "pvp3-r1-public-room-discovery-matchmaking-repair",
            "source_baseline_sha": PVP3_SOURCE_BASELINE_SHA,
            "release_sequence": PVP3_RELEASE_SEQUENCE,
            "difficulty_free_pvp": True,
            "explicit_room_browser_filters": True,
            "atomic_open_room_find": True,
            "dedicated_pvp_ruleset": True,
            "coop_shops_disabled_in_pvp": True,
            "coop_perks_disabled_in_pvp": True,
            "coop_economy_disabled_in_pvp": True,
            "pvp_doors_open_at_round_load": True,
            "neutral_weapon_pickups": True,
            "neutral_ammo_pickups": True,
            "neutral_armor_pickups": True,
            "server_authoritative_pickup_claims": True,
            "server_authoritative_weapon_ownership": True,
            "armor_damage_absorption": True,
            "pickups_reset_every_round": True,
            "equal_pistol_round_start": True,
            "worker_change_required": True,
            "frontend_and_worker": True
        },

        "pvp4": {
            "schema": 1,
            "patch": PVP4_PATCH,
            "source_baseline_sha": PVP4_SOURCE_BASELINE_SHA,
            "release_sequence": PVP4_RELEASE_SEQUENCE,
            "competitive_maps": ["crossfire_terminal", "foundry_ring", "skyline_relay"],
            "mirrored_team_spawns": True,
            "multi_lane_combat": True,
            "elevated_cover_positions": True,
            "dynamic_hot_drop_relocation": True,
            "server_authoritative_relocation": True,
            "consecutive_location_reuse_blocked": True,
            "nearby_location_reuse_blocked": True,
            "player_proximity_relocation_avoidance": True,
            "pickup_overlap_avoidance": True,
            "arrival_beacon_countdown": True,
            "reconnect_relocation_restoration": True,
            "worker_change_required": True,
            "frontend_and_worker": True
        },
        "mpnet1": {
            "schema": 1,
            "patch": MPNET1_PATCH,
            "source_baseline_sha": MPNET1_SOURCE_BASELINE_SHA,
            "release_sequence": MPNET1_RELEASE_SEQUENCE,
            "rolling_relay_window_ms": 30000,
            "sustained_degradation_hold_ms": 7000,
            "player_facing_relay_metrics": True,
            "atomic_health_economy_transactions": True,
            "initiating_client_reconciliation": True,
            "transaction_result_replay": True,
            "transaction_acknowledgements": True,
            "transaction_timeout_resync": True,
            "host_migration_transaction_ledger": True,
            "authoritative_health_grant": True,
            "emergency_pistol_resupply": True,
            "emergency_resupply_cooldown_ms": 60000,
            "worker_change_required": False,
            "frontend_only": True
        },
        "pvp5": {
            "schema": 1,
            "patch": PVP5_PATCH,
            "frontend_baseline_sha": PVP5_FRONTEND_BASELINE_SHA,
            "worker_baseline_sha": PVP5_WORKER_BASELINE_SHA,
            "release_sequence": PVP5_RELEASE_SEQUENCE,
            "competitive_maps": ["crossfire_terminal", "foundry_ring", "skyline_relay"],
            "complete_one_vs_one_lifecycle": True,
            "complete_two_vs_two_lifecycle": True,
            "eliminated_player_spectating": True,
            "server_authoritative_round_reset": True,
            "server_authoritative_match_completion": True,
            "assists": True,
            "competitive_scoreboard": True,
            "rematch_voting": True,
            "rematch_map_voting": True,
            "reconnect_restoration": True,
            "abandonment_forfeit": True,
            "idempotent_rated_result_submission": True,
            "worker_repository_cleanup": True,
            "worker_change_required": True,
            "frontend_and_worker": True
        },
        "pvp6": {
            "schema": 1,
            "patch": PVP6_PATCH,
            "product_version": PVP6_PRODUCT_VERSION,
            "frontend_baseline_sha": PVP6_FRONTEND_BASELINE_SHA,
            "worker_baseline_sha": PVP6_WORKER_BASELINE_SHA,
            "baseline_worker_version_id": PVP6_BASELINE_WORKER_VERSION_ID,
            "release_sequence": PVP6_RELEASE_SEQUENCE,
            "certification_status": "STATIC_CERTIFIED_LIVE_PENDING",
            "live_certification_status": "PENDING",
            "production_seal_candidate": True,
            "final_production_seal": False,
            "version_metadata_binding": "CF_VERSION_METADATA",
            "worker_version_metadata_exposed": True,
            "operational_rollback_flags_retained": True,
            "dead_pvp_flags_found": 0,
            "real_two_client_certification_required": True,
            "worker_change_required": True,
            "frontend_and_worker": True
        },
        "social2": {
            "schema": 2,
            "patch": SOCIAL2_PATCH,
            "product_version": SOCIAL2_PRODUCT_VERSION,
            "frontend_baseline_sha": SOCIAL2_FRONTEND_BASELINE_SHA,
            "worker_baseline_sha": SOCIAL2_WORKER_BASELINE_SHA,
            "baseline_worker_version_id": SOCIAL2_BASELINE_WORKER_VERSION_ID,
            "release_sequence": SOCIAL2_RELEASE_SEQUENCE,
            "permanent_arena_id": True,
            "exact_arena_id_search": True,
            "incoming_and_outgoing_requests": True,
            "shareable_profile_link": True,
            "local_qr_generation": True,
            "unified_social_hub": True,
            "scoreboard_friend_actions": True,
            "party_from_friends": True,
            "deep_link_friend_search": True,
            "worker_change_required": True,
            "frontend_and_worker": True
        },
        "net1": {
            "schema": 1,
            "patch": NET1_PATCH,
            "product_version": NET1_PRODUCT_VERSION,
            "frontend_baseline_sha": NET1_FRONTEND_BASELINE_SHA,
            "worker_baseline_sha": NET1_WORKER_BASELINE_SHA,
            "baseline_worker_version_id": NET1_BASELINE_WORKER_VERSION_ID,
            "release_sequence": NET1_RELEASE_SEQUENCE,
            "cloudflare_central_signaling": True,
            "small_room_full_mesh": True,
            "direct_data_channels": True,
            "reliable_ordered_channel": True,
            "unreliable_snapshot_channel": True,
            "websocket_durable_object_fallback": True,
            "critical_relay_shadow": True,
            "delivery_deduplication": True,
            "bounded_data_channel_buffers": True,
            "host_migration_preserved": True,
            "reconnect_fallback_preserved": True,
            "turn_optional": True,
            "worker_change_required": True,
            "frontend_and_worker": True
        },
        "gameplay2": {
        "schema": 1,
        "patch": GAMEPLAY2_PATCH,
        "product_version": GAMEPLAY2_PRODUCT_VERSION,
        "source_baseline_sha": GAMEPLAY2_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": GAMEPLAY2_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": GAMEPLAY2_BASELINE_WORKER_VERSION_ID,
        "release_sequence": GAMEPLAY2_RELEASE_SEQUENCE,
        "modes": [
            "solo-survival",
            "cooperative-survival",
            "objective-operations",
        ],
        "pvp_excluded": True,
        "host_authoritative": True,
        "mutation_milestones": [8, 11, 14],
        "late_round_first_wave": 17,
        "late_round_every_waves": 4,
        "mutations": [
            "BLACKOUT",
            "ELITE_INFESTATION",
            "SUPPLY_CRISIS",
            "HAZARD_SHIFT",
            "BERSERK_THREATS",
        ],
        "stacking": True,
        "late_join_snapshot": True,
        "reconnect_restoration": True,
        "host_migration_checkpoint": True,
        "reward_authority": True,
        "run_summary_history": True,
        "cross_run_cleanup": True,
        "worker_change_required": True,
        "frontend_and_worker": True,
    },
        "gameplay3": {
        "schema": 1,
        "patch": GAMEPLAY3_PATCH,
        "product_version": GAMEPLAY3_PRODUCT_VERSION,
        "source_baseline_sha": GAMEPLAY3_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": GAMEPLAY3_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": GAMEPLAY3_BASELINE_WORKER_VERSION_ID,
        "release_sequence": GAMEPLAY3_RELEASE_SEQUENCE,
        "modes": [
            "solo-survival",
            "cooperative-survival",
            "objective-operations",
        ],
        "supported_maps": [
            "grid_bunker",
            "industrial_yard",
            "hospital_wing",
            "stormbreak_canal",
        ],
        "pvp_excluded": True,
        "host_authoritative": True,
        "stage_waves": [4, 7, 10],
        "interactive_controls": True,
        "route_evolution": True,
        "temporary_cover": True,
        "hazard_evolution": True,
        "late_join_snapshot": True,
        "reconnect_restoration": True,
        "host_migration_checkpoint": True,
        "protocol_unchanged": True,
        "worker_change_required": False,
        "frontend_only": True,
    },
        "gameplay4": {
        "schema": 1,
        "patch": GAMEPLAY4_PATCH,
        "product_version": GAMEPLAY4_PRODUCT_VERSION,
        "source_baseline_sha": GAMEPLAY4_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": GAMEPLAY4_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": GAMEPLAY4_BASELINE_WORKER_VERSION_ID,
        "release_sequence": GAMEPLAY4_RELEASE_SEQUENCE,
        "modes": [
            "solo-survival",
            "cooperative-survival",
            "objective-operations",
        ],
        "boss_profiles": [
            "JUGGERNAUT",
            "MATRIARCH",
            "DETONATOR",
        ],
        "boss_phases": 3,
        "telegraphed_abilities": True,
        "interruptible_abilities": True,
        "vulnerability_windows": True,
        "arena_damage_zones": True,
        "phase_reinforcement_pressure": True,
        "solo_damage_scaling": True,
        "coop_role_aware_targeting": True,
        "bounded_reinforcement_scaling": True,
        "ability_commit_idempotence": True,
        "boss_type_matching": True,
        "pvp_excluded": True,
        "host_authoritative": True,
        "late_join_snapshot": True,
        "reconnect_restoration": True,
        "host_migration_checkpoint": True,
        "reward_authority": True,
        "run_summary_integration": True,
        "protocol_unchanged": True,
        "worker_change_required": False,
        "frontend_only": True,
    },
        "gameplay5": {
        "schema": 1,
        "patch": GAMEPLAY5_PATCH,
        "product_version": GAMEPLAY5_PRODUCT_VERSION,
        "source_baseline_sha": GAMEPLAY5_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": GAMEPLAY5_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": GAMEPLAY5_BASELINE_WORKER_VERSION_ID,
        "release_sequence": GAMEPLAY5_RELEASE_SEQUENCE,
        "modes": [
            "solo-survival",
            "cooperative-survival",
            "objective-operations",
        ],
        "supported_maps": [
            "grid_bunker",
            "industrial_yard",
            "neon_depot",
            "parking_garage",
            "hospital_wing",
            "reactor_courtyard",
            "stormbreak_canal",
        ],
        "map_specific_briefings": True,
        "stage_transmissions": True,
        "branch_consequences": True,
        "objective_outcome_influence": True,
        "boss_narrative_integration": True,
        "mutation_narrative_integration": True,
        "evolving_map_narrative_integration": True,
        "text_only_narrative": True,
        "voice_runtime_reintroduced": False,
        "nonverbal_audio_cues": True,
        "cinematic_hud_presentation": True,
        "deterministic_outcomes": True,
        "pvp_excluded": True,
        "host_authoritative": True,
        "late_join_snapshot": True,
        "reconnect_restoration": True,
        "host_migration_checkpoint": True,
        "reward_authority": True,
        "run_summary_integration": True,
        "protocol_unchanged": True,
        "worker_change_required": False,
        "frontend_only": True,
    },
        "gameplay6": {
        "schema": 1,
        "patch": GAMEPLAY6_PATCH,
        "product_version": GAMEPLAY6_PRODUCT_VERSION,
        "source_baseline_sha": GAMEPLAY6_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": GAMEPLAY6_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": GAMEPLAY6_BASELINE_WORKER_VERSION_ID,
        "release_sequence": GAMEPLAY6_RELEASE_SEQUENCE,
        "modes": [
            "solo-survival",
            "cooperative-survival",
            "objective-operations",
        ],
        "supported_maps": [
            "grid_bunker",
            "industrial_yard",
            "neon_depot",
            "parking_garage",
            "hospital_wing",
            "reactor_courtyard",
            "stormbreak_canal",
        ],
        "persistent_world_state": True,
        "sector_progression": True,
        "world_milestones": True,
        "operation_tier_unlocks": True,
        "narrative_outcome_contribution": True,
        "boss_victory_contribution": True,
        "mutation_contribution": True,
        "evolving_map_contribution": True,
        "profile_owned_state": True,
        "cloud_merge_safe": True,
        "protected_progression_rewards": True,
        "idempotent_contribution_receipts": True,
        "pvp_excluded": True,
        "host_authoritative": True,
        "late_join_snapshot": True,
        "reconnect_restoration": True,
        "host_migration_checkpoint": True,
        "run_summary_integration": True,
        "protocol_unchanged": True,
        "worker_change_required": False,
        "frontend_only": True,
    },
        "gameplay7": {
        "schema": 1,
        "patch": GAMEPLAY7_PATCH,
        "product_version": GAMEPLAY7_PRODUCT_VERSION,
        "source_baseline_sha": GAMEPLAY7_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": GAMEPLAY7_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": GAMEPLAY7_BASELINE_WORKER_VERSION_ID,
        "release_sequence": GAMEPLAY7_RELEASE_SEQUENCE,
        "modes": [
            "solo-survival",
            "cooperative-survival",
            "objective-operations",
        ],
        "supported_maps": [
            "grid_bunker",
            "industrial_yard",
            "neon_depot",
            "parking_garage",
            "hospital_wing",
            "reactor_courtyard",
            "stormbreak_canal",
        ],
        "dynamic_sector_control": True,
        "secured_contested_overrun_states": True,
        "enemy_faction_influence": True,
        "world_progression_integration": True,
        "narrative_outcome_influence": True,
        "boss_victory_influence": True,
        "control_based_enemy_tuning": True,
        "control_based_hazard_tuning": True,
        "control_based_reward_tuning": True,
        "profile_owned_state": True,
        "cloud_merge_safe": True,
        "protected_campaign_rewards": True,
        "idempotent_contribution_receipts": True,
        "pvp_excluded": True,
        "host_authoritative": True,
        "late_join_snapshot": True,
        "reconnect_restoration": True,
        "host_migration_checkpoint": True,
        "run_summary_integration": True,
        "protocol_unchanged": True,
        "worker_change_required": False,
        "frontend_only": True,
        "crazygames_readiness_on_hold": True,
        "android_readiness_on_hold": True,
    },
        "loadout2": {
        "schema": 1,
        "patch": LOADOUT2_PATCH,
        "product_version": LOADOUT2_PRODUCT_VERSION,
        "source_baseline_sha": LOADOUT2_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": LOADOUT2_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": LOADOUT2_BASELINE_WORKER_VERSION_ID,
        "release_sequence": LOADOUT2_RELEASE_SEQUENCE,
        "modes": ["solo-survival", "cooperative-survival", "objective-operations"],
        "weapon_families": ["PISTOL", "SMG", "RIFLE", "SHOTGUN", "SNIPER", "MELEE"],
        "functional_field_knife": True,
        "default_melee_access": True,
        "keyboard_melee_input": True,
        "gamepad_melee_input": True,
        "mobile_melee_input": True,
        "weapon_mastery": True,
        "operator_specialization": True,
        "attachment_unlock_tracks": True,
        "bounded_pve_combat_tuning": True,
        "pvp_progression_bonuses_disabled": True,
        "pvp_melee_disabled": True,
        "profile_owned_state": True,
        "cloud_merge_safe": True,
        "idempotent_mastery_receipts": True,
        "host_authoritative_melee_damage": True,
        "late_join_presentation": True,
        "reconnect_restoration": True,
        "host_migration_safe": True,
        "run_summary_integration": True,
        "protocol_unchanged": True,
        "worker_change_required": False,
        "frontend_only": True,
        "crazygames_readiness_on_hold": True,
        "android_readiness_on_hold": True,
    },
        "quality2": {
        "schema": 1,
        "patch": QUALITY2_PATCH,
        "product_version": QUALITY2_PRODUCT_VERSION,
        "source_baseline_sha": QUALITY2_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": QUALITY2_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": QUALITY2_BASELINE_WORKER_VERSION_ID,
        "release_sequence": QUALITY2_RELEASE_SEQUENCE,
        "renderer_diagnostics": True,
        "software_renderer_warning": True,
        "low_zombie_detail_tier": True,
        "low_material_tier": True,
        "low_map_block_materials": True,
        "low_particle_budgets": True,
        "conditional_antialias_at_startup": True,
        "reload_required_across_low_boundary": True,
        "expanded_performance_hud": True,
        "independent_benchmark_overrides": True,
        "medium_high_unchanged": True,
        "enemy_population_unchanged": True,
        "static_geometry_merging_deferred": True,
        "protocol_unchanged": True,
        "worker_change_required": False,
        "frontend_only": True,
        "crazygames_readiness_on_hold": True,
        "android_readiness_on_hold": True,
    },
        "endgame1": {
        "schema": 1,
        "patch": ENDGAME1_PATCH,
        "product_version": ENDGAME1_PRODUCT_VERSION,
        "source_baseline_sha": ENDGAME1_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": ENDGAME1_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": ENDGAME1_BASELINE_WORKER_VERSION_ID,
        "release_sequence": ENDGAME1_RELEASE_SEQUENCE,
        "tiers": ["VETERAN", "NIGHTMARE", "APEX"],
        "deterministic_modifiers": True,
        "host_authoritative": True,
        "late_join_snapshot": True,
        "reconnect_restoration": True,
        "host_migration_checkpoint": True,
        "limited_team_revives": True,
        "apex_wave_respawn_disabled": True,
        "profile_owned_state": True,
        "cloud_merge_safe": True,
        "protected_completion_receipts": True,
        "worker_authoritative_rewards": True,
        "duplicate_safe_receipts": True,
        "weapon_mastery_acceleration": True,
        "run_summary_integration": True,
        "pvp_excluded": True,
        "pvp_progression_bonuses_disabled": True,
        "enemy_population_unchanged": True,
        "new_maps_included": False,
        "new_enemy_factions_included": False,
        "protocol_unchanged": True,
        "worker_change_required": True,
        "frontend_and_worker": True,
        "crazygames_readiness_on_hold": True,
        "android_readiness_on_hold": True,
    },
        "content2": {
        "schema": 1,
        "patch": CONTENT2_PATCH,
        "product_version": CONTENT2_PRODUCT_VERSION,
        "source_baseline_sha": CONTENT2_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": CONTENT2_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": CONTENT2_BASELINE_WORKER_VERSION_ID,
        "release_sequence": CONTENT2_RELEASE_SEQUENCE,
        "arena": {
            "id": "stormbreak_canal",
            "label": "Stormbreak Canal",
            "single_level": True,
            "interactive_floodgates": True,
            "electrical_lane_traps": True,
            "low_gpu_compatible": True,
        },
        "enemy_archetypes": ["WARDEN", "STALKER", "SAPPER"],
        "host_authoritative": True,
        "late_join_restoration": True,
        "protocol_unchanged": True,
        "worker_change_required": False,
        "frontend_only": True,
        "pvp_isolation": True,
        "new_enemy_faction_included": False,
        "crazygames_readiness_on_hold": True,
        "android_readiness_on_hold": True,
    },
        "quality2_r2": {
        "schema": 2,
        "patch": QUALITY2_R2_PATCH,
        "product_version": QUALITY2_R2_PRODUCT_VERSION,
        "source_baseline_sha": QUALITY2_R2_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": QUALITY2_R2_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": QUALITY2_R2_BASELINE_WORKER_VERSION_ID,
        "release_sequence": QUALITY2_R2_RELEASE_SEQUENCE,
        "public_room_discovery_repair": True,
        "atomic_find_endpoint": "/matchmaking/rooms/find",
        "atomic_find_alias": "/matchmaking/rooms/find-open",
        "route_capabilities_endpoint": "/matchmaking/rooms/capabilities",
        "list_join_compatibility_fallback": True,
        "visible_no_open_room_feedback": True,
        "no_open_room_error_code": "NO_OPEN_ROOM_AVAILABLE",
        "rated_quick_match_preserved": True,
        "public_room_browser_preserved": True,
        "content2_preserved": True,
        "endgame1_preserved": True,
        "quality2_r1_low_gpu_preserved": True,
        "protocol_unchanged": True,
        "worker_change_required": True,
        "frontend_and_worker": True,
        "crazygames_readiness_on_hold": True,
        "android_readiness_on_hold": True,
    },
        "current_release": {
        "schema": 1,
        "patch": QUALITY2_R2_PATCH,
        "source_baseline_sha": QUALITY2_R2_SOURCE_BASELINE_SHA,
        "worker_baseline_sha": QUALITY2_R2_WORKER_BASELINE_SHA,
        "baseline_worker_version_id": QUALITY2_R2_BASELINE_WORKER_VERSION_ID,
        "release_sequence": QUALITY2_R2_RELEASE_SEQUENCE,
        "release_descriptor": "release-version.json",
        "paired_seal_descriptor": "pvp-production-seal.json",
        "worker_change_required": True,
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
