import assert from 'node:assert/strict';
import {
  getRunSummarySnapshot,
  recordRunGameplay2Mutation,
  resetRunSummary
} from './run_summary.js';
import {
  Gameplay2MutationDirector
} from './gameplay2_mutation_core.js';

resetRunSummary({ mapId: 'reactor_courtyard', difficulty: 1.5 });
const director = new Gameplay2MutationDirector();
director.reset({
  runId: 'run-gameplay2-summary',
  mapId: 'reactor_courtyard',
  difficulty: 1.5,
  gameMode: 'survival',
  now: 1000
});
director.advanceToWave(21, 2000);
const snapshot = director.getSnapshot(2000);

for (const event of snapshot.history) {
  recordRunGameplay2Mutation({ snapshot, event });
}

let summary = getRunSummarySnapshot();
assert.equal(summary.gameplay2Patch, snapshot.patch);
assert.deepEqual(summary.mutationActiveIds, snapshot.activeMutations.map((entry) => entry.id));
assert.equal(summary.mutationActiveCount, snapshot.activeMutations.length);
assert.equal(summary.mutationHistoryCount, snapshot.history.length);
assert.equal(summary.mutationPeakActiveCount, snapshot.peakActiveCount);
assert.equal(summary.mutationRewardMultiplier, snapshot.rewardMultiplier);
assert.equal(summary.mutationPeakRewardMultiplier, snapshot.peakRewardMultiplier);
assert.equal(summary.mutationHistory.length, snapshot.history.length);
assert.ok(summary.mutationActiveLabels.length > 0);

recordRunGameplay2Mutation({ snapshot, event: snapshot.history[0] });
summary = getRunSummarySnapshot();
assert.equal(summary.mutationHistory.length, snapshot.history.length);
assert.equal(summary.mutationHistoryCount, snapshot.history.length);

console.log('GAMEPLAY.2 run summary integration tests passed');
