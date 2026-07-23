import assert from 'node:assert/strict';
import { createGuestCloudProfile, mergeCloudProfiles } from './cloud_profile_core.js';

function makeProfile(profileId, revision, endgame1, now) {
  return createGuestCloudProfile({
    profileId,
    revision,
    now,
    createdAt: 1000,
    legacyStorage: {
      ka_progression_v1: JSON.stringify({ version: 7, xp: revision * 100, endgame1 })
    }
  });
}

const left = makeProfile('profile-endgame', 2, {
  patch: 'endgame1-r1-high-difficulty-operations',
  schema: 1,
  marks: 7,
  operationsCompleted: 1,
  firstClears: 1,
  bestTierId: 'VETERAN',
  bestTierRank: 1,
  tierClears: { VETERAN: 1, NIGHTMARE: 0, APEX: 0 },
  firstClearKeys: { 'grid_bunker:VETERAN': 2000 },
  receipts: [{ receiptId: 'endgame1:left:VETERAN', tierId: 'VETERAN', marks: 7, appliedAt: 2000 }]
}, 3000);
const right = makeProfile('profile-endgame', 3, {
  patch: 'endgame1-r1-high-difficulty-operations',
  schema: 1,
  marks: 12,
  operationsCompleted: 2,
  firstClears: 1,
  bestTierId: 'APEX',
  bestTierRank: 3,
  tierClears: { VETERAN: 0, NIGHTMARE: 0, APEX: 1 },
  firstClearKeys: { 'hospital_wing:APEX': 2500 },
  receipts: [{ receiptId: 'endgame1:right:APEX', tierId: 'APEX', marks: 12, appliedAt: 2500 }]
}, 4000);

const merged = mergeCloudProfiles(left, right, { now: 5000 });
const progression = JSON.parse(merged.legacyStorage.ka_progression_v1);
assert.equal(progression.version, 7);
assert.equal(progression.endgame1.marks, 12);
assert.equal(progression.endgame1.operationsCompleted, 2);
assert.equal(progression.endgame1.bestTierId, 'APEX');
assert.equal(progression.endgame1.bestTierRank, 3);
assert.equal(progression.endgame1.firstClearKeys['grid_bunker:VETERAN'], 2000);
assert.equal(progression.endgame1.firstClearKeys['hospital_wing:APEX'], 2500);
assert.deepEqual(
  progression.endgame1.receipts.map((entry) => entry.receiptId).sort(),
  ['endgame1:left:VETERAN', 'endgame1:right:APEX']
);

console.log('ENDGAME.1 cloud progression merge tests passed');
