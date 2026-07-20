import assert from 'node:assert/strict';
import {
  GAMEPLAY2_FIRST_WAVE,
  GAMEPLAY2_MAX_ACTIVE,
  GAMEPLAY2_MUTATIONS,
  GAMEPLAY2_PATCH,
  GAMEPLAY2_SCHEMA,
  Gameplay2MutationDirector,
  deriveGameplay2MutationReceipt,
  getGameplay2MutationTuning,
  getNextGameplay2Milestone,
  isGameplay2Milestone
} from './gameplay2_mutation_core.js';

assert.equal(isGameplay2Milestone(7), false);
assert.equal(isGameplay2Milestone(8), true);
assert.equal(isGameplay2Milestone(11), true);
assert.equal(isGameplay2Milestone(14), true);
assert.equal(isGameplay2Milestone(17), true);
assert.equal(isGameplay2Milestone(21), true);
assert.equal(isGameplay2Milestone(20), false);
assert.equal(getNextGameplay2Milestone(1), GAMEPLAY2_FIRST_WAVE);
assert.equal(getNextGameplay2Milestone(8), 11);
assert.equal(getNextGameplay2Milestone(17), 21);

const directorA = new Gameplay2MutationDirector();
const directorB = new Gameplay2MutationDirector();
const details = {
  runId: 'run-gameplay2-alpha',
  mapId: 'reactor_courtyard',
  difficulty: 1.5,
  gameMode: 'survival',
  now: 1000
};
directorA.reset(details);
directorB.reset(details);
directorA.advanceToWave(29, 2000);
directorB.advanceToWave(29, 2000);

const snapshotA = directorA.getSnapshot(2000);
const snapshotB = directorB.getSnapshot(2000);
assert.equal(snapshotA.patch, GAMEPLAY2_PATCH);
assert.equal(snapshotA.schema, GAMEPLAY2_SCHEMA);
assert.deepEqual(snapshotA, snapshotB);
assert.equal(snapshotA.activeMutations.length, GAMEPLAY2_MAX_ACTIVE);
assert.equal(new Set(snapshotA.activeMutations.map((entry) => entry.id)).size, snapshotA.activeMutations.length);
assert.ok(snapshotA.history.length >= 6);
assert.ok(snapshotA.activeMutations.some((entry) => entry.level > 1));
assert.ok(snapshotA.rewardMultiplier > 1);
assert.ok(snapshotA.rewardMultiplier <= 1.75);
assert.ok(snapshotA.peakRewardMultiplier >= snapshotA.rewardMultiplier);

const tuning = getGameplay2MutationTuning(snapshotA);
assert.equal(tuning.patch, GAMEPLAY2_PATCH);
assert.deepEqual(tuning.activeIds, snapshotA.activeMutations.map((entry) => entry.id));
assert.ok(tuning.enemy.specialWeightScale > 0);
assert.ok(tuning.supply.powerupDropScale > 0);
assert.ok(tuning.map.hazardIntervalScale > 0);

const replacement = new Gameplay2MutationDirector();
replacement.reset(details);
assert.equal(replacement.replaceSnapshot(snapshotA, 2000), true);
assert.deepEqual(replacement.getSnapshot(2000), snapshotA);

const pvp = new Gameplay2MutationDirector();
pvp.reset({ ...details, runId: 'run-pvp', gameMode: 'pvp-team-elimination' });
pvp.advanceToWave(30, 2000);
const pvpSnapshot = pvp.getSnapshot(2000);
assert.equal(pvpSnapshot.enabled, false);
assert.equal(pvpSnapshot.activeMutations.length, 0);
assert.equal(pvpSnapshot.rewardMultiplier, 1);

const receiptA = deriveGameplay2MutationReceipt({
  runId: details.runId,
  mapId: details.mapId,
  difficulty: details.difficulty,
  wave: 29,
  now: 2000
});
const receiptB = deriveGameplay2MutationReceipt({
  runId: details.runId,
  mapId: details.mapId,
  difficulty: details.difficulty,
  wave: 29,
  now: 2000
});
assert.deepEqual(receiptA, receiptB);
assert.equal(receiptA.patch, GAMEPLAY2_PATCH);
assert.equal(receiptA.activeCount, GAMEPLAY2_MAX_ACTIVE);
assert.ok(receiptA.historyCount >= 6);

const alternate = deriveGameplay2MutationReceipt({
  runId: 'run-gameplay2-beta',
  mapId: details.mapId,
  difficulty: details.difficulty,
  wave: 14,
  now: 2000
});
assert.equal(alternate.activeCount, 3);
assert.ok(alternate.activeIds.every((id) => Object.values(GAMEPLAY2_MUTATIONS).includes(id)));

let hazardDirector = null;
for (let index = 0; index < 100 && !hazardDirector; index += 1) {
  const candidate = new Gameplay2MutationDirector();
  candidate.reset({
    runId: `run-gameplay2-hazard-${index}`,
    mapId: 'parking_garage',
    difficulty: 1,
    gameMode: 'survival',
    now: 1000
  });
  candidate.advanceToWave(14, 2000);
  if (candidate.getSnapshot(2000).activeMutations.some((entry) => entry.id === GAMEPLAY2_MUTATIONS.HAZARD_SHIFT)) {
    hazardDirector = candidate;
  }
}
assert.ok(hazardDirector, 'Expected to find a deterministic Hazard Shift sequence.');
let hazardSnapshot = hazardDirector.getSnapshot(2000);
assert.equal(hazardSnapshot.hazard.enabled, true);
assert.equal(hazardSnapshot.hazard.phase, 'IDLE');
hazardSnapshot = hazardDirector.update(hazardSnapshot.hazard.phaseEndsAt + 1);
assert.equal(hazardSnapshot.hazard.phase, 'WARNING');
assert.ok(hazardSnapshot.hazard.anchor);
assert.ok(hazardSnapshot.hazard.radius > 0);
hazardSnapshot = hazardDirector.update(hazardSnapshot.hazard.phaseEndsAt + 1);
assert.equal(hazardSnapshot.hazard.phase, 'ACTIVE');
const hazardReplica = new Gameplay2MutationDirector();
hazardReplica.reset({
  runId: hazardSnapshot.runId,
  mapId: hazardSnapshot.mapId,
  difficulty: hazardSnapshot.difficulty,
  gameMode: 'survival',
  now: 1000
});
assert.equal(hazardReplica.replaceSnapshot(hazardSnapshot, hazardSnapshot.updatedAt), true);
assert.deepEqual(hazardReplica.getSnapshot(hazardSnapshot.updatedAt).hazard, hazardSnapshot.hazard);

console.log('GAMEPLAY.2 mutation core tests passed');
