// GAMEPLAY.4 R1 — deterministic expanded boss encounters.

export const GAMEPLAY4_PATCH = 'gameplay4-r1-expanded-boss-encounters';
export const GAMEPLAY4_SCHEMA = 1;

export const GAMEPLAY4_BOSS_STATUS = Object.freeze({
  INACTIVE: 'INACTIVE',
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  DEFEATED: 'DEFEATED'
});

export const GAMEPLAY4_ABILITY_STATE = Object.freeze({
  IDLE: 'IDLE',
  WARNING: 'WARNING',
  ACTIVE: 'ACTIVE',
  VULNERABLE: 'VULNERABLE',
  RECOVERY: 'RECOVERY'
});

export const GAMEPLAY4_PROFILES = Object.freeze({
  JUGGERNAUT: 'JUGGERNAUT',
  MATRIARCH: 'MATRIARCH',
  DETONATOR: 'DETONATOR'
});

const MAX_EVENTS = 160;
const PROFILE_DEFINITIONS = Object.freeze({
  [GAMEPLAY4_PROFILES.JUGGERNAUT]: Object.freeze({
    id: GAMEPLAY4_PROFILES.JUGGERNAUT,
    label: 'Siege Juggernaut',
    color: '#ff8a42',
    abilities: Object.freeze([
      ability('GROUND_SLAM', 'GROUND SLAM', 5.6, 18, 1300, 360, 2500, 900),
      ability('SHOCKWAVE', 'SHOCKWAVE', 7.0, 23, 1150, 420, 2700, 800),
      ability('SIEGE_PULSE', 'SIEGE PULSE', 5.0, 29, 950, 460, 2900, 700)
    ])
  }),
  [GAMEPLAY4_PROFILES.MATRIARCH]: Object.freeze({
    id: GAMEPLAY4_PROFILES.MATRIARCH,
    label: 'Spitter Matriarch',
    color: '#9cff42',
    abilities: Object.freeze([
      ability('TOXIC_VOLLEY', 'TOXIC VOLLEY', 4.5, 14, 1350, 500, 2350, 850),
      ability('SPORE_SURGE', 'SPORE SURGE', 5.5, 19, 1200, 560, 2550, 750),
      ability('CONTAMINATION_BLOOM', 'CONTAMINATION BLOOM', 6.3, 24, 1000, 620, 2800, 650)
    ])
  }),
  [GAMEPLAY4_PROFILES.DETONATOR]: Object.freeze({
    id: GAMEPLAY4_PROFILES.DETONATOR,
    label: 'Volatile Detonator',
    color: '#ff4b2b',
    abilities: Object.freeze([
      ability('VOLATILE_BURST', 'VOLATILE BURST', 4.6, 20, 1200, 380, 2300, 850),
      ability('BLAST_CHAIN', 'BLAST CHAIN', 5.7, 25, 1050, 430, 2500, 750),
      ability('MELTDOWN_RING', 'MELTDOWN RING', 7.2, 31, 900, 500, 2850, 650)
    ])
  })
});

function ability(id, label, radius, damage, warningMs, activeMs, vulnerableMs, recoveryMs) {
  return Object.freeze({ id, label, radius, damage, warningMs, activeMs, vulnerableMs, recoveryMs });
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  return Math.round(finite(value, fallback));
}

function clean(value, fallback = '', max = 180) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function point(value = null, fallback = { x: 0, y: 0, z: 0 }) {
  return Object.freeze({
    x: finite(value?.x, fallback.x),
    y: finite(value?.y, fallback.y),
    z: finite(value?.z, fallback.z)
  });
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

function normalizeGameMode(value) {
  const mode = clean(value, 'survival', 60).toLowerCase();
  return mode.includes('pvp') ? 'pvp' : 'survival';
}

function normalizeRole(value) {
  const role = clean(value, 'VANGUARD', 40).toUpperCase();
  return ['VANGUARD', 'FIELD_MEDIC', 'RECON', 'SUPPORT'].includes(role)
    ? role
    : 'VANGUARD';
}

function teamDamageScale(teamSize = 1) {
  const count = Math.max(1, Math.min(4, integer(teamSize, 1)));
  return [0.86, 1, 1.08, 1.14][count - 1];
}

function profileFromBoss({ bossId = '', label = '', enemyType = '' } = {}) {
  const token = `${bossId} ${label} ${enemyType}`.toUpperCase();
  if (/MATRIARCH|BIOHAZARD|PLAGUE|HUNTER-KERNEL|RANGED/.test(token)) {
    return PROFILE_DEFINITIONS[GAMEPLAY4_PROFILES.MATRIARCH];
  }
  if (/DEMOLITION|DETONAT|EXPLODER|VOLATILE|CHIEF/.test(token)) {
    return PROFILE_DEFINITIONS[GAMEPLAY4_PROFILES.DETONATOR];
  }
  return PROFILE_DEFINITIONS[GAMEPLAY4_PROFILES.JUGGERNAUT];
}

function normalizeAbility(value = null, profile = PROFILE_DEFINITIONS[GAMEPLAY4_PROFILES.JUGGERNAUT]) {
  if (!value || typeof value !== 'object') return null;
  const phaseIndex = Math.max(0, Math.min(2, integer(value.phaseIndex)));
  const definition = profile.abilities[phaseIndex] || profile.abilities[0];
  return {
    serial: Math.max(1, integer(value.serial, 1)),
    id: clean(value.id, definition.id, 80).toUpperCase(),
    label: clean(value.label, definition.label, 100).toUpperCase(),
    state: clean(value.state, GAMEPLAY4_ABILITY_STATE.IDLE, 30).toUpperCase(),
    phaseIndex,
    startedAt: Math.max(0, finite(value.startedAt)),
    endsAt: Math.max(0, finite(value.endsAt)),
    origin: point(value.origin),
    target: point(value.target),
    targetPlayerId: clean(value.targetPlayerId, '', 160),
    targetRoleId: normalizeRole(value.targetRoleId),
    radius: Math.max(2, Math.min(12, finite(value.radius, definition.radius))),
    damage: Math.max(1, Math.min(60, finite(value.damage, definition.damage))),
    interruptMeter: Math.max(0, Math.min(100, finite(value.interruptMeter))),
    committed: value.committed === true,
    damageApplied: value.damageApplied === true
  };
}

function createInactiveState(details = {}) {
  const now = integer(details.now, Date.now());
  return {
    patch: GAMEPLAY4_PATCH,
    schema: GAMEPLAY4_SCHEMA,
    gameMode: normalizeGameMode(details.gameMode),
    active: false,
    status: GAMEPLAY4_BOSS_STATUS.INACTIVE,
    runId: clean(details.runId, 'run', 180),
    mapId: clean(details.mapId, 'grid_bunker', 80),
    bossId: '',
    bossLabel: '',
    enemyId: '',
    enemyType: '',
    profileId: '',
    profileLabel: '',
    profileColor: '#ff8a42',
    phase: 1,
    phaseCount: 3,
    phaseTransitions: 0,
    teamSize: 1,
    maxHealth: 0,
    health: 0,
    abilitySerial: 0,
    ability: null,
    nextAbilityAt: 0,
    interruptCount: 0,
    vulnerabilityHits: 0,
    rewardPoints: 0,
    completionId: '',
    boundAt: 0,
    defeatedAt: 0,
    revision: 0,
    updatedAt: now,
    pvpExcluded: true,
    hostAuthoritative: true
  };
}

export function createGameplay4State(details = {}) {
  return createInactiveState(details);
}

export function normalizeGameplay4State(value = {}, now = Date.now()) {
  const base = createInactiveState({
    runId: value.runId,
    mapId: value.mapId,
    gameMode: value.gameMode,
    now
  });
  const profile = profileFromBoss(value);
  const mode = normalizeGameMode(value.gameMode);
  const active = mode !== 'pvp' && value.active === true;
  return {
    ...base,
    ...clone(value),
    patch: GAMEPLAY4_PATCH,
    schema: GAMEPLAY4_SCHEMA,
    gameMode: mode,
    active,
    status: active
      ? clean(value.status, GAMEPLAY4_BOSS_STATUS.PENDING, 30).toUpperCase()
      : GAMEPLAY4_BOSS_STATUS.INACTIVE,
    runId: clean(value.runId, base.runId, 180),
    mapId: clean(value.mapId, base.mapId, 80),
    bossId: clean(value.bossId, '', 100),
    bossLabel: clean(value.bossLabel, profile.label, 120),
    enemyId: clean(value.enemyId, '', 180),
    enemyType: clean(value.enemyType, '', 40).toUpperCase(),
    profileId: clean(value.profileId, profile.id, 50).toUpperCase(),
    profileLabel: clean(value.profileLabel, profile.label, 120),
    profileColor: clean(value.profileColor, profile.color, 20),
    phase: Math.max(1, Math.min(3, integer(value.phase, 1))),
    phaseCount: 3,
    phaseTransitions: Math.max(0, integer(value.phaseTransitions)),
    teamSize: Math.max(1, Math.min(4, integer(value.teamSize, 1))),
    maxHealth: Math.max(0, finite(value.maxHealth)),
    health: Math.max(0, finite(value.health)),
    abilitySerial: Math.max(0, integer(value.abilitySerial)),
    ability: normalizeAbility(value.ability, profile),
    nextAbilityAt: Math.max(0, finite(value.nextAbilityAt)),
    interruptCount: Math.max(0, integer(value.interruptCount)),
    vulnerabilityHits: Math.max(0, integer(value.vulnerabilityHits)),
    rewardPoints: Math.max(0, integer(value.rewardPoints)),
    completionId: clean(value.completionId, '', 220),
    boundAt: Math.max(0, finite(value.boundAt)),
    defeatedAt: Math.max(0, finite(value.defeatedAt)),
    revision: Math.max(0, integer(value.revision)),
    updatedAt: Math.max(0, finite(value.updatedAt, now)),
    pvpExcluded: true,
    hostAuthoritative: true
  };
}

function cooldownForPhase(phase) {
  return [5200, 4400, 3600][Math.max(0, Math.min(2, integer(phase, 1) - 1))];
}

function nearestTarget(participants = [], bossPosition = null, seed = '') {
  const living = participants.filter((entry) => entry?.connected !== false && entry?.alive !== false && entry?.position);
  if (!living.length) {
    const offset = (hash32(seed) % 7) - 3;
    return {
      point: point({ x: finite(bossPosition?.x) + offset, y: 0, z: finite(bossPosition?.z) - offset }),
      playerId: '',
      roleId: 'VANGUARD'
    };
  }
  const origin = point(bossPosition);
  const roleBias = {
    VANGUARD: -3.5,
    RECON: 0.5,
    SUPPORT: 1.5,
    FIELD_MEDIC: 2
  };
  const selected = living.slice().sort((a, b) => {
    const aRole = normalizeRole(a.roleId);
    const bRole = normalizeRole(b.roleId);
    const ad = Math.hypot(finite(a.position.x) - origin.x, finite(a.position.z) - origin.z)
      + finite(roleBias[aRole]);
    const bd = Math.hypot(finite(b.position.x) - origin.x, finite(b.position.z) - origin.z)
      + finite(roleBias[bRole]);
    if (ad !== bd) return ad - bd;
    return hash32(`${seed}:${clean(a.playerId)}`) - hash32(`${seed}:${clean(b.playerId)}`);
  })[0];
  return {
    point: point(selected.position),
    playerId: clean(selected.playerId, '', 160),
    roleId: normalizeRole(selected.roleId)
  };
}

export function computeGameplay4Reward(value = {}) {
  const state = normalizeGameplay4State(value);
  if (state.status !== GAMEPLAY4_BOSS_STATUS.DEFEATED) return 0;
  return Math.max(0, Math.min(900,
    220
      + state.phaseTransitions * 75
      + state.interruptCount * 90
      + Math.min(20, state.vulnerabilityHits) * 12
  ));
}

export function getGameplay4BossDamageScale(value = {}, enemyId = '', { headshot = false } = {}) {
  const state = normalizeGameplay4State(value);
  if (!state.active || state.status !== GAMEPLAY4_BOSS_STATUS.ACTIVE) return 1;
  if (!state.enemyId || clean(enemyId, '', 180) !== state.enemyId) return 1;
  const abilityState = state.ability?.state || GAMEPLAY4_ABILITY_STATE.IDLE;
  if (abilityState === GAMEPLAY4_ABILITY_STATE.VULNERABLE) {
    return headshot ? 1.48 : 1.35;
  }
  if ([GAMEPLAY4_ABILITY_STATE.WARNING, GAMEPLAY4_ABILITY_STATE.ACTIVE].includes(abilityState)) {
    return headshot ? 0.94 : 0.82;
  }
  return headshot ? 1.08 : 1;
}


export function getGameplay4ReinforcementTuning(value = {}, enemyId = '') {
  const state = normalizeGameplay4State(value);
  const normalizedEnemyId = clean(enemyId, '', 180);
  if (
    !state.active
    || state.status !== GAMEPLAY4_BOSS_STATUS.ACTIVE
    || state.gameMode === 'pvp'
    || (normalizedEnemyId && normalizedEnemyId === state.enemyId)
  ) {
    return Object.freeze({
      active: false,
      phase: state.phase,
      healthScale: 1,
      speedScale: 1,
      damageScale: 1
    });
  }
  const index = Math.max(0, Math.min(2, state.phase - 1));
  return Object.freeze({
    active: true,
    phase: state.phase,
    healthScale: [1.04, 1.10, 1.16][index],
    speedScale: [1.02, 1.05, 1.08][index],
    damageScale: [1.03, 1.07, 1.10][index]
  });
}

export class Gameplay4BossDirector {
  constructor(value = null) {
    this.state = normalizeGameplay4State(value || createGameplay4State());
    this.pendingEvents = [];
  }

  pushEvent(event) {
    this.pendingEvents.push(clone(event));
    if (this.pendingEvents.length > MAX_EVENTS) {
      this.pendingEvents.splice(0, this.pendingEvents.length - MAX_EVENTS);
    }
  }

  reset(details = {}) {
    this.state = createGameplay4State(details);
    this.pendingEvents.length = 0;
    return this.getSnapshot(details.now);
  }

  bindBoss({
    bossId = '',
    bossLabel = '',
    enemyId = '',
    enemyType = '',
    maxHealth = 0,
    health = maxHealth,
    position = null
  } = {}, now = Date.now()) {
    if (this.state.gameMode === 'pvp') return false;
    const normalizedEnemyId = clean(enemyId, '', 180);
    if (!normalizedEnemyId) return false;
    const profile = profileFromBoss({ bossId, label: bossLabel, enemyType });
    this.state = normalizeGameplay4State({
      ...this.state,
      active: true,
      status: GAMEPLAY4_BOSS_STATUS.ACTIVE,
      bossId: clean(bossId, profile.id, 100),
      bossLabel: clean(bossLabel, profile.label, 120),
      enemyId: normalizedEnemyId,
      enemyType: clean(enemyType, 'GOLIATH', 40).toUpperCase(),
      profileId: profile.id,
      profileLabel: profile.label,
      profileColor: profile.color,
      phase: 1,
      phaseTransitions: 0,
      maxHealth: Math.max(1, finite(maxHealth, health)),
      health: Math.max(1, finite(health, maxHealth)),
      abilitySerial: 0,
      ability: null,
      nextAbilityAt: finite(now) + 2800,
      boundAt: finite(now),
      updatedAt: finite(now),
      revision: this.state.revision + 1,
      lastBossPosition: point(position)
    }, now);
    this.pushEvent({
      type: 'GAMEPLAY4_BOSS_BOUND',
      eventId: `${this.state.runId}:gameplay4:boss:${normalizedEnemyId}`,
      bossId: this.state.bossId,
      bossLabel: this.state.bossLabel,
      profileId: this.state.profileId,
      at: finite(now)
    });
    return true;
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (this.state.gameMode === 'pvp') return false;
    if (!snapshot || snapshot.patch !== GAMEPLAY4_PATCH) return false;
    if (integer(snapshot.schema) !== GAMEPLAY4_SCHEMA) return false;
    if (this.state.runId && snapshot.runId && this.state.runId !== snapshot.runId) return false;
    this.state = normalizeGameplay4State(snapshot, now);
    return true;
  }

  observeBossDamage({
    enemyId = '',
    damage = 0,
    headshot = false,
    actorId = '',
    health = null,
    maxHealth = null,
    postFinal8Phase = null
  } = {}, now = Date.now()) {
    if (
      !this.state.active
      || this.state.status !== GAMEPLAY4_BOSS_STATUS.ACTIVE
      || clean(enemyId, '', 180) !== this.state.enemyId
    ) {
      return { accepted: false, events: [] };
    }
    const previousPhase = this.state.phase;
    const resolvedMax = Math.max(1, finite(maxHealth, this.state.maxHealth));
    const resolvedHealth = health == null
      ? Math.max(0, this.state.health - Math.max(0, finite(damage)))
      : Math.max(0, Math.min(resolvedMax, finite(health)));
    this.state.maxHealth = resolvedMax;
    this.state.health = resolvedHealth;
    const derivedPhase = postFinal8Phase == null
      ? (resolvedHealth / resolvedMax <= 0.34 ? 3 : (resolvedHealth / resolvedMax <= 0.67 ? 2 : 1))
      : Math.max(1, Math.min(3, integer(postFinal8Phase) + 1));
    const events = [];
    if (derivedPhase > previousPhase) {
      this.state.phase = derivedPhase;
      this.state.phaseTransitions += derivedPhase - previousPhase;
      this.state.ability = null;
      this.state.nextAbilityAt = finite(now) + 900;
      const event = {
        type: 'GAMEPLAY4_PHASE_CHANGED',
        eventId: `${this.state.runId}:gameplay4:phase:${derivedPhase}`,
        phase: derivedPhase,
        bossLabel: this.state.bossLabel,
        at: finite(now)
      };
      events.push(event);
      this.pushEvent(event);
    }

    const ability = this.state.ability;
    const dealtDamage = Math.max(0, finite(damage));
    if (ability?.state === GAMEPLAY4_ABILITY_STATE.WARNING && dealtDamage > 0) {
      const contribution = Math.max(
        headshot ? 18 : 3,
        (dealtDamage / resolvedMax) * (headshot ? 620 : 210)
      );
      ability.interruptMeter = Math.min(100, ability.interruptMeter + contribution);
      if (ability.interruptMeter >= 100) {
        ability.state = GAMEPLAY4_ABILITY_STATE.VULNERABLE;
        ability.startedAt = finite(now);
        ability.endsAt = finite(now) + 3400;
        ability.committed = false;
        this.state.interruptCount += 1;
        const event = {
          type: 'GAMEPLAY4_ABILITY_INTERRUPTED',
          eventId: `${this.state.runId}:gameplay4:interrupt:${ability.serial}`,
          ability: clone(ability),
          actorId: clean(actorId, 'TEAM', 160),
          at: finite(now)
        };
        events.push(event);
        this.pushEvent(event);
      }
    } else if (ability?.state === GAMEPLAY4_ABILITY_STATE.VULNERABLE) {
      this.state.vulnerabilityHits += 1;
    }

    this.state.revision += 1;
    this.state.updatedAt = finite(now);
    return { accepted: true, events: clone(events), snapshot: this.getSnapshot(now) };
  }

  claimAbilityCommit(serial = 0, now = Date.now()) {
    const ability = this.state.ability;
    if (
      !this.state.active
      || this.state.status !== GAMEPLAY4_BOSS_STATUS.ACTIVE
      || ability?.state !== GAMEPLAY4_ABILITY_STATE.ACTIVE
      || ability.serial !== Math.max(0, integer(serial))
      || ability.damageApplied === true
    ) return false;
    ability.damageApplied = true;
    this.state.revision += 1;
    this.state.updatedAt = finite(now);
    return true;
  }

  recordBossKilled({ enemyId = '', actorId = '' } = {}, now = Date.now()) {
    if (
      !this.state.active
      || this.state.status !== GAMEPLAY4_BOSS_STATUS.ACTIVE
      || clean(enemyId, '', 180) !== this.state.enemyId
    ) return false;
    this.state.status = GAMEPLAY4_BOSS_STATUS.DEFEATED;
    this.state.health = 0;
    this.state.phase = 3;
    this.state.ability = null;
    this.state.defeatedAt = finite(now);
    this.state.completionId = `${this.state.runId}:gameplay4:${this.state.bossId}:defeated`;
    this.state.updatedAt = finite(now);
    this.state.revision += 1;
    this.state.rewardPoints = computeGameplay4Reward(this.state);
    this.pushEvent({
      type: 'GAMEPLAY4_BOSS_DEFEATED',
      eventId: this.state.completionId,
      bossId: this.state.bossId,
      bossLabel: this.state.bossLabel,
      profileId: this.state.profileId,
      rewardPoints: this.state.rewardPoints,
      actorId: clean(actorId, 'TEAM', 160),
      at: finite(now)
    });
    return true;
  }

  startAbility(now, { bossPosition = null, participants = [] } = {}) {
    const profile = profileFromBoss({
      bossId: this.state.bossId,
      label: this.state.bossLabel,
      enemyType: this.state.enemyType
    });
    const phaseIndex = Math.max(0, Math.min(2, this.state.phase - 1));
    const definition = profile.abilities[phaseIndex];
    const origin = point(bossPosition || this.state.lastBossPosition);
    const centered = ['GROUND_SLAM', 'SHOCKWAVE', 'MELTDOWN_RING'].includes(definition.id);
    const livingParticipants = participants.filter((entry) => (
      entry?.connected !== false && entry?.alive !== false && entry?.position
    ));
    const selectedTarget = centered
      ? { point: origin, playerId: '', roleId: 'VANGUARD' }
      : nearestTarget(livingParticipants, origin, `${this.state.runId}:${this.state.abilitySerial + 1}`);
    const target = selectedTarget.point;
    const teamSize = Math.max(1, Math.min(4, livingParticipants.length || this.state.teamSize || 1));
    this.state.teamSize = teamSize;
    this.state.abilitySerial += 1;
    this.state.ability = normalizeAbility({
      serial: this.state.abilitySerial,
      id: definition.id,
      label: definition.label,
      state: GAMEPLAY4_ABILITY_STATE.WARNING,
      phaseIndex,
      startedAt: now,
      endsAt: now + definition.warningMs,
      origin,
      target,
      targetPlayerId: selectedTarget.playerId,
      targetRoleId: selectedTarget.roleId,
      radius: definition.radius,
      damage: Math.max(1, Math.round(definition.damage * teamDamageScale(teamSize))),
      interruptMeter: 0,
      committed: false,
      damageApplied: false
    }, profile);
    this.state.revision += 1;
    this.state.updatedAt = now;
    this.pushEvent({
      type: 'GAMEPLAY4_ABILITY_WARNING',
      eventId: `${this.state.runId}:gameplay4:ability:${this.state.abilitySerial}:warning`,
      ability: clone(this.state.ability),
      bossLabel: this.state.bossLabel,
      at: now
    });
  }

  update(now = Date.now(), {
    boss = null,
    bossPosition = null,
    participants = []
  } = {}) {
    const timestamp = finite(now, Date.now());
    if (!this.state.active || this.state.gameMode === 'pvp') return this.getSnapshot(timestamp);
    if (boss?.status === 'DEFEATED' && this.state.status === GAMEPLAY4_BOSS_STATUS.ACTIVE) {
      this.recordBossKilled({ enemyId: this.state.enemyId }, timestamp);
      return this.getSnapshot(timestamp);
    }
    if (boss && this.state.status === GAMEPLAY4_BOSS_STATUS.ACTIVE) {
      this.state.maxHealth = Math.max(1, finite(boss.maxHealth, this.state.maxHealth));
      this.state.health = Math.max(0, Math.min(this.state.maxHealth, finite(boss.health, this.state.health)));
      const bossPhase = Math.max(1, Math.min(3, integer(boss.phase) + 1));
      if (bossPhase > this.state.phase) {
        this.observeBossDamage({
          enemyId: this.state.enemyId,
          damage: 0,
          health: this.state.health,
          maxHealth: this.state.maxHealth,
          postFinal8Phase: boss.phase
        }, timestamp);
      }
    }
    if (bossPosition) this.state.lastBossPosition = point(bossPosition);
    const livingParticipants = participants.filter((entry) => (
      entry?.connected !== false && entry?.alive !== false && entry?.position
    ));
    this.state.teamSize = Math.max(1, Math.min(4, livingParticipants.length || this.state.teamSize || 1));
    if (this.state.status !== GAMEPLAY4_BOSS_STATUS.ACTIVE) return this.getSnapshot(timestamp);

    const ability = this.state.ability;
    if (!ability && timestamp >= this.state.nextAbilityAt) {
      this.startAbility(timestamp, { bossPosition, participants });
    } else if (ability && timestamp >= ability.endsAt) {
      const profile = profileFromBoss(this.state);
      const definition = profile.abilities[ability.phaseIndex] || profile.abilities[0];
      if (ability.state === GAMEPLAY4_ABILITY_STATE.WARNING) {
        ability.state = GAMEPLAY4_ABILITY_STATE.ACTIVE;
        ability.startedAt = timestamp;
        ability.endsAt = timestamp + definition.activeMs;
        ability.committed = true;
        this.pushEvent({
          type: 'GAMEPLAY4_ABILITY_COMMITTED',
          eventId: `${this.state.runId}:gameplay4:ability:${ability.serial}:commit`,
          ability: clone(ability),
          bossLabel: this.state.bossLabel,
          at: timestamp
        });
      } else if (ability.state === GAMEPLAY4_ABILITY_STATE.ACTIVE) {
        ability.state = GAMEPLAY4_ABILITY_STATE.VULNERABLE;
        ability.startedAt = timestamp;
        ability.endsAt = timestamp + definition.vulnerableMs;
        ability.committed = false;
        this.pushEvent({
          type: 'GAMEPLAY4_VULNERABILITY_OPENED',
          eventId: `${this.state.runId}:gameplay4:ability:${ability.serial}:vulnerable`,
          ability: clone(ability),
          bossLabel: this.state.bossLabel,
          at: timestamp
        });
      } else if (ability.state === GAMEPLAY4_ABILITY_STATE.VULNERABLE) {
        ability.state = GAMEPLAY4_ABILITY_STATE.RECOVERY;
        ability.startedAt = timestamp;
        ability.endsAt = timestamp + definition.recoveryMs;
      } else {
        this.state.ability = null;
        this.state.nextAbilityAt = timestamp + cooldownForPhase(this.state.phase);
      }
      this.state.revision += 1;
      this.state.updatedAt = timestamp;
    }
    return this.getSnapshot(timestamp);
  }

  consumeEvents() {
    const events = this.pendingEvents.map(clone);
    this.pendingEvents.length = 0;
    return events;
  }

  getSnapshot(now = Date.now()) {
    return Object.freeze(normalizeGameplay4State({
      ...this.state,
      rewardPoints: this.state.status === GAMEPLAY4_BOSS_STATUS.DEFEATED
        ? computeGameplay4Reward(this.state)
        : this.state.rewardPoints,
      updatedAt: Math.max(this.state.updatedAt, finite(now))
    }, now));
  }
}

export function getGameplay4Profile(value = {}) {
  return Object.freeze(clone(profileFromBoss(value)));
}
