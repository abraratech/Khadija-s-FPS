import assert from 'node:assert/strict';
import {
  WAVE_SPAWN_INTEGRITY_PATCH,
  buildCanonicalEnemyPool,
  createSpawnAttemptResult,
  createWaveScheduleToken,
  inspectEnemyPoolIntegrity,
  isWaveScheduleTokenCurrent,
  normalizeWaveIncident
} from './wave_spawn_integrity_core.js';

assert.equal(WAVE_SPAWN_INTEGRITY_PATCH, 'm4-wave-spawner-integrity-r1');

const registry = Array.from({ length: 40 }, (_, index) => ({ id: index + 1 }));

{
  const active = registry.slice(0, 7);
  const pooled = registry.slice(7);
  const integrity = inspectEnemyPoolIntegrity({ registry, active, pooled });
  assert.equal(integrity.invariantOk, true);
  assert.equal(integrity.activeRegistryCount, 7);
  assert.equal(integrity.pooledRegistryCount, 33);
}

{
  const active = [registry[0], registry[0], registry[1]];
  const pooled = [registry[1], registry[2], registry[2]];
  const integrity = inspectEnemyPoolIntegrity({ registry, active, pooled });
  assert.equal(integrity.invariantOk, false);
  assert.equal(integrity.duplicateActiveReferences, 1);
  assert.equal(integrity.duplicatePoolReferences, 1);
  assert.equal(integrity.overlapReferences, 1);
  assert.ok(integrity.missingReferences > 0);
}

// Repeated-run stress: deliberately corrupt active/pool membership for twenty
// consecutive simulated games, then rebuild from the permanent registry.
for (let run = 0; run < 20; run += 1) {
  const activeCount = (run * 7) % 17;
  const active = registry.slice(0, activeCount);
  const corruptActive = activeCount > 0
    ? [...active, active[0], active[0]]
    : [];
  const corruptPool = [
    ...registry.slice(Math.max(0, activeCount - 2)),
    registry[39],
    registry[39]
  ];

  const before = inspectEnemyPoolIntegrity({
    registry,
    active: corruptActive,
    pooled: corruptPool
  });
  assert.equal(before.invariantOk, false);

  const rebuilt = buildCanonicalEnemyPool({
    registry,
    active: corruptActive
  });
  assert.equal(rebuilt.integrity.invariantOk, true);
  assert.equal(rebuilt.active.length + rebuilt.pool.length, 40);
  assert.equal(new Set(rebuilt.active).size, rebuilt.active.length);
  assert.equal(new Set(rebuilt.pool).size, rebuilt.pool.length);
  for (const entry of rebuilt.active) {
    assert.equal(rebuilt.pool.includes(entry), false);
  }
}

{
  const token = createWaveScheduleToken({
    runGeneration: 4,
    waveGeneration: 8,
    wave: 3,
    serial: 12,
    reason: 'round-clear'
  });
  assert.equal(isWaveScheduleTokenCurrent(token, {
    runGeneration: 4,
    waveGeneration: 8,
    wave: 3,
    serial: 12
  }), true);
  assert.equal(isWaveScheduleTokenCurrent(token, {
    runGeneration: 5,
    waveGeneration: 8,
    wave: 3,
    serial: 12
  }), false);
  assert.equal(isWaveScheduleTokenCurrent(token, {
    runGeneration: 4,
    waveGeneration: 9,
    wave: 3,
    serial: 12
  }), false);
}

{
  const failed = createSpawnAttemptResult({
    ok: false,
    reason: 'pool_empty',
    repaired: true,
    poolSize: -4,
    activeCount: 40,
    spawned: 2,
    total: 8
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'POOL_EMPTY');
  assert.equal(failed.poolSize, 0);
  assert.equal(failed.repaired, true);
}

{
  const incident = normalizeWaveIncident({
    id: 'incident-1',
    serial: 1,
    type: 'spawn_pool_empty',
    timestamp: 123,
    runGeneration: 2,
    waveGeneration: 3,
    wave: 2,
    mapId: 'grid_bunker',
    difficulty: 0.75,
    mode: 'single',
    details: { poolSize: 0 }
  });
  assert.equal(incident.type, 'SPAWN_POOL_EMPTY');
  assert.equal(incident.details.poolSize, 0);
}

console.log('wave_spawn_integrity_core.test.js: PASS');
