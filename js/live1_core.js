// LIVE.1 R1 — deterministic server-time seasonal operations and reward-track authority.

export const LIVE1_PATCH = 'live1-r1-seasonal-operations-rotating-events';
export const LIVE1_SCHEMA = 1;
export const LIVE1_SEASON_LENGTH_DAYS = 84;
export const LIVE1_EPOCH_MS = Date.UTC(2026, 6, 1, 0, 0, 0);
export const LIVE1_MAX_HISTORY = 8;
export const LIVE1_MAX_CLAIMS = 64;

export const LIVE1_ARENAS = Object.freeze([
  Object.freeze({ id: 'grid_bunker', label: 'Grid Bunker', operationId: 'BUNKER_LOCKDOWN' }),
  Object.freeze({ id: 'industrial_yard', label: 'Industrial Yard', operationId: 'YARD_RECOVERY' }),
  Object.freeze({ id: 'neon_depot', label: 'Neon Depot', operationId: 'NEON_BLACKOUT' }),
  Object.freeze({ id: 'parking_garage', label: 'Parking Garage', operationId: 'GARAGE_HOLD' }),
  Object.freeze({ id: 'hospital_wing', label: 'Hospital Wing', operationId: 'TRIAGE_RECOVERY' }),
  Object.freeze({ id: 'reactor_courtyard', label: 'Reactor Courtyard', operationId: 'REACTOR_PURGE' }),
  Object.freeze({ id: 'stormbreak_canal', label: 'Stormbreak Canal', operationId: 'STORMBREAK_LOCKOUT' })
]);

export const LIVE1_ENCOUNTERS = Object.freeze([
  Object.freeze({ id: 'RUSH_HOUR', label: 'Rush Hour', description: 'Runner and Crawler pressure is featured.' }),
  Object.freeze({ id: 'HEAVY_PRESSURE', label: 'Heavy Pressure', description: 'Brute pressure is featured.' }),
  Object.freeze({ id: 'VOLATILE_SURGE', label: 'Volatile Surge', description: 'Exploder pressure is featured.' }),
  Object.freeze({ id: 'TOXIC_FRONT', label: 'Toxic Front', description: 'Spitter pressure is featured.' }),
  Object.freeze({ id: 'ELITE_HUNT', label: 'Elite Hunt', description: 'Elite targets are featured.' }),
  Object.freeze({ id: 'BREACH_SPECIALISTS', label: 'Breach Specialists', description: 'Warden, Stalker, and Sapper pressure is featured.' })
]);

export const LIVE1_CONTRACT_STAGES = Object.freeze([
  Object.freeze({
    id: 'STAGE_DEPLOY',
    label: 'Active Deployment',
    description: 'Complete 3 deployments during the season.',
    metric: 'completedRuns',
    target: 3,
    xp: 220,
    seasonPoints: 120
  }),
  Object.freeze({
    id: 'STAGE_SUPPRESS',
    label: 'Outbreak Suppression',
    description: 'Eliminate 100 hostiles during the season.',
    metric: 'kills',
    target: 100,
    xp: 300,
    seasonPoints: 180
  }),
  Object.freeze({
    id: 'STAGE_ENDURE',
    label: 'Endurance Detail',
    description: 'Clear 20 waves during the season.',
    metric: 'waves',
    target: 20,
    xp: 360,
    seasonPoints: 220
  }),
  Object.freeze({
    id: 'STAGE_OPERATE',
    label: 'Operation Specialist',
    description: 'Complete 6 arena operations during the season.',
    metric: 'contentOperations',
    target: 6,
    xp: 440,
    seasonPoints: 280
  }),
  Object.freeze({
    id: 'STAGE_COORDINATE',
    label: 'Joint Command',
    description: 'Complete 3 shared co-op contracts during the season.',
    metric: 'coopContracts',
    target: 3,
    xp: 520,
    seasonPoints: 340
  })
]);

export const LIVE1_REWARD_TRACK = Object.freeze([
  Object.freeze({
    id: 'TITLE_SEASONED_OPERATOR',
    kind: 'TITLE',
    label: 'Seasoned Operator',
    threshold: 250,
    description: 'Earn 250 seasonal points.'
  }),
  Object.freeze({
    id: 'BADGE_LIVE_COMMAND',
    kind: 'BADGE',
    label: 'Live Command',
    threshold: 650,
    description: 'Earn 650 seasonal points.'
  }),
  Object.freeze({
    id: 'BANNER_EVENT_HORIZON',
    kind: 'BANNER',
    label: 'Event Horizon',
    threshold: 1100,
    description: 'Earn 1,100 seasonal points.',
    tone: '#ff5fd2'
  })
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SEASON_MS = LIVE1_SEASON_LENGTH_DAYS * DAY_MS;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', maximum = 160) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || String(fallback || '')).slice(0, maximum);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function utcDayKey(timestamp) {
  return new Date(integer(timestamp, Date.now())).toISOString().slice(0, 10);
}

function utcWeekKey(timestamp) {
  const date = new Date(integer(timestamp, Date.now()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function nextUtcDay(timestamp) {
  const date = new Date(integer(timestamp, Date.now()));
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1
  );
}

function selectEntry(values, seed) {
  if (!Array.isArray(values) || !values.length) return null;
  return values[hashText(seed) % values.length];
}

export function resolveLive1Manifest(now = Date.now()) {
  const serverNow = integer(now, Date.now(), 1);
  const offset = Math.max(0, serverNow - LIVE1_EPOCH_MS);
  const seasonIndex = Math.floor(offset / SEASON_MS);
  const seasonStartAt = LIVE1_EPOCH_MS + seasonIndex * SEASON_MS;
  const seasonEndAt = seasonStartAt + SEASON_MS;
  const seasonNumber = seasonIndex + 1;
  const seasonId = `OUTBREAK_CYCLE_${seasonNumber}`;
  const dayKey = utcDayKey(serverNow);
  const weekKey = utcWeekKey(serverNow);
  const featuredArena = selectEntry(
    LIVE1_ARENAS,
    `${seasonId}:daily-arena:${dayKey}`
  ) || LIVE1_ARENAS[0];
  const featuredEncounter = selectEntry(
    LIVE1_ENCOUNTERS,
    `${seasonId}:daily-encounter:${dayKey}`
  ) || LIVE1_ENCOUNTERS[0];
  const weeklyArena = selectEntry(
    LIVE1_ARENAS,
    `${seasonId}:weekly-operation:${weekKey}`
  ) || LIVE1_ARENAS[0];
  const revision = `${seasonId}:${dayKey}:${weekKey}`;
  const validUntil = Math.min(nextUtcDay(serverNow), seasonEndAt);

  return Object.freeze({
    ok: true,
    patch: LIVE1_PATCH,
    schema: LIVE1_SCHEMA,
    serverNow,
    revision,
    validUntil,
    season: Object.freeze({
      id: seasonId,
      number: seasonNumber,
      label: `Outbreak Cycle ${seasonNumber}`,
      startAt: seasonStartAt,
      endAt: seasonEndAt,
      active: serverNow >= seasonStartAt && serverNow < seasonEndAt
    }),
    daily: Object.freeze({
      key: dayKey,
      featuredArena: Object.freeze({ ...featuredArena }),
      featuredEncounter: Object.freeze({ ...featuredEncounter })
    }),
    weekly: Object.freeze({
      key: weekKey,
      featuredOperation: Object.freeze({ ...weeklyArena })
    }),
    contracts: Object.freeze(
      LIVE1_CONTRACT_STAGES.map((entry) => Object.freeze({ ...entry }))
    ),
    rewards: Object.freeze(
      LIVE1_REWARD_TRACK.map((entry) => Object.freeze({ ...entry }))
    ),
    rules: Object.freeze({
      clientClockTrusted: false,
      automaticProtectedClaims: true,
      idempotentRunReceipts: true,
      baseModesPreserved: true,
      payToWin: false
    })
  });
}

export function normalizeLive1Manifest(value = {}, now = Date.now()) {
  const source = isObject(value) ? value : {};
  const fallback = resolveLive1Manifest(now);
  const season = isObject(source.season) ? source.season : {};
  const daily = isObject(source.daily) ? source.daily : {};
  const weekly = isObject(source.weekly) ? source.weekly : {};
  const featuredArenaId = cleanText(
    daily.featuredArena?.id,
    fallback.daily.featuredArena.id,
    80
  );
  const featuredEncounterId = cleanText(
    daily.featuredEncounter?.id,
    fallback.daily.featuredEncounter.id,
    80
  );
  const featuredOperationId = cleanText(
    weekly.featuredOperation?.operationId,
    fallback.weekly.featuredOperation.operationId,
    80
  );
  const arena = LIVE1_ARENAS.find((entry) => entry.id === featuredArenaId)
    || fallback.daily.featuredArena;
  const encounter = LIVE1_ENCOUNTERS.find(
    (entry) => entry.id === featuredEncounterId
  ) || fallback.daily.featuredEncounter;
  const operationArena = LIVE1_ARENAS.find(
    (entry) => entry.operationId === featuredOperationId
  ) || fallback.weekly.featuredOperation;
  return Object.freeze({
    ok: source.ok !== false,
    patch: LIVE1_PATCH,
    schema: LIVE1_SCHEMA,
    serverNow: integer(source.serverNow, fallback.serverNow, 1),
    revision: cleanText(source.revision, fallback.revision, 160),
    validUntil: integer(source.validUntil, fallback.validUntil, 1),
    season: Object.freeze({
      id: cleanText(season.id, fallback.season.id, 80),
      number: integer(season.number, fallback.season.number, 1),
      label: cleanText(season.label, fallback.season.label, 120),
      startAt: integer(season.startAt, fallback.season.startAt, 1),
      endAt: integer(season.endAt, fallback.season.endAt, 1),
      active: season.active !== false
    }),
    daily: Object.freeze({
      key: cleanText(daily.key, fallback.daily.key, 24),
      featuredArena: Object.freeze({ ...arena }),
      featuredEncounter: Object.freeze({ ...encounter })
    }),
    weekly: Object.freeze({
      key: cleanText(weekly.key, fallback.weekly.key, 24),
      featuredOperation: Object.freeze({ ...operationArena })
    }),
    contracts: Object.freeze(
      LIVE1_CONTRACT_STAGES.map((entry) => Object.freeze({ ...entry }))
    ),
    rewards: Object.freeze(
      LIVE1_REWARD_TRACK.map((entry) => Object.freeze({ ...entry }))
    ),
    rules: Object.freeze({ ...fallback.rules })
  });
}

function emptyMetrics() {
  return {
    completedRuns: 0,
    kills: 0,
    waves: 0,
    contentOperations: 0,
    coopContracts: 0,
    featuredArenaRuns: 0,
    featuredOperationCompletions: 0
  };
}

export function defaultLive1Profile(
  now = Date.now(),
  manifestValue = resolveLive1Manifest(now)
) {
  const manifest = normalizeLive1Manifest(manifestValue, now);
  return {
    schema: LIVE1_SCHEMA,
    patch: LIVE1_PATCH,
    seasonId: manifest.season.id,
    seasonLabel: manifest.season.label,
    seasonStartAt: manifest.season.startAt,
    seasonEndAt: manifest.season.endAt,
    seasonPoints: 0,
    metrics: emptyMetrics(),
    completedStages: {},
    rewardClaims: {},
    recentActivity: [],
    history: [],
    updatedAt: integer(now, Date.now(), 1)
  };
}

function normalizeClaims(value) {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, LIVE1_MAX_CLAIMS)
      .map(([key, timestamp]) => [
        cleanText(key, '', 100),
        integer(timestamp, 0)
      ])
      .filter(([key, timestamp]) => Boolean(key) && timestamp > 0)
  );
}

function normalizeMetrics(value) {
  const source = isObject(value) ? value : {};
  const defaults = emptyMetrics();
  const output = {};
  Object.keys(defaults).forEach((field) => {
    output[field] = integer(source[field], defaults[field], 0, 10_000_000);
  });
  return output;
}

function normalizeActivity(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((entry) => ({
      id: cleanText(entry.id, '', 120),
      kind: cleanText(entry.kind, 'LIVE_EVENT', 60),
      detail: cleanText(entry.detail, '', 180),
      at: integer(entry.at, 0)
    }))
    .filter((entry) => entry.id && entry.at > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 20);
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((entry) => ({
      seasonId: cleanText(entry.seasonId, '', 80),
      seasonLabel: cleanText(entry.seasonLabel, '', 120),
      seasonPoints: integer(entry.seasonPoints, 0),
      completedStages: integer(entry.completedStages, 0),
      archivedAt: integer(entry.archivedAt, 0)
    }))
    .filter((entry) => entry.seasonId && entry.archivedAt > 0)
    .sort((a, b) => b.archivedAt - a.archivedAt)
    .slice(0, LIVE1_MAX_HISTORY);
}

export function normalizeLive1Profile(
  value = {},
  now = Date.now(),
  manifestValue = resolveLive1Manifest(now)
) {
  const manifest = normalizeLive1Manifest(manifestValue, now);
  const source = isObject(value) ? value : {};
  const seasonId = cleanText(source.seasonId, manifest.season.id, 80);
  const output = {
    schema: LIVE1_SCHEMA,
    patch: LIVE1_PATCH,
    seasonId,
    seasonLabel: cleanText(
      source.seasonLabel,
      seasonId === manifest.season.id
        ? manifest.season.label
        : seasonId.replace(/_/g, ' '),
      120
    ),
    seasonStartAt: integer(source.seasonStartAt, manifest.season.startAt, 1),
    seasonEndAt: integer(source.seasonEndAt, manifest.season.endAt, 1),
    seasonPoints: integer(source.seasonPoints, 0, 0, 10_000_000),
    metrics: normalizeMetrics(source.metrics),
    completedStages: normalizeClaims(source.completedStages),
    rewardClaims: normalizeClaims(source.rewardClaims),
    recentActivity: normalizeActivity(source.recentActivity),
    history: normalizeHistory(source.history),
    updatedAt: integer(source.updatedAt, now, 1)
  };
  return output;
}

function archiveSeason(profile, now) {
  return [
    {
      seasonId: profile.seasonId,
      seasonLabel: profile.seasonLabel,
      seasonPoints: integer(profile.seasonPoints, 0),
      completedStages: Object.keys(profile.completedStages || {}).length,
      archivedAt: integer(now, Date.now(), 1)
    },
    ...(profile.history || [])
  ].slice(0, LIVE1_MAX_HISTORY);
}

function ensureCurrentSeason(profileValue, manifest, now) {
  const normalized = normalizeLive1Profile(profileValue, now, manifest);
  if (normalized.seasonId === manifest.season.id) return normalized;
  const next = defaultLive1Profile(now, manifest);
  next.history = archiveSeason(normalized, now);
  return next;
}

function completedRun(receipt) {
  return !/QUIT|LEAVE|ABANDON|CANCEL/.test(
    cleanText(receipt?.reason, 'ENDED', 80).toUpperCase()
  );
}

export function normalizeLive1ReceiptContext(
  receiptValue = {},
  manifestValue = resolveLive1Manifest(receiptValue?.endedAt || Date.now())
) {
  const receipt = isObject(receiptValue) ? receiptValue : {};
  const manifest = normalizeLive1Manifest(
    manifestValue,
    receipt.endedAt || Date.now()
  );
  const seasonId = cleanText(receipt.liveSeasonId, '', 80);
  const revision = cleanText(receipt.liveManifestRevision, '', 160);
  const valid = (
    (!seasonId || seasonId === manifest.season.id)
    && (!revision || revision === manifest.revision)
  );
  return Object.freeze({
    valid,
    seasonId: manifest.season.id,
    revision: manifest.revision,
    featuredArenaId: manifest.daily.featuredArena.id,
    featuredEncounterId: manifest.daily.featuredEncounter.id,
    featuredOperationId: manifest.weekly.featuredOperation.operationId
  });
}

export function applyLive1RunReceipt(
  profileValue,
  receiptValue = {},
  manifestValue = resolveLive1Manifest(receiptValue?.endedAt || Date.now()),
  now = Date.now()
) {
  const manifest = normalizeLive1Manifest(
    manifestValue,
    receiptValue?.endedAt || now
  );
  const context = normalizeLive1ReceiptContext(receiptValue, manifest);
  if (!context.valid || manifest.season.active !== true) {
    return Object.freeze({
      valid: false,
      profile: normalizeLive1Profile(profileValue, now, manifest),
      xpAward: 0,
      seasonPointsAward: 0,
      completedStages: Object.freeze([]),
      rewardUnlockIds: Object.freeze([]),
      errors: Object.freeze(['LIVE_MANIFEST_MISMATCH'])
    });
  }

  const receipt = isObject(receiptValue) ? receiptValue : {};
  const profile = ensureCurrentSeason(profileValue, manifest, now);
  const isCompleted = completedRun(receipt);
  const mapId = cleanText(receipt.mapId, 'unknown', 80);
  const kills = integer(receipt.kills, 0, 0, 5000);
  const waves = integer(receipt.wavesCleared, 0, 0, 249);
  const operations = integer(receipt.contentOperationsCompleted, 0, 0, 4);
  const coopContracts = integer(receipt.coopContractsCompleted, 0, 0, 4);
  const featuredArenaRun = isCompleted
    && mapId === manifest.daily.featuredArena.id;
  const featuredOperationCompletion = operations > 0
    && mapId === manifest.weekly.featuredOperation.id;

  profile.metrics.completedRuns += isCompleted ? 1 : 0;
  profile.metrics.kills += kills;
  profile.metrics.waves += waves;
  profile.metrics.contentOperations += operations;
  profile.metrics.coopContracts += coopContracts;
  profile.metrics.featuredArenaRuns += featuredArenaRun ? 1 : 0;
  profile.metrics.featuredOperationCompletions += (
    featuredOperationCompletion ? operations : 0
  );

  let seasonPointsAward = 0;
  if (isCompleted) seasonPointsAward += 20;
  seasonPointsAward += Math.min(40, Math.floor(kills / 5) * 2);
  seasonPointsAward += Math.min(50, waves * 2);
  seasonPointsAward += operations * 40;
  seasonPointsAward += coopContracts * 30;
  if (featuredArenaRun) seasonPointsAward += 25;
  if (featuredOperationCompletion) seasonPointsAward += 35;

  const completedStages = [];
  let xpAward = 0;
  for (const stage of LIVE1_CONTRACT_STAGES) {
    if (profile.completedStages[stage.id]) continue;
    const progress = integer(profile.metrics[stage.metric], 0);
    if (progress < stage.target) continue;
    const completedAt = integer(now, Date.now(), 1);
    profile.completedStages[stage.id] = completedAt;
    seasonPointsAward += stage.seasonPoints;
    xpAward += stage.xp;
    completedStages.push({
      ...stage,
      completedAt
    });
  }

  profile.seasonPoints += seasonPointsAward;
  const rewardUnlockIds = [];
  for (const reward of LIVE1_REWARD_TRACK) {
    if (profile.rewardClaims[reward.id]) continue;
    if (profile.seasonPoints < reward.threshold) continue;
    profile.rewardClaims[reward.id] = integer(now, Date.now(), 1);
    rewardUnlockIds.push(reward.id);
  }

  const runId = cleanText(receipt.runId, `live-${now}`, 120);
  profile.recentActivity = [
    {
      id: `${runId}:${manifest.revision}`,
      kind: 'LIVE_RUN',
      detail: [
        isCompleted ? 'Completed deployment' : 'Deployment ended',
        featuredArenaRun ? 'featured arena' : '',
        seasonPointsAward ? `+${seasonPointsAward} SP` : ''
      ].filter(Boolean).join(' · '),
      at: integer(receipt.endedAt, now, 1)
    },
    ...profile.recentActivity
  ].filter((entry, index, values) => (
    values.findIndex((candidate) => candidate.id === entry.id) === index
  )).slice(0, 20);
  profile.updatedAt = integer(now, Date.now(), 1);

  return Object.freeze({
    valid: true,
    profile: normalizeLive1Profile(profile, now, manifest),
    xpAward,
    seasonPointsAward,
    completedStages: Object.freeze(
      completedStages.map((entry) => Object.freeze({ ...entry }))
    ),
    rewardUnlockIds: Object.freeze([...rewardUnlockIds]),
    featuredArenaRun,
    featuredOperationCompletion,
    errors: Object.freeze([])
  });
}

export function getLive1RewardPresentation(profileValue, now = Date.now()) {
  const manifest = resolveLive1Manifest(now);
  const profile = normalizeLive1Profile(profileValue, now, manifest);
  return Object.freeze(
    LIVE1_REWARD_TRACK.map((reward) => Object.freeze({
      ...reward,
      unlocked: Boolean(profile.rewardClaims[reward.id]),
      progress: Math.min(reward.threshold, profile.seasonPoints)
    }))
  );
}

export function getLive1ContractPresentation(profileValue, now = Date.now()) {
  const manifest = resolveLive1Manifest(now);
  const profile = normalizeLive1Profile(profileValue, now, manifest);
  return Object.freeze(
    LIVE1_CONTRACT_STAGES.map((stage) => Object.freeze({
      ...stage,
      progress: Math.min(
        stage.target,
        integer(profile.metrics[stage.metric], 0)
      ),
      completed: Boolean(profile.completedStages[stage.id])
    }))
  );
}
