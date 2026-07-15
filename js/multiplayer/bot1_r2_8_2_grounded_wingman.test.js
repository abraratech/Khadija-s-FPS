import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOT1_EYE_HEIGHT,
  isBotGroundSupportHit,
  resolveBotGroundEyeY
} from './bot_grounding_core.js';

const hit = (supportTag, pointY = 0, extra = {}) => ({
  point: { y: pointY },
  object: { userData: { supportTag, ...extra } }
});

assert.equal(BOT1_EYE_HEIGHT, 1.75);
assert.equal(isBotGroundSupportHit(hit('floor')), true);
assert.equal(isBotGroundSupportHit(hit('parking_garage_floor')), true);
assert.equal(
  isBotGroundSupportHit(hit('concrete_barrier', 1.2, { playerClimbable: true })),
  false,
  'climbable obstacles must not become wingman ground support'
);
assert.equal(
  isBotGroundSupportHit(hit('parking_garage_floor', 0, { isMapDressing: true })),
  false,
  'decorative geometry must not become wingman ground support'
);
assert.equal(
  isBotGroundSupportHit(hit('authored_ramp', 0.4, { botGroundSupport: true })),
  true,
  'future authored ramps may explicitly opt into wingman ground support'
);

const obstacleThenFloor = [
  hit('concrete_barrier', 1.2, { playerClimbable: true }),
  hit('parking_garage_floor', 0)
];
assert.equal(
  resolveBotGroundEyeY({ hits: obstacleThenFloor, fallbackEyeY: 6.5 }),
  1.75,
  'the wingman must ignore obstacle tops and resolve the authored floor below'
);
assert.equal(
  resolveBotGroundEyeY({ hits: [], fallbackEyeY: 1.75 }),
  1.75,
  'missing support must preserve the last grounded height, not copy the host height'
);

const runtime = readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
assert.equal(
  runtime.includes('this.state.position.y = Number(this.player?.pos?.y'),
  false,
  'the old host-height mirroring path must be removed'
);
assert.equal(runtime.includes('this.applyGrounding();'), true);
assert.equal(runtime.includes('resolveGroundedEyeY(position'), true);
assert.equal(runtime.includes('this.groundRayDirection = new THREE.Vector3(0, -1, 0)'), true);
assert.equal(runtime.includes('y: BOT1_EYE_HEIGHT'), true);

console.log('BOT.1 R2.8.2 grounded wingman tests passed');
