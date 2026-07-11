export const LOCAL_LEADERBOARD_STORAGE_KEY = 'ka_local_leaderboards_v1';
export const LOCAL_LEADERBOARD_SCHEMA = 1;
export const LOCAL_LEADERBOARD_LIMIT = 10;

export const LOCAL_LEADERBOARD_MAPS = Object.freeze([
  Object.freeze({ id: 'grid_bunker', label: 'Grid Bunker' }),
  Object.freeze({ id: 'industrial_yard', label: 'Industrial Yard' }),
  Object.freeze({ id: 'neon_depot', label: 'Neon Depot' }),
  Object.freeze({ id: 'parking_garage', label: 'Parking Garage' }),
  Object.freeze({ id: 'hospital_wing', label: 'Hospital Wing' }),
  Object.freeze({ id: 'reactor_courtyard', label: 'Reactor Courtyard' })
]);

export const LOCAL_LEADERBOARD_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: 'easy', label: 'Easy' }),
  Object.freeze({ id: 'normal', label: 'Normal' }),
  Object.freeze({ id: 'hard', label: 'Hard' })
]);

const MAP_ALIASES = Object.freeze({
  bunker: 'grid_bunker', grid: 'grid_bunker', gridbunker: 'grid_bunker',
  yard: 'industrial_yard', industrial: 'industrial_yard', industrialyard: 'industrial_yard',
  depot: 'neon_depot', neon: 'neon_depot', neondepot: 'neon_depot',
  garage: 'parking_garage', parking: 'parking_garage', parkinggarage: 'parking_garage',
  hospital: 'hospital_wing', hospitalwing: 'hospital_wing',
  reactor: 'reactor_courtyard', courtyard: 'reactor_courtyard', reactorcourtyard: 'reactor_courtyard'
});

function cleanToken(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function nonNegativeInteger(value) {
  return Math.max(0, Math.round(finiteNumber(value, 0)));
}
function clamp(value, minimum, maximum, fallback = minimum) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));
}
function cleanText(value, maximum = 80) {
  return String(value ?? '').trim().slice(0, maximum);
}
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeLocalLeaderboardMap(value) {
  const token = cleanToken(value);
  if (LOCAL_LEADERBOARD_MAPS.some((map) => map.id === token)) return token;
  return MAP_ALIASES[token] || MAP_ALIASES[token.replace(/_/g, '')] || 'grid_bunker';
}

export function normalizeLocalLeaderboardDifficulty(value) {
  const token = cleanToken(value);
  if (['easy', 'normal', 'hard'].includes(token)) return token;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric < 0.9) return 'easy';
    if (numeric > 1.15) return 'hard';
  }
  return 'normal';
}

export function normalizeLocalLeaderboardEntry(value = {}, now = Date.now()) {
  const source = isObject(value) ? value : {};
  const createdAtCandidate = Date.parse(source.createdAt);
  const createdAt = Number.isFinite(createdAtCandidate) ? new Date(createdAtCandidate).toISOString() : new Date(now).toISOString();
  const score = nonNegativeInteger(source.score);
  const wave = Math.max(1, nonNegativeInteger(source.wave));
  const kills = nonNegativeInteger(source.kills);
  const survivalSeconds = Math.max(0, finiteNumber(source.survivalSeconds, 0));
  const accuracy = clamp(source.accuracy, 0, 100, 0);
  const headshots = nonNegativeInteger(source.headshots);
  const mapId = normalizeLocalLeaderboardMap(source.mapId);
  const difficulty = normalizeLocalLeaderboardDifficulty(source.difficulty);
  const idSeed = cleanText(source.id, 120) || `${createdAt}|${mapId}|${difficulty}|${score}|${wave}|${kills}`;
  return Object.freeze({
    id: idSeed,
    createdAt,
    mapId,
    difficulty,
    score,
    wave,
    kills,
    survivalSeconds: Math.round(survivalSeconds * 10) / 10,
    accuracy: Math.round(accuracy * 10) / 10,
    headshots
  });
}

export function compareLocalLeaderboardEntries(left, right) {
  return (
    right.score - left.score ||
    right.wave - left.wave ||
    right.survivalSeconds - left.survivalSeconds ||
    right.kills - left.kills ||
    right.headshots - left.headshots ||
    Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

export function normalizeLocalLeaderboardStore(value = {}) {
  const source = isObject(value) ? value : {};
  const rawEntries = Array.isArray(source.entries) ? source.entries : [];
  const entries = rawEntries.map((entry) => normalizeLocalLeaderboardEntry(entry));
  const grouped = new Map();
  for (const entry of entries) {
    const key = `${entry.mapId}|${entry.difficulty}`;
    const list = grouped.get(key) || [];
    if (!list.some((item) => item.id === entry.id)) list.push(entry);
    grouped.set(key, list);
  }
  const trimmed = [];
  for (const list of grouped.values()) {
    list.sort(compareLocalLeaderboardEntries);
    trimmed.push(...list.slice(0, LOCAL_LEADERBOARD_LIMIT));
  }
  trimmed.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return Object.freeze({ schema: LOCAL_LEADERBOARD_SCHEMA, entries: Object.freeze(trimmed) });
}

export function loadLocalLeaderboardStore(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(LOCAL_LEADERBOARD_STORAGE_KEY);
    return normalizeLocalLeaderboardStore(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeLocalLeaderboardStore();
  }
}

export function saveLocalLeaderboardStore(value, storage = globalThis.localStorage) {
  const normalized = normalizeLocalLeaderboardStore(value);
  try {
    storage?.setItem?.(LOCAL_LEADERBOARD_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Restricted/private storage must not prevent gameplay.
  }
  return normalized;
}

export function addLocalLeaderboardEntry(store, entry, storage = null) {
  const current = normalizeLocalLeaderboardStore(store);
  const normalizedEntry = normalizeLocalLeaderboardEntry(entry);
  const next = normalizeLocalLeaderboardStore({ entries: [...current.entries, normalizedEntry] });
  if (storage) saveLocalLeaderboardStore(next, storage);
  return Object.freeze({ store: next, entry: normalizedEntry, rank: getLocalLeaderboardRank(next, normalizedEntry) });
}

export function getLocalLeaderboardEntries(store, { mapId = 'grid_bunker', difficulty = 'normal' } = {}) {
  const map = normalizeLocalLeaderboardMap(mapId);
  const level = normalizeLocalLeaderboardDifficulty(difficulty);
  return Object.freeze(normalizeLocalLeaderboardStore(store).entries
    .filter((entry) => entry.mapId === map && entry.difficulty === level)
    .sort(compareLocalLeaderboardEntries)
    .slice(0, LOCAL_LEADERBOARD_LIMIT));
}

export function getLocalLeaderboardRank(store, entry) {
  const normalized = normalizeLocalLeaderboardEntry(entry);
  const list = getLocalLeaderboardEntries(store, normalized);
  const index = list.findIndex((item) => item.id === normalized.id);
  return index >= 0 ? index + 1 : null;
}

export function clearLocalLeaderboards(storage = globalThis.localStorage) {
  const empty = normalizeLocalLeaderboardStore();
  try {
    storage?.removeItem?.(LOCAL_LEADERBOARD_STORAGE_KEY);
  } catch {
    // Ignore restricted storage.
  }
  return empty;
}

export function leaderboardMapLabel(value) {
  const id = normalizeLocalLeaderboardMap(value);
  return LOCAL_LEADERBOARD_MAPS.find((map) => map.id === id)?.label || 'Grid Bunker';
}

export function leaderboardDifficultyLabel(value) {
  const id = normalizeLocalLeaderboardDifficulty(value);
  return LOCAL_LEADERBOARD_DIFFICULTIES.find((difficulty) => difficulty.id === id)?.label || 'Normal';
}
