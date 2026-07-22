import assert from 'node:assert/strict';
import {
  GAMEPLAY7_STATUS,
  Gameplay7CampaignDirector,
  createDefaultGameplay7CampaignProfile
} from './gameplay7_campaign_core.js';

const now = 1_720_100_100_000;
const profile = createDefaultGameplay7CampaignProfile(now);
const host = new Gameplay7CampaignDirector();
host.reset({ runId: 'coop-campaign-run', mapId: 'hospital_wing', gameMode: 'survival', profile, now });
const hostSnapshot = host.update(now + 100, {
  profile,
  world: {
    status: 'COMPLETE',
    completionId: 'coop-campaign-run:world:gameplay6',
    completedAt: now + 100,
    contribution: {
      receiptId: 'coop-campaign-run:world:gameplay6',
      points: 210,
      gradeRank: 3,
      decisive: true,
      secured: true,
      bossVictory: true
    }
  },
  narrative: { outcomeId: 'DECISIVE_VICTORY', branchId: 'ASSET_SECURED' },
  replay: { faction: { id: 'BIOHAZARD_SWARM' } }
});
assert.equal(hostSnapshot.status, GAMEPLAY7_STATUS.COMPLETE);
assert.equal(hostSnapshot.hostAuthoritative, true);
assert.equal(hostSnapshot.protocolUnchanged, true);

for (const label of ['lateJoin', 'reconnect', 'migratedHost']) {
  const client = new Gameplay7CampaignDirector();
  client.reset({ runId: 'coop-campaign-run', mapId: 'hospital_wing', gameMode: 'survival', profile, now });
  assert.equal(client.replaceSnapshot(hostSnapshot, now + 200), true, label);
  assert.deepEqual(client.getSnapshot(), hostSnapshot, label);
}

const wrongRun = new Gameplay7CampaignDirector();
wrongRun.reset({ runId: 'wrong-run', mapId: 'hospital_wing', gameMode: 'survival', profile, now });
assert.equal(wrongRun.replaceSnapshot(hostSnapshot, now + 300), false);

const pvp = new Gameplay7CampaignDirector();
const pvpSnapshot = pvp.reset({ runId: 'pvp-campaign', mapId: 'hospital_wing', gameMode: 'pvp-team-elimination', profile, now });
assert.equal(pvpSnapshot.active, false);
assert.equal(pvpSnapshot.status, GAMEPLAY7_STATUS.INACTIVE);
assert.equal(pvpSnapshot.pvpExcluded, true);
assert.equal(pvpSnapshot.contribution, null);

console.log('GAMEPLAY.7 multiplayer restoration and PvP isolation tests passed');
