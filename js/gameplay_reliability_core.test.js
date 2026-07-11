// js/gameplay_reliability_core.test.js
import assert from 'node:assert/strict';
import {
  GAMEPLAY_RELIABILITY_PATCH,
  createWaveWatchdogState,
  inspectEnemyReliability,
  isPlayerPositionSafe,
  normalizePlayerReliabilityState,
  updateWaveWatchdog,
  validateShotRay
} from './gameplay_reliability_core.js';

assert.equal(GAMEPLAY_RELIABILITY_PATCH, 'm4-gameplay-reliability-r1');

{
  const state = normalizePlayerReliabilityState({
    health: 0,
    maxHealth: 100,
    alive: true,
    lifeState: 'ACTIVE'
  });
  assert.equal(state.alive, false);
  assert.equal(state.health, 0);
  assert.equal(state.corrected, true);
}

{
  const state = normalizePlayerReliabilityState({
    health: 80,
    maxHealth: 100,
    alive: true,
    lifeState: 'DOWNED'
  });
  assert.equal(state.alive, false);
  assert.equal(state.health, 0);
}

assert.equal(isPlayerPositionSafe({ x: 1, y: 2, z: 3 }), true);
assert.equal(isPlayerPositionSafe({ x: Number.NaN, y: 2, z: 3 }), false);
assert.equal(isPlayerPositionSafe({ x: 999, y: 2, z: 3 }), false);

{
  const enemies = [
    {
      alive: true,
      dyingT: -1,
      mesh: { visible: false, position: { x: 0, y: 0, z: 0 } }
    },
    {
      alive: false,
      dyingT: 1.5,
      mesh: { visible: true, position: { x: 0, y: 0, z: 0 } }
    },
    {
      alive: true,
      dyingT: -1,
      mesh: { visible: true, position: { x: Infinity, y: 0, z: 0 } }
    }
  ];
  const result = inspectEnemyReliability(enemies);
  assert.equal(result.living, 2);
  assert.equal(result.hiddenLiving, 1);
  assert.equal(result.staleDying, 1);
  assert.equal(result.invalidPosition, 1);
}

{
  let state = createWaveWatchdogState(3);
  let action = 'NONE';
  for (let index = 0; index < 6; index += 1) {
    const result = updateWaveWatchdog(state, {
      wave: 3,
      total: 8,
      spawned: 8,
      living: 0,
      dying: 0,
      nextWavePending: false
    }, 0.1);
    state = result.state;
    action = result.action;
  }
  assert.equal(action, 'COMPLETE_WAVE');
}

{
  let state = createWaveWatchdogState(2);
  let action = 'NONE';
  for (let index = 0; index < 26; index += 1) {
    const result = updateWaveWatchdog(state, {
      wave: 2,
      total: 6,
      spawned: 2,
      living: 0,
      dying: 0,
      nextWavePending: false
    }, 0.1);
    state = result.state;
    action = result.action;
  }
  assert.equal(action, 'KICK_SPAWNER');
}

{
  const result = updateWaveWatchdog(createWaveWatchdogState(1), {
    wave: 1,
    total: 5,
    spawned: 3,
    living: 1,
    dying: 0,
    hiddenLiving: 1,
    nextWavePending: false
  }, 0.1);
  assert.equal(result.action, 'REPAIR_ENEMIES');
}

{
  const ray = validateShotRay({
    origin: { x: 0, y: 1, z: 0 },
    direction: { x: 0, y: 0, z: -2 }
  });
  assert.equal(ray.valid, true);
  assert.equal(ray.normalizedDirection.z, -1);
}

{
  const ray = validateShotRay({
    origin: { x: 0, y: 1, z: 0 },
    direction: { x: 0, y: 0, z: 0 }
  });
  assert.equal(ray.valid, false);
}

console.log('gameplay_reliability_core.test.js: PASS');
