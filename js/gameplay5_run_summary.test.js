import assert from 'node:assert/strict';
import {
  getRunSummarySnapshot,
  recordRunGameplay5NarrativeOutcome,
  resetRunSummary
} from './run_summary.js';

resetRunSummary({ mapId: 'grid_bunker', difficulty: 1 });
const narrative = {
  completionId: 'run:black-vault:gameplay5:DECISIVE_VICTORY',
  operationId: 'BLACK-VAULT-DIRECTIVE',
  title: 'Black Vault Directive',
  branchId: 'ASSET_SECURED',
  branchLabel: 'SUPPORT ASSET SECURED',
  outcomeId: 'DECISIVE_VICTORY',
  outcomeLabel: 'Decisive Victory',
  outcomeGrade: 'A',
  transmissions: [{}, {}, {}, {}]
};
recordRunGameplay5NarrativeOutcome({ narrative, rewardPoints: 440 });
let snapshot = getRunSummarySnapshot();
assert.equal(snapshot.gameplay5NarrativeOperationsCompleted, 1);
assert.equal(snapshot.gameplay5NarrativeRewardPoints, 440);
assert.equal(snapshot.gameplay5NarrativeBranch, 'SUPPORT ASSET SECURED');
assert.equal(snapshot.gameplay5NarrativeOutcome, 'Decisive Victory');
assert.equal(snapshot.gameplay5NarrativeGrade, 'A');
assert.equal(snapshot.lastGameplay5Narrative.transmissions, 4);
assert.equal(snapshot.lastEvent, 'NARRATIVE OPERATION COMPLETE');

recordRunGameplay5NarrativeOutcome({ narrative, rewardPoints: 440 });
snapshot = getRunSummarySnapshot();
assert.equal(snapshot.gameplay5NarrativeOperationsCompleted, 1);
assert.equal(snapshot.gameplay5NarrativeRewardPoints, 440);

console.log('GAMEPLAY.5 run summary integration tests passed');
