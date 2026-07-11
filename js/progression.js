import { scaleEconomyPrice } from './economy_balance.js';

// js/progression.js
// C11 — Persistent progression and run perks.

const STORAGE_KEY = 'ka_progression_v1';
const VERSION = 1;
const MAX_LEVEL = 50;

export const PERK_DEFS = Object.freeze({
  JUGGERNOG: Object.freeze({
    id: 'JUGGERNOG', shopType: 'PERK_HEALTH', label: 'Juggernog', shortLabel: 'JUG',
    description: 'Raises maximum health to 250.', cost: 2500, tone: 'red'
  }),
  SPEED_COLA: Object.freeze({
    id: 'SPEED_COLA', shopType: 'PERK_RELOAD', label: 'Speed Cola', shortLabel: 'SPD',
    description: 'Cuts weapon reload time in half.', cost: 3000, tone: 'green'
  }),
  STAMIN_UP: Object.freeze({
    id: 'STAMIN_UP', shopType: 'PERK_STAMINA', label: 'Stamin-Up', shortLabel: 'STM',
    description: 'Improves movement and sprint speed.', cost: 2800, tone: 'yellow'
  }),
  DEADSHOT: Object.freeze({
    id: 'DEADSHOT', shopType: 'PERK_DEADSHOT', label: 'Deadshot', shortLabel: 'DSH',
    description: 'Adds 18% headshot damage.', cost: 3200, tone: 'blue'
  })
});

const SHOP_TO_PERK = Object.freeze(
  Object.values(PERK_DEFS).reduce((map, perk) => {
    map[perk.shopType] = perk.id;
    return map;
  }, {})
);

function defaultProfile() {
  return {
    version: VERSION,
    xp: 0,
    level: 1,
    totalRuns: 0,
    totalKills: 0,
    totalHeadshots: 0,
    totalWaves: 0,
    objectivesCompleted: 0,
    challengesCompleted: 0,
    weaponUpgrades: 0,
    pointsSpent: 0,
    bestWave: 1,
    bestScore: 0,
    lastRunAt: 0
  };
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, safeNumber(value, min)));
}

function readProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== VERSION) return defaultProfile();
    return { ...defaultProfile(), ...parsed, version: VERSION };
  } catch {
    return defaultProfile();
  }
}

let profile = readProfile();
let lastProfileSaveAt = 0;

const run = {
  active: false,
  mapId: 'unknown',
  difficulty: 1,
  startedAt: 0,
  xpEarned: 0,
  kills: 0,
  headshots: 0,
  wavesCleared: 0,
  pointsSpent: 0,
  objectivesCompleted: 0,
  challengesCompleted: 0,
  weaponUpgrades: 0,
  perks: new Set(),
  lastEvent: 'IDLE',
  levelUps: []
};

function saveProfile(force = false) {
  const now = Date.now();
  if (!force && run.active && now - lastProfileSaveAt < 1500) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    lastProfileSaveAt = now;
  } catch {
    // Storage may be unavailable in private/restricted browsing modes.
  }
}

function xpForNextLevel(level) {
  return 400 + Math.max(1, level) * 175;
}

function recalculateLevel() {
  let remaining = Math.max(0, Math.floor(profile.xp));
  let level = 1;

  while (level < MAX_LEVEL) {
    const need = xpForNextLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level++;
  }

  const previous = profile.level;
  profile.level = level;

  if (run.active && level > previous) {
    for (let value = previous + 1; value <= level; value++) run.levelUps.push(value);
    run.lastEvent = `LEVEL ${level}`;
  }

  return { level, xpIntoLevel: remaining, xpToNext: level >= MAX_LEVEL ? 0 : xpForNextLevel(level) };
}

export function awardProgressionXP(amount, reason = 'PROGRESS') {
  const value = Math.max(0, Math.round(safeNumber(amount)));
  if (value <= 0) return getProgressionSnapshot();

  profile.xp += value;
  if (run.active) run.xpEarned += value;
  run.lastEvent = `${reason} +${value} XP`;
  recalculateLevel();
  saveProfile();
  return getProgressionSnapshot();
}

export function resetProgressionRun({ mapId = 'unknown', difficulty = 1 } = {}) {
  run.active = true;
  run.mapId = String(mapId || 'unknown');
  run.difficulty = clamp(difficulty, 0.5, 2.0);
  run.startedAt = Date.now();
  run.xpEarned = 0;
  run.kills = 0;
  run.headshots = 0;
  run.wavesCleared = 0;
  run.pointsSpent = 0;
  run.objectivesCompleted = 0;
  run.challengesCompleted = 0;
  run.weaponUpgrades = 0;
  run.perks.clear();
  run.levelUps = [];
  run.lastEvent = 'RUN START';
  recalculateLevel();
}

export function finalizeProgressionRun({ score = 0, wave = 1, reason = 'ENDED' } = {}) {
  if (!run.active) return getProgressionSnapshot();

  const completionXP = Math.max(0, Math.round(
    run.kills * 2 + run.headshots * 2 + run.wavesCleared * 20 + Math.max(0, wave - 1) * 5
  ));
  if (completionXP > 0) awardProgressionXP(completionXP, 'RUN COMPLETE');

  profile.totalRuns++;
  profile.totalKills += run.kills;
  profile.totalHeadshots += run.headshots;
  profile.totalWaves += run.wavesCleared;
  profile.objectivesCompleted += run.objectivesCompleted;
  profile.challengesCompleted += run.challengesCompleted;
  profile.weaponUpgrades += run.weaponUpgrades;
  profile.pointsSpent += run.pointsSpent;
  profile.bestWave = Math.max(profile.bestWave, Math.max(1, Math.round(safeNumber(wave, 1))));
  profile.bestScore = Math.max(profile.bestScore, Math.max(0, Math.round(safeNumber(score))));
  profile.lastRunAt = Date.now();
  run.lastEvent = String(reason || 'ENDED');
  run.active = false;
  recalculateLevel();
  saveProfile(true);
  return getProgressionSnapshot();
}

export function recordProgressionKill({ headshot = false } = {}) {
  if (!run.active) return;
  run.kills++;
  if (headshot) run.headshots++;
  awardProgressionXP(headshot ? 5 : 3, headshot ? 'HEADSHOT' : 'ELIMINATION');
}

export function recordProgressionWaveClear(wave = 1) {
  if (!run.active) return;
  run.wavesCleared++;
  awardProgressionXP(25 + Math.min(75, Math.max(0, Math.round(wave) - 1) * 3), 'WAVE CLEAR');
}

export function recordProgressionPurchase(cost = 0, type = 'PURCHASE') {
  if (!run.active) return;
  const value = Math.max(0, Math.round(safeNumber(cost)));
  run.pointsSpent += value;
  run.lastEvent = `${type} -${value} PTS`;
}

export function recordProgressionObjective() {
  if (!run.active) return;
  run.objectivesCompleted++;
  run.lastEvent = 'OBJECTIVE COMPLETE';
}

export function recordProgressionChallenge() {
  if (!run.active) return;
  run.challengesCompleted++;
  run.lastEvent = 'CHALLENGE COMPLETE';
}

export function recordProgressionWeaponUpgrade(tier = 1) {
  if (!run.active) return;
  run.weaponUpgrades++;
  awardProgressionXP(35 + Math.max(0, tier - 1) * 20, `WEAPON TIER ${tier}`);
}

export function getPerkIdForShop(shopType) {
  return SHOP_TO_PERK[String(shopType || '')] || null;
}

export function getPerkDefinition(perkId) {
  const perk = PERK_DEFS[String(perkId || '')] || null;
  if (!perk) return null;
  return Object.freeze({
    ...perk,
    baseCost: perk.cost,
    cost: scaleEconomyPrice(perk.cost, 'PERK')
  });
}

export function hasProgressionPerk(perkId) {
  return run.perks.has(String(perkId || ''));
}

export function purchaseProgressionPerk(perkId, playerState) {
  const perk = getPerkDefinition(perkId);
  if (!perk) return { ok: false, reason: 'UNKNOWN PERK' };
  if (hasProgressionPerk(perk.id)) return { ok: false, reason: 'ALREADY ACTIVE', perk };
  if (!playerState) return { ok: false, reason: 'NO PLAYER', perk };

  run.perks.add(perk.id);

  if (perk.id === 'JUGGERNOG') {
    playerState.maxHealth = 250;
    playerState.health = 250;
  } else if (perk.id === 'SPEED_COLA') {
    playerState.reloadMult = 0.5;
  } else if (perk.id === 'STAMIN_UP') {
    playerState.baseSpeed = 10.65;
    playerState.sprintSpeed = 17.0;
    playerState.adsSpeed = 4.8;
  }

  awardProgressionXP(40, perk.label.toUpperCase());
  run.lastEvent = `${perk.label.toUpperCase()} ACTIVE`;
  return { ok: true, perk };
}

export function getProgressionHeadshotScale() {
  return hasProgressionPerk('DEADSHOT') ? 1.18 : 1;
}

export function getWeaponUpgradeCost(nextTier) {
  const tier = Math.max(1, Math.min(3, Math.round(safeNumber(nextTier, 1))));
  const baseCost = tier === 1 ? 4200 : (tier === 2 ? 6500 : 9000);
  return scaleEconomyPrice(baseCost, 'WEAPON_UPGRADE');
}

export function getWeaponUpgradeTier(weapon) {
  if (!weapon) return 0;
  if (Number.isFinite(weapon.upgradeTier)) return Math.max(0, Math.min(3, Math.round(weapon.upgradeTier)));
  return weapon.isUpgraded ? 1 : 0;
}

export function getActivePerkChips() {
  return [...run.perks].map((id) => {
    const perk = PERK_DEFS[id];
    return perk ? { label: perk.label.toUpperCase(), value: perk.shortLabel, tone: perk.tone } : null;
  }).filter(Boolean);
}

export function consumeProgressionLevelUps() {
  const values = run.levelUps.slice();
  run.levelUps.length = 0;
  return values;
}

export function getProgressionSnapshot() {
  const levelInfo = recalculateLevel();
  return {
    profile: { ...profile, ...levelInfo },
    run: {
      ...run,
      perks: [...run.perks],
      durationSeconds: run.startedAt ? Math.max(0, (Date.now() - run.startedAt) / 1000) : 0,
      levelUps: run.levelUps.slice()
    },
    maxLevel: MAX_LEVEL,
    perkDefinitions: Object.values(PERK_DEFS).map((perk) => ({ ...perk }))
  };
}

export function resetPersistentProgression() {
  profile = defaultProfile();
  saveProfile(true);
  return getProgressionSnapshot();
}

if (typeof window !== 'undefined') {
  window.KAGetProgression = getProgressionSnapshot;
  window.KAResetProgression = resetPersistentProgression;
}
