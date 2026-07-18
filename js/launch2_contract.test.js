import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const release = JSON.parse(readFileSync(new URL('../multiplayer-release.json', import.meta.url), 'utf8'));
const builder = readFileSync(new URL('../scripts/build_production.py', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../scripts/verify_launch2_build.py', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8').toLowerCase();

assert.equal(release.launch2.patch, 'launch2-r1-final-production-certification');
assert.equal(release.launch2.sourceBaselineSha, 'aada1736cb2f404bda6e079bf175495957f19e1a');
for (const key of [
  'productionOnlyBuild', 'runtimeReferenceVerification', 'manifestHashVerification',
  'testsExcluded', 'workerSourceExcluded', 'repositoryToolsExcluded',
  'sourceMapsExcluded', 'gameplayAuthorityUnchanged', 'frontendOnly'
]) {
  assert.equal(release.launch2[key], true, `LAUNCH.2 metadata must enable ${key}`);
}
assert.equal(release.launch2.playerEditableServiceEndpoint, false);
assert.equal(release.launch2.playerFacingCertificationControls, false);
assert.equal(release.launch2.workerChangeRequired, false);
assert.deepEqual(release.launch2.approvedLocalPatches, [
  'hud1-r1-configurable-objective-display',
  'vis1-r1-visual-achievements-competitive-profile-hud-controls',
  'vis1-r1-1-pause-resume-visibility',
  'launch1-r1-first-run-welcome-production-language',
  'mpui2-r1-1-active-lobby-tab-isolation'
]);

assert.match(builder, /LAUNCH2_PATCH = "launch2-r1-final-production-certification"/);
assert.match(builder, /LAUNCH2_PRODUCTION_BUILD/);
assert.match(builder, /"launch2": \{/);
assert.match(builder, /"tests_included": False/);
assert.match(builder, /"worker_source_included": False/);
assert.match(builder, /"source_maps_included": False/);
assert.match(verifier, /Production hash mismatch/);
assert.match(verifier, /Missing production HTML reference/);
assert.match(verifier, /Player-facing infrastructure marker/);

for (const marker of [
  'mp-server-url', 'recheck certified server', 'certified server',
  'worker server', 'multiplayer server url'
]) {
  assert.equal(index.includes(marker), false, `Launch-facing marker must be absent: ${marker}`);
}

assert.equal(release.launch1.firstRunWelcome, true);
assert.equal(release.multiplayerHub.activeLobbyRoomsTabOnly, true);
assert.equal(release.hud1.pauseMenuControls, true);
assert.equal(release.vis1.pauseResumeVisibilityHotfix, 'vis1-r1-1-pause-resume-visibility');
console.log('LAUNCH.2 final production certification contract: PASS');
