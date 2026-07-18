import assert from 'node:assert/strict';
import {
  PVP4_R1_COMPETITIVE_MAPS,
  PVP4_R1_PATCH,
  PVP4_R1_MIN_RELOCATION_DISTANCE,
  createPvp3PickupState,
  getPvp3PickupDefinitions,
  getPvp4HotDropLocations,
  isPvp4CompetitiveMap,
  pvp4PickupCountdownSeconds,
  pvp4PickupTelegraphed,
  relocatePvp4Pickup,
  selectPvp4Relocation
} from './pvp3_rules_core.js';

assert.equal(PVP4_R1_PATCH, 'pvp4-r1-competitive-maps-dynamic-hot-drops');
assert.deepEqual(PVP4_R1_COMPETITIVE_MAPS, ['crossfire_terminal', 'foundry_ring', 'skyline_relay']);
assert.equal(isPvp4CompetitiveMap('crossfire_terminal'), true);
assert.equal(getPvp3PickupDefinitions('skyline_relay').some((entry) => entry.weaponFamily === 'SNIPER'), true);
assert(getPvp4HotDropLocations('foundry_ring').length >= 10);

const pickups = createPvp3PickupState('crossfire_terminal', { availableAt: 10_000, round: 2 });
assert.equal(pickups.length, 4);
assert.equal(new Set(pickups.map((entry) => entry.locationId)).size, 4);
assert.equal(pickups.every((entry) => entry.dynamicLocation === true), true);
assert.equal(pvp4PickupTelegraphed(pickups[0], 7_000), true);
assert.equal(pvp4PickupCountdownSeconds(pickups[0], 7_000), 3);

const target = pickups[0];
const next = selectPvp4Relocation({
  mapId: 'crossfire_terminal', pickup: target, pickups,
  playerPositions: [{ x: target.x, z: target.z }], runId: 'run-1', round: 2, now: 12_000
});
assert.notEqual(next.id, target.locationId);
assert(Math.hypot(next.x - target.x, next.z - target.z) >= PVP4_R1_MIN_RELOCATION_DISTANCE * 0.65);

const relocated = relocatePvp4Pickup({
  pickup: target, pickups, playerPositions: [{ x: target.x, z: target.z }],
  runId: 'run-1', round: 2, availableAt: 40_000
});
assert.equal(relocated.previousLocationId, target.locationId);
assert.notEqual(relocated.locationId, target.locationId);
assert.equal(relocated.availableAt, 40_000);
assert.equal(relocated.revealAt, 36_500);
assert.equal(relocated.relocationSerial, 1);

console.log('PVP.4 R1 frontend competitive map and dynamic hot-drop core tests passed');
