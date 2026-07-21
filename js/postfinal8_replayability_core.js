// POST-FINAL.8 R1 — deterministic enemy factions, phased bosses, and replayability.

export const POST_FINAL8_PATCH = 'post-final8-r1-enemy-factions-boss-replayability';
export const POST_FINAL8_SCHEMA = 1;

export const POST_FINAL8_FACTIONS = Object.freeze({
  VANGUARD_CORPS: 'VANGUARD_CORPS',
  WASTELAND_RAIDERS: 'WASTELAND_RAIDERS',
  BIOHAZARD_SWARM: 'BIOHAZARD_SWARM',
  MACHINE_COLLECTIVE: 'MACHINE_COLLECTIVE'
});

export const POST_FINAL8_BOSS_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  DEFEATED: 'DEFEATED'
});

export const POST_FINAL8_MODIFIERS = Object.freeze({
  HEAVY_ARMOR: 'HEAVY_ARMOR',
  ACCELERATED: 'ACCELERATED',
  ELITE_REINFORCEMENTS: 'ELITE_REINFORCEMENTS',
  SHORT_TIMERS: 'SHORT_TIMERS',
  REDUCED_VISIBILITY: 'REDUCED_VISIBILITY',
  TOXIC_GROUND: 'TOXIC_GROUND',
  AGGRESSIVE_BOSS: 'AGGRESSIVE_BOSS',
  HARDENED_WEAKPOINTS: 'HARDENED_WEAKPOINTS'
});

export const POST_FINAL8_AFFIXES = Object.freeze({
  REGENERATING: 'REGENERATING',
  VOLATILE: 'VOLATILE',
  SUPPRESSOR: 'SUPPRESSOR',
  PHASED_ARMOR: 'PHASED_ARMOR',
  HUNTER: 'HUNTER',
  COMMANDER: 'COMMANDER'
});

const MAX_EVENTS = 160;
const PHASE_THRESHOLDS = Object.freeze([0.67, 0.34]);
const MAP_FACTION_ROTATION = Object.freeze({
  grid_bunker: Object.freeze([
    POST_FINAL8_FACTIONS.VANGUARD_CORPS,
    POST_FINAL8_FACTIONS.MACHINE_COLLECTIVE,
    POST_FINAL8_FACTIONS.WASTELAND_RAIDERS
  ]),
  industrial_yard: Object.freeze([
    POST_FINAL8_FACTIONS.WASTELAND_RAIDERS,
    POST_FINAL8_FACTIONS.MACHINE_COLLECTIVE,
    POST_FINAL8_FACTIONS.VANGUARD_CORPS
  ]),
  neon_depot: Object.freeze([
    POST_FINAL8_FACTIONS.MACHINE_COLLECTIVE,
    POST_FINAL8_FACTIONS.WASTELAND_RAIDERS,
    POST_FINAL8_FACTIONS.BIOHAZARD_SWARM
  ]),
  parking_garage: Object.freeze([
    POST_FINAL8_FACTIONS.WASTELAND_RAIDERS,
    POST_FINAL8_FACTIONS.BIOHAZARD_SWARM,
    POST_FINAL8_FACTIONS.VANGUARD_CORPS
  ]),
  hospital_wing: Object.freeze([
    POST_FINAL8_FACTIONS.BIOHAZARD_SWARM,
    POST_FINAL8_FACTIONS.VANGUARD_CORPS,
    POST_FINAL8_FACTIONS.MACHINE_COLLECTIVE
  ]),
  reactor_courtyard: Object.freeze([
    POST_FINAL8_FACTIONS.BIOHAZARD_SWARM,
    POST_FINAL8_FACTIONS.MACHINE_COLLECTIVE,
    POST_FINAL8_FACTIONS.WASTELAND_RAIDERS
  ])
});

const FACTION_DEFINITIONS = Object.freeze({
  [POST_FINAL8_FACTIONS.VANGUARD_CORPS]: Object.freeze({
    id: POST_FINAL8_FACTIONS.VANGUARD_CORPS,
    label: 'Vanguard Corps',
    description: 'Disciplined suppressors, shielded frontline units, and coordinated flanks.',
    color: '#73a7ff',
    emissiveHex: 0x245dff,
    weights: Object.freeze({
      SHAMBLER: 0.85,
      CRAWLER: 0.65,
      RUNNER: 0.90,
      BRUTE: 1.55,
      GOLIATH: 1.15,
      EXPLODER: 0.72,
      RANGED: 1.55
    }),
    enemyScales: Object.freeze({ health: 1.10, speed: 0.98, damage: 1.08 }),
    bosses: Object.freeze([
      boss('VANGUARD-JUGGERNAUT', 'Vanguard Juggernaut', 'GOLIATH', 'Break armor plates, interrupt the charge, and exploit exposed weak points.'),
      boss('COMMAND-OVERSEER', 'Command Overseer', 'BRUTE', 'Disrupt command pulses before coordinated reinforcements overwhelm the arena.')
    ])
  }),
  [POST_FINAL8_FACTIONS.WASTELAND_RAIDERS]: Object.freeze({
    id: POST_FINAL8_FACTIONS.WASTELAND_RAIDERS,
    label: 'Wasteland Raiders',
    description: 'Unpredictable rush squads, demolition specialists, and close-range ambushes.',
    color: '#ff9a45',
    emissiveHex: 0xff4b11,
    weights: Object.freeze({
      SHAMBLER: 0.75,
      CRAWLER: 0.80,
      RUNNER: 1.65,
      BRUTE: 1.15,
      GOLIATH: 0.90,
      EXPLODER: 1.65,
      RANGED: 0.82
    }),
    enemyScales: Object.freeze({ health: 0.96, speed: 1.13, damage: 1.10 }),
    bosses: Object.freeze([
      boss('DEMOLITION-CHIEF', 'Raider Demolition Chief', 'EXPLODER', 'Evade volatile barrages and stagger the Chief before the blast phase.'),
      boss('STEALTH-HUNTER', 'Stealth Hunter', 'RUNNER', 'Track rapid repositioning and punish the Hunter during exposed attack windows.')
    ])
  }),
  [POST_FINAL8_FACTIONS.BIOHAZARD_SWARM]: Object.freeze({
    id: POST_FINAL8_FACTIONS.BIOHAZARD_SWARM,
    label: 'Biohazard Swarm',
    description: 'Crawler clusters, contamination pressure, mutations, and relentless regeneration.',
    color: '#9cff42',
    emissiveHex: 0x66ff12,
    weights: Object.freeze({
      SHAMBLER: 0.78,
      CRAWLER: 1.75,
      RUNNER: 1.20,
      BRUTE: 1.18,
      GOLIATH: 1.10,
      EXPLODER: 1.35,
      RANGED: 1.22
    }),
    enemyScales: Object.freeze({ health: 1.07, speed: 1.06, damage: 1.04 }),
    bosses: Object.freeze([
      boss('BIOHAZARD-BEHEMOTH', 'Biohazard Behemoth', 'GOLIATH', 'Break regenerating tissue and survive escalating contamination phases.'),
      boss('PLAGUE-MATRIARCH', 'Plague Matriarch', 'RANGED', 'Destroy hardened weak points before the Matriarch floods the arena with spores.')
    ])
  }),
  [POST_FINAL8_FACTIONS.MACHINE_COLLECTIVE]: Object.freeze({
    id: POST_FINAL8_FACTIONS.MACHINE_COLLECTIVE,
    label: 'Machine Collective',
    description: 'Precision fire, automated support, repair units, and weak-point-driven armor.',
    color: '#61f4ff',
    emissiveHex: 0x00d9ff,
    weights: Object.freeze({
      SHAMBLER: 0.82,
      CRAWLER: 0.72,
      RUNNER: 1.05,
      BRUTE: 1.40,
      GOLIATH: 1.28,
      EXPLODER: 0.85,
      RANGED: 1.72
    }),
    enemyScales: Object.freeze({ health: 1.14, speed: 0.98, damage: 1.08 }),
    bosses: Object.freeze([
      boss('SIEGE-WALKER', 'Machine Siege Walker', 'GOLIATH', 'Destroy armor segments and target the exposed command core.'),
      boss('HUNTER-KERNEL', 'Hunter Kernel', 'RANGED', 'Interrupt precision volleys and punish the Kernel during cooling cycles.')
    ])
  })
});

const MODIFIER_DEFINITIONS = Object.freeze({
  [POST_FINAL8_MODIFIERS.HEAVY_ARMOR]: modifier(
    POST_FINAL8_MODIFIERS.HEAVY_ARMOR,
    'Heavy Armor',
    'Enemy health increased by 22%.',
    { enemyHealthScale: 1.22, rewardBonus: 0.12 }
  ),
  [POST_FINAL8_MODIFIERS.ACCELERATED]: modifier(
    POST_FINAL8_MODIFIERS.ACCELERATED,
    'Accelerated Hostiles',
    'Enemy movement speed increased by 16%.',
    { enemySpeedScale: 1.16, rewardBonus: 0.10 }
  ),
  [POST_FINAL8_MODIFIERS.ELITE_REINFORCEMENTS]: modifier(
    POST_FINAL8_MODIFIERS.ELITE_REINFORCEMENTS,
    'Elite Reinforcements',
    'Elite pressure and special-unit frequency increased.',
    { eliteHealthScale: 1.18, specialWeightScale: 1.24, rewardBonus: 0.13 }
  ),
  [POST_FINAL8_MODIFIERS.SHORT_TIMERS]: modifier(
    POST_FINAL8_MODIFIERS.SHORT_TIMERS,
    'Compressed Window',
    'Objective timers shortened by 14%.',
    { objectiveTimeScale: 0.86, rewardBonus: 0.12 }
  ),
  [POST_FINAL8_MODIFIERS.REDUCED_VISIBILITY]: modifier(
    POST_FINAL8_MODIFIERS.REDUCED_VISIBILITY,
    'Reduced Visibility',
    'Priority markers are shorter range and boss telegraphs demand closer attention.',
    { markerRangeScale: 0.82, rewardBonus: 0.08 }
  ),
  [POST_FINAL8_MODIFIERS.TOXIC_GROUND]: modifier(
    POST_FINAL8_MODIFIERS.TOXIC_GROUND,
    'Toxic Ground',
    'Stationary defense is punished by contamination pressure.',
    { enemyDamageScale: 1.06, rewardBonus: 0.11 }
  ),
  [POST_FINAL8_MODIFIERS.AGGRESSIVE_BOSS]: modifier(
    POST_FINAL8_MODIFIERS.AGGRESSIVE_BOSS,
    'Aggressive Boss',
    'Boss speed and attack pressure increase with each phase.',
    { bossSpeedScale: 1.12, bossDamageScale: 1.12, rewardBonus: 0.14 }
  ),
  [POST_FINAL8_MODIFIERS.HARDENED_WEAKPOINTS]: modifier(
    POST_FINAL8_MODIFIERS.HARDENED_WEAKPOINTS,
    'Hardened Weak Points',
    'Boss stagger requires more weak-point pressure.',
    { staggerScale: 0.78, rewardBonus: 0.12 }
  )
});

const AFFIX_DEFINITIONS = Object.freeze({
  [POST_FINAL8_AFFIXES.REGENERATING]: affix(
    POST_FINAL8_AFFIXES.REGENERATING,
    'Regenerating',
    { healthScale: 1.12, damageScale: 1.00, speedScale: 0.98 }
  ),
  [POST_FINAL8_AFFIXES.VOLATILE]: affix(
    POST_FINAL8_AFFIXES.VOLATILE,
    'Volatile',
    { healthScale: 0.94, damageScale: 1.18, speedScale: 1.06 }
  ),
  [POST_FINAL8_AFFIXES.SUPPRESSOR]: affix(
    POST_FINAL8_AFFIXES.SUPPRESSOR,
    'Suppressor',
    { healthScale: 1.05, damageScale: 1.10, speedScale: 0.96 }
  ),
  [POST_FINAL8_AFFIXES.PHASED_ARMOR]: affix(
    POST_FINAL8_AFFIXES.PHASED_ARMOR,
    'Phased Armor',
    { healthScale: 1.18, damageScale: 1.00, speedScale: 0.94 }
  ),
  [POST_FINAL8_AFFIXES.HUNTER]: affix(
    POST_FINAL8_AFFIXES.HUNTER,
    'Hunter',
    { healthScale: 0.98, damageScale: 1.08, speedScale: 1.18 }
  ),
  [POST_FINAL8_AFFIXES.COMMANDER]: affix(
    POST_FINAL8_AFFIXES.COMMANDER,
    'Commander',
    { healthScale: 1.10, damageScale: 1.08, speedScale: 1.02 }
  )
});

function boss(id, label, enemyType, description) {
  return Object.freeze({ id, label, enemyType, description });
}

function modifier(id, label, description, tuning) {
  return Object.freeze({ id, label, description, tuning: Object.freeze({ ...tuning }) });
}

function affix(id, label, tuning) {
  return Object.freeze({ id, label, tuning: Object.freeze({ ...tuning }) });
}

function clean(value, fallback = '', max = 180) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  return Math.round(finite(value, fallback));
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

function pickDistinct(values, count, seed, salt = '') {
  const pool = [...values];
  const result = [];
  for (let index = 0; index < count && pool.length; index += 1) {
    const chosen = seededIndex(seed, pool.length, `${salt}:${index}`);
    result.push(pool.splice(chosen, 1)[0]);
  }
  return result;
}

function factionDefinition(id) {
  return FACTION_DEFINITIONS[id] || FACTION_DEFINITIONS[POST_FINAL8_FACTIONS.VANGUARD_CORPS];
}

function determineFaction(mapId, runId) {
  const rotation = MAP_FACTION_ROTATION[clean(mapId, 'grid_bunker', 80)]
    || Object.values(POST_FINAL8_FACTIONS);
  return rotation[seededIndex(`${runId}:${mapId}`, rotation.length, 'faction')];
}

function determineBoss(factionId, seed) {
  const bosses = factionDefinition(factionId).bosses;
  return bosses[seededIndex(seed, bosses.length, 'boss')];
}

function determineModifiers(seed, difficulty) {
  const ids = Object.values(POST_FINAL8_MODIFIERS);
  const count = finite(difficulty, 1) >= 1.55 ? 3 : 2;
  return pickDistinct(ids, count, seed, 'modifier').map((id) => clone(MODIFIER_DEFINITIONS[id]));
}

function determineAffixes(seed) {
  return pickDistinct(Object.values(POST_FINAL8_AFFIXES), 2, seed, 'affix')
    .map((id) => clone(AFFIX_DEFINITIONS[id]));
}

function combinedTuning(modifiers = [], key, fallback = 1) {
  return modifiers.reduce((value, entry) => (
    value * Math.max(0.25, finite(entry?.tuning?.[key], fallback))
  ), 1);
}

function rewardBonus(modifiers = []) {
  return modifiers.reduce(
    (sum, entry) => sum + Math.max(0, finite(entry?.tuning?.rewardBonus)),
    0
  );
}

function normalizeBoss(value = {}, definition = {}, now = Date.now()) {
  const maxHealth = Math.max(0, finite(value.maxHealth));
  const health = Math.max(0, Math.min(maxHealth || Number.MAX_SAFE_INTEGER, finite(value.health, maxHealth)));
  return {
    bossId: clean(value.bossId, definition.id || 'UNASSIGNED-BOSS', 100),
    label: clean(value.label, definition.label || 'Mission Boss', 120),
    enemyType: clean(value.enemyType, definition.enemyType || 'GOLIATH', 40).toUpperCase(),
    description: clean(value.description, definition.description || 'Eliminate the mission boss.', 240),
    enemyId: clean(value.enemyId, '', 180) || null,
    status: Object.values(POST_FINAL8_BOSS_STATUS).includes(value.status)
      ? value.status
      : POST_FINAL8_BOSS_STATUS.PENDING,
    phase: Math.max(0, Math.min(2, integer(value.phase))),
    phaseCount: 3,
    maxHealth,
    health,
    armorSegments: 3,
    armorBroken: Math.max(0, Math.min(3, integer(value.armorBroken))),
    weakPointHits: Math.max(0, integer(value.weakPointHits)),
    stagger: Math.max(0, Math.min(99.99, finite(value.stagger))),
    staggerCount: Math.max(0, integer(value.staggerCount)),
    reinforcementWaves: Math.max(0, integer(value.reinforcementWaves)),
    boundAt: Math.max(0, integer(value.boundAt)),
    defeatedAt: Math.max(0, integer(value.defeatedAt)),
    updatedAt: Math.max(0, integer(value.updatedAt, now))
  };
}

export function createPostFinal8State({
  runId = `run-${Date.now()}`,
  mapId = 'grid_bunker',
  missionId = '',
  difficulty = 1,
  playerCount = 1,
  now = Date.now()
} = {}) {
  const normalizedRunId = clean(runId, `run-${Date.now()}`, 160);
  const normalizedMapId = clean(mapId, 'grid_bunker', 80);
  const seed = `${normalizedRunId}:${normalizedMapId}:${clean(missionId, 'MISSION', 100)}`;
  const factionId = determineFaction(normalizedMapId, normalizedRunId);
  const faction = clone(factionDefinition(factionId));
  const bossDefinition = determineBoss(factionId, seed);
  const modifiers = determineModifiers(seed, difficulty);
  const eliteAffixes = determineAffixes(seed);
  return {
    patch: POST_FINAL8_PATCH,
    schema: POST_FINAL8_SCHEMA,
    runId: normalizedRunId,
    mapId: normalizedMapId,
    missionId: clean(missionId, '', 100),
    seed: hash32(seed).toString(16).padStart(8, '0'),
    difficulty: Math.max(0.5, Math.min(2, finite(difficulty, 1))),
    playerCount: Math.max(1, Math.min(4, integer(playerCount, 1))),
    faction,
    modifiers,
    eliteAffixes,
    spawnSerial: 0,
    boss: normalizeBoss({}, bossDefinition, now),
    noDownedEligible: true,
    playerDownedCount: 0,
    missionComplete: false,
    completionId: null,
    masteryScore: 0,
    masteryGrade: 'UNRANKED',
    medals: [],
    rewardMultiplier: Math.max(1, 1 + rewardBonus(modifiers)),
    rewardPoints: 0,
    createdAt: integer(now, Date.now()),
    updatedAt: integer(now, Date.now())
  };
}

export function normalizePostFinal8State(value = {}, now = Date.now()) {
  const base = createPostFinal8State({
    runId: value.runId,
    mapId: value.mapId,
    missionId: value.missionId,
    difficulty: value.difficulty,
    playerCount: value.playerCount,
    now: value.createdAt || now
  });
  const faction = factionDefinition(value?.faction?.id || base.faction.id);
  const bossDefinition = determineBoss(faction.id, `${base.runId}:${base.mapId}:${base.missionId}`);
  const modifiers = Array.isArray(value.modifiers) && value.modifiers.length
    ? value.modifiers.map((entry) => clone(
        MODIFIER_DEFINITIONS[entry?.id] || entry
      )).slice(0, 3)
    : base.modifiers;
  const eliteAffixes = Array.isArray(value.eliteAffixes) && value.eliteAffixes.length
    ? value.eliteAffixes.map((entry) => clone(
        AFFIX_DEFINITIONS[entry?.id] || entry
      )).slice(0, 2)
    : base.eliteAffixes;
  return {
    ...base,
    ...clone(value),
    patch: POST_FINAL8_PATCH,
    schema: POST_FINAL8_SCHEMA,
    runId: clean(value.runId, base.runId, 160),
    mapId: clean(value.mapId, base.mapId, 80),
    missionId: clean(value.missionId, base.missionId, 100),
    faction: clone(faction),
    modifiers,
    eliteAffixes,
    spawnSerial: Math.max(0, integer(value.spawnSerial)),
    boss: normalizeBoss(value.boss, bossDefinition, now),
    noDownedEligible: value.noDownedEligible !== false,
    playerDownedCount: Math.max(0, integer(value.playerDownedCount)),
    missionComplete: value.missionComplete === true,
    completionId: clean(value.completionId, '', 220) || null,
    masteryScore: Math.max(0, Math.min(100, integer(value.masteryScore))),
    masteryGrade: clean(value.masteryGrade, 'UNRANKED', 20).toUpperCase(),
    medals: Array.isArray(value.medals) ? value.medals.map(clone).slice(0, 10) : [],
    rewardMultiplier: Math.max(1, finite(value.rewardMultiplier, 1 + rewardBonus(modifiers))),
    rewardPoints: Math.max(0, integer(value.rewardPoints)),
    createdAt: Math.max(0, integer(value.createdAt, base.createdAt)),
    updatedAt: Math.max(0, integer(value.updatedAt, now))
  };
}

function gradeForScore(score) {
  const value = Math.max(0, Math.min(100, integer(score)));
  if (value >= 90) return 'S';
  if (value >= 78) return 'A';
  if (value >= 64) return 'B';
  if (value >= 48) return 'C';
  return 'D';
}

function buildMastery(state, mission = {}) {
  let score = 30;
  if (state.boss.status === POST_FINAL8_BOSS_STATUS.DEFEATED) score += 25;
  score += Math.min(12, state.boss.weakPointHits * 2);
  score += Math.min(12, state.boss.staggerCount * 4);
  if (state.noDownedEligible) score += 10;
  if (String(mission.riskChoice || '').toUpperCase() === 'OVERDRIVE') score += 8;
  score += Math.min(8, Math.max(0, integer(mission.optionalStagesCompleted)) * 4);
  score += Math.min(8, state.modifiers.length * 3);
  score = Math.max(0, Math.min(100, integer(score)));

  const medals = [
    {
      id: `${state.faction.id}-MASTERY`,
      label: `${state.faction.label.toUpperCase()} MASTERY`,
      score
    },
    {
      id: 'BOSS-BREAKER',
      label: 'BOSS BREAKER',
      score: state.boss.staggerCount
    }
  ];
  if (state.boss.weakPointHits >= 4) {
    medals.push({ id: 'WEAK-POINT-SPECIALIST', label: 'WEAK-POINT SPECIALIST', score: state.boss.weakPointHits });
  }
  if (state.noDownedEligible) {
    medals.push({ id: 'UNBROKEN-TEAM', label: 'UNBROKEN TEAM', score: 1 });
  }
  if (String(mission.riskChoice || '').toUpperCase() === 'OVERDRIVE') {
    medals.push({ id: 'OVERDRIVE-MASTERY', label: 'OVERDRIVE MASTERY', score: 1 });
  }
  return { score, grade: gradeForScore(score), medals: medals.slice(0, 8) };
}

export class PostFinal8ReplayDirector {
  constructor(value = null) {
    this.state = normalizePostFinal8State(value || createPostFinal8State());
    this.pendingEvents = [];
  }

  pushEvent(event) {
    this.pendingEvents.push(clone(event));
    if (this.pendingEvents.length > MAX_EVENTS) {
      this.pendingEvents.splice(0, this.pendingEvents.length - MAX_EVENTS);
    }
  }

  reset(details = {}) {
    this.state = createPostFinal8State(details);
    this.pendingEvents.length = 0;
    this.pushEvent({
      type: 'FACTION_ASSIGNED',
      eventId: `${this.state.runId}:postfinal8:faction`,
      faction: clone(this.state.faction),
      modifiers: clone(this.state.modifiers),
      boss: clone(this.state.boss),
      at: this.state.updatedAt
    });
    return this.getSnapshot(details.now);
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (!snapshot || snapshot.patch !== POST_FINAL8_PATCH) return false;
    if (integer(snapshot.schema) !== POST_FINAL8_SCHEMA) return false;
    if (this.state.runId && snapshot.runId && this.state.runId !== snapshot.runId) return false;
    this.state = normalizePostFinal8State(snapshot, now);
    return true;
  }

  getEncounterMultipliers() {
    const multipliers = { ...(this.state.faction.weights || {}) };
    const specialScale = combinedTuning(this.state.modifiers, 'specialWeightScale', 1);
    ['BRUTE', 'GOLIATH', 'EXPLODER', 'RANGED'].forEach((type) => {
      multipliers[type] = Math.max(0.35, finite(multipliers[type], 1) * specialScale);
    });
    const phasePressure = 1 + Math.max(0, integer(this.state.boss?.phase)) * 0.18;
    ['RUNNER', 'EXPLODER', 'RANGED', 'BRUTE'].forEach((type) => {
      multipliers[type] = Math.max(0.35, finite(multipliers[type], 1) * phasePressure);
    });
    if (this.state.boss?.status === POST_FINAL8_BOSS_STATUS.PENDING) {
      const requiredBossType = clean(this.state.boss.enemyType, 'GOLIATH', 40).toUpperCase();
      multipliers[requiredBossType] = Math.max(4.5, finite(multipliers[requiredBossType], 1) * 4.5);
    }
    return Object.freeze({ ...multipliers });
  }

  getObjectiveTuning() {
    return Object.freeze({
      timeScale: combinedTuning(this.state.modifiers, 'objectiveTimeScale', 1),
      markerRangeScale: combinedTuning(this.state.modifiers, 'markerRangeScale', 1)
    });
  }

  nextSpawnTuning({
    enemyType = 'SHAMBLER',
    bossStage = false,
    elite = false
  } = {}) {
    this.state.spawnSerial += 1;
    const type = clean(enemyType, 'SHAMBLER', 40).toUpperCase();
    const faction = this.state.faction;
    const modifiers = this.state.modifiers;
    const affixes = elite
      ? this.state.eliteAffixes.map(clone)
      : [];

    let healthScale = finite(faction.enemyScales?.health, 1)
      * combinedTuning(modifiers, 'enemyHealthScale', 1);
    let speedScale = finite(faction.enemyScales?.speed, 1)
      * combinedTuning(modifiers, 'enemySpeedScale', 1);
    let damageScale = finite(faction.enemyScales?.damage, 1)
      * combinedTuning(modifiers, 'enemyDamageScale', 1);

    if (elite) {
      healthScale *= combinedTuning(modifiers, 'eliteHealthScale', 1);
      for (const entry of affixes) {
        healthScale *= Math.max(0.5, finite(entry?.tuning?.healthScale, 1));
        speedScale *= Math.max(0.5, finite(entry?.tuning?.speedScale, 1));
        damageScale *= Math.max(0.5, finite(entry?.tuning?.damageScale, 1));
      }
    }

    let bossProfile = null;
    if (
      bossStage
      && this.state.boss.status === POST_FINAL8_BOSS_STATUS.PENDING
      && ['BRUTE', 'GOLIATH', 'RUNNER', 'RANGED', 'EXPLODER'].includes(type)
      && type === clean(this.state.boss.enemyType, type, 40).toUpperCase()
    ) {
      bossProfile = clone(this.state.boss);
      healthScale *= 2.15 + Math.max(0, this.state.playerCount - 1) * 0.22;
      speedScale *= combinedTuning(modifiers, 'bossSpeedScale', 1);
      damageScale *= combinedTuning(modifiers, 'bossDamageScale', 1);
    }

    this.state.updatedAt = Date.now();
    return Object.freeze({
      patch: POST_FINAL8_PATCH,
      factionId: faction.id,
      factionLabel: faction.label,
      factionColor: faction.color,
      emissiveHex: integer(faction.emissiveHex),
      enemyType: type,
      healthScale: Math.max(0.5, Math.min(6, healthScale)),
      speedScale: Math.max(0.5, Math.min(2.2, speedScale)),
      damageScale: Math.max(0.5, Math.min(2.2, damageScale)),
      affixes,
      bossProfile
    });
  }

  bindBoss({ enemyId = '', enemyType = '', maxHealth = 0, health = maxHealth } = {}, now = Date.now()) {
    if (this.state.boss.status !== POST_FINAL8_BOSS_STATUS.PENDING) return false;
    const normalizedId = clean(enemyId, '', 180);
    if (!normalizedId) return false;
    this.state.boss = normalizeBoss({
      ...this.state.boss,
      enemyId: normalizedId,
      enemyType: clean(enemyType, this.state.boss.enemyType, 40).toUpperCase(),
      maxHealth: Math.max(1, finite(maxHealth, health)),
      health: Math.max(1, finite(health, maxHealth)),
      status: POST_FINAL8_BOSS_STATUS.ACTIVE,
      boundAt: now,
      updatedAt: now
    }, this.state.boss, now);
    this.state.updatedAt = integer(now, Date.now());
    this.pushEvent({
      type: 'BOSS_DEPLOYED',
      eventId: `${this.state.runId}:postfinal8:boss:${normalizedId}`,
      boss: clone(this.state.boss),
      at: this.state.updatedAt
    });
    return true;
  }

  recordPlayerDowned(actorId = '', now = Date.now()) {
    if (!this.state.noDownedEligible) return false;
    this.state.noDownedEligible = false;
    this.state.playerDownedCount += 1;
    this.state.updatedAt = integer(now, Date.now());
    this.pushEvent({
      type: 'NO_DOWNED_BONUS_LOST',
      eventId: `${this.state.runId}:postfinal8:downed:${this.state.playerDownedCount}`,
      actorId: clean(actorId, 'TEAM', 160),
      at: this.state.updatedAt
    });
    return true;
  }

  recordBossDamage({
    enemyId = '',
    damage = 0,
    headshot = false,
    actorId = '',
    health = null,
    maxHealth = null
  } = {}, now = Date.now()) {
    const boss = this.state.boss;
    if (
      boss.status !== POST_FINAL8_BOSS_STATUS.ACTIVE
      || clean(enemyId, '', 180) !== boss.enemyId
    ) {
      return { accepted: false, events: [] };
    }

    const amount = Math.max(0, finite(damage));
    const resolvedMax = Math.max(1, finite(maxHealth, boss.maxHealth));
    const resolvedHealth = health == null
      ? Math.max(0, finite(boss.health) - amount)
      : Math.max(0, Math.min(resolvedMax, finite(health)));

    boss.maxHealth = resolvedMax;
    boss.health = resolvedHealth;
    if (headshot) boss.weakPointHits += 1;

    const staggerScale = combinedTuning(this.state.modifiers, 'staggerScale', 1);
    const contribution = Math.max(
      headshot ? 8 : 1.5,
      (amount / resolvedMax) * (headshot ? 420 : 140)
    ) * staggerScale;
    boss.stagger += contribution;

    const events = [];
    if (boss.stagger >= 100) {
      boss.stagger = 0;
      boss.staggerCount += 1;
      const event = {
        type: 'BOSS_STAGGERED',
        eventId: `${this.state.runId}:postfinal8:stagger:${boss.staggerCount}`,
        boss: clone(boss),
        actorId: clean(actorId, 'TEAM', 160),
        at: integer(now, Date.now())
      };
      events.push(event);
      this.pushEvent(event);
    }

    const ratio = resolvedHealth / resolvedMax;
    let phase = 0;
    if (ratio <= PHASE_THRESHOLDS[1]) phase = 2;
    else if (ratio <= PHASE_THRESHOLDS[0]) phase = 1;

    if (phase > boss.phase) {
      boss.phase = phase;
      boss.armorBroken = Math.max(boss.armorBroken, phase);
      boss.reinforcementWaves += 1;
      const event = {
        type: 'BOSS_PHASE_CHANGED',
        eventId: `${this.state.runId}:postfinal8:phase:${phase}`,
        boss: clone(boss),
        phase,
        at: integer(now, Date.now())
      };
      events.push(event);
      this.pushEvent(event);
    }

    boss.updatedAt = integer(now, Date.now());
    this.state.updatedAt = boss.updatedAt;
    return { accepted: true, events: clone(events), boss: clone(boss) };
  }

  recordBossKilled({ enemyId = '', actorId = '' } = {}, now = Date.now()) {
    const boss = this.state.boss;
    if (
      boss.status !== POST_FINAL8_BOSS_STATUS.ACTIVE
      || clean(enemyId, '', 180) !== boss.enemyId
    ) {
      return false;
    }
    boss.status = POST_FINAL8_BOSS_STATUS.DEFEATED;
    boss.health = 0;
    boss.phase = 2;
    boss.armorBroken = 3;
    boss.defeatedAt = integer(now, Date.now());
    boss.updatedAt = boss.defeatedAt;
    this.state.updatedAt = boss.defeatedAt;
    this.pushEvent({
      type: 'BOSS_DEFEATED',
      eventId: `${this.state.runId}:postfinal8:boss-defeated`,
      boss: clone(boss),
      actorId: clean(actorId, 'TEAM', 160),
      at: boss.defeatedAt
    });
    return true;
  }

  observeMission(mission = {}, now = Date.now()) {
    if (
      this.state.missionComplete
      || String(mission.status || '').toUpperCase() !== 'COMPLETE'
      || !mission.completionId
    ) {
      return false;
    }
    const mastery = buildMastery(this.state, mission);
    this.state.missionComplete = true;
    this.state.completionId = `${clean(mission.completionId, this.state.runId, 200)}:postfinal8`;
    this.state.masteryScore = mastery.score;
    this.state.masteryGrade = mastery.grade;
    this.state.medals = mastery.medals;
    this.state.rewardMultiplier = Math.max(
      1,
      1 + rewardBonus(this.state.modifiers)
      + (String(mission.riskChoice || '').toUpperCase() === 'OVERDRIVE' ? 0.25 : 0)
      + (this.state.noDownedEligible ? 0.10 : 0)
    );
    this.state.rewardPoints = Math.max(
      0,
      Math.round(300 * this.state.rewardMultiplier + this.state.masteryScore * 5)
    );
    this.state.updatedAt = integer(now, Date.now());
    this.pushEvent({
      type: 'REPLAYABILITY_MASTERY_COMPLETE',
      eventId: this.state.completionId,
      replayability: this.getSnapshot(now),
      at: this.state.updatedAt
    });
    return true;
  }

  consumeEvents() {
    const events = this.pendingEvents.map(clone);
    this.pendingEvents.length = 0;
    return events;
  }

  getSnapshot(now = Date.now()) {
    return Object.freeze(clone(normalizePostFinal8State({
      ...this.state,
      updatedAt: integer(now, Date.now())
    }, now)));
  }
}

export function computePostFinal8Reward(value = {}) {
  const state = normalizePostFinal8State(value);
  return Math.max(
    0,
    Math.round(
      Math.max(0, finite(state.rewardPoints))
      || (300 * Math.max(1, finite(state.rewardMultiplier, 1))
        + Math.max(0, finite(state.masteryScore)) * 5)
    )
  );
}

export function getPostFinal8FactionDefinition(factionId) {
  return clone(factionDefinition(factionId));
}
