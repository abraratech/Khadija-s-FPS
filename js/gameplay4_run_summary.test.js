import assert from 'node:assert/strict';
import {
  getRunSummarySnapshot,
  recordRunGameplay4BossEncounter,
  resetRunSummary
} from './run_summary.js';

resetRunSummary({ mapId: 'industrial_yard', difficulty: 1.5 });
const encounter = {
  completionId: 'run-gp4:gameplay4:DEMOLITION-CHIEF:defeated',
  bossId: 'DEMOLITION-CHIEF',
  bossLabel: 'Demolition Chief',
  profileId: 'DETONATOR',
  profileLabel: 'Volatile Detonator',
  phaseTransitions: 2,
  interruptCount: 3,
  vulnerabilityHits: 11
};

recordRunGameplay4BossEncounter({ encounter, rewardPoints: 640 });
let summary = getRunSummarySnapshot();
assert.equal(summary.gameplay4BossProfile, 'Volatile Detonator');
assert.equal(summary.gameplay4BossInterrupts, 3);
assert.equal(summary.gameplay4VulnerabilityHits, 11);
assert.equal(summary.gameplay4RewardPoints, 640);
assert.equal(summary.objectiveRewardPoints, 640);
assert.equal(summary.lastGameplay4Encounter.completionId, encounter.completionId);
assert.equal(summary.lastGameplay4Encounter.phaseTransitions, 2);
assert.equal(summary.lastEvent, 'EXPANDED BOSS ENCOUNTER COMPLETE');

recordRunGameplay4BossEncounter({ encounter, rewardPoints: 640 });
summary = getRunSummarySnapshot();
assert.equal(summary.gameplay4BossInterrupts, 3);
assert.equal(summary.gameplay4RewardPoints, 640);
assert.equal(summary.objectiveRewardPoints, 640);

console.log('GAMEPLAY.4 run summary integration tests passed');
