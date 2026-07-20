import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMultiplayerFrontendReleaseManifest } from './production_release_core.js';
import {
  PVP6_BASELINE_WORKER_VERSION_ID,
  PVP6_CERTIFICATION_MATRIX,
  PVP6_FRONTEND_BASELINE_SHA,
  PVP6_PATCH,
  PVP6_PRODUCT_VERSION,
  PVP6_RELEASE_SEQUENCE,
  PVP6_WORKER_BASELINE_SHA
} from './pvp6_core.js';

const release = JSON.parse(fs.readFileSync(new URL('../../release-version.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(new URL('../../multiplayer-release.json', import.meta.url), 'utf8'));
const seal = JSON.parse(fs.readFileSync(new URL('../../pvp-production-seal.json', import.meta.url), 'utf8'));
const build = fs.readFileSync(new URL('../../scripts/build_production.py', import.meta.url), 'utf8');
const verify = fs.readFileSync(new URL('../../scripts/verify_launch2_build.py', import.meta.url), 'utf8');
const pvp5Runtime = fs.readFileSync(new URL('./pvp1.js', import.meta.url), 'utf8');
const pvp5Core = fs.readFileSync(new URL('./pvp5_core.js', import.meta.url), 'utf8');
const productionRelease = createMultiplayerFrontendReleaseManifest();

assert.ok([PVP6_PATCH, 'social2-r1-arena-id-friend-discovery', 'net1-r1-webrtc-hybrid-transport', 'gameplay2-r1-late-round-arena-mutations'].includes(release.releaseId));
if (release.releaseId === PVP6_PATCH) {
  assert.equal(release.productVersion, PVP6_PRODUCT_VERSION);
  assert.equal(release.releaseSequence, PVP6_RELEASE_SEQUENCE);
  assert.equal(release.sourceBaselineSha, PVP6_FRONTEND_BASELINE_SHA);
  assert.equal(release.workerBaselineSha, PVP6_WORKER_BASELINE_SHA);
  assert.equal(release.baselineWorkerVersionId, PVP6_BASELINE_WORKER_VERSION_ID);
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_LIVE_PENDING');
} else if (release.releaseId === 'social2-r1-arena-id-friend-discovery') {
  assert.equal(release.productVersion, '1.1.0-social2-r1');
  assert.equal(release.sourceBaselineSha, '2d41fb1e0a23a12ca970184acf00272ead91d4ba');
  assert.equal(release.workerBaselineSha, '24976152c3e9f0fe780cb20838627f5cf17dbedc');
  assert.equal(release.baselineWorkerVersionId, 'f1936d32-3c25-491a-b214-a16ab79e2c2f');
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_DEPLOYMENT_PENDING');
} else if (release.releaseId === 'net1-r1-webrtc-hybrid-transport') {
  assert.equal(release.productVersion, '1.2.0-net1-r1');
  assert.equal(release.sourceBaselineSha, '8e0552196f9f59962a79905a2da55789ffc9d478');
  assert.equal(release.workerBaselineSha, '1aa92025a774aa19d4dece995caae8b300fa28bf');
  assert.equal(release.baselineWorkerVersionId, '1ce125a4-d79c-43aa-914e-a1f689116618');
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_DEPLOYMENT_PENDING');
} else if (release.releaseId === 'gameplay2-r1-late-round-arena-mutations') {
  assert.equal(release.productVersion, '1.3.0-gameplay2-r1');
  assert.equal(release.releaseSequence, 2026072001);
  assert.equal(release.sourceBaselineSha, 'debaeba8e15820d61158078ebd2ade55ef963aa5');
  assert.equal(release.workerBaselineSha, '62a74627e24dc52dcf9fc524fddd8f949f2fd3cf');
  assert.equal(release.baselineWorkerVersionId, 'b4e4860b-78a4-4b63-8df4-e6ef596ec3ad');
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_DEPLOYMENT_PENDING');
} else {
  assert.fail(`Unsupported release descriptor: ${release.releaseId}`);
}

for (const source of [metadata.pvp6, seal, productionRelease.pvp6]) {
  assert.equal(source.patch, PVP6_PATCH);
  assert.equal(source.productVersion, PVP6_PRODUCT_VERSION);
  assert.equal(source.frontendBaselineSha, PVP6_FRONTEND_BASELINE_SHA);
  assert.equal(source.workerBaselineSha, PVP6_WORKER_BASELINE_SHA);
  assert.equal(source.productionSealCandidate, true);
  assert.equal(source.finalProductionSeal, false);
  assert.equal(source.deadPvpFlagsFound, 0);
  assert.equal(source.realTwoClientCertificationRequired, true);
}
assert.deepEqual(productionRelease.pvp6.certificationMatrix, PVP6_CERTIFICATION_MATRIX);
assert.match(build, /pvp-production-seal\.json/);
assert.match(build, /PVP6_PATCH/);
assert.match(verify, /PVP\.6 R1 production manifest patch mismatch/);
assert.match(verify, /pvp-production-seal\.json/);
for (const marker of ['updateSpectatorCamera', 'pvp-rematch-vote', 'data-pvp-summary-scoreboard']) {
  assert.ok(pvp5Runtime.includes(marker), `PVP.5 runtime regression: ${marker}`);
}
for (const marker of ['buildPvp5Scoreboard', 'registerPvp5RematchVote', 'resolvePvp5Elimination']) {
  assert.ok(pvp5Core.includes(marker), `PVP.5 core regression: ${marker}`);
}
console.log('PVP.6 frontend final certification candidate contract: PASS');
