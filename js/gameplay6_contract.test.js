import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.join(here, relative), 'utf8');

const core = read('gameplay6_world_progression_core.js');
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

assert.match(core, /GAMEPLAY6_PATCH = 'gameplay6-r1-world-progression'/);
for (const marker of [
  'GAMEPLAY6_SECTORS',
  'BLACK-VAULT',
  'IRON-YARD',
  'NEON-RELAY',
  'CONCRETE-ROUTE',
  'WHITE-WING',
  'RED-CORE',
  'computeGameplay6Contribution',
  'applyGameplay6Contribution',
  'idempotent',
  'GLOBAL_MILESTONES',
  'cloudMergeSafe',
  'Gameplay6WorldDirector'
]) {
  assert.ok(core.includes(marker), `Missing GAMEPLAY.6 core marker: ${marker}`);
}
assert.match(core, /value === 'pvp' \|\| value\.startsWith\('pvp-'\)/);

for (const marker of [
  'Gameplay6WorldDirector',
  'this.worldProgressionDirector = new Gameplay6WorldDirector()',
  'window.KAGetGameplay6WorldSnapshot',
  'snapshot.gameplay6',
  'payload.snapshot.gameplay6',
  'this.worldProgressionDirector.replaceSnapshot(snapshot.gameplay6',
  'recordProgressionGameplay6WorldContribution',
  'recordRunGameplay6WorldContribution',
  'ka-gameplay6-world',
  'gameplay6Patch: GAMEPLAY6_PATCH'
]) {
  assert.ok(content.includes(marker), `Missing GAMEPLAY.6 CONTENT.1 marker: ${marker}`);
}
assert.match(content, /postFinal4, postFinal7, postFinal8, gameplay2, gameplay3, gameplay4, gameplay5, gameplay6, gameplay7/);
assert.match(progressionCore, /PROGRESSION_VERSION = 7/);
assert.match(progressionCore, /world6: createDefaultGameplay6WorldProfile/);
assert.match(progressionCore, /normalizeGameplay6WorldProfile\(source\.world6/);
assert.match(progression, /recordProgressionGameplay6WorldContribution/);
assert.match(progression, /world6: getGameplay6WorldPresentation/);
assert.match(cloudProfile, /mergedWorld6/);
assert.match(cloudProfile, /progressionStorage\.world6 = mergedWorld6/);
assert.match(summary, /recordRunGameplay6WorldContribution/);
assert.match(summary, /gameplay6WorldPoints/);
assert.match(hud, /GAMEPLAY\.6 R1 — persistent world progression readout/);
assert.match(hud, /\.ka-gameplay6-world/);

assert.equal(release.releaseId, 'content2-r1-new-arena-enemy-expansion');
assert.equal(release.productVersion, '1.12.0-content2-r1');
assert.equal(release.releaseSequence, 2026072302);
assert.equal(release.sourceBaselineSha, '501cc5ef8578569cbb727859188256c7ea81f5d9');
assert.equal(release.workerBaselineSha, 'cde81e6cde6b1617b6cc0ecc90f2f532c66fb1ef');
assert.equal(release.baselineWorkerVersionId, '879cb83e-cfac-47eb-8b9a-f8d43f39aa97');
assert.equal(release.workerChangeRequired, false);
assert.equal(metadata.releaseLabel, 'CONTENT.2 R1 - New Arena and Enemy Expansion');
assert.equal(metadata.gameplay6?.patch, 'gameplay6-r1-world-progression');
assert.deepEqual(metadata.gameplay6?.supportedMaps, [
  'grid_bunker',
  'industrial_yard',
  'neon_depot',
  'parking_garage',
  'hospital_wing',
  'reactor_courtyard',
  'stormbreak_canal'
]);
for (const field of [
  'persistentWorldState',
  'sectorProgression',
  'worldMilestones',
  'operationTierUnlocks',
  'narrativeOutcomeContribution',
  'bossVictoryContribution',
  'mutationContribution',
  'evolvingMapContribution',
  'profileOwnedState',
  'cloudMergeSafe',
  'protectedProgressionRewards',
  'idempotentContributionReceipts',
  'pvpExcluded',
  'hostAuthoritative',
  'lateJoinSnapshot',
  'reconnectRestoration',
  'hostMigrationCheckpoint',
  'runSummaryIntegration',
  'protocolUnchanged',
  'frontendOnly'
]) {
  assert.equal(metadata.gameplay6?.[field], true, `Missing GAMEPLAY.6 policy: ${field}`);
}
assert.equal(metadata.gameplay6?.workerChangeRequired, false);
assert.match(updateDelivery, /content2-r1-new-arena-enemy-expansion/);
assert.match(updateDelivery, /releaseSequence: 2026072302/);
assert.match(buildProduction, /GAMEPLAY6_RELEASE_SEQUENCE = 2026072104/);
assert.match(buildProduction, /"gameplay6":/);
assert.match(verifyProduction, /GAMEPLAY\.6 production manifest patch mismatch/);
assert.match(verifyProduction, /GAMEPLAY\.6 must remain frontend-only/);

console.log('GAMEPLAY.6 source integration contract passed');
