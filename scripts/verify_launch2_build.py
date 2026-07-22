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
    for required_root in ("release-version.json", "pvp-production-seal.json", "_headers"):
        if not (build / required_root).is_file():
            raise SystemExit(f"POST-LAUNCH.4 production root file is missing: {required_root}")
    release_descriptor = json.loads((build / "release-version.json").read_text(encoding="utf-8"))
    current_release = manifest.get("current_release", post_launch4)
    if release_descriptor.get("releaseId") != current_release.get("patch"):
        raise SystemExit("Current production release descriptor mismatch")
    if int(release_descriptor.get("releaseSequence", 0)) != int(current_release.get("release_sequence", -1)):
        raise SystemExit("Current production release sequence mismatch")
    pvp3 = manifest.get("pvp3", {})
    if current_release.get("patch") == "pvp3-r2-dedicated-rules-neutral-pickups":
        if pvp3.get("patch") != current_release.get("patch"):
            raise SystemExit("PVP.3 R2 production manifest patch mismatch")
        for field in (
            "difficulty_free_pvp", "explicit_room_browser_filters", "atomic_open_room_find",
            "dedicated_pvp_ruleset", "coop_shops_disabled_in_pvp", "coop_perks_disabled_in_pvp",
            "coop_economy_disabled_in_pvp", "pvp_doors_open_at_round_load",
            "neutral_weapon_pickups", "neutral_ammo_pickups", "neutral_armor_pickups",
            "server_authoritative_pickup_claims", "server_authoritative_weapon_ownership",
            "armor_damage_absorption", "pickups_reset_every_round", "equal_pistol_round_start",
            "worker_change_required", "frontend_and_worker"
        ):
            if pvp3.get(field) is not True:
                raise SystemExit(f"PVP.3 R2 production policy mismatch: {field}")
    pvp4 = manifest.get("pvp4", {})
    if current_release.get("patch") == "pvp4-r1-competitive-maps-dynamic-hot-drops":
        if pvp4.get("patch") != current_release.get("patch"):
            raise SystemExit("PVP.4 R1 production manifest patch mismatch")
        for field in (
            "mirrored_team_spawns", "multi_lane_combat", "elevated_cover_positions",
            "dynamic_hot_drop_relocation", "server_authoritative_relocation",
            "consecutive_location_reuse_blocked", "nearby_location_reuse_blocked",
            "player_proximity_relocation_avoidance", "pickup_overlap_avoidance",
            "arrival_beacon_countdown", "reconnect_relocation_restoration",
            "worker_change_required", "frontend_and_worker"
        ):
            if pvp4.get(field) is not True:
                raise SystemExit(f"PVP.4 R1 production policy mismatch: {field}")
        for required_map_module in (
            "js/maps/pvp_competitive_arenas.js",
            "js/multiplayer/pvp3_rules_core.js"
        ):
            if not (build / required_map_module).is_file():
                raise SystemExit(f"PVP.4 R1 production runtime file missing: {required_map_module}")
    mpnet1 = manifest.get("mpnet1", {})
    if current_release.get("patch") == "mpnet1-r1-relay-transaction-resupply-integrity":
        if mpnet1.get("patch") != current_release.get("patch"):
            raise SystemExit("MPNET.1 R1 production manifest patch mismatch")
        for field in (
            "player_facing_relay_metrics", "atomic_health_economy_transactions",
            "initiating_client_reconciliation", "transaction_result_replay",
            "transaction_acknowledgements", "transaction_timeout_resync",
            "host_migration_transaction_ledger", "authoritative_health_grant",
            "emergency_pistol_resupply", "worker_change_required", "frontend_only"
        ):
            expected = field not in ("worker_change_required",)
            if mpnet1.get(field) is not expected:
                raise SystemExit(f"MPNET.1 R1 production policy mismatch: {field}")
        for required_runtime in (
            "js/multiplayer/mpnet1_core.js",
            "js/multiplayer/economy.js",
            "js/multiplayer/network_quality.js",
            "js/multiplayer/network_hud.js",
            "js/multiplayer/player_registry.js",
            "js/multiplayer/revive.js",
            "js/weapons.js"
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(f"MPNET.1 R1 production runtime file missing: {required_runtime}")

    social2 = manifest.get("social2", {})
    if current_release.get("patch") == "social2-r1-arena-id-friend-discovery":
        if social2.get("patch") != current_release.get("patch"):
            raise SystemExit("SOCIAL.2 R1 production manifest patch mismatch")
        for field in (
            "permanent_arena_id", "exact_arena_id_search",
            "incoming_and_outgoing_requests", "shareable_profile_link",
            "local_qr_generation", "unified_social_hub",
            "scoreboard_friend_actions", "party_from_friends",
            "deep_link_friend_search", "worker_change_required",
            "frontend_and_worker"
        ):
            if social2.get(field) is not True:
                raise SystemExit(f"SOCIAL.2 R1 production policy mismatch: {field}")
        for required_runtime in (
            "js/social.js", "js/social_core.js", "js/social2_qr.js",
            "js/vendor/qrcode/index.js", "js/multiplayer/coop_scoreboard.js",
            "js/multiplayer/pvp1.js", "css/social.css"
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(f"SOCIAL.2 R1 production runtime file missing: {required_runtime}")

    net1 = manifest.get("net1", {})
    if current_release.get("patch") == "net1-r1-webrtc-hybrid-transport":
        if net1.get("patch") != current_release.get("patch"):
            raise SystemExit("NET.1 R1 production manifest patch mismatch")
        for field in (
            "cloudflare_central_signaling", "small_room_full_mesh",
            "direct_data_channels", "reliable_ordered_channel",
            "unreliable_snapshot_channel", "websocket_durable_object_fallback",
            "critical_relay_shadow", "delivery_deduplication",
            "bounded_data_channel_buffers", "host_migration_preserved",
            "reconnect_fallback_preserved", "turn_optional",
            "worker_change_required", "frontend_and_worker"
        ):
            if net1.get(field) is not True:
                raise SystemExit(f"NET.1 R1 production policy mismatch: {field}")
        for required_runtime in (
            "js/multiplayer/webrtc_core.js",
            "js/multiplayer/webrtc_transport.js",
            "js/multiplayer/transport.js",
            "js/multiplayer/network_hud.js"
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(f"NET.1 R1 production runtime file missing: {required_runtime}")

    gameplay2 = manifest.get("gameplay2", {})
    if current_release.get("patch") == "gameplay2-r1-late-round-arena-mutations":
        if gameplay2.get("patch") != current_release.get("patch"):
            raise SystemExit("GAMEPLAY.2 production manifest patch mismatch")
        for field in (
            "pvp_excluded",
            "host_authoritative",
            "stacking",
            "late_join_snapshot",
            "reconnect_restoration",
            "host_migration_checkpoint",
            "reward_authority",
            "run_summary_history",
            "cross_run_cleanup",
            "worker_change_required",
            "frontend_and_worker",
        ):
            if gameplay2.get(field) is not True:
                raise SystemExit(f"GAMEPLAY.2 production policy mismatch: {field}")
        if gameplay2.get("mutation_milestones") != [8, 11, 14]:
            raise SystemExit("GAMEPLAY.2 mutation milestone mismatch")
        if int(gameplay2.get("late_round_first_wave", -1)) != 17:
            raise SystemExit("GAMEPLAY.2 late-round first-wave mismatch")
        if int(gameplay2.get("late_round_every_waves", -1)) != 4:
            raise SystemExit("GAMEPLAY.2 late-round cadence mismatch")
        if gameplay2.get("mutations") != ['BLACKOUT', 'ELITE_INFESTATION', 'SUPPLY_CRISIS', 'HAZARD_SHIFT', 'BERSERK_THREATS']:
            raise SystemExit("GAMEPLAY.2 mutation registry mismatch")
        for required_runtime in (
            "js/gameplay2_mutation_core.js",
            "js/content1.js",
            "js/enemy.js",
            "js/main.js",
            "js/map.js",
            "js/map_gameplay.js",
            "js/run_summary.js",
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(
                    f"GAMEPLAY.2 production runtime file missing: {required_runtime}"
                )

    gameplay3 = manifest.get("gameplay3", {})
    if current_release.get("patch") == "gameplay3-r1-interactive-evolving-maps":
        if gameplay3.get("patch") != current_release.get("patch"):
            raise SystemExit("GAMEPLAY.3 production manifest patch mismatch")
        for field in (
            "pvp_excluded",
            "host_authoritative",
            "interactive_controls",
            "route_evolution",
            "temporary_cover",
            "hazard_evolution",
            "late_join_snapshot",
            "reconnect_restoration",
            "host_migration_checkpoint",
            "protocol_unchanged",
            "frontend_only",
        ):
            if gameplay3.get(field) is not True:
                raise SystemExit(f"GAMEPLAY.3 production policy mismatch: {field}")
        if gameplay3.get("worker_change_required") is not False:
            raise SystemExit("GAMEPLAY.3 must remain frontend-only")
        if gameplay3.get("stage_waves") != [4, 7, 10]:
            raise SystemExit("GAMEPLAY.3 stage-wave schedule mismatch")
        if gameplay3.get("supported_maps") != ["grid_bunker", "industrial_yard", "hospital_wing"]:
            raise SystemExit("GAMEPLAY.3 supported-map registry mismatch")
        for required_runtime in (
            "js/gameplay3_map_evolution_core.js",
            "js/content1.js",
            "js/main.js",
            "js/map_gameplay.js",
            "js/multiplayer/foundation.js",
            "js/weapons.js",
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(
                    f"GAMEPLAY.3 production runtime file missing: {required_runtime}"
                )

    gameplay4 = manifest.get("gameplay4", {})
    if current_release.get("patch") == "gameplay4-r1-expanded-boss-encounters":
        if gameplay4.get("patch") != current_release.get("patch"):
            raise SystemExit("GAMEPLAY.4 production manifest patch mismatch")
        for field in (
            "telegraphed_abilities",
            "interruptible_abilities",
            "vulnerability_windows",
            "arena_damage_zones",
            "phase_reinforcement_pressure",
            "solo_damage_scaling",
            "coop_role_aware_targeting",
            "bounded_reinforcement_scaling",
            "ability_commit_idempotence",
            "boss_type_matching",
            "pvp_excluded",
            "host_authoritative",
            "late_join_snapshot",
            "reconnect_restoration",
            "host_migration_checkpoint",
            "reward_authority",
            "run_summary_integration",
            "protocol_unchanged",
            "frontend_only",
        ):
            if gameplay4.get(field) is not True:
                raise SystemExit(f"GAMEPLAY.4 production policy mismatch: {field}")
        if gameplay4.get("worker_change_required") is not False:
            raise SystemExit("GAMEPLAY.4 must remain frontend-only")
        if gameplay4.get("boss_phases") != 3:
            raise SystemExit("GAMEPLAY.4 boss-phase count mismatch")
        if gameplay4.get("boss_profiles") != ["JUGGERNAUT", "MATRIARCH", "DETONATOR"]:
            raise SystemExit("GAMEPLAY.4 boss-profile registry mismatch")
        for required_runtime in (
            "js/gameplay4_boss_encounter_core.js",
            "js/content1.js",
            "js/enemy.js",
            "js/weapons.js",
            "js/multiplayer/shared_world.js",
            "js/run_summary.js",
            "js/postfinal8_replayability_core.js",
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(
                    f"GAMEPLAY.4 production runtime file missing: {required_runtime}"
                )

    gameplay5 = manifest.get("gameplay5", {})
    if current_release.get("patch") == "gameplay5-r1-narrative-operations":
        if gameplay5.get("patch") != current_release.get("patch"):
            raise SystemExit("GAMEPLAY.5 production manifest patch mismatch")
        for field in (
            "map_specific_briefings",
            "stage_transmissions",
            "branch_consequences",
            "objective_outcome_influence",
            "boss_narrative_integration",
            "mutation_narrative_integration",
            "evolving_map_narrative_integration",
            "text_only_narrative",
            "nonverbal_audio_cues",
            "cinematic_hud_presentation",
            "deterministic_outcomes",
            "pvp_excluded",
            "host_authoritative",
            "late_join_snapshot",
            "reconnect_restoration",
            "host_migration_checkpoint",
            "reward_authority",
            "run_summary_integration",
            "protocol_unchanged",
            "frontend_only",
        ):
            if gameplay5.get(field) is not True:
                raise SystemExit(f"GAMEPLAY.5 production policy mismatch: {field}")
        if gameplay5.get("voice_runtime_reintroduced") is not False:
            raise SystemExit("GAMEPLAY.5 must not reintroduce voice runtime")
        if gameplay5.get("worker_change_required") is not False:
            raise SystemExit("GAMEPLAY.5 must remain frontend-only")
        if gameplay5.get("supported_maps") != [
            "grid_bunker",
            "industrial_yard",
            "neon_depot",
            "parking_garage",
            "hospital_wing",
            "reactor_courtyard",
        ]:
            raise SystemExit("GAMEPLAY.5 supported-map registry mismatch")
        for required_runtime in (
            "js/gameplay5_narrative_operation_core.js",
            "js/content1.js",
            "js/run_summary.js",
            "css/hud.css",
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(
                    f"GAMEPLAY.5 production runtime file missing: {required_runtime}"
                )

    gameplay6 = manifest.get("gameplay6", {})
    if current_release.get("patch") == "gameplay6-r1-world-progression":
        if gameplay6.get("patch") != current_release.get("patch"):
            raise SystemExit("GAMEPLAY.6 production manifest patch mismatch")
        for field in (
            "persistent_world_state",
            "sector_progression",
            "world_milestones",
            "operation_tier_unlocks",
            "narrative_outcome_contribution",
            "boss_victory_contribution",
            "mutation_contribution",
            "evolving_map_contribution",
            "profile_owned_state",
            "cloud_merge_safe",
            "protected_progression_rewards",
            "idempotent_contribution_receipts",
            "pvp_excluded",
            "host_authoritative",
            "late_join_snapshot",
            "reconnect_restoration",
            "host_migration_checkpoint",
            "run_summary_integration",
            "protocol_unchanged",
            "frontend_only",
        ):
            if gameplay6.get(field) is not True:
                raise SystemExit(f"GAMEPLAY.6 production policy mismatch: {field}")
        if gameplay6.get("worker_change_required") is not False:
            raise SystemExit("GAMEPLAY.6 must remain frontend-only")
        if gameplay6.get("supported_maps") != [
            "grid_bunker",
            "industrial_yard",
            "neon_depot",
            "parking_garage",
            "hospital_wing",
            "reactor_courtyard",
        ]:
            raise SystemExit("GAMEPLAY.6 supported-map registry mismatch")
        for required_runtime in (
            "js/gameplay6_world_progression_core.js",
            "js/content1.js",
            "js/progression.js",
            "js/progression_core.js",
            "js/cloud_profile.js",
            "js/run_summary.js",
            "css/hud.css",
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(
                    f"GAMEPLAY.6 production runtime file missing: {required_runtime}"
                )

    gameplay7 = manifest.get("gameplay7", {})
    if current_release.get("patch") == "gameplay7-r1-dynamic-campaign-faction-control":
        if gameplay7.get("patch") != current_release.get("patch"):
            raise SystemExit("GAMEPLAY.7 production manifest patch mismatch")
        for field in (
            "dynamic_sector_control",
            "secured_contested_overrun_states",
            "enemy_faction_influence",
            "world_progression_integration",
            "narrative_outcome_influence",
            "boss_victory_influence",
            "control_based_enemy_tuning",
            "control_based_hazard_tuning",
            "control_based_reward_tuning",
            "profile_owned_state",
            "cloud_merge_safe",
            "protected_campaign_rewards",
            "idempotent_contribution_receipts",
            "pvp_excluded",
            "host_authoritative",
            "late_join_snapshot",
            "reconnect_restoration",
            "host_migration_checkpoint",
            "run_summary_integration",
            "protocol_unchanged",
            "frontend_only",
            "crazygames_readiness_on_hold",
            "android_readiness_on_hold",
        ):
            if gameplay7.get(field) is not True:
                raise SystemExit(f"GAMEPLAY.7 production policy mismatch: {field}")
        if gameplay7.get("worker_change_required") is not False:
            raise SystemExit("GAMEPLAY.7 must remain frontend-only")
        if gameplay7.get("supported_maps") != [
            "grid_bunker",
            "industrial_yard",
            "neon_depot",
            "parking_garage",
            "hospital_wing",
            "reactor_courtyard",
        ]:
            raise SystemExit("GAMEPLAY.7 supported-map registry mismatch")
        for required_runtime in (
            "js/gameplay7_campaign_core.js",
            "js/content1.js",
            "js/progression.js",
            "js/progression_core.js",
            "js/cloud_profile.js",
            "js/run_summary.js",
            "css/hud.css",
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(
                    f"GAMEPLAY.7 production runtime file missing: {required_runtime}"
                )

    loadout2 = manifest.get("loadout2", {})
    if current_release.get("patch") == "loadout2-r1-weapon-mastery-operator-specialization-melee":
        if loadout2.get("patch") != current_release.get("patch"):
            raise SystemExit("LOADOUT.2 production manifest patch mismatch")
        for field in (
            "functional_field_knife",
            "default_melee_access",
            "keyboard_melee_input",
            "gamepad_melee_input",
            "mobile_melee_input",
            "weapon_mastery",
            "operator_specialization",
            "attachment_unlock_tracks",
            "bounded_pve_combat_tuning",
            "pvp_progression_bonuses_disabled",
            "pvp_melee_disabled",
            "profile_owned_state",
            "cloud_merge_safe",
            "idempotent_mastery_receipts",
            "host_authoritative_melee_damage",
            "late_join_presentation",
            "reconnect_restoration",
            "host_migration_safe",
            "run_summary_integration",
            "protocol_unchanged",
            "frontend_only",
            "crazygames_readiness_on_hold",
            "android_readiness_on_hold",
        ):
            if loadout2.get(field) is not True:
                raise SystemExit(f"LOADOUT.2 production policy mismatch: {field}")
        if loadout2.get("worker_change_required") is not False:
            raise SystemExit("LOADOUT.2 must remain frontend-only")
        if loadout2.get("weapon_families") != [
            "PISTOL", "SMG", "RIFLE", "SHOTGUN", "SNIPER", "MELEE"
        ]:
            raise SystemExit("LOADOUT.2 weapon-family registry mismatch")
        for required_runtime in (
            "js/loadout2_mastery_core.js",
            "js/loadout2_runtime.js",
            "js/loadout_core.js",
            "js/loadout.js",
            "js/weapons.js",
            "js/controls.js",
            "js/multiplayer/command_stream.js",
            "js/multiplayer/remote_players.js",
            "js/multiplayer/shared_world.js",
            "js/progression.js",
            "js/progression_core.js",
            "js/cloud_profile.js",
            "js/run_summary.js",
            "css/hud.css",
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(
                    f"LOADOUT.2 production runtime file missing: {required_runtime}"
                )

    pvp6 = manifest.get("pvp6", {})
    if current_release.get("patch") == "pvp6-r1-final-pvp-certification-candidate":
        if pvp6.get("patch") != current_release.get("patch"):
            raise SystemExit("PVP.6 R1 production manifest patch mismatch")
        for field in (
            "production_seal_candidate", "worker_version_metadata_exposed",
            "operational_rollback_flags_retained", "real_two_client_certification_required",
            "worker_change_required", "frontend_and_worker"
        ):
            if pvp6.get(field) is not True:
                raise SystemExit(f"PVP.6 R1 production policy mismatch: {field}")
        if pvp6.get("final_production_seal") is not False:
            raise SystemExit("PVP.6 R1 candidate cannot claim final production seal before live certification")
        if int(pvp6.get("dead_pvp_flags_found", -1)) != 0:
            raise SystemExit("PVP.6 R1 dead PvP flag inventory mismatch")
        if pvp6.get("version_metadata_binding") != "CF_VERSION_METADATA":
            raise SystemExit("PVP.6 R1 Worker version metadata binding mismatch")
        for required_runtime in (
            "pvp-production-seal.json",
            "js/multiplayer/pvp6_core.js",
            "js/multiplayer/pvp5_core.js",
            "js/multiplayer/pvp1.js"
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(f"PVP.6 R1 production runtime file missing: {required_runtime}")
        seal = json.loads((build / "pvp-production-seal.json").read_text(encoding="utf-8"))
        if seal.get("patch") != pvp6.get("patch"):
            raise SystemExit("PVP.6 R1 paired seal descriptor mismatch")
        if seal.get("workerBaselineSha") != current_release.get("worker_baseline_sha"):
            raise SystemExit("PVP.6 R1 paired Worker baseline mismatch")

    pvp5 = manifest.get("pvp5", {})
    if current_release.get("patch") == "pvp5-r1-competitive-match-completion-stabilization":
        if pvp5.get("patch") != current_release.get("patch"):
            raise SystemExit("PVP.5 R1 production manifest patch mismatch")
        for field in (
            "complete_one_vs_one_lifecycle", "complete_two_vs_two_lifecycle",
            "eliminated_player_spectating", "server_authoritative_round_reset",
            "server_authoritative_match_completion", "assists",
            "competitive_scoreboard", "rematch_voting", "rematch_map_voting",
            "reconnect_restoration", "abandonment_forfeit",
            "idempotent_rated_result_submission", "worker_repository_cleanup",
            "worker_change_required", "frontend_and_worker"
        ):
            if pvp5.get(field) is not True:
                raise SystemExit(f"PVP.5 R1 production policy mismatch: {field}")
        for required_runtime in (
            "js/multiplayer/pvp5_core.js",
            "js/multiplayer/pvp1_core.js",
            "js/multiplayer/pvp1.js"
        ):
            if not (build / required_runtime).is_file():
                raise SystemExit(f"PVP.5 R1 production runtime file missing: {required_runtime}")

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
