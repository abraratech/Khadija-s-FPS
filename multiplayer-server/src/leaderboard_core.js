// multiplayer-server/src/leaderboard_core.js
// M4.11-M4.14 — deterministic online leaderboard validation and ranking.

export const ONLINE_LEADERBOARD_SCHEMA = 1;
export const ONLINE_LEADERBOARD_LIMIT = 100;
export const ONLINE_LEADERBOARD_PUBLIC_LIMIT = 50;
export const ONLINE_LEADERBOARD_CHALLENGE_TTL_MS = 4 * 60 * 60 * 1000;

export const ONLINE_LEADERBOARD_MAPS = Object.freeze([
  'grid_bunker',
  'industrial_yard',
  'neon_depot',
  'parking_garage',
  'hospital_wing',
  'reactor_courtyard'
]);
export const ONLINE_LEADERBOARD_DIFFICULTIES = Object.freeze([
  'easy', 'normal', 'hard'
]);

const MAP_ALIASES = Object.freeze({
  bunker: 'grid_bunker', grid: 'grid_bunker', gridbunker: 'grid_bunker',
  yard: 'industrial_yard', industrial: 'industrial_yard', industrialyard: 'industrial_yard',
  depot: 'neon_depot', neon: 'neon_depot', neondepot: 'neon_depot',
  garage: 'parking_garage', parking: 'parking_garage', parkinggarage: 'parking_garage',
  hospital: 'hospital_wing', hospitalwing: 'hospital_wing',
  reactor: 'reactor_courtyard', courtyard: 'reactor_courtyard', reactorcourtyard: 'reactor_courtyard'
});

function token(value) {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function integer(value, minimum, maximum, fallback = minimum) {
  return Math.min(maximum, Math.max(minimum, Math.round(finite(value, fallback))));
}
function decimal(value, minimum, maximum, fallback = minimum) {
  return Math.round(Math.min(maximum, Math.max(minimum, finite(value, fallback))) * 10) / 10;
}
export function safeLeaderboardName(value) {
  return String(value ?? 'Survivor').trim()
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ').slice(0, 24) || 'Survivor';
}
export function normalizeLeaderboardMap(value) {
  const cleaned = token(value);
  if (ONLINE_LEADERBOARD_MAPS.includes(cleaned)) return cleaned;
  return MAP_ALIASES[cleaned] || MAP_ALIASES[cleaned.replace(/_/g, '')] || '';
}
export function normalizeLeaderboardDifficulty(value) {
  const cleaned = token(value);
  if (ONLINE_LEADERBOARD_DIFFICULTIES.includes(cleaned)) return cleaned;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric < 0.9) return 'easy';
    if (numeric > 1.15) return 'hard';
    return 'normal';
  }
  return '';
}
export function normalizeRegion(value) {
  const region = String(value || 'ZZ').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  return region.length === 2 ? region : 'ZZ';
}
export function normalizeLeaderboardEntry(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const timestamp = Date.parse(source.createdAt);
  return Object.freeze({
    id: String(source.id || '').slice(0, 96),
    runId: String(source.runId || '').slice(0, 120),
    playerId: String(source.playerId || '').slice(0, 120),
    displayName: safeLeaderboardName(source.displayName),
    region: normalizeRegion(source.region),
    mapId: normalizeLeaderboardMap(source.mapId),
    difficulty: normalizeLeaderboardDifficulty(source.difficulty),
    score: integer(source.score, 0, 25_000_000, 0),
    wave: integer(source.wave, 1, 1000, 1),
    kills: integer(source.kills, 0, 250_000, 0),
    survivalSeconds: decimal(source.survivalSeconds, 0, 172_800, 0),
    accuracy: decimal(source.accuracy, 0, 100, 0),
    headshots: integer(source.headshots, 0, 250_000, 0),
    createdAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(now).toISOString()
  });
}
export function compareLeaderboardEntries(left, right) {
  return (
    right.score - left.score ||
    right.wave - left.wave ||
    right.survivalSeconds - left.survivalSeconds ||
    right.kills - left.kills ||
    right.headshots - left.headshots ||
    Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
    String(left.id).localeCompare(String(right.id))
  );
}
export function rankLeaderboardEntries(entries, limit = ONLINE_LEADERBOARD_LIMIT) {
  const unique = new Map();
  for (const raw of Array.isArray(entries) ? entries : []) {
    const entry = normalizeLeaderboardEntry(raw);
    if (!entry.id || !entry.mapId || !entry.difficulty) continue;
    if (!unique.has(entry.id)) unique.set(entry.id, entry);
  }
  return Object.freeze([...unique.values()].sort(compareLeaderboardEntries).slice(0, limit));
}
export function validateChallengeRequest(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const playerId = String(source.playerId || '').trim().slice(0, 120);
  const runId = String(source.runId || '').trim().slice(0, 120);
  const mapId = normalizeLeaderboardMap(source.mapId);
  const difficulty = normalizeLeaderboardDifficulty(source.difficulty);
  const errors = [];
  if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(playerId)) errors.push('PLAYER_ID_INVALID');
  if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(runId)) errors.push('RUN_ID_INVALID');
  if (!mapId) errors.push('MAP_INVALID');
  if (!difficulty) errors.push('DIFFICULTY_INVALID');
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    value: Object.freeze({ playerId, runId, mapId, difficulty })
  });
}
export function validateLeaderboardSubmission(challenge, payload = {}, now = Date.now()) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const errors = [];
  const challengeValue = challenge && typeof challenge === 'object' ? challenge : {};
  const entry = normalizeLeaderboardEntry({
    ...source,
    region: challengeValue.region,
    mapId: source.mapId,
    difficulty: source.difficulty,
    createdAt: new Date(now).toISOString()
  }, now);
  if (!challengeValue.token) errors.push('CHALLENGE_MISSING');
  if (Number(challengeValue.expiresAt || 0) <= now) errors.push('CHALLENGE_EXPIRED');
  if (challengeValue.used === true) errors.push('CHALLENGE_ALREADY_USED');
  if (String(source.playerId || '') !== String(challengeValue.playerId || '')) errors.push('PLAYER_ID_MISMATCH');
  if (String(source.runId || '') !== String(challengeValue.runId || '')) errors.push('RUN_ID_MISMATCH');
  if (entry.mapId !== challengeValue.mapId) errors.push('MAP_MISMATCH');
  if (entry.difficulty !== challengeValue.difficulty) errors.push('DIFFICULTY_MISMATCH');
  if (!entry.mapId) errors.push('MAP_INVALID');
  if (!entry.difficulty) errors.push('DIFFICULTY_INVALID');
  const rawScore = Number(source.score);
  const rawWave = Number(source.wave);
  const rawKills = Number(source.kills);
  const rawSurvival = Number(source.survivalSeconds);
  const rawAccuracy = Number(source.accuracy);
  const rawHeadshots = Number(source.headshots);
  if (![rawScore, rawWave, rawKills, rawSurvival, rawAccuracy, rawHeadshots].every(Number.isFinite)) errors.push('STATS_NOT_NUMERIC');
  if (rawScore < 0 || rawScore > 25_000_000 || rawWave < 1 || rawWave > 1000 || rawKills < 0 || rawKills > 250_000 || rawSurvival < 0 || rawSurvival > 172_800 || rawAccuracy < 0 || rawAccuracy > 100 || rawHeadshots < 0 || rawHeadshots > 250_000) errors.push('STAT_LIMIT_EXCEEDED');
  if (entry.headshots > entry.kills) errors.push('HEADSHOTS_EXCEED_KILLS');
  if (entry.wave > 1 && entry.survivalSeconds < 5) errors.push('SURVIVAL_TIME_IMPLAUSIBLE');
  if (entry.kills > 0 && entry.score === 0) errors.push('SCORE_IMPLAUSIBLE');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), entry });
}
export function publicLeaderboardEntry(entry, rank = null) {
  const value = normalizeLeaderboardEntry(entry);
  return Object.freeze({
    rank,
    id: value.id,
    displayName: value.displayName,
    region: value.region,
    mapId: value.mapId,
    difficulty: value.difficulty,
    score: value.score,
    wave: value.wave,
    kills: value.kills,
    survivalSeconds: value.survivalSeconds,
    accuracy: value.accuracy,
    headshots: value.headshots,
    createdAt: value.createdAt
  });
}
