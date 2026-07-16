// js/multiplayer/coop2_core.js
// COOP.2 R1 — host-authoritative roles, shared contracts and team cohesion.

export const COOP2_PATCH = 'coop2-r1-roles-shared-contracts-teamplay';
export const COOP2_SCHEMA = 1;
export const COOP2_MAX_COHESION = 100;
export const COOP2_CONTRACT_XP = 180;
export const COOP2_ROLE_STORAGE_KEY = 'ka_coop2_role_v1';

export const COOP2_ROLES = Object.freeze({
  VANGUARD: Object.freeze({
    id: 'VANGUARD',
    label: 'Vanguard',
    shortLabel: 'VGD',
    description: 'Frontline rescue cover and pressure.',
    accent: '#ff6b45',
    reviveHoldMultiplier: 1,
    reviveHealthRatio: 0.44,
    reviveProtectionMs: 2200,
    pingDurationMultiplier: 1
  }),
  FIELD_MEDIC: Object.freeze({
    id: 'FIELD_MEDIC',
    label: 'Field Medic',
    shortLabel: 'MED',
    description: 'Faster recovery and safer revives.',
    accent: '#3df29b',
    reviveHoldMultiplier: 0.80,
    reviveHealthRatio: 0.52,
    reviveProtectionMs: 3200,
    pingDurationMultiplier: 1
  }),
  RECON: Object.freeze({
    id: 'RECON',
    label: 'Recon',
    shortLabel: 'RCN',
    description: 'Longer tactical marks and objective awareness.',
    accent: '#47c8ff',
    reviveHoldMultiplier: 1,
    reviveHealthRatio: 0.44,
    reviveProtectionMs: 2200,
    pingDurationMultiplier: 1.35
  }),
  SUPPORT: Object.freeze({
    id: 'SUPPORT',
    label: 'Support',
    shortLabel: 'SUP',
    description: 'Team utility and cohesion specialist.',
    accent: '#f6cf55',
    reviveHoldMultiplier: 0.92,
    reviveHealthRatio: 0.46,
    reviveProtectionMs: 2500,
    pingDurationMultiplier: 1.12
  })
});

export const COOP2_CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'JOINT_SUPPRESSION',
    label: 'Joint Suppression',
    description: 'Eliminate 30 hostiles as a team.',
    kind: 'KILL',
    target: 30,
    xp: COOP2_CONTRACT_XP
  }),
  Object.freeze({
    id: 'NO_ONE_LEFT',
    label: 'No One Left Behind',
    description: 'Complete one teammate rescue.',
    kind: 'REVIVE',
    target: 1,
    xp: COOP2_CONTRACT_XP
  }),
  Object.freeze({
    id: 'STEADY_ADVANCE',
    label: 'Steady Advance',
    description: 'Clear three waves without a team elimination.',
    kind: 'WAVE_CLEAR',
    target: 3,
    xp: COOP2_CONTRACT_XP
  }),
  Object.freeze({
    id: 'FIELD_COORDINATION',
    label: 'Field Coordination',
    description: 'Complete two objectives or run challenges as a team.',
    kind: 'TEAM_OBJECTIVE',
    target: 2,
    xp: COOP2_CONTRACT_XP
  })
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(max, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', max = 120) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeCoop2Role(value, fallback = 'VANGUARD') {
  const roleId = cleanText(value, fallback, 40).toUpperCase();
  return COOP2_ROLES[roleId] ? roleId : fallback;
}

export function getCoop2RoleDefinition(value) {
  return COOP2_ROLES[normalizeCoop2Role(value)] || COOP2_ROLES.VANGUARD;
}

export function getCoop2RevivePolicy(roleValue) {
  const role = getCoop2RoleDefinition(roleValue);
  return Object.freeze({
    roleId: role.id,
    holdMultiplier: role.reviveHoldMultiplier,
    healthRatio: role.reviveHealthRatio,
    protectionMs: role.reviveProtectionMs
  });
}


export function getCoop2CohesionPolicy(value) {
  const cohesion = integer(value, 0, 0, COOP2_MAX_COHESION);
  if (cohesion >= 75) {
    return Object.freeze({
      tier: 'RALLY',
      label: 'Rally',
      pingDurationMultiplier: 1.15,
      reviveProgressGraceBonusMs: 300,
      reviveProtectionBonusMs: 400
    });
  }
  if (cohesion >= 50) {
    return Object.freeze({
      tier: 'STEADY',
      label: 'Steady',
      pingDurationMultiplier: 1.10,
      reviveProgressGraceBonusMs: 200,
      reviveProtectionBonusMs: 200
    });
  }
  if (cohesion >= 25) {
    return Object.freeze({
      tier: 'LINKED',
      label: 'Linked',
      pingDurationMultiplier: 1.05,
      reviveProgressGraceBonusMs: 100,
      reviveProtectionBonusMs: 0
    });
  }
  return Object.freeze({
    tier: 'FORMING',
    label: 'Forming',
    pingDurationMultiplier: 1,
    reviveProgressGraceBonusMs: 0,
    reviveProtectionBonusMs: 0
  });
}

export function chooseComplementaryBotRole(roleValues = []) {
  const claimed = new Set(
    (Array.isArray(roleValues) ? roleValues : [])
      .map((value) => normalizeCoop2Role(value))
  );
  const order = ['FIELD_MEDIC', 'SUPPORT', 'RECON', 'VANGUARD'];
  return order.find((roleId) => !claimed.has(roleId)) || 'SUPPORT';
}

export function selectCoop2Contract({
  runId = '',
  mapId = '',
  difficulty = 1
} = {}) {
  const seed = `${cleanText(runId, 'run', 120)}:${cleanText(mapId, 'map', 80)}:${finite(difficulty, 1)}`;
  return clone(COOP2_CONTRACTS[hashText(seed) % COOP2_CONTRACTS.length]);
}

function defaultContractState(details = {}) {
  const definition = selectCoop2Contract(details);
  return {
    ...definition,
    progress: 0,
    completed: false,
    completedAt: 0,
    completionId: null,
    contributors: {}
  };
}

function normalizePlayer(entry = {}) {
  return {
    playerId: cleanText(entry.playerId, '', 160),
    displayName: cleanText(entry.displayName, 'Operative', 24),
    roleId: normalizeCoop2Role(entry.roleId),
    connected: entry.connected !== false,
    isBot: entry.isBot === true,
    joinedAt: integer(entry.joinedAt, 0),
    contribution: integer(entry.contribution, 0, 0, 999999),
    lastActionAt: integer(entry.lastActionAt, 0)
  };
}

function actionIncrement(contract, action) {
  const kind = cleanText(action.kind, '', 40).toUpperCase();
  // Every accepted network action represents one authored gameplay event.
  // This keeps a client from completing a shared contract by inflating amount.
  if (contract.kind === 'KILL' && kind === 'KILL') return 1;
  if (contract.kind === 'REVIVE' && kind === 'REVIVE') return 1;
  if (
    contract.kind === 'WAVE_CLEAR'
    && kind === 'WAVE_CLEAR'
    && action.teamEliminated !== true
  ) return 1;
  if (
    contract.kind === 'TEAM_OBJECTIVE'
    && ['OBJECTIVE', 'CHALLENGE'].includes(kind)
  ) return 1;
  return 0;
}

function cohesionGain(action, switchedActor) {
  const kind = cleanText(action.kind, '', 40).toUpperCase();
  let gain = 0;
  if (kind === 'REVIVE') gain = 26;
  else if (kind === 'ASSIST') gain = 12;
  else if (kind === 'TACTICAL_PING') gain = 6;
  else if (kind === 'OBJECTIVE' || kind === 'CHALLENGE') gain = 14;
  else if (kind === 'WAVE_CLEAR') gain = 10;
  else if (kind === 'KILL') gain = switchedActor ? 3 : 1;
  return gain;
}

export class Coop2Authority {
  constructor() {
    this.events = [];
    this.processedEventIds = new Set();
    this.reset();
  }

  reset({
    runId = null,
    mapId = 'unknown',
    difficulty = 1,
    authorityEpoch = 0,
    now = 0
  } = {}) {
    this.runId = cleanText(runId, '', 160) || null;
    this.mapId = cleanText(mapId, 'unknown', 80);
    this.difficulty = Math.max(0.5, Math.min(2, finite(difficulty, 1)));
    this.authorityEpoch = integer(authorityEpoch, 0);
    this.startedAt = integer(now, 0);
    this.updatedAt = integer(now, 0);
    this.players = new Map();
    this.contract = defaultContractState({
      runId: this.runId,
      mapId: this.mapId,
      difficulty: this.difficulty
    });
    this.cohesion = 0;
    this.lastCohesionAt = integer(now, 0);
    this.lastActorId = null;
    this.teamEliminated = false;
    this.events.length = 0;
    this.processedEventIds.clear();
    return this.getSnapshot(now);
  }

  ensurePlayer(playerId, details = {}) {
    const id = cleanText(playerId, '', 160);
    if (!id) return null;
    const current = this.players.get(id);
    const next = normalizePlayer({
      ...(current || {}),
      ...details,
      playerId: id
    });
    if (!next.joinedAt) next.joinedAt = integer(details.now, Date.now());
    this.players.set(id, next);
    return next;
  }

  setConnected(playerId, connected, now = Date.now()) {
    const player = this.ensurePlayer(playerId, { now });
    if (!player) return false;
    player.connected = connected === true;
    player.lastActionAt = integer(now, player.lastActionAt);
    return true;
  }

  assignRole(playerId, roleId, {
    displayName = null,
    connected = true,
    isBot = false,
    now = Date.now()
  } = {}) {
    const player = this.ensurePlayer(playerId, {
      ...(displayName ? { displayName } : {}),
      connected,
      isBot,
      now
    });
    if (!player) return false;
    const normalized = normalizeCoop2Role(roleId);
    if (player.roleId === normalized) return false;
    player.roleId = normalized;
    player.lastActionAt = integer(now, player.lastActionAt);
    this.updatedAt = integer(now, this.updatedAt);
    this.events.push({
      type: 'ROLE_ASSIGNED',
      playerId: player.playerId,
      roleId: normalized,
      at: integer(now, Date.now())
    });
    return true;
  }

  ensureComplementaryBot(botPlayerId, {
    displayName = 'ARENA WINGMATE',
    now = Date.now()
  } = {}) {
    const humanRoles = Array.from(this.players.values())
      .filter((entry) => entry.isBot !== true)
      .map((entry) => entry.roleId);
    return this.assignRole(
      botPlayerId,
      chooseComplementaryBotRole(humanRoles),
      { displayName, connected: true, isBot: true, now }
    );
  }

  recordAction(action = {}) {
    if (!this.runId) return false;
    const actorId = cleanText(action.actorId, '', 160);
    if (!actorId) return false;
    const eventId = cleanText(
      action.eventId,
      `${actorId}:${action.kind}:${integer(action.at, Date.now())}`,
      220
    );
    if (this.processedEventIds.has(eventId)) return false;
    this.processedEventIds.add(eventId);
    if (this.processedEventIds.size > 1500) {
      const keep = Array.from(this.processedEventIds).slice(-900);
      this.processedEventIds = new Set(keep);
    }

    const now = integer(action.at, Date.now());
    const actor = this.ensurePlayer(actorId, {
      displayName: action.displayName,
      roleId: action.roleId,
      connected: true,
      isBot: action.isBot === true,
      now
    });
    if (!actor) return false;

    const increment = this.contract.completed
      ? 0
      : actionIncrement(this.contract, action);
    actor.contribution += Math.max(0, increment);
    actor.lastActionAt = now;
    if (increment > 0) {
      this.contract.progress = Math.min(
        this.contract.target,
        this.contract.progress + increment
      );
      this.contract.contributors[actorId] = integer(
        this.contract.contributors[actorId],
        0
      ) + increment;
    }

    const switchedActor = Boolean(this.lastActorId && this.lastActorId !== actorId);
    let gain = cohesionGain(action, switchedActor);
    if (actor.roleId === 'SUPPORT' && gain > 0) gain = Math.ceil(gain * 1.15);
    if (
      actor.roleId === 'VANGUARD'
      && ['KILL', 'ASSIST'].includes(cleanText(action.kind, '', 40).toUpperCase())
      && gain > 0
    ) gain = Math.ceil(gain * 1.25);
    this.cohesion = Math.min(COOP2_MAX_COHESION, this.cohesion + gain);
    this.lastCohesionAt = now;
    this.lastActorId = actorId;
    this.updatedAt = now;

    if (
      !this.contract.completed
      && this.contract.progress >= this.contract.target
    ) {
      this.contract.completed = true;
      this.contract.completedAt = now;
      this.contract.completionId = [
        this.runId,
        this.contract.id,
        now
      ].join(':');
      this.events.push({
        type: 'CONTRACT_COMPLETED',
        contract: clone(this.contract),
        at: now
      });
    }
    return increment > 0 || gain > 0;
  }

  setTeamEliminated(value, now = Date.now()) {
    this.teamEliminated = value === true;
    this.updatedAt = integer(now, this.updatedAt);
  }

  update(now = Date.now()) {
    const current = integer(now, Date.now());
    const idleMs = Math.max(0, current - this.lastCohesionAt);
    if (idleMs > 8000 && this.cohesion > 0) {
      const decay = Math.floor((idleMs - 8000) / 4000);
      if (decay > 0) {
        this.cohesion = Math.max(0, this.cohesion - decay);
        this.lastCohesionAt += decay * 4000;
      }
    }
    this.updatedAt = current;
    return this.getSnapshot(current);
  }

  consumeEvents() {
    return this.events.splice(0);
  }

  replaceSnapshot(snapshot = {}) {
    if (!snapshot || Number(snapshot.schema) !== COOP2_SCHEMA) return false;
    this.runId = cleanText(snapshot.runId, '', 160) || this.runId;
    this.mapId = cleanText(snapshot.mapId, this.mapId, 80);
    this.difficulty = Math.max(0.5, Math.min(2, finite(snapshot.difficulty, 1)));
    this.authorityEpoch = integer(snapshot.authorityEpoch, this.authorityEpoch);
    this.startedAt = integer(snapshot.startedAt, this.startedAt);
    this.updatedAt = integer(snapshot.updatedAt, this.updatedAt);
    this.cohesion = integer(snapshot.cohesion, 0, 0, COOP2_MAX_COHESION);
    this.lastCohesionAt = integer(snapshot.lastCohesionAt, this.updatedAt);
    this.lastActorId = cleanText(snapshot.lastActorId, '', 160) || null;
    this.teamEliminated = snapshot.teamEliminated === true;
    const definition = COOP2_CONTRACTS.find(
      (entry) => entry.id === snapshot.contract?.id
    ) || selectCoop2Contract({
      runId: this.runId,
      mapId: this.mapId,
      difficulty: this.difficulty
    });
    this.contract = {
      ...clone(definition),
      progress: Math.min(
        definition.target,
        integer(snapshot.contract?.progress, 0)
      ),
      completed: snapshot.contract?.completed === true,
      completedAt: integer(snapshot.contract?.completedAt, 0),
      completionId: cleanText(snapshot.contract?.completionId, '', 220) || null,
      contributors: (
        snapshot.contract?.contributors
        && typeof snapshot.contract.contributors === 'object'
      ) ? { ...snapshot.contract.contributors } : {}
    };
    this.players = new Map();
    (Array.isArray(snapshot.players) ? snapshot.players : []).forEach((entry) => {
      const player = normalizePlayer(entry);
      if (player.playerId) this.players.set(player.playerId, player);
    });
    return true;
  }

  getSnapshot(now = Date.now()) {
    return {
      patch: COOP2_PATCH,
      schema: COOP2_SCHEMA,
      runId: this.runId,
      mapId: this.mapId,
      difficulty: this.difficulty,
      authorityEpoch: this.authorityEpoch,
      startedAt: this.startedAt,
      updatedAt: integer(now, this.updatedAt),
      cohesion: this.cohesion,
      lastCohesionAt: this.lastCohesionAt,
      lastActorId: this.lastActorId,
      teamEliminated: this.teamEliminated,
      contract: clone(this.contract),
      players: Array.from(this.players.values()).map((entry) => ({ ...entry }))
    };
  }
}
