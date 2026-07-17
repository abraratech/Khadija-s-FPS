import assert from 'node:assert/strict';
import {
  getRunSummarySnapshot,
  recordRunDynamicOperation,
  resetRunSummary
} from './run_summary.js';

resetRunSummary({ mapId: 'grid_bunker', difficulty: 1 });
recordRunDynamicOperation({
  operationId: 'operation-a',
  label: 'Defend Central Lockdown',
  optional: false,
  rewardPoints: 600,
  contributors: { host: 20, ally: 12 },
  localPlayerId: 'host'
});
let snapshot = getRunSummarySnapshot();
assert.equal(snapshot.dynamicOperationsCompleted, 1);
assert.equal(snapshot.bonusOperationsCompleted, 0);
assert.equal(snapshot.objectiveRewardPoints, 600);
assert.equal(snapshot.topObjectiveContributor.playerId, 'host');
assert.equal(snapshot.topObjectiveContributor.isLocal, true);

recordRunDynamicOperation({
  operationId: 'operation-a',
  label: 'Duplicate',
  rewardPoints: 600
});
snapshot = getRunSummarySnapshot();
assert.equal(snapshot.dynamicOperationsCompleted, 1);
assert.equal(snapshot.objectiveRewardPoints, 600);

recordRunDynamicOperation({
  operationId: 'operation-b',
  label: 'Bonus Retrieval',
  optional: true,
  rewardPoints: 750,
  contributors: { ally: 8 },
  localPlayerId: 'host'
});
snapshot = getRunSummarySnapshot();
assert.equal(snapshot.dynamicOperationsCompleted, 2);
assert.equal(snapshot.bonusOperationsCompleted, 1);
assert.equal(snapshot.objectiveRewardPoints, 1350);
assert.equal(snapshot.objectiveContributions.ally, 20);

console.log('POST-FINAL.4 run summary integration tests passed');
