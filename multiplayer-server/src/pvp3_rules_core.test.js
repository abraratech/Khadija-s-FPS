import assert from 'node:assert/strict';
import {
  PVP3_R2_ARMOR_CAP,
  PVP3_R2_PATCH,
  PVP4_R1_PATCH,
  PVP3_R2_PICKUP_CLAIM_RADIUS,
  createPvp3PickupState,
  getPvp3PickupDefinitions,
  normalizePvp3WeaponList,
  pvp3PlayerOwnsWeapon
} from './pvp3_rules_core.js';
import {
  createPvp1MatchState,
  resolvePvp1Shot,
  resolvePvp3PickupClaim
} from './pvp1_core.js';

assert.equal(PVP3_R2_PATCH, 'pvp3-r2-dedicated-rules-neutral-pickups');
assert.equal(PVP3_R2_ARMOR_CAP, 35);
assert(PVP3_R2_PICKUP_CLAIM_RADIUS > 2);
assert.equal(getPvp3PickupDefinitions('industrial_yard').length, 4);
assert.deepEqual(normalizePvp3WeaponList(['SNIPER']), ['PISTOL', 'SNIPER']);

let state = createPvp1MatchState({
  runId: 'pvp3-r2-authority',
  mapId: 'grid_bunker',
  players: [
    { playerId: 'alpha', joinedAt: 1 },
    { playerId: 'bravo', joinedAt: 2 }
  ],
  now: 1000
});
assert.equal(state.rulesPatch, PVP4_R1_PATCH);
assert.equal(state.pickups.length, 4);
assert.deepEqual(state.players.alpha.unlockedWeapons, ['PISTOL']);

let shot = resolvePvp1Shot({
  state,
  shooterId: 'alpha',
  targetId: 'bravo',
  weaponFamily: 'RIFLE',
  shotId: 'spoofed-rifle',
  distance: 15,
  now: 7000
});
assert.equal(shot.accepted, false);
assert.equal(shot.reason, 'WEAPON_NOT_OWNED');

const rifle = state.pickups.find((entry) => entry.weaponFamily === 'RIFLE');
let claim = resolvePvp3PickupClaim({
  state,
  playerId: 'alpha',
  pickupId: rifle.id,
  playerPosition: { x: rifle.x + 10, y: 0, z: rifle.z },
  poseUpdatedAt: 7000,
  now: 7000
});
assert.equal(claim.accepted, false);
assert.equal(claim.reason, 'PICKUP_OUT_OF_RANGE');

claim = resolvePvp3PickupClaim({
  state,
  playerId: 'alpha',
  pickupId: rifle.id,
  playerPosition: { x: rifle.x, y: 0, z: rifle.z },
  poseUpdatedAt: 7100,
  claimId: 'claim-rifle',
  now: 7100
});
assert.equal(claim.accepted, true);
state = claim.state;
assert.equal(pvp3PlayerOwnsWeapon(state.players.alpha, 'RIFLE'), true);
assert.equal(claim.event.kind, 'WEAPON');

shot = resolvePvp1Shot({
  state,
  shooterId: 'alpha',
  targetId: 'bravo',
  weaponFamily: 'RIFLE',
  shotId: 'owned-rifle',
  distance: 15,
  now: 8000
});
assert.equal(shot.accepted, true);
state = shot.state;

const armor = state.pickups.find((entry) => entry.kind === 'ARMOR');
claim = resolvePvp3PickupClaim({
  state,
  playerId: 'bravo',
  pickupId: armor.id,
  playerPosition: { x: armor.x, y: 0, z: armor.z },
  poseUpdatedAt: 9000,
  now: 9000
});
assert.equal(claim.accepted, true);
state = claim.state;
assert.equal(state.players.bravo.armor, 35);

const healthBeforeArmorHit = state.players.bravo.health;
shot = resolvePvp1Shot({
  state,
  shooterId: 'alpha',
  targetId: 'bravo',
  weaponFamily: 'PISTOL',
  shotId: 'armor-hit',
  distance: 10,
  now: 10000
});
assert.equal(shot.accepted, true);
assert(shot.event.armorAbsorbed > 0);
assert.equal(shot.state.players.bravo.health, healthBeforeArmorHit);

const reset = createPvp3PickupState('grid_bunker', { availableAt: 9000, round: 3 });
assert.equal(reset.every((entry) => entry.round === 3), true);

console.log('PVP.3 R2 Worker dedicated rules and neutral pickup authority tests passed');
