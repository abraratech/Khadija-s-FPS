// ENDGAME.1 R1 — deterministic high-difficulty PvE operations.
// Endgame state is host-authoritative, reconnect-safe, profile-owned, and excluded from PvP.

export const ENDGAME1_PATCH = 'endgame1-r1-high-difficulty-operations';
export const ENDGAME1_SCHEMA = 1;

export const ENDGAME1_STATUS = Object.freeze({
  INACTIVE: 'INACTIVE',
  ACTIVE: 'ACTIVE',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
});

export const ENDGAME1_TIER_IDS = Object.freeze({
  VETERAN: 'VETERAN',
  NIGHTMARE: 'NIGHTMARE',
  APEX: 'APEX'
});

export const ENDGAME1_MODIFIERS = Object.freeze({
  ARMORED_HORDE: 'ARMORED_HORDE',
  ELITE_SURGE: 'ELITE_SURGE',
  LOW_SUPPLIES: 'LOW_SUPPLIES',
  RECOVERY_RATIONING: 'RECOVERY_RATIONING',
  ACCELERATED_MUTATIONS: 'ACCELERATED_MUTATIONS',
  BOSS_REINFORCEMENTS: 'BOSS_REINFORCEMENTS',
  HAZARD_SATURATION: 'HAZARD_SATURATION',
  LIMITED_REVIVES: 'LIMITED_REVIVES'
});

const MAX_RECEIPTS = 128;
const MAX_EVENTS = 48;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', maximum = 180) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, maximum);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function freezeClone(value) {
  return Object.freeze(clone(value));
}

function isPvpMode(gameMode) {
  const value = cleanText(gameMode, 'survival', 50).toLowerCase();
  return value === 'pvp' || value.startsWith('pvp-');
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

export const ENDGAME1_TIERS = Object.freeze({
  [ENDGAME1_TIER_IDS.VETERAN]: Object.freeze({
    id: ENDGAME1_TIER_IDS.VETERAN,
    rank: 1,
    label: 'Veteran',
    difficulty: 1.70,
    minimumDifficulty: 1.65,
    recommendedLevel: 18,
    description: 'Escalated elite pressure with forgiving recovery.',
    baseModifierCount: 2,
    reward: Object.freeze({ marks: 2, xpBonus: 180, masteryScale: 1.15 }),
    tuning: Object.freeze({
      enemyHealthScale: 1.12,
      enemyDamageScale: 1.08,
      enemySpeedScale: 1.04,
      enemyAttackRateScale: 0.94,
      eliteHealthScale: 1.12,
      specialWeightScale: 1.15,
      objectiveTargetScale: 1.12,
      objectiveTimeScale: 0.92,
      bossHealthScale: 1.15,
      bossDamageScale: 1.10,
      bossSpeedScale: 1.04,
      reinforcementScale: 1.12,
      hazardScale: 1.10,
      supplyScale: 0.82,
      rewardMultiplier: 1.25,
      maxTeamRevives: 8,
      bleedoutScale: 0.95,
      reviveHoldScale: 1.05,
      allowWaveRespawn: true,
      checkpointPolicy: 'FORGIVING'
    })
  }),
  [ENDGAME1_TIER_IDS.NIGHTMARE]: Object.freeze({
    id: ENDGAME1_TIER_IDS.NIGHTMARE,
    rank: 2,
    label: 'Nightmare',
    difficulty: 1.85,
    minimumDifficulty: 1.80,
    recommendedLevel: 28,
    description: 'Limited recovery, compressed objectives, and aggressive bosses.',
    baseModifierCount: 3,
    reward: Object.freeze({ marks: 4, xpBonus: 300, masteryScale: 1.30 }),
    tuning: Object.freeze({
      enemyHealthScale: 1.25,
      enemyDamageScale: 1.18,
      enemySpeedScale: 1.08,
      enemyAttackRateScale: 0.88,
      eliteHealthScale: 1.22,
      specialWeightScale: 1.30,
      objectiveTargetScale: 1.22,
      objectiveTimeScale: 0.84,
      bossHealthScale: 1.30,
      bossDamageScale: 1.20,
      bossSpeedScale: 1.08,
      reinforcementScale: 1.28,
      hazardScale: 1.24,
      supplyScale: 0.66,
      rewardMultiplier: 1.55,
      maxTeamRevives: 4,
      bleedoutScale: 0.82,
      reviveHoldScale: 1.12,
      allowWaveRespawn: true,
      checkpointPolicy: 'LIMITED'
    })
  }),
  [ENDGAME1_TIER_IDS.APEX]: Object.freeze({
    id: ENDGAME1_TIER_IDS.APEX,
    rank: 3,
    label: 'Apex',
    difficulty: 2.00,
    minimumDifficulty: 1.95,
    recommendedLevel: 40,
    description: 'Maximum objective pressure with tightly rationed recovery.',
    baseModifierCount: 4,
    reward: Object.freeze({ marks: 7, xpBonus: 480, masteryScale: 1.50 }),
    tuning: Object.freeze({
      enemyHealthScale: 1.42,
      enemyDamageScale: 1.30,
      enemySpeedScale: 1.12,
      enemyAttackRateScale: 0.82,
      eliteHealthScale: 1.34,
      specialWeightScale: 1.48,
      objectiveTargetScale: 1.35,
      objectiveTimeScale: 0.75,
      bossHealthScale: 1.48,
      bossDamageScale: 1.32,
      bossSpeedScale: 1.12,
      reinforcementScale: 1.46,
      hazardScale: 1.42,
      supplyScale: 0.50,
      rewardMultiplier: 1.95,
      maxTeamRevives: 2,
      bleedoutScale: 0.70,
      reviveHoldScale: 1.22,
      allowWaveRespawn: false,
      checkpointPolicy: 'EXTRACTION_ONLY'
    })
  })
});

const MODIFIER_DEFINITIONS = Object.freeze({
  [ENDGAME1_MODIFIERS.ARMORED_HORDE]: Object.freeze({
    id: ENDGAME1_MODIFIERS.ARMORED_HORDE,
    label: 'Armored Horde',
    description: 'Hostiles gain reinforced health.',
    effects: Object.freeze({ enemyHealthScale: 1.18, rewardMultiplier: 1.08 })
  }),
  [ENDGAME1_MODIFIERS.ELITE_SURGE]: Object.freeze({
    id: ENDGAME1_MODIFIERS.ELITE_SURGE,
    label: 'Elite Surge',
    description: 'Elite and specialist pressure rises sharply.',
    effects: Object.freeze({ eliteHealthScale: 1.15, specialWeightScale: 1.35, rewardMultiplier: 1.10 })
  }),
  [ENDGAME1_MODIFIERS.LOW_SUPPLIES]: Object.freeze({
    id: ENDGAME1_MODIFIERS.LOW_SUPPLIES,
    label: 'Low Supplies',
    description: 'Recovery and supply availability is reduced.',
    effects: Object.freeze({ supplyScale: 0.62, rewardMultiplier: 1.08 })
  }),
  [ENDGAME1_MODIFIERS.RECOVERY_RATIONING]: Object.freeze({
    id: ENDGAME1_MODIFIERS.RECOVERY_RATIONING,
    label: 'Recovery Rationing',
    description: 'Team recovery is slower and more limited.',
    effects: Object.freeze({ maxTeamRevivesDelta: -1, reviveHoldScale: 1.10, rewardMultiplier: 1.09 })
  }),
  [ENDGAME1_MODIFIERS.ACCELERATED_MUTATIONS]: Object.freeze({
    id: ENDGAME1_MODIFIERS.ACCELERATED_MUTATIONS,
    label: 'Accelerated Mutations',
    description: 'Mutated hostiles attack and move faster.',
    effects: Object.freeze({ enemySpeedScale: 1.07, enemyAttackRateScale: 0.92, rewardMultiplier: 1.09 })
  }),
  [ENDGAME1_MODIFIERS.BOSS_REINFORCEMENTS]: Object.freeze({
    id: ENDGAME1_MODIFIERS.BOSS_REINFORCEMENTS,
    label: 'Boss Reinforcements',
    description: 'Boss phases deploy stronger reinforcement waves.',
    effects: Object.freeze({ bossHealthScale: 1.12, reinforcementScale: 1.28, rewardMultiplier: 1.11 })
  }),
  [ENDGAME1_MODIFIERS.HAZARD_SATURATION]: Object.freeze({
    id: ENDGAME1_MODIFIERS.HAZARD_SATURATION,
    label: 'Hazard Saturation',
    description: 'Arena hazards exert greater pressure.',
    effects: Object.freeze({ hazardScale: 1.38, enemyDamageScale: 1.04, rewardMultiplier: 1.09 })
  }),
  [ENDGAME1_MODIFIERS.LIMITED_REVIVES]: Object.freeze({
    id: ENDGAME1_MODIFIERS.LIMITED_REVIVES,
    label: 'Limited Revives',
    description: 'The team has fewer recovery opportunities.',
    effects: Object.freeze({ maxTeamRevivesDelta: -2, bleedoutScale: 0.90, rewardMultiplier: 1.12 })
  })
});

const MODIFIER_IDS = Object.freeze(Object.values(ENDGAME1_MODIFIERS));

function tierById(tierId) {
  return ENDGAME1_TIERS[cleanText(tierId, '', 40).toUpperCase()] || null;
}

export function resolveEndgame1Tier({ difficulty = 1, gameMode = 'survival' } = {}) {
  if (isPvpMode(gameMode)) return null;
  const value = Math.max(0.5, Math.min(2, finite(difficulty, 1)));
  if (value >= ENDGAME1_TIERS.APEX.minimumDifficulty) return freezeClone(ENDGAME1_TIERS.APEX);
  if (value >= ENDGAME1_TIERS.NIGHTMARE.minimumDifficulty) return freezeClone(ENDGAME1_TIERS.NIGHTMARE);
  if (value >= ENDGAME1_TIERS.VETERAN.minimumDifficulty) return freezeClone(ENDGAME1_TIERS.VETERAN);
  return null;
}

export function selectEndgame1Modifiers({
  runId = 'run',
  mapId = 'grid_bunker',
  tierId = ENDGAME1_TIER_IDS.VETERAN,
  count = null
} = {}) {
  const tier = tierById(tierId) || ENDGAME1_TIERS.VETERAN;
  const wanted = integer(count == null ? tier.baseModifierCount : count, tier.baseModifierCount, 1, MODIFIER_IDS.length);
  const seed = hashText(`${runId}|${mapId}|${tier.id}|${ENDGAME1_PATCH}`);
  const ranked = MODIFIER_IDS
    .map((id, index) => ({
      id,
      score: hashText(`${seed}|${id}|${index}`)
    }))
    .sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))
    .slice(0, wanted)
    .map((entry) => freezeClone(MODIFIER_DEFINITIONS[entry.id]));
  return Object.freeze(ranked);
}

function applyScale(target, key, value) {
  if (!Number.isFinite(Number(value))) return;
  target[key] = Math.max(0.05, finite(target[key], 1) * finite(value, 1));
}

export function computeEndgame1Tuning(tierValue, modifiersValue = []) {
  const tier = typeof tierValue === 'string' ? tierById(tierValue) : tierValue;
  if (!tier) {
    return freezeClone({
      active: false,
      enemyHealthScale: 1,
      enemyDamageScale: 1,
      enemySpeedScale: 1,
      enemyAttackRateScale: 1,
      eliteHealthScale: 1,
      specialWeightScale: 1,
      objectiveTargetScale: 1,
      objectiveTimeScale: 1,
      bossHealthScale: 1,
      bossDamageScale: 1,
      bossSpeedScale: 1,
      reinforcementScale: 1,
      hazardScale: 1,
      supplyScale: 1,
      rewardMultiplier: 1,
      masteryScale: 1,
      maxTeamRevives: null,
      bleedoutScale: 1,
      reviveHoldScale: 1,
      allowWaveRespawn: true,
      checkpointPolicy: 'STANDARD'
    });
  }

  const output = {
    active: true,
    ...clone(tier.tuning),
    masteryScale: finite(tier.reward?.masteryScale, 1)
  };
  for (const modifier of Array.isArray(modifiersValue) ? modifiersValue : []) {
    const definition = MODIFIER_DEFINITIONS[modifier?.id || modifier] || null;
    const effects = definition?.effects || {};
    for (const key of [
      'enemyHealthScale', 'enemyDamageScale', 'enemySpeedScale',
      'enemyAttackRateScale', 'eliteHealthScale', 'specialWeightScale',
      'objectiveTargetScale', 'objectiveTimeScale', 'bossHealthScale',
      'bossDamageScale', 'bossSpeedScale', 'reinforcementScale',
      'hazardScale', 'supplyScale', 'rewardMultiplier', 'bleedoutScale',
      'reviveHoldScale'
    ]) {
      if (effects[key] !== undefined) applyScale(output, key, effects[key]);
    }
    if (Number.isFinite(Number(effects.maxTeamRevivesDelta))) {
      output.maxTeamRevives = Math.max(
        0,
        integer(output.maxTeamRevives, 0) + integer(effects.maxTeamRevivesDelta, 0, -20, 20)
      );
    }
  }
  output.maxTeamRevives = Number.isFinite(Number(output.maxTeamRevives))
    ? integer(output.maxTeamRevives, 0, 0, 99)
    : null;
  return freezeClone(output);
}

export function createDefaultEndgame1Profile(now = Date.now()) {
  return {
    patch: ENDGAME1_PATCH,
    schema: ENDGAME1_SCHEMA,
    marks: 0,
    operationsCompleted: 0,
    firstClears: 0,
    bestTierId: 'NONE',
    bestTierRank: 0,
    flawlessClears: 0,
    tierClears: {
      [ENDGAME1_TIER_IDS.VETERAN]: 0,
      [ENDGAME1_TIER_IDS.NIGHTMARE]: 0,
      [ENDGAME1_TIER_IDS.APEX]: 0
    },
    mapClears: {},
    firstClearKeys: {},
    unlocks: {},
    receipts: [],
    createdAt: integer(now, Date.now(), 1),
    updatedAt: integer(now, Date.now(), 1)
  };
}

export function normalizeEndgame1Profile(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = createDefaultEndgame1Profile(source.createdAt || now);
  output.marks = integer(source.marks, 0);
  output.operationsCompleted = integer(source.operationsCompleted, 0);
  output.firstClears = integer(source.firstClears, 0);
  output.flawlessClears = integer(source.flawlessClears, 0);
  output.createdAt = integer(source.createdAt, output.createdAt, 1);
  output.updatedAt = Math.max(output.createdAt, integer(source.updatedAt, output.createdAt, 1));

  Object.values(ENDGAME1_TIER_IDS).forEach((tierId) => {
    output.tierClears[tierId] = integer(source.tierClears?.[tierId], 0);
  });
  output.bestTierRank = Math.max(0, Math.min(3, integer(source.bestTierRank, 0)));
  output.bestTierId = Object.values(ENDGAME1_TIER_IDS).includes(source.bestTierId)
    ? source.bestTierId
    : (
      Object.values(ENDGAME1_TIERS).find((tier) => tier.rank === output.bestTierRank)?.id
      || 'NONE'
    );

  for (const [key, valueEntry] of Object.entries(source.mapClears || {}).slice(0, 80)) {
    const mapId = cleanText(key, '', 80);
    if (!mapId) continue;
    output.mapClears[mapId] = {
      total: integer(valueEntry?.total, 0),
      bestTierId: Object.values(ENDGAME1_TIER_IDS).includes(valueEntry?.bestTierId)
        ? valueEntry.bestTierId : 'NONE',
      bestTierRank: Math.max(0, Math.min(3, integer(valueEntry?.bestTierRank, 0)))
    };
  }
  for (const [key, timestamp] of Object.entries(source.firstClearKeys || {}).slice(0, 240)) {
    const id = cleanText(key, '', 180);
    const at = integer(timestamp, 0);
    if (id && at > 0) output.firstClearKeys[id] = at;
  }
  for (const [key, timestamp] of Object.entries(source.unlocks || {}).slice(0, 40)) {
    const id = cleanText(key, '', 100);
    const at = integer(timestamp, 0);
    if (id && at > 0) output.unlocks[id] = at;
  }

  const seen = new Set();
  output.receipts = (Array.isArray(source.receipts) ? source.receipts : [])
    .map((entry) => ({
      receiptId: cleanText(entry?.receiptId, '', 240),
      tierId: tierById(entry?.tierId)?.id || ENDGAME1_TIER_IDS.VETERAN,
      mapId: cleanText(entry?.mapId, 'grid_bunker', 80),
      marks: integer(entry?.marks, 0),
      firstClear: entry?.firstClear === true,
      appliedAt: integer(entry?.appliedAt, 0)
    }))
    .filter((entry) => entry.receiptId && !seen.has(entry.receiptId) && seen.add(entry.receiptId))
    .sort((left, right) => right.appliedAt - left.appliedAt || left.receiptId.localeCompare(right.receiptId))
    .slice(0, MAX_RECEIPTS);
  return output;
}

export function mergeEndgame1Profiles(leftValue, rightValue, now = Date.now()) {
  const left = normalizeEndgame1Profile(leftValue, now);
  const right = normalizeEndgame1Profile(rightValue, now);
  const receipts = new Map();
  for (const entry of [...left.receipts, ...right.receipts]) {
    if (!receipts.has(entry.receiptId) || receipts.get(entry.receiptId).appliedAt < entry.appliedAt) {
      receipts.set(entry.receiptId, entry);
    }
  }
  const output = createDefaultEndgame1Profile(Math.min(left.createdAt, right.createdAt));
  output.marks = Math.max(left.marks, right.marks);
  output.operationsCompleted = Math.max(left.operationsCompleted, right.operationsCompleted);
  output.firstClears = Math.max(left.firstClears, right.firstClears);
  output.flawlessClears = Math.max(left.flawlessClears, right.flawlessClears);
  output.bestTierRank = Math.max(left.bestTierRank, right.bestTierRank);
  output.bestTierId = Object.values(ENDGAME1_TIERS)
    .find((tier) => tier.rank === output.bestTierRank)?.id || 'NONE';
  Object.values(ENDGAME1_TIER_IDS).forEach((tierId) => {
    output.tierClears[tierId] = Math.max(left.tierClears[tierId], right.tierClears[tierId]);
  });
  const mapIds = new Set([...Object.keys(left.mapClears), ...Object.keys(right.mapClears)]);
  mapIds.forEach((mapId) => {
    const a = left.mapClears[mapId] || { total: 0, bestTierRank: 0, bestTierId: 'NONE' };
    const b = right.mapClears[mapId] || { total: 0, bestTierRank: 0, bestTierId: 'NONE' };
    const best = a.bestTierRank >= b.bestTierRank ? a : b;
    output.mapClears[mapId] = {
      total: Math.max(a.total, b.total),
      bestTierId: best.bestTierId,
      bestTierRank: best.bestTierRank
    };
  });
  output.firstClearKeys = { ...left.firstClearKeys, ...right.firstClearKeys };
  output.unlocks = { ...left.unlocks, ...right.unlocks };
  output.receipts = [...receipts.values()]
    .sort((a, b) => b.appliedAt - a.appliedAt || a.receiptId.localeCompare(b.receiptId))
    .slice(0, MAX_RECEIPTS);
  output.updatedAt = Math.max(left.updatedAt, right.updatedAt, integer(now, Date.now(), 1));
  return output;
}

export function buildEndgame1CompletionReceipt(stateValue = {}, now = Date.now()) {
  const state = stateValue && typeof stateValue === 'object' ? stateValue : {};
  if (state.active !== true || state.status !== ENDGAME1_STATUS.COMPLETE || !state.tier?.id) return null;
  const tier = tierById(state.tier.id);
  if (!tier) return null;
  const modifierIds = (Array.isArray(state.modifiers) ? state.modifiers : [])
    .map((entry) => cleanText(entry?.id || entry, '', 60).toUpperCase())
    .filter((id) => MODIFIER_DEFINITIONS[id])
    .slice(0, MODIFIER_IDS.length);
  return freezeClone({
    receiptId: cleanText(state.completionId, `endgame1:${state.runId}:${tier.id}`, 240),
    runId: cleanText(state.runId, 'run', 120),
    mapId: cleanText(state.mapId, 'grid_bunker', 80),
    tierId: tier.id,
    tierRank: tier.rank,
    difficulty: Math.max(0.5, Math.min(2, finite(state.difficulty, tier.difficulty))),
    modifierIds,
    flawless: state.noDowned === true,
    completedAt: integer(state.completedAt || now, now, 1)
  });
}

export function applyEndgame1CompletionReceipt(profileValue, receiptValue, now = Date.now()) {
  const profile = normalizeEndgame1Profile(profileValue, now);
  const source = receiptValue && typeof receiptValue === 'object' ? receiptValue : {};
  const receiptId = cleanText(source.receiptId, '', 240);
  const tier = tierById(source.tierId);
  const runId = cleanText(source.runId, '', 120);
  const mapId = cleanText(source.mapId, 'grid_bunker', 80);
  if (!receiptId || !runId || !tier) {
    return freezeClone({ valid: false, applied: false, idempotent: false, profile, award: null, firstClear: false, errors: ['ENDGAME_RECEIPT_INVALID'] });
  }
  if (profile.receipts.some((entry) => entry.receiptId === receiptId)) {
    return freezeClone({ valid: true, applied: false, idempotent: true, profile, award: null, firstClear: false, errors: [] });
  }

  const modifierIds = (Array.isArray(source.modifierIds) ? source.modifierIds : [])
    .map((entry) => cleanText(entry, '', 60).toUpperCase())
    .filter((id, index, values) => MODIFIER_DEFINITIONS[id] && values.indexOf(id) === index)
    .slice(0, MODIFIER_IDS.length);
  const firstClearKey = `${mapId}:${tier.id}`;
  const firstClear = !profile.firstClearKeys[firstClearKey];
  const marks = tier.reward.marks + Math.floor(modifierIds.length / 2) + (firstClear ? tier.rank : 0);
  const xpBonus = tier.reward.xpBonus + modifierIds.length * 20 + (firstClear ? tier.rank * 60 : 0);
  const unlockId = firstClear ? `ENDGAME_${tier.id}_CLEAR` : '';

  profile.marks += marks;
  profile.operationsCompleted += 1;
  profile.tierClears[tier.id] += 1;
  if (source.flawless === true) profile.flawlessClears += 1;
  if (tier.rank > profile.bestTierRank) {
    profile.bestTierRank = tier.rank;
    profile.bestTierId = tier.id;
  }
  const map = profile.mapClears[mapId] || { total: 0, bestTierId: 'NONE', bestTierRank: 0 };
  map.total += 1;
  if (tier.rank > map.bestTierRank) {
    map.bestTierRank = tier.rank;
    map.bestTierId = tier.id;
  }
  profile.mapClears[mapId] = map;
  if (firstClear) {
    profile.firstClearKeys[firstClearKey] = integer(source.completedAt || now, now, 1);
    profile.firstClears += 1;
    profile.unlocks[unlockId] = integer(source.completedAt || now, now, 1);
  }
  profile.receipts = [{
    receiptId,
    tierId: tier.id,
    mapId,
    marks,
    firstClear,
    appliedAt: integer(source.completedAt || now, now, 1)
  }, ...profile.receipts].slice(0, MAX_RECEIPTS);
  profile.updatedAt = Math.max(profile.updatedAt, integer(source.completedAt || now, now, 1));

  return freezeClone({
    valid: true,
    applied: true,
    idempotent: false,
    firstClear,
    errors: [],
    profile,
    award: {
      tierId: tier.id,
      tierLabel: tier.label,
      tierRank: tier.rank,
      marks,
      xpBonus,
      masteryScale: tier.reward.masteryScale,
      rewardMultiplier: computeEndgame1Tuning(tier, modifierIds).rewardMultiplier,
      unlockId
    }
  });
}

export function getEndgame1Presentation(profileValue) {
  const profile = normalizeEndgame1Profile(profileValue);
  return freezeClone({
    patch: ENDGAME1_PATCH,
    schema: ENDGAME1_SCHEMA,
    marks: profile.marks,
    operationsCompleted: profile.operationsCompleted,
    firstClears: profile.firstClears,
    flawlessClears: profile.flawlessClears,
    bestTierId: profile.bestTierId,
    bestTierRank: profile.bestTierRank,
    tierClears: profile.tierClears,
    unlocks: profile.unlocks
  });
}

export function createEndgame1SessionState({
  runId = 'run',
  mapId = 'grid_bunker',
  difficulty = 1,
  gameMode = 'survival',
  profile = null,
  now = Date.now()
} = {}) {
  const tier = resolveEndgame1Tier({ difficulty, gameMode });
  if (!tier) {
    return {
      patch: ENDGAME1_PATCH,
      schema: ENDGAME1_SCHEMA,
      hostAuthoritative: true,
      protocolUnchanged: true,
      progressionProtected: true,
      active: false,
      pvpExcluded: isPvpMode(gameMode),
      status: ENDGAME1_STATUS.INACTIVE,
      runId: cleanText(runId, 'run', 120),
      mapId: cleanText(mapId, 'grid_bunker', 80),
      gameMode: cleanText(gameMode, 'survival', 50),
      difficulty: Math.max(0.5, Math.min(2, finite(difficulty, 1))),
      tier: null,
      modifiers: [],
      tuning: computeEndgame1Tuning(null),
      profile: getEndgame1Presentation(profile),
      noDowned: true,
      downedPlayerIds: [],
      completionId: '',
      completionReceipt: null,
      startedAt: integer(now, Date.now(), 1),
      completedAt: 0,
      events: []
    };
  }
  const modifiers = selectEndgame1Modifiers({ runId, mapId, tierId: tier.id });
  return {
    patch: ENDGAME1_PATCH,
    schema: ENDGAME1_SCHEMA,
    hostAuthoritative: true,
    protocolUnchanged: true,
    progressionProtected: true,
    active: true,
    pvpExcluded: false,
    status: ENDGAME1_STATUS.ACTIVE,
    runId: cleanText(runId, 'run', 120),
    mapId: cleanText(mapId, 'grid_bunker', 80),
    gameMode: cleanText(gameMode, 'survival', 50),
    difficulty: Math.max(0.5, Math.min(2, finite(difficulty, tier.difficulty))),
    tier,
    modifiers,
    tuning: computeEndgame1Tuning(tier, modifiers),
    profile: getEndgame1Presentation(profile),
    noDowned: true,
    downedPlayerIds: [],
    completionId: '',
    completionReceipt: null,
    startedAt: integer(now, Date.now(), 1),
    completedAt: 0,
    events: [{
      type: 'ENDGAME1_OPERATION_ASSIGNED',
      eventId: `${cleanText(runId, 'run', 120)}:endgame1:assigned`,
      tierId: tier.id,
      at: integer(now, Date.now(), 1)
    }]
  };
}

export class Endgame1Director {
  constructor() {
    this.state = createEndgame1SessionState({ gameMode: 'pvp' });
    this.events = [];
  }

  reset(options = {}) {
    this.state = createEndgame1SessionState(options);
    this.events = [...(this.state.events || [])];
    this.state.events = [];
    return this.getSnapshot(options.now || Date.now());
  }

  recordPlayerDowned(playerId, now = Date.now()) {
    if (!this.state.active || this.state.status !== ENDGAME1_STATUS.ACTIVE) return false;
    const id = cleanText(playerId, '', 120);
    if (!id || this.state.downedPlayerIds.includes(id)) return false;
    this.state.downedPlayerIds.push(id);
    this.state.noDowned = false;
    this.events.push({
      type: 'ENDGAME1_RECOVERY_USED',
      eventId: `${this.state.runId}:endgame1:downed:${id}`,
      playerId: id,
      at: integer(now, Date.now(), 1)
    });
    return true;
  }

  update(now = Date.now(), {
    mission = null,
    replay = null,
    boss = null,
    narrative = null,
    world = null,
    campaign = null,
    profile = null
  } = {}) {
    if (!this.state.active) return this.getSnapshot(now);
    if (profile) this.state.profile = getEndgame1Presentation(profile);
    if (
      this.state.status === ENDGAME1_STATUS.ACTIVE
      && (
        mission?.status === 'COMPLETE'
        || world?.status === 'COMPLETE'
        || campaign?.status === 'COMPLETE'
      )
    ) {
      this.complete(now, { mission, replay, boss, narrative, world, campaign });
    }
    return this.getSnapshot(now);
  }

  complete(now = Date.now(), context = {}) {
    if (!this.state.active || this.state.status !== ENDGAME1_STATUS.ACTIVE) return false;
    this.state.status = ENDGAME1_STATUS.COMPLETE;
    this.state.completedAt = integer(now, Date.now(), 1);
    this.state.completionId = `endgame1:${this.state.runId}:${this.state.tier.id}`.slice(0, 240);
    this.state.completionReceipt = buildEndgame1CompletionReceipt(this.state, now);
    this.state.context = {
      missionId: cleanText(context.mission?.missionId, '', 100),
      masteryGrade: cleanText(context.replay?.masteryGrade, 'UNRANKED', 30),
      bossId: cleanText(context.boss?.bossId || context.replay?.boss?.bossId, '', 100),
      narrativeOutcome: cleanText(context.narrative?.outcomeId, '', 80),
      worldSectorId: cleanText(context.world?.presentation?.sector?.sectorId, '', 80),
      campaignControlState: cleanText(context.campaign?.presentation?.sector?.controlState, '', 40)
    };
    this.events.push({
      type: 'ENDGAME1_OPERATION_COMPLETED',
      eventId: `${this.state.completionId}:complete`,
      completionId: this.state.completionId,
      tierId: this.state.tier.id,
      at: this.state.completedAt
    });
    return true;
  }

  fail(reason = 'FAILED', now = Date.now()) {
    if (!this.state.active || this.state.status !== ENDGAME1_STATUS.ACTIVE) return false;
    this.state.status = ENDGAME1_STATUS.FAILED;
    this.state.failureReason = cleanText(reason, 'FAILED', 100).toUpperCase();
    this.state.completedAt = integer(now, Date.now(), 1);
    this.events.push({
      type: 'ENDGAME1_OPERATION_FAILED',
      eventId: `${this.state.runId}:endgame1:failed`,
      reason: this.state.failureReason,
      at: this.state.completedAt
    });
    return true;
  }

  replaceSnapshot(snapshot = {}, now = Date.now()) {
    if (snapshot?.patch !== ENDGAME1_PATCH || Number(snapshot?.schema) !== ENDGAME1_SCHEMA) return false;
    if (
      this.state?.runId
      && this.state.runId !== 'run'
      && snapshot?.runId
      && snapshot.runId !== this.state.runId
    ) return false;
    const tier = snapshot.tier?.id ? tierById(snapshot.tier.id) : null;
    this.state = {
      ...createEndgame1SessionState({
        runId: snapshot.runId,
        mapId: snapshot.mapId,
        difficulty: snapshot.difficulty,
        gameMode: snapshot.gameMode,
        profile: snapshot.profile,
        now: snapshot.startedAt || now
      }),
      ...clone(snapshot),
      tier: tier ? freezeClone(tier) : null,
      modifiers: (Array.isArray(snapshot.modifiers) ? snapshot.modifiers : [])
        .map((entry) => MODIFIER_DEFINITIONS[entry?.id || entry])
        .filter(Boolean)
        .map(freezeClone),
      downedPlayerIds: (Array.isArray(snapshot.downedPlayerIds) ? snapshot.downedPlayerIds : [])
        .map((entry) => cleanText(entry, '', 120))
        .filter(Boolean)
        .slice(0, 12),
      events: []
    };
    this.state.tuning = computeEndgame1Tuning(this.state.tier, this.state.modifiers);
    this.events.length = 0;
    return true;
  }

  getTuning() {
    return freezeClone(this.state.tuning || computeEndgame1Tuning(null));
  }

  getRevivePolicy() {
    const tuning = this.getTuning();
    return freezeClone({
      patch: ENDGAME1_PATCH,
      active: this.state.active === true,
      tierId: this.state.tier?.id || 'NONE',
      maxTeamRevives: tuning.maxTeamRevives,
      bleedoutScale: tuning.bleedoutScale,
      reviveHoldScale: tuning.reviveHoldScale,
      allowWaveRespawn: tuning.allowWaveRespawn !== false,
      checkpointPolicy: tuning.checkpointPolicy || 'STANDARD'
    });
  }

  consumeEvents() {
    return this.events.splice(0);
  }

  getSnapshot(now = Date.now()) {
    return freezeClone({
      ...this.state,
      serverTime: integer(now, Date.now(), 1),
      events: undefined
    });
  }
}
