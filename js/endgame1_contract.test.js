import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const core = read('js/endgame1_core.js');
const content = read('js/content1.js');
const progression = read('js/progression.js');
const progressionCore = read('js/progression_core.js');
const cloud = read('js/cloud_profile.js');
const summary = read('js/run_summary.js');
const loadout = read('js/loadout2_runtime.js');
const revive = read('js/multiplayer/revive.js');
const reviveCore = read('js/multiplayer/revive_core.js');
const ui = read('js/ui.js');
const index = read('index.html');
const hud = read('css/hud.css');
const updateDelivery = read('js/update_delivery_core.js');
const build = read('scripts/build_production.py');
const verifier = read('scripts/verify_launch2_build.py');
const workerAuthority = read('multiplayer-server/src/progression_authority_core.js');
const workerCore = read('multiplayer-server/src/endgame1_core.js');
const release = JSON.parse(read('release-version.json'));
const metadata = JSON.parse(read('multiplayer-release.json'));
const workerPackage = JSON.parse(read('multiplayer-server/package.json'));

assert.equal(release.releaseId, 'content2-r1-new-arena-enemy-expansion');
assert.equal(release.productVersion, '1.12.0-content2-r1');
assert.equal(release.releaseSequence, 2026072302);
assert.equal(release.sourceBaselineSha, '501cc5ef8578569cbb727859188256c7ea81f5d9');
assert.equal(release.workerBaselineSha, 'cde81e6cde6b1617b6cc0ecc90f2f532c66fb1ef');
assert.equal(release.baselineWorkerVersionId, '879cb83e-cfac-47eb-8b9a-f8d43f39aa97');
assert.equal(release.workerChangeRequired, false);
assert.equal(release.certificationStatus, 'LOCAL_CANDIDATE_NOT_COMMITTED_NOT_DEPLOYED');
assert.equal(metadata.releaseLabel, 'CONTENT.2 R1 - New Arena and Enemy Expansion');
assert.equal(workerPackage.version, '1.11.0-endgame1-r1');

for (const marker of [
  "ENDGAME1_PATCH = 'endgame1-r1-high-difficulty-operations'",
  'ENDGAME1_TIER_IDS',
  'VETERAN',
  'NIGHTMARE',
  'APEX',
  'selectEndgame1Modifiers',
  'computeEndgame1Tuning',
  'applyEndgame1CompletionReceipt',
  'Endgame1Director',
  'hostAuthoritative',
  'protocolUnchanged',
  'pvpExcluded'
]) assert.ok(core.includes(marker), `Missing ENDGAME.1 core marker: ${marker}`);

for (const marker of [
  'this.endgameDirector = new Endgame1Director()',
  'window.KAGetEndgame1Snapshot',
  'window.KAGetEndgame1Tuning',
  'window.KAGetEndgame1RevivePolicy',
  'snapshot.endgame1',
  'payload.snapshot.endgame1',
  'this.endgameDirector.replaceSnapshot',
  'recordProgressionEndgame1Completion',
  'recordRunEndgame1',
  'endgameTuning.enemyHealthScale',
  'ka-endgame1-operation'
]) assert.ok(content.includes(marker), `Missing ENDGAME.1 content marker: ${marker}`);

assert.match(progressionCore, /PROGRESSION_VERSION = 7/);
assert.match(progressionCore, /endgame1: createDefaultEndgame1Profile/);
assert.match(progressionCore, /normalizeEndgame1Profile\(source\.endgame1/);
assert.match(progression, /recordProgressionEndgame1Completion/);
assert.match(progression, /endgame1ReceiptFields/);
assert.match(cloud, /mergeEndgame1Profiles/);
assert.match(cloud, /progressionStorage\.endgame1 = mergedEndgame1/);
assert.match(summary, /recordRunEndgame1/);
assert.match(summary, /endgame1Marks/);
assert.match(loadout, /endgameMasteryScale/);
assert.match(reviveCore, /normalizeEndgame1RevivePolicy/);
assert.match(reviveCore, /REVIVE_LIMIT_REACHED/);
assert.match(reviveCore, /allowWaveRespawn/);
assert.match(revive, /KAGetEndgame1RevivePolicy/);
assert.match(revive, /ENDGAME REVIVE LIMIT REACHED/);
assert.match(ui, /final-endgame-tier/);
assert.match(ui, /final-endgame-modifiers/);
assert.match(ui, /final-endgame-reward/);
for (const value of ['1.70', '1.85', '2.0']) assert.match(index, new RegExp(`data-diff=["']${value.replace('.', '\\.')}`));
assert.match(hud, /ENDGAME\.1 R1 — high-difficulty operation tier and modifier readout/);
assert.match(hud, /\.ka-endgame1-operation/);

const policy = metadata.endgame1;
assert.equal(policy.patch, 'endgame1-r1-high-difficulty-operations');
assert.deepEqual(policy.tiers, ['VETERAN', 'NIGHTMARE', 'APEX']);
for (const field of [
  'deterministicModifiers', 'hostAuthoritative', 'lateJoinSnapshot',
  'reconnectRestoration', 'hostMigrationCheckpoint', 'limitedTeamRevives',
  'apexWaveRespawnDisabled', 'profileOwnedState', 'cloudMergeSafe',
  'protectedCompletionReceipts', 'workerAuthoritativeRewards',
  'duplicateSafeReceipts', 'weaponMasteryAcceleration',
  'runSummaryIntegration', 'pvpExcluded', 'pvpProgressionBonusesDisabled',
  'enemyPopulationUnchanged', 'protocolUnchanged', 'workerChangeRequired',
  'frontendAndWorker', 'crazyGamesReadinessOnHold', 'androidReadinessOnHold'
]) assert.equal(policy[field], true, `Missing ENDGAME.1 policy: ${field}`);
assert.equal(policy.newMapsIncluded, false);
assert.equal(policy.newEnemyFactionsIncluded, false);

assert.match(workerCore, /selectAuthoritativeEndgame1Modifiers/);
assert.match(workerCore, /applyAuthoritativeEndgame1Receipt/);
assert.match(workerAuthority, /normalizeEndgame1Receipt/);
assert.match(workerAuthority, /endgameXp/);
assert.match(workerAuthority, /profile\.endgame1 = endgameResult\.profile/);
assert.match(updateDelivery, /content2-r1-new-arena-enemy-expansion/);
assert.match(updateDelivery, /releaseSequence: 2026072302/);
assert.match(build, /ENDGAME1_PATCH = 'endgame1-r1-high-difficulty-operations'/);
assert.match(build, /"endgame1": \{/);
assert.match(verifier, /ENDGAME\.1 production manifest patch mismatch/);
assert.match(verifier, /ENDGAME\.1 release descriptor must require Worker publication/);

console.log('ENDGAME.1 source integration contract passed');
