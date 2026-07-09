// js/multiplayer/coop_scaling_core.test.js
import assert from 'node:assert/strict';
import {
  getCoopScalingProfile,
  getCoopScalingSnapshot,
  getLateJoinCatchUpScore,
  isLateJoinProtected,
  normalizeCoopPlayerCount,
  setCoopScalingContext
} from './coop_scaling_core.js';

assert.equal(normalizeCoopPlayerCount(-5), 1);
assert.equal(normalizeCoopPlayerCount(2.9), 2);
assert.equal(normalizeCoopPlayerCount(99), 4);

setCoopScalingContext({ online: false, playerCount: 4 });
assert.deepEqual(getCoopScalingProfile(), {
  playerCount: 1,
  enemyHealthScale: 1,
  waveCountScale: 1,
  spawnIntervalScale: 1,
  activeCapBonus: 0
});

setCoopScalingContext({ online: true, playerCount: 2 });
const two = getCoopScalingProfile();
assert.equal(two.playerCount, 2);
assert.equal(two.enemyHealthScale, 1.22);
assert.equal(two.waveCountScale, 1.30);
assert.equal(two.spawnIntervalScale, 0.88);
assert.equal(two.activeCapBonus, 4);

setCoopScalingContext({ online: true, playerCount: 4 });
const four = getCoopScalingSnapshot();
assert.equal(four.online, true);
assert.equal(four.playerCount, 4);
assert.ok(four.enemyHealthScale > two.enemyHealthScale);
assert.ok(four.spawnIntervalScale < two.spawnIntervalScale);

assert.equal(getLateJoinCatchUpScore(1), 500);
assert.equal(getLateJoinCatchUpScore(5), 1500);
assert.equal(getLateJoinCatchUpScore(99), 3500);

assert.equal(
  isLateJoinProtected({
    connected: true,
    lateJoinProtectionUntil: 12_000
  }, 10_000),
  true
);
assert.equal(
  isLateJoinProtected({
    connected: true,
    lateJoinProtectionUntil: 9_000
  }, 10_000),
  false
);
assert.equal(
  isLateJoinProtected({
    connected: false,
    lateJoinProtectionUntil: 12_000
  }, 10_000),
  false
);

setCoopScalingContext({ online: false, playerCount: 4 });

console.log(
  'M3.15-M3.16 core tests passed: scaling, catch-up, caps, '
  + 'single-player fallback, and spawn protection are valid.'
);
