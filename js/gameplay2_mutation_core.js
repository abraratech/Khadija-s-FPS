// GAMEPLAY.2 R1 — deterministic late-round arena mutations.

export const GAMEPLAY2_PATCH = 'gameplay2-r1-late-round-arena-mutations';
export const GAMEPLAY2_SCHEMA = 1;
export const GAMEPLAY2_MAX_ACTIVE = 3;
export const GAMEPLAY2_FIRST_WAVE = 8;
export const GAMEPLAY2_FIXED_MILESTONES = Object.freeze([8, 11, 14]);
export const GAMEPLAY2_ESCALATION_START = 17;
export const GAMEPLAY2_ESCALATION_INTERVAL = 4;

export const GAMEPLAY2_MUTATIONS = Object.freeze({
  BLACKOUT: 'BLACKOUT',
  ELITE_INFESTATION: 'ELITE_INFESTATION',
  SUPPLY_CRISIS: 'SUPPLY_CRISIS',
  HAZARD_SHIFT: 'HAZARD_SHIFT',
  BERSERK_THREATS: 'BERSERK_THREATS'
});

const MAX_HISTORY = 48;
const MAX_LEVEL = 3;
const HAZARD_IDLE_MS = 9500;
const HAZARD_WARNING_MS = 1700;
const HAZARD_ACTIVE_MS = 4200;
const MAP_HAZARD_ANCHORS = Object.freeze({
  grid_bunker: Object.freeze([{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: -10, z: 10 }, { x: 10, z: 10 }]),
  industrial_yard: Object.freeze([{ x: -17, z: -8 }, { x: 17, z: -8 }, { x: -17, z: 9 }, { x: 17, z: 9 }]),
  neon_depot: Object.freeze([{ x: -14, z: -10 }, { x: 14, z: -10 }, { x: -14, z: 10 }, { x: 14, z: 10 }]),
  parking_garage: Object.freeze([{ x: -16, z: -12 }, { x: 16, z: -12 }, { x: -16, z: 12 }, { x: 16, z: 12 }]),
  hospital_wing: Object.freeze([{ x: -12, z: -9 }, { x: 12, z: -9 }, { x: -12, z: 9 }, { x: 12, z: 9 }]),
  reactor_courtyard: Object.freeze([{ x: -18, z: -12 }, { x: 18, z: -12 }, { x: -18, z: 12 }, { x: 18, z: 12 }])
});

const DEFINITIONS = Object.freeze({
  [GAMEPLAY2_MUTATIONS.BLACKOUT]: Object.freeze({
    id: GAMEPLAY2_MUTATIONS.BLACKOUT,
    label: 'Blackout',
    description: 'Arena lighting fails and emergency visibility becomes critical.',
    rewardBonus: 0.08,
    tuning: Object.freeze({
      blackout: true,
      ambientScale: 0.42,
      directionalScale: 0.52,
      fogDensityScale: 1.18,
      bloomScale: 0.72
    })
  }),
  [GAMEPLAY2_MUTATIONS.ELITE_INFESTATION]: Object.freeze({
    id: GAMEPLAY2_MUTATIONS.ELITE_INFESTATION,
    label: 'Elite Infestation',
    description: 'Special-unit frequency rises and elite enemies become harder to contain.',
    rewardBonus: 0.12,
    tuning: Object.freeze({
      specialWeightScale: 1.42,
      eliteHealthScale: 1.10,
      activeCapBonus: 1
    })
  }),
  [GAMEPLAY2_MUTATIONS.SUPPLY_CRISIS]: Object.freeze({
    id: GAMEPLAY2_MUTATIONS.SUPPLY_CRISIS,
    label: 'Supply Crisis',
    description: 'Random combat supplies become scarce while emergency swarm resupply remains protected.',
    rewardBonus: 0.10,
    tuning: Object.freeze({
      powerupDropScale: 0.46
    })
  }),
  [GAMEPLAY2_MUTATIONS.HAZARD_SHIFT]: Object.freeze({
    id: GAMEPLAY2_MUTATIONS.HAZARD_SHIFT,
    label: 'Hazard Shift',
    description: 'Unstable danger zones cycle through the arena and dislodge fixed defensive positions.',
    rewardBonus: 0.11,
    tuning: Object.freeze({
      hazardShift: true,
      hazardIntervalScale: 0.72,
      hazardWarningScale: 0.92,
      hazardDurationScale: 1.18,
      hazardRadiusScale: 1.08,
      hazardDamageScale: 1.10
    })
  }),
  [GAMEPLAY2_MUTATIONS.BERSERK_THREATS]: Object.freeze({
    id: GAMEPLAY2_MUTATIONS.BERSERK_THREATS,
    label: 'Berserk Threats',
    description: 'Enemies transition faster, strike harder, and apply sustained pursuit pressure.',
    rewardBonus: 0.13,
    tuning: Object.freeze({
      enemySpeedScale: 1.08,
      enemyDamageScale: 1.10,
      attackRateScale: 0.92,
      spawnIntervalScale: 0.95,
      specialWeightScale: 1.06
    })
  })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}

function clean(value, fallback = '', maximum = 160) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || String(fallback || '')).slice(0, maximum);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hash32(value = '') {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededIndex(seed, length, salt = '') {
  if (length <= 0) return 0;
  return hash32(`${seed}:${salt}`) % length;
}

function definition(id) {
  return DEFINITIONS[id] || DEFINITIONS[GAMEPLAY2_MUTATIONS.BLACKOUT];
}

function levelScale(level) {
  return 1 + Math.max(0, integer(level, 1, 1, MAX_LEVEL) - 1) * 0.5;
}

function normalizeMutation(entry = {}) {
  const id = Object.values(GAMEPLAY2_MUTATIONS).includes(entry.id)
    ? entry.id
    : GAMEPLAY2_MUTATIONS.BLACKOUT;
  const base = definition(id);
  const level = integer(entry.level, 1, 1, MAX_LEVEL);
  return {
    id,
    label: base.label,
    description: base.description,
    level,
    activatedWave: integer(entry.activatedWave, GAMEPLAY2_FIRST_WAVE, 1, 250),
    lastChangedWave: integer(entry.lastChangedWave, entry.activatedWave || GAMEPLAY2_FIRST_WAVE, 1, 250),
    rewardBonus: Math.max(0, finite(base.rewardBonus)) * levelScale(level)
  };
}

function normalizeHistory(entry = {}, index = 0) {
  const mutation = normalizeMutation(entry.mutation || entry);
  return {
    eventId: clean(entry.eventId, `gameplay2:event:${index}`, 220),
    type: ['ACTIVATED', 'ESCALATED', 'ROTATED'].includes(entry.type)
      ? entry.type
      : 'ACTIVATED',
    wave: integer(entry.wave, mutation.lastChangedWave, 1, 250),
    mutation,
    replacedMutationId: Object.values(GAMEPLAY2_MUTATIONS).includes(entry.replacedMutationId)
      ? entry.replacedMutationId
      : null,
    at: integer(entry.at, Date.now(), 0)
  };
}

export function isGameplay2Milestone(wave) {
  const value = integer(wave, 1, 1, 250);
  if (GAMEPLAY2_FIXED_MILESTONES.includes(value)) return true;
  return value >= GAMEPLAY2_ESCALATION_START
    && (value - GAMEPLAY2_ESCALATION_START) % GAMEPLAY2_ESCALATION_INTERVAL === 0;
}

export function getNextGameplay2Milestone(wave) {
  const value = integer(wave, 1, 1, 250);
  for (const milestone of GAMEPLAY2_FIXED_MILESTONES) {
    if (milestone > value) return milestone;
  }
  if (value < GAMEPLAY2_ESCALATION_START) return GAMEPLAY2_ESCALATION_START;
  const elapsed = value - GAMEPLAY2_ESCALATION_START;
  return GAMEPLAY2_ESCALATION_START
    + (Math.floor(elapsed / GAMEPLAY2_ESCALATION_INTERVAL) + 1) * GAMEPLAY2_ESCALATION_INTERVAL;
}

function calculateRewardMultiplier(activeMutations = []) {
  const bonus = activeMutations.reduce(
    (sum, entry) => sum + Math.max(0, finite(entry.rewardBonus)),
    0
  );
  return Math.max(1, Math.min(1.75, 1 + bonus));
}

function createEvent(state, type, mutation, wave, replacedMutationId = null, now = Date.now()) {
  const event = {
    eventId: `${state.runId}:gameplay2:${state.revision + 1}:${wave}:${type}:${mutation.id}`.slice(0, 220),
    type,
    wave,
    mutation: clone(mutation),
    replacedMutationId,
    at: integer(now, Date.now(), 0)
  };
  state.history.push(event);
  if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
  state.pendingEvents.push(event);
  state.revision += 1;
  state.lastEvent = type;
  state.updatedAt = event.at;
  state.rewardMultiplier = calculateRewardMultiplier(state.activeMutations);
  state.peakRewardMultiplier = Math.max(state.peakRewardMultiplier, state.rewardMultiplier);
  state.peakActiveCount = Math.max(state.peakActiveCount, state.activeMutations.length);
  return event;
}

function getHazardAnchors(mapId) {
  return MAP_HAZARD_ANCHORS[clean(mapId, 'grid_bunker', 80)]
    || MAP_HAZARD_ANCHORS.grid_bunker;
}

function createHazardState(now = Date.now()) {
  return {
    enabled: false,
    phase: 'OFFLINE',
    cycle: 0,
    anchorIndex: -1,
    anchor: null,
    radius: 0,
    damage: 0,
    phaseEndsAt: 0,
    updatedAt: integer(now, Date.now(), 0)
  };
}

function normalizeHazardState(value = {}, mapId = 'grid_bunker', now = Date.now()) {
  const anchors = getHazardAnchors(mapId);
  const anchorIndex = integer(value.anchorIndex, -1, -1, Math.max(-1, anchors.length - 1));
  const anchor = anchorIndex >= 0 ? anchors[anchorIndex] : null;
  return {
    enabled: value.enabled === true,
    phase: ['OFFLINE', 'IDLE', 'WARNING', 'ACTIVE'].includes(value.phase)
      ? value.phase
      : 'OFFLINE',
    cycle: integer(value.cycle, 0, 0, 10000),
    anchorIndex,
    anchor: anchor ? { x: finite(anchor.x), z: finite(anchor.z) } : null,
    radius: Math.max(0, finite(value.radius)),
    damage: Math.max(0, finite(value.damage)),
    phaseEndsAt: integer(value.phaseEndsAt, 0, 0),
    updatedAt: integer(value.updatedAt, now, 0)
  };
}

function syncHazardState(state, now = Date.now()) {
  const tuning = getGameplay2MutationTuning({ ...state, hazard: undefined });
  const enabled = state.enabled && tuning.map.hazardShift === true;
  if (!enabled) {
    state.hazard = createHazardState(now);
    return state.hazard;
  }

  const hazard = normalizeHazardState(state.hazard, state.mapId, now);
  const anchors = getHazardAnchors(state.mapId);
  if (!hazard.enabled || hazard.phase === 'OFFLINE') {
    hazard.enabled = true;
    hazard.phase = 'IDLE';
    hazard.phaseEndsAt = integer(now, Date.now(), 0)
      + Math.round(HAZARD_IDLE_MS * tuning.map.hazardIntervalScale);
    hazard.updatedAt = integer(now, Date.now(), 0);
  }

  let guard = 0;
  while (hazard.phaseEndsAt > 0 && now >= hazard.phaseEndsAt && guard < 8) {
    guard += 1;
    if (hazard.phase === 'IDLE') {
      hazard.anchorIndex = seededIndex(
        state.seed,
        anchors.length,
        `hazard:${hazard.cycle}:${state.revision}`
      );
      const anchor = anchors[hazard.anchorIndex];
      hazard.anchor = { x: finite(anchor.x), z: finite(anchor.z) };
      hazard.radius = 4.2 * tuning.map.hazardRadiusScale;
      hazard.damage = 7 * tuning.map.hazardDamageScale;
      hazard.phase = 'WARNING';
      hazard.phaseEndsAt += Math.round(HAZARD_WARNING_MS * tuning.map.hazardWarningScale);
    } else if (hazard.phase === 'WARNING') {
      hazard.phase = 'ACTIVE';
      hazard.phaseEndsAt += Math.round(HAZARD_ACTIVE_MS * tuning.map.hazardDurationScale);
    } else {
      hazard.phase = 'IDLE';
      hazard.cycle += 1;
      hazard.anchorIndex = -1;
      hazard.anchor = null;
      hazard.radius = 0;
      hazard.damage = 0;
      hazard.phaseEndsAt += Math.round(HAZARD_IDLE_MS * tuning.map.hazardIntervalScale);
    }
    hazard.updatedAt = integer(now, Date.now(), 0);
  }
  state.hazard = hazard;
  return hazard;
}

export function createGameplay2MutationState({
  runId = '',
  mapId = 'grid_bunker',
  difficulty = 1,
  gameMode = 'survival',
  enabled = true,
  now = Date.now()
} = {}) {
  const normalizedMode = clean(gameMode, 'survival', 40).toLowerCase();
  const active = enabled === true && !normalizedMode.includes('pvp');
  const normalizedRunId = clean(runId, `run-${integer(now, Date.now(), 1).toString(36)}`, 160);
  const normalizedMapId = clean(mapId, 'grid_bunker', 80);
  return {
    patch: GAMEPLAY2_PATCH,
    schema: GAMEPLAY2_SCHEMA,
    enabled: active,
    runId: normalizedRunId,
    mapId: normalizedMapId,
    difficulty: Math.max(0.5, Math.min(2, finite(difficulty, 1))),
    gameMode: normalizedMode,
    seed: `${normalizedRunId}:${normalizedMapId}:gameplay2-r1`,
    currentWave: 1,
    activeMutations: [],
    history: [],
    revision: 0,
    rewardMultiplier: 1,
    peakRewardMultiplier: 1,
    peakActiveCount: 0,
    nextMilestoneWave: active ? GAMEPLAY2_FIRST_WAVE : 0,
    lastEvent: active ? 'STANDBY' : 'DISABLED',
    updatedAt: integer(now, Date.now(), 0),
    hazard: createHazardState(now),
    pendingEvents: []
  };
}

export function normalizeGameplay2MutationState(value = {}, now = Date.now()) {
  const base = createGameplay2MutationState({
    runId: value.runId,
    mapId: value.mapId,
    difficulty: value.difficulty,
    gameMode: value.gameMode,
    enabled: value.enabled !== false,
    now
  });
  if (value.patch !== GAMEPLAY2_PATCH || integer(value.schema) !== GAMEPLAY2_SCHEMA) {
    return base;
  }
  const activeMutations = Array.isArray(value.activeMutations)
    ? value.activeMutations.map(normalizeMutation).slice(0, GAMEPLAY2_MAX_ACTIVE)
    : [];
  const seen = new Set();
  const unique = activeMutations.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
  const history = Array.isArray(value.history)
    ? value.history.map(normalizeHistory).slice(-MAX_HISTORY)
    : [];
  const rewardMultiplier = calculateRewardMultiplier(unique);
  return {
    ...base,
    enabled: value.enabled !== false && base.enabled,
    currentWave: integer(value.currentWave, 1, 1, 250),
    activeMutations: unique,
    history,
    revision: integer(value.revision, history.length, 0, 10000),
    rewardMultiplier,
    peakRewardMultiplier: Math.max(
      rewardMultiplier,
      Math.min(1.75, finite(value.peakRewardMultiplier, rewardMultiplier))
    ),
    peakActiveCount: Math.max(unique.length, integer(value.peakActiveCount, unique.length, 0, GAMEPLAY2_MAX_ACTIVE)),
    nextMilestoneWave: value.enabled === false ? 0 : getNextGameplay2Milestone(value.currentWave),
    lastEvent: clean(value.lastEvent, history.at(-1)?.type || base.lastEvent, 40),
    updatedAt: integer(value.updatedAt, now, 0),
    hazard: normalizeHazardState(value.hazard, base.mapId, now),
    pendingEvents: []
  };
}

function applyMilestone(state, wave, now = Date.now()) {
  const ids = Object.values(GAMEPLAY2_MUTATIONS);
  const activeIds = new Set(state.activeMutations.map((entry) => entry.id));
  const available = ids.filter((id) => !activeIds.has(id));

  if (state.activeMutations.length < GAMEPLAY2_MAX_ACTIVE && available.length) {
    const id = available[seededIndex(state.seed, available.length, `activate:${wave}:${state.revision}`)];
    const mutation = normalizeMutation({
      id,
      level: 1,
      activatedWave: wave,
      lastChangedWave: wave
    });
    state.activeMutations.push(mutation);
    return createEvent(state, 'ACTIVATED', mutation, wave, null, now);
  }

  if (!state.activeMutations.length) return null;
  const targetIndex = seededIndex(
    state.seed,
    state.activeMutations.length,
    `escalate:${wave}:${state.revision}`
  );
  const target = state.activeMutations[targetIndex];
  if (target.level < MAX_LEVEL) {
    const escalated = normalizeMutation({
      ...target,
      level: target.level + 1,
      lastChangedWave: wave
    });
    state.activeMutations[targetIndex] = escalated;
    return createEvent(state, 'ESCALATED', escalated, wave, null, now);
  }

  if (available.length) {
    const replacementId = available[seededIndex(state.seed, available.length, `rotate:${wave}:${state.revision}`)];
    const replacement = normalizeMutation({
      id: replacementId,
      level: 1,
      activatedWave: wave,
      lastChangedWave: wave
    });
    const replacedMutationId = target.id;
    state.activeMutations[targetIndex] = replacement;
    return createEvent(state, 'ROTATED', replacement, wave, replacedMutationId, now);
  }
  return null;
}

function combinedLevel(activeMutations, id) {
  return activeMutations.find((entry) => entry.id === id)?.level || 0;
}

export function getGameplay2MutationTuning(value = {}) {
  const state = normalizeGameplay2MutationState(value);
  const active = state.activeMutations;
  const blackoutLevel = combinedLevel(active, GAMEPLAY2_MUTATIONS.BLACKOUT);
  const eliteLevel = combinedLevel(active, GAMEPLAY2_MUTATIONS.ELITE_INFESTATION);
  const supplyLevel = combinedLevel(active, GAMEPLAY2_MUTATIONS.SUPPLY_CRISIS);
  const hazardLevel = combinedLevel(active, GAMEPLAY2_MUTATIONS.HAZARD_SHIFT);
  const berserkLevel = combinedLevel(active, GAMEPLAY2_MUTATIONS.BERSERK_THREATS);

  const blackoutBase = definition(GAMEPLAY2_MUTATIONS.BLACKOUT).tuning;
  const eliteBase = definition(GAMEPLAY2_MUTATIONS.ELITE_INFESTATION).tuning;
  const supplyBase = definition(GAMEPLAY2_MUTATIONS.SUPPLY_CRISIS).tuning;
  const hazardBase = definition(GAMEPLAY2_MUTATIONS.HAZARD_SHIFT).tuning;
  const berserkBase = definition(GAMEPLAY2_MUTATIONS.BERSERK_THREATS).tuning;

  return Object.freeze({
    patch: GAMEPLAY2_PATCH,
    enabled: state.enabled,
    currentWave: state.currentWave,
    activeIds: Object.freeze(active.map((entry) => entry.id)),
    rewardMultiplier: state.rewardMultiplier,
    enemy: Object.freeze({
      specialWeightScale: (eliteLevel ? Math.pow(eliteBase.specialWeightScale, 1 + (eliteLevel - 1) * 0.40) : 1)
        * (berserkLevel ? Math.pow(berserkBase.specialWeightScale, 1 + (berserkLevel - 1) * 0.25) : 1),
      eliteHealthScale: eliteLevel ? 1 + (eliteBase.eliteHealthScale - 1) * levelScale(eliteLevel) : 1,
      activeCapBonus: eliteLevel ? integer(eliteBase.activeCapBonus * eliteLevel, 0, 0, 4) : 0,
      speedScale: berserkLevel ? 1 + (berserkBase.enemySpeedScale - 1) * levelScale(berserkLevel) : 1,
      damageScale: berserkLevel ? 1 + (berserkBase.enemyDamageScale - 1) * levelScale(berserkLevel) : 1,
      attackRateScale: berserkLevel ? Math.max(0.72, 1 - (1 - berserkBase.attackRateScale) * levelScale(berserkLevel)) : 1,
      spawnIntervalScale: berserkLevel ? Math.max(0.78, 1 - (1 - berserkBase.spawnIntervalScale) * levelScale(berserkLevel)) : 1
    }),
    supply: Object.freeze({
      powerupDropScale: supplyLevel
        ? Math.max(0.16, Math.pow(supplyBase.powerupDropScale, 1 + (supplyLevel - 1) * 0.35))
        : 1,
      guaranteedSwarmResupply: true
    }),
    map: Object.freeze({
      blackout: blackoutLevel > 0,
      ambientScale: blackoutLevel
        ? Math.max(0.16, blackoutBase.ambientScale - (blackoutLevel - 1) * 0.10)
        : 1,
      directionalScale: blackoutLevel
        ? Math.max(0.20, blackoutBase.directionalScale - (blackoutLevel - 1) * 0.10)
        : 1,
      fogDensityScale: blackoutLevel
        ? blackoutBase.fogDensityScale + (blackoutLevel - 1) * 0.10
        : 1,
      bloomScale: blackoutLevel
        ? Math.max(0.42, blackoutBase.bloomScale - (blackoutLevel - 1) * 0.10)
        : 1,
      hazardShift: hazardLevel > 0,
      hazardIntervalScale: hazardLevel
        ? Math.max(0.42, hazardBase.hazardIntervalScale - (hazardLevel - 1) * 0.12)
        : 1,
      hazardWarningScale: hazardLevel
        ? Math.max(0.58, hazardBase.hazardWarningScale - (hazardLevel - 1) * 0.10)
        : 1,
      hazardDurationScale: hazardLevel
        ? hazardBase.hazardDurationScale + (hazardLevel - 1) * 0.16
        : 1,
      hazardRadiusScale: hazardLevel
        ? hazardBase.hazardRadiusScale + (hazardLevel - 1) * 0.08
        : 1,
      hazardDamageScale: hazardLevel
        ? hazardBase.hazardDamageScale + (hazardLevel - 1) * 0.12
        : 1
    })
  });
}

export class Gameplay2MutationDirector {
  constructor(value = null) {
    this.state = value
      ? normalizeGameplay2MutationState(value)
      : createGameplay2MutationState();
  }

  reset(details = {}) {
    this.state = createGameplay2MutationState(details);
    return this.getSnapshot(details.now);
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (!snapshot || snapshot.patch !== GAMEPLAY2_PATCH) return false;
    if (integer(snapshot.schema) !== GAMEPLAY2_SCHEMA) return false;
    if (this.state.runId && snapshot.runId && this.state.runId !== snapshot.runId) return false;
    this.state = normalizeGameplay2MutationState(snapshot, now);
    return true;
  }

  startWave(wave = 1, now = Date.now()) {
    const normalizedWave = integer(wave, 1, 1, 250);
    if (normalizedWave <= this.state.currentWave) {
      this.state.currentWave = Math.max(this.state.currentWave, normalizedWave);
      this.state.nextMilestoneWave = this.state.enabled
        ? getNextGameplay2Milestone(this.state.currentWave)
        : 0;
      return null;
    }
    this.state.currentWave = normalizedWave;
    this.state.updatedAt = integer(now, Date.now(), 0);
    let event = null;
    if (this.state.enabled && isGameplay2Milestone(normalizedWave)) {
      event = applyMilestone(this.state, normalizedWave, now);
    }
    this.state.nextMilestoneWave = this.state.enabled
      ? getNextGameplay2Milestone(normalizedWave)
      : 0;
    syncHazardState(this.state, now);
    return event ? clone(event) : null;
  }

  update(now = Date.now()) {
    syncHazardState(this.state, now);
    this.state.updatedAt = integer(now, Date.now(), 0);
    return this.getSnapshot(now);
  }

  advanceToWave(wave = 1, now = Date.now()) {
    const target = integer(wave, 1, 1, 250);
    for (let next = this.state.currentWave + 1; next <= target; next += 1) {
      this.startWave(next, now);
    }
    return this.getSnapshot(now);
  }

  getTuning() {
    return getGameplay2MutationTuning(this.state);
  }

  consumeEvents() {
    const events = this.state.pendingEvents.map(clone);
    this.state.pendingEvents.length = 0;
    return events;
  }

  getSnapshot(now = Date.now()) {
    syncHazardState(this.state, now);
    const normalized = normalizeGameplay2MutationState({
      ...this.state,
      updatedAt: integer(now, Date.now(), 0)
    }, now);
    return Object.freeze(clone(normalized));
  }
}

export function deriveGameplay2MutationReceipt({
  runId = '',
  mapId = 'grid_bunker',
  difficulty = 1,
  wave = 1,
  gameMode = 'survival',
  enabled = true,
  now = Date.now()
} = {}) {
  const director = new Gameplay2MutationDirector();
  director.reset({ runId, mapId, difficulty, gameMode, enabled, now });
  director.advanceToWave(wave, now);
  const snapshot = director.getSnapshot(now);
  return Object.freeze({
    patch: GAMEPLAY2_PATCH,
    activeIds: Object.freeze(snapshot.activeMutations.map((entry) => entry.id)),
    activeCount: snapshot.activeMutations.length,
    historyCount: snapshot.history.length,
    rewardMultiplier: snapshot.rewardMultiplier,
    peakRewardMultiplier: snapshot.peakRewardMultiplier,
    peakActiveCount: snapshot.peakActiveCount,
    revision: snapshot.revision
  });
}

export function getGameplay2MutationDefinition(id) {
  return clone(definition(id));
}
