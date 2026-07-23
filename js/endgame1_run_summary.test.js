import assert from 'node:assert/strict';
import {
  getRunSummarySnapshot,
  recordRunEndgame1,
  resetRunSummary
} from './run_summary.js';

resetRunSummary({ mapId: 'grid_bunker', difficulty: 2 });
const snapshot = {
  patch: 'endgame1-r1-high-difficulty-operations',
  active: true,
  status: 'COMPLETE',
  completionId: 'endgame1:endgame-summary-run:APEX',
  tier: { id: 'APEX', label: 'Apex', rank: 3 },
  modifiers: [
    { id: 'ARMORED_HORDE', label: 'Armored Horde' },
    { id: 'LIMITED_REVIVES', label: 'Limited Revives' }
  ],
  tuning: { masteryScale: 1.5 },
  noDowned: true
};
const receipt = {
  receiptId: snapshot.completionId,
  tierId: 'APEX',
  tierRank: 3,
  flawless: true
};
const result = {
  applied: true,
  firstClear: true,
  award: { tierLabel: 'Apex', marks: 12, xpBonus: 740, masteryScale: 1.5 }
};
recordRunEndgame1({ snapshot, receipt, result });
const summary = getRunSummarySnapshot();
assert.equal(summary.endgame1TierId, 'APEX');
assert.equal(summary.endgame1TierLabel, 'Apex');
assert.deepEqual(summary.endgame1ModifierIds, ['ARMORED_HORDE', 'LIMITED_REVIVES']);
assert.deepEqual(summary.endgame1ModifierLabels, ['Armored Horde', 'Limited Revives']);
assert.equal(summary.endgame1Marks, 12);
assert.equal(summary.endgame1XpBonus, 740);
assert.equal(summary.endgame1MasteryScale, 1.5);
assert.equal(summary.endgame1FirstClear, true);
assert.equal(summary.endgame1Flawless, true);
assert.equal(summary.endgame1ReceiptId, snapshot.completionId);

console.log('ENDGAME.1 run summary integration tests passed');
