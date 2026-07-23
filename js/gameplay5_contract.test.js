import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.join(here, relative), 'utf8');

const core = read('gameplay5_narrative_operation_core.js');
const content = read('content1.js');
const summary = read('run_summary.js');
const hud = read('../css/hud.css');
const foundation = read('multiplayer/foundation.js');
const updateDelivery = read('update_delivery_core.js');
const buildProduction = read('../scripts/build_production.py');
const verifyProduction = read('../scripts/verify_launch2_build.py');
const release = JSON.parse(read('../release-version.json'));
const metadata = JSON.parse(read('../multiplayer-release.json'));

assert.match(core, /GAMEPLAY5_PATCH = 'gameplay5-r1-narrative-operations'/);
for (const marker of [
  'Black Vault Directive',
  'Iron Reclaim Directive',
  'Neon Cutoff Directive',
  'Concrete Lock Directive',
  'White Out Directive',
  'Red Core Directive',
  'GAMEPLAY5_BRANCH',
  'ASSET_SECURED',
  'ASSET_LOST',
  'getObjectiveTuning',
  'observeMission',
  'observeWorldState',
  'computeGameplay5NarrativeReward'
]) {
  assert.ok(core.includes(marker), `Missing GAMEPLAY.5 core marker: ${marker}`);
}
assert.match(core, /normalized === 'pvp'/);
assert.doesNotMatch(core.toLowerCase(), /speechsynthesis|microphone|getusermedia|voice chat/);

for (const marker of [
  'Gameplay5NarrativeDirector',
  'this.narrativeDirector = new Gameplay5NarrativeDirector()',
  'window.KAGetGameplay5NarrativeSnapshot',
  'snapshot.gameplay5',
  'payload.snapshot.gameplay5',
  'this.narrativeDirector.replaceSnapshot(snapshot.gameplay5',
  'recordRunGameplay5NarrativeOutcome',
  'computeGameplay5NarrativeReward',
  'ka-gameplay5-narrative',
  'gameplay5Patch: GAMEPLAY5_PATCH'
]) {
  assert.ok(content.includes(marker), `Missing GAMEPLAY.5 CONTENT.1 marker: ${marker}`);
}
assert.match(content, /postFinal4, postFinal7, postFinal8, gameplay2, gameplay3, gameplay4, gameplay5, gameplay6, gameplay7/);
assert.match(summary, /recordRunGameplay5NarrativeOutcome/);
assert.match(summary, /gameplay5NarrativeOutcome/);
assert.match(hud, /GAMEPLAY\.5 R1 — text-driven narrative operation transmissions/);
assert.match(hud, /\.ka-gameplay5-narrative/);

assert.equal(release.releaseId, 'content2-r1-new-arena-enemy-expansion');
assert.equal(release.productVersion, '1.12.0-content2-r1');
assert.equal(release.releaseSequence, 2026072302);
assert.equal(release.sourceBaselineSha, '501cc5ef8578569cbb727859188256c7ea81f5d9');
assert.equal(release.workerBaselineSha, 'cde81e6cde6b1617b6cc0ecc90f2f532c66fb1ef');
assert.equal(release.baselineWorkerVersionId, '879cb83e-cfac-47eb-8b9a-f8d43f39aa97');
assert.equal(release.workerChangeRequired, false);
assert.equal(metadata.releaseLabel, 'CONTENT.2 R1 - New Arena and Enemy Expansion');
assert.equal(metadata.gameplay5?.patch, 'gameplay5-r1-narrative-operations');
assert.deepEqual(metadata.gameplay5?.supportedMaps, [
  'grid_bunker',
  'industrial_yard',
  'neon_depot',
  'parking_garage',
  'hospital_wing',
  'reactor_courtyard',
  'stormbreak_canal'
]);
for (const field of [
  'mapSpecificBriefings',
  'stageTransmissions',
  'branchConsequences',
  'objectiveOutcomeInfluence',
  'bossNarrativeIntegration',
  'mutationNarrativeIntegration',
  'evolvingMapNarrativeIntegration',
  'textOnlyNarrative',
  'nonverbalAudioCues',
  'cinematicHudPresentation',
  'deterministicOutcomes',
  'pvpExcluded',
  'hostAuthoritative',
  'lateJoinSnapshot',
  'reconnectRestoration',
  'hostMigrationCheckpoint',
  'rewardAuthority',
  'runSummaryIntegration',
  'protocolUnchanged',
  'frontendOnly'
]) {
  assert.equal(metadata.gameplay5?.[field], true, `Missing GAMEPLAY.5 policy: ${field}`);
}
assert.equal(metadata.gameplay5?.voiceRuntimeReintroduced, false);
assert.equal(metadata.gameplay5?.workerChangeRequired, false);
assert.match(updateDelivery, /content2-r1-new-arena-enemy-expansion/);
assert.match(updateDelivery, /releaseSequence: 2026072302/);
assert.match(buildProduction, /GAMEPLAY5_RELEASE_SEQUENCE = 2026072103/);
assert.match(buildProduction, /"gameplay5":/);
assert.match(verifyProduction, /GAMEPLAY\.5 production manifest patch mismatch/);
assert.match(verifyProduction, /GAMEPLAY\.5 must remain frontend-only/);
assert.match(verifyProduction, /GAMEPLAY\.5 must not reintroduce voice runtime/);

const pvpEnd = foundation.indexOf('content1Manager?.endRun?.()', foundation.indexOf('if (pvpRun)'));
assert.ok(pvpEnd >= 0, 'PvP runs must keep CONTENT.1 and GAMEPLAY.5 inactive.');

console.log('GAMEPLAY.5 source integration contract passed');
