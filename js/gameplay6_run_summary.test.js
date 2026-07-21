import assert from 'node:assert/strict';
import {
  getRunSummarySnapshot,
  recordRunGameplay6WorldContribution,
  resetRunSummary
} from './run_summary.js';

resetRunSummary({ mapId: 'grid_bunker', difficulty: 1 });

const world = {
  completionId: 'run-1:narrative:gameplay6',
  mapId: 'grid_bunker',
  presentation: {
    worldTier: 2,
    sector: { label: 'Black Vault Sector', tier: 3 }
  },
  contribution: {
    receiptId: 'run-1:narrative:gameplay6',
    mapId: 'grid_bunker',
    sectorId: 'BLACK-VAULT',
    sectorLabel: 'Black Vault Sector',
    region: 'NORTHERN FRONT',
    points: 214
  }
};

recordRunGameplay6WorldContribution({
  world,
  applied: true,
  unlocked: [{ id: 'BLACK-VAULT-TIER-3', label: 'Black Vault Sector · Dominance' }]
});

let snapshot = getRunSummarySnapshot();
assert.equal(snapshot.gameplay6WorldContributions, 1);
assert.equal(snapshot.gameplay6WorldPoints, 214);
assert.equal(snapshot.gameplay6WorldSector, 'Black Vault Sector');
assert.equal(snapshot.gameplay6WorldTier, 3);
assert.deepEqual(snapshot.gameplay6WorldMilestones, ['BLACK-VAULT-TIER-3']);
assert.equal(snapshot.lastGameplay6World.applied, true);
assert.equal(snapshot.lastGameplay6World.worldTier, 2);

recordRunGameplay6WorldContribution({ world, applied: true, unlocked: [] });
snapshot = getRunSummarySnapshot();
assert.equal(snapshot.gameplay6WorldContributions, 1);
assert.equal(snapshot.gameplay6WorldPoints, 214);

console.log('GAMEPLAY.6 run summary integration tests passed');
