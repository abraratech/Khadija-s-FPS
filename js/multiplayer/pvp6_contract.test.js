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

assert.equal(release.releaseId, PVP6_PATCH);
assert.equal(release.productVersion, PVP6_PRODUCT_VERSION);
assert.equal(release.releaseSequence, PVP6_RELEASE_SEQUENCE);
assert.equal(release.sourceBaselineSha, PVP6_FRONTEND_BASELINE_SHA);
assert.equal(release.workerBaselineSha, PVP6_WORKER_BASELINE_SHA);
assert.equal(release.baselineWorkerVersionId, PVP6_BASELINE_WORKER_VERSION_ID);
assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_LIVE_PENDING');

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
