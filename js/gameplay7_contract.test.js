import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const core = read('gameplay7_campaign_core.js');
const content = read('content1.js');
const progression = read('progression.js');
const progressionCore = read('progression_core.js');
const cloudProfile = read('cloud_profile.js');
const summary = read('run_summary.js');
const hud = read('../css/hud.css');
const updateDelivery = read('update_delivery_core.js');
const buildProduction = read('../scripts/build_production.py');
const verifyProduction = read('../scripts/verify_launch2_build.py');
const release = JSON.parse(read('../release-version.json'));
const metadata = JSON.parse(read('../multiplayer-release.json'));

assert.match(core, /GAMEPLAY7_PATCH = 'gameplay7-r1-dynamic-campaign-faction-control'/);
for (const marker of [
  'GAMEPLAY7_CONTROL',
  'SECURED',
  'CONTESTED',
  'OVERRUN',
  'GAMEPLAY7_FACTIONS',
  'VANGUARD_CORPS',
  'WASTELAND_RAIDERS',
  'BIOHAZARD_SWARM',
  'MACHINE_COLLECTIVE',
  'computeGameplay7Contribution',
  'applyGameplay7Contribution',
  'idempotent',
  'getEncounterTuning',
  'Gameplay7CampaignDirector',
  'cloudMergeSafe',
  'protocolUnchanged'
]) {
  assert.ok(core.includes(marker), `Missing GAMEPLAY.7 core marker: ${marker}`);
}
assert.match(core, /value === 'pvp' \|\| value\.startsWith\('pvp-'\)/);

for (const marker of [
  'Gameplay7CampaignDirector',
  'this.campaignDirector = new Gameplay7CampaignDirector()',
  'window.KAGetGameplay7CampaignSnapshot',
  'window.KAGetGameplay7EncounterTuning',
  'snapshot.gameplay7',
  'payload.snapshot.gameplay7',
  'this.campaignDirector.replaceSnapshot(snapshot.gameplay7',
  'recordProgressionGameplay7CampaignContribution',
  'recordRunGameplay7CampaignContribution',
  'ka-gameplay7-campaign',
  'gameplay7Patch: GAMEPLAY7_PATCH',
  'campaignEnemyHealthScale',
  'campaignEnemyDamageScale'
]) {
  assert.ok(content.includes(marker), `Missing GAMEPLAY.7 CONTENT.1 marker: ${marker}`);
}
assert.match(content, /gameplay5, gameplay6, gameplay7/);
assert.match(progressionCore, /PROGRESSION_VERSION = 7/);
assert.match(progressionCore, /campaign7: createDefaultGameplay7CampaignProfile/);
assert.match(progressionCore, /normalizeGameplay7CampaignProfile\(source\.campaign7/);
assert.match(progression, /recordProgressionGameplay7CampaignContribution/);
assert.match(progression, /campaign7: getGameplay7CampaignPresentation/);
assert.match(cloudProfile, /mergedCampaign7/);
assert.match(cloudProfile, /progressionStorage\.campaign7 = mergedCampaign7/);
assert.match(summary, /recordRunGameplay7CampaignContribution/);
assert.match(summary, /gameplay7CampaignPoints/);
assert.match(hud, /GAMEPLAY\.7 R1 — dynamic campaign and faction-control readout/);
assert.match(hud, /\.ka-gameplay7-campaign/);

assert.equal(release.releaseId, 'quality2-r2-consolidated-polish-certification');
assert.equal(release.productVersion, '1.13.0-quality2-r2');
assert.equal(release.releaseSequence, 2026072303);
assert.equal(release.sourceBaselineSha, '762320f549f6a26a90b6c63f085b70bc53e0f00f');
assert.equal(release.workerBaselineSha, 'cde81e6cde6b1617b6cc0ecc90f2f532c66fb1ef');
assert.equal(release.baselineWorkerVersionId, '9c8c2ec1-0299-4f85-aebf-4835e5791007');
assert.equal(release.workerChangeRequired, true);
assert.equal(metadata.releaseLabel, 'QUALITY.2 R2 - Consolidated Polish and Certification');
assert.equal(metadata.gameplay7?.patch, 'gameplay7-r1-dynamic-campaign-faction-control');
assert.deepEqual(metadata.gameplay7?.supportedMaps, [
  'grid_bunker',
  'industrial_yard',
  'neon_depot',
  'parking_garage',
  'hospital_wing',
  'reactor_courtyard',
  'stormbreak_canal'
]);
assert.deepEqual(metadata.gameplay7?.controlStates, ['SECURED', 'CONTESTED', 'OVERRUN']);
assert.deepEqual(metadata.gameplay7?.factions, [
  'VANGUARD_CORPS',
  'WASTELAND_RAIDERS',
  'BIOHAZARD_SWARM',
  'MACHINE_COLLECTIVE'
]);
for (const field of [
  'dynamicSectorControl',
  'enemyFactionInfluence',
  'worldProgressionIntegration',
  'narrativeOutcomeInfluence',
  'bossVictoryInfluence',
  'controlBasedEnemyTuning',
  'controlBasedHazardTuning',
  'controlBasedRewardTuning',
  'profileOwnedState',
  'cloudMergeSafe',
  'protectedCampaignRewards',
  'idempotentContributionReceipts',
  'pvpExcluded',
  'hostAuthoritative',
  'lateJoinSnapshot',
  'reconnectRestoration',
  'hostMigrationCheckpoint',
  'runSummaryIntegration',
  'protocolUnchanged',
  'frontendOnly',
  'crazyGamesReadinessOnHold',
  'androidReadinessOnHold'
]) {
  assert.equal(metadata.gameplay7?.[field], true, `Missing GAMEPLAY.7 policy: ${field}`);
}
assert.equal(metadata.gameplay7?.workerChangeRequired, false);
assert.match(updateDelivery, /quality2-r2-consolidated-polish-certification/);
assert.match(updateDelivery, /releaseSequence: 2026072303/);
assert.match(buildProduction, /GAMEPLAY7_RELEASE_SEQUENCE = 2026072105/);
assert.match(buildProduction, /"gameplay7":/);
assert.match(verifyProduction, /GAMEPLAY\.7 production manifest patch mismatch/);
assert.match(verifyProduction, /GAMEPLAY\.7 must remain frontend-only/);

console.log('GAMEPLAY.7 source integration contract passed');
