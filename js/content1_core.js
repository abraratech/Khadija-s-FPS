// js/content1_core.js
// CONTENT.1 R1 — deterministic objective operations and encounter directives.

export const CONTENT1_PATCH = 'content1-r1-objective-operations-encounter-variety';
export const CONTENT1_SCHEMA = 1;
export const CONTENT1_OPERATION_XP = 160;
export const CONTENT1_MAX_ACTION_AMOUNT = 5;
export const CONTENT1_MAX_SEEN_EVENTS = 1024;

const MAP_OPERATIONS = Object.freeze({
  grid_bunker: Object.freeze({
    id: 'BUNKER_LOCKDOWN',
    label: 'Bunker Lockdown',
    description: 'Eliminate 35 hostiles while the bunker seals.',
    kind: 'KILL',
    target: 35,
    xp: CONTENT1_OPERATION_XP,
    anchor: Object.freeze({ x: 0, z: 0, radius: 14 })
  }),
  industrial_yard: Object.freeze({
    id: 'YARD_RECOVERY',
    label: 'Yard Recovery',
    description: 'Secure the recovery zone for 35 seconds.',
    kind: 'ZONE_TIME',
    target: 35,
    xp: CONTENT1_OPERATION_XP,
    anchor: Object.freeze({ x: 0, z: -4, radius: 11 })
  }),
  neon_depot: Object.freeze({
    id: 'NEON_BLACKOUT',
    label: 'Neon Blackout',
    description: 'Clear 3 rounds during the power disruption.',
    kind: 'WAVE_CLEAR',
    target: 3,
    xp: CONTENT1_OPERATION_XP,
    anchor: Object.freeze({ x: 0, z: 0, radius: 12 })
  }),
  parking_garage: Object.freeze({
    id: 'GARAGE_HOLD',
    label: 'Emergency Hold',
    description: 'Hold the emergency zone for 30 seconds.',
    kind: 'ZONE_TIME',
    target: 30,
    xp: CONTENT1_OPERATION_XP,
    anchor: Object.freeze({ x: 0, z: 8, radius: 10 })
  }),
  hospital_wing: Object.freeze({
    id: 'TRIAGE_RECOVERY',
    label: 'Triage Recovery',
    description: 'Complete 3 recovery actions or healthy wave clears.',
    kind: 'RECOVERY',
    target: 3,
    xp: CONTENT1_OPERATION_XP,
    anchor: Object.freeze({ x: 0, z: 0, radius: 10 })
  }),
  reactor_courtyard: Object.freeze({
    id: 'REACTOR_PURGE',
    label: 'Reactor Purge',
    description: 'Eliminate 2 elite hostiles.',
    kind: 'ELITE_KILL',
    target: 2,
    xp: CONTENT1_OPERATION_XP,
    anchor: Object.freeze({ x: 0, z: 0, radius: 13 })
  })
});

export const CONTENT1_ENCOUNTERS = Object.freeze([
  Object.freeze({
    id: 'RUSH_HOUR',
    label: 'Rush Hour',
    minWave: 2,
    announcement: 'ENCOUNTER · RUSH HOUR',
    weights: Object.freeze({ RUNNER: 1.75, CRAWLER: 1.35 }),
    elite: false
  }),
  Object.freeze({
    id: 'HEAVY_PRESSURE',
    label: 'Heavy Pressure',
    minWave: 3,
    announcement: 'ENCOUNTER · HEAVY PRESSURE',
    weights: Object.freeze({ BRUTE: 1.85, SHAMBLER: 0.86 }),
    elite: false
  }),
  Object.freeze({
    id: 'VOLATILE_SURGE',
    label: 'Volatile Surge',
    minWave: 4,
    announcement: 'ENCOUNTER · VOLATILE SURGE',
    weights: Object.freeze({ EXPLODER: 1.95, RUNNER: 1.12 }),
    elite: false
  }),
  Object.freeze({
    id: 'TOXIC_FRONT',
    label: 'Toxic Front',
    minWave: 5,
    announcement: 'ENCOUNTER · TOXIC FRONT',
    weights: Object.freeze({ RANGED: 2.05, CRAWLER: 1.12 }),
    elite: false
  }),
  Object.freeze({
    id: 'ELITE_HUNT',
    label: 'Elite Hunt',
    minWave: 6,
    announcement: 'ENCOUNTER · ELITE HUNT',
    weights: Object.freeze({ BRUTE: 1.35, RANGED: 1.2, SHAMBLER: 0.9 }),
    elite: true
  })
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

function normalizeLiveDirective(value = null) {
  if (!value || typeof value !== 'object') return null;
  const seasonId = cleanText(value.seasonId, '', 80);
  const manifestRevision = cleanText(value.manifestRevision, '', 160);
  if (!seasonId || !manifestRevision) return null;
  return {
    patch: cleanText(value.patch, 'live1-r1-seasonal-operations-rotating-events', 100),
    schema: integer(value.schema, 1, 1, 10),
    seasonId,
    seasonLabel: cleanText(value.seasonLabel, seasonId.replace(/_/g, ' '), 120),
    manifestRevision,
    validUntil: integer(value.validUntil, 0),
    featuredArenaId: cleanText(value.featuredArenaId, '', 80),
    featuredOperationId: cleanText(value.featuredOperationId, '', 80),
    featuredOperationMapId: cleanText(value.featuredOperationMapId, '', 80),
    featuredEncounterId: cleanText(value.featuredEncounterId, '', 80),
    featuredEncounterLabel: cleanText(value.featuredEncounterLabel, '', 120),
    isFeaturedArena: value.isFeaturedArena === true,
    isFeaturedOperationArena: value.isFeaturedOperationArena === true
  };
}

export function getContent1OperationDefinition(mapId = 'grid_bunker') {
  const normalized = cleanText(mapId, 'grid_bunker', 80).toLowerCase();
  return clone(MAP_OPERATIONS[normalized] || MAP_OPERATIONS.grid_bunker);
}

export function selectContent1Encounter({
  runId = 'run',
  mapId = 'grid_bunker',
  wave = 1,
  previousId = ''
} = {}) {
  const normalizedWave = integer(wave, 1, 1, 250);
  if (normalizedWave < 2) return null;
  const eligible = CONTENT1_ENCOUNTERS.filter((entry) => entry.minWave <= normalizedWave);
  if (!eligible.length) return null;
  const seed = hashText(`${cleanText(runId)}:${cleanText(mapId)}:${normalizedWave}`);
  let selected = eligible[seed % eligible.length];
  if (selected.id === previousId && eligible.length > 1) {
    selected = eligible[(seed + 1) % eligible.length];
  }
  return clone({
    ...selected,
    wave: normalizedWave,
    eventId: `${cleanText(runId, 'run', 120)}:encounter:${normalizedWave}:${selected.id}`
  });
}

export function createContent1State({
  runId = 'run',
  mapId = 'grid_bunker',
  difficulty = 1,
  authorityEpoch = 0,
  live = null,
  now = Date.now()
} = {}) {
  const operation = getContent1OperationDefinition(mapId);
  return {
    patch: CONTENT1_PATCH,
    schema: CONTENT1_SCHEMA,
    runId: cleanText(runId, 'run', 160),
    mapId: cleanText(mapId, 'grid_bunker', 80).toLowerCase(),
    difficulty: Math.max(0.5, Math.min(2, finite(difficulty, 1))),
    authorityEpoch: integer(authorityEpoch, 0),
    live: normalizeLiveDirective(live),
    active: true,
    startedAt: integer(now, Date.now()),
    updatedAt: integer(now, Date.now()),
    operation: {
      ...operation,
      progress: 0,
      completed: false,
      completedAt: 0,
      completionId: null,
      contributors: {}
    },
    encounter: null,
    lastEncounterId: '',
    elite: {
      pending: false,
      spawned: 0,
      defeated: 0,
      activeIds: []
    },
    lastEvent: 'OPERATION ASSIGNED',
    events: []
  };
}

function normalizeOperation(operation, mapId) {
  const definition = getContent1OperationDefinition(mapId);
  const source = operation && typeof operation === 'object' ? operation : {};
  return {
    ...definition,
    progress: Math.min(
      definition.target,
      Math.max(0, finite(source.progress, 0))
    ),
    completed: source.completed === true,
    completedAt: integer(source.completedAt, 0),
    completionId: source.completionId ? cleanText(source.completionId, '', 220) : null,
    contributors: Object.fromEntries(
      Object.entries(source.contributors || {})
        .slice(0, 8)
        .map(([key, value]) => [cleanText(key, '', 160), integer(value, 0, 0, 99999)])
        .filter(([key]) => Boolean(key))
    )
  };
}

export function normalizeContent1State(value = {}, now = Date.now()) {
  const mapId = cleanText(value.mapId, 'grid_bunker', 80).toLowerCase();
  const state = {
    patch: CONTENT1_PATCH,
    schema: CONTENT1_SCHEMA,
    runId: cleanText(value.runId, 'run', 160),
    mapId,
    difficulty: Math.max(0.5, Math.min(2, finite(value.difficulty, 1))),
    authorityEpoch: integer(value.authorityEpoch, 0),
    live: normalizeLiveDirective(value.live),
    active: value.active !== false,
    startedAt: integer(value.startedAt, now),
    updatedAt: integer(value.updatedAt, now),
    operation: normalizeOperation(value.operation, mapId),
    encounter: value.encounter && typeof value.encounter === 'object'
      ? clone(value.encounter)
      : null,
    lastEncounterId: cleanText(value.lastEncounterId, '', 80),
    elite: {
      pending: value.elite?.pending === true,
      spawned: integer(value.elite?.spawned, 0, 0, 100),
      defeated: integer(value.elite?.defeated, 0, 0, 100),
      activeIds: Array.isArray(value.elite?.activeIds)
        ? value.elite.activeIds.map((entry) => cleanText(entry, '', 160)).filter(Boolean).slice(0, 8)
        : []
    },
    lastEvent: cleanText(value.lastEvent, 'IDLE', 160),
    events: []
  };
  if (state.operation.completed && !state.operation.completionId) {
    state.operation.completionId = `${state.runId}:operation:${state.operation.id}`;
  }
  return state;
}

function actionAmount(action) {
  return Math.max(
    0,
    Math.min(CONTENT1_MAX_ACTION_AMOUNT, finite(action?.amount, 1))
  );
}

function qualifiesOperationAction(operation, action) {
  const kind = cleanText(action.kind, '', 40).toUpperCase();
  if (operation.kind === 'KILL') return kind === 'KILL';
  if (operation.kind === 'ZONE_TIME') return kind === 'ZONE_TICK';
  if (operation.kind === 'WAVE_CLEAR') return kind === 'WAVE_CLEAR';
  if (operation.kind === 'ELITE_KILL') return kind === 'ELITE_KILL';
  if (operation.kind === 'RECOVERY') {
    if (kind === 'REVIVE') return true;
    if (kind === 'WAVE_CLEAR') {
      return finite(action.healthRatio, 0) >= 0.65;
    }
  }
  return false;
}

export class Content1Authority {
  constructor(value = null) {
    this.state = normalizeContent1State(value || createContent1State());
    this.seenEvents = new Set();
    this.pendingEvents = [];
  }

  reset(details = {}) {
    this.state = createContent1State(details);
    this.seenEvents.clear();
    this.pendingEvents.length = 0;
    return this.getSnapshot(details.now);
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (!snapshot || snapshot.patch !== CONTENT1_PATCH) return false;
    if (integer(snapshot.schema, 0) !== CONTENT1_SCHEMA) return false;
    if (
      this.state.runId
      && snapshot.runId
      && this.state.runId !== snapshot.runId
    ) return false;
    this.state = normalizeContent1State(snapshot, now);
    return true;
  }

  startWave(wave, now = Date.now()) {
    if (!this.state.active) return null;
    const normalizedWave = integer(wave, 1, 1, 250);
    let encounter = selectContent1Encounter({
      runId: this.state.runId,
      mapId: this.state.mapId,
      wave: normalizedWave,
      previousId: this.state.lastEncounterId
    });
    const featuredId = cleanText(
      this.state.live?.featuredEncounterId,
      '',
      80
    );
    if (featuredId && normalizedWave >= 2 && normalizedWave % 3 === 0) {
      const featured = CONTENT1_ENCOUNTERS.find((entry) => (
        entry.id === featuredId && entry.minWave <= normalizedWave
      ));
      if (featured) {
        encounter = clone({
          ...featured,
          wave: normalizedWave,
          liveFeatured: true,
          eventId: `${this.state.runId}:live:${this.state.live.manifestRevision}:${normalizedWave}:${featured.id}`
        });
      }
    }
    this.state.encounter = encounter;
    this.state.lastEncounterId = encounter?.id || '';
    this.state.elite.pending = encounter?.elite === true;
    this.state.updatedAt = integer(now, Date.now());
    if (encounter) {
      const event = {
        type: 'ENCOUNTER_STARTED',
        eventId: encounter.eventId,
        encounter: clone(encounter),
        at: this.state.updatedAt
      };
      this.pendingEvents.push(event);
      this.state.lastEvent = encounter.announcement;
    }
    return clone(encounter);
  }

  markEliteSpawned(enemyId, now = Date.now()) {
    if (!this.state.active || !this.state.elite.pending) return false;
    const id = cleanText(enemyId, '', 160);
    if (!id) return false;
    if (!this.state.elite.activeIds.includes(id)) {
      this.state.elite.activeIds.push(id);
      this.state.elite.activeIds = this.state.elite.activeIds.slice(-8);
    }
    this.state.elite.pending = false;
    this.state.elite.spawned += 1;
    this.state.updatedAt = integer(now, Date.now());
    this.state.lastEvent = 'ELITE TARGET DEPLOYED';
    this.pendingEvents.push({
      type: 'ELITE_SPAWNED',
      eventId: `${this.state.runId}:elite:${id}`,
      enemyId: id,
      at: this.state.updatedAt
    });
    return true;
  }

  recordAction(action = {}) {
    if (!this.state.active || this.state.operation.completed) return false;
    const eventId = cleanText(action.eventId, '', 220);
    if (!eventId || this.seenEvents.has(eventId)) return false;
    this.seenEvents.add(eventId);
    if (this.seenEvents.size > CONTENT1_MAX_SEEN_EVENTS) {
      this.seenEvents = new Set([...this.seenEvents].slice(-512));
    }

    const kind = cleanText(action.kind, '', 40).toUpperCase();
    if (!kind) return false;
    if (kind === 'ELITE_KILL') {
      const enemyId = cleanText(action.enemyId, '', 160);
      this.state.elite.activeIds = this.state.elite.activeIds.filter((id) => id !== enemyId);
      this.state.elite.defeated += 1;
    }

    if (!qualifiesOperationAction(this.state.operation, action)) return true;

    const amount = actionAmount(action);
    if (amount <= 0) return true;
    const actorId = cleanText(action.actorId, 'local', 160);
    this.state.operation.progress = Math.min(
      this.state.operation.target,
      this.state.operation.progress + amount
    );
    this.state.operation.contributors[actorId] = integer(
      this.state.operation.contributors[actorId],
      0
    ) + amount;
    this.state.updatedAt = integer(action.at, Date.now());
    this.state.lastEvent = `${this.state.operation.label} ${Math.floor(this.state.operation.progress)}/${this.state.operation.target}`;

    if (this.state.operation.progress >= this.state.operation.target) {
      this.state.operation.completed = true;
      this.state.operation.completedAt = this.state.updatedAt;
      this.state.operation.completionId = `${this.state.runId}:operation:${this.state.operation.id}`;
      this.state.lastEvent = `${this.state.operation.label} COMPLETE`;
      this.pendingEvents.push({
        type: 'OPERATION_COMPLETED',
        eventId: this.state.operation.completionId,
        operation: clone(this.state.operation),
        at: this.state.updatedAt
      });
    }
    return true;
  }

  update(now = Date.now()) {
    this.state.updatedAt = integer(now, Date.now());
    return this.getSnapshot(now);
  }

  consumeEvents() {
    const events = this.pendingEvents.map(clone);
    this.pendingEvents.length = 0;
    return events;
  }

  getEncounterDirective() {
    const encounter = this.state.encounter;
    return Object.freeze({
      patch: CONTENT1_PATCH,
      encounterId: encounter?.id || 'NONE',
      label: encounter?.label || 'Standard Pressure',
      wave: integer(encounter?.wave, 1, 1),
      weightMultipliers: Object.freeze({ ...(encounter?.weights || {}) }),
      elitePending: this.state.elite.pending === true,
      eliteActiveIds: Object.freeze([...(this.state.elite.activeIds || [])])
    });
  }

  getSnapshot(now = Date.now()) {
    const snapshot = normalizeContent1State({
      ...this.state,
      updatedAt: integer(now, Date.now())
    }, now);
    snapshot.events = undefined;
    return Object.freeze(clone(snapshot));
  }
}
