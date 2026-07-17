import assert from 'node:assert/strict';
import {
  getRunSummarySnapshot,
  recordRunPostFinal8Replayability,
  resetRunSummary
} from './run_summary.js';

resetRunSummary({ mapId: 'grid_bunker', difficulty: 1.5 });

const replayability = {
  completionId: 'run-1:postfinal8',
  faction: {
    id: 'MACHINE_COLLECTIVE',
    label: 'Machine Collective'
  },
  boss: {
    bossId: 'SIEGE-WALKER',
    label: 'Machine Siege Walker',
    weakPointHits: 7,
    staggerCount: 3
  },
  modifiers: [
    { id: 'HEAVY_ARMOR', label: 'Heavy Armor' },
    { id: 'AGGRESSIVE_BOSS', label: 'Aggressive Boss' }
  ],
  masteryScore: 92,
  masteryGrade: 'S',
  rewardMultiplier: 1.55,
  noDownedEligible: true,
  medals: [
    { id: 'MACHINE-MASTERY', label: 'MACHINE COLLECTIVE MASTERY', score: 92 },
    { id: 'BOSS-BREAKER', label: 'BOSS BREAKER', score: 3 }
  ]
};

recordRunPostFinal8Replayability({
  replayability,
  rewardPoints: 1234
});

let snapshot = getRunSummarySnapshot();
assert.equal(snapshot.factionOperationsCompleted, 1);
assert.equal(snapshot.factionRewardPoints, 1234);
assert.equal(snapshot.enemyFaction, 'Machine Collective');
assert.equal(snapshot.bossDefeated, 'Machine Siege Walker');
assert.equal(snapshot.bossWeakPointHits, 7);
assert.equal(snapshot.bossStaggers, 3);
assert.deepEqual(snapshot.replayModifiers, ['Heavy Armor', 'Aggressive Boss']);
assert.equal(snapshot.replayMasteryGrade, 'S');
assert.equal(snapshot.noDownedMastery, true);
assert.equal(snapshot.replayMedals.length, 2);
assert.equal(snapshot.lastReplayability.completionId, replayability.completionId);

recordRunPostFinal8Replayability({
  replayability,
  rewardPoints: 1234
});
snapshot = getRunSummarySnapshot();
assert.equal(snapshot.factionOperationsCompleted, 1);
assert.equal(snapshot.factionRewardPoints, 1234);

console.log('POST-FINAL.8 run summary integration tests passed');
