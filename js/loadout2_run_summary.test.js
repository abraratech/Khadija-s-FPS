import assert from 'node:assert/strict';
import {
  resetRunSummary,
  recordRunLoadout2Mastery,
  getRunSummarySnapshot
} from './run_summary.js';

resetRunSummary({ mapId: 'grid_bunker', difficulty: 1.5 });
recordRunLoadout2Mastery({
  applied: true,
  idempotent: false,
  pvpExcluded: false,
  receipt: { receiptId: 'loadout2:summary', specializationId: 'VANGUARD' },
  result: { totalXp: 144, unlocked: [{ familyId: 'MELEE', unlockId: 'RAPID_DRAW', level: 2 }] },
  reason: 'VICTORY',
  snapshot: {
    selectedSpecializationId: 'VANGUARD',
    totalXp: 144,
    families: { MELEE: { strikes: 12, hits: 8, kills: 4, damage: 900, xp: 144 } }
  }
});
let summary = getRunSummarySnapshot();
assert.equal(summary.loadout2MasteryXp, 144);
assert.equal(summary.loadout2SpecializationId, 'VANGUARD');
assert.equal(summary.loadout2ReceiptId, 'loadout2:summary');
assert.equal(summary.loadout2PvpExcluded, false);
assert.equal(summary.loadout2Families.MELEE.kills, 4);
assert.equal(summary.loadout2Unlocks[0].unlockId, 'RAPID_DRAW');

resetRunSummary({ mapId: 'pvp_arena', difficulty: 1 });
recordRunLoadout2Mastery({
  applied: false,
  pvpExcluded: true,
  reason: 'MATCH_COMPLETE',
  snapshot: { selectedSpecializationId: 'MARKSMAN', families: {} }
});
summary = getRunSummarySnapshot();
assert.equal(summary.loadout2MasteryXp, 0);
assert.equal(summary.loadout2PvpExcluded, true);
assert.equal(summary.lastEvent, 'LOADOUT.2 PVP ISOLATED');

console.log('LOADOUT.2 run summary integration tests passed');
