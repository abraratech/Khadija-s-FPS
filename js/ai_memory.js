// js/ai_memory.js
// C10.4 — Persistent Adaptive AI Memory
//
// Stores a small, versioned, per-map player profile in localStorage.
// The Director uses it only as a capped prior. It never:
// - activates before the normal Director activation wave
// - increases the Director intensity ceiling
// - bypasses current-run mercy behavior
// - stores raw movement paths, personal data, or full combat logs

const MEMORY_STORAGE_KEY = 'ka_ai_memory_v1';
const MEMORY_VERSION = 1;
const MAX_MAPS = 5;
const MAX_MATCHES_PER_MAP = 6;
const MAX_STORAGE_BYTES = 24000;
const MIN_WAVES_TO_LEARN = 2;
const RECENCY_DECAY = 0.72;

const EMPTY_PROFILE = Object.freeze({
  style: 'BALANCED',
  preferredRange: 'MID',
  campingScore: 0,
  movementScore: 0,
  accuracy: 0,
  headshotRate: 0,
  averageHitDistance: 0,
  damagePressure: 0,
  confidence: 0,
  preferredWeapon: 'UNKNOWN',
  dangerEnemy: 'UNKNOWN'
});

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanToken(value, fallback = 'UNKNOWN', maxLength = 32) {
  const token = String(value || fallback)
    .replace(/[^A-Za-z0-9_+\- ]/g, '')
    .trim()
    .slice(0, maxLength);

  return token || fallback;
}

function makeEmptyDatabase() {
  return {
    version: MEMORY_VERSION,
    updatedAt: 0,
    maps: {}
  };
}

function makeEmptyMapRecord(mapId) {
  return {
    mapId,
    updatedAt: 0,
    matches: [],
    aggregate: null
  };
}

function sanitizeProfile(profile = {}) {
  return {
    style: cleanToken(profile.style, 'BALANCED'),
    preferredRange: cleanToken(profile.preferredRange, 'MID'),
    campingScore: clamp(profile.campingScore),
    movementScore: clamp(profile.movementScore),
    accuracy: clamp(profile.accuracy),
    headshotRate: clamp(profile.headshotRate),
    averageHitDistance: clamp(profile.averageHitDistance, 0, 120),
    damagePressure: clamp(profile.damagePressure, 0, 2),
    confidence: clamp(profile.confidence),
    preferredWeapon: cleanToken(profile.preferredWeapon),
    dangerEnemy: cleanToken(profile.dangerEnemy)
  };
}

function sanitizeNavigation(navigation = {}, waves = 1) {
  const safeWaves = Math.max(1, finite(waves, 1));
  const roleResetRequests = Math.max(0, Math.round(finite(navigation.roleResetRequests)));
  const trapDetours = Math.max(0, Math.round(finite(navigation.trapDetours)));
  const anchorDetours = Math.max(0, Math.round(finite(navigation.anchorDetours)));
  const wallCornerDetours = Math.max(0, Math.round(finite(navigation.wallCornerDetours)));
  const resetsPerWave = roleResetRequests / safeWaves;

  return {
    roleResetRequests,
    trapDetours,
    anchorDetours,
    wallCornerDetours,
    resetsPerWave: clamp(resetsPerWave, 0, 20),
    reliability: clamp(1 - resetsPerWave / 4)
  };
}

function sanitizeMatch(match = {}) {
  const waves = Math.max(0, Math.round(finite(match.waves)));

  return {
    id: cleanToken(match.id, 'run', 48),
    timestamp: Math.max(0, Math.round(finite(match.timestamp))),
    waves,
    difficulty: clamp(match.difficulty, 0.5, 3),
    finalized: match.finalized === true,
    profile: sanitizeProfile(match.profile),
    navigation: sanitizeNavigation(match.navigation, waves)
  };
}

function sanitizeDatabase(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== MEMORY_VERSION) {
    return makeEmptyDatabase();
  }

  const database = makeEmptyDatabase();
  database.updatedAt = Math.max(0, Math.round(finite(raw.updatedAt)));

  const mapEntries = Object.entries(raw.maps || {})
    .slice(0, MAX_MAPS * 2);

  for (const [rawMapId, rawRecord] of mapEntries) {
    const mapId = cleanToken(rawMapId, 'unknown', 48);
    const record = makeEmptyMapRecord(mapId);
    record.updatedAt = Math.max(0, Math.round(finite(rawRecord?.updatedAt)));

    const matches = Array.isArray(rawRecord?.matches)
      ? rawRecord.matches.map(sanitizeMatch)
      : [];

    record.matches = matches
      .filter((match) => match.waves >= MIN_WAVES_TO_LEARN)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_MATCHES_PER_MAP);

    if (record.matches.length > 0) {
      record.aggregate = aggregateMatches(record.matches);
      database.maps[mapId] = record;
    }
  }

  trimDatabase(database);
  return database;
}

function readDatabase() {
  try {
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!raw) return makeEmptyDatabase();
    return sanitizeDatabase(JSON.parse(raw));
  } catch {
    return makeEmptyDatabase();
  }
}

function weightedAverage(weightedValues, fallback = 0) {
  let total = 0;
  let weightTotal = 0;

  for (const [value, weight] of weightedValues) {
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    total += value * weight;
    weightTotal += weight;
  }

  return weightTotal > 0 ? total / weightTotal : fallback;
}

function weightedMode(weightedValues, fallback = 'UNKNOWN') {
  const scores = {};

  for (const [value, weight] of weightedValues) {
    const key = cleanToken(value, fallback);
    scores[key] = (scores[key] || 0) + Math.max(0, finite(weight));
  }

  let best = fallback;
  let bestScore = -Infinity;

  for (const [key, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }

  return best;
}

function getMatchWeight(match, index) {
  const recencyWeight = Math.pow(RECENCY_DECAY, index);
  const waveQuality = clamp(match.waves / 10, 0.35, 1);
  const finalizedWeight = match.finalized ? 1 : 0.88;
  return recencyWeight * waveQuality * finalizedWeight;
}

function aggregateMatches(matches = []) {
  const sorted = matches
    .map(sanitizeMatch)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_MATCHES_PER_MAP);

  if (!sorted.length) return null;

  const weighted = sorted.map((match, index) => ({
    match,
    weight: getMatchWeight(match, index)
  }));

  const values = (selector) => weighted.map(({ match, weight }) => [selector(match), weight]);

  const profile = {
    style: weightedMode(values((match) => match.profile.style), 'BALANCED'),
    preferredRange: weightedMode(values((match) => match.profile.preferredRange), 'MID'),
    campingScore: clamp(weightedAverage(values((match) => match.profile.campingScore))),
    movementScore: clamp(weightedAverage(values((match) => match.profile.movementScore))),
    accuracy: clamp(weightedAverage(values((match) => match.profile.accuracy))),
    headshotRate: clamp(weightedAverage(values((match) => match.profile.headshotRate))),
    averageHitDistance: clamp(
      weightedAverage(values((match) => match.profile.averageHitDistance)),
      0,
      120
    ),
    damagePressure: clamp(
      weightedAverage(values((match) => match.profile.damagePressure)),
      0,
      2
    ),
    confidence: clamp(weightedAverage(values((match) => match.profile.confidence))),
    preferredWeapon: weightedMode(values((match) => match.profile.preferredWeapon)),
    dangerEnemy: weightedMode(values((match) => match.profile.dangerEnemy))
  };

  const navigation = {
    resetsPerWave: clamp(
      weightedAverage(values((match) => match.navigation.resetsPerWave)),
      0,
      20
    ),
    reliability: clamp(
      weightedAverage(values((match) => match.navigation.reliability), 1)
    ),
    averageTrapDetours: Math.max(
      0,
      weightedAverage(values((match) => match.navigation.trapDetours))
    ),
    averageAnchorDetours: Math.max(
      0,
      weightedAverage(values((match) => match.navigation.anchorDetours))
    ),
    averageCornerDetours: Math.max(
      0,
      weightedAverage(values((match) => match.navigation.wallCornerDetours))
    )
  };

  return {
    runs: sorted.length,
    averageWaves: Math.max(0, weightedAverage(values((match) => match.waves))),
    lastPlayedAt: sorted[0]?.timestamp || 0,
    profile,
    navigation
  };
}

function trimDatabase(database) {
  const records = Object.values(database.maps || {})
    .filter((record) => Array.isArray(record.matches) && record.matches.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  database.maps = {};

  for (const record of records.slice(0, MAX_MAPS)) {
    record.matches = record.matches
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_MATCHES_PER_MAP);
    record.aggregate = aggregateMatches(record.matches);
    database.maps[record.mapId] = record;
  }

  let encoded = JSON.stringify(database);

  // Final hard byte guard. Remove the globally oldest run until the compact
  // database fits, while preserving at least one run for each learned map.
  while (encoded.length > MAX_STORAGE_BYTES) {
    const candidates = Object.values(database.maps)
      .filter((record) => record.matches.length > 1)
      .map((record) => ({
        record,
        oldestTimestamp: record.matches[record.matches.length - 1]?.timestamp || 0
      }))
      .sort((a, b) => a.oldestTimestamp - b.oldestTimestamp);

    if (!candidates.length) break;

    candidates[0].record.matches.pop();
    candidates[0].record.aggregate = aggregateMatches(candidates[0].record.matches);
    encoded = JSON.stringify(database);
  }

  return database;
}

function writeDatabase(database) {
  const safeDatabase = trimDatabase(sanitizeDatabase(database));
  safeDatabase.updatedAt = Date.now();

  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(safeDatabase));
    return true;
  } catch {
    return false;
  }
}

function getAllMatches(database) {
  return Object.values(database.maps || {})
    .flatMap((record) => record.matches || [])
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_MATCHES_PER_MAP * 2);
}

function buildPrior(aggregate, source = 'none') {
  if (!aggregate?.runs) {
    return {
      available: false,
      source: 'none',
      runs: 0,
      influence: 0,
      profile: { ...EMPTY_PROFILE },
      navigation: {
        resetsPerWave: 0,
        reliability: 1,
        averageTrapDetours: 0,
        averageAnchorDetours: 0,
        averageCornerDetours: 0
      }
    };
  }

  const runFactor = clamp(aggregate.runs / MAX_MATCHES_PER_MAP);
  const waveFactor = clamp(aggregate.averageWaves / 10);
  const mapSpecific = source === 'map';

  const influence = mapSpecific
    ? clamp(0.10 + runFactor * 0.18 + waveFactor * 0.06, 0.08, 0.34)
    : clamp(0.04 + runFactor * 0.07 + waveFactor * 0.04, 0.04, 0.15);

  return {
    available: true,
    source,
    runs: aggregate.runs,
    averageWaves: aggregate.averageWaves,
    lastPlayedAt: aggregate.lastPlayedAt,
    influence,
    profile: sanitizeProfile(aggregate.profile),
    navigation: {
      resetsPerWave: clamp(aggregate.navigation?.resetsPerWave, 0, 20),
      reliability: clamp(aggregate.navigation?.reliability, 0, 1),
      averageTrapDetours: Math.max(0, finite(aggregate.navigation?.averageTrapDetours)),
      averageAnchorDetours: Math.max(0, finite(aggregate.navigation?.averageAnchorDetours)),
      averageCornerDetours: Math.max(0, finite(aggregate.navigation?.averageCornerDetours))
    }
  };
}

export function getAIMemoryPrior(mapId = 'unknown') {
  const database = readDatabase();
  const normalizedMapId = cleanToken(mapId, 'unknown', 48);
  const mapRecord = database.maps[normalizedMapId];

  if (mapRecord?.aggregate?.runs) {
    return buildPrior(mapRecord.aggregate, 'map');
  }

  // A low-influence global fallback prevents a brand-new map from treating a
  // veteran player as completely unknown, without copying strong map-specific
  // counterplay into a different layout.
  const globalMatches = getAllMatches(database);
  const globalAggregate = aggregateMatches(globalMatches);

  return buildPrior(globalAggregate, globalAggregate ? 'global' : 'none');
}

export function commitAIMemoryRun({
  sessionId = 'run',
  mapId = 'unknown',
  difficulty = 1,
  completedWaves = 0,
  profile = {},
  navigation = {},
  finalized = false
} = {}) {
  const waves = Math.max(0, Math.round(finite(completedWaves)));

  if (waves < MIN_WAVES_TO_LEARN) {
    return {
      saved: false,
      reason: 'not-enough-waves',
      minimumWaves: MIN_WAVES_TO_LEARN
    };
  }

  const database = readDatabase();
  const normalizedMapId = cleanToken(mapId, 'unknown', 48);
  const record = database.maps[normalizedMapId] || makeEmptyMapRecord(normalizedMapId);
  const safeSessionId = cleanToken(sessionId, 'run', 48);

  const nextMatch = sanitizeMatch({
    id: safeSessionId,
    timestamp: Date.now(),
    waves,
    difficulty,
    finalized,
    profile,
    navigation
  });

  const existingIndex = record.matches.findIndex((match) => match.id === safeSessionId);

  if (existingIndex >= 0) {
    record.matches[existingIndex] = nextMatch;
  } else {
    record.matches.push(nextMatch);
  }

  record.matches = record.matches
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_MATCHES_PER_MAP);
  record.updatedAt = Date.now();
  record.aggregate = aggregateMatches(record.matches);

  database.maps[normalizedMapId] = record;
  const saved = writeDatabase(database);

  refreshAIMemoryControls();

  return {
    saved,
    reason: saved ? 'saved' : 'storage-unavailable',
    mapId: normalizedMapId,
    runs: record.aggregate?.runs || 0,
    prior: buildPrior(record.aggregate, 'map')
  };
}

export function resetAIMemory() {
  try {
    localStorage.removeItem(MEMORY_STORAGE_KEY);
  } catch {
    return false;
  }

  try {
    window.dispatchEvent(new CustomEvent('ka-ai-memory-reset'));
  } catch {
    // Ignore non-browser test environments.
  }

  refreshAIMemoryControls();
  return true;
}

export function getAIMemorySummary(mapId = null) {
  const database = readDatabase();
  const records = Object.values(database.maps || {});
  const totalRuns = records.reduce((sum, record) => sum + (record.matches?.length || 0), 0);

  let selected = null;

  if (mapId) {
    const normalizedMapId = cleanToken(mapId, 'unknown', 48);
    selected = database.maps[normalizedMapId] || null;
  }

  return {
    version: MEMORY_VERSION,
    totalRuns,
    learnedMaps: records.length,
    storageBytes: JSON.stringify(database).length,
    maxStorageBytes: MAX_STORAGE_BYTES,
    selectedMap: selected?.mapId || null,
    selectedMapRuns: selected?.matches?.length || 0,
    selectedMapAggregate: selected?.aggregate || null,
    updatedAt: database.updatedAt || 0
  };
}

export function refreshAIMemoryControls() {
  if (typeof document === 'undefined') return;

  const summary = getAIMemorySummary();
  const status = document.getElementById('ai-memory-status');
  const resetButton = document.getElementById('reset-ai-memory-btn');

  if (status) {
    status.textContent = summary.totalRuns > 0
      ? `${summary.totalRuns} learned run${summary.totalRuns === 1 ? '' : 's'} across ${summary.learnedMaps} map${summary.learnedMaps === 1 ? '' : 's'}`
      : 'No learned runs stored yet';
  }

  if (resetButton) {
    resetButton.disabled = summary.totalRuns === 0;
    resetButton.setAttribute('aria-disabled', summary.totalRuns === 0 ? 'true' : 'false');
    resetButton.style.opacity = summary.totalRuns === 0 ? '0.55' : '1';
    resetButton.style.cursor = summary.totalRuns === 0 ? 'not-allowed' : 'pointer';
  }
}

export function bindAIMemoryControls() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__KA_AI_MEMORY_CONTROLS_BOUND__) {
    refreshAIMemoryControls();
    return;
  }

  window.__KA_AI_MEMORY_CONTROLS_BOUND__ = true;

  const resetButton = document.getElementById('reset-ai-memory-btn');

  if (resetButton) {
    resetButton.addEventListener('click', () => {
      const summary = getAIMemorySummary();
      if (summary.totalRuns <= 0) return;

      const confirmed = window.confirm(
        `Reset ${summary.totalRuns} learned AI run${summary.totalRuns === 1 ? '' : 's'}? ` +
        'This clears adaptive memory for every map. Current game settings and records are not affected.'
      );

      if (!confirmed) return;

      const reset = resetAIMemory();

      resetButton.textContent = reset ? 'AI Learning Reset' : 'Reset Failed';
      setTimeout(() => {
        resetButton.textContent = 'Reset AI Learning';
        refreshAIMemoryControls();
      }, 1500);
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key === MEMORY_STORAGE_KEY) refreshAIMemoryControls();
  });

  refreshAIMemoryControls();
}

if (typeof window !== 'undefined') {
  window.KAGetAIMemory = getAIMemorySummary;
  window.KAGetAIMemoryPrior = getAIMemoryPrior;
  window.KAResetAIMemory = resetAIMemory;
}
