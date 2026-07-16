import {
  applyLive1RunReceipt,
  normalizeLive1Profile,
  resolveLive1Manifest
} from './live1_core.js';

// multiplayer-server/src/progression_authority_core.js
// PROG.2 R1 — server-validated progression receipts and canonical cloud progression.


export const PROGRESSION_PATCH = 'prog1-r1-unified-progression-retention';
export const PROGRESSION_VERSION = 2;
export const PROGRESSION_MAX_LEVEL = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', maximum = 120) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, maximum);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  const text = String(value || '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function xpForProgressionLevel(level) {
  const value = integer(level, 1, 1, PROGRESSION_MAX_LEVEL);
  return 430 + value * 170 + Math.floor(Math.pow(Math.max(0, value - 1), 1.28) * 24);
}

export function deriveProgressionLevel(totalXp = 0) {
  let remaining = integer(totalXp, 0);
  let level = 1;
  while (level < PROGRESSION_MAX_LEVEL) {
    const required = xpForProgressionLevel(level);
    if (remaining < required) break;
    remaining -= required;
    level += 1;
  }
  return Object.freeze({
    level,
    xpIntoLevel: remaining,
    xpToNext: level >= PROGRESSION_MAX_LEVEL ? 0 : xpForProgressionLevel(level),
    capped: level >= PROGRESSION_MAX_LEVEL
  });
}

export const PROGRESSION_UNLOCK_CATALOG = Object.freeze([
  Object.freeze({ id: 'TITLE_SURVIVOR', kind: 'TITLE', label: 'Survivor', description: 'Default career title.', requirement: { type: 'LEVEL', value: 1 } }),
  Object.freeze({ id: 'BADGE_RECRUIT', kind: 'BADGE', label: 'Recruit Shield', description: 'Default operative badge.', requirement: { type: 'LEVEL', value: 1 } }),
  Object.freeze({ id: 'BANNER_STANDARD', kind: 'BANNER', label: 'Bunker Standard', description: 'Default profile banner.', requirement: { type: 'LEVEL', value: 1 }, tone: '#00d4ff' }),
  Object.freeze({ id: 'TITLE_OUTBREAK_ROOKIE', kind: 'TITLE', label: 'Outbreak Rookie', description: 'Reach profile level 3.', requirement: { type: 'LEVEL', value: 3 } }),
  Object.freeze({ id: 'BANNER_YARD_GREEN', kind: 'BANNER', label: 'Yard Green', description: 'Reach profile level 5.', requirement: { type: 'LEVEL', value: 5 }, tone: '#22ff88' }),
  Object.freeze({ id: 'BADGE_MARKSMAN', kind: 'BADGE', label: 'Marksman Crosshair', description: 'Score 100 career headshots.', requirement: { type: 'STAT', field: 'totalHeadshots', value: 100 } }),
  Object.freeze({ id: 'TITLE_BUNKER_BREAKER', kind: 'TITLE', label: 'Bunker Breaker', description: 'Eliminate 500 enemies.', requirement: { type: 'STAT', field: 'totalKills', value: 500 } }),
  Object.freeze({ id: 'BANNER_NEON_VETERAN', kind: 'BANNER', label: 'Neon Veteran', description: 'Reach profile level 12.', requirement: { type: 'LEVEL', value: 12 }, tone: '#b86cff' }),
  Object.freeze({ id: 'BADGE_FIELD_MEDIC', kind: 'BADGE', label: 'Field Medic', description: 'Revive teammates 10 times.', requirement: { type: 'STAT', field: 'totalRevives', value: 10 } }),
  Object.freeze({ id: 'TITLE_WAVE_WARDEN', kind: 'TITLE', label: 'Wave Warden', description: 'Reach wave 20.', requirement: { type: 'STAT', field: 'bestWave', value: 20 } }),
  Object.freeze({ id: 'BANNER_REACTOR_GOLD', kind: 'BANNER', label: 'Reactor Gold', description: 'Complete 25 map objectives.', requirement: { type: 'STAT', field: 'objectivesCompleted', value: 25 }, tone: '#ffaa00' }),
  Object.freeze({ id: 'BADGE_COOP_VETERAN', kind: 'BADGE', label: 'Co-op Veteran', description: 'Complete 25 multiplayer runs.', requirement: { type: 'STAT', field: 'multiplayerRuns', value: 25 } }),
  Object.freeze({ id: 'TITLE_ARENA_SPECIALIST', kind: 'TITLE', label: 'Arena Specialist', description: 'Reach profile level 30.', requirement: { type: 'LEVEL', value: 30 } }),
  Object.freeze({ id: 'BANNER_LAST_STAND', kind: 'BANNER', label: 'Last Stand', description: 'Survive 100 total waves.', requirement: { type: 'STAT', field: 'totalWaves', value: 100 }, tone: '#ff5533' }),
  Object.freeze({ id: 'BADGE_CONTRACTOR', kind: 'BADGE', label: 'Contractor Star', description: 'Complete 50 daily or weekly operations.', requirement: { type: 'STAT', field: 'operationsCompleted', value: 50 } }),
  Object.freeze({ id: 'BADGE_TEAM_TACTICIAN', kind: 'BADGE', label: 'Team Tactician', description: 'Complete 10 shared co-op contracts.', requirement: { type: 'STAT', field: 'coopContractsCompleted', value: 10 } }),
  Object.freeze({ id: 'TITLE_ARENA_LEGEND', kind: 'TITLE', label: 'Arena Legend', description: 'Reach profile level 50.', requirement: { type: 'LEVEL', value: 50 } }),
  Object.freeze({ id: 'BADGE_LEGEND', kind: 'BADGE', label: 'Legend Crest', description: 'Reach profile level 50.', requirement: { type: 'LEVEL', value: 50 } }),
  Object.freeze({ id: 'BANNER_LEGEND', kind: 'BANNER', label: 'Legendary Containment', description: 'Reach profile level 50.', requirement: { type: 'LEVEL', value: 50 }, tone: '#72d7ff' }),
  Object.freeze({ id: 'TITLE_SEASONED_OPERATOR', kind: 'TITLE', label: 'Seasoned Operator', description: 'Earn 250 seasonal points in the active Outbreak Cycle.', requirement: { type: 'LIVE_POINTS', value: 250 } }),
  Object.freeze({ id: 'BADGE_LIVE_COMMAND', kind: 'BADGE', label: 'Live Command', description: 'Earn 650 seasonal points in the active Outbreak Cycle.', requirement: { type: 'LIVE_POINTS', value: 650 } }),
  Object.freeze({ id: 'BANNER_EVENT_HORIZON', kind: 'BANNER', label: 'Event Horizon', description: 'Earn 1,100 seasonal points in the active Outbreak Cycle.', requirement: { type: 'LIVE_POINTS', value: 1100 }, tone: '#ff5fd2' })
]);

const DAILY_OPERATION_POOL = Object.freeze([
  Object.freeze({ id: 'DAILY_KILLS', label: 'Containment Sweep', description: 'Eliminate 40 enemies.', kind: 'KILLS', target: 40, xp: 180 }),
  Object.freeze({ id: 'DAILY_HEADSHOTS', label: 'Precision Work', description: 'Score 12 headshot eliminations.', kind: 'HEADSHOTS', target: 12, xp: 200 }),
  Object.freeze({ id: 'DAILY_WAVES', label: 'Hold the Line', description: 'Clear 5 waves.', kind: 'WAVES', target: 5, xp: 210 }),
  Object.freeze({ id: 'DAILY_DAMAGE', label: 'Heavy Contact', description: 'Deal 3,500 damage.', kind: 'DAMAGE', target: 3500, xp: 190 }),
  Object.freeze({ id: 'DAILY_OBJECTIVE', label: 'Contract Duty', description: 'Complete one map objective.', kind: 'OBJECTIVES', target: 1, xp: 220 }),
  Object.freeze({ id: 'DAILY_REVIVE', label: 'No One Left Behind', description: 'Revive one teammate.', kind: 'REVIVES', target: 1, xp: 240 }),
  Object.freeze({ id: 'DAILY_CHALLENGE', label: 'Tactical Checklist', description: 'Complete two run challenges.', kind: 'CHALLENGES', target: 2, xp: 210 })
]);

const WEEKLY_OPERATION_POOL = Object.freeze([
  Object.freeze({ id: 'WEEKLY_KILLS', label: 'Outbreak Suppression', description: 'Eliminate 250 enemies.', kind: 'KILLS', target: 250, xp: 850 }),
  Object.freeze({ id: 'WEEKLY_HEADSHOTS', label: 'Surgical Campaign', description: 'Score 75 headshot eliminations.', kind: 'HEADSHOTS', target: 75, xp: 950 }),
  Object.freeze({ id: 'WEEKLY_WAVES', label: 'Endurance Detail', description: 'Clear 30 waves.', kind: 'WAVES', target: 30, xp: 950 }),
  Object.freeze({ id: 'WEEKLY_RUNS', label: 'Active Deployment', description: 'Complete 6 runs.', kind: 'RUNS', target: 6, xp: 800 }),
  Object.freeze({ id: 'WEEKLY_COOP', label: 'Joint Operations', description: 'Complete 3 multiplayer runs.', kind: 'COOP_RUNS', target: 3, xp: 900 }),
  Object.freeze({ id: 'WEEKLY_REVIVES', label: 'Combat Medic', description: 'Revive teammates 5 times.', kind: 'REVIVES', target: 5, xp: 1050 }),
  Object.freeze({ id: 'WEEKLY_OBJECTIVES', label: 'Contract Specialist', description: 'Complete 6 map objectives.', kind: 'OBJECTIVES', target: 6, xp: 1000 }),
  Object.freeze({ id: 'WEEKLY_HARD_WAVES', label: 'Hard-Line Defense', description: 'Clear 12 waves on Hard.', kind: 'HARD_WAVES', target: 12, xp: 1100 })
]);

function utcDayKey(now = Date.now()) {
  return new Date(integer(now, Date.now())).toISOString().slice(0, 10);
}

function utcWeekKey(now = Date.now()) {
  const date = new Date(integer(now, Date.now()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function chooseOperations(pool, count, seed) {
  const offset = hashText(seed) % pool.length;
  const step = 3 + (hashText(`${seed}:step`) % Math.max(1, pool.length - 3));
  const picked = [];
  const seen = new Set();
  let cursor = offset;
  while (picked.length < Math.min(count, pool.length)) {
    const index = cursor % pool.length;
    if (!seen.has(index)) {
      seen.add(index);
      picked.push(pool[index]);
    }
    cursor += step;
  }
  return picked;
}

function makeOperationCycle(scope, key, pool, count) {
  return {
    scope,
    key,
    generatedAt: Date.now(),
    operations: chooseOperations(pool, count, `${scope}:${key}`).map((definition) => ({
      ...definition,
      progress: 0,
      completed: false,
      completedAt: 0
    }))
  };
}

function normalizeOperationEntry(value, definition) {
  const source = isObject(value) ? value : {};
  const base = definition || source;
  const target = integer(base.target, 1, 1);
  const progress = Math.min(target, integer(source.progress, 0));
  return {
    id: cleanText(base.id, 'UNKNOWN', 80),
    label: cleanText(base.label, 'Operation', 100),
    description: cleanText(base.description, 'Complete the listed objective.', 220),
    kind: cleanText(base.kind, 'KILLS', 40),
    target,
    xp: integer(base.xp, 0),
    progress,
    completed: source.completed === true || progress >= target,
    completedAt: integer(source.completedAt, 0)
  };
}

function normalizeCycle(value, scope, expectedKey, pool, count) {
  const source = isObject(value) ? value : {};
  if (source.key !== expectedKey || !Array.isArray(source.operations)) {
    return makeOperationCycle(scope, expectedKey, pool, count);
  }
  const definitions = new Map(pool.map((entry) => [entry.id, entry]));
  const normalized = source.operations
    .map((entry) => normalizeOperationEntry(entry, definitions.get(entry?.id)))
    .filter((entry) => definitions.has(entry.id))
    .slice(0, count);
  if (normalized.length !== Math.min(count, pool.length)) {
    return makeOperationCycle(scope, expectedKey, pool, count);
  }
  return {
    scope,
    key: expectedKey,
    generatedAt: integer(source.generatedAt, Date.now()),
    operations: normalized
  };
}

export function normalizeProgressionOperations(value, now = Date.now()) {
  const source = isObject(value) ? value : {};
  return {
    daily: normalizeCycle(source.daily, 'DAILY', utcDayKey(now), DAILY_OPERATION_POOL, 3),
    weekly: normalizeCycle(source.weekly, 'WEEKLY', utcWeekKey(now), WEEKLY_OPERATION_POOL, 3)
  };
}

export function defaultProgressionProfile(now = Date.now()) {
  return {
    version: PROGRESSION_VERSION,
    xp: 0,
    level: 1,
    totalRuns: 0,
    completedRuns: 0,
    abandonedRuns: 0,
    soloRuns: 0,
    multiplayerRuns: 0,
    botAssistedRuns: 0,
    totalKills: 0,
    totalHeadshots: 0,
    totalAssists: 0,
    totalRevives: 0,
    timesRevived: 0,
    totalWaves: 0,
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    totalPlaySeconds: 0,
    objectivesCompleted: 0,
    challengesCompleted: 0,
    coopContractsCompleted: 0,
    contentOperationsCompleted: 0,
    operationsCompleted: 0,
    dailyOperationsCompleted: 0,
    weeklyOperationsCompleted: 0,
    weaponUpgrades: 0,
    perksPurchased: 0,
    pointsEarned: 0,
    pointsSpent: 0,
    bestWave: 1,
    bestScore: 0,
    bestAccuracy: 0,
    longestRunSeconds: 0,
    lastRunAt: 0,
    createdAt: integer(now, Date.now()),
    updatedAt: integer(now, Date.now()),
    unlocks: {
      TITLE_SURVIVOR: integer(now, Date.now()),
      BADGE_RECRUIT: integer(now, Date.now()),
      BANNER_STANDARD: integer(now, Date.now())
    },
    equipped: {
      title: 'TITLE_SURVIVOR',
      badge: 'BADGE_RECRUIT',
      banner: 'BANNER_STANDARD',
      updatedAt: integer(now, Date.now())
    },
    operations: normalizeProgressionOperations({}, now),
    recentRuns: [],
    live1: normalizeLive1Profile({}, now)
  };
}

function normalizeUnlocks(value, now) {
  const source = isObject(value) ? value : {};
  const output = {};
  Object.entries(source).slice(0, 160).forEach(([key, timestamp]) => {
    const id = cleanText(key, '', 80);
    const at = integer(timestamp, 0);
    if (id && at > 0) output[id] = at;
  });
  output.TITLE_SURVIVOR ||= integer(now, Date.now());
  output.BADGE_RECRUIT ||= integer(now, Date.now());
  output.BANNER_STANDARD ||= integer(now, Date.now());
  return output;
}

function normalizeRecentRuns(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .filter(isObject)
    .map((entry, index) => ({
      runId: cleanText(entry.runId, `legacy-${index}`, 100),
      endedAt: integer(entry.endedAt, 0),
      mapId: cleanText(entry.mapId, 'unknown', 80),
      mode: cleanText(entry.mode, 'single', 24),
      difficulty: Math.max(0.5, Math.min(2, finite(entry.difficulty, 1))),
      score: integer(entry.score, 0),
      wave: integer(entry.wave, 1, 1),
      kills: integer(entry.kills, 0),
      headshots: integer(entry.headshots, 0),
      revives: integer(entry.revives, 0),
      coopContractsCompleted: integer(entry.coopContractsCompleted, 0),
      contentOperationsCompleted: integer(entry.contentOperationsCompleted, 0),
      liveSeasonPoints: integer(entry.liveSeasonPoints, 0),
      liveContractsCompleted: integer(entry.liveContractsCompleted, 0),
      xpEarned: integer(entry.xpEarned, 0),
      reason: cleanText(entry.reason, 'ENDED', 80),
      botAssisted: entry.botAssisted === true
    }))
    .filter((entry) => {
      if (seen.has(entry.runId)) return false;
      seen.add(entry.runId);
      return true;
    })
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, 12);
}

export function normalizeProgressionProfile(value, now = Date.now()) {
  const source = isObject(value) ? value : {};
  const defaults = defaultProgressionProfile(now);
  const numericFields = [
    'xp', 'totalRuns', 'completedRuns', 'abandonedRuns', 'soloRuns',
    'multiplayerRuns', 'botAssistedRuns', 'totalKills', 'totalHeadshots',
    'totalAssists', 'totalRevives', 'timesRevived', 'totalWaves',
    'totalDamageDealt', 'totalDamageTaken', 'totalPlaySeconds',
    'objectivesCompleted', 'challengesCompleted', 'coopContractsCompleted', 'contentOperationsCompleted', 'operationsCompleted',
    'dailyOperationsCompleted', 'weeklyOperationsCompleted',
    'weaponUpgrades', 'perksPurchased', 'pointsEarned', 'pointsSpent',
    'bestWave', 'bestScore', 'bestAccuracy', 'longestRunSeconds',
    'lastRunAt', 'createdAt', 'updatedAt'
  ];
  const output = { ...defaults };
  numericFields.forEach((field) => {
    const fallback = defaults[field];
    output[field] = field === 'bestAccuracy'
      ? Math.max(0, Math.min(100, finite(source[field], fallback)))
      : integer(source[field], fallback, field === 'bestWave' ? 1 : 0);
  });
  const sourceVersion = integer(source.version, 1, 1);
  if (sourceVersion < 2) {
    if (source.completedRuns === undefined) output.completedRuns = output.totalRuns;
    if (source.soloRuns === undefined && source.multiplayerRuns === undefined) {
      output.soloRuns = output.totalRuns;
    }
  }
  output.version = PROGRESSION_VERSION;
  const levelInfo = deriveProgressionLevel(output.xp);
  output.level = levelInfo.level;
  output.createdAt = output.createdAt || integer(now, Date.now());
  output.updatedAt = Math.max(output.updatedAt, output.createdAt);
  output.unlocks = normalizeUnlocks(source.unlocks, now);
  const equipped = isObject(source.equipped) ? source.equipped : {};
  output.equipped = {
    title: cleanText(equipped.title, 'TITLE_SURVIVOR', 80),
    badge: cleanText(equipped.badge, 'BADGE_RECRUIT', 80),
    banner: cleanText(equipped.banner, 'BANNER_STANDARD', 80),
    updatedAt: integer(equipped.updatedAt, output.updatedAt)
  };
  for (const [kind, fallback] of [['title', 'TITLE_SURVIVOR'], ['badge', 'BADGE_RECRUIT'], ['banner', 'BANNER_STANDARD']]) {
    if (!output.unlocks[output.equipped[kind]]) output.equipped[kind] = fallback;
  }
  output.operations = normalizeProgressionOperations(source.operations, now);
  output.recentRuns = normalizeRecentRuns(source.recentRuns);
  output.live1 = normalizeLive1Profile(source.live1, now);
  return output;
}

function requirementMet(profile, requirement) {
  if (!requirement) return true;
  if (requirement.type === 'LEVEL') {
    return deriveProgressionLevel(profile.xp).level >= integer(requirement.value, 1, 1);
  }
  if (requirement.type === 'STAT') {
    return finite(profile[requirement.field], 0) >= finite(requirement.value, 0);
  }
  if (requirement.type === 'LIVE_POINTS') {
    return finite(profile.live1?.seasonPoints, 0) >= finite(requirement.value, 0);
  }
  return false;
}

export function evaluateProgressionUnlocks(profileValue, now = Date.now()) {
  const profile = normalizeProgressionProfile(profileValue, now);
  const unlocks = { ...profile.unlocks };
  const newlyUnlocked = [];
  PROGRESSION_UNLOCK_CATALOG.forEach((entry) => {
    if (unlocks[entry.id] || !requirementMet(profile, entry.requirement)) return;
    unlocks[entry.id] = integer(now, Date.now());
    newlyUnlocked.push({ ...entry, unlockedAt: unlocks[entry.id] });
  });
  return Object.freeze({ unlocks, newlyUnlocked });
}

function operationIncrement(operation, event) {
  const amount = Math.max(0, finite(event.amount, 0));
  switch (operation.kind) {
    case 'KILLS': return event.kind === 'KILL' ? amount : 0;
    case 'HEADSHOTS': return event.kind === 'HEADSHOT' ? amount : 0;
    case 'WAVES': return event.kind === 'WAVE' ? amount : 0;
    case 'HARD_WAVES':
      return event.kind === 'WAVE' && finite(event.difficulty, 1) >= 1.5 ? amount : 0;
    case 'DAMAGE': return event.kind === 'DAMAGE' ? amount : 0;
    case 'REVIVES': return event.kind === 'REVIVE' ? amount : 0;
    case 'OBJECTIVES': return event.kind === 'OBJECTIVE' ? amount : 0;
    case 'CHALLENGES': return event.kind === 'CHALLENGE' ? amount : 0;
    case 'RUNS': return event.kind === 'RUN_COMPLETE' ? amount : 0;
    case 'COOP_RUNS':
      return event.kind === 'RUN_COMPLETE' && event.mode === 'multiplayer' ? amount : 0;
    default: return 0;
  }
}

export function applyProgressionOperationEvent(operationsValue, event = {}, now = Date.now()) {
  const operations = normalizeProgressionOperations(operationsValue, now);
  const completed = [];
  for (const cycle of [operations.daily, operations.weekly]) {
    cycle.operations = cycle.operations.map((operation) => {
      if (operation.completed) return operation;
      const increment = operationIncrement(operation, event);
      if (increment <= 0) return operation;
      const progress = Math.min(operation.target, operation.progress + increment);
      const didComplete = progress >= operation.target;
      const next = {
        ...operation,
        progress,
        completed: didComplete,
        completedAt: didComplete ? integer(now, Date.now()) : 0
      };
      if (didComplete) completed.push({ ...next, scope: cycle.scope });
      return next;
    });
  }
  return Object.freeze({ operations, completed });
}

export function calculateProgressionRunReward({
  summary = {},
  score = 0,
  wave = 1,
  reason = 'ENDED',
  difficulty = 1,
  mode = 'single'
} = {}) {
  const normalizedReason = cleanText(reason, 'ENDED', 80).toUpperCase();
  const abandoned = /QUIT|LEAVE|ABANDON|CANCEL/.test(normalizedReason);
  const finalWave = integer(wave ?? summary.highestWave, 1, 1);
  const finalScore = integer(score ?? summary.finalScore, 0);
  const difficultyValue = Math.max(0.5, Math.min(2, finite(difficulty ?? summary.difficulty, 1)));
  const multiplier = difficultyValue >= 1.5 ? 1.35 : (difficultyValue <= 0.75 ? 0.85 : 1);
  const completion = abandoned ? 0 : 80;
  const survival = Math.min(280, Math.max(0, finalWave - 1) * 11);
  const scoreBonus = Math.min(220, Math.floor(finalScore / 550));
  const multiplayerBonus = mode === 'multiplayer' && !abandoned ? 35 : 0;
  const subtotal = completion + survival + scoreBonus + multiplayerBonus;
  const adjusted = Math.round(subtotal * multiplier);
  return Object.freeze({
    abandoned,
    multiplier,
    breakdown: Object.freeze({
      completion,
      survival,
      score: scoreBonus,
      multiplayer: multiplayerBonus,
      difficulty: Math.max(0, adjusted - subtotal)
    }),
    total: Math.max(0, adjusted)
  });
}

export function getProgressionUnlockPresentation(profileValue) {
  const profile = normalizeProgressionProfile(profileValue);
  return PROGRESSION_UNLOCK_CATALOG.map((entry) => Object.freeze({
    ...deepClone(entry),
    unlocked: Boolean(profile.unlocks[entry.id]),
    unlockedAt: integer(profile.unlocks[entry.id], 0),
    equipped: (
      profile.equipped.title === entry.id
      || profile.equipped.badge === entry.id
      || profile.equipped.banner === entry.id
    )
  }));
}

export function getProgressionOperationExpiry(now = Date.now()) {
  const timestamp = integer(now, Date.now());
  const current = new Date(timestamp);
  const dayEnd = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() + 1
  );
  const day = current.getUTCDay() || 7;
  const weekEnd = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() + (8 - day)
  );
  return Object.freeze({
    dailyMs: Math.max(0, dayEnd - timestamp),
    weeklyMs: Math.max(0, weekEnd - timestamp),
    dailyKey: utcDayKey(timestamp),
    weeklyKey: utcWeekKey(timestamp)
  });
}


export const PROGRESSION_AUTHORITY_PATCH = 'prog2-r1-production-hardening-cloud-integrity';
export const PROGRESSION_RECEIPT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const PROGRESSION_RECEIPT_FUTURE_SKEW_MS = 10 * 60 * 1000;
export const PROGRESSION_RECEIPT_MAX_XP = 50_000;

function boundedReceiptInteger(value, fallback, maximum) {
  return integer(value, fallback, 0, maximum);
}

function cleanReceiptId(value) {
  const text = cleanText(value, '', 120);
  return /^[a-zA-Z0-9:_-]{8,120}$/.test(text) ? text : '';
}

export function normalizeProgressionRunReceipt(value = {}, now = Date.now()) {
  const source = isObject(value) ? value : {};
  const runId = cleanReceiptId(source.runId);
  const endedAt = integer(source.endedAt, now, 1);
  const startedAt = integer(source.startedAt, Math.max(1, endedAt - 60_000), 1);
  const durationSeconds = boundedReceiptInteger(
    source.durationSeconds,
    Math.max(0, Math.round((endedAt - startedAt) / 1000)),
    6 * 60 * 60
  );
  const mode = source.mode === 'multiplayer' ? 'multiplayer' : 'single';
  const reason = cleanText(source.reason, 'ENDED', 80).toUpperCase();
  const difficulty = Math.max(0.5, Math.min(2, finite(source.difficulty, 1)));
  const wave = boundedReceiptInteger(source.wave, 1, 250) || 1;
  const wavesCleared = Math.min(
    Math.max(0, wave - 1),
    boundedReceiptInteger(source.wavesCleared, Math.max(0, wave - 1), 249)
  );
  const kills = boundedReceiptInteger(source.kills, 0, 5000);
  const headshots = Math.min(kills, boundedReceiptInteger(source.headshots, 0, 5000));
  const receipt = {
    version: 1,
    runId,
    mapId: cleanText(source.mapId, 'unknown', 80),
    mode,
    difficulty,
    startedAt,
    endedAt,
    durationSeconds,
    reason,
    score: boundedReceiptInteger(source.score, 0, 50_000_000),
    wave,
    wavesCleared,
    kills,
    headshots,
    assists: boundedReceiptInteger(source.assists, 0, 5000),
    revives: boundedReceiptInteger(source.revives, 0, 100),
    timesRevived: boundedReceiptInteger(source.timesRevived, 0, 100),
    damageDealt: boundedReceiptInteger(source.damageDealt, 0, 25_000_000),
    damageTaken: boundedReceiptInteger(source.damageTaken, 0, 5_000_000),
    pointsEarned: boundedReceiptInteger(source.pointsEarned, 0, 50_000_000),
    pointsSpent: boundedReceiptInteger(source.pointsSpent, 0, 50_000_000),
    objectivesCompleted: boundedReceiptInteger(source.objectivesCompleted, 0, 100),
    challengesCompleted: boundedReceiptInteger(source.challengesCompleted, 0, 100),
    coopContractsCompleted: boundedReceiptInteger(source.coopContractsCompleted, 0, 4),
    contentOperationsCompleted: boundedReceiptInteger(source.contentOperationsCompleted, 0, 4),
    liveSeasonId: cleanText(source.liveSeasonId, '', 80),
    liveManifestRevision: cleanText(source.liveManifestRevision, '', 160),
    weaponUpgrades: boundedReceiptInteger(source.weaponUpgrades, 0, 100),
    perksPurchased: boundedReceiptInteger(source.perksPurchased, 0, 100),
    accuracy: Math.max(0, Math.min(100, finite(source.accuracy, 0))),
    botAssisted: source.botAssisted === true
  };

  const errors = [];
  if (!runId) errors.push('RUN_ID_INVALID');
  if (endedAt > now + PROGRESSION_RECEIPT_FUTURE_SKEW_MS) errors.push('RUN_TIME_IN_FUTURE');
  if (endedAt < now - PROGRESSION_RECEIPT_MAX_AGE_MS) errors.push('RUN_RECEIPT_EXPIRED');
  if (startedAt > endedAt + PROGRESSION_RECEIPT_FUTURE_SKEW_MS) errors.push('RUN_TIME_INVALID');
  if (durationSeconds > 0 && endedAt - startedAt > (durationSeconds + 900) * 1000) {
    errors.push('RUN_DURATION_INCONSISTENT');
  }
  if (headshots > kills) errors.push('HEADSHOTS_EXCEED_KILLS');
  if (receipt.pointsSpent > receipt.pointsEarned + 250_000) errors.push('POINT_SPEND_INVALID');
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    receipt: Object.freeze(receipt)
  });
}

function waveExperience(wavesCleared) {
  let total = 0;
  for (let wave = 1; wave <= wavesCleared; wave += 1) {
    total += 28 + Math.min(72, Math.max(0, wave - 1) * 3);
  }
  return total;
}

function applyReceiptOperationEvents(operations, receipt, now) {
  let current = normalizeProgressionOperations(operations, now);
  const completed = [];
  const events = [
    { kind: 'KILL', amount: receipt.kills },
    { kind: 'HEADSHOT', amount: receipt.headshots },
    { kind: 'DAMAGE', amount: receipt.damageDealt },
    { kind: 'REVIVE', amount: receipt.revives },
    { kind: 'OBJECTIVE', amount: receipt.objectivesCompleted },
    { kind: 'CHALLENGE', amount: receipt.challengesCompleted }
  ];
  for (let index = 1; index <= receipt.wavesCleared; index += 1) {
    events.push({ kind: 'WAVE', amount: 1, wave: index });
  }
  if (!/QUIT|LEAVE|ABANDON|CANCEL/.test(receipt.reason)) {
    events.push({ kind: 'RUN_COMPLETE', amount: 1 });
  }
  for (const event of events) {
    if (finite(event.amount, 0) <= 0) continue;
    const result = applyProgressionOperationEvent(current, {
      ...event,
      difficulty: receipt.difficulty,
      mode: receipt.mode
    }, now);
    current = result.operations;
    completed.push(...result.completed);
  }
  return { operations: current, completed };
}

export function calculateAuthoritativeProgressionAward(receiptValue, now = Date.now()) {
  const normalized = normalizeProgressionRunReceipt(receiptValue, now);
  if (!normalized.valid) {
    return Object.freeze({
      valid: false,
      errors: normalized.errors,
      receipt: normalized.receipt,
      award: null
    });
  }
  const receipt = normalized.receipt;
  const reward = calculateProgressionRunReward({
    summary: receipt,
    score: receipt.score,
    wave: receipt.wave,
    reason: receipt.reason,
    difficulty: receipt.difficulty,
    mode: receipt.mode
  });
  const eventXp = (
    receipt.kills * 4
    + receipt.headshots * 3
    + receipt.assists * 4
    + waveExperience(receipt.wavesCleared)
    + receipt.revives * 65
    + receipt.timesRevived * 15
    + receipt.coopContractsCompleted * 180
    + receipt.contentOperationsCompleted * 160
    + receipt.weaponUpgrades * 35
  );
  const subtotal = eventXp + reward.total;
  const total = Math.min(PROGRESSION_RECEIPT_MAX_XP, Math.max(0, subtotal));
  return Object.freeze({
    valid: true,
    errors: Object.freeze([]),
    receipt,
    award: Object.freeze({
      eventXp,
      completionXp: reward.total,
      operationXp: 0,
      total,
      capped: subtotal > total,
      reward
    })
  });
}

export function applyAuthoritativeProgressionReceipt(
  profileValue,
  receiptValue,
  now = Date.now()
) {
  const awardResult = calculateAuthoritativeProgressionAward(receiptValue, now);
  if (!awardResult.valid) return awardResult;
  const receipt = awardResult.receipt;
  const profile = normalizeProgressionProfile(profileValue, now);
  const operationResult = applyReceiptOperationEvents(profile.operations, receipt, now);
  const operationXp = operationResult.completed.reduce(
    (sum, entry) => sum + integer(entry.xp, 0),
    0
  );
  const liveManifest = resolveLive1Manifest(receipt.endedAt);
  const liveResult = applyLive1RunReceipt(
    profile.live1,
    receipt,
    liveManifest,
    now
  );
  const liveXp = liveResult.valid ? integer(liveResult.xpAward, 0) : 0;
  const totalAward = Math.min(
    PROGRESSION_RECEIPT_MAX_XP,
    awardResult.award.total + operationXp + liveXp
  );
  const abandoned = /QUIT|LEAVE|ABANDON|CANCEL/.test(receipt.reason);

  profile.xp = integer(profile.xp, 0) + totalAward;
  profile.totalRuns = integer(profile.totalRuns, 0) + 1;
  if (abandoned) profile.abandonedRuns = integer(profile.abandonedRuns, 0) + 1;
  else profile.completedRuns = integer(profile.completedRuns, 0) + 1;
  if (receipt.mode === 'multiplayer') {
    profile.multiplayerRuns = integer(profile.multiplayerRuns, 0) + 1;
  } else {
    profile.soloRuns = integer(profile.soloRuns, 0) + 1;
  }
  if (receipt.botAssisted) profile.botAssistedRuns = integer(profile.botAssistedRuns, 0) + 1;

  profile.totalKills = integer(profile.totalKills, 0) + receipt.kills;
  profile.totalHeadshots = integer(profile.totalHeadshots, 0) + receipt.headshots;
  profile.totalAssists = integer(profile.totalAssists, 0) + receipt.assists;
  profile.totalRevives = integer(profile.totalRevives, 0) + receipt.revives;
  profile.timesRevived = integer(profile.timesRevived, 0) + receipt.timesRevived;
  profile.totalWaves = integer(profile.totalWaves, 0) + receipt.wavesCleared;
  profile.totalDamageDealt = integer(profile.totalDamageDealt, 0) + receipt.damageDealt;
  profile.totalDamageTaken = integer(profile.totalDamageTaken, 0) + receipt.damageTaken;
  profile.totalPlaySeconds = integer(profile.totalPlaySeconds, 0) + receipt.durationSeconds;
  profile.objectivesCompleted = integer(profile.objectivesCompleted, 0) + receipt.objectivesCompleted;
  profile.challengesCompleted = integer(profile.challengesCompleted, 0) + receipt.challengesCompleted;
  profile.coopContractsCompleted = integer(profile.coopContractsCompleted, 0) + receipt.coopContractsCompleted;
  profile.contentOperationsCompleted = integer(profile.contentOperationsCompleted, 0) + receipt.contentOperationsCompleted;
  profile.weaponUpgrades = integer(profile.weaponUpgrades, 0) + receipt.weaponUpgrades;
  profile.perksPurchased = integer(profile.perksPurchased, 0) + receipt.perksPurchased;
  profile.pointsEarned = integer(profile.pointsEarned, 0) + receipt.pointsEarned;
  profile.pointsSpent = integer(profile.pointsSpent, 0) + receipt.pointsSpent;
  profile.bestWave = Math.max(integer(profile.bestWave, 1, 1), receipt.wave);
  profile.bestScore = Math.max(integer(profile.bestScore, 0), receipt.score);
  profile.bestAccuracy = Math.max(finite(profile.bestAccuracy, 0), receipt.accuracy);
  profile.longestRunSeconds = Math.max(integer(profile.longestRunSeconds, 0), receipt.durationSeconds);
  profile.lastRunAt = Math.max(integer(profile.lastRunAt, 0), receipt.endedAt);
  profile.updatedAt = Math.max(integer(profile.updatedAt, 0), now);
  if (liveResult.valid) profile.live1 = liveResult.profile;
  profile.operations = operationResult.operations;
  profile.operationsCompleted = integer(profile.operationsCompleted, 0) + operationResult.completed.length;
  profile.dailyOperationsCompleted = integer(profile.dailyOperationsCompleted, 0)
    + operationResult.completed.filter((entry) => entry.scope === 'DAILY').length;
  profile.weeklyOperationsCompleted = integer(profile.weeklyOperationsCompleted, 0)
    + operationResult.completed.filter((entry) => entry.scope === 'WEEKLY').length;

  const unlockResult = evaluateProgressionUnlocks(profile, now);
  profile.unlocks = { ...unlockResult.unlocks };
  profile.level = deriveProgressionLevel(profile.xp).level;
  profile.recentRuns = [
    {
      runId: receipt.runId,
      endedAt: receipt.endedAt,
      mapId: receipt.mapId,
      mode: receipt.mode,
      difficulty: receipt.difficulty,
      score: receipt.score,
      wave: receipt.wave,
      kills: receipt.kills,
      headshots: receipt.headshots,
      revives: receipt.revives,
      contentOperationsCompleted: receipt.contentOperationsCompleted,
      liveSeasonPoints: liveResult.valid ? liveResult.seasonPointsAward : 0,
      liveContractsCompleted: liveResult.valid ? liveResult.completedStages.length : 0,
      xpEarned: totalAward,
      reason: receipt.reason,
      botAssisted: receipt.botAssisted
    },
    ...(Array.isArray(profile.recentRuns) ? profile.recentRuns : [])
  ].filter((entry, index, values) => (
    values.findIndex((candidate) => candidate.runId === entry.runId) === index
  )).slice(0, 12);

  return Object.freeze({
    valid: true,
    errors: Object.freeze([]),
    receipt,
    profile: normalizeProgressionProfile(profile, now),
    award: Object.freeze({
      ...awardResult.award,
      operationXp,
      liveXp,
      liveSeasonPoints: liveResult.valid ? liveResult.seasonPointsAward : 0,
      total: totalAward
    }),
    live: Object.freeze({
      valid: liveResult.valid,
      seasonId: liveManifest.season.id,
      revision: liveManifest.revision,
      seasonPointsAward: liveResult.valid ? liveResult.seasonPointsAward : 0,
      completedStages: liveResult.valid
        ? liveResult.completedStages.map((entry) => Object.freeze({ ...entry }))
        : Object.freeze([]),
      rewardUnlockIds: liveResult.valid
        ? Object.freeze([...liveResult.rewardUnlockIds])
        : Object.freeze([])
    }),
    completedOperations: Object.freeze(
      operationResult.completed.map((entry) => Object.freeze({ ...entry }))
    ),
    newlyUnlocked: Object.freeze(
      unlockResult.newlyUnlocked.map((entry) => Object.freeze({ ...entry }))
    )
  });
}
