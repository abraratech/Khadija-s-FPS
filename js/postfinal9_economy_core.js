import {
  GAMEPLAY2_PATCH,
  deriveGameplay2MutationReceipt
} from './gameplay2_mutation_core.js';

// POST-FINAL.9 R1 — server-authoritative economy, prestige, mastery, reputation, and collections.

export const POST_FINAL9_PATCH = 'post-final9-r1-economy-rewards-long-term-progression';
export const POST_FINAL9_SCHEMA = 1;
export const POST_FINAL9_LEDGER_LIMIT = 32;
export const POST_FINAL9_PRESTIGE_CAP = 20;
export const POST_FINAL9_FACTION_LEVEL_CAP = 20;
export const POST_FINAL9_MASTERY_LEVEL_CAP = 30;

export const POST_FINAL9_FACTIONS = Object.freeze([
  'VANGUARD_CORPS',
  'WASTELAND_RAIDERS',
  'BIOHAZARD_SWARM',
  'MACHINE_COLLECTIVE'
]);

export const POST_FINAL9_COSMETIC_CATALOG = Object.freeze([
  Object.freeze({ id: 'BANNER_VANGUARD_COMMAND', label: 'Vanguard Command', kind: 'BANNER', factionId: 'VANGUARD_CORPS' }),
  Object.freeze({ id: 'BADGE_VANGUARD_BREACH', label: 'Breach Star', kind: 'BADGE', factionId: 'VANGUARD_CORPS' }),
  Object.freeze({ id: 'BANNER_RAIDER_EMBER', label: 'Raider Ember', kind: 'BANNER', factionId: 'WASTELAND_RAIDERS' }),
  Object.freeze({ id: 'TITLE_WASTELAND_HUNTER', label: 'Wasteland Hunter', kind: 'TITLE', factionId: 'WASTELAND_RAIDERS' }),
  Object.freeze({ id: 'BANNER_SWARM_CONTAINMENT', label: 'Swarm Containment', kind: 'BANNER', factionId: 'BIOHAZARD_SWARM' }),
  Object.freeze({ id: 'BADGE_BIOHAZARD_CLEANSER', label: 'Biohazard Cleanser', kind: 'BADGE', factionId: 'BIOHAZARD_SWARM' }),
  Object.freeze({ id: 'BANNER_MACHINE_SIGNAL', label: 'Machine Signal', kind: 'BANNER', factionId: 'MACHINE_COLLECTIVE' }),
  Object.freeze({ id: 'TITLE_CORE_BREAKER', label: 'Core Breaker', kind: 'TITLE', factionId: 'MACHINE_COLLECTIVE' }),
  Object.freeze({ id: 'BADGE_BOSS_BREAKER', label: 'Boss Breaker', kind: 'BADGE', factionId: '' }),
  Object.freeze({ id: 'TITLE_OVERDRIVE_ACE', label: 'Overdrive Ace', kind: 'TITLE', factionId: '' }),
  Object.freeze({ id: 'BANNER_PRESTIGE_I', label: 'Prestige I', kind: 'BANNER', factionId: '' }),
  Object.freeze({ id: 'BADGE_MASTERY_VETERAN', label: 'Mastery Veteran', kind: 'BADGE', factionId: '' })
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}

function clean(value, fallback = '', maximum = 120) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || String(fallback || '')).slice(0, maximum);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function dayKey(now = Date.now()) {
  return new Date(integer(now, Date.now(), 1)).toISOString().slice(0, 10);
}

function weekKey(now = Date.now()) {
  const date = new Date(integer(now, Date.now(), 1));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function levelFromPoints(points, cap, base, growth) {
  let remaining = integer(points, 0);
  let level = 0;
  while (level < cap) {
    const required = base + level * growth;
    if (remaining < required) break;
    remaining -= required;
    level += 1;
  }
  return Object.freeze({
    level,
    pointsIntoLevel: remaining,
    pointsToNext: level >= cap ? 0 : base + level * growth,
    capped: level >= cap
  });
}

function prestigeBaseXp() {
  let total = 0;
  for (let level = 1; level < 50; level += 1) {
    total += 430 + level * 170 + Math.floor(Math.pow(Math.max(0, level - 1), 1.28) * 24);
  }
  return total;
}

export function derivePostFinal9Prestige(totalXp = 0) {
  const baseXp = prestigeBaseXp();
  let remaining = Math.max(0, integer(totalXp, 0) - baseXp);
  let level = 0;
  while (level < POST_FINAL9_PRESTIGE_CAP) {
    const required = 12000 + level * 2500;
    if (remaining < required) break;
    remaining -= required;
    level += 1;
  }
  return Object.freeze({
    level,
    xpIntoPrestige: remaining,
    xpToNext: level >= POST_FINAL9_PRESTIGE_CAP ? 0 : 12000 + level * 2500,
    capped: level >= POST_FINAL9_PRESTIGE_CAP,
    baseXp
  });
}

function normalizeMasteryMap(value, now = Date.now()) {
  const source = isObject(value) ? value : {};
  const output = {};
  Object.entries(source).slice(0, 64).forEach(([key, entry]) => {
    const id = clean(key, '', 100);
    if (!id) return;
    const item = isObject(entry) ? entry : {};
    const xp = integer(item.xp, 0, 0, 50_000_000);
    const info = levelFromPoints(xp, POST_FINAL9_MASTERY_LEVEL_CAP, 350, 125);
    output[id] = {
      id,
      xp,
      level: info.level,
      xpIntoLevel: info.pointsIntoLevel,
      xpToNext: info.pointsToNext,
      lastUsedAt: integer(item.lastUsedAt, now, 0)
    };
  });
  return output;
}

function normalizeFactionReputation(value) {
  const source = isObject(value) ? value : {};
  const output = {};
  POST_FINAL9_FACTIONS.forEach((id) => {
    const entry = isObject(source[id]) ? source[id] : {};
    const points = integer(entry.points, 0, 0, 50_000_000);
    const info = levelFromPoints(points, POST_FINAL9_FACTION_LEVEL_CAP, 200, 80);
    output[id] = {
      id,
      points,
      level: info.level,
      pointsIntoLevel: info.pointsIntoLevel,
      pointsToNext: info.pointsToNext
    };
  });
  return output;
}

function normalizeGoalCycle(value, scope, key) {
  const source = isObject(value) && value.key === key ? value : {};
  const weekly = scope === 'WEEKLY';
  const definitions = weekly
    ? [
        ['RUNS', 'Complete 5 runs', 5, 220, 12],
        ['BOSSES', 'Defeat 3 mission bosses', 3, 260, 16],
        ['OVERDRIVE', 'Complete 2 Overdrive extractions', 2, 300, 18]
      ]
    : [
        ['RUNS', 'Complete one run', 1, 70, 4],
        ['BOSSES', 'Defeat one mission boss', 1, 90, 5],
        ['SUPPORT', 'Perform 3 support actions', 3, 80, 4]
      ];
  const previous = new Map(
    Array.isArray(source.goals)
      ? source.goals.filter(isObject).map((entry) => [entry.id, entry])
      : []
  );
  return {
    scope,
    key,
    goals: definitions.map(([id, label, target, credits, salvage]) => {
      const entry = previous.get(id) || {};
      const progress = Math.min(target, integer(entry.progress, 0));
      return {
        id,
        label,
        target,
        progress,
        completed: entry.completed === true || progress >= target,
        rewarded: entry.rewarded === true,
        credits,
        salvage
      };
    })
  };
}

function normalizeGoals(value, now = Date.now()) {
  const source = isObject(value) ? value : {};
  return {
    daily: normalizeGoalCycle(source.daily, 'DAILY', dayKey(now)),
    weekly: normalizeGoalCycle(source.weekly, 'WEEKLY', weekKey(now))
  };
}

export function createDefaultPostFinal9Economy(now = Date.now(), totalXp = 0) {
  return {
    schema: POST_FINAL9_SCHEMA,
    patch: POST_FINAL9_PATCH,
    currencies: {
      arenaCredits: 0,
      salvage: 0,
      factionTokens: Object.fromEntries(POST_FINAL9_FACTIONS.map((id) => [id, 0]))
    },
    prestige: derivePostFinal9Prestige(totalXp),
    factionReputation: normalizeFactionReputation({}),
    weaponMastery: {},
    loadoutMastery: {},
    missionMastery: {},
    collections: {
      owned: {},
      duplicateConversions: 0,
      totalDrops: 0
    },
    goals: normalizeGoals({}, now),
    ledger: [],
    totals: {
      creditsEarned: 0,
      salvageEarned: 0,
      factionTokensEarned: 0,
      reputationEarned: 0,
      masteryXpEarned: 0,
      receiptsApplied: 0
    },
    lastAward: null,
    updatedAt: integer(now, Date.now(), 1)
  };
}

export function normalizePostFinal9Economy(value, { now = Date.now(), totalXp = 0 } = {}) {
  const source = isObject(value) ? value : {};
  const defaults = createDefaultPostFinal9Economy(now, totalXp);
  const currencies = isObject(source.currencies) ? source.currencies : {};
  const factionTokensSource = isObject(currencies.factionTokens) ? currencies.factionTokens : {};
  const ownedSource = isObject(source.collections?.owned) ? source.collections.owned : {};
  const owned = {};
  POST_FINAL9_COSMETIC_CATALOG.forEach((entry) => {
    const at = integer(ownedSource[entry.id], 0);
    if (at > 0) owned[entry.id] = at;
  });
  const ledger = Array.isArray(source.ledger)
    ? source.ledger.filter(isObject).map((entry) => ({
        runId: clean(entry.runId, '', 120),
        awardedAt: integer(entry.awardedAt, 0),
        credits: integer(entry.credits, 0),
        salvage: integer(entry.salvage, 0),
        factionId: POST_FINAL9_FACTIONS.includes(entry.factionId) ? entry.factionId : '',
        factionTokens: integer(entry.factionTokens, 0),
        reputation: integer(entry.reputation, 0),
        collectionId: clean(entry.collectionId, '', 100),
        duplicateConverted: entry.duplicateConverted === true
      })).filter((entry) => entry.runId).slice(-POST_FINAL9_LEDGER_LIMIT)
    : [];
  const totals = isObject(source.totals) ? source.totals : {};
  return {
    schema: POST_FINAL9_SCHEMA,
    patch: POST_FINAL9_PATCH,
    currencies: {
      arenaCredits: integer(currencies.arenaCredits, 0, 0, 500_000_000),
      salvage: integer(currencies.salvage, 0, 0, 100_000_000),
      factionTokens: Object.fromEntries(POST_FINAL9_FACTIONS.map((id) => [
        id,
        integer(factionTokensSource[id], 0, 0, 100_000_000)
      ]))
    },
    prestige: derivePostFinal9Prestige(totalXp),
    factionReputation: normalizeFactionReputation(source.factionReputation),
    weaponMastery: normalizeMasteryMap(source.weaponMastery, now),
    loadoutMastery: normalizeMasteryMap(source.loadoutMastery, now),
    missionMastery: normalizeMasteryMap(source.missionMastery, now),
    collections: {
      owned,
      duplicateConversions: integer(source.collections?.duplicateConversions, 0),
      totalDrops: integer(source.collections?.totalDrops, 0)
    },
    goals: normalizeGoals(source.goals, now),
    ledger,
    totals: {
      creditsEarned: integer(totals.creditsEarned, 0),
      salvageEarned: integer(totals.salvageEarned, 0),
      factionTokensEarned: integer(totals.factionTokensEarned, 0),
      reputationEarned: integer(totals.reputationEarned, 0),
      masteryXpEarned: integer(totals.masteryXpEarned, 0),
      receiptsApplied: integer(totals.receiptsApplied, ledger.length)
    },
    lastAward: isObject(source.lastAward) ? clone(source.lastAward) : null,
    updatedAt: integer(source.updatedAt, defaults.updatedAt, 1)
  };
}

export function normalizePostFinal9ReceiptFields(value = {}) {
  const source = isObject(value) ? value : {};
  const factionId = POST_FINAL9_FACTIONS.includes(source.factionId)
    ? source.factionId
    : '';
  const grade = clean(source.replayMasteryGrade, 'UNRANKED', 16).toUpperCase();
  const risk = clean(source.missionRiskChoice, 'NONE', 24).toUpperCase();
  const bossDefeatedText = clean(source.bossDefeated, '', 100).toUpperCase();
  const gameMode = clean(source.gameMode, 'survival', 40).toLowerCase();
  const gameplay2Receipt = source.gameplay2Patch === GAMEPLAY2_PATCH && gameMode !== 'pvp'
    ? deriveGameplay2MutationReceipt({
        runId: source.runId,
        mapId: source.mapId,
        difficulty: source.difficulty,
        wave: source.wave || (integer(source.wavesCleared, 0, 0, 249) + 1),
        gameMode: 'survival',
        enabled: true,
        now: integer(source.endedAt, Date.now(), 1)
      })
    : null;
  return Object.freeze({
    factionId,
    bossId: clean(source.bossId, '', 100),
    bossDefeated: source.bossDefeated === true || Boolean(bossDefeatedText && bossDefeatedText !== 'NONE' && bossDefeatedText !== 'FALSE'),
    bossWeakPointHits: integer(source.bossWeakPointHits, 0, 0, 500),
    bossStaggers: integer(source.bossStaggers, 0, 0, 100),
    replayModifierCount: integer(source.replayModifierCount, 0, 0, 8),
    replayMasteryGrade: /^[SABCD]$/.test(grade) ? grade : 'UNRANKED',
    missionRiskChoice: ['SECURE', 'OVERDRIVE', 'NONE'].includes(risk) ? risk : 'NONE',
    missionChainsCompleted: integer(source.missionChainsCompleted, 0, 0, 10),
    missionStagesCompleted: integer(source.missionStagesCompleted, 0, 0, 60),
    missionOptionalStagesCompleted: integer(source.missionOptionalStagesCompleted, 0, 0, 20),
    contributionRole: clean(source.contributionRole, 'VANGUARD', 32).toUpperCase(),
    loadoutId: clean(source.loadoutId, 'default-loadout', 100),
    primaryWeaponId: clean(source.primaryWeaponId, 'PISTOL', 80).toUpperCase(),
    missionId: clean(source.missionId, source.mapId || 'unknown-mission', 100),
    gameMode: gameMode === 'pvp' ? 'pvp' : 'survival',
    gameplay2Patch: gameplay2Receipt?.patch || '',
    mutationActiveIds: Object.freeze([...(gameplay2Receipt?.activeIds || [])]),
    mutationActiveCount: integer(gameplay2Receipt?.activeCount, 0, 0, 3),
    mutationHistoryCount: integer(gameplay2Receipt?.historyCount, 0, 0, 64),
    mutationPeakActiveCount: integer(gameplay2Receipt?.peakActiveCount, 0, 0, 3),
    mutationRewardMultiplier: Math.max(1, Math.min(1.75, finite(gameplay2Receipt?.rewardMultiplier, 1))),
    mutationPeakRewardMultiplier: Math.max(1, Math.min(1.75, finite(gameplay2Receipt?.peakRewardMultiplier, 1))),
    objectivesCompleted: integer(source.objectivesCompleted, 0, 0, 100),
    assists: integer(source.assists, 0, 0, 5000),
    revives: integer(source.revives, 0, 0, 100),
    kills: integer(source.kills, 0, 0, 5000),
    headshots: integer(source.headshots, 0, 0, 5000),
    damageDealt: integer(source.damageDealt, 0, 0, 25_000_000),
    wavesCleared: integer(source.wavesCleared, 0, 0, 249),
    difficulty: Math.max(0.5, Math.min(2, finite(source.difficulty, 1))),
    reason: clean(source.reason, 'ENDED', 80).toUpperCase(),
    runId: clean(source.runId, '', 120),
    endedAt: integer(source.endedAt, Date.now(), 1)
  });
}

function gradeBonus(grade) {
  return ({ S: 1.45, A: 1.28, B: 1.16, C: 1.08, D: 1.02 })[grade] || 1;
}

function completedRun(receipt) {
  return !/QUIT|LEAVE|ABANDON|CANCEL/.test(receipt.reason);
}

function supportActions(receipt) {
  return receipt.revives + Math.floor(receipt.assists / 2) + Math.min(3, receipt.objectivesCompleted);
}

function updateGoals(goalsValue, receipt) {
  const goals = normalizeGoals(goalsValue, receipt.endedAt);
  let credits = 0;
  let salvage = 0;
  const support = supportActions(receipt);
  for (const cycle of [goals.daily, goals.weekly]) {
    cycle.goals = cycle.goals.map((goal) => {
      let increment = 0;
      if (goal.id === 'RUNS' && completedRun(receipt)) increment = 1;
      if (goal.id === 'BOSSES' && receipt.bossDefeated) increment = 1;
      if (goal.id === 'OVERDRIVE' && receipt.missionRiskChoice === 'OVERDRIVE' && completedRun(receipt)) increment = 1;
      if (goal.id === 'SUPPORT') increment = support;
      const progress = Math.min(goal.target, goal.progress + increment);
      const completed = progress >= goal.target;
      const newlyRewarded = completed && !goal.rewarded;
      if (newlyRewarded) {
        credits += goal.credits;
        salvage += goal.salvage;
      }
      return {
        ...goal,
        progress,
        completed,
        rewarded: goal.rewarded || newlyRewarded
      };
    });
  }
  return { goals, credits, salvage };
}

function selectCollectionDrop(receipt) {
  if (!completedRun(receipt) || (!receipt.bossDefeated && receipt.missionChainsCompleted <= 0)) {
    return null;
  }
  const factionPool = POST_FINAL9_COSMETIC_CATALOG.filter((entry) => (
    !entry.factionId || entry.factionId === receipt.factionId
  ));
  if (!factionPool.length) return null;
  return factionPool[hash32(`${receipt.runId}:${receipt.factionId}:${receipt.bossId}`) % factionPool.length];
}

function addMastery(map, id, xp, now) {
  const key = clean(id, '', 100);
  if (!key || xp <= 0) return;
  const current = map[key] || { id: key, xp: 0, level: 0, xpIntoLevel: 0, xpToNext: 350, lastUsedAt: now };
  const totalXp = integer(current.xp, 0) + integer(xp, 0);
  const info = levelFromPoints(totalXp, POST_FINAL9_MASTERY_LEVEL_CAP, 350, 125);
  map[key] = {
    id: key,
    xp: totalXp,
    level: info.level,
    xpIntoLevel: info.pointsIntoLevel,
    xpToNext: info.pointsToNext,
    lastUsedAt: now
  };
}

export function calculatePostFinal9EconomyAward(receiptValue = {}, {
  completedOperations = [],
  economy = null,
  now = Date.now()
} = {}) {
  const receipt = normalizePostFinal9ReceiptFields(receiptValue);
  const current = normalizePostFinal9Economy(economy, { now, totalXp: 0 });
  if (!receipt.runId) {
    return Object.freeze({ valid: false, errors: Object.freeze(['RUN_ID_INVALID']), receipt, award: null });
  }
  const abandoned = !completedRun(receipt);
  const support = supportActions(receipt);
  const dailyCompleted = completedOperations.filter((entry) => entry?.scope === 'DAILY').length;
  const weeklyCompleted = completedOperations.filter((entry) => entry?.scope === 'WEEKLY').length;
  const gradeScale = gradeBonus(receipt.replayMasteryGrade);
  const difficultyScale = 0.85 + receipt.difficulty * 0.18;
  const bossCredits = receipt.bossDefeated ? 180 : 0;
  const riskCredits = receipt.missionRiskChoice === 'OVERDRIVE' ? 150 : 0;
  const baseCredits = abandoned ? 0 : (
    80
    + Math.min(400, receipt.kills * 2)
    + Math.min(300, receipt.wavesCleared * 15)
    + receipt.missionChainsCompleted * 120
    + bossCredits
    + receipt.replayModifierCount * 40
    + riskCredits
    + support * 12
    + dailyCompleted * 35
    + weeklyCompleted * 140
  );
  const unmutatedCredits = Math.max(0, Math.round(baseCredits * gradeScale * difficultyScale));
  const mutationRewardMultiplier = abandoned
    ? 1
    : Math.max(1, Math.min(1.75, finite(receipt.mutationRewardMultiplier, 1)));
  const credits = Math.max(0, Math.round(unmutatedCredits * mutationRewardMultiplier));
  const mutationBonusCredits = Math.max(0, credits - unmutatedCredits);
  const salvage = abandoned ? 0 : Math.max(0, Math.round(
    4
    + (receipt.bossDefeated ? 12 : 0)
    + receipt.bossWeakPointHits * 2
    + receipt.bossStaggers * 4
    + receipt.replayModifierCount * 3
    + receipt.missionOptionalStagesCompleted * 5
    + dailyCompleted * 2
    + weeklyCompleted * 6
    + receipt.mutationActiveCount * 2
    + Math.min(12, receipt.mutationHistoryCount)
  ));
  const factionTokens = abandoned || !receipt.factionId ? 0 : Math.max(0, Math.round(
    6
    + (receipt.bossDefeated ? 8 : 0)
    + (receipt.missionRiskChoice === 'OVERDRIVE' ? 5 : 0)
    + ({ S: 6, A: 4, B: 2 }[receipt.replayMasteryGrade] || 0)
  ));
  const reputation = abandoned || !receipt.factionId ? 0 : Math.max(0, Math.round(
    25
    + (receipt.bossDefeated ? 30 : 0)
    + receipt.replayModifierCount * 8
    + receipt.missionStagesCompleted * 3
    + ({ S: 35, A: 24, B: 14, C: 8, D: 4 }[receipt.replayMasteryGrade] || 0)
  ));
  const weaponMasteryXp = abandoned ? 0 : Math.max(0, Math.round(
    receipt.kills * 3
    + receipt.headshots * 4
    + Math.min(260, receipt.damageDealt / 450)
    + (receipt.bossDefeated ? 90 : 0)
  ));
  const loadoutMasteryXp = abandoned ? 0 : Math.max(0, Math.round(
    50 + receipt.wavesCleared * 12 + support * 16 + receipt.missionStagesCompleted * 8
    + receipt.mutationHistoryCount * 8
  ));
  const missionMasteryXp = abandoned ? 0 : Math.max(0, Math.round(
    receipt.missionChainsCompleted * 150
    + receipt.missionStagesCompleted * 20
    + receipt.missionOptionalStagesCompleted * 35
    + (receipt.bossDefeated ? 120 : 0)
    + receipt.mutationHistoryCount * 15
    + receipt.mutationPeakActiveCount * 30
    + ({ S: 140, A: 100, B: 70, C: 45, D: 25 }[receipt.replayMasteryGrade] || 0)
  ));
  const goalResult = updateGoals(current.goals, receipt);
  const collection = selectCollectionDrop(receipt);
  return Object.freeze({
    valid: true,
    errors: Object.freeze([]),
    receipt,
    award: Object.freeze({
      credits: credits + goalResult.credits,
      baseCredits: credits,
      unmutatedCredits,
      mutationBonusCredits,
      mutationRewardMultiplier,
      mutationActiveCount: receipt.mutationActiveCount,
      mutationHistoryCount: receipt.mutationHistoryCount,
      mutationPeakActiveCount: receipt.mutationPeakActiveCount,
      goalCredits: goalResult.credits,
      salvage: salvage + goalResult.salvage,
      baseSalvage: salvage,
      goalSalvage: goalResult.salvage,
      factionId: receipt.factionId,
      factionTokens,
      reputation,
      weaponMasteryXp,
      loadoutMasteryXp,
      missionMasteryXp,
      supportActions: support,
      dailyOperationsCompleted: dailyCompleted,
      weeklyOperationsCompleted: weeklyCompleted,
      collectionCandidate: collection ? clone(collection) : null,
      goals: clone(goalResult.goals),
      abandoned
    })
  });
}

export function applyPostFinal9EconomyReceipt(economyValue, receiptValue, {
  totalXp = 0,
  completedOperations = [],
  now = Date.now()
} = {}) {
  const economy = normalizePostFinal9Economy(economyValue, { now, totalXp });
  const receipt = normalizePostFinal9ReceiptFields(receiptValue);
  if (economy.ledger.some((entry) => entry.runId === receipt.runId)) {
    return Object.freeze({
      valid: true,
      idempotent: true,
      receipt,
      economy,
      award: economy.lastAward?.runId === receipt.runId ? clone(economy.lastAward) : null,
      newlyOwned: Object.freeze([])
    });
  }
  const calculated = calculatePostFinal9EconomyAward(receipt, {
    completedOperations,
    economy,
    now
  });
  if (!calculated.valid) return calculated;
  const award = clone(calculated.award);
  economy.goals = clone(award.goals);
  delete award.goals;
  economy.currencies.arenaCredits += award.credits;
  economy.currencies.salvage += award.salvage;
  if (award.factionId) economy.currencies.factionTokens[award.factionId] += award.factionTokens;
  if (award.factionId) {
    const faction = economy.factionReputation[award.factionId];
    faction.points += award.reputation;
    const info = levelFromPoints(faction.points, POST_FINAL9_FACTION_LEVEL_CAP, 200, 80);
    Object.assign(faction, {
      level: info.level,
      pointsIntoLevel: info.pointsIntoLevel,
      pointsToNext: info.pointsToNext
    });
  }
  addMastery(economy.weaponMastery, receipt.primaryWeaponId, award.weaponMasteryXp, now);
  addMastery(economy.loadoutMastery, receipt.loadoutId, award.loadoutMasteryXp, now);
  addMastery(economy.missionMastery, receipt.missionId, award.missionMasteryXp, now);

  let collectionId = '';
  let duplicateConverted = false;
  const newlyOwned = [];
  if (award.collectionCandidate) {
    collectionId = award.collectionCandidate.id;
    economy.collections.totalDrops += 1;
    if (economy.collections.owned[collectionId]) {
      duplicateConverted = true;
      economy.collections.duplicateConversions += 1;
      economy.currencies.salvage += 12;
      award.salvage += 12;
      award.duplicateSalvage = 12;
    } else {
      economy.collections.owned[collectionId] = integer(now, Date.now(), 1);
      newlyOwned.push(clone(award.collectionCandidate));
    }
  }
  delete award.collectionCandidate;

  economy.prestige = derivePostFinal9Prestige(totalXp);
  economy.totals.creditsEarned += award.credits;
  economy.totals.salvageEarned += award.salvage;
  economy.totals.factionTokensEarned += award.factionTokens;
  economy.totals.reputationEarned += award.reputation;
  economy.totals.masteryXpEarned += award.weaponMasteryXp + award.loadoutMasteryXp + award.missionMasteryXp;
  economy.totals.receiptsApplied += 1;
  economy.updatedAt = integer(now, Date.now(), 1);
  economy.ledger = [
    ...economy.ledger,
    {
      runId: receipt.runId,
      awardedAt: economy.updatedAt,
      credits: award.credits,
      salvage: award.salvage,
      factionId: award.factionId,
      factionTokens: award.factionTokens,
      reputation: award.reputation,
      collectionId,
      duplicateConverted
    }
  ].slice(-POST_FINAL9_LEDGER_LIMIT);
  economy.lastAward = {
    runId: receipt.runId,
    awardedAt: economy.updatedAt,
    ...award,
    collectionId,
    duplicateConverted,
    newlyOwned: clone(newlyOwned)
  };
  return Object.freeze({
    valid: true,
    idempotent: false,
    receipt,
    economy: normalizePostFinal9Economy(economy, { now, totalXp }),
    award: Object.freeze(clone(economy.lastAward)),
    newlyOwned: Object.freeze(newlyOwned.map((entry) => Object.freeze(entry)))
  });
}

export function getPostFinal9EconomyPresentation(economyValue, totalXp = 0, now = Date.now()) {
  const economy = normalizePostFinal9Economy(economyValue, { now, totalXp });
  const faction = Object.values(economy.factionReputation)
    .sort((left, right) => right.points - left.points)[0];
  const topWeapon = Object.values(economy.weaponMastery)
    .sort((left, right) => right.xp - left.xp)[0] || null;
  const topMission = Object.values(economy.missionMastery)
    .sort((left, right) => right.xp - left.xp)[0] || null;
  return Object.freeze({
    patch: POST_FINAL9_PATCH,
    currencies: clone(economy.currencies),
    prestige: clone(economy.prestige),
    leadingFaction: faction ? clone(faction) : null,
    topWeapon: topWeapon ? clone(topWeapon) : null,
    topMission: topMission ? clone(topMission) : null,
    ownedCollectionCount: Object.keys(economy.collections.owned).length,
    collectionTotal: POST_FINAL9_COSMETIC_CATALOG.length,
    dailyGoals: clone(economy.goals.daily),
    weeklyGoals: clone(economy.goals.weekly),
    lastAward: clone(economy.lastAward)
  });
}
