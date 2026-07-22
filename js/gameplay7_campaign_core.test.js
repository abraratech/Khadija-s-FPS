import assert from 'node:assert/strict';
import {
  GAMEPLAY7_CONTROL,
  GAMEPLAY7_PATCH,
  GAMEPLAY7_STATUS,
  Gameplay7CampaignDirector,
  applyGameplay7Contribution,
  computeGameplay7Contribution,
  createDefaultGameplay7CampaignProfile,
  createGameplay7SessionState,
  getGameplay7CampaignPresentation,
  normalizeGameplay7CampaignProfile
} from './gameplay7_campaign_core.js';

const now = 1_720_100_000_000;
const base = createDefaultGameplay7CampaignProfile(now);
assert.equal(base.patch, GAMEPLAY7_PATCH);
assert.equal(Object.keys(base.sectors).length, 6);
assert.equal(base.sectors.grid_bunker.controlState, GAMEPLAY7_CONTROL.CONTESTED);
assert.equal(base.sectors.grid_bunker.playerInfluence, 50);
assert.equal(base.sectors.grid_bunker.enemyInfluence, 50);

const contribution = computeGameplay7Contribution({
  runId: 'campaign-run-1',
  mapId: 'grid_bunker',
  gameMode: 'survival',
  profile: base,
  world: {
    status: 'COMPLETE',
    completionId: 'campaign-run-1:world:gameplay6',
    completedAt: now + 100,
    contribution: {
      receiptId: 'campaign-run-1:world:gameplay6',
      points: 230,
      gradeRank: 4,
      decisive: true,
      secured: true,
      bossVictory: true
    }
  },
  narrative: {
    outcomeId: 'DECISIVE_VICTORY',
    branchId: 'ASSET_SECURED'
  },
  replay: { faction: { id: 'MACHINE_COLLECTIVE' } },
  now: now + 100
});
assert.ok(contribution);
assert.equal(contribution.mapId, 'grid_bunker');
assert.equal(contribution.factionId, 'MACHINE_COLLECTIVE');
assert.equal(contribution.previousControlState, GAMEPLAY7_CONTROL.CONTESTED);
assert.ok(contribution.playerInfluence > contribution.enemyInfluence);
assert.ok(contribution.campaignPoints >= 60 && contribution.campaignPoints <= 190);
assert.match(contribution.receiptId, /:gameplay7$/);

const applied = applyGameplay7Contribution(base, contribution, now + 200);
assert.equal(applied.applied, true);
assert.equal(applied.idempotent, false);
assert.equal(applied.profile.operationsCompleted, 1);
assert.equal(applied.profile.campaignPoints, contribution.campaignPoints);
assert.equal(applied.profile.sectors.grid_bunker.operationsCompleted, 1);
assert.equal(applied.profile.sectors.grid_bunker.factionInfluence.MACHINE_COLLECTIVE, contribution.enemyInfluence);

const duplicate = applyGameplay7Contribution(applied.profile, contribution, now + 300);
assert.equal(duplicate.applied, false);
assert.equal(duplicate.idempotent, true);
assert.equal(duplicate.profile.campaignPoints, applied.profile.campaignPoints);

let securedProfile = applied.profile;
for (let index = 0; index < 3; index += 1) {
  securedProfile = applyGameplay7Contribution(securedProfile, {
    ...contribution,
    receiptId: `secure-${index}:gameplay7`,
    playerInfluence: 34,
    enemyInfluence: 3,
    campaignPoints: 100,
    completedAt: now + 400 + index
  }, now + 400 + index).profile;
}
const secured = getGameplay7CampaignPresentation(securedProfile, 'grid_bunker');
assert.equal(secured.sector.controlState, GAMEPLAY7_CONTROL.SECURED);
assert.equal(secured.sector.tuning.enemyHealthScale < 1, true);
assert.equal(secured.securedSectors >= 1, true);

let overrunProfile = normalizeGameplay7CampaignProfile({
  ...base,
  sectors: {
    ...base.sectors,
    hospital_wing: {
      ...base.sectors.hospital_wing,
      playerInfluence: 50,
      enemyInfluence: 110,
      dominantFactionId: 'BIOHAZARD_SWARM',
      factionInfluence: { BIOHAZARD_SWARM: 60 }
    }
  }
}, now);
const overrun = getGameplay7CampaignPresentation(overrunProfile, 'hospital_wing');
assert.equal(overrun.sector.controlState, GAMEPLAY7_CONTROL.OVERRUN);
assert.equal(overrun.sector.tuning.enemyHealthScale > 1, true);
assert.equal(overrun.sector.tuning.rewardMultiplier > 1, true);

assert.equal(computeGameplay7Contribution({ gameMode: 'pvp-team-elimination', world: { status: 'COMPLETE' } }), null);
const pvpState = createGameplay7SessionState({ gameMode: 'pvp-team-elimination', profile: base, now });
assert.equal(pvpState.active, false);
assert.equal(pvpState.status, GAMEPLAY7_STATUS.INACTIVE);
assert.equal(pvpState.pvpExcluded, true);

const director = new Gameplay7CampaignDirector();
director.reset({ runId: 'director-run', mapId: 'grid_bunker', gameMode: 'survival', profile: base, now });
const linked = director.consumeEvents();
assert.equal(linked[0].type, 'GAMEPLAY7_CAMPAIGN_LINKED');
const completed = director.update(now + 500, {
  profile: base,
  world: {
    status: 'COMPLETE',
    completionId: 'director-run:world:gameplay6',
    completedAt: now + 500,
    contribution: {
      receiptId: 'director-run:world:gameplay6',
      points: 200,
      gradeRank: 4,
      decisive: true,
      secured: true,
      bossVictory: true
    }
  },
  narrative: { outcomeId: 'DECISIVE_VICTORY', branchId: 'ASSET_SECURED' },
  replay: { faction: { id: 'MACHINE_COLLECTIVE' } }
});
assert.equal(completed.status, GAMEPLAY7_STATUS.COMPLETE);
assert.ok(completed.contribution);
assert.equal(director.consumeEvents()[0].type, 'GAMEPLAY7_CAMPAIGN_CONTRIBUTION_READY');

console.log('GAMEPLAY.7 dynamic campaign and faction control core tests passed');
