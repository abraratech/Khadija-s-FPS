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
import { recordProgressionContentOperation } from './progression.js';
import {
  recordRunDynamicOperation,
  recordRunPostFinal7Mission
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
const PRIORITY_TYPES = new Set(['SHAMBLER', 'RUNNER', 'BRUTE', 'GOLIATH', 'RANGED']);
const OBJECTIVE_HUD_KEY = 'ka_objective_hud_mode_v1';

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
    this.awardTeamObjective = awardTeamObjective;
    this.handleObjectiveDirective = handleObjectiveDirective;
    this.getInteractLabel = getInteractLabel;
    this.core = new Content1Authority();
    this.objectiveDirector = new PostFinal4ObjectiveDirector();
    this.missionDirector = new PostFinal7MissionDirector();
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
    this.warnedOperationIds = new Set();
    this.lastObservedOperationId = null;
    this.lastObservedOperationStatus = null;
    this.lastObservedOperationStage = null;
    this.hud = null;
    this.hudOperation = null;
    this.hudDescription = null;
    this.hudProgress = null;
    this.hudMeta = null;
    this.hudTeam = null;
    this.hudEncounter = null;
    this.hudMission = null;
    this.hudMissionStages = null;
    this.hudRisk = null;
    this.hudRiskSecure = null;
    this.hudRiskOverdrive = null;
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
      window.KAGetContent1EncounterDirective = () => (
        this.isAuthority() ? this.core.getEncounterDirective() : this.directiveFromSnapshot()
      );
      window.KAGetPostFinal4Objective = () => this.getSnapshot()?.postFinal4 || null;
      window.KAGetPostFinal7Mission = () => this.getSnapshot()?.postFinal7 || null;
      window.KAChoosePostFinal7Risk = (choice) => this.chooseMissionRisk(choice);
      window.KAContent1EnemySpawned = (enemy) => this.prepareEnemySpawn(enemy);
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
    this.warnedOperationIds.clear();
    this.lastObservedOperationId = null;
    this.lastObservedOperationStatus = null;
    this.lastObservedOperationStage = null;
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
    this.ensureMissionObjective(Date.now(), { announce: false });
    this.ensureHud();
    this.clearObjectiveVisuals();
    this.consumeAuthorityEvents();
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
    this.warnedOperationIds.clear();
    this.lastObservedOperationId = null;
    this.lastObservedOperationStatus = null;
    this.lastObservedOperationStage = null;
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

  tuneMissionOperation(operation, stage = this.missionDirector.currentStage()) {
    if (!operation || !stage) return operation;
    operation.label = cleanText(stage.label, operation.label, 100);
    operation.description = cleanText(stage.description, operation.description, 180);
    operation.optional = stage.optional === true;
    operation.postFinal7MissionId = this.missionDirector.state.missionId;
    operation.postFinal7StageId = stage.stageId;
    operation.postFinal7StageType = stage.type;
    operation.postFinal7RiskChoice = this.missionDirector.state.riskChoice;

    if (stage.type === POST_FINAL7_STAGE_TYPES.HUNT) {
      operation.rewardPoints = Math.max(1, Math.round(finite(operation.rewardPoints, 100) * 2));
      operation.xp = Math.max(1, Math.round(finite(operation.xp, CONTENT1_OPERATION_XP) * 1.5));
      operation.targetEnemyLabel = cleanText(stage.label, 'ELITE TARGET', 100).toUpperCase();
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
    return operation;
  }

  ensureMissionObjective(now = Date.now(), { announce = true } = {}) {
    if (!this.active || !this.isAuthority()) return null;
    const mission = this.missionDirector.state;
    if (mission.status !== POST_FINAL7_MISSION_STATUS.ACTIVE) return null;
    const stage = this.missionDirector.currentStage();
    if (!stage) return null;

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
      humanSquadCommandsOverride: true
    });
  }

  buildSnapshot(now = nowMs()) {
    const base = this.core.update(now);
    const epochNow = Date.now();
    this.missionDirector.update(epochNow);
    if (this.isAuthority()) this.ensureMissionObjective(epochNow);
    const postFinal4 = this.objectiveDirector.update(epochNow);
    const postFinal7 = this.missionDirector.getSnapshot(epochNow);
    return { ...base, postFinal4, postFinal7 };
  }

  publishSnapshot(force = false) {
    if (!this.active || !this.isAuthority()) return null;
    const now = nowMs();
    if (!force && now - this.lastSnapshotSentAt < SNAPSHOT_INTERVAL_MS) return null;
    this.lastSnapshotSentAt = now;
    const snapshot = this.buildSnapshot(now);
    this.latestSnapshot = clone(snapshot);
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
    const encounter = this.core.startWave(normalizedWave, nowMs());
    this.ensureMissionObjective(Date.now(), { announce: false });
    this.consumeAuthorityEvents();
    this.publishSnapshot(true);
    return encounter;
  }

  recordEnemyKill({ enemyId = '', elite = false, headshot = false, actorId = '' } = {}) {
    const baseId = cleanText(
      enemyId,
      `enemy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      180
    );
    this.recordAction('KILL', {
      actorId,
      enemyId: baseId,
      amount: 1,
      headshot,
      eventId: `${this.session?.run?.runId || 'run'}:content-kill:${baseId}`
    });
    if (elite) {
      this.recordAction('ELITE_KILL', {
        actorId,
        amount: 1,
        enemyId: baseId,
        eventId: `${this.session?.run?.runId || 'run'}:content-elite-kill:${baseId}`
      });
    }
    return true;
  }

  prepareEnemySpawn(enemy) {
    if (!this.active || !this.isAuthority() || !enemy) return false;
    let changed = false;
    const dynamic = this.objectiveDirector.state.current;
    if (
      dynamic?.status === POST_FINAL4_OPERATION_STATUS.ACTIVE
      && dynamic.kind === POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET
      && !dynamic.targetEnemyId
      && PRIORITY_TYPES.has(cleanText(enemy.type, '', 40).toUpperCase())
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
      const missionStage = this.missionDirector.currentStage();
      const bossStage = missionStage?.type === POST_FINAL7_STAGE_TYPES.HUNT;
      if (bossStage) {
        enemy.isPostFinal7Boss = true;
        enemy.maxHealth = Math.max(1, Math.round(finite(enemy.maxHealth, enemy.health) * 1.8));
        enemy.health = enemy.maxHealth;
        enemy.scoreReward = Math.round(finite(enemy.scoreReward, 50) * 1.75);
      }
      changed = this.objectiveDirector.assignPriorityTarget({
        enemyId: targetId,
        position: enemy.mesh?.position,
        label: bossStage
          ? cleanText(missionStage.label, 'ELITE MISSION TARGET', 100).toUpperCase()
          : `${cleanText(enemy.type, 'HOSTILE', 40)} PRIORITY`
      }, Date.now()) || changed;
    }

    const directive = this.core.getEncounterDirective();
    if (directive.elitePending) {
      const type = cleanText(enemy.type, '', 40).toUpperCase();
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
          enemy.mesh?.traverse?.((child) => {
            const materials = Array.isArray(child?.material)
              ? child.material
              : (child?.material ? [child.material] : []);
            materials.forEach((material) => {
              if (material?.emissive?.setHex) {
                material.emissive.setHex(0xff8a22);
                material.emissiveIntensity = Math.max(finite(material.emissiveIntensity), 0.38);
              }
            });
          });
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
    if (!this.core.replaceSnapshot(payload.snapshot, nowMs())) return false;
    if (payload.snapshot?.postFinal4) {
      this.objectiveDirector.replaceSnapshot(payload.snapshot.postFinal4, Date.now());
    }
    if (payload.snapshot?.postFinal7) {
      this.missionDirector.replaceSnapshot(payload.snapshot.postFinal7, Date.now());
    }
    this.latestSnapshot = clone({
      ...this.core.getSnapshot(nowMs()),
      postFinal4: this.objectiveDirector.getSnapshot(Date.now()),
      postFinal7: this.missionDirector.getSnapshot(Date.now())
    });
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
      ...this.objectiveDirector.consumeEvents()
    ];
    const missionTransitions = [];

    for (const event of events) {
      if (event.type === 'ENCOUNTER_STARTED') {
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

    this.applyLocalOperationRewards();
    return [...events, ...missionEvents];
  }

  applyLocalOperationRewards() {
    const snapshot = this.getSnapshot();
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
          points: Math.max(0, Math.floor(finite(operation.rewardPoints))),
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
      const missionPoints = computePostFinal7Reward({
        basePoints: 350,
        difficulty: mission.difficulty,
        playerCount: mission.playerCount,
        riskChoice: mission.riskChoice,
        optionalStagesCompleted: mission.optionalStagesCompleted
      });
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
    return true;
  }

  directiveFromSnapshot() {
    const encounter = this.latestSnapshot?.encounter;
    return Object.freeze({
      patch: CONTENT1_PATCH,
      encounterId: encounter?.id || 'NONE',
      label: encounter?.label || 'Standard Pressure',
      wave: Math.max(1, Math.floor(finite(encounter?.wave, 1))),
      weightMultipliers: Object.freeze({ ...(encounter?.weights || {}) }),
      elitePending: this.latestSnapshot?.elite?.pending === true,
      eliteActiveIds: Object.freeze([...(this.latestSnapshot?.elite?.activeIds || [])])
    });
  }

  getSnapshot() {
    if (this.isAuthority()) return clone(this.buildSnapshot(nowMs()));
    return clone(this.latestSnapshot);
  }

  bindHudModeControl() {
    if (typeof document === 'undefined') return;
    const select = document.getElementById('objective-hud-mode-select');
    if (!select || select.dataset.kaBound === '1') return;
    select.dataset.kaBound = '1';
    let saved = 'full';
    try { saved = localStorage.getItem(OBJECTIVE_HUD_KEY) || 'full'; } catch { /* restricted storage */ }
    select.value = saved === 'compact' ? 'compact' : 'full';
    document.body?.classList.toggle('ka-objective-hud-compact', select.value === 'compact');
    select.addEventListener('change', () => {
      const value = select.value === 'compact' ? 'compact' : 'full';
      try { localStorage.setItem(OBJECTIVE_HUD_KEY, value); } catch { /* restricted storage */ }
      document.body?.classList.toggle('ka-objective-hud-compact', value === 'compact');
      this.updateHud(true);
    });
  }

  ensureHud() {
    if (typeof document === 'undefined') return null;
    if (this.hud?.isConnected) return this.hud;
    const hud = document.createElement('section');
    hud.id = 'ka-content1-hud';
    hud.className = 'ka-content1-hud ka-postfinal4-hud';
    hud.innerHTML = `
      <div class="ka-content1-kicker">CO-OP OPERATION CHAIN</div>
      <div class="ka-postfinal7-mission">MISSION DIRECTOR INITIALIZING</div>
      <div class="ka-postfinal7-stages">STAGE 0 / 0</div>
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
    `;
    document.body.appendChild(hud);
    this.hud = hud;
    this.hudMission = hud.querySelector('.ka-postfinal7-mission');
    this.hudMissionStages = hud.querySelector('.ka-postfinal7-stages');
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
    hud.style.setProperty('--ka-content1-accent', roleColor(snapshot.mapId));
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
    if (this.hudRisk) {
      const decision = mission?.status === POST_FINAL7_MISSION_STATUS.DECISION;
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
      this.hudEncounter.textContent = encounter
        ? `${encounter.liveFeatured ? 'LIVE · ' : ''}${encounter.label.toUpperCase()} · WAVE ${encounter.wave}`
        : 'STANDARD PRESSURE';
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
    this.clearObjectiveVisuals();
  }
}
