import assert from 'node:assert/strict';
import { createGuestCloudProfile, mergeCloudProfiles } from './cloud_profile_core.js';

function profile(profileId, revision, campaign7, now) {
  return createGuestCloudProfile({
    profileId,
    revision,
    now,
    createdAt: 1000,
    legacyStorage: {
      ka_progression_v1: JSON.stringify({ version: 5, xp: revision * 100, campaign7 })
    }
  });
}

const left = profile('profile-campaign', 2, {
  patch: 'gameplay7-r1-dynamic-campaign-faction-control',
  schema: 1,
  campaignPoints: 220,
  operationsCompleted: 2,
  decisiveVictories: 1,
  sectors: {
    grid_bunker: {
      playerInfluence: 100,
      enemyInfluence: 62,
      operationsCompleted: 2,
      campaignPoints: 220,
      factionInfluence: { MACHINE_COLLECTIVE: 12 }
    }
  },
  receipts: [{ receiptId: 'left-campaign', mapId: 'grid_bunker', campaignPoints: 120, appliedAt: 2000 }]
}, 3000);

const right = profile('profile-campaign', 3, {
  patch: 'gameplay7-r1-dynamic-campaign-faction-control',
  schema: 1,
  campaignPoints: 180,
  operationsCompleted: 3,
  decisiveVictories: 2,
  sectors: {
    grid_bunker: {
      playerInfluence: 88,
      enemyInfluence: 70,
      operationsCompleted: 2,
      campaignPoints: 180,
      factionInfluence: { MACHINE_COLLECTIVE: 20 }
    },
    hospital_wing: {
      playerInfluence: 72,
      enemyInfluence: 57,
      operationsCompleted: 1,
      campaignPoints: 80,
      factionInfluence: { BIOHAZARD_SWARM: 7 }
    }
  },
  receipts: [{ receiptId: 'right-campaign', mapId: 'hospital_wing', campaignPoints: 80, appliedAt: 2500 }]
}, 4000);

const merged = mergeCloudProfiles(left, right, { now: 5000 });
const progression = JSON.parse(merged.legacyStorage.ka_progression_v1);
assert.equal(progression.version, 5);
assert.equal(progression.campaign7.campaignPoints, 220);
assert.equal(progression.campaign7.operationsCompleted, 3);
assert.equal(progression.campaign7.decisiveVictories, 2);
assert.equal(progression.campaign7.sectors.grid_bunker.playerInfluence, 100);
assert.equal(progression.campaign7.sectors.grid_bunker.factionInfluence.MACHINE_COLLECTIVE, 20);
assert.equal(progression.campaign7.sectors.hospital_wing.operationsCompleted, 1);
assert.deepEqual(
  progression.campaign7.receipts.map((entry) => entry.receiptId).sort(),
  ['left-campaign', 'right-campaign']
);

console.log('GAMEPLAY.7 cloud campaign merge tests passed');
