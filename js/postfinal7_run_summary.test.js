import assert from 'node:assert/strict';
import {
  getRunSummarySnapshot,
  recordRunPostFinal7Mission,
  resetRunSummary
} from './run_summary.js';

resetRunSummary({ mapId: 'grid_bunker', difficulty: 1.5 });
recordRunPostFinal7Mission({
  mission: {
    completionId: 'run:black-vault:complete',
    missionId: 'BLACK-VAULT',
    label: 'Black Vault',
    completedStageCount: 6,
    optionalStagesCompleted: 1,
    riskChoice: 'OVERDRIVE',
    rewardMultiplier: 1.5,
    totalContributions: {
      alpha: 18,
      bravo: 12
    },
    medals: [
      { role: 'MVP', label: 'MISSION MVP', playerId: 'alpha', score: 18 },
      { role: 'GUARDIAN', label: 'GUARDIAN', playerId: 'bravo', score: 12 }
    ]
  },
  rewardPoints: 638,
  localPlayerId: 'alpha'
});

let summary = getRunSummarySnapshot();
assert.equal(summary.missionChainsCompleted, 1);
assert.equal(summary.missionStagesCompleted, 6);
assert.equal(summary.missionOptionalStagesCompleted, 1);
assert.equal(summary.missionRewardPoints, 638);
assert.equal(summary.missionRiskChoice, 'OVERDRIVE');
assert.equal(summary.missionMedals.length, 2);
assert.equal(summary.missionMedals[0].isLocal, true);
assert.equal(summary.lastMission.label, 'Black Vault');
assert.equal(summary.lastMission.localContribution, 18);

recordRunPostFinal7Mission({
  mission: {
    completionId: 'run:black-vault:complete'
  },
  rewardPoints: 638,
  localPlayerId: 'alpha'
});
summary = getRunSummarySnapshot();
assert.equal(summary.missionChainsCompleted, 1);
assert.equal(summary.missionRewardPoints, 638);

console.log('POST-FINAL.7 run-summary integration tests passed');
