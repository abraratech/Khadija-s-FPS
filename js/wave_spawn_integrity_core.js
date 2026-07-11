export const WAVE_SPAWN_INTEGRITY_PATCH = 'm4-wave-spawner-integrity-r1';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(finite(value, fallback)));
}

function uniqueReferences(values = []) {
  const unique = [];
  const seen = new Set();
  let duplicates = 0;

  for (const value of Array.isArray(values) ? values : []) {
    if (!value) continue;
    if (seen.has(value)) {
      duplicates += 1;
      continue;
    }
    seen.add(value);
    unique.push(value);
  }

  return Object.freeze({ unique: Object.freeze(unique), duplicates });
}

export function inspectEnemyPoolIntegrity({
  registry = [],
  active = [],
  pooled = []
} = {}) {
  const registryRefs = uniqueReferences(registry);
  const activeRefs = uniqueReferences(active);
  const pooledRefs = uniqueReferences(pooled);
  const registrySet = new Set(registryRefs.unique);
  const activeRegistry = activeRefs.unique.filter((entry) => registrySet.has(entry));
  const pooledRegistry = pooledRefs.unique.filter((entry) => registrySet.has(entry));
  const activeSet = new Set(activeRegistry);
  const pooledSet = new Set(pooledRegistry);

  let overlapReferences = 0;
  for (const entry of activeSet) {
    if (pooledSet.has(entry)) overlapReferences += 1;
  }

  let missingReferences = 0;
  for (const entry of registrySet) {
    if (!activeSet.has(entry) && !pooledSet.has(entry)) missingReferences += 1;
  }

  const unknownActiveReferences = activeRefs.unique.reduce(
    (count, entry) => count + (registrySet.has(entry) ? 0 : 1),
    0
  );
  const unknownPoolReferences = pooledRefs.unique.reduce(
    (count, entry) => count + (registrySet.has(entry) ? 0 : 1),
    0
  );

  const invariantOk = (
    registryRefs.duplicates === 0
    && activeRefs.duplicates === 0
    && pooledRefs.duplicates === 0
    && overlapReferences === 0
    && missingReferences === 0
    && unknownPoolReferences === 0
    && activeRegistry.length + pooledRegistry.length === registryRefs.unique.length
  );

  return Object.freeze({
    invariantOk,
    registryCount: registryRefs.unique.length,
    activeRegistryCount: activeRegistry.length,
    pooledRegistryCount: pooledRegistry.length,
    duplicateRegistryReferences: registryRefs.duplicates,
    duplicateActiveReferences: activeRefs.duplicates,
    duplicatePoolReferences: pooledRefs.duplicates,
    overlapReferences,
    missingReferences,
    unknownActiveReferences,
    unknownPoolReferences
  });
}

export function buildCanonicalEnemyPool({
  registry = [],
  active = []
} = {}) {
  const registryRefs = uniqueReferences(registry).unique;
  const registrySet = new Set(registryRefs);
  const activeRefs = uniqueReferences(active).unique.filter((entry) => registrySet.has(entry));
  const activeSet = new Set(activeRefs);
  const pool = registryRefs.filter((entry) => !activeSet.has(entry));
  const integrity = inspectEnemyPoolIntegrity({
    registry: registryRefs,
    active: activeRefs,
    pooled: pool
  });

  return Object.freeze({
    active: Object.freeze(activeRefs),
    pool: Object.freeze(pool),
    integrity
  });
}

export function createSpawnAttemptResult({
  ok = false,
  reason = 'UNKNOWN',
  repaired = false,
  poolSize = 0,
  activeCount = 0,
  spawned = 0,
  total = 0
} = {}) {
  return Object.freeze({
    ok: ok === true,
    reason: String(reason || 'UNKNOWN').toUpperCase(),
    repaired: repaired === true,
    poolSize: nonNegativeInteger(poolSize),
    activeCount: nonNegativeInteger(activeCount),
    spawned: nonNegativeInteger(spawned),
    total: nonNegativeInteger(total)
  });
}

export function createWaveScheduleToken({
  runGeneration = 0,
  waveGeneration = 0,
  wave = 1,
  serial = 0,
  reason = 'scheduled'
} = {}) {
  return Object.freeze({
    runGeneration: nonNegativeInteger(runGeneration),
    waveGeneration: nonNegativeInteger(waveGeneration),
    wave: Math.max(1, nonNegativeInteger(wave, 1)),
    serial: nonNegativeInteger(serial),
    reason: String(reason || 'scheduled').slice(0, 80)
  });
}

export function isWaveScheduleTokenCurrent(token, current = {}) {
  if (!token) return false;
  return (
    nonNegativeInteger(token.runGeneration) === nonNegativeInteger(current.runGeneration)
    && nonNegativeInteger(token.waveGeneration) === nonNegativeInteger(current.waveGeneration)
    && Math.max(1, nonNegativeInteger(token.wave, 1)) === Math.max(1, nonNegativeInteger(current.wave, 1))
    && nonNegativeInteger(token.serial) === nonNegativeInteger(current.serial)
  );
}

export function normalizeWaveIncident(value = {}) {
  const details = value?.details && typeof value.details === 'object'
    ? { ...value.details }
    : {};
  return Object.freeze({
    id: String(value.id || ''),
    serial: nonNegativeInteger(value.serial),
    type: String(value.type || 'UNKNOWN').toUpperCase().slice(0, 80),
    timestamp: Math.max(0, finite(value.timestamp, Date.now())),
    runGeneration: nonNegativeInteger(value.runGeneration),
    waveGeneration: nonNegativeInteger(value.waveGeneration),
    wave: Math.max(1, nonNegativeInteger(value.wave, 1)),
    mapId: String(value.mapId || 'unknown').slice(0, 80),
    difficulty: Math.max(0.1, finite(value.difficulty, 1)),
    mode: String(value.mode || 'single').slice(0, 40),
    details: Object.freeze(details)
  });
}
