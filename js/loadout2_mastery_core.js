// LOADOUT.2 R1 — deterministic weapon mastery, operator specialization, and melee progression.
// Profile-owned, receipt-idempotent, merge-safe, and competitively isolated.

export const LOADOUT2_PATCH = 'loadout2-r1-weapon-mastery-operator-specialization-melee';
export const LOADOUT2_SCHEMA = 1;
export const LOADOUT2_MAX_LEVEL = 10;
export const LOADOUT2_MAX_RECEIPTS = 128;

export const LOADOUT2_WEAPON_FAMILIES = Object.freeze([
  'PISTOL',
  'SMG',
  'RIFLE',
  'SHOTGUN',
  'SNIPER',
  'MELEE'
]);

export const LOADOUT2_SPECIALIZATIONS = Object.freeze([
  Object.freeze({
    id: 'FIELD_OPERATIVE',
    label: 'Field Operative',
    description: 'Balanced handling and mastery growth across every weapon family.',
    tuning: Object.freeze({ masteryScale: 1.06, damageScale: 1, reloadScale: 1, recoilScale: 1, meleeDamageScale: 1, meleeCooldownScale: 1 })
  }),
  Object.freeze({
    id: 'VANGUARD',
    label: 'Vanguard',
    description: 'Close-range specialist with stronger and faster Field Knife strikes.',
    tuning: Object.freeze({ masteryScale: 1, damageScale: 1, reloadScale: 0.98, recoilScale: 1, meleeDamageScale: 1.12, meleeCooldownScale: 0.90 })
  }),
  Object.freeze({
    id: 'MARKSMAN',
    label: 'Marksman',
    description: 'Precision specialist with steadier firearm handling.',
    tuning: Object.freeze({ masteryScale: 1, damageScale: 1.01, reloadScale: 1, recoilScale: 0.93, meleeDamageScale: 1, meleeCooldownScale: 1 })
  }),
  Object.freeze({
    id: 'SUPPORT',
    label: 'Support',
    description: 'Team specialist with faster reload handling and objective mastery.',
    tuning: Object.freeze({ masteryScale: 1.04, damageScale: 1, reloadScale: 0.92, recoilScale: 0.98, meleeDamageScale: 1, meleeCooldownScale: 0.98 })
  }),
  Object.freeze({
    id: 'ENGINEER',
    label: 'Engineer',
    description: 'Objective specialist with accelerated mastery from mission actions.',
    tuning: Object.freeze({ masteryScale: 1.08, damageScale: 1, reloadScale: 0.97, recoilScale: 0.98, meleeDamageScale: 1.02, meleeCooldownScale: 1 })
  })
]);

const SPECIALIZATION_IDS = new Set(LOADOUT2_SPECIALIZATIONS.map((entry) => entry.id));
const FAMILY_IDS = new Set(LOADOUT2_WEAPON_FAMILIES);

export const LOADOUT2_UNLOCK_CATALOG = Object.freeze({
  FIREARM: Object.freeze([
    Object.freeze({ id: 'QUICK_GRIP', level: 2, label: 'Quick Grip', description: '4% faster reload handling.' }),
    Object.freeze({ id: 'STABILITY_KIT', level: 4, label: 'Stability Kit', description: '6% lower recoil.' }),
    Object.freeze({ id: 'MATCH_AMMO', level: 6, label: 'Match Ammunition', description: '4% additional PvE damage.' }),
    Object.freeze({ id: 'FIELD_MAG', level: 8, label: 'Field Magazine', description: '10% additional reserve capacity on deployment.' }),
    Object.freeze({ id: 'ELITE_TUNING', level: 10, label: 'Elite Tuning', description: '10% additional mastery credit.' })
  ]),
  MELEE: Object.freeze([
    Object.freeze({ id: 'RAPID_DRAW', level: 2, label: 'Rapid Draw', description: '6% faster strike recovery.' }),
    Object.freeze({ id: 'EDGE_BALANCE', level: 4, label: 'Edge Balance', description: '8% wider strike arc.' }),
    Object.freeze({ id: 'HARDENED_EDGE', level: 6, label: 'Hardened Edge', description: '8% additional PvE melee damage.' }),
    Object.freeze({ id: 'LONG_REACH', level: 8, label: 'Long Reach', description: '8% additional melee range.' }),
    Object.freeze({ id: 'SURVIVAL_MASTER', level: 10, label: 'Survival Master', description: '12% additional melee mastery credit.' })
  ])
});

const LEVEL_XP = Object.freeze([0, 120, 300, 560, 900, 1320, 1820, 2400, 3060, 3800]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', maximum = 180) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || String(fallback || '')).slice(0, maximum);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function familyId(value, fallback = 'PISTOL') {
  const token = cleanText(value, fallback, 32).toUpperCase();
  return FAMILY_IDS.has(token) ? token : fallback;
}

function specializationId(value, fallback = 'FIELD_OPERATIVE') {
  const token = cleanText(value, fallback, 48).toUpperCase();
  return SPECIALIZATION_IDS.has(token) ? token : fallback;
}

function isPvpMode(gameMode) {
  const token = cleanText(gameMode, 'survival', 40).toLowerCase();
  return token === 'pvp' || token.startsWith('pvp-');
}

export function loadout2XpForLevel(level = 1) {
  const safeLevel = integer(level, 1, 1, LOADOUT2_MAX_LEVEL);
  return LEVEL_XP[safeLevel - 1] || 0;
}

export function deriveLoadout2MasteryLevel(xp = 0) {
  const value = integer(xp, 0);
  let level = 1;
  for (let candidate = 2; candidate <= LOADOUT2_MAX_LEVEL; candidate += 1) {
    if (value < loadout2XpForLevel(candidate)) break;
    level = candidate;
  }
  const currentThreshold = loadout2XpForLevel(level);
  const nextThreshold = level >= LOADOUT2_MAX_LEVEL
    ? currentThreshold
    : loadout2XpForLevel(level + 1);
  return Object.freeze({
    level,
    xp: value,
    xpIntoLevel: Math.max(0, value - currentThreshold),
    xpToNext: level >= LOADOUT2_MAX_LEVEL
      ? 0
      : Math.max(0, nextThreshold - value),
    capped: level >= LOADOUT2_MAX_LEVEL
  });
}

function unlockCatalogForFamily(family) {
  return familyId(family) === 'MELEE'
    ? LOADOUT2_UNLOCK_CATALOG.MELEE
    : LOADOUT2_UNLOCK_CATALOG.FIREARM;
}

export function getLoadout2FamilyUnlocks(family, levelOrXp = 1, { valueIsXp = false } = {}) {
  const level = valueIsXp
    ? deriveLoadout2MasteryLevel(levelOrXp).level
    : integer(levelOrXp, 1, 1, LOADOUT2_MAX_LEVEL);
  return Object.freeze(unlockCatalogForFamily(family)
    .filter((entry) => level >= entry.level)
    .map((entry) => Object.freeze({ ...entry })));
}

function defaultFamilyProfile(family, now) {
  const id = familyId(family);
  return {
    familyId: id,
    xp: 0,
    level: 1,
    shots: 0,
    hits: 0,
    kills: 0,
    damage: 0,
    objectives: 0,
    bossKills: 0,
    strikes: 0,
    unlocks: [],
    updatedAt: integer(now, Date.now(), 1)
  };
}

export function createDefaultLoadout2MasteryProfile(now = Date.now()) {
  const timestamp = integer(now, Date.now(), 1);
  return {
    patch: LOADOUT2_PATCH,
    schema: LOADOUT2_SCHEMA,
    totalMasteryXp: 0,
    runsCompleted: 0,
    selectedSpecializationId: 'FIELD_OPERATIVE',
    specializationPoints: 0,
    specializationRank: 1,
    respecCount: 0,
    families: Object.fromEntries(LOADOUT2_WEAPON_FAMILIES.map((family) => [
      family,
      defaultFamilyProfile(family, timestamp)
    ])),
    receipts: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function normalizeFamilyProfile(value, family, now) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = defaultFamilyProfile(family, source.updatedAt || now);
  output.xp = integer(source.xp, 0);
  const derived = deriveLoadout2MasteryLevel(output.xp);
  output.level = derived.level;
  output.shots = integer(source.shots, 0);
  output.hits = integer(source.hits, 0);
  output.kills = integer(source.kills, 0);
  output.damage = integer(source.damage, 0);
  output.objectives = integer(source.objectives, 0);
  output.bossKills = integer(source.bossKills, 0);
  output.strikes = integer(source.strikes, 0);
  output.unlocks = getLoadout2FamilyUnlocks(family, derived.level).map((entry) => entry.id);
  output.updatedAt = integer(source.updatedAt, now, 1);
  return output;
}

export function normalizeLoadout2MasteryProfile(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = createDefaultLoadout2MasteryProfile(source.createdAt || now);
  output.totalMasteryXp = integer(source.totalMasteryXp, 0);
  output.runsCompleted = integer(source.runsCompleted, 0);
  output.selectedSpecializationId = specializationId(source.selectedSpecializationId);
  output.specializationPoints = integer(source.specializationPoints, 0);
  output.specializationRank = Math.max(1, Math.min(10, 1 + Math.floor(output.specializationPoints / 350)));
  output.respecCount = integer(source.respecCount, 0, 0, 9999);
  output.createdAt = integer(source.createdAt, output.createdAt, 1);
  output.updatedAt = Math.max(output.createdAt, integer(source.updatedAt, output.createdAt, 1));

  LOADOUT2_WEAPON_FAMILIES.forEach((family) => {
    output.families[family] = normalizeFamilyProfile(source.families?.[family], family, now);
  });

  output.totalMasteryXp = Math.max(
    output.totalMasteryXp,
    LOADOUT2_WEAPON_FAMILIES.reduce((sum, family) => sum + output.families[family].xp, 0)
  );

  const seen = new Set();
  output.receipts = (Array.isArray(source.receipts) ? source.receipts : [])
    .map((entry) => ({
      receiptId: cleanText(entry?.receiptId, '', 240),
      runId: cleanText(entry?.runId, '', 180),
      totalXp: integer(entry?.totalXp, 0),
      appliedAt: integer(entry?.appliedAt, 0)
    }))
    .filter((entry) => entry.receiptId && !seen.has(entry.receiptId) && seen.add(entry.receiptId))
    .sort((left, right) => right.appliedAt - left.appliedAt || left.receiptId.localeCompare(right.receiptId))
    .slice(0, LOADOUT2_MAX_RECEIPTS);
  return output;
}

export function getLoadout2Specialization(value = 'FIELD_OPERATIVE') {
  const id = specializationId(value);
  const entry = LOADOUT2_SPECIALIZATIONS.find((candidate) => candidate.id === id)
    || LOADOUT2_SPECIALIZATIONS[0];
  return Object.freeze({ ...entry, tuning: Object.freeze({ ...entry.tuning }) });
}

export function setLoadout2Specialization(profileValue, requestedId, now = Date.now()) {
  const profile = normalizeLoadout2MasteryProfile(profileValue, now);
  const nextId = specializationId(requestedId, profile.selectedSpecializationId);
  if (nextId === profile.selectedSpecializationId) {
    return Object.freeze({ changed: false, profile: Object.freeze(clone(profile)) });
  }
  profile.selectedSpecializationId = nextId;
  profile.respecCount += 1;
  profile.updatedAt = integer(now, Date.now(), 1);
  return Object.freeze({ changed: true, profile: Object.freeze(clone(profile)) });
}

function normalizedFamilyDelta(value, family) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    familyId: familyId(family),
    xp: integer(source.xp, 0, 0, 100000),
    shots: integer(source.shots, 0, 0, 100000),
    hits: integer(source.hits, 0, 0, 100000),
    kills: integer(source.kills, 0, 0, 100000),
    damage: integer(source.damage, 0, 0, 10000000),
    objectives: integer(source.objectives, 0, 0, 10000),
    bossKills: integer(source.bossKills, 0, 0, 10000),
    strikes: integer(source.strikes, 0, 0, 100000)
  };
}

export function normalizeLoadout2Receipt(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const families = {};
  LOADOUT2_WEAPON_FAMILIES.forEach((family) => {
    const delta = normalizedFamilyDelta(source.families?.[family], family);
    if (
      delta.xp > 0
      || delta.shots > 0
      || delta.hits > 0
      || delta.kills > 0
      || delta.damage > 0
      || delta.objectives > 0
      || delta.bossKills > 0
      || delta.strikes > 0
    ) families[family] = delta;
  });
  return {
    receiptId: cleanText(source.receiptId, '', 240),
    runId: cleanText(source.runId, '', 180),
    gameMode: cleanText(source.gameMode, 'survival', 40).toLowerCase(),
    specializationId: specializationId(source.specializationId),
    specializationPoints: integer(source.specializationPoints, 0, 0, 100000),
    families,
    createdAt: integer(source.createdAt, Date.now(), 1)
  };
}

export function applyLoadout2MasteryReceipt(profileValue, receiptValue, now = Date.now()) {
  const profile = normalizeLoadout2MasteryProfile(profileValue, now);
  const receipt = normalizeLoadout2Receipt(receiptValue);
  if (!receipt.receiptId || isPvpMode(receipt.gameMode)) {
    return Object.freeze({
      applied: false,
      idempotent: false,
      pvpExcluded: isPvpMode(receipt.gameMode),
      profile: Object.freeze(clone(profile)),
      unlocked: Object.freeze([])
    });
  }
  if (profile.receipts.some((entry) => entry.receiptId === receipt.receiptId)) {
    return Object.freeze({
      applied: false,
      idempotent: true,
      pvpExcluded: false,
      profile: Object.freeze(clone(profile)),
      unlocked: Object.freeze([])
    });
  }

  const unlocked = [];
  let totalXp = 0;
  Object.entries(receipt.families).forEach(([family, delta]) => {
    const current = profile.families[familyId(family)];
    const previousUnlocks = new Set(current.unlocks || []);
    current.xp += delta.xp;
    current.shots += delta.shots;
    current.hits += delta.hits;
    current.kills += delta.kills;
    current.damage += delta.damage;
    current.objectives += delta.objectives;
    current.bossKills += delta.bossKills;
    current.strikes += delta.strikes;
    current.level = deriveLoadout2MasteryLevel(current.xp).level;
    current.unlocks = getLoadout2FamilyUnlocks(family, current.level).map((entry) => entry.id);
    current.updatedAt = integer(now, Date.now(), 1);
    current.unlocks.forEach((unlockId) => {
      if (!previousUnlocks.has(unlockId)) unlocked.push({ familyId: family, unlockId, level: current.level });
    });
    totalXp += delta.xp;
  });

  profile.totalMasteryXp += totalXp;
  profile.runsCompleted += 1;
  profile.specializationPoints += receipt.specializationPoints;
  profile.specializationRank = Math.max(1, Math.min(10, 1 + Math.floor(profile.specializationPoints / 350)));
  profile.selectedSpecializationId = specializationId(receipt.specializationId, profile.selectedSpecializationId);
  profile.receipts.unshift({
    receiptId: receipt.receiptId,
    runId: receipt.runId,
    totalXp,
    appliedAt: integer(now, Date.now(), 1)
  });
  profile.receipts = profile.receipts.slice(0, LOADOUT2_MAX_RECEIPTS);
  profile.updatedAt = integer(now, Date.now(), 1);

  return Object.freeze({
    applied: true,
    idempotent: false,
    pvpExcluded: false,
    totalXp,
    profile: Object.freeze(clone(profile)),
    unlocked: Object.freeze(unlocked.map((entry) => Object.freeze({ ...entry })))
  });
}

export function mergeLoadout2MasteryProfiles(leftValue, rightValue, now = Date.now()) {
  const left = normalizeLoadout2MasteryProfile(leftValue, now);
  const right = normalizeLoadout2MasteryProfile(rightValue, now);
  const preferred = left.updatedAt >= right.updatedAt ? left : right;
  const output = createDefaultLoadout2MasteryProfile(Math.min(left.createdAt, right.createdAt));
  output.selectedSpecializationId = preferred.selectedSpecializationId;
  output.specializationPoints = Math.max(left.specializationPoints, right.specializationPoints);
  output.specializationRank = Math.max(left.specializationRank, right.specializationRank);
  output.respecCount = Math.max(left.respecCount, right.respecCount);
  output.runsCompleted = Math.max(left.runsCompleted, right.runsCompleted);

  LOADOUT2_WEAPON_FAMILIES.forEach((family) => {
    const a = left.families[family];
    const b = right.families[family];
    const merged = defaultFamilyProfile(family, Math.max(a.updatedAt, b.updatedAt));
    for (const key of ['xp', 'shots', 'hits', 'kills', 'damage', 'objectives', 'bossKills', 'strikes']) {
      merged[key] = Math.max(integer(a[key], 0), integer(b[key], 0));
    }
    merged.level = deriveLoadout2MasteryLevel(merged.xp).level;
    merged.unlocks = getLoadout2FamilyUnlocks(family, merged.level).map((entry) => entry.id);
    output.families[family] = merged;
  });
  output.totalMasteryXp = LOADOUT2_WEAPON_FAMILIES.reduce((sum, family) => sum + output.families[family].xp, 0);

  const receiptMap = new Map();
  [...left.receipts, ...right.receipts].forEach((entry) => {
    const previous = receiptMap.get(entry.receiptId);
    if (!previous || entry.appliedAt > previous.appliedAt) receiptMap.set(entry.receiptId, clone(entry));
  });
  output.receipts = Array.from(receiptMap.values())
    .sort((a, b) => b.appliedAt - a.appliedAt || a.receiptId.localeCompare(b.receiptId))
    .slice(0, LOADOUT2_MAX_RECEIPTS);
  output.updatedAt = Math.max(left.updatedAt, right.updatedAt, integer(now, Date.now(), 1));
  return Object.freeze(clone(output));
}

export function getLoadout2CombatTuning(profileValue, familyValue = 'PISTOL', {
  specializationId: requestedSpecializationId = '',
  gameMode = 'survival'
} = {}) {
  const profile = normalizeLoadout2MasteryProfile(profileValue);
  const family = familyId(familyValue);
  const familyProfile = profile.families[family];
  const specialization = getLoadout2Specialization(
    requestedSpecializationId || profile.selectedSpecializationId
  );
  const pvpExcluded = isPvpMode(gameMode);
  if (pvpExcluded) {
    return Object.freeze({
      patch: LOADOUT2_PATCH,
      familyId: family,
      masteryLevel: familyProfile.level,
      specializationId: specialization.id,
      pvpExcluded: true,
      meleeEnabled: false,
      damageScale: 1,
      reloadScale: 1,
      recoilScale: 1,
      fireRateScale: 1,
      reserveScale: 1,
      meleeDamageScale: 1,
      meleeCooldownScale: 1,
      meleeRangeScale: 1,
      meleeArcScale: 1,
      masteryScale: 0
    });
  }

  const unlocks = new Set(familyProfile.unlocks || []);
  const melee = family === 'MELEE';
  return Object.freeze({
    patch: LOADOUT2_PATCH,
    familyId: family,
    masteryLevel: familyProfile.level,
    specializationId: specialization.id,
    pvpExcluded: false,
    meleeEnabled: true,
    damageScale: melee
      ? 1
      : specialization.tuning.damageScale * (unlocks.has('MATCH_AMMO') ? 1.04 : 1),
    reloadScale: specialization.tuning.reloadScale * (unlocks.has('QUICK_GRIP') ? 0.96 : 1),
    recoilScale: specialization.tuning.recoilScale * (unlocks.has('STABILITY_KIT') ? 0.94 : 1),
    fireRateScale: 1,
    reserveScale: unlocks.has('FIELD_MAG') ? 1.10 : 1,
    meleeDamageScale: specialization.tuning.meleeDamageScale * (unlocks.has('HARDENED_EDGE') ? 1.08 : 1),
    meleeCooldownScale: specialization.tuning.meleeCooldownScale * (unlocks.has('RAPID_DRAW') ? 0.94 : 1),
    meleeRangeScale: unlocks.has('LONG_REACH') ? 1.08 : 1,
    meleeArcScale: unlocks.has('EDGE_BALANCE') ? 1.08 : 1,
    masteryScale: specialization.tuning.masteryScale * (
      unlocks.has(melee ? 'SURVIVAL_MASTER' : 'ELITE_TUNING')
        ? (melee ? 1.12 : 1.10)
        : 1
    )
  });
}

export function getLoadout2MasteryPresentation(profileValue) {
  const profile = normalizeLoadout2MasteryProfile(profileValue);
  return Object.freeze({
    patch: LOADOUT2_PATCH,
    schema: LOADOUT2_SCHEMA,
    totalMasteryXp: profile.totalMasteryXp,
    runsCompleted: profile.runsCompleted,
    specialization: getLoadout2Specialization(profile.selectedSpecializationId),
    specializationPoints: profile.specializationPoints,
    specializationRank: profile.specializationRank,
    families: Object.freeze(LOADOUT2_WEAPON_FAMILIES.map((family) => {
      const entry = profile.families[family];
      const derived = deriveLoadout2MasteryLevel(entry.xp);
      return Object.freeze({
        ...clone(entry),
        ...derived,
        unlockDetails: getLoadout2FamilyUnlocks(family, entry.level)
      });
    }))
  });
}
