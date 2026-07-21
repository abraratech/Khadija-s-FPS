import assert from 'node:assert/strict';
import {
  createGuestCloudProfile,
  mergeCloudProfiles
} from './cloud_profile_core.js';

function profile(profileId, revision, world6, now) {
  return createGuestCloudProfile({
    profileId,
    revision,
    now,
    createdAt: 1000,
    legacyStorage: {
      ka_progression_v1: JSON.stringify({
        version: 4,
        xp: revision * 100,
        world6
      })
    }
  });
}

const left = profile('profile-world', 2, {
  patch: 'gameplay6-r1-world-progression',
  schema: 1,
  points: 300,
  operationsCompleted: 2,
  sectors: {
    grid_bunker: { points: 300, tier: 2, operationsCompleted: 2, bossVictories: 1 }
  },
  milestones: { 'WORLD-FOOTHOLD': 2000 },
  receipts: [{ receiptId: 'left-receipt', mapId: 'grid_bunker', points: 180, appliedAt: 2000 }]
}, 3000);

const right = profile('profile-world', 3, {
  patch: 'gameplay6-r1-world-progression',
  schema: 1,
  points: 260,
  operationsCompleted: 3,
  sectors: {
    grid_bunker: { points: 220, tier: 2, operationsCompleted: 2, bossVictories: 2 },
    hospital_wing: { points: 140, tier: 1, operationsCompleted: 1 }
  },
  milestones: {},
  receipts: [{ receiptId: 'right-receipt', mapId: 'hospital_wing', points: 140, appliedAt: 2500 }]
}, 4000);

const merged = mergeCloudProfiles(left, right, { now: 5000 });
const progression = JSON.parse(merged.legacyStorage.ka_progression_v1);
assert.equal(progression.version, 4);
assert.equal(progression.world6.points, 300);
assert.equal(progression.world6.operationsCompleted, 3);
assert.equal(progression.world6.sectors.grid_bunker.bossVictories, 2);
assert.equal(progression.world6.sectors.hospital_wing.points, 140);
assert.ok(progression.world6.milestones['WORLD-FOOTHOLD']);
assert.deepEqual(
  progression.world6.receipts.map((entry) => entry.receiptId).sort(),
  ['left-receipt', 'right-receipt']
);

console.log('GAMEPLAY.6 cloud progression merge tests passed');
