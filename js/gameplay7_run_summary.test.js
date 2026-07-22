import assert from 'node:assert/strict';
import {
  getRunSummarySnapshot,
  recordRunGameplay7CampaignContribution,
  resetRunSummary
} from './run_summary.js';

resetRunSummary({ mapId: 'grid_bunker', difficulty: 1.2 });
const campaign = {
  completionId: 'run-7:campaign:gameplay7',
  mapId: 'grid_bunker',
  presentation: {
    sector: {
      label: 'Black Vault Sector',
      controlState: 'CONTESTED',
      dominantFactionId: 'MACHINE_COLLECTIVE'
    }
  },
  contribution: {
    receiptId: 'run-7:campaign:gameplay7',
    mapId: 'grid_bunker',
    sectorId: 'BLACK-VAULT',
    sectorLabel: 'Black Vault Sector',
    factionId: 'MACHINE_COLLECTIVE',
    campaignPoints: 134,
    playerInfluence: 28,
    enemyInfluence: 6,
    previousControlState: 'CONTESTED',
    projectedControlState: 'SECURED'
  }
};
const shift = {
  previousControlState: 'CONTESTED',
  nextControlState: 'SECURED',
  label: 'Black Vault Sector · Secured'
};
recordRunGameplay7CampaignContribution({ campaign, applied: true, controlShift: shift });
let snapshot = getRunSummarySnapshot();
assert.equal(snapshot.gameplay7CampaignContributions, 1);
assert.equal(snapshot.gameplay7CampaignPoints, 134);
assert.equal(snapshot.gameplay7CampaignSector, 'Black Vault Sector');
assert.equal(snapshot.gameplay7CampaignControl, 'SECURED');
assert.equal(snapshot.gameplay7CampaignFaction, 'MACHINE_COLLECTIVE');
assert.deepEqual(snapshot.gameplay7ControlShifts, ['Black Vault Sector · Secured']);
assert.equal(snapshot.lastGameplay7Campaign.applied, true);

recordRunGameplay7CampaignContribution({ campaign, applied: true, controlShift: shift });
snapshot = getRunSummarySnapshot();
assert.equal(snapshot.gameplay7CampaignContributions, 1);
assert.equal(snapshot.gameplay7CampaignPoints, 134);

console.log('GAMEPLAY.7 run summary integration tests passed');
