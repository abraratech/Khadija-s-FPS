// POST-FINAL.4 R1 — deterministic dynamic operations and objective director core.

export const POST_FINAL4_PATCH = 'post-final4-r1-dynamic-operations-objective-director';
export const POST_FINAL4_SCHEMA = 1;

export const POST_FINAL4_OPERATION_KINDS = Object.freeze({
  PRIORITY_TARGET: 'PRIORITY_TARGET',
  DEFEND_ZONE: 'DEFEND_ZONE',
  RESTORE_EQUIPMENT: 'RESTORE_EQUIPMENT',
  RETRIEVE_DELIVER: 'RETRIEVE_DELIVER',
  RESCUE_SURVIVOR: 'RESCUE_SURVIVOR',
  EXTRACTION_HOLDOUT: 'EXTRACTION_HOLDOUT',
  SURVIVAL_FALLBACK: 'SURVIVAL_FALLBACK'
});

export const POST_FINAL4_OPERATION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
});

const MAX_RECENT_EVENTS = 256;
const MAX_HISTORY = 12;
const BASE_XP = 110;

const MAP_LAYOUTS = Object.freeze({
  grid_bunker: Object.freeze({
    preferred: POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE,
    defend: Object.freeze({ x: 0, z: 12, radius: 7.5, label: 'CENTRAL LOCKDOWN' }),
    console: Object.freeze({ x: -12, z: -5, radius: 2.4, label: 'SECURITY RELAY' }),
    pickup: Object.freeze({ x: 15, z: -15, radius: 2.4, label: 'SUPPLY CACHE' }),
    delivery: Object.freeze({ x: -15, z: 15, radius: 3.2, label: 'BUNKER VAULT' }),
    survivor: Object.freeze({ x: 0, z: -20, radius: 2.6, label: 'TRAPPED SURVIVOR' }),
    extraction: Object.freeze({ x: 0, z: 25, radius: 7.5, label: 'NORTH EXIT' })
  }),
  industrial_yard: Object.freeze({
    preferred: POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT,
    defend: Object.freeze({ x: 0, z: -4, radius: 10, label: 'RECOVERY PAD' }),
    console: Object.freeze({ x: -20, z: 0, radius: 2.8, label: 'YARD GENERATOR' }),
    pickup: Object.freeze({ x: -34, z: 18, radius: 2.8, label: 'LOST CARGO' }),
    delivery: Object.freeze({ x: 30, z: 22, radius: 3.5, label: 'LOADING BAY' }),
    survivor: Object.freeze({ x: 34, z: -18, radius: 2.8, label: 'PINNED TECHNICIAN' }),
    extraction: Object.freeze({ x: -30, z: 30, radius: 9, label: 'WEST GATE' })
  }),
  neon_depot: Object.freeze({
    preferred: POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER,
    defend: Object.freeze({ x: 0, z: 0, radius: 9, label: 'DEPOT CORE' }),
    console: Object.freeze({ x: -22, z: 0, radius: 2.5, label: 'POWER SWITCH' }),
    pickup: Object.freeze({ x: -30, z: 24, radius: 2.6, label: 'DATA CACHE' }),
    delivery: Object.freeze({ x: 30, z: -24, radius: 3.2, label: 'UPLINK TERMINAL' }),
    survivor: Object.freeze({ x: 0, z: 34, radius: 2.6, label: 'STRANDED COURIER' }),
    extraction: Object.freeze({ x: 0, z: -32, radius: 8.5, label: 'SOUTH PLATFORM' })
  }),
  parking_garage: Object.freeze({
    preferred: POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET,
    defend: Object.freeze({ x: 0, z: 8, radius: 9, label: 'EMERGENCY HOLD' }),
    console: Object.freeze({ x: -18, z: 10, radius: 2.6, label: 'VENT CONTROL' }),
    pickup: Object.freeze({ x: -34, z: -18, radius: 2.6, label: 'SECURITY CASE' }),
    delivery: Object.freeze({ x: 34, z: 18, radius: 3.3, label: 'SERVICE ELEVATOR' }),
    survivor: Object.freeze({ x: 30, z: -4, radius: 2.6, label: 'TRAPPED DRIVER' }),
    extraction: Object.freeze({ x: -30, z: 4, radius: 8.5, label: 'RAMP EXIT' })
  }),
  hospital_wing: Object.freeze({
    preferred: POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR,
    defend: Object.freeze({ x: 0, z: 0, radius: 8, label: 'TRIAGE WARD' }),
    console: Object.freeze({ x: -14, z: -8, radius: 2.4, label: 'LIFE SUPPORT' }),
    pickup: Object.freeze({ x: 18, z: -12, radius: 2.4, label: 'MEDICAL CASE' }),
    delivery: Object.freeze({ x: -18, z: 12, radius: 3, label: 'FIELD PHARMACY' }),
    survivor: Object.freeze({ x: 0, z: 20, radius: 2.5, label: 'DOWNED MEDIC' }),
    extraction: Object.freeze({ x: 0, z: -22, radius: 7.5, label: 'AMBULANCE BAY' })
  }),
  reactor_courtyard: Object.freeze({
    preferred: POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE,
    defend: Object.freeze({ x: 0, z: 0, radius: 10, label: 'REACTOR CORE' }),
    console: Object.freeze({ x: -28, z: -17, radius: 2.8, label: 'COOLANT CONTROL' }),
    pickup: Object.freeze({ x: 28, z: -17, radius: 2.8, label: 'CONTROL ROD' }),
    delivery: Object.freeze({ x: -28, z: 17, radius: 3.4, label: 'CONTAINMENT SOCKET' }),
    survivor: Object.freeze({ x: 28, z: 17, radius: 2.8, label: 'REACTOR ENGINEER' }),
    extraction: Object.freeze({ x: 0, z: 30, radius: 9, label: 'DECONTAMINATION GATE' })
  })
});

const ROTATION = Object.freeze([
  POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE,
  POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT,
  POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER,
  POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR,
  POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET
]);

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function integer(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(max, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', max = 160) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeAnchor(value, fallback) {
  const source = value && typeof value === 'object' ? value : fallback;
  return {
    x: finite(source?.x, fallback?.x || 0),
    y: finite(source?.y, 0),
    z: finite(source?.z, fallback?.z || 0),
    radius: Math.max(1, finite(source?.radius, fallback?.radius || 6)),
    label: cleanText(source?.label, fallback?.label || 'OBJECTIVE', 80)
  };
}

export function getPostFinal4MapLayout(mapId = 'grid_bunker') {
  const normalized = cleanText(mapId, 'grid_bunker', 80).toLowerCase();
  return clone(MAP_LAYOUTS[normalized] || MAP_LAYOUTS.grid_bunker);
}

export function pointInsidePostFinal4Anchor(position, anchor, extraRadius = 0) {
  if (!position || !anchor) return false;
  const dx = finite(position.x) - finite(anchor.x);
  const dz = finite(position.z) - finite(anchor.z);
  const radius = Math.max(0.5, finite(anchor.radius, 6) + finite(extraRadius));
  return dx * dx + dz * dz <= radius * radius;
}

function scaled(value, difficulty, playerCount, min = 1) {
  const difficultyScale = 0.84 + Math.max(0.5, Math.min(2, difficulty)) * 0.16;
  const teamScale = 1 + Math.max(0, Math.min(3, playerCount - 1)) * 0.12;
  return Math.max(min, Math.round(value * difficultyScale * teamScale * 10) / 10);
}

function operationDescriptor(kind, layout, difficulty, playerCount) {
  const scaleTarget = (value, min = 1) => scaled(value, difficulty, playerCount, min);
  const rewardScale = 1 + (Math.max(0.5, Math.min(2, difficulty)) - 1) * 0.35
    + Math.max(0, Math.min(3, playerCount - 1)) * 0.12;
  const reward = (value) => Math.max(100, Math.round(value * rewardScale / 25) * 25);

  switch (kind) {
    case POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET:
      return {
        label: 'Priority Target',
        description: 'Locate and eliminate the marked high-value hostile.',
        stage: 'LOCATE',
        target: 1,
        stageTarget: 1,
        anchor: layout.defend,
        secondaryAnchor: layout.extraction,
        rewardPoints: reward(700),
        xp: Math.round(BASE_XP * 1.15),
        timeLimitMs: 150000
      };
    case POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE:
      return {
        label: `Defend ${layout.defend.label}`,
        description: `Hold ${layout.defend.label} while the director increases pressure.`,
        stage: 'HOLD',
        target: scaleTarget(30, 20),
        stageTarget: scaleTarget(30, 20),
        anchor: layout.defend,
        secondaryAnchor: layout.extraction,
        rewardPoints: reward(600),
        xp: BASE_XP,
        timeLimitMs: 150000
      };
    case POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT:
      return {
        label: `Restore ${layout.console.label}`,
        description: `Reach ${layout.console.label} and hold interact to restore it.`,
        stage: 'RESTORE',
        target: scaleTarget(6, 4),
        stageTarget: scaleTarget(6, 4),
        anchor: layout.console,
        secondaryAnchor: layout.defend,
        rewardPoints: reward(650),
        xp: BASE_XP,
        timeLimitMs: 140000
      };
    case POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER:
      return {
        label: 'Retrieve and Deliver',
        description: `Recover ${layout.pickup.label}, then deliver it to ${layout.delivery.label}.`,
        stage: 'PICKUP',
        target: scaleTarget(5, 4),
        stageTarget: scaleTarget(2.5, 2),
        anchor: layout.pickup,
        secondaryAnchor: layout.delivery,
        rewardPoints: reward(750),
        xp: Math.round(BASE_XP * 1.15),
        timeLimitMs: 175000
      };
    case POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR:
      return {
        label: 'Rescue Survivor',
        description: `Revive ${layout.survivor.label}, then escort them to ${layout.extraction.label}.`,
        stage: 'REVIVE',
        target: scaleTarget(3, 2.5),
        stageTarget: scaleTarget(3, 2.5),
        anchor: layout.survivor,
        secondaryAnchor: layout.extraction,
        rewardPoints: reward(850),
        xp: Math.round(BASE_XP * 1.25),
        timeLimitMs: 190000
      };
    case POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT:
      return {
        label: `Extraction Holdout`,
        description: `Reach ${layout.extraction.label} and hold until extraction is secured.`,
        stage: 'HOLD',
        target: scaleTarget(35, 24),
        stageTarget: scaleTarget(35, 24),
        anchor: layout.extraction,
        secondaryAnchor: layout.extraction,
        rewardPoints: reward(1000),
        xp: Math.round(BASE_XP * 1.5),
        timeLimitMs: 180000
      };
    default:
      return {
        label: 'Fallback Sweep',
        description: 'Complete a controlled hostile sweep while the objective director recovers.',
        stage: 'ELIMINATE',
        target: scaleTarget(12, 8),
        stageTarget: scaleTarget(12, 8),
        anchor: layout.defend,
        secondaryAnchor: layout.extraction,
        rewardPoints: reward(450),
        xp: Math.round(BASE_XP * 0.8),
        timeLimitMs: 180000
      };
  }
}

function normalizeContributors(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {})
      .slice(0, 12)
      .map(([key, amount]) => [cleanText(key, '', 160), Math.max(0, finite(amount))])
      .filter(([key]) => Boolean(key))
  );
}

function createOperation(state, kind, {
  wave = state.currentWave || 1,
  now = Date.now(),
  optional = state.sequence > 0
} = {}) {
  const layout = getPostFinal4MapLayout(state.mapId);
  const descriptor = operationDescriptor(kind, layout, state.difficulty, state.playerCount);
  const sequence = state.sequence + 1;
  const operationId = `${state.runId}:postfinal4:${sequence}:${kind}`;
  return {
    operationId,
    kind,
    label: descriptor.label,
    description: descriptor.description,
    optional: optional === true,
    waveAssigned: integer(wave, 1, 1, 250),
    stage: descriptor.stage,
    status: POST_FINAL4_OPERATION_STATUS.ACTIVE,
    progress: 0,
    target: descriptor.target,
    stageProgress: 0,
    stageTarget: descriptor.stageTarget,
    anchor: normalizeAnchor(descriptor.anchor, layout.defend),
    secondaryAnchor: normalizeAnchor(descriptor.secondaryAnchor, layout.extraction),
    rewardPoints: integer(descriptor.rewardPoints, 500, 0, 100000),
    xp: integer(descriptor.xp, BASE_XP, 0, 10000),
    createdAt: integer(now, Date.now()),
    expiresAt: integer(now, Date.now()) + integer(descriptor.timeLimitMs, 150000, 10000, 600000),
    remainingMs: integer(descriptor.timeLimitMs, 150000, 0, 600000),
    completedAt: 0,
    completionId: null,
    failedAt: 0,
    failureReason: '',
    contributors: {},
    targetEnemyId: null,
    targetEnemyLabel: '',
    carrierPlayerId: null,
    survivorPosition: kind === POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR
      ? { x: layout.survivor.x, y: 0, z: layout.survivor.z }
      : null,
    survivorLeaderId: null
  };
}

function normalizeOperation(value, state, now = Date.now()) {
  if (!value || typeof value !== 'object') return null;
  const kind = Object.values(POST_FINAL4_OPERATION_KINDS).includes(value.kind)
    ? value.kind
    : POST_FINAL4_OPERATION_KINDS.SURVIVAL_FALLBACK;
  const fallback = createOperation(state, kind, {
    wave: value.waveAssigned || state.currentWave,
    now: value.createdAt || now,
    optional: value.optional === true
  });
  const status = Object.values(POST_FINAL4_OPERATION_STATUS).includes(value.status)
    ? value.status
    : POST_FINAL4_OPERATION_STATUS.ACTIVE;
  const stageTarget = Math.max(0.1, finite(value.stageTarget, fallback.stageTarget));
  const target = Math.max(0.1, finite(value.target, fallback.target));
  return {
    ...fallback,
    operationId: cleanText(value.operationId, fallback.operationId, 240),
    label: cleanText(value.label, fallback.label, 120),
    description: cleanText(value.description, fallback.description, 260),
    optional: value.optional === true,
    waveAssigned: integer(value.waveAssigned, fallback.waveAssigned, 1, 250),
    stage: cleanText(value.stage, fallback.stage, 40).toUpperCase(),
    status,
    progress: Math.max(0, Math.min(target, finite(value.progress, 0))),
    target,
    stageProgress: Math.max(0, Math.min(stageTarget, finite(value.stageProgress, 0))),
    stageTarget,
    anchor: normalizeAnchor(value.anchor, fallback.anchor),
    secondaryAnchor: normalizeAnchor(value.secondaryAnchor, fallback.secondaryAnchor),
    rewardPoints: integer(value.rewardPoints, fallback.rewardPoints, 0, 100000),
    xp: integer(value.xp, fallback.xp, 0, 10000),
    createdAt: integer(value.createdAt, fallback.createdAt),
    expiresAt: integer(value.expiresAt, fallback.expiresAt),
    remainingMs: Math.max(0, integer(value.remainingMs, Math.max(0, fallback.expiresAt - now))),
    completedAt: integer(value.completedAt, 0),
    completionId: value.completionId ? cleanText(value.completionId, '', 260) : null,
    failedAt: integer(value.failedAt, 0),
    failureReason: cleanText(value.failureReason, '', 160),
    contributors: normalizeContributors(value.contributors),
    targetEnemyId: value.targetEnemyId ? cleanText(value.targetEnemyId, '', 180) : null,
    targetEnemyLabel: cleanText(value.targetEnemyLabel, '', 100),
    carrierPlayerId: value.carrierPlayerId ? cleanText(value.carrierPlayerId, '', 160) : null,
    survivorPosition: value.survivorPosition
      ? {
          x: finite(value.survivorPosition.x),
          y: finite(value.survivorPosition.y),
          z: finite(value.survivorPosition.z)
        }
      : fallback.survivorPosition,
    survivorLeaderId: value.survivorLeaderId ? cleanText(value.survivorLeaderId, '', 160) : null
  };
}

export function createPostFinal4ObjectiveState({
  runId = 'run',
  mapId = 'grid_bunker',
  difficulty = 1,
  playerCount = 1,
  now = Date.now()
} = {}) {
  const normalizedMap = cleanText(mapId, 'grid_bunker', 80).toLowerCase();
  const state = {
    patch: POST_FINAL4_PATCH,
    schema: POST_FINAL4_SCHEMA,
    runId: cleanText(runId, 'run', 160),
    mapId: normalizedMap,
    difficulty: Math.max(0.5, Math.min(2, finite(difficulty, 1))),
    playerCount: integer(playerCount, 1, 1, 4),
    active: true,
    sequence: 0,
    currentWave: 1,
    current: null,
    history: [],
    completed: [],
    failed: [],
    recentEventIds: [],
    nextEligibleWave: 1,
    extractionCompleted: false,
    lastEvent: 'OBJECTIVE DIRECTOR ONLINE',
    updatedAt: integer(now, Date.now())
  };
  const layout = getPostFinal4MapLayout(normalizedMap);
  state.current = createOperation(state, layout.preferred, {
    wave: 1,
    now,
    optional: false
  });
  state.sequence = 1;
  state.history.push(layout.preferred);
  state.lastEvent = `ASSIGNED ${state.current.label.toUpperCase()}`;
  return state;
}

export function normalizePostFinal4ObjectiveState(value = {}, now = Date.now()) {
  const base = createPostFinal4ObjectiveState({
    runId: value.runId || 'run',
    mapId: value.mapId || 'grid_bunker',
    difficulty: value.difficulty,
    playerCount: value.playerCount,
    now
  });
  const state = {
    ...base,
    active: value.active !== false,
    sequence: integer(value.sequence, base.sequence, 0, 1000),
    currentWave: integer(value.currentWave, 1, 1, 250),
    history: Array.isArray(value.history)
      ? value.history.map((entry) => cleanText(entry, '', 40)).filter(Boolean).slice(-MAX_HISTORY)
      : base.history,
    completed: Array.isArray(value.completed)
      ? value.completed.map((entry) => clone(entry)).slice(-MAX_HISTORY)
      : [],
    failed: Array.isArray(value.failed)
      ? value.failed.map((entry) => clone(entry)).slice(-MAX_HISTORY)
      : [],
    recentEventIds: Array.isArray(value.recentEventIds)
      ? value.recentEventIds.map((entry) => cleanText(entry, '', 240)).filter(Boolean).slice(-MAX_RECENT_EVENTS)
      : [],
    nextEligibleWave: integer(value.nextEligibleWave, 1, 1, 250),
    extractionCompleted: value.extractionCompleted === true,
    lastEvent: cleanText(value.lastEvent, base.lastEvent, 180),
    updatedAt: integer(value.updatedAt, now)
  };
  state.current = value.current === null
    ? null
    : normalizeOperation(value.current, state, now);
  return state;
}

function chooseNextKind(state, wave) {
  if (
    wave >= 6
    && state.completed.length >= 2
    && state.extractionCompleted !== true
    && state.current?.kind !== POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT
  ) {
    return POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT;
  }
  const recent = state.history.slice(-2);
  const eligible = ROTATION.filter((kind) => !recent.includes(kind));
  const pool = eligible.length ? eligible : ROTATION;
  const seed = hashText(`${state.runId}:${state.mapId}:${state.sequence + 1}:${wave}`);
  return pool[seed % pool.length] || POST_FINAL4_OPERATION_KINDS.SURVIVAL_FALLBACK;
}

function addContribution(operation, actorIds, amount) {
  const ids = Array.isArray(actorIds) ? actorIds : [actorIds];
  ids.map((entry) => cleanText(entry, '', 160)).filter(Boolean).forEach((actorId) => {
    operation.contributors[actorId] = Math.max(
      0,
      finite(operation.contributors[actorId], 0) + Math.max(0, finite(amount, 0))
    );
  });
}

function eventIdSeen(state, eventId) {
  const clean = cleanText(eventId, '', 240);
  if (!clean || state.recentEventIds.includes(clean)) return true;
  state.recentEventIds.push(clean);
  state.recentEventIds = state.recentEventIds.slice(-MAX_RECENT_EVENTS);
  return false;
}

function progressLabel(operation) {
  if (!operation) return 'NO ACTIVE OPERATION';
  return `${operation.label} ${Math.floor(operation.stageProgress)}/${Math.floor(operation.stageTarget)}`;
}

function completeCurrent(state, now, events) {
  const operation = state.current;
  if (!operation || operation.status !== POST_FINAL4_OPERATION_STATUS.ACTIVE) return false;
  operation.status = POST_FINAL4_OPERATION_STATUS.COMPLETE;
  operation.stage = 'COMPLETE';
  operation.progress = operation.target;
  operation.stageProgress = operation.stageTarget;
  operation.completedAt = integer(now, Date.now());
  operation.remainingMs = Math.max(0, operation.expiresAt - operation.completedAt);
  operation.completionId = `${operation.operationId}:complete`;
  state.completed.push(clone(operation));
  state.completed = state.completed.slice(-MAX_HISTORY);
  state.nextEligibleWave = Math.max(state.currentWave + 1, operation.waveAssigned + 1);
  if (operation.kind === POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT) {
    state.extractionCompleted = true;
  }
  state.lastEvent = `${operation.label.toUpperCase()} COMPLETE`;
  events.push({
    type: 'DYNAMIC_OPERATION_COMPLETED',
    eventId: operation.completionId,
    operation: clone(operation),
    at: operation.completedAt
  });
  return true;
}

function failCurrent(state, reason, now, events) {
  const operation = state.current;
  if (!operation || operation.status !== POST_FINAL4_OPERATION_STATUS.ACTIVE) return false;
  operation.status = POST_FINAL4_OPERATION_STATUS.FAILED;
  operation.stage = 'FAILED';
  operation.failedAt = integer(now, Date.now());
  operation.failureReason = cleanText(reason, 'OPERATION WINDOW EXPIRED', 160);
  operation.remainingMs = 0;
  state.failed.push(clone(operation));
  state.failed = state.failed.slice(-MAX_HISTORY);
  state.nextEligibleWave = Math.max(state.currentWave + 1, operation.waveAssigned + 1);
  state.lastEvent = `${operation.label.toUpperCase()} FAILED`;
  events.push({
    type: 'DYNAMIC_OPERATION_FAILED',
    eventId: `${operation.operationId}:failed`,
    operation: clone(operation),
    reason: operation.failureReason,
    at: operation.failedAt
  });
  return true;
}

export class PostFinal4ObjectiveDirector {
  constructor(value = null) {
    this.state = normalizePostFinal4ObjectiveState(value || createPostFinal4ObjectiveState());
    this.pendingEvents = [];
  }

  reset(details = {}) {
    this.state = createPostFinal4ObjectiveState(details);
    this.pendingEvents.length = 0;
    this.pendingEvents.push({
      type: 'DYNAMIC_OPERATION_ASSIGNED',
      eventId: `${this.state.current.operationId}:assigned`,
      operation: clone(this.state.current),
      at: this.state.updatedAt
    });
    return this.getSnapshot(details.now);
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (!snapshot || snapshot.patch !== POST_FINAL4_PATCH) return false;
    if (integer(snapshot.schema, 0) !== POST_FINAL4_SCHEMA) return false;
    if (this.state.runId && snapshot.runId && this.state.runId !== snapshot.runId) return false;
    this.state = normalizePostFinal4ObjectiveState(snapshot, now);
    return true;
  }

  assignOperation(kind, {
    wave = this.state.currentWave,
    now = Date.now(),
    optional = this.state.sequence > 0
  } = {}) {
    const normalizedKind = Object.values(POST_FINAL4_OPERATION_KINDS).includes(kind)
      ? kind
      : POST_FINAL4_OPERATION_KINDS.SURVIVAL_FALLBACK;
    this.state.current = createOperation(this.state, normalizedKind, { wave, now, optional });
    this.state.sequence += 1;
    this.state.history.push(normalizedKind);
    this.state.history = this.state.history.slice(-MAX_HISTORY);
    this.state.updatedAt = integer(now, Date.now());
    this.state.lastEvent = `ASSIGNED ${this.state.current.label.toUpperCase()}`;
    this.pendingEvents.push({
      type: 'DYNAMIC_OPERATION_ASSIGNED',
      eventId: `${this.state.current.operationId}:assigned`,
      operation: clone(this.state.current),
      at: this.state.updatedAt
    });
    return clone(this.state.current);
  }

  startWave(wave = 1, now = Date.now()) {
    this.state.currentWave = integer(wave, 1, 1, 250);
    this.state.updatedAt = integer(now, Date.now());
    const terminal = !this.state.current
      || [POST_FINAL4_OPERATION_STATUS.COMPLETE, POST_FINAL4_OPERATION_STATUS.FAILED]
        .includes(this.state.current.status);
    if (terminal && this.state.currentWave >= this.state.nextEligibleWave) {
      return this.assignOperation(chooseNextKind(this.state, this.state.currentWave), {
        wave: this.state.currentWave,
        now,
        optional: true
      });
    }
    return clone(this.state.current);
  }

  assignPriorityTarget({ enemyId = '', position = null, label = 'HIGH-VALUE HOSTILE' } = {}, now = Date.now()) {
    const operation = this.state.current;
    if (
      !operation
      || operation.status !== POST_FINAL4_OPERATION_STATUS.ACTIVE
      || operation.kind !== POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET
      || operation.targetEnemyId
    ) return false;
    const id = cleanText(enemyId, '', 180);
    if (!id) return false;
    operation.targetEnemyId = id;
    operation.targetEnemyLabel = cleanText(label, 'HIGH-VALUE HOSTILE', 100);
    if (position) {
      operation.anchor = normalizeAnchor({
        ...operation.anchor,
        x: position.x,
        y: position.y,
        z: position.z,
        label: operation.targetEnemyLabel
      }, operation.anchor);
    }
    operation.stage = 'ELIMINATE';
    operation.stageProgress = 0;
    operation.stageTarget = 1;
    stateUpdated(this.state, now, `PRIORITY TARGET ACQUIRED · ${operation.targetEnemyLabel}`);
    this.pendingEvents.push({
      type: 'DYNAMIC_PRIORITY_ASSIGNED',
      eventId: `${operation.operationId}:target:${id}`,
      operation: clone(operation),
      at: this.state.updatedAt
    });
    return true;
  }

  recordAction(action = {}) {
    const operation = this.state.current;
    if (!this.state.active || !operation || operation.status !== POST_FINAL4_OPERATION_STATUS.ACTIVE) {
      return false;
    }
    const eventId = cleanText(action.eventId, '', 240);
    if (eventIdSeen(this.state, eventId)) return false;
    const kind = cleanText(action.kind, '', 40).toUpperCase();
    const amount = Math.max(0, Math.min(10, finite(action.amount, 1)));
    const actorIds = Array.isArray(action.actorIds)
      ? action.actorIds
      : [action.actorId || 'local'];
    const now = integer(action.at, Date.now());
    let accepted = false;

    if (
      [POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT]
        .includes(operation.kind)
      && kind === 'ZONE_TICK'
    ) {
      operation.stageProgress = Math.min(operation.stageTarget, operation.stageProgress + amount);
      operation.progress = Math.min(operation.target, operation.progress + amount);
      addContribution(operation, actorIds, amount);
      accepted = true;
    } else if (operation.kind === POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT && kind === 'INTERACT_TICK') {
      operation.stageProgress = Math.min(operation.stageTarget, operation.stageProgress + amount);
      operation.progress = Math.min(operation.target, operation.progress + amount);
      addContribution(operation, actorIds, amount);
      accepted = true;
    } else if (operation.kind === POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER && kind === 'INTERACT_TICK') {
      const actorId = cleanText(action.actorId, 'local', 160);
      if (operation.stage === 'PICKUP') {
        operation.stageProgress = Math.min(operation.stageTarget, operation.stageProgress + amount);
        addContribution(operation, actorId, amount);
        accepted = true;
        if (operation.stageProgress >= operation.stageTarget) {
          operation.progress = Math.min(operation.target, operation.progress + operation.stageProgress);
          operation.stage = 'DELIVER';
          operation.carrierPlayerId = actorId;
          operation.anchor = clone(operation.secondaryAnchor);
          operation.stageProgress = 0;
          operation.stageTarget = Math.max(2, operation.target - operation.progress);
          this.pendingEvents.push({
            type: 'DYNAMIC_OPERATION_STAGE_CHANGED',
            eventId: `${operation.operationId}:deliver`,
            operation: clone(operation),
            at: now
          });
        }
      } else if (operation.stage === 'DELIVER' && (!operation.carrierPlayerId || operation.carrierPlayerId === actorId)) {
        operation.carrierPlayerId = actorId;
        operation.stageProgress = Math.min(operation.stageTarget, operation.stageProgress + amount);
        addContribution(operation, actorId, amount);
        accepted = true;
        if (operation.stageProgress >= operation.stageTarget) {
          operation.progress = operation.target;
        }
      }
    } else if (operation.kind === POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR) {
      const actorId = cleanText(action.actorId, 'local', 160);
      if (operation.stage === 'REVIVE' && kind === 'INTERACT_TICK') {
        operation.stageProgress = Math.min(operation.stageTarget, operation.stageProgress + amount);
        addContribution(operation, actorId, amount);
        accepted = true;
        if (operation.stageProgress >= operation.stageTarget) {
          operation.progress = operation.target;
          operation.stage = 'ESCORT';
          operation.survivorLeaderId = actorId;
          operation.stageProgress = 0;
          operation.stageTarget = 1;
          this.pendingEvents.push({
            type: 'DYNAMIC_OPERATION_STAGE_CHANGED',
            eventId: `${operation.operationId}:escort`,
            operation: clone(operation),
            at: now
          });
        }
      } else if (operation.stage === 'ESCORT' && kind === 'SURVIVOR_POSITION') {
        operation.survivorLeaderId = actorId;
        operation.survivorPosition = {
          x: finite(action.position?.x, operation.survivorPosition?.x),
          y: finite(action.position?.y, operation.survivorPosition?.y),
          z: finite(action.position?.z, operation.survivorPosition?.z)
        };
        addContribution(operation, actorId, Math.max(0.1, amount));
        accepted = true;
        if (pointInsidePostFinal4Anchor(operation.survivorPosition, operation.secondaryAnchor, -0.5)) {
          operation.stageProgress = operation.stageTarget;
        }
      }
    } else if (operation.kind === POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET && kind === 'KILL') {
      const enemyId = cleanText(action.enemyId, '', 180);
      if (operation.targetEnemyId && enemyId === operation.targetEnemyId) {
        operation.stageProgress = 1;
        operation.progress = 1;
        addContribution(operation, action.actorId || 'local', 1);
        accepted = true;
      }
    } else if (operation.kind === POST_FINAL4_OPERATION_KINDS.SURVIVAL_FALLBACK && kind === 'KILL') {
      operation.stageProgress = Math.min(operation.stageTarget, operation.stageProgress + amount);
      operation.progress = Math.min(operation.target, operation.progress + amount);
      addContribution(operation, action.actorId || 'local', amount);
      accepted = true;
    } else if (kind === 'FAIL') {
      accepted = failCurrent(this.state, action.reason, now, this.pendingEvents);
    }

    if (!accepted) return false;
    stateUpdated(this.state, now, progressLabel(operation));
    if (
      operation.status === POST_FINAL4_OPERATION_STATUS.ACTIVE
      && operation.stageProgress >= operation.stageTarget
      && !(
        operation.kind === POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER
        && operation.stage === 'PICKUP'
      )
      && !(
        operation.kind === POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR
        && operation.stage === 'REVIVE'
      )
    ) {
      completeCurrent(this.state, now, this.pendingEvents);
    }
    return true;
  }

  update(now = Date.now()) {
    const operation = this.state.current;
    this.state.updatedAt = integer(now, Date.now());
    if (operation?.status === POST_FINAL4_OPERATION_STATUS.ACTIVE) {
      operation.remainingMs = Math.max(0, operation.expiresAt - this.state.updatedAt);
      if (operation.remainingMs <= 0) {
        failCurrent(this.state, 'OPERATION WINDOW EXPIRED', this.state.updatedAt, this.pendingEvents);
      }
    }
    return this.getSnapshot(now);
  }

  consumeEvents() {
    const events = this.pendingEvents.map(clone);
    this.pendingEvents.length = 0;
    return events;
  }

  getDirective() {
    const operation = this.state.current;
    if (!operation || operation.status !== POST_FINAL4_OPERATION_STATUS.ACTIVE) return null;
    return Object.freeze(clone({
      patch: POST_FINAL4_PATCH,
      operationId: operation.operationId,
      kind: operation.kind,
      stage: operation.stage,
      label: operation.label,
      position: operation.anchor,
      secondaryPosition: operation.secondaryAnchor,
      targetId: operation.targetEnemyId,
      carrierPlayerId: operation.carrierPlayerId,
      expiresAt: operation.expiresAt,
      optional: operation.optional
    }));
  }

  getSnapshot(now = Date.now()) {
    const state = normalizePostFinal4ObjectiveState({
      ...this.state,
      updatedAt: integer(now, Date.now())
    }, now);
    return Object.freeze(clone(state));
  }
}

function stateUpdated(state, now, lastEvent) {
  state.updatedAt = integer(now, Date.now());
  state.lastEvent = cleanText(lastEvent, state.lastEvent, 180);
}
