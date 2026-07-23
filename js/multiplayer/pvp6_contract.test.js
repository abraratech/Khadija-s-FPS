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

assert.ok([PVP6_PATCH, 'social2-r1-arena-id-friend-discovery', 'net1-r1-webrtc-hybrid-transport', 'gameplay2-r1-late-round-arena-mutations', 'gameplay3-r1-interactive-evolving-maps', 'gameplay4-r1-expanded-boss-encounters', 'gameplay5-r1-narrative-operations', 'gameplay6-r1-world-progression', 'gameplay7-r1-dynamic-campaign-faction-control', 'loadout2-r1-weapon-mastery-operator-specialization-melee', 'quality2-r1-consolidated-low-gpu-rendering', 'endgame1-r1-high-difficulty-operations', 'content2-r1-new-arena-enemy-expansion'].includes(release.releaseId));
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
} else if (release.releaseId === 'gameplay3-r1-interactive-evolving-maps') {
  assert.equal(release.productVersion, '1.4.0-gameplay3-r1');
  assert.equal(release.releaseSequence, 2026072101);
  assert.equal(release.sourceBaselineSha, '336298a125d70f2b98f4299cea74f8c08c6cefca');
  assert.equal(release.workerBaselineSha, '2a038bef08f3d27a71159ac6ef597139acfc58b1');
  assert.equal(release.baselineWorkerVersionId, '4f384856-891f-4563-b148-148c2f90cd98');
  assert.equal(release.workerChangeRequired, false);
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_DEPLOYMENT_PENDING');
} else if (release.releaseId === 'gameplay4-r1-expanded-boss-encounters') {
  assert.equal(release.productVersion, '1.5.0-gameplay4-r1');
  assert.equal(release.releaseSequence, 2026072102);
  assert.equal(release.sourceBaselineSha, 'f48d86332933f9a4e02c78b072cc5861d41d3e48');
  assert.equal(release.workerBaselineSha, '2a038bef08f3d27a71159ac6ef597139acfc58b1');
  assert.equal(release.baselineWorkerVersionId, '4f384856-891f-4563-b148-148c2f90cd98');
  assert.equal(release.workerChangeRequired, false);
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_DEPLOYMENT_PENDING');
} else if (release.releaseId === 'gameplay5-r1-narrative-operations') {
  assert.equal(release.productVersion, '1.6.0-gameplay5-r1');
} else if (release.releaseId === 'gameplay6-r1-world-progression') {
  assert.equal(release.productVersion, '1.7.0-gameplay6-r1');
  assert.equal(release.releaseSequence, 2026072104);
  assert.equal(release.sourceBaselineSha, 'b3544e114ce02047b3705af14fcc94428c8cdbe8');
  assert.equal(release.workerBaselineSha, '2a038bef08f3d27a71159ac6ef597139acfc58b1');
  assert.equal(release.baselineWorkerVersionId, '4f384856-891f-4563-b148-148c2f90cd98');
  assert.equal(release.workerChangeRequired, false);
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_DEPLOYMENT_PENDING');
} else if (release.releaseId === 'gameplay7-r1-dynamic-campaign-faction-control') {
  assert.equal(release.productVersion, '1.8.0-gameplay7-r1');
  assert.equal(release.releaseSequence, 2026072105);
  assert.equal(release.sourceBaselineSha, 'ce039d5ecd87ad15ada567c9ed6849dcdde5f4b9');
  assert.equal(release.workerBaselineSha, '2a038bef08f3d27a71159ac6ef597139acfc58b1');
  assert.equal(release.baselineWorkerVersionId, '4f384856-891f-4563-b148-148c2f90cd98');
  assert.equal(release.workerChangeRequired, false);
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_DEPLOYMENT_PENDING');
} else if (release.releaseId === 'quality2-r1-consolidated-low-gpu-rendering') {
  assert.equal(release.productVersion, '1.10.0-quality2-r1');
  assert.equal(release.releaseSequence, 2026072202);
  assert.equal(release.sourceBaselineSha, 'd56ffa34d890f1cc2ac0ae8c98164e7c71edf9c7');
  assert.equal(release.workerBaselineSha, '2a038bef08f3d27a71159ac6ef597139acfc58b1');
  assert.equal(release.workerChangeRequired, false);
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_DEPLOYMENT_PENDING');
} else if (release.releaseId === 'endgame1-r1-high-difficulty-operations') {
  assert.equal(release.productVersion, '1.11.0-endgame1-r1');
  assert.equal(release.releaseSequence, 2026072301);
  assert.equal(release.sourceBaselineSha, 'b99543d4f233d8d5284f48ae0c6df0d4a528a362');
  assert.equal(release.workerBaselineSha, '2a038bef08f3d27a71159ac6ef597139acfc58b1');
  assert.equal(release.baselineWorkerVersionId, '4f384856-891f-4563-b148-148c2f90cd98');
  assert.equal(release.workerChangeRequired, true);
  assert.equal(release.certificationStatus, 'LOCAL_CANDIDATE_NOT_COMMITTED_NOT_DEPLOYED');
} else if (release.releaseId === 'loadout2-r1-weapon-mastery-operator-specialization-melee') {
  assert.equal(release.productVersion, '1.9.0-loadout2-r1');
  assert.equal(release.releaseSequence, 2026072201);
  assert.equal(release.sourceBaselineSha, '94fa816f099dec9ae6a6bc11047a2bf1331ee892');
  assert.equal(release.workerBaselineSha, '2a038bef08f3d27a71159ac6ef597139acfc58b1');
  assert.equal(release.baselineWorkerVersionId, '4f384856-891f-4563-b148-148c2f90cd98');
  assert.equal(release.workerChangeRequired, false);
  assert.equal(release.certificationStatus, 'STATIC_CERTIFIED_DEPLOYMENT_PENDING');
} else if (release.releaseId === 'content2-r1-new-arena-enemy-expansion') {
  assert.equal(release.productVersion, '1.12.0-content2-r1');
  assert.equal(release.releaseSequence, 2026072302);
  assert.equal(release.sourceBaselineSha, '501cc5ef8578569cbb727859188256c7ea81f5d9');
  assert.equal(release.workerBaselineSha, 'cde81e6cde6b1617b6cc0ecc90f2f532c66fb1ef');
  assert.equal(release.baselineWorkerVersionId, '879cb83e-cfac-47eb-8b9a-f8d43f39aa97');
  assert.equal(release.workerChangeRequired, false);
  assert.equal(release.certificationStatus, 'LOCAL_CANDIDATE_NOT_COMMITTED_NOT_DEPLOYED');
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
