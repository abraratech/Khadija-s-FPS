// js/content1.js
// CONTENT.1 + POST-FINAL.4 — operation runtime, dynamic objective director,
// authored world markers, AI directives, rewards, and multiplayer sync.

import * as THREE from 'three';
import {
  CONTENT1_OPERATION_XP,
  CONTENT1_PATCH,
  Content1Authority
} from './content1_core.js';
import {
  POST_FINAL4_OPERATION_KINDS,
  POST_FINAL4_OPERATION_STATUS,
  POST_FINAL4_PATCH,
  PostFinal4ObjectiveDirector,
  pointInsidePostFinal4Anchor
} from './postfinal4_objective_core.js';
import {
  POST_FINAL7_MISSION_STATUS,
  POST_FINAL7_PATCH,
  POST_FINAL7_RISK_CHOICES,
  POST_FINAL7_STAGE_TYPES,
  PostFinal7MissionDirector,
  computePostFinal7Reward
} from './postfinal7_operation_core.js';
import {
  POST_FINAL8_BOSS_STATUS,
  POST_FINAL8_PATCH,
  PostFinal8ReplayDirector,
  computePostFinal8Reward
} from './postfinal8_replayability_core.js';
import {
  GAMEPLAY2_PATCH,
  Gameplay2MutationDirector
} from './gameplay2_mutation_core.js';
import {
  GAMEPLAY3_PATCH,
  Gameplay3EvolutionDirector
} from './gameplay3_map_evolution_core.js';
import {
  GAMEPLAY4_BOSS_STATUS,
  GAMEPLAY4_PATCH,
  Gameplay4BossDirector,
  computeGameplay4Reward,
  getGameplay4BossDamageScale,
  getGameplay4ReinforcementTuning
} from './gameplay4_boss_encounter_core.js';
import {
  GAMEPLAY5_PATCH,
  GAMEPLAY5_STATUS,
  Gameplay5NarrativeDirector,
  computeGameplay5NarrativeReward
} from './gameplay5_narrative_operation_core.js';
import {
  GAMEPLAY6_PATCH,
  GAMEPLAY6_STATUS,
  Gameplay6WorldDirector
} from './gameplay6_world_progression_core.js';
import {
  GAMEPLAY7_CONTROL,
  GAMEPLAY7_PATCH,
  GAMEPLAY7_STATUS,
  Gameplay7CampaignDirector
} from './gameplay7_campaign_core.js';
import {
  ENDGAME1_PATCH,
  ENDGAME1_STATUS,
  Endgame1Director
} from './endgame1_core.js';
import {
  getProgressionSnapshot,
  recordProgressionContentOperation,
  recordProgressionEndgame1Completion,
  recordProgressionGameplay6WorldContribution,
  recordProgressionGameplay7CampaignContribution
} from './progression.js';
import {
  recordRunDynamicOperation,
  recordRunGameplay2Mutation,
  recordRunGameplay4BossEncounter,
  recordRunGameplay5NarrativeOutcome,
  recordRunGameplay6WorldContribution,
  recordRunGameplay7CampaignContribution,
  recordRunEndgame1,
  recordRunPostFinal7Mission,
  recordRunPostFinal8Replayability
} from './run_summary.js';
import { recordChallengeObjective } from './challenges.js';
import { playUISound, playTeamAlertCue } from './audio.js';
import { getLive1RunDirective } from './live1_state.js';
import { MULTIPLAYER_EVENTS } from './multiplayer/event_bus.js';
import { MULTIPLAYER_RUNTIME_EVENTS } from './multiplayer/runtime.js';

const SNAPSHOT_INTERVAL_MS = 300;
const SNAPSHOT_REQUEST_INTERVAL_MS = 1000;
const COMMAND_INTERVAL_MS = 45;
const ZONE_TICK_INTERVAL_MS = 1000;
const INTERACT_TICK_INTERVAL_MS = 250;
const SURVIVOR_TICK_INTERVAL_MS = 200;
const PRIORITY_TYPES = new Set(['SHAMBLER', 'RUNNER', 'BRUTE', 'GOLIATH', 'EXPLODER', 'RANGED']);
const MUTATION_ELITE_TYPES = new Set(['RUNNER', 'BRUTE', 'GOLIATH', 'EXPLODER', 'RANGED']);
const OBJECTIVE_HUD_KEY = 'ka_objective_hud_mode_v1';
const RUN_CHALLENGES_HUD_KEY = 'ka_run_challenges_visibility_v1';
const OBJECTIVE_HUD_MODES = Object.freeze(['full', 'compact', 'hidden']);

function nowMs() {
  return (
    typeof performance !== 'undefined'
    && typeof performance.now === 'function'
  ) ? performance.now() : Date.now();
}

function cleanText(value, fallback = '', max = 160) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function flatDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(finite(a.x) - finite(b.x), finite(a.z) - finite(b.z));
}

function flatInside(position, anchor) {
  return pointInsidePostFinal4Anchor(position, anchor);
}

function roleColor(mapId) {
  const colors = {
    grid_bunker: '#ffb347',
    industrial_yard: '#ffd166',
    neon_depot: '#ff4fd8',
    parking_garage: '#6ee7ff',
    hospital_wing: '#5df2a5',
    reactor_courtyard: '#ff6b45'
  };
  return colors[String(mapId || '')] || '#00d4ff';
}

function operationProgressText(operation) {
  if (!operation) return 'STANDBY';
  if (operation.status === POST_FINAL4_OPERATION_STATUS.COMPLETE) return 'COMPLETE';
  if (operation.status === POST_FINAL4_OPERATION_STATUS.FAILED) return 'FAILED';
  if (operation.kind === POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET) {
    return operation.targetEnemyId ? 'TARGET MARKED' : 'LOCATING TARGET';
  }
  if (operation.kind === POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR && operation.stage === 'ESCORT') {
    return 'ESCORT TO EXTRACTION';
  }
  const secondsKind = [
    POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE,
    POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT,
    POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT,
    POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER,
    POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR
  ].includes(operation.kind);
  return `${operation.stage} · ${Math.floor(finite(operation.stageProgress))}/${Math.ceil(finite(operation.stageTarget))}${secondsKind ? 's' : ''}`;
}

function arrowForTarget(player, anchor) {
  if (!player?.pos || !anchor) return '•';
  const dx = finite(anchor.x) - finite(player.pos.x);
  const dz = finite(anchor.z) - finite(player.pos.z);
  const targetYaw = Math.atan2(-dx, -dz);
  let relative = targetYaw - finite(player.yaw);
  relative = Math.atan2(Math.sin(relative), Math.cos(relative));
  const eighth = Math.PI / 4;
  const index = Math.round(relative / eighth);
  const arrows = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'];
  return arrows[(index + 8) % 8] || '↑';
}

function normalizeParticipant(entry = {}) {
  return {
    playerId: cleanText(entry.playerId, '', 160),
    displayName: cleanText(entry.displayName, entry.isBot ? 'AI WINGMAN' : 'OPERATIVE', 80),
    isLocal: entry.isLocal === true,
    isBot: entry.isBot === true,
    connected: entry.connected !== false,
    alive: entry.alive !== false && String(entry.lifeState || 'ACTIVE').toUpperCase() === 'ACTIVE',
    lifeState: cleanText(entry.lifeState, entry.alive === false ? 'DOWNED' : 'ACTIVE', 30).toUpperCase(),
    roleId: cleanText(entry.roleId, 'VANGUARD', 40).toUpperCase(),
    position: entry.position ? {
      x: finite(entry.position.x),
      y: finite(entry.position.y),
      z: finite(entry.position.z)
    } : null
  };
}

function tintEnemyForPriority(enemy, enabled = true) {
  if (!enemy?.mesh) return;
  enemy.isPostFinal4Priority = enabled === true;
  enemy.mesh.traverse?.((child) => {
    const materials = Array.isArray(child?.material)
      ? child.material
      : (child?.material ? [child.material] : []);
    materials.forEach((material) => {
      if (!material?.emissive?.setHex) return;
      if (enabled) {
        material.emissive.setHex(0x00d4ff);
        material.emissiveIntensity = Math.max(finite(material.emissiveIntensity), 0.55);
      }
    });
  });
}

function tintEnemyForFaction(enemy, emissiveHex = 0x00d4ff, intensity = 0.22) {
  if (!enemy?.mesh) return;
  enemy.mesh.traverse?.((child) => {
    const materials = Array.isArray(child?.material)
      ? child.material
      : (child?.material ? [child.material] : []);
    materials.forEach((material) => {
      if (!material?.emissive?.setHex) return;
      material.emissive.setHex(Math.max(0, Math.floor(finite(emissiveHex))));
      material.emissiveIntensity = Math.max(
        finite(material.emissiveIntensity),
        Math.max(0, finite(intensity, 0.22))
      );
    });
  });
}

export class Content1Manager {
  constructor({
    eventBus,
    runtime,
    session,
    showToast = () => {},
    scene = null,
    player = null,
    getParticipants = () => [],
    getBotSnapshot = () => null,
    getActiveEnemies = () => [],
    applyGameplay2MutationState = () => null,
    applyGameplay3EvolutionState = () => null,
    awardTeamObjective = () => false,
    handleObjectiveDirective = () => false,
    getInteractLabel = () => 'INTERACT'
  } = {}) {
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.session = session;
    this.showToast = showToast;
    this.scene = scene;
    this.player = player;
    this.getParticipants = getParticipants;
    this.getBotSnapshot = getBotSnapshot;
    this.getActiveEnemies = getActiveEnemies;
    this.applyGameplay2MutationState = applyGameplay2MutationState;
    this.applyGameplay3EvolutionState = applyGameplay3EvolutionState;
    this.awardTeamObjective = awardTeamObjective;
    this.handleObjectiveDirective = handleObjectiveDirective;
    this.getInteractLabel = getInteractLabel;
    this.core = new Content1Authority();
    this.objectiveDirector = new PostFinal4ObjectiveDirector();
    this.missionDirector = new PostFinal7MissionDirector();
    this.replayDirector = new PostFinal8ReplayDirector();
    this.mutationDirector = new Gameplay2MutationDirector();
    this.mapEvolutionDirector = new Gameplay3EvolutionDirector();
    this.bossEncounterDirector = new Gameplay4BossDirector();
    this.narrativeDirector = new Gameplay5NarrativeDirector();
    this.worldProgressionDirector = new Gameplay6WorldDirector();
    this.campaignDirector = new Gameplay7CampaignDirector();
    this.endgameDirector = new Endgame1Director();
    this.active = false;
    this.latestSnapshot = null;
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotRequestedAt = -Infinity;
    this.lastCommandSentAt = -Infinity;
    this.lastZoneTickAt = -Infinity;
    this.lastInteractTickAt = -Infinity;
    this.lastBotInteractTickAt = -Infinity;
    this.lastSurvivorTickAt = -Infinity;
    this.actionSerial = 0;
    this.currentWave = 1;
    this.awardedCompletionIds = new Set();
    this.teamRewardedCompletionIds = new Set();
    this.missionRewardedCompletionIds = new Set();
    this.replayRewardedCompletionIds = new Set();
    this.bossEncounterRewardedCompletionIds = new Set();
    this.narrativeRewardedCompletionIds = new Set();
    this.worldProgressionRewardedCompletionIds = new Set();
    this.campaignRewardedCompletionIds = new Set();
    this.endgameRewardedCompletionIds = new Set();
    this.warnedOperationIds = new Set();
    this.lastBossDamageSnapshotAt = -Infinity;
    this.lastObservedOperationId = null;
    this.lastObservedOperationStatus = null;
    this.lastObservedOperationStage = null;
    this.observedMutationEventIds = new Set();
    this.lastObservedGameplay3Revision = -1;
    this.hud = null;
    this.hudOperation = null;
    this.hudDescription = null;
    this.hudProgress = null;
    this.hudMeta = null;
    this.hudTeam = null;
    this.hudEncounter = null;
    this.hudMission = null;
    this.hudMissionStages = null;
    this.hudNarrative = null;
    this.hudWorld = null;
    this.hudCampaign = null;
    this.hudEndgame = null;
    this.hudRisk = null;
    this.hudRiskSecure = null;
    this.hudRiskOverdrive = null;
    this.hudFaction = null;
    this.hudModifiers = null;
    this.hudBoss = null;
    this.hudMutations = null;
    this.hudModeToggle = null;
    this.hudContent = null;
    this.objectiveHudMode = 'full';
    this.runChallengesVisible = true;
    this.objectiveGroup = null;
    this.primaryRing = null;
    this.secondaryRing = null;
    this.primaryBeam = null;
    this.secondaryBeam = null;
    this.survivorMarker = null;
    this.visualOperationId = null;
    this.unsubscribe = [];

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_CONTENT1_STATE_RECEIVED,
        (event) => this.handleEnvelope(event?.payload?.envelope)
      ) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED,
        () => {
          if (this.active && this.isOnline() && !this.isAuthority()) {
            this.requestSnapshot();
          }
        }
      ) || (() => {})
    );

    if (typeof window !== 'undefined') {
      const onCoopAction = (event) => {
        const detail = event?.detail || {};
        const kind = cleanText(detail.kind, '', 40).toUpperCase();
        if (!kind) return;
        this.recordAction(kind, detail);
      };
      window.addEventListener('ka:coop2-action', onCoopAction);
      this.unsubscribe.push(() => window.removeEventListener('ka:coop2-action', onCoopAction));

      window.KAGetContent1Snapshot = () => this.getSnapshot();
      window.KAGetContent1EncounterDirective = () => this.getEncounterDirective();
      window.KAGetPostFinal4Objective = () => this.getSnapshot()?.postFinal4 || null;
      window.KAGetPostFinal7Mission = () => this.getSnapshot()?.postFinal7 || null;
      window.KAGetPostFinal8Replayability = () => this.getSnapshot()?.postFinal8 || null;
      window.KAGetGameplay2MutationSnapshot = () => (this.active ? this.mutationDirector.getSnapshot(Date.now()) : null);
      window.KAGetGameplay2EnemyTuning = () => (this.active ? this.mutationDirector.getTuning().enemy : null);
      window.KAGetGameplay2SupplyTuning = () => (this.active ? this.mutationDirector.getTuning().supply : null);
      window.KAGetGameplay2RewardMultiplier = () => (this.active ? this.mutationDirector.getTuning().rewardMultiplier : 1);
      window.KAGetGameplay3EvolutionSnapshot = () => (
        this.active ? this.mapEvolutionDirector.getSnapshot(Date.now()) : null
      );
      window.KAGetGameplay4BossSnapshot = () => (
        this.active ? this.bossEncounterDirector.getSnapshot(Date.now()) : null
      );
      window.KAGetGameplay5NarrativeSnapshot = () => (
        this.active ? this.narrativeDirector.getSnapshot(Date.now()) : null
      );
      window.KAGetGameplay6WorldSnapshot = () => (
        this.active ? this.worldProgressionDirector.getSnapshot(Date.now()) : null
      );
      window.KAGetGameplay7CampaignSnapshot = () => (
        this.active ? this.campaignDirector.getSnapshot(Date.now()) : null
      );
      window.KAGetGameplay7EncounterTuning = () => (
        this.active ? this.campaignDirector.getEncounterTuning() : null
      );
      window.KAGetEndgame1Snapshot = () => (
        this.active ? this.endgameDirector.getSnapshot(Date.now()) : null
      );
      window.KAGetEndgame1Tuning = () => (
        this.active ? this.endgameDirector.getTuning() : null
      );
      window.KAGetEndgame1RevivePolicy = () => (
        this.active ? this.endgameDirector.getRevivePolicy() : null
      );
      window.KAGetGameplay4BossDamageScale = ({ enemyId = '', headshot = false } = {}) => (
        getGameplay4BossDamageScale(
          this.bossEncounterDirector.getSnapshot(Date.now()),
          enemyId,
          { headshot }
        )
      );
      window.KAIsGameplay4Authority = () => this.active && this.isAuthority();
      window.KAClaimGameplay4AbilityCommit = (serial) => (
        this.active
        && this.isAuthority()
        && this.bossEncounterDirector.claimAbilityCommit(serial, Date.now())
      );
      window.KARequestGameplay3Interaction = (controlId) => (
        this.requestGameplay3Interaction(controlId)
      );
      window.KASetObjectiveHudMode = (mode) => this.setObjectiveHudMode(mode, { persist: true, announce: true });
      window.KASetRunChallengesVisible = (visible) => this.setRunChallengesVisible(visible === true, { persist: true, announce: true });
      window.KAGetHudPreferences = () => Object.freeze({
        objectiveHudMode: this.objectiveHudMode,
        runChallengesVisible: this.runChallengesVisible === true
      });
      window.KAChoosePostFinal7Risk = (choice) => this.chooseMissionRisk(choice);
      window.KAContent1EnemySpawned = (enemy) => this.prepareEnemySpawn(enemy);
      window.KAContent1EnemyDamaged = (details) => this.recordEnemyDamage(details);
      window.KAContent1EnemyKilled = (details) => this.recordEnemyKill(details);
      window.KAContent1WaveStarted = (wave) => this.startWave(wave);
      window.KAContent1WaveCleared = (details) => this.recordWaveClear(details);
      const onMissionRiskKey = (event) => {
        const mission = this.getSnapshot()?.postFinal7;
        if (mission?.status !== POST_FINAL7_MISSION_STATUS.DECISION) return;
        if (event.code === 'Digit1' || event.code === 'Numpad1') {
          event.preventDefault();
          this.chooseMissionRisk(POST_FINAL7_RISK_CHOICES.SECURE);
        } else if (event.code === 'Digit2' || event.code === 'Numpad2') {
          event.preventDefault();
          this.chooseMissionRisk(POST_FINAL7_RISK_CHOICES.OVERDRIVE);
        }
      };
      window.addEventListener('keydown', onMissionRiskKey);
      this.unsubscribe.push(() => window.removeEventListener('keydown', onMissionRiskKey));
      this.bindHudModeControl();
    }
  }

  isOnline() {
    return this.session?.run?.active === true
      && ['host', 'client'].includes(this.session?.mode);
  }

  isAuthority() {
    return !this.isOnline() || this.session?.mode === 'host';
  }

  localPlayerId() {
    return this.runtime?.localPlayerId || 'local';
  }

  participants(now = nowMs()) {
    const raw = this.getParticipants?.(now) || [];
    return raw.map(normalizeParticipant).filter((entry) => entry.playerId && entry.position);
  }

  beginRun({ runId = '', mapId = 'grid_bunker', difficulty = 1 } = {}) {
    const sessionRun = this.session?.run || {};
    const resolvedRunId = cleanText(sessionRun.runId || runId, `content-${Date.now()}`, 160);
    const resolvedMapId = cleanText(sessionRun.mapId || mapId, 'grid_bunker', 80);
    const resolvedDifficulty = finite(sessionRun.difficulty, difficulty);
    const humans = Math.max(1, this.participants().filter((entry) => !entry.isBot).length);
    this.active = true;
    this.latestSnapshot = null;
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotRequestedAt = -Infinity;
    this.lastCommandSentAt = -Infinity;
    this.lastZoneTickAt = -Infinity;
    this.lastInteractTickAt = -Infinity;
    this.lastBotInteractTickAt = -Infinity;
    this.lastSurvivorTickAt = -Infinity;
    this.currentWave = 1;
    this.actionSerial = 0;
    this.awardedCompletionIds.clear();
    this.teamRewardedCompletionIds.clear();
    this.missionRewardedCompletionIds.clear();
    this.replayRewardedCompletionIds.clear();
    this.bossEncounterRewardedCompletionIds.clear();
    this.narrativeRewardedCompletionIds.clear();
    this.worldProgressionRewardedCompletionIds.clear();
    this.campaignRewardedCompletionIds.clear();
    this.endgameRewardedCompletionIds.clear();
    this.warnedOperationIds.clear();
    this.lastBossDamageSnapshotAt = -Infinity;
    this.lastObservedOperationId = null;
    this.lastObservedOperationStatus = null;
    this.lastObservedOperationStage = null;
    this.observedMutationEventIds.clear();
    this.lastObservedGameplay3Revision = -1;
    this.core.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      difficulty: resolvedDifficulty,
      authorityEpoch: finite(this.runtime?.authorityEpoch, 0),
      live: getLive1RunDirective(resolvedMapId),
      now: nowMs()
    });
    this.objectiveDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      difficulty: resolvedDifficulty,
      playerCount: humans,
      now: Date.now()
    });
    // Discard the standalone POST-FINAL.4 assignment because POST-FINAL.7 owns
    // the operation sequence for the entire run.
    this.objectiveDirector.consumeEvents();
    this.missionDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      difficulty: resolvedDifficulty,
      playerCount: humans,
      now: Date.now()
    });
    this.mutationDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      difficulty: resolvedDifficulty,
      gameMode: 'survival',
      now: Date.now()
    });
    this.mapEvolutionDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      gameMode: 'survival',
      now: Date.now()
    });
    this.replayDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      missionId: this.missionDirector.state.missionId,
      difficulty: resolvedDifficulty,
      playerCount: humans,
      now: Date.now()
    });
    this.bossEncounterDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      gameMode: 'survival',
      now: Date.now()
    });
    this.narrativeDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      missionId: this.missionDirector.state.missionId,
      gameMode: 'survival',
      now: Date.now()
    });
    this.worldProgressionDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      gameMode: 'survival',
      profile: getProgressionSnapshot()?.profile?.world6 || {},
      now: Date.now()
    });
    this.campaignDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      gameMode: 'survival',
      profile: getProgressionSnapshot()?.profile?.campaign7 || {},
      now: Date.now()
    });
    this.endgameDirector.reset({
      runId: resolvedRunId,
      mapId: resolvedMapId,
      difficulty: resolvedDifficulty,
      gameMode: 'survival',
      profile: getProgressionSnapshot()?.profile?.endgame1 || {},
      now: Date.now()
    });
    this.ensureMissionObjective(Date.now(), { announce: false });
    this.ensureHud();
    this.clearObjectiveVisuals();
    this.consumeAuthorityEvents();
    this.applyGameplay2Snapshot(this.mutationDirector.getSnapshot(Date.now()), { transitions: false });
    this.applyGameplay3Snapshot(this.mapEvolutionDirector.getSnapshot(Date.now()), { transitions: false });
    this.updateHud(true);
    if (this.isOnline() && !this.isAuthority()) this.requestSnapshot(true);
    else this.publishSnapshot(true);
    return this.getSnapshot();
  }

  endRun() {
    this.active = false;
    this.latestSnapshot = null;
    this.hideHud();
    this.clearObjectiveVisuals();
    this.handleObjectiveDirective?.(null);
    this.applyGameplay2MutationState?.(null);
    this.applyGameplay3EvolutionState?.(null);
    this.warnedOperationIds.clear();
    this.lastObservedOperationId = null;
    this.lastObservedOperationStatus = null;
    this.lastObservedOperationStage = null;
    this.observedMutationEventIds.clear();
    this.bossEncounterDirector.reset({ gameMode: 'survival', now: Date.now() });
    this.narrativeDirector.reset({ gameMode: 'pvp', now: Date.now() });
    this.worldProgressionDirector.reset({ gameMode: 'pvp', now: Date.now() });
    this.campaignDirector.reset({ gameMode: 'pvp', now: Date.now() });
    this.endgameDirector.reset({ gameMode: 'pvp', now: Date.now() });
  }

  nextEventId(kind) {
    this.actionSerial += 1;
    return [
      this.session?.run?.runId || this.core.state?.runId || 'run',
      this.localPlayerId(),
      cleanText(kind, 'ACTION', 40),
      this.actionSerial
    ].join(':');
  }

  sendCommand(payload, force = false) {
    const now = nowMs();
    if (!force && now - this.lastCommandSentAt < COMMAND_INTERVAL_MS) return null;
    this.lastCommandSentAt = now;
    return this.runtime?.sendContent1State?.({ kind: 'command', ...payload }) || null;
  }

  requestSnapshot(force = false) {
    const now = nowMs();
    if (!force && now - this.lastSnapshotRequestedAt < SNAPSHOT_REQUEST_INTERVAL_MS) return null;
    this.lastSnapshotRequestedAt = now;
    return this.sendCommand({ action: 'SNAPSHOT_REQUEST' }, true);
  }

  requestGameplay3Interaction(controlId, actorId = this.localPlayerId()) {
    if (!this.active) return false;
    const normalizedControlId = cleanText(controlId, '', 120);
    if (!normalizedControlId) return false;

    if (!this.isAuthority()) {
      return Boolean(this.sendCommand({
        action: 'GAMEPLAY3_INTERACT',
        controlId: normalizedControlId
      }, true));
    }

    const snapshot = this.mapEvolutionDirector.getSnapshot(Date.now());
    if (!snapshot?.active || snapshot.control?.id !== normalizedControlId) return false;

    let actor = this.participants().find((entry) => entry.playerId === actorId) || null;
    if (!actor && actorId === this.localPlayerId() && this.player?.pos) {
      actor = {
        playerId: actorId,
        connected: true,
        alive: this.player.alive !== false,
        position: this.player.pos
      };
    }
    if (!actor?.connected || !actor?.alive || !actor.position) return false;

    const control = snapshot.profile?.control;
    if (!control) return false;
    const allowedRadius = Math.max(2.4, finite(control.radius, 3.2)) + 0.8;
    if (flatDistance(actor.position, control) > allowedRadius) return false;

    const result = this.mapEvolutionDirector.interact({
      controlId: normalizedControlId,
      actorId,
      now: Date.now()
    });
    if (!result?.accepted) return false;

    this.applyGameplay3Snapshot(result.snapshot, { transitions: true });
    this.publishSnapshot(true);
    return true;
  }

  tuneMissionOperation(operation, stage = this.missionDirector.currentStage()) {
    if (!operation || !stage) return operation;
    const replayTuning = this.replayDirector.getObjectiveTuning();
    operation.label = cleanText(stage.label, operation.label, 100);
    operation.description = cleanText(stage.description, operation.description, 180);
    operation.optional = stage.optional === true;
    operation.postFinal7MissionId = this.missionDirector.state.missionId;
    operation.postFinal7StageId = stage.stageId;
    operation.postFinal7StageType = stage.type;
    operation.postFinal7RiskChoice = this.missionDirector.state.riskChoice;
    operation.postFinal8FactionId = this.replayDirector.state.faction.id;
    operation.postFinal8ModifierIds = this.replayDirector.state.modifiers.map((entry) => entry.id);

    if (finite(replayTuning.timeScale, 1) < 0.999) {
      operation.remainingMs = Math.max(10000, Math.round(finite(operation.remainingMs, 60000) * replayTuning.timeScale));
      operation.expiresAt = Date.now() + operation.remainingMs;
      operation.description = `${operation.description} MODIFIER: COMPRESSED OBJECTIVE WINDOW.`;
    }

    if (stage.type === POST_FINAL7_STAGE_TYPES.HUNT) {
      operation.rewardPoints = Math.max(1, Math.round(finite(operation.rewardPoints, 100) * 2));
      operation.xp = Math.max(1, Math.round(finite(operation.xp, CONTENT1_OPERATION_XP) * 1.5));
      operation.targetEnemyLabel = cleanText(stage.label, 'ELITE TARGET', 100).toUpperCase();
    }

    const narrativeTuning = this.narrativeDirector.getObjectiveTuning(
      this.missionDirector.getSnapshot(Date.now())
    );
    if (finite(narrativeTuning.targetScale, 1) !== 1) {
      operation.stageTarget = Math.max(1, Math.ceil(
        finite(operation.stageTarget, 1) * finite(narrativeTuning.targetScale, 1)
      ));
      operation.target = Math.max(finite(operation.target, operation.stageTarget), operation.stageTarget);
      operation.rewardPoints = Math.max(1, Math.round(
        finite(operation.rewardPoints, 100) * finite(narrativeTuning.rewardScale, 1)
      ));
      operation.description = cleanText(
        `${operation.description} ${narrativeTuning.descriptionSuffix || ''}`,
        operation.description,
        240
      );
      operation.gameplay5BranchId = narrativeTuning.branchId;
    }

    if (
      stage.type === POST_FINAL7_STAGE_TYPES.EXTRACT
      && this.missionDirector.state.riskChoice === POST_FINAL7_RISK_CHOICES.OVERDRIVE
    ) {
      const scaledTarget = Math.max(
        finite(operation.stageTarget, 1),
        Math.ceil(finite(operation.stageTarget, 1) * 1.4)
      );
      operation.stageTarget = scaledTarget;
      operation.target = Math.max(finite(operation.target, scaledTarget), scaledTarget);
      operation.rewardPoints = Math.max(1, Math.round(finite(operation.rewardPoints, 100) * 1.5));
      operation.xp = Math.max(1, Math.round(finite(operation.xp, CONTENT1_OPERATION_XP) * 1.35));
      operation.description = `${operation.description} OVERDRIVE: LONGER HOLD, 50% MISSION REWARD BONUS.`;
    }

    const endgame = this.endgameDirector.getSnapshot(Date.now());
    const endgameTuning = this.endgameDirector.getTuning();
    if (endgame?.active) {
      operation.endgame1Patch = ENDGAME1_PATCH;
      operation.endgame1TierId = endgame.tier?.id || '';
      operation.endgame1ModifierIds = (endgame.modifiers || []).map((entry) => entry.id);
      operation.stageTarget = Math.max(1, Math.ceil(
        finite(operation.stageTarget, 1) * finite(endgameTuning.objectiveTargetScale, 1)
      ));
      operation.target = Math.max(finite(operation.target, operation.stageTarget), operation.stageTarget);
      operation.remainingMs = Math.max(
        8000,
        Math.round(finite(operation.remainingMs, 60000) * finite(endgameTuning.objectiveTimeScale, 1))
      );
      operation.expiresAt = Date.now() + operation.remainingMs;
      operation.rewardPoints = Math.max(
        1,
        Math.round(finite(operation.rewardPoints, 100) * finite(endgameTuning.rewardMultiplier, 1))
      );
      operation.xp = Math.max(
        1,
        Math.round(finite(operation.xp, CONTENT1_OPERATION_XP) * Math.min(1.6, finite(endgameTuning.rewardMultiplier, 1)))
      );
      operation.description = cleanText(
        `${operation.description} ENDGAME ${endgame.tier?.label || endgame.tier?.id}: ${endgame.modifiers?.map((entry) => entry.label).join(', ') || 'ESCALATED CONDITIONS'}.`,
        operation.description,
        300
      );
    }
    return operation;
  }

  ensureMissionObjective(now = Date.now(), { announce = true } = {}) {
    if (!this.active || !this.isAuthority()) return null;
    const mission = this.missionDirector.state;
    if (mission.status !== POST_FINAL7_MISSION_STATUS.ACTIVE) return null;
    const stage = this.missionDirector.currentStage();
    if (!stage) return null;
    this.narrativeDirector.observeMission(
      this.missionDirector.getSnapshot(now),
      now
    );

    const current = this.objectiveDirector.state.current;
    if (
      stage.operationId
      && current?.operationId === stage.operationId
      && current.status === POST_FINAL4_OPERATION_STATUS.ACTIVE
    ) {
      return current;
    }
    if (stage.operationId && current?.operationId === stage.operationId) return current;

    const operation = this.objectiveDirector.assignOperation(stage.objectiveKind, {
      wave: this.currentWave,
      now,
      optional: stage.optional === true
    });
    this.tuneMissionOperation(operation, stage);
    // assignOperation returns a clone, so tune the authoritative object too.
    this.tuneMissionOperation(this.objectiveDirector.state.current, stage);
    this.missionDirector.bindOperation(this.objectiveDirector.state.current, now);
    // POST-FINAL.7 provides its own stage announcement and avoids duplicate
    // standalone objective-assignment toasts.
    this.objectiveDirector.consumeEvents();

    if (announce) {
      this.showToast?.(
        `${stage.optional ? 'SECONDARY · ' : `STAGE ${stage.index + 1}/${mission.stages.length} · `}${stage.label}`
      );
      playUISound('warning', 0.18, true, {
        cooldownKey: `postfinal7_stage_${stage.stageId}`,
        cooldownMs: 800,
        pitchMin: 1.04,
        pitchMax: 1.16
      });
    }
    this.handleObjectiveDirective?.(this.getCombinedObjectiveDirective());
    return this.objectiveDirector.state.current;
  }

  chooseMissionRisk(choice, actorId = this.localPlayerId()) {
    const normalized = cleanText(choice, '', 20).toUpperCase();
    if (![POST_FINAL7_RISK_CHOICES.SECURE, POST_FINAL7_RISK_CHOICES.OVERDRIVE].includes(normalized)) {
      return false;
    }
    if (!this.isAuthority()) {
      this.sendCommand({
        action: 'MISSION_RISK_CHOICE',
        choice: normalized
      }, true);
      return true;
    }
    if (!this.missionDirector.chooseRisk(normalized, actorId, Date.now())) return false;
    this.ensureMissionObjective(Date.now());
    this.consumeAuthorityEvents();
    this.publishSnapshot(true);
    return true;
  }

  getCombinedObjectiveDirective() {
    const objective = this.objectiveDirector.getDirective();
    if (!objective) return null;
    const mission = this.missionDirector.getDirective();
    const replay = this.replayDirector.getSnapshot(Date.now());
    return Object.freeze({
      ...objective,
      postFinal7Patch: POST_FINAL7_PATCH,
      missionId: mission?.missionId || '',
      missionLabel: mission?.missionLabel || '',
      missionStatus: mission?.missionStatus || '',
      missionStageId: mission?.stageId || '',
      missionStageIndex: finite(mission?.stageIndex, 0),
      missionStageCount: finite(mission?.stageCount, 0),
      missionStageType: mission?.stageType || '',
      missionStageLabel: mission?.stageLabel || '',
      bossStage: mission?.bossStage === true,
      extractionStage: mission?.extractionStage === true,
      riskChoice: mission?.riskChoice || POST_FINAL7_RISK_CHOICES.PENDING,
      rewardMultiplier: finite(mission?.rewardMultiplier, 1),
      postFinal8Patch: POST_FINAL8_PATCH,
      factionId: replay.faction?.id || '',
      factionLabel: replay.faction?.label || '',
      factionColor: replay.faction?.color || '#00d4ff',
      modifiers: clone(replay.modifiers || []),
      bossTargetId: replay.boss?.enemyId || null,
      bossLabel: replay.boss?.label || '',
      bossStatus: replay.boss?.status || POST_FINAL8_BOSS_STATUS.PENDING,
      bossPhase: finite(replay.boss?.phase, 0),
      bossPhaseCount: finite(replay.boss?.phaseCount, 3),
      bossStagger: finite(replay.boss?.stagger, 0),
      weakPointHits: finite(replay.boss?.weakPointHits, 0),
      gameplay2Patch: GAMEPLAY2_PATCH,
      mutationIds: Object.freeze(this.mutationDirector.getTuning().activeIds),
      mutationRewardMultiplier: this.mutationDirector.getTuning().rewardMultiplier,
      gameplay5Patch: GAMEPLAY5_PATCH,
      narrativeOperationId: this.narrativeDirector.state.operationId,
      narrativeTitle: this.narrativeDirector.state.title,
      narrativeBranchId: this.narrativeDirector.state.branchId,
      narrativeOutcomeId: this.narrativeDirector.state.outcomeId,
      gameplay6Patch: GAMEPLAY6_PATCH,
      worldSectorId: this.worldProgressionDirector.state.presentation?.sector?.sectorId || '',
      worldSectorTier: finite(this.worldProgressionDirector.state.presentation?.sector?.tier, 1),
      worldTier: finite(this.worldProgressionDirector.state.presentation?.worldTier, 0),
      gameplay7Patch: GAMEPLAY7_PATCH,
      campaignControlState: this.campaignDirector.state.presentation?.sector?.controlState || GAMEPLAY7_CONTROL.CONTESTED,
      campaignFactionId: this.campaignDirector.state.presentation?.sector?.dominantFactionId || '',
      campaignTuning: this.campaignDirector.getEncounterTuning(),
      humanSquadCommandsOverride: true
    });
  }

  getEncounterDirective() {
    const base = this.isAuthority()
      ? this.core.getEncounterDirective()
      : this.directiveFromSnapshot();
    const factionMultipliers = this.replayDirector.getEncounterMultipliers();
    const weights = { ...(base?.weightMultipliers || {}) };
    Object.entries(factionMultipliers).forEach(([type, multiplier]) => {
      weights[type] = Math.max(0.35, finite(weights[type], 1) * finite(multiplier, 1));
    });
    const replay = this.replayDirector.getSnapshot(Date.now());
    const campaignTuning = this.campaignDirector.getEncounterTuning();
    for (const type of ['RUNNER', 'BRUTE', 'GOLIATH', 'EXPLODER', 'RANGED']) {
      weights[type] = Math.max(0.35, finite(weights[type], 1) * finite(campaignTuning.specialWeightScale, 1));
    }
    return Object.freeze({
      ...(base || {}),
      weightMultipliers: Object.freeze(weights),
      postFinal8Patch: POST_FINAL8_PATCH,
      factionId: replay.faction?.id || '',
      factionLabel: replay.faction?.label || '',
      bossId: replay.boss?.bossId || '',
      modifierIds: Object.freeze((replay.modifiers || []).map((entry) => entry.id)),
      gameplay2Patch: GAMEPLAY2_PATCH,
      mutationIds: Object.freeze(this.mutationDirector.getTuning().activeIds),
      mutationRewardMultiplier: this.mutationDirector.getTuning().rewardMultiplier,
      gameplay7Patch: GAMEPLAY7_PATCH,
      campaignControlState: campaignTuning.controlState,
      campaignFactionId: campaignTuning.dominantFactionId,
      campaignEnemyHealthScale: campaignTuning.enemyHealthScale,
      campaignEnemyDamageScale: campaignTuning.enemyDamageScale,
      campaignHazardScale: campaignTuning.hazardScale,
      campaignRewardMultiplier: campaignTuning.rewardMultiplier
    });
  }

  buildSnapshot(now = nowMs()) {
    const base = this.core.update(now);
    const epochNow = Date.now();
    this.missionDirector.update(epochNow);
    if (this.isAuthority()) this.ensureMissionObjective(epochNow);
    const postFinal4 = this.objectiveDirector.update(epochNow);
    const postFinal7 = this.missionDirector.getSnapshot(epochNow);
    const postFinal8 = this.replayDirector.getSnapshot(epochNow);
    const gameplay2 = this.mutationDirector.update(epochNow);
    const gameplay3 = this.mapEvolutionDirector.update(epochNow);
    const bossEnemy = this.bossEncounterDirector.state.enemyId
      ? this.getActiveEnemies?.().find((entry) => (
          cleanText(entry?.content1Id || entry?.networkId, '', 180)
            === this.bossEncounterDirector.state.enemyId
        ))
      : null;
    const gameplay4 = this.bossEncounterDirector.update(epochNow, {
      boss: postFinal8?.boss || null,
      bossPosition: bossEnemy?.mesh?.position || null,
      participants: this.participants(now)
    });
    const gameplay5 = this.narrativeDirector.update(epochNow, {
      mission: postFinal7,
      gameplay2,
      gameplay3,
      gameplay4
    });
    const gameplay6 = this.worldProgressionDirector.update(epochNow, {
      profile: getProgressionSnapshot()?.profile?.world6 || {},
      narrative: gameplay5,
      gameplay2,
      gameplay3,
      gameplay4
    });
    const gameplay7 = this.campaignDirector.update(epochNow, {
      profile: getProgressionSnapshot()?.profile?.campaign7 || {},
      world: gameplay6,
      narrative: gameplay5,
      replay: postFinal8
    });
    const endgame1 = this.endgameDirector.update(epochNow, {
      profile: getProgressionSnapshot()?.profile?.endgame1 || {},
      mission: postFinal7,
      replay: postFinal8,
      boss: gameplay4,
      narrative: gameplay5,
      world: gameplay6,
      campaign: gameplay7
    });
    return { ...base, postFinal4, postFinal7, postFinal8, gameplay2, gameplay3, gameplay4, gameplay5, gameplay6, gameplay7, endgame1 };
  }

  publishSnapshot(force = false) {
    if (!this.active || !this.isAuthority()) return null;
    const now = nowMs();
    if (!force && now - this.lastSnapshotSentAt < SNAPSHOT_INTERVAL_MS) return null;
    this.lastSnapshotSentAt = now;
    const snapshot = this.buildSnapshot(now);
    this.latestSnapshot = clone(snapshot);
    this.applyGameplay2Snapshot(snapshot.gameplay2, { transitions: false });
    this.applyGameplay3Snapshot(snapshot.gameplay3, { transitions: false });
    const envelope = this.isOnline()
      ? this.runtime?.sendContent1State?.({ kind: 'snapshot', snapshot })
      : null;
    this.applyLocalOperationRewards();
    this.updateHud(force);
    this.updateObjectiveVisuals(now);
    return envelope || snapshot;
  }

  recordAction(kind, details = {}) {
    if (!this.active) return false;
    const normalizedKind = cleanText(kind, '', 40).toUpperCase();
    if (!normalizedKind) return false;
    const action = {
      kind: normalizedKind,
      amount: Math.max(0, finite(details.amount, 1)),
      healthRatio: Math.max(0, Math.min(1, finite(details.healthRatio, 0))),
      enemyId: cleanText(details.enemyId, '', 180),
      position: details.position ? clone(details.position) : null,
      reason: cleanText(details.reason, '', 160),
      actorIds: Array.isArray(details.actorIds) ? details.actorIds : undefined,
      eventId: cleanText(details.eventId, this.nextEventId(normalizedKind), 240),
      at: Math.max(0, finite(details.at, nowMs()))
    };
    const actorId = cleanText(details.actorId, this.localPlayerId(), 160);

    if (this.isAuthority()) {
      const baseAccepted = this.core.recordAction({ ...action, actorId });
      const dynamicAccepted = this.objectiveDirector.recordAction({
        ...action,
        actorId,
        at: Date.now()
      });
      if (baseAccepted || dynamicAccepted) {
        this.consumeAuthorityEvents();
        this.publishSnapshot(true);
      }
      return baseAccepted || dynamicAccepted;
    }

    return Boolean(this.sendCommand({
      action: 'OPERATION_ACTION',
      operationAction: action
    }));
  }

  recordWaveClear({ wave = this.currentWave, health = 0, maxHealth = 100 } = {}) {
    const ratio = Math.max(0, finite(health)) / Math.max(1, finite(maxHealth, 100));
    return this.recordAction('WAVE_CLEAR', {
      amount: 1,
      healthRatio: ratio,
      eventId: `${this.session?.run?.runId || 'run'}:content-wave:${Math.max(1, Math.floor(finite(wave, 1)))}`
    });
  }

  startWave(wave = 1) {
    if (!this.active || !this.isAuthority()) return null;
    const normalizedWave = Math.max(1, Math.floor(finite(wave, 1)));
    if (normalizedWave === this.currentWave && this.core.state?.encounter?.wave === normalizedWave) {
      return this.core.state.encounter;
    }
    this.currentWave = normalizedWave;
    const humans = Math.max(
      1,
      this.participants().filter((entry) => !entry.isBot && entry.connected).length
    );
    this.objectiveDirector.state.playerCount = humans;
    this.objectiveDirector.state.currentWave = normalizedWave;
    this.missionDirector.state.playerCount = humans;
    this.replayDirector.state.playerCount = humans;
    this.mutationDirector.startWave(normalizedWave, Date.now());
    this.mapEvolutionDirector.startWave(normalizedWave, Date.now());
    const encounter = this.core.startWave(normalizedWave, nowMs());
    this.ensureMissionObjective(Date.now(), { announce: false });
    this.consumeAuthorityEvents();
    this.publishSnapshot(true);
    return encounter;
  }

  recordEnemyDamage({
    enemyId = '',
    damage = 0,
    headshot = false,
    actorId = '',
    health = null,
    maxHealth = null
  } = {}) {
    if (!this.active || !this.isAuthority()) return false;
    const normalizedId = cleanText(enemyId, '', 180);
    if (!normalizedId) return false;
    const result = this.replayDirector.recordBossDamage({
      enemyId: normalizedId,
      damage,
      headshot,
      actorId,
      health,
      maxHealth
    }, Date.now());
    if (!result?.accepted) return false;

    const gameplay4Result = this.bossEncounterDirector.observeBossDamage({
      enemyId: normalizedId,
      damage,
      headshot,
      actorId,
      health,
      maxHealth,
      postFinal8Phase: result?.boss?.phase
    }, Date.now());

    const enemy = this.getActiveEnemies?.().find((entry) => (
      cleanText(entry?.content1Id || entry?.networkId, '', 180) === normalizedId
    ));
    for (const event of result.events || []) {
      if (event.type === 'BOSS_PHASE_CHANGED' && enemy) {
        const appliedPhase = Math.max(0, Math.floor(finite(enemy.postFinal8BossPhase)));
        if (event.phase > appliedPhase) {
          enemy.postFinal8BossPhase = event.phase;
          enemy.speed = finite(enemy.speed, 1) * 1.08;
          enemy.damage = Math.max(1, Math.round(finite(enemy.damage, 1) * 1.08));
          enemy.attackRate = Math.max(0.35, finite(enemy.attackRate, 1) * 0.92);
        }
      } else if (event.type === 'BOSS_STAGGERED' && enemy) {
        enemy.atkCD = Math.max(finite(enemy.atkCD), 1.4);
        enemy.attackState = 'IDLE';
        enemy.hitReactT = Math.max(finite(enemy.hitReactT), 0.55);
      }
    }

    this.consumeAuthorityEvents();
    const now = nowMs();
    if ((result.events || []).length || (gameplay4Result?.events || []).length || now - this.lastBossDamageSnapshotAt >= 220) {
      this.lastBossDamageSnapshotAt = now;
      this.publishSnapshot(true);
    }
    return true;
  }

  recordEnemyKill({ enemyId = '', elite = false, headshot = false, actorId = '' } = {}) {
    const baseId = cleanText(
      enemyId,
      `enemy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      180
    );
    const bossKilled = this.isAuthority()
      ? this.replayDirector.recordBossKilled({
          enemyId: baseId,
          actorId
        }, Date.now())
      : false;
    const gameplay4BossKilled = this.isAuthority()
      ? this.bossEncounterDirector.recordBossKilled({
          enemyId: baseId,
          actorId
        }, Date.now())
      : false;
    this.recordAction('KILL', {
      actorId,
      enemyId: baseId,
      amount: 1,
      headshot,
      eventId: `${this.session?.run?.runId || 'run'}:content-kill:${baseId}`
    });
    if (elite || bossKilled || gameplay4BossKilled) {
      this.recordAction('ELITE_KILL', {
        actorId,
        amount: 1,
        enemyId: baseId,
        eventId: `${this.session?.run?.runId || 'run'}:content-elite-kill:${baseId}`
      });
    }
    if (bossKilled || gameplay4BossKilled) {
      this.consumeAuthorityEvents();
      this.publishSnapshot(true);
    }
    return true;
  }

  prepareEnemySpawn(enemy) {
    if (!this.active || !this.isAuthority() || !enemy) return false;
    let changed = false;
    const dynamic = this.objectiveDirector.state.current;
    const missionStage = this.missionDirector.currentStage();
    const bossStage = missionStage?.type === POST_FINAL7_STAGE_TYPES.HUNT;
    const directive = this.core.getEncounterDirective();
    const type = cleanText(enemy.type, 'SHAMBLER', 40).toUpperCase();
    const mutationTuning = this.mutationDirector.getTuning();
    enemy.gameplay2Patch = GAMEPLAY2_PATCH;
    enemy.gameplay2MutationIds = [...mutationTuning.activeIds];
    enemy.speed = finite(enemy.speed, 1) * finite(mutationTuning.enemy.speedScale, 1);
    enemy.damage = Math.max(1, Math.round(finite(enemy.damage, 1) * finite(mutationTuning.enemy.damageScale, 1)));
    enemy.attackRate = Math.max(0.28, finite(enemy.attackRate, 1) * finite(mutationTuning.enemy.attackRateScale, 1));
    if (MUTATION_ELITE_TYPES.has(type)) {
      enemy.maxHealth = Math.max(1, Math.round(finite(enemy.maxHealth, enemy.health) * finite(mutationTuning.enemy.eliteHealthScale, 1)));
      enemy.health = enemy.maxHealth;
    }
    const eliteCandidate = (
      directive.elitePending
      || (
        bossStage
        && this.replayDirector.state.boss.status === POST_FINAL8_BOSS_STATUS.PENDING
        && PRIORITY_TYPES.has(type)
      )
    );
    const replayTuning = this.replayDirector.nextSpawnTuning({
      enemyType: type,
      bossStage,
      elite: eliteCandidate
    });

    enemy.postFinal8FactionId = replayTuning.factionId;
    enemy.postFinal8FactionLabel = replayTuning.factionLabel;
    enemy.postFinal8Affixes = clone(replayTuning.affixes || []);
    enemy.maxHealth = Math.max(
      1,
      Math.round(finite(enemy.maxHealth, enemy.health) * finite(replayTuning.healthScale, 1))
    );
    enemy.health = enemy.maxHealth;
    enemy.speed = finite(enemy.speed, 1) * finite(replayTuning.speedScale, 1);
    enemy.damage = Math.max(
      1,
      Math.round(finite(enemy.damage, 1) * finite(replayTuning.damageScale, 1))
    );
    const campaignTuning = this.campaignDirector.getEncounterTuning();
    enemy.gameplay7Patch = GAMEPLAY7_PATCH;
    enemy.gameplay7ControlState = campaignTuning.controlState;
    enemy.gameplay7FactionId = campaignTuning.dominantFactionId;
    enemy.maxHealth = Math.max(
      1,
      Math.round(finite(enemy.maxHealth, enemy.health) * finite(campaignTuning.enemyHealthScale, 1))
    );
    enemy.health = enemy.maxHealth;
    enemy.damage = Math.max(
      1,
      Math.round(finite(enemy.damage, 1) * finite(campaignTuning.enemyDamageScale, 1))
    );
    const endgameTuning = this.endgameDirector.getTuning();
    const endgameSnapshot = this.endgameDirector.getSnapshot(Date.now());
    if (endgameSnapshot?.active) {
      enemy.endgame1Patch = ENDGAME1_PATCH;
      enemy.endgame1TierId = endgameSnapshot.tier?.id || '';
      enemy.endgame1ModifierIds = (endgameSnapshot.modifiers || []).map((entry) => entry.id);
      enemy.maxHealth = Math.max(
        1,
        Math.round(finite(enemy.maxHealth, enemy.health) * finite(endgameTuning.enemyHealthScale, 1))
      );
      enemy.health = enemy.maxHealth;
      enemy.speed = finite(enemy.speed, 1) * finite(endgameTuning.enemySpeedScale, 1);
      enemy.damage = Math.max(
        1,
        Math.round(finite(enemy.damage, 1) * finite(endgameTuning.enemyDamageScale, 1))
      );
      enemy.attackRate = Math.max(
        0.22,
        finite(enemy.attackRate, 1) * finite(endgameTuning.enemyAttackRateScale, 1)
      );
      if (eliteCandidate || MUTATION_ELITE_TYPES.has(type)) {
        enemy.maxHealth = Math.max(
          1,
          Math.round(finite(enemy.maxHealth, enemy.health) * finite(endgameTuning.eliteHealthScale, 1))
        );
        enemy.health = enemy.maxHealth;
      }
      if (bossStage || replayTuning.bossProfile) {
        enemy.maxHealth = Math.max(
          1,
          Math.round(finite(enemy.maxHealth, enemy.health) * finite(endgameTuning.bossHealthScale, 1))
        );
        enemy.health = enemy.maxHealth;
        enemy.damage = Math.max(
          1,
          Math.round(finite(enemy.damage, 1) * finite(endgameTuning.bossDamageScale, 1))
        );
        enemy.speed = finite(enemy.speed, 1) * finite(endgameTuning.bossSpeedScale, 1);
      }
      enemy.scoreReward = Math.max(
        1,
        Math.round(finite(enemy.scoreReward, 50) * finite(endgameTuning.rewardMultiplier, 1))
      );
      enemy.headshotReward = Math.max(
        1,
        Math.round(finite(enemy.headshotReward, 100) * finite(endgameTuning.rewardMultiplier, 1))
      );
    }
    tintEnemyForFaction(
      enemy,
      replayTuning.emissiveHex,
      replayTuning.bossProfile ? 0.68 : (eliteCandidate ? 0.42 : 0.18)
    );

    const gameplay4Reinforcement = getGameplay4ReinforcementTuning(
      this.bossEncounterDirector.getSnapshot(Date.now()),
      enemy.content1Id || enemy.networkId || ''
    );
    if (gameplay4Reinforcement.active) {
      enemy.gameplay4Patch = GAMEPLAY4_PATCH;
      enemy.gameplay4ReinforcementPhase = gameplay4Reinforcement.phase;
      enemy.maxHealth = Math.max(
        1,
        Math.round(finite(enemy.maxHealth, enemy.health) * gameplay4Reinforcement.healthScale)
      );
      enemy.health = enemy.maxHealth;
      enemy.speed = finite(enemy.speed, 1) * gameplay4Reinforcement.speedScale;
      enemy.damage = Math.max(
        1,
        Math.round(finite(enemy.damage, 1) * gameplay4Reinforcement.damageScale)
      );
    }

    if (
      dynamic?.status === POST_FINAL4_OPERATION_STATUS.ACTIVE
      && dynamic.kind === POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET
      && !dynamic.targetEnemyId
      && PRIORITY_TYPES.has(type)
    ) {
      const targetId = cleanText(
        enemy.networkId || enemy.content1Id,
        `priority-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        180
      );
      enemy.content1Id = targetId;
      enemy.isPostFinal4Priority = true;
      enemy.maxHealth = Math.max(1, Math.round(finite(enemy.maxHealth, enemy.health) * 1.35));
      enemy.health = enemy.maxHealth;
      enemy.scoreReward = Math.round(finite(enemy.scoreReward, 50) * 1.5);
      tintEnemyForPriority(enemy, true);
      if (bossStage) {
        enemy.isPostFinal7Boss = true;
        enemy.maxHealth = Math.max(1, Math.round(finite(enemy.maxHealth, enemy.health) * 1.8));
        enemy.health = enemy.maxHealth;
        enemy.scoreReward = Math.round(finite(enemy.scoreReward, 50) * 1.75);
      }
      let targetLabel = bossStage
        ? cleanText(missionStage.label, 'ELITE MISSION TARGET', 100).toUpperCase()
        : `${type || 'HOSTILE'} PRIORITY`;
      if (bossStage && replayTuning.bossProfile) {
        enemy.isPostFinal8Boss = true;
        enemy.postFinal8BossId = replayTuning.bossProfile.bossId;
        enemy.postFinal8BossLabel = replayTuning.bossProfile.label;
        enemy.postFinal8BossPhase = 0;
        targetLabel = cleanText(replayTuning.bossProfile.label, targetLabel, 100).toUpperCase();
        this.replayDirector.bindBoss({
          enemyId: targetId,
          enemyType: type,
          maxHealth: enemy.maxHealth,
          health: enemy.health
        }, Date.now());
        this.bossEncounterDirector.bindBoss({
          bossId: replayTuning.bossProfile.bossId,
          bossLabel: replayTuning.bossProfile.label,
          enemyId: targetId,
          enemyType: type,
          maxHealth: enemy.maxHealth,
          health: enemy.health,
          position: enemy.mesh?.position
        }, Date.now());
        enemy.gameplay4Patch = GAMEPLAY4_PATCH;
        enemy.gameplay4BossProfileId = this.bossEncounterDirector.state.profileId;
        tintEnemyForFaction(enemy, replayTuning.emissiveHex, 0.82);
      }
      changed = this.objectiveDirector.assignPriorityTarget({
        enemyId: targetId,
        position: enemy.mesh?.position,
        label: targetLabel
      }, Date.now()) || changed;
    }

    if (directive.elitePending) {
      if (type !== 'CRAWLER' && type !== 'EXPLODER') {
        const enemyId = cleanText(
          enemy.networkId || enemy.content1Id,
          `elite-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          180
        );
        if (this.core.markEliteSpawned(enemyId, nowMs())) {
          enemy.content1Id = enemyId;
          enemy.isContent1Elite = true;
          enemy.maxHealth = Math.max(1, Math.round(finite(enemy.maxHealth, enemy.health) * 1.65));
          enemy.health = enemy.maxHealth;
          enemy.speed = finite(enemy.speed, 1) * 1.08;
          enemy.damage = Math.max(1, Math.round(finite(enemy.damage, 1) * 1.08));
          enemy.scoreReward = Math.round(finite(enemy.scoreReward, 50) * 2);
          enemy.headshotReward = Math.round(finite(enemy.headshotReward, 100) * 1.65);
          tintEnemyForFaction(enemy, replayTuning.emissiveHex, 0.48);
          changed = true;
        }
      }
    }

    if (changed) {
      this.consumeAuthorityEvents();
      this.publishSnapshot(true);
    }
    return changed;
  }

  handleHostMigration({ authorityEpoch = 0, checkpoint = null, becameHost = false } = {}) {
    if (!this.active) return false;
    const snapshot = checkpoint?.content1 || null;
    if (snapshot) {
      this.core.replaceSnapshot(snapshot, nowMs());
      if (snapshot.postFinal4) this.objectiveDirector.replaceSnapshot(snapshot.postFinal4, Date.now());
      if (snapshot.postFinal7) this.missionDirector.replaceSnapshot(snapshot.postFinal7, Date.now());
      if (snapshot.postFinal8) this.replayDirector.replaceSnapshot(snapshot.postFinal8, Date.now());
      if (snapshot.gameplay2) this.mutationDirector.replaceSnapshot(snapshot.gameplay2, Date.now());
      if (snapshot.gameplay3) this.mapEvolutionDirector.replaceSnapshot(snapshot.gameplay3, Date.now());
      if (snapshot.gameplay4) this.bossEncounterDirector.replaceSnapshot(snapshot.gameplay4, Date.now());
      if (snapshot.gameplay5) this.narrativeDirector.replaceSnapshot(snapshot.gameplay5, Date.now());
      if (snapshot.gameplay6) this.worldProgressionDirector.replaceSnapshot(snapshot.gameplay6, Date.now());
      if (snapshot.gameplay7) this.campaignDirector.replaceSnapshot(snapshot.gameplay7, Date.now());
      if (snapshot.endgame1) this.endgameDirector.replaceSnapshot(snapshot.endgame1, Date.now());
      this.applyGameplay2Snapshot(snapshot.gameplay2, { transitions: false });
      this.applyGameplay3Snapshot(snapshot.gameplay3, { transitions: false });
      const restoredBoss = this.replayDirector.state.boss;
      if (restoredBoss?.enemyId) {
        const enemy = this.getActiveEnemies?.().find((entry) => (
          cleanText(entry?.content1Id || entry?.networkId, '', 180) === restoredBoss.enemyId
        ));
        if (enemy) {
          enemy.isPostFinal8Boss = restoredBoss.status === POST_FINAL8_BOSS_STATUS.ACTIVE;
          enemy.postFinal8BossId = restoredBoss.bossId;
          enemy.postFinal8BossLabel = restoredBoss.label;
          enemy.postFinal8BossPhase = restoredBoss.phase;
          enemy.postFinal8FactionId = this.replayDirector.state.faction.id;
          enemy.postFinal8FactionLabel = this.replayDirector.state.faction.label;
          tintEnemyForFaction(enemy, this.replayDirector.state.faction.emissiveHex, 0.82);
        }
      }
      this.latestSnapshot = clone(this.buildSnapshot(nowMs()));
    }
    this.core.state.authorityEpoch = Math.max(
      finite(this.core.state.authorityEpoch),
      finite(authorityEpoch)
    );
    if (becameHost) this.publishSnapshot(true);
    else if (this.isOnline()) this.requestSnapshot(true);
    this.applyLocalOperationRewards();
    this.updateHud(true);
    this.updateObjectiveVisuals(nowMs());
    return true;
  }

  validateRemoteDynamicAction(action, actorId) {
    const operation = this.objectiveDirector.state.current;
    if (!operation || operation.status !== POST_FINAL4_OPERATION_STATUS.ACTIVE) return false;
    if (cleanText(action.kind, '', 40).toUpperCase() !== 'INTERACT_TICK') return true;
    const participant = this.participants().find((entry) => entry.playerId === actorId);
    return Boolean(participant?.alive && flatInside(participant.position, operation.anchor));
  }

  handleEnvelope(envelope) {
    if (!this.active || !envelope?.payload) return false;
    const payload = envelope.payload;

    if (payload.kind === 'command') {
      if (!this.isAuthority()) return false;
      const actorId = cleanText(envelope.playerId, '', 160);
      if (!actorId) return false;
      if (payload.action === 'SNAPSHOT_REQUEST') {
        this.publishSnapshot(true);
        return true;
      }
      if (payload.action === 'MISSION_RISK_CHOICE') {
        return this.chooseMissionRisk(payload.choice, actorId);
      }
      if (payload.action === 'GAMEPLAY3_INTERACT') {
        return this.requestGameplay3Interaction(payload.controlId, actorId);
      }
      if (payload.action === 'OPERATION_ACTION' && payload.operationAction) {
        if (!this.validateRemoteDynamicAction(payload.operationAction, actorId)) return false;
        const action = { ...payload.operationAction, actorId };
        const baseAccepted = this.core.recordAction(action);
        const dynamicAccepted = this.objectiveDirector.recordAction({
          ...action,
          at: Date.now()
        });
        if (baseAccepted || dynamicAccepted) {
          this.consumeAuthorityEvents();
          this.publishSnapshot(true);
        }
        return baseAccepted || dynamicAccepted;
      }
      return false;
    }

    if (
      payload.kind !== 'snapshot'
      || this.isAuthority()
      || envelope.playerId !== this.session?.hostPlayerId
    ) return false;
    const hadRemoteSnapshot = Boolean(this.latestSnapshot);
    if (!this.core.replaceSnapshot(payload.snapshot, nowMs())) return false;
    if (payload.snapshot?.postFinal4) {
      this.objectiveDirector.replaceSnapshot(payload.snapshot.postFinal4, Date.now());
    }
    if (payload.snapshot?.postFinal7) {
      this.missionDirector.replaceSnapshot(payload.snapshot.postFinal7, Date.now());
    }
    if (payload.snapshot?.postFinal8) {
      this.replayDirector.replaceSnapshot(payload.snapshot.postFinal8, Date.now());
    }
    if (payload.snapshot?.gameplay2) {
      this.mutationDirector.replaceSnapshot(payload.snapshot.gameplay2, Date.now());
    }
    if (payload.snapshot?.gameplay3) {
      this.mapEvolutionDirector.replaceSnapshot(payload.snapshot.gameplay3, Date.now());
    }
    if (payload.snapshot?.gameplay4) {
      this.bossEncounterDirector.replaceSnapshot(payload.snapshot.gameplay4, Date.now());
    }
    if (payload.snapshot?.gameplay5) {
      this.narrativeDirector.replaceSnapshot(payload.snapshot.gameplay5, Date.now());
    }
    if (payload.snapshot?.gameplay6) {
      this.worldProgressionDirector.replaceSnapshot(payload.snapshot.gameplay6, Date.now());
    }
    if (payload.snapshot?.gameplay7) {
      this.campaignDirector.replaceSnapshot(payload.snapshot.gameplay7, Date.now());
    }
    if (payload.snapshot?.endgame1) {
      this.endgameDirector.replaceSnapshot(payload.snapshot.endgame1, Date.now());
    }
    this.latestSnapshot = clone({
      ...this.core.getSnapshot(nowMs()),
      postFinal4: this.objectiveDirector.getSnapshot(Date.now()),
      postFinal7: this.missionDirector.getSnapshot(Date.now()),
      postFinal8: this.replayDirector.getSnapshot(Date.now()),
      gameplay2: clone(payload.snapshot.gameplay2 || this.mutationDirector.getSnapshot(Date.now())),
      gameplay3: clone(payload.snapshot.gameplay3 || this.mapEvolutionDirector.getSnapshot(Date.now())),
      gameplay4: clone(payload.snapshot.gameplay4 || this.bossEncounterDirector.getSnapshot(Date.now())),
      gameplay5: clone(payload.snapshot.gameplay5 || this.narrativeDirector.getSnapshot(Date.now())),
      gameplay6: clone(payload.snapshot.gameplay6 || this.worldProgressionDirector.getSnapshot(Date.now())),
      gameplay7: clone(payload.snapshot.gameplay7 || this.campaignDirector.getSnapshot(Date.now())),
      endgame1: clone(payload.snapshot.endgame1 || this.endgameDirector.getSnapshot(Date.now()))
    });
    this.applyGameplay2Snapshot(this.latestSnapshot.gameplay2, { transitions: hadRemoteSnapshot });
    this.applyGameplay3Snapshot(this.latestSnapshot.gameplay3, { transitions: hadRemoteSnapshot });
    this.applyLocalOperationRewards();
    this.observeDynamicOperation(this.latestSnapshot, { transitions: true });
    this.updateHud(true);
    this.updateObjectiveVisuals(nowMs());
    this.handleObjectiveDirective?.(this.getCombinedObjectiveDirective());
    return true;
  }

  update(dt = 0, {
    player = this.player,
    wave = this.currentWave,
    interactHeld = false,
    now = nowMs()
  } = {}) {
    if (!this.active) return null;
    const normalizedWave = Math.max(1, Math.floor(finite(wave, 1)));
    if (this.isAuthority() && normalizedWave !== this.currentWave) this.startWave(normalizedWave);

    const snapshot = this.getSnapshot();
    const baseOperation = snapshot?.operation;
    const participants = this.participants(now);
    const activeParticipants = participants.filter((entry) => entry.connected && entry.alive);
    if (this.isAuthority()) {
      const downedHuman = participants.find((entry) => (
        entry.connected
        && !entry.isBot
        && (!entry.alive || entry.lifeState !== 'ACTIVE')
      ));
      if (downedHuman) {
        this.replayDirector.recordPlayerDowned(downedHuman.playerId, Date.now());
        this.endgameDirector.recordPlayerDowned(downedHuman.playerId, Date.now());
      }
    }

    if (
      this.isAuthority()
      && baseOperation?.kind === 'ZONE_TIME'
      && !baseOperation.completed
      && activeParticipants.some((entry) => flatInside(entry.position, baseOperation.anchor))
      && now - this.lastZoneTickAt >= ZONE_TICK_INTERVAL_MS
    ) {
      this.lastZoneTickAt = now;
      this.recordAction('ZONE_TICK', {
        amount: 1,
        actorId: activeParticipants.find((entry) => flatInside(entry.position, baseOperation.anchor))?.playerId,
        eventId: `${snapshot.runId}:zone:${Math.floor(now / ZONE_TICK_INTERVAL_MS)}`
      });
    }

    this.updateDynamicRuntime(Math.max(0, Math.min(0.1, finite(dt))), {
      player,
      interactHeld: interactHeld === true,
      participants: activeParticipants,
      now
    });

    if (this.isAuthority()) {
      this.objectiveDirector.update(Date.now());
      this.consumeAuthorityEvents();
      this.publishSnapshot(false);
    }
    else if (this.isOnline()) this.requestSnapshot(false);
    const finalSnapshot = this.getSnapshot();
    this.observeDynamicOperation(finalSnapshot, { transitions: !this.isAuthority() });
    this.updateHud(false);
    this.updateObjectiveVisuals(now);
    this.handleObjectiveDirective?.(this.getCombinedObjectiveDirective());
    return finalSnapshot;
  }

  updateDynamicRuntime(dt, { player, interactHeld, participants, now }) {
    const operation = this.objectiveDirector.state.current;
    if (!operation || operation.status !== POST_FINAL4_OPERATION_STATUS.ACTIVE) return;

    if (
      this.isAuthority()
      && [POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT]
        .includes(operation.kind)
      && now - this.lastZoneTickAt >= ZONE_TICK_INTERVAL_MS
    ) {
      const inside = participants.filter((entry) => flatInside(entry.position, operation.anchor));
      if (inside.length) {
        this.lastZoneTickAt = now;
        this.recordAction('ZONE_TICK', {
          amount: 1,
          actorIds: inside.map((entry) => entry.playerId),
          actorId: inside[0].playerId,
          eventId: `${operation.operationId}:hold:${Math.floor(now / ZONE_TICK_INTERVAL_MS)}`,
          at: now
        });
      }
    }

    const local = participants.find((entry) => entry.isLocal)
      || participants.find((entry) => entry.playerId === this.localPlayerId());
    const interactObjective = [
      POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT,
      POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER,
      POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR
    ].includes(operation.kind) && operation.stage !== 'ESCORT';

    if (
      interactObjective
      && interactHeld
      && local?.alive
      && flatInside(local.position, operation.anchor)
      && now - this.lastInteractTickAt >= INTERACT_TICK_INTERVAL_MS
    ) {
      this.lastInteractTickAt = now;
      this.recordAction('INTERACT_TICK', {
        amount: INTERACT_TICK_INTERVAL_MS / 1000,
        actorId: local.playerId,
        eventId: `${operation.operationId}:interact:${local.playerId}:${Math.floor(now / INTERACT_TICK_INTERVAL_MS)}`,
        at: now
      });
    }

    if (this.isAuthority() && interactObjective && now - this.lastBotInteractTickAt >= INTERACT_TICK_INTERVAL_MS) {
      const bot = participants.find((entry) => entry.isBot && flatInside(entry.position, operation.anchor));
      if (bot) {
        this.lastBotInteractTickAt = now;
        this.recordAction('INTERACT_TICK', {
          amount: INTERACT_TICK_INTERVAL_MS / 1000,
          actorId: bot.playerId,
          eventId: `${operation.operationId}:bot-interact:${Math.floor(now / INTERACT_TICK_INTERVAL_MS)}`,
          at: now
        });
      }
    }

    if (
      this.isAuthority()
      && operation.kind === POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR
      && operation.stage === 'ESCORT'
      && now - this.lastSurvivorTickAt >= SURVIVOR_TICK_INTERVAL_MS
    ) {
      const survivor = operation.survivorPosition || operation.anchor;
      let leader = participants.find((entry) => entry.playerId === operation.survivorLeaderId);
      if (!leader?.alive) {
        leader = participants
          .filter((entry) => entry.alive)
          .sort((a, b) => flatDistance(a.position, survivor) - flatDistance(b.position, survivor))[0];
      }
      if (leader?.position) {
        this.lastSurvivorTickAt = now;
        const step = Math.min(1, dt * 2.4 / Math.max(0.001, flatDistance(survivor, leader.position)));
        const nextPosition = {
          x: finite(survivor.x) + (finite(leader.position.x) - finite(survivor.x)) * step,
          y: 0,
          z: finite(survivor.z) + (finite(leader.position.z) - finite(survivor.z)) * step
        };
        this.recordAction('SURVIVOR_POSITION', {
          amount: SURVIVOR_TICK_INTERVAL_MS / 1000,
          actorId: leader.playerId,
          position: nextPosition,
          eventId: `${operation.operationId}:escort:${Math.floor(now / SURVIVOR_TICK_INTERVAL_MS)}`,
          at: now
        });
      }
    }
  }

  formatGameplay2Mutation(event) {
    const mutation = event?.mutation || {};
    const level = Math.max(1, Math.floor(finite(mutation.level, 1)));
    const suffix = level > 1 ? ` · LEVEL ${level}` : '';
    if (event?.type === 'ROTATED') {
      return `ARENA MUTATION ROTATED · ${String(mutation.label || mutation.id || 'UNKNOWN').toUpperCase()}${suffix}`;
    }
    if (event?.type === 'ESCALATED') {
      return `ARENA MUTATION ESCALATED · ${String(mutation.label || mutation.id || 'UNKNOWN').toUpperCase()}${suffix}`;
    }
    return `ARENA MUTATION ACTIVE · ${String(mutation.label || mutation.id || 'UNKNOWN').toUpperCase()}${suffix}`;
  }

  applyGameplay2Snapshot(snapshot, { transitions = false } = {}) {
    if (!snapshot || snapshot.patch !== GAMEPLAY2_PATCH) {
      this.applyGameplay2MutationState?.(null);
      return false;
    }
    const tuning = this.mutationDirector.getTuning();
    const presentation = Object.freeze({
      ...clone(snapshot),
      tuning
    });
    this.applyGameplay2MutationState?.(presentation);
    for (const event of snapshot.history || []) {
      const eventId = cleanText(event?.eventId, '', 220);
      if (!eventId || this.observedMutationEventIds.has(eventId)) continue;
      this.observedMutationEventIds.add(eventId);
      recordRunGameplay2Mutation({ snapshot, event });
      if (transitions) {
        this.showToast?.(this.formatGameplay2Mutation(event));
        playUISound('warning', 0.24, true, {
          cooldownKey: `gameplay2_${eventId}`,
          cooldownMs: 900,
          pitchMin: event?.type === 'ESCALATED' ? 0.78 : 0.92,
          pitchMax: event?.type === 'ESCALATED' ? 0.90 : 1.08
        });
      }
    }
    return true;
  }

  applyGameplay3Snapshot(snapshot, { transitions = false } = {}) {
    if (!snapshot || snapshot.patch !== GAMEPLAY3_PATCH || snapshot.active !== true) {
      this.applyGameplay3EvolutionState?.(null);
      this.lastObservedGameplay3Revision = -1;
      return false;
    }

    const revision = Math.max(0, Math.floor(finite(snapshot.revision)));
    this.applyGameplay3EvolutionState?.(clone(snapshot));
    this.lastObservedGameplay3Revision = revision;
    void transitions;
    return true;
  }

  observeDynamicOperation(snapshot, { transitions = false } = {}) {
    const operation = snapshot?.postFinal4?.current || null;
    if (!operation) return false;
    const operationChanged = operation.operationId !== this.lastObservedOperationId;
    const statusChanged = !operationChanged
      && operation.status !== this.lastObservedOperationStatus;
    const stageChanged = !operationChanged
      && operation.stage !== this.lastObservedOperationStage;

    if (transitions && operationChanged) {
      this.showToast?.(`${operation.optional ? 'BONUS ' : ''}OPERATION · ${operation.label}`);
      playUISound('warning', 0.16, true, {
        cooldownKey: `postfinal4_remote_assign_${operation.operationId}`,
        cooldownMs: 800,
        pitchMin: 1.02,
        pitchMax: 1.13
      });
    } else if (transitions && statusChanged) {
      if (operation.status === POST_FINAL4_OPERATION_STATUS.COMPLETE) {
        this.showToast?.(`OPERATION COMPLETE · ${operation.label}`);
        playUISound('waveClear', 0.42, true, {
          cooldownKey: `postfinal4_remote_complete_${operation.operationId}`,
          cooldownMs: 1200,
          pitchMin: 1.05,
          pitchMax: 1.18
        });
      } else if (operation.status === POST_FINAL4_OPERATION_STATUS.FAILED) {
        this.showToast?.(`OPERATION FAILED · ${operation.failureReason || 'WINDOW EXPIRED'}`);
        playUISound('warning', 0.27, true, {
          cooldownKey: `postfinal4_remote_fail_${operation.operationId}`,
          cooldownMs: 1200,
          pitchMin: 0.68,
          pitchMax: 0.82
        });
      }
    } else if (transitions && stageChanged) {
      this.showToast?.(`${operation.label} · ${operation.stage}`);
    }

    if (
      operation.status === POST_FINAL4_OPERATION_STATUS.ACTIVE
      && finite(operation.remainingMs) > 0
      && finite(operation.remainingMs) <= 20000
      && !this.warnedOperationIds.has(operation.operationId)
    ) {
      this.warnedOperationIds.add(operation.operationId);
      this.showToast?.(`OBJECTIVE WARNING · ${Math.ceil(finite(operation.remainingMs) / 1000)} SECONDS`);
      playUISound('warning', 0.24, true, {
        cooldownKey: `postfinal4_warning_${operation.operationId}`,
        cooldownMs: 20000,
        pitchMin: 0.76,
        pitchMax: 0.88
      });
    }

    this.lastObservedOperationId = operation.operationId;
    this.lastObservedOperationStatus = operation.status;
    this.lastObservedOperationStage = operation.stage;
    return true;
  }

  consumeAuthorityEvents() {
    const events = [
      ...this.core.consumeEvents(),
      ...this.objectiveDirector.consumeEvents(),
      ...this.mutationDirector.consumeEvents()
    ];
    const missionTransitions = [];

    for (const event of events) {
      if (['ACTIVATED', 'ESCALATED', 'ROTATED'].includes(event.type) && event.mutation) {
        const mutationSnapshot = this.mutationDirector.getSnapshot(Date.now());
        const eventId = cleanText(event.eventId, '', 220);
        if (eventId) this.observedMutationEventIds.add(eventId);
        recordRunGameplay2Mutation({ snapshot: mutationSnapshot, event });
        this.showToast?.(this.formatGameplay2Mutation(event));
        playUISound('warning', 0.24, true, {
          cooldownKey: `gameplay2_${eventId || event.type}`, cooldownMs: 900,
          pitchMin: event.type === 'ESCALATED' ? 0.78 : 0.92,
          pitchMax: event.type === 'ESCALATED' ? 0.90 : 1.08
        });
      } else if (event.type === 'ENCOUNTER_STARTED') {
        this.showToast?.(event.encounter?.announcement || 'ENCOUNTER ACTIVE');
      } else if (event.type === 'ELITE_SPAWNED') {
        this.showToast?.('ELITE TARGET DEPLOYED');
      } else if (event.type === 'OPERATION_COMPLETED') {
        this.showToast?.(`OPERATION COMPLETE · ${event.operation?.label || 'ARENA OPERATION'}`);
      } else if (event.type === 'DYNAMIC_OPERATION_ASSIGNED') {
        this.showToast?.(`${event.operation?.optional ? 'BONUS ' : ''}OPERATION · ${event.operation?.label || 'OBJECTIVE ASSIGNED'}`);
        playUISound('warning', 0.18, true, {
          cooldownKey: 'postfinal4_assigned', cooldownMs: 900, pitchMin: 1.02, pitchMax: 1.14
        });
      } else if (event.type === 'DYNAMIC_PRIORITY_ASSIGNED') {
        this.showToast?.(`PRIORITY TARGET · ${event.operation?.targetEnemyLabel || 'HOSTILE MARKED'}`);
        playTeamAlertCue('ENEMY_MARK', { cooldownKey: 'postfinal4_priority', cooldownMs: 1200 });
      } else if (event.type === 'DYNAMIC_OPERATION_STAGE_CHANGED') {
        this.showToast?.(`${event.operation?.label || 'OPERATION'} · ${event.operation?.stage || 'NEXT STAGE'}`);
        playUISound('warning', 0.14, true, {
          cooldownKey: `postfinal4_stage_${event.operation?.stage}`, cooldownMs: 700, pitchMin: 1.04, pitchMax: 1.16
        });
      } else if (event.type === 'DYNAMIC_OPERATION_COMPLETED') {
        this.showToast?.(`OPERATION COMPLETE · ${event.operation?.label || 'DYNAMIC OPERATION'}`);
        playUISound('waveClear', 0.45, true, {
          cooldownKey: 'postfinal4_complete', cooldownMs: 1500, pitchMin: 1.05, pitchMax: 1.18
        });
        const transition = this.missionDirector.observeOperation(event.operation, Date.now());
        if (transition?.accepted) missionTransitions.push(transition);
      } else if (event.type === 'DYNAMIC_OPERATION_FAILED') {
        this.showToast?.(`OPERATION FAILED · ${event.reason || 'WINDOW EXPIRED'}`);
        playUISound('warning', 0.28, true, {
          cooldownKey: 'postfinal4_failed', cooldownMs: 1500, pitchMin: 0.68, pitchMax: 0.82
        });
        const transition = this.missionDirector.observeOperation(event.operation, Date.now());
        if (transition?.accepted) missionTransitions.push(transition);
      }
    }

    for (const transition of missionTransitions) {
      if (transition.advance) this.ensureMissionObjective(Date.now());
    }

    const missionEvents = this.missionDirector.consumeEvents();
    for (const event of missionEvents) {
      if (event.type === 'MISSION_CHAIN_ASSIGNED') {
        this.showToast?.(`OPERATION CHAIN · ${event.mission?.label || 'MISSION ASSIGNED'}`);
      } else if (event.type === 'MISSION_STAGE_COMPLETED') {
        this.showToast?.(`MISSION STAGE COMPLETE · ${event.stage?.label || 'OBJECTIVE'}`);
      } else if (event.type === 'MISSION_STAGE_FAILED') {
        this.showToast?.(`${event.stage?.optional ? 'SECONDARY' : 'MISSION'} FAILED · ${event.stage?.label || 'OBJECTIVE'}`);
      } else if (event.type === 'MISSION_RISK_DECISION_OPENED') {
        this.showToast?.('EXTRACTION DECISION · 1 SECURE / 2 OVERDRIVE');
        playUISound('warning', 0.24, true, {
          cooldownKey: 'postfinal7_risk_open',
          cooldownMs: 1200,
          pitchMin: 0.94,
          pitchMax: 1.04
        });
      } else if (event.type === 'MISSION_RISK_SELECTED') {
        this.showToast?.(
          event.riskChoice === POST_FINAL7_RISK_CHOICES.OVERDRIVE
            ? 'OVERDRIVE EXTRACTION SELECTED · 50% MISSION BONUS'
            : 'SECURE EXTRACTION SELECTED'
        );
      } else if (event.type === 'MISSION_CHAIN_COMPLETED') {
        this.showToast?.(`MISSION COMPLETE · ${event.mission?.label || 'OPERATION CHAIN'}`);
        playUISound('waveClear', 0.55, true, {
          cooldownKey: 'postfinal7_complete',
          cooldownMs: 1800,
          pitchMin: 1.08,
          pitchMax: 1.2
        });
      }
    }

    const missionSnapshot = this.missionDirector.getSnapshot(Date.now());
    if (missionSnapshot.status === POST_FINAL7_MISSION_STATUS.COMPLETE) {
      this.replayDirector.observeMission(missionSnapshot, Date.now());
    }
    const replayEvents = this.replayDirector.consumeEvents();
    for (const event of replayEvents) {
      if (event.type === 'FACTION_ASSIGNED') {
        const modifierLabel = (event.modifiers || []).map((entry) => entry.label).join(' · ');
        this.showToast?.(`${event.faction?.label || 'ENEMY FACTION'} · ${modifierLabel || 'STANDARD CONDITIONS'}`);
      } else if (event.type === 'BOSS_DEPLOYED') {
        this.showToast?.(`BOSS DEPLOYED · ${event.boss?.label || 'MISSION TARGET'}`);
        playTeamAlertCue('ENEMY_MARK', {
          cooldownKey: 'postfinal8_boss_deployed',
          cooldownMs: 1400
        });
      } else if (event.type === 'BOSS_PHASE_CHANGED') {
        this.showToast?.(`BOSS PHASE ${finite(event.phase, 0) + 1} · REINFORCEMENTS`);
        playUISound('warning', 0.28, true, {
          cooldownKey: `postfinal8_phase_${event.phase}`,
          cooldownMs: 1200,
          pitchMin: 0.72,
          pitchMax: 0.86
        });
      } else if (event.type === 'BOSS_STAGGERED') {
        this.showToast?.('BOSS STAGGERED · ATTACK THE WEAK POINT');
        playUISound('waveClear', 0.24, true, {
          cooldownKey: `postfinal8_stagger_${event.boss?.staggerCount}`,
          cooldownMs: 900,
          pitchMin: 1.08,
          pitchMax: 1.2
        });
      } else if (event.type === 'BOSS_DEFEATED') {
        this.showToast?.(`BOSS DEFEATED · ${event.boss?.label || 'MISSION TARGET'}`);
        playUISound('waveClear', 0.58, true, {
          cooldownKey: 'postfinal8_boss_defeated',
          cooldownMs: 1800,
          pitchMin: 1.06,
          pitchMax: 1.18
        });
      } else if (event.type === 'NO_DOWNED_BONUS_LOST') {
        this.showToast?.('MASTERY UPDATE · UNBROKEN TEAM BONUS LOST');
      } else if (event.type === 'REPLAYABILITY_MASTERY_COMPLETE') {
        this.showToast?.(
          `MISSION MASTERY ${event.replayability?.masteryGrade || 'COMPLETE'} · ${event.replayability?.faction?.label || 'FACTION CLEARED'}`
        );
      }
    }

    const gameplay4Events = this.bossEncounterDirector.consumeEvents();
    for (const event of gameplay4Events) {
      if (event.type === 'GAMEPLAY4_BOSS_BOUND') {
        this.showToast?.(`EXPANDED BOSS ENCOUNTER · ${event.bossLabel || 'MISSION BOSS'}`);
      } else if (event.type === 'GAMEPLAY4_PHASE_CHANGED') {
        this.showToast?.(`BOSS PHASE ${event.phase}/3 · ATTACK PATTERN CHANGED`);
        playUISound('warning', 0.34, true, {
          cooldownKey: `gameplay4_phase_${event.phase}`,
          cooldownMs: 1000,
          pitchMin: 0.70,
          pitchMax: 0.84
        });
      } else if (event.type === 'GAMEPLAY4_ABILITY_WARNING') {
        this.showToast?.(`${event.ability?.label || 'BOSS ATTACK'} · INTERRUPT OR EVADE`);
        playTeamAlertCue('ENEMY_MARK', {
          cooldownKey: `gameplay4_warning_${event.ability?.serial}`,
          cooldownMs: 800
        });
      } else if (event.type === 'GAMEPLAY4_ABILITY_INTERRUPTED') {
        this.showToast?.('BOSS ATTACK INTERRUPTED · VULNERABILITY OPEN');
        playUISound('waveClear', 0.34, true, {
          cooldownKey: `gameplay4_interrupt_${event.ability?.serial}`,
          cooldownMs: 800,
          pitchMin: 1.08,
          pitchMax: 1.18
        });
      } else if (event.type === 'GAMEPLAY4_VULNERABILITY_OPENED') {
        this.showToast?.('BOSS VULNERABLE · FOCUS FIRE');
      } else if (event.type === 'GAMEPLAY4_BOSS_DEFEATED') {
        this.showToast?.(`BOSS ENCOUNTER COMPLETE · +${event.rewardPoints || 0} BONUS`);
      }
    }

    this.narrativeDirector.update(Date.now(), {
      mission: this.missionDirector.getSnapshot(Date.now()),
      gameplay2: this.mutationDirector.getSnapshot(Date.now()),
      gameplay3: this.mapEvolutionDirector.getSnapshot(Date.now()),
      gameplay4: this.bossEncounterDirector.getSnapshot(Date.now())
    });
    const gameplay5Events = this.narrativeDirector.consumeEvents();
    for (const event of gameplay5Events) {
      const transmission = event.transmission;
      if (event.type === 'GAMEPLAY5_OPERATION_ASSIGNED') {
        this.showToast?.(`NARRATIVE OPERATION · ${event.title || 'MISSION DIRECTIVE'}`);
      } else if (event.type === 'GAMEPLAY5_BRANCH_RESOLVED') {
        this.showToast?.(event.branchId === 'ASSET_SECURED'
          ? 'NARRATIVE OUTCOME · SUPPORT ASSET SECURED'
          : 'NARRATIVE OUTCOME · SUPPORT ASSET LOST');
        playUISound('warning', 0.18, true, {
          cooldownKey: `gameplay5_branch_${event.branchId}`,
          cooldownMs: 1000,
          pitchMin: event.branchId === 'ASSET_SECURED' ? 1.04 : 0.76,
          pitchMax: event.branchId === 'ASSET_SECURED' ? 1.14 : 0.88
        });
      } else if (event.type === 'GAMEPLAY5_OPERATION_COMPLETED') {
        this.showToast?.(`OPERATION OUTCOME · ${event.outcome?.label || 'MISSION RESOLVED'} · ${event.outcome?.grade || ''}`);
        playUISound('waveClear', 0.42, true, {
          cooldownKey: 'gameplay5_complete',
          cooldownMs: 1600,
          pitchMin: 1.05,
          pitchMax: 1.18
        });
      } else if (event.type === 'GAMEPLAY5_OPERATION_FAILED') {
        this.showToast?.('NARRATIVE OPERATION FAILED');
      } else if (event.type === 'GAMEPLAY5_TRANSMISSION' && transmission) {
        this.showToast?.(`${transmission.source} · ${transmission.title}`);
        playUISound(transmission.cue === 'BOSS' ? 'warning' : 'menuMove', 0.12, true, {
          cooldownKey: `gameplay5_${transmission.transmissionId}`,
          cooldownMs: 650,
          pitchMin: transmission.cue === 'BOSS' ? 0.78 : 0.98,
          pitchMax: transmission.cue === 'BOSS' ? 0.9 : 1.08
        });
      }
    }

    const gameplay6Events = this.worldProgressionDirector.consumeEvents();
    for (const event of gameplay6Events) {
      if (event.type === 'GAMEPLAY6_WORLD_LINKED') {
        this.showToast?.(`WORLD LINK · ${event.sector?.label || 'SECTOR'} · TIER ${event.sector?.tier || 1}`);
      } else if (event.type === 'GAMEPLAY6_CONTRIBUTION_READY') {
        this.showToast?.(`WORLD PROGRESS READY · +${event.contribution?.points || 0} · ${event.contribution?.sectorLabel || 'SECTOR'}`);
        playUISound('waveClear', 0.28, true, {
          cooldownKey: `gameplay6_${event.contribution?.receiptId || 'world'}`,
          cooldownMs: 1200,
          pitchMin: 1.02,
          pitchMax: 1.12
        });
      }
    }

    const gameplay7Events = this.campaignDirector.consumeEvents();
    for (const event of gameplay7Events) {
      if (event.type === 'GAMEPLAY7_CAMPAIGN_LINKED') {
        this.showToast?.(`CAMPAIGN LINK · ${event.sector?.label || 'SECTOR'} · ${event.sector?.controlState || 'CONTESTED'}`);
      } else if (event.type === 'GAMEPLAY7_CAMPAIGN_CONTRIBUTION_READY') {
        this.showToast?.(`CAMPAIGN CONTROL READY · +${event.contribution?.campaignPoints || 0} · ${event.contribution?.projectedControlState || 'CONTESTED'}`);
        playUISound('waveClear', 0.3, true, {
          cooldownKey: `gameplay7_${event.contribution?.receiptId || 'campaign'}`,
          cooldownMs: 1200,
          pitchMin: 0.98,
          pitchMax: 1.12
        });
      }
    }

    const endgame1Events = this.endgameDirector.consumeEvents();
    for (const event of endgame1Events) {
      if (event.type === 'ENDGAME1_OPERATION_ASSIGNED') {
        const endgame = this.endgameDirector.getSnapshot(Date.now());
        this.showToast?.(`ENDGAME ${endgame.tier?.label || endgame.tier?.id || 'OPERATION'} · ${(endgame.modifiers || []).map((entry) => entry.label).join(' · ')}`);
        playUISound('warning', 0.32, true, {
          cooldownKey: 'endgame1_assigned',
          cooldownMs: 1400,
          pitchMin: 0.78,
          pitchMax: 0.92
        });
      } else if (event.type === 'ENDGAME1_OPERATION_COMPLETED') {
        const endgame = this.endgameDirector.getSnapshot(Date.now());
        this.showToast?.(`ENDGAME ${endgame.tier?.label || 'OPERATION'} COMPLETE`);
        playUISound('waveClear', 0.62, true, {
          cooldownKey: 'endgame1_complete',
          cooldownMs: 2000,
          pitchMin: 1.04,
          pitchMax: 1.18
        });
      } else if (event.type === 'ENDGAME1_RECOVERY_USED') {
        this.showToast?.('ENDGAME RECOVERY USED · REVIVES ARE LIMITED');
      }
    }

    this.applyGameplay2Snapshot(this.mutationDirector.getSnapshot(Date.now()), { transitions: false });
    this.applyLocalOperationRewards();
    return [...events, ...missionEvents, ...replayEvents, ...gameplay4Events, ...gameplay5Events, ...gameplay6Events, ...gameplay7Events, ...endgame1Events];
  }

  applyLocalOperationRewards() {
    const snapshot = this.getSnapshot();
    const mutationRewardMultiplier = Math.max(1, Math.min(1.75, finite(snapshot?.gameplay2?.rewardMultiplier, 1)));
    const base = snapshot?.operation;
    if (base?.completed && base.completionId && !this.awardedCompletionIds.has(base.completionId)) {
      this.awardedCompletionIds.add(base.completionId);
      recordProgressionContentOperation({
        operationId: base.id,
        completionId: base.completionId,
        xp: base.xp || CONTENT1_OPERATION_XP
      });
      this.showToast?.(`${String(base.label || 'OPERATION').toUpperCase()} · +${base.xp || CONTENT1_OPERATION_XP} XP`);
    }

    const completed = snapshot?.postFinal4?.completed || [];
    completed.forEach((operation) => {
      if (!operation?.completionId) return;
      if (!this.awardedCompletionIds.has(operation.completionId)) {
        this.awardedCompletionIds.add(operation.completionId);
        recordProgressionContentOperation({
          operationId: operation.operationId,
          completionId: operation.completionId,
          xp: operation.xp || CONTENT1_OPERATION_XP
        });
        recordRunDynamicOperation({
          operationId: operation.operationId,
          label: operation.label,
          optional: operation.optional === true,
          rewardPoints: operation.rewardPoints,
          contributors: operation.contributors,
          localPlayerId: this.localPlayerId()
        });
        recordChallengeObjective();
      }
      if (this.isAuthority() && !this.teamRewardedCompletionIds.has(operation.completionId)) {
        this.teamRewardedCompletionIds.add(operation.completionId);
        this.awardTeamObjective?.({
          completionId: operation.completionId,
          operationId: operation.operationId,
          points: Math.max(0, Math.floor(finite(operation.rewardPoints) * mutationRewardMultiplier)),
          label: cleanText(operation.label, 'OBJECTIVE COMPLETE', 80),
          contributors: clone(operation.contributors || {})
        });
      }
    });

    const mission = snapshot?.postFinal7;
    if (
      mission?.status === POST_FINAL7_MISSION_STATUS.COMPLETE
      && mission.completionId
      && !this.missionRewardedCompletionIds.has(mission.completionId)
    ) {
      this.missionRewardedCompletionIds.add(mission.completionId);
      const missionPoints = Math.round(computePostFinal7Reward({
        basePoints: 350,
        difficulty: mission.difficulty,
        playerCount: mission.playerCount,
        riskChoice: mission.riskChoice,
        optionalStagesCompleted: mission.optionalStagesCompleted
      }) * mutationRewardMultiplier);
      const missionXp = Math.max(180, Math.round(240 * finite(mission.rewardMultiplier, 1)));
      recordProgressionContentOperation({
        operationId: mission.missionId,
        completionId: mission.completionId,
        xp: missionXp
      });
      recordRunPostFinal7Mission({
        mission,
        rewardPoints: missionPoints,
        localPlayerId: this.localPlayerId()
      });
      if (this.isAuthority()) {
        this.awardTeamObjective?.({
          completionId: mission.completionId,
          operationId: mission.missionId,
          points: missionPoints,
          label: cleanText(`${mission.label} MISSION COMPLETE`, 'MISSION COMPLETE', 80),
          contributors: clone(mission.totalContributions || {})
        });
      }
      this.showToast?.(`${String(mission.label || 'MISSION').toUpperCase()} · +${missionXp} XP`);
    }

    const replay = snapshot?.postFinal8;
    if (
      replay?.missionComplete
      && replay.completionId
      && !this.replayRewardedCompletionIds.has(replay.completionId)
    ) {
      this.replayRewardedCompletionIds.add(replay.completionId);
      const replayPoints = Math.round(computePostFinal8Reward(replay) * mutationRewardMultiplier);
      const replayXp = Math.max(
        120,
        Math.round(160 * finite(replay.rewardMultiplier, 1))
      );
      recordProgressionContentOperation({
        operationId: `${mission?.missionId || replay.missionId || 'MISSION'}-MASTERY`,
        completionId: replay.completionId,
        xp: replayXp
      });
      recordRunPostFinal8Replayability({
        replayability: replay,
        rewardPoints: replayPoints
      });
      if (this.isAuthority()) {
        this.awardTeamObjective?.({
          completionId: replay.completionId,
          operationId: replay.boss?.bossId || replay.missionId || 'POST-FINAL.8',
          points: replayPoints,
          label: cleanText(
            `${replay.faction?.label || 'FACTION'} MASTERY ${replay.masteryGrade || ''}`,
            'MISSION MASTERY',
            80
          ),
          contributors: clone(mission?.totalContributions || {})
        });
      }
      this.showToast?.(
        `MASTERY ${replay.masteryGrade || 'COMPLETE'} · +${replayXp} XP`
      );
    }
    const gameplay4 = snapshot?.gameplay4;
    if (
      gameplay4?.status === GAMEPLAY4_BOSS_STATUS.DEFEATED
      && gameplay4.completionId
      && !this.bossEncounterRewardedCompletionIds.has(gameplay4.completionId)
    ) {
      this.bossEncounterRewardedCompletionIds.add(gameplay4.completionId);
      const bossBonusPoints = Math.round(computeGameplay4Reward(gameplay4) * mutationRewardMultiplier);
      const bossBonusXp = Math.max(140, Math.round(180 + finite(gameplay4.interruptCount) * 20));
      recordProgressionContentOperation({
        operationId: `${gameplay4.bossId || 'BOSS'}-ENCOUNTER`,
        completionId: gameplay4.completionId,
        xp: bossBonusXp
      });
      recordRunGameplay4BossEncounter({
        encounter: gameplay4,
        rewardPoints: bossBonusPoints
      });
      if (this.isAuthority()) {
        this.awardTeamObjective?.({
          completionId: gameplay4.completionId,
          operationId: gameplay4.bossId || 'GAMEPLAY.4',
          points: bossBonusPoints,
          label: cleanText(`${gameplay4.bossLabel || 'BOSS'} ENCOUNTER BONUS`, 'BOSS BONUS', 80),
          contributors: clone(mission?.totalContributions || {})
        });
      }
      this.showToast?.(`${String(gameplay4.bossLabel || 'BOSS').toUpperCase()} · +${bossBonusXp} XP`);
    }

    const gameplay5 = snapshot?.gameplay5;
    if (
      gameplay5?.status === GAMEPLAY5_STATUS.COMPLETE
      && gameplay5.completionId
      && !this.narrativeRewardedCompletionIds.has(gameplay5.completionId)
    ) {
      this.narrativeRewardedCompletionIds.add(gameplay5.completionId);
      const narrativePoints = Math.round(
        computeGameplay5NarrativeReward(gameplay5) * mutationRewardMultiplier
      );
      const narrativeXp = Math.max(120, Math.round(140 + narrativePoints * 0.2));
      recordProgressionContentOperation({
        operationId: gameplay5.operationId || 'GAMEPLAY.5',
        completionId: gameplay5.completionId,
        xp: narrativeXp
      });
      recordRunGameplay5NarrativeOutcome({
        narrative: gameplay5,
        rewardPoints: narrativePoints
      });
      if (this.isAuthority()) {
        this.awardTeamObjective?.({
          completionId: gameplay5.completionId,
          operationId: gameplay5.operationId || 'GAMEPLAY.5',
          points: narrativePoints,
          label: cleanText(`${gameplay5.outcomeLabel || 'MISSION OUTCOME'} ${gameplay5.outcomeGrade || ''}`, 'MISSION OUTCOME', 80),
          contributors: clone(mission?.totalContributions || {})
        });
      }
      this.showToast?.(`${String(gameplay5.outcomeLabel || 'MISSION OUTCOME').toUpperCase()} · +${narrativeXp} XP`);
    }

    const gameplay6 = snapshot?.gameplay6;
    if (
      gameplay6?.status === GAMEPLAY6_STATUS.COMPLETE
      && gameplay6.completionId
      && gameplay6.contribution
      && !this.worldProgressionRewardedCompletionIds.has(gameplay6.completionId)
    ) {
      this.worldProgressionRewardedCompletionIds.add(gameplay6.completionId);
      const result = recordProgressionGameplay6WorldContribution(gameplay6.contribution);
      recordRunGameplay6WorldContribution({
        world: gameplay6,
        applied: result.applied === true,
        unlocked: result.unlocked || []
      });
      const presentation = result.presentation || gameplay6.presentation;
      const sector = presentation?.sector || gameplay6.presentation?.sector;
      if (result.applied) {
        this.showToast?.(
          `WORLD PROGRESS · +${gameplay6.contribution.points || 0} · ${sector?.label || gameplay6.contribution.sectorLabel || 'SECTOR'} TIER ${sector?.tier || 1}`
        );
        const unlock = result.unlocked?.[0];
        if (unlock) this.showToast?.(`WORLD MILESTONE · ${unlock.label || unlock.id}`);
      }
    }
    const gameplay7 = snapshot?.gameplay7;
    if (
      gameplay7?.status === GAMEPLAY7_STATUS.COMPLETE
      && gameplay7.completionId
      && gameplay7.contribution
      && !this.campaignRewardedCompletionIds.has(gameplay7.completionId)
    ) {
      this.campaignRewardedCompletionIds.add(gameplay7.completionId);
      const result = recordProgressionGameplay7CampaignContribution(gameplay7.contribution);
      recordRunGameplay7CampaignContribution({
        campaign: gameplay7,
        applied: result.applied === true,
        controlShift: result.controlShift || null
      });
      const presentation = result.presentation || gameplay7.presentation;
      const sector = presentation?.sector || gameplay7.presentation?.sector;
      if (result.applied) {
        this.showToast?.(
          `CAMPAIGN CONTROL · +${gameplay7.contribution.campaignPoints || 0} · ${sector?.label || gameplay7.contribution.sectorLabel || 'SECTOR'} · ${sector?.controlState || gameplay7.contribution.projectedControlState || 'CONTESTED'}`
        );
        if (result.controlShift) this.showToast?.(`SECTOR CONTROL SHIFT · ${result.controlShift.label}`);
      }
    }

    const endgame1 = snapshot?.endgame1;
    if (
      endgame1?.status === ENDGAME1_STATUS.COMPLETE
      && endgame1.completionId
      && endgame1.completionReceipt
      && !this.endgameRewardedCompletionIds.has(endgame1.completionId)
    ) {
      this.endgameRewardedCompletionIds.add(endgame1.completionId);
      const result = recordProgressionEndgame1Completion(endgame1.completionReceipt);
      recordRunEndgame1({
        snapshot: endgame1,
        receipt: endgame1.completionReceipt,
        result
      });
      if (result.applied) {
        const award = result.award || {};
        this.showToast?.(
          `ENDGAME ${award.tierLabel || endgame1.tier?.label || 'CLEAR'} · +${award.marks || 0} MARKS · +${award.xpBonus || 0} XP`
        );
      }
    }
    return true;
  }

  directiveFromSnapshot() {
    const encounter = this.latestSnapshot?.encounter;
    const replay = this.latestSnapshot?.postFinal8;
    const baseWeights = { ...(encounter?.weights || {}) };
    return Object.freeze({
      patch: CONTENT1_PATCH,
      encounterId: encounter?.id || 'NONE',
      label: encounter?.label || 'Standard Pressure',
      wave: Math.max(1, Math.floor(finite(encounter?.wave, 1))),
      weightMultipliers: Object.freeze(baseWeights),
      elitePending: this.latestSnapshot?.elite?.pending === true,
      eliteActiveIds: Object.freeze([...(this.latestSnapshot?.elite?.activeIds || [])]),
      postFinal8Patch: replay?.patch || POST_FINAL8_PATCH,
      factionId: replay?.faction?.id || '',
      factionLabel: replay?.faction?.label || '',
      bossId: replay?.boss?.bossId || '',
      modifierIds: Object.freeze((replay?.modifiers || []).map((entry) => entry.id)),
      gameplay2Patch: this.latestSnapshot?.gameplay2?.patch || GAMEPLAY2_PATCH,
      mutationIds: Object.freeze((this.latestSnapshot?.gameplay2?.activeMutations || []).map((entry) => entry.id)),
      mutationRewardMultiplier: finite(this.latestSnapshot?.gameplay2?.rewardMultiplier, 1),
      gameplay5Patch: this.latestSnapshot?.gameplay5?.patch || GAMEPLAY5_PATCH,
      narrativeOperationId: this.latestSnapshot?.gameplay5?.operationId || '',
      narrativeBranchId: this.latestSnapshot?.gameplay5?.branchId || '',
      narrativeOutcomeId: this.latestSnapshot?.gameplay5?.outcomeId || '',
      gameplay6Patch: this.latestSnapshot?.gameplay6?.patch || GAMEPLAY6_PATCH,
      worldSectorId: this.latestSnapshot?.gameplay6?.presentation?.sector?.sectorId || '',
      worldSectorTier: finite(this.latestSnapshot?.gameplay6?.presentation?.sector?.tier, 1),
      worldTier: finite(this.latestSnapshot?.gameplay6?.presentation?.worldTier, 0),
      gameplay7Patch: this.latestSnapshot?.gameplay7?.patch || GAMEPLAY7_PATCH,
      campaignControlState: this.latestSnapshot?.gameplay7?.presentation?.sector?.controlState || GAMEPLAY7_CONTROL.CONTESTED,
      campaignFactionId: this.latestSnapshot?.gameplay7?.presentation?.sector?.dominantFactionId || '',
      endgame1Patch: this.latestSnapshot?.endgame1?.patch || ENDGAME1_PATCH,
      endgameTierId: this.latestSnapshot?.endgame1?.tier?.id || 'NONE',
      endgameModifierIds: Object.freeze((this.latestSnapshot?.endgame1?.modifiers || []).map((entry) => entry.id)),
      endgameRewardMultiplier: finite(this.latestSnapshot?.endgame1?.tuning?.rewardMultiplier, 1)
    });
  }

  getSnapshot() {
    if (this.isAuthority()) return clone(this.buildSnapshot(nowMs()));
    return clone(this.latestSnapshot);
  }

  normalizeObjectiveHudMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return OBJECTIVE_HUD_MODES.includes(mode) ? mode : 'full';
  }

  applyHudPreferences() {
    if (typeof document === 'undefined') return;
    const mode = this.normalizeObjectiveHudMode(this.objectiveHudMode);
    this.objectiveHudMode = mode;
    const body = document.body;
    body?.classList.toggle('ka-objective-hud-compact', mode === 'compact');
    body?.classList.toggle('ka-objective-hud-hidden', mode === 'hidden');
    body?.classList.toggle('ka-run-challenges-hidden', this.runChallengesVisible !== true);
    this.hud?.classList.toggle('ka-objective-hud-compact', mode === 'compact');
    this.hud?.classList.toggle('ka-objective-hud-hidden', mode === 'hidden');

    const objectiveControls = [
      document.getElementById('objective-hud-mode-select'),
      document.getElementById('pause-objective-hud-mode-select')
    ].filter(Boolean);
    objectiveControls.forEach((control) => {
      if (control.value !== mode) control.value = mode;
    });

    const challengeValue = this.runChallengesVisible === true ? 'show' : 'hide';
    const challengeControls = [
      document.getElementById('run-challenges-visibility-select'),
      document.getElementById('pause-run-challenges-visibility-select')
    ].filter(Boolean);
    challengeControls.forEach((control) => {
      if (control.value !== challengeValue) control.value = challengeValue;
    });

    const current = document.getElementById('pause-objective-hud-current');
    if (current) {
      current.textContent = mode === 'full'
        ? 'FULL DETAIL'
        : (mode === 'compact' ? 'COMPACT' : 'HIDDEN');
    }
    const pausePanel = document.getElementById('pause-hud-visibility-panel');
    if (pausePanel) pausePanel.dataset.objectiveMode = mode;

    if (this.hudModeToggle) {
      const nextMode = mode === 'full' ? 'compact' : (mode === 'compact' ? 'hidden' : 'full');
      const action = nextMode === 'compact' ? 'Compact' : (nextMode === 'hidden' ? 'Hide' : 'Show');
      this.hudModeToggle.dataset.mode = mode;
      this.hudModeToggle.setAttribute('aria-label', `${action} objective panel`);
      this.hudModeToggle.title = `${action} objective panel`;
      this.hudModeToggle.innerHTML = `<span aria-hidden="true">${mode === 'hidden' ? '◎' : (mode === 'compact' ? '−' : '▱')}</span><b>${action.toUpperCase()}</b>`;
    }

    window.dispatchEvent(new CustomEvent('ka:hud-preferences-updated', {
      detail: Object.freeze({
        objectiveHudMode: mode,
        runChallengesVisible: this.runChallengesVisible === true
      })
    }));
  }

  setObjectiveHudMode(value, { persist = true, announce = false } = {}) {
    const mode = this.normalizeObjectiveHudMode(value);
    this.objectiveHudMode = mode;
    if (persist) {
      try { localStorage.setItem(OBJECTIVE_HUD_KEY, mode); } catch { /* restricted storage */ }
    }
    this.applyHudPreferences();
    if (announce) {
      const label = mode === 'full' ? 'FULL DETAIL' : (mode === 'compact' ? 'COMPACT' : 'HIDDEN');
      this.showToast?.(`OBJECTIVE PANEL · ${label}`);
    }
    this.updateHud(true);
  }

  setRunChallengesVisible(visible, { persist = true, announce = false } = {}) {
    this.runChallengesVisible = visible === true;
    if (persist) {
      try {
        localStorage.setItem(RUN_CHALLENGES_HUD_KEY, this.runChallengesVisible ? 'show' : 'hide');
      } catch { /* restricted storage */ }
    }
    this.applyHudPreferences();
    if (announce) {
      this.showToast?.(`RUN CHALLENGES · ${this.runChallengesVisible ? 'SHOWN' : 'HIDDEN'}`);
    }
  }

  cycleObjectiveHudMode() {
    const next = this.objectiveHudMode === 'full'
      ? 'compact'
      : (this.objectiveHudMode === 'compact' ? 'hidden' : 'full');
    this.setObjectiveHudMode(next, { persist: true, announce: true });
  }

  bindHudModeControl() {
    if (typeof document === 'undefined') return;
    let savedMode = 'full';
    let savedChallenges = 'show';
    try {
      savedMode = localStorage.getItem(OBJECTIVE_HUD_KEY) || 'full';
      savedChallenges = localStorage.getItem(RUN_CHALLENGES_HUD_KEY) || 'show';
    } catch { /* restricted storage */ }
    this.objectiveHudMode = this.normalizeObjectiveHudMode(savedMode);
    this.runChallengesVisible = savedChallenges !== 'hide';

    const objectiveControls = [
      document.getElementById('objective-hud-mode-select'),
      document.getElementById('pause-objective-hud-mode-select')
    ].filter(Boolean);
    objectiveControls.forEach((control) => {
      if (control.dataset.kaHud1Bound === '1') return;
      control.dataset.kaHud1Bound = '1';
      control.addEventListener('change', () => {
        this.setObjectiveHudMode(control.value, { persist: true, announce: control.id.startsWith('pause-') });
      });
    });

    const challengeControls = [
      document.getElementById('run-challenges-visibility-select'),
      document.getElementById('pause-run-challenges-visibility-select')
    ].filter(Boolean);
    challengeControls.forEach((control) => {
      if (control.dataset.kaHud1Bound === '1') return;
      control.dataset.kaHud1Bound = '1';
      control.addEventListener('change', () => {
        this.setRunChallengesVisible(control.value !== 'hide', {
          persist: true,
          announce: control.id.startsWith('pause-')
        });
      });
    });

    if (this.hudModeToggle && this.hudModeToggle.dataset.kaHud1Bound !== '1') {
      this.hudModeToggle.dataset.kaHud1Bound = '1';
      this.hudModeToggle.addEventListener('click', () => this.cycleObjectiveHudMode());
    }

    this.applyHudPreferences();
  }

  ensureHud() {
    if (typeof document === 'undefined') return null;
    if (this.hud?.isConnected) return this.hud;
    const hud = document.createElement('section');
    hud.id = 'ka-content1-hud';
    hud.className = 'ka-content1-hud ka-postfinal4-hud';
    hud.innerHTML = `
      <button class="ka-objective-hud-toggle" type="button" aria-label="Compact objective panel" title="Compact objective panel"><span aria-hidden="true">▱</span><b>COMPACT</b></button>
      <div class="ka-objective-hud-content">
      <div class="ka-content1-kicker">CO-OP OPERATION CHAIN</div>
      <div class="ka-postfinal7-mission">MISSION DIRECTOR INITIALIZING</div>
      <div class="ka-postfinal7-stages">STAGE 0 / 0</div>
      <div class="ka-gameplay5-narrative" data-cue="BRIEFING">
        <b>CONTROL // NARRATIVE LINK</b>
        <span>Awaiting operation briefing.</span>
      </div>
      <div class="ka-gameplay6-world">
        <b>WORLD PROGRESSION</b>
        <span>Synchronizing sector state.</span>
      </div>
      <div class="ka-gameplay7-campaign" data-control="CONTESTED">
        <b>DYNAMIC CAMPAIGN</b>
        <span>Synchronizing faction control.</span>
      </div>
      <div class="ka-endgame1-operation" data-tier="NONE" hidden>
        <b>ENDGAME OPERATION</b>
        <span>Standard operation conditions.</span>
      </div>
      <div class="ka-postfinal8-faction">FACTION INTELLIGENCE INITIALIZING</div>
      <div class="ka-postfinal8-modifiers">STANDARD CONDITIONS</div>
      <div class="ka-gameplay2-mutations">ARENA MUTATIONS · STANDBY</div>
      <div class="ka-postfinal8-boss" hidden>BOSS TELEMETRY STANDBY</div>
      <div class="ka-content1-operation">STANDBY</div>
      <div class="ka-postfinal4-description">OBJECTIVE DIRECTOR INITIALIZING</div>
      <div class="ka-content1-progress">0 / 0</div>
      <div class="ka-postfinal4-meta">• 0m · 0:00</div>
      <div class="ka-postfinal4-team">TEAM CONTRIBUTION · STANDBY</div>
      <div class="ka-postfinal7-risk" hidden>
        <b>EXTRACTION DECISION</b>
        <span>Choose within 15 seconds</span>
        <div>
          <button type="button" class="ka-postfinal7-risk-secure">1 · SECURE EXTRACT</button>
          <button type="button" class="ka-postfinal7-risk-overdrive">2 · OVERDRIVE +50%</button>
        </div>
      </div>
      <div class="ka-content1-encounter">STANDARD PRESSURE</div>
      </div>
    `;
    document.body.appendChild(hud);
    this.hud = hud;
    this.hudModeToggle = hud.querySelector('.ka-objective-hud-toggle');
    this.hudContent = hud.querySelector('.ka-objective-hud-content');
    this.hudMission = hud.querySelector('.ka-postfinal7-mission');
    this.hudMissionStages = hud.querySelector('.ka-postfinal7-stages');
    this.hudNarrative = hud.querySelector('.ka-gameplay5-narrative');
    this.hudWorld = hud.querySelector('.ka-gameplay6-world');
    this.hudCampaign = hud.querySelector('.ka-gameplay7-campaign');
    this.hudEndgame = hud.querySelector('.ka-endgame1-operation');
    this.hudFaction = hud.querySelector('.ka-postfinal8-faction');
    this.hudModifiers = hud.querySelector('.ka-postfinal8-modifiers');
    this.hudMutations = hud.querySelector('.ka-gameplay2-mutations');
    this.hudBoss = hud.querySelector('.ka-postfinal8-boss');
    this.hudOperation = hud.querySelector('.ka-content1-operation');
    this.hudDescription = hud.querySelector('.ka-postfinal4-description');
    this.hudProgress = hud.querySelector('.ka-content1-progress');
    this.hudMeta = hud.querySelector('.ka-postfinal4-meta');
    this.hudTeam = hud.querySelector('.ka-postfinal4-team');
    this.hudRisk = hud.querySelector('.ka-postfinal7-risk');
    this.hudRiskSecure = hud.querySelector('.ka-postfinal7-risk-secure');
    this.hudRiskOverdrive = hud.querySelector('.ka-postfinal7-risk-overdrive');
    this.hudEncounter = hud.querySelector('.ka-content1-encounter');
    this.hudRiskSecure?.addEventListener('click', () => (
      this.chooseMissionRisk(POST_FINAL7_RISK_CHOICES.SECURE)
    ));
    this.hudRiskOverdrive?.addEventListener('click', () => (
      this.chooseMissionRisk(POST_FINAL7_RISK_CHOICES.OVERDRIVE)
    ));
    this.bindHudModeControl();
    return hud;
  }

  updateHud(force = false) {
    if (typeof document === 'undefined') return;
    const hud = this.ensureHud();
    const snapshot = this.getSnapshot();
    if (!hud || !snapshot || !this.active) {
      this.hideHud();
      return;
    }
    this.bindHudModeControl();
    hud.hidden = false;
    const replay = snapshot.postFinal8;
    hud.style.setProperty(
      '--ka-content1-accent',
      replay?.faction?.color || roleColor(snapshot.mapId)
    );
    const operation = snapshot.postFinal4?.current;
    const mission = snapshot.postFinal7;
    const missionStage = mission?.stages?.[mission.currentStageIndex] || null;
    if (this.hudMission) {
      const risk = mission?.riskChoice && mission.riskChoice !== POST_FINAL7_RISK_CHOICES.PENDING
        ? ` · ${mission.riskChoice}`
        : '';
      this.hudMission.textContent = mission
        ? `${mission.label.toUpperCase()}${risk}`
        : 'MISSION DIRECTOR STANDBY';
    }
    if (this.hudMissionStages) {
      const completed = Math.max(0, Math.floor(finite(mission?.completedStageCount)));
      const total = mission?.stages?.length || 0;
      this.hudMissionStages.textContent = mission
        ? `STAGE ${Math.min(total, finite(mission.currentStageIndex, 0) + 1)} / ${total} · ${completed} COMPLETE`
        : 'STAGE 0 / 0';
    }
    if (this.hudNarrative) {
      const narrative = snapshot.gameplay5;
      const transmission = narrative?.currentTransmission;
      const heading = this.hudNarrative.querySelector('b');
      const body = this.hudNarrative.querySelector('span');
      this.hudNarrative.hidden = !narrative?.active;
      this.hudNarrative.dataset.cue = transmission?.cue || (
        narrative?.status === GAMEPLAY5_STATUS.COMPLETE ? 'DEBRIEF' : 'OBJECTIVE'
      );
      if (heading) {
        heading.textContent = transmission
          ? `${transmission.source} // ${transmission.title}`
          : `${narrative?.commandSource || 'CONTROL'} // ${narrative?.title || 'NARRATIVE OPERATION'}`;
      }
      if (body) {
        body.textContent = transmission?.body
          || (narrative?.status === GAMEPLAY5_STATUS.COMPLETE
            ? `${narrative.outcomeLabel || 'MISSION RESOLVED'} · ${narrative.outcomeGrade || ''}`
            : narrative?.consequenceText || 'Operation narrative synchronized.');
      }
    }
    if (this.hudWorld) {
      const world = snapshot.gameplay6;
      const presentation = world?.presentation;
      const sector = presentation?.sector;
      const heading = this.hudWorld.querySelector('b');
      const body = this.hudWorld.querySelector('span');
      this.hudWorld.hidden = !world?.active;
      this.hudWorld.dataset.status = world?.status || GAMEPLAY6_STATUS.INACTIVE;
      if (heading) {
        heading.textContent = sector
          ? `WORLD PROGRESSION // ${String(sector.region || 'SECTOR').toUpperCase()}`
          : 'WORLD PROGRESSION';
      }
      if (body) {
        const contribution = world?.contribution;
        body.textContent = contribution
          ? `${sector?.label || contribution.sectorLabel} · +${contribution.points} WORLD POINTS · TIER ${sector?.tier || 1}`
          : `${sector?.label || 'SECTOR'} · ${sector?.tierLabel || 'RECON'} · ${finite(sector?.points, 0)} POINTS`;
      }
    }
    if (this.hudCampaign) {
      const campaign = snapshot.gameplay7;
      const presentation = campaign?.presentation;
      const sector = presentation?.sector;
      const heading = this.hudCampaign.querySelector('b');
      const body = this.hudCampaign.querySelector('span');
      this.hudCampaign.hidden = !campaign?.active;
      this.hudCampaign.dataset.control = sector?.controlState || GAMEPLAY7_CONTROL.CONTESTED;
      if (heading) {
        heading.textContent = sector
          ? `CAMPAIGN CONTROL // ${String(sector.region || 'FRONT').toUpperCase()}`
          : 'DYNAMIC CAMPAIGN';
      }
      if (body) {
        const contribution = campaign?.contribution;
        body.textContent = contribution
          ? `${sector?.label || contribution.sectorLabel} · ${contribution.projectedControlState} · +${contribution.campaignPoints} CAMPAIGN`
          : `${sector?.label || 'SECTOR'} · ${sector?.controlState || 'CONTESTED'} · ${sector?.dominantFactionId || 'UNKNOWN FACTION'}`;
      }
    }
    if (this.hudEndgame) {
      const endgame = snapshot.endgame1;
      const heading = this.hudEndgame.querySelector('b');
      const body = this.hudEndgame.querySelector('span');
      this.hudEndgame.hidden = !endgame?.active;
      this.hudEndgame.dataset.tier = endgame?.tier?.id || 'NONE';
      if (heading) {
        heading.textContent = endgame?.active
          ? `ENDGAME ${String(endgame.tier?.label || endgame.tier?.id || '').toUpperCase()}`
          : 'ENDGAME OPERATION';
      }
      if (body) {
        const labels = (endgame?.modifiers || []).map((entry) => entry.label);
        const revives = endgame?.tuning?.maxTeamRevives;
        body.textContent = endgame?.active
          ? `${labels.join(' · ') || 'ESCALATED CONDITIONS'} · ${Number.isFinite(Number(revives)) ? `${revives} TEAM REVIVES` : 'STANDARD RECOVERY'}`
          : 'Standard operation conditions.';
      }
    }
    if (this.hudFaction) {
      const faction = replay?.faction?.label || 'UNKNOWN FACTION';
      const boss = replay?.boss?.label || 'MISSION BOSS';
      this.hudFaction.textContent = `${String(faction).toUpperCase()} · ${String(boss).toUpperCase()}`;
    }
    if (this.hudModifiers) {
      const labels = (replay?.modifiers || []).map((entry) => entry.label);
      this.hudModifiers.textContent = labels.length
        ? `MODIFIERS · ${labels.join(' · ')}`
        : 'STANDARD CONDITIONS';
    }
    if (this.hudMutations) {
      const mutationState = snapshot.gameplay2;
      const active = mutationState?.activeMutations || [];
      this.hudMutations.classList.toggle('is-active', active.length > 0);
      this.hudMutations.textContent = active.length
        ? `ARENA MUTATIONS · ${active.map((entry) => `${entry.label}${entry.level > 1 ? ` L${entry.level}` : ''}`).join(' · ')} · ×${finite(mutationState.rewardMultiplier, 1).toFixed(2)} REWARD`
        : `ARENA MUTATIONS · NEXT WAVE ${Math.max(0, Math.floor(finite(mutationState?.nextMilestoneWave, 8)))}`;
    }
    if (this.hudBoss) {
      const boss = replay?.boss;
      const visible = boss?.status === POST_FINAL8_BOSS_STATUS.ACTIVE
        || boss?.status === POST_FINAL8_BOSS_STATUS.DEFEATED;
      this.hudBoss.hidden = !visible;
      if (visible) {
        const healthPct = boss.maxHealth > 0
          ? Math.max(0, Math.round((finite(boss.health) / finite(boss.maxHealth, 1)) * 100))
          : 0;
        const expandedBoss = snapshot.gameplay4;
        const ability = expandedBoss?.ability;
        const abilityText = ability
          ? ` · ${String(ability.label || ability.id).toUpperCase()} ${String(ability.state || '').toUpperCase()}`
          : '';
        this.hudBoss.textContent = boss.status === POST_FINAL8_BOSS_STATUS.DEFEATED
          ? `${String(boss.label || 'BOSS').toUpperCase()} · DEFEATED · ${boss.staggerCount || 0} STAGGERS`
          : `${String(boss.label || 'BOSS').toUpperCase()} · PHASE ${finite(boss.phase, 0) + 1}/${finite(boss.phaseCount, 3)} · ${healthPct}% · STAGGER ${Math.round(finite(boss.stagger))}% · WEAK ${finite(boss.weakPointHits)}${abilityText}`;
      }
    }
    if (this.hudRisk) {
      const decision = mission?.status === POST_FINAL7_MISSION_STATUS.DECISION;
      hud.classList.toggle('ka-objective-hud-critical', decision);
      this.hudRisk.hidden = !decision;
      if (decision) {
        const remaining = Math.max(
          0,
          Math.ceil((finite(mission.riskDecisionDeadline) - Date.now()) / 1000)
        );
        const label = this.hudRisk.querySelector('span');
        if (label) label.textContent = `Choose within ${remaining}s · keyboard 1/2`;
      }
    }
    if (this.hudOperation) {
      const prefix = operation?.optional ? 'BONUS · ' : '';
      this.hudOperation.textContent = operation
        ? `${prefix}${missionStage?.label || operation.label}${operation.status === 'COMPLETE' ? ' · COMPLETE' : ''}`
        : (mission?.status === POST_FINAL7_MISSION_STATUS.DECISION
          ? 'SELECT EXTRACTION RISK'
          : 'OBJECTIVE DIRECTOR STANDBY');
    }
    if (this.hudDescription) {
      this.hudDescription.textContent = operation?.description || 'No dynamic operation is active.';
    }
    if (this.hudProgress) this.hudProgress.textContent = operationProgressText(operation);
    if (this.hudMeta) {
      const distance = operation?.anchor && this.player?.pos
        ? Math.round(flatDistance(this.player.pos, operation.anchor))
        : 0;
      const remaining = Math.max(0, Math.ceil(finite(operation?.remainingMs) / 1000));
      const minutes = Math.floor(remaining / 60);
      const seconds = String(remaining % 60).padStart(2, '0');
      this.hudMeta.textContent = operation
        ? `${arrowForTarget(this.player, operation.anchor)} ${distance}m · ${minutes}:${seconds} · ${operation.stage}`
        : '• 0m · 0:00';
    }
    if (this.hudTeam) {
      const contributors = Object.entries(operation?.contributors || {})
        .sort((a, b) => finite(b[1]) - finite(a[1]));
      const top = contributors[0];
      const participant = top ? this.participants().find((entry) => entry.playerId === top[0]) : null;
      const localValue = finite(operation?.contributors?.[this.localPlayerId()]);
      this.hudTeam.textContent = contributors.length
        ? `TEAM · YOU ${Math.round(localValue)} · TOP ${participant?.displayName || top[0]} ${Math.round(finite(top[1]))}`
        : `TEAM CONTRIBUTION · HOLD ${this.getInteractLabel?.() || 'INTERACT'} WHEN PROMPTED`;
    }
    if (this.hudEncounter) {
      const encounter = snapshot.encounter;
      const mastery = replay?.missionComplete
        ? ` · MASTERY ${replay.masteryGrade || 'COMPLETE'}`
        : '';
      this.hudEncounter.textContent = encounter
        ? `${encounter.liveFeatured ? 'LIVE · ' : ''}${encounter.label.toUpperCase()} · WAVE ${encounter.wave}${mastery}`
        : `STANDARD PRESSURE${mastery}`;
    }
    if (force) hud.classList.add('ka-content1-hud-pulse');
    setTimeout(() => hud.classList.remove('ka-content1-hud-pulse'), 280);
  }

  ensureObjectiveVisuals(operation) {
    if (!this.scene || !operation) return;
    if (this.objectiveGroup && this.visualOperationId === operation.operationId) return;
    this.clearObjectiveVisuals();
    this.objectiveGroup = new THREE.Group();
    this.objectiveGroup.name = 'postfinal4_objective_markers';
    this.primaryRing = this.createRing(operation.anchor, 0x00d4ff, 0.44);
    this.secondaryRing = this.createRing(operation.secondaryAnchor, 0x22ff88, 0.22);
    this.primaryBeam = this.createBeam(operation.anchor, 0x00d4ff);
    this.secondaryBeam = this.createBeam(operation.secondaryAnchor, 0x22ff88);
    this.objectiveGroup.add(this.primaryRing, this.secondaryRing, this.primaryBeam, this.secondaryBeam);
    if (operation.kind === POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR) {
      const geometry = new THREE.SphereGeometry(0.45, 12, 8);
      const material = new THREE.MeshBasicMaterial({ color: 0x7df2a5, transparent: true, opacity: 0.82 });
      this.survivorMarker = new THREE.Mesh(geometry, material);
      this.survivorMarker.name = 'postfinal4_survivor_marker';
      this.objectiveGroup.add(this.survivorMarker);
    }
    this.scene.add(this.objectiveGroup);
    this.visualOperationId = operation.operationId;
  }

  createRing(anchor, color, opacity) {
    const geometry = new THREE.RingGeometry(
      Math.max(1, finite(anchor?.radius, 6) - 0.25),
      Math.max(1.2, finite(anchor?.radius, 6)),
      64
    );
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(finite(anchor?.x), 0.08, finite(anchor?.z));
    return mesh;
  }

  createBeam(anchor, color) {
    const geometry = new THREE.CylinderGeometry(0.08, 0.28, 5.5, 12, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(finite(anchor?.x), 2.75, finite(anchor?.z));
    return mesh;
  }

  updateObjectiveVisuals(now = nowMs()) {
    const operation = this.getSnapshot()?.postFinal4?.current;
    if (!operation || operation.status !== POST_FINAL4_OPERATION_STATUS.ACTIVE) {
      this.clearObjectiveVisuals();
      return;
    }
    this.ensureObjectiveVisuals(operation);
    const activeAnchor = operation.anchor;
    if (this.primaryRing) {
      this.primaryRing.position.x = finite(activeAnchor.x);
      this.primaryRing.position.z = finite(activeAnchor.z);
      this.primaryRing.material.opacity = 0.34 + Math.sin(now * 0.006) * 0.12;
      this.primaryRing.rotation.z += 0.002;
    }
    if (this.primaryBeam) {
      this.primaryBeam.position.x = finite(activeAnchor.x);
      this.primaryBeam.position.z = finite(activeAnchor.z);
      this.primaryBeam.material.opacity = 0.14 + Math.sin(now * 0.004) * 0.06;
    }
    const secondaryVisible = [
      POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER,
      POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR,
      POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT
    ].includes(operation.kind);
    if (this.secondaryRing) this.secondaryRing.visible = secondaryVisible;
    if (this.secondaryBeam) this.secondaryBeam.visible = secondaryVisible;
    if (this.survivorMarker) {
      const survivor = operation.survivorPosition || operation.anchor;
      this.survivorMarker.position.set(finite(survivor.x), 0.72, finite(survivor.z));
      this.survivorMarker.position.y += Math.sin(now * 0.005) * 0.08;
    }
    if (operation.kind === POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET && operation.targetEnemyId) {
      const target = (this.getActiveEnemies?.() || []).find((enemy) => (
        String(enemy?.content1Id || enemy?.networkId || enemy?.networkEnemyId || '') === operation.targetEnemyId
      ));
      if (target?.mesh?.position) {
        this.primaryRing.position.x = target.mesh.position.x;
        this.primaryRing.position.z = target.mesh.position.z;
        this.primaryBeam.position.x = target.mesh.position.x;
        this.primaryBeam.position.z = target.mesh.position.z;
      }
    }
  }

  clearObjectiveVisuals() {
    if (!this.objectiveGroup) return;
    this.objectiveGroup.traverse?.((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
      materials.forEach((material) => material?.dispose?.());
    });
    this.objectiveGroup.parent?.remove?.(this.objectiveGroup);
    this.objectiveGroup = null;
    this.primaryRing = null;
    this.secondaryRing = null;
    this.primaryBeam = null;
    this.secondaryBeam = null;
    this.survivorMarker = null;
    this.visualOperationId = null;
  }

  hideHud() {
    if (this.hud) this.hud.hidden = true;
  }

  dispose() {
    this.unsubscribe.splice(0).forEach((fn) => fn?.());
    this.hud?.remove?.();
    this.hud = null;
    this.hudModeToggle = null;
    this.hudContent = null;
    this.hudMutations = null;
    this.clearObjectiveVisuals();
  }
}
