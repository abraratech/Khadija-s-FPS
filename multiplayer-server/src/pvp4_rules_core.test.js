import assert from 'node:assert/strict';
import { PVP4_R1_PATCH, PVP4_R1_MIN_RELOCATION_DISTANCE } from './pvp3_rules_core.js';
import { createPvp1MatchState, resolvePvp3PickupClaim } from './pvp1_core.js';

let state = createPvp1MatchState({
  runId: 'pvp4-authority', mapId: 'crossfire_terminal',
  players: [{ playerId: 'alpha', joinedAt: 1 }, { playerId: 'bravo', joinedAt: 2 }], now: 1000
});
assert.equal(state.rulesPatch, PVP4_R1_PATCH);
const target = state.pickups[0];
const old = { x: target.x, z: target.z, locationId: target.locationId };
const result = resolvePvp3PickupClaim({
  state, playerId: 'alpha', pickupId: target.id,
  playerPosition: { x: target.x, y: 0, z: target.z },
  playerPositions: [{ x: target.x, z: target.z }, { x: -40, z: -20 }],
  poseUpdatedAt: 7000, claimId: 'pvp4-relocate', now: 7000
});
assert.equal(result.accepted, true);
assert.equal(result.reason, 'CLAIMED_AND_RELOCATED');
state = result.state;
const moved = state.pickups.find((entry) => entry.id === target.id);
assert.notEqual(moved.locationId, old.locationId);
assert(Math.hypot(moved.x - old.x, moved.z - old.z) >= PVP4_R1_MIN_RELOCATION_DISTANCE * 0.65);
assert.equal(result.event.nextLocationId, moved.locationId);
assert.equal(result.event.rulesPatch, PVP4_R1_PATCH);
assert(result.event.revealAt < result.event.availableAt);

console.log('PVP.4 R1 Worker dynamic hot-drop authority tests passed');
