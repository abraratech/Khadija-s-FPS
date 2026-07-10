// js/multiplayer/public_deployment_acceptance_core.test.js
import assert from 'node:assert/strict';
import {
  PUBLIC_DEPLOYMENT_ACCEPTANCE_BASELINE_SHA,
  PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
  PUBLIC_DEPLOYMENT_ACCEPTANCE_CERTIFIED_FRONTEND_SHA,
  PUBLIC_DEPLOYMENT_ACCEPTANCE_PATCH,
  PUBLIC_DEPLOYMENT_ACCEPTANCE_PROTOCOL,
  PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
  PUBLIC_DEPLOYMENT_ACCEPTANCE_UI_READY_TEXT,
  PUBLIC_DEPLOYMENT_ACCEPTANCE_WORKER_URL,
  createCompactPublicDeploymentDiagnostic,
  createExpectedPublicDeploymentAcceptanceManifest,
  evaluatePublicDeploymentAcceptance,
  normalizePublicDeploymentAcceptanceWorkerReleaseEndpoint
} from './public_deployment_acceptance_core.js';

assert.equal(PUBLIC_DEPLOYMENT_ACCEPTANCE_PATCH, 'm3-public-deployment-acceptance-r1');
assert.equal(PUBLIC_DEPLOYMENT_ACCEPTANCE_BASELINE_SHA, '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250');
assert.equal(PUBLIC_DEPLOYMENT_ACCEPTANCE_PROTOCOL, 6);
assert.equal(PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD, 'm3-team-final-world-reconnect-r3');
assert.equal(PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH, 'm3-production-release-manifest-r1');

const acceptanceManifest = createExpectedPublicDeploymentAcceptanceManifest();
const frontendManifest = {
  ok: true,
  service: 'khadijas-arena-frontend',
  protocol: PUBLIC_DEPLOYMENT_ACCEPTANCE_PROTOCOL,
  build: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
  patch: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
  certifiedBaselineSha: PUBLIC_DEPLOYMENT_ACCEPTANCE_CERTIFIED_FRONTEND_SHA,
  releaseStatus: 'CERTIFIED',
  workerUrl: PUBLIC_DEPLOYMENT_ACCEPTANCE_WORKER_URL
};
const workerManifest = {
  ok: true,
  service: 'khadijas-arena-multiplayer',
  protocol: PUBLIC_DEPLOYMENT_ACCEPTANCE_PROTOCOL,
  build: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
  patch: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
  certifiedFrontendSha: PUBLIC_DEPLOYMENT_ACCEPTANCE_CERTIFIED_FRONTEND_SHA,
  releaseStatus: 'CERTIFIED',
  deployedAt: '2026-07-10T00:00:00.000Z'
};

const passing = evaluatePublicDeploymentAcceptance({
  acceptanceManifest,
  frontendManifest,
  workerManifest,
  pageUrl: 'https://khadija-s-fps.pages.dev/public-deployment-acceptance.html',
  runtimeAudit: 'pass',
  activeRestrictedGlobals: [],
  uiStatusText: PUBLIC_DEPLOYMENT_ACCEPTANCE_UI_READY_TEXT,
  gameBuild: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
  gamePatch: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
  manualProof: {
    createJoin: true,
    shortRun: true,
    leaveRejoin: true
  }
});
assert.equal(passing.status, 'PASS');
assert.equal(passing.automatedReady, true);
assert.equal(passing.ready, true);
assert.equal(passing.errors.length, 0);
assert.equal(passing.pending.length, 0);

const pending = evaluatePublicDeploymentAcceptance({
  acceptanceManifest,
  frontendManifest,
  workerManifest,
  pageUrl: 'https://khadija-s-fps.pages.dev/public-deployment-acceptance.html',
  runtimeAudit: 'pass',
  activeRestrictedGlobals: [],
  uiStatusText: PUBLIC_DEPLOYMENT_ACCEPTANCE_UI_READY_TEXT,
  gameBuild: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
  gamePatch: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
  manualProof: {}
});
assert.equal(pending.status, 'PENDING');
assert.equal(pending.automatedReady, true);
assert.equal(pending.ready, false);
assert.equal(pending.pending.length, 3);

const exposed = evaluatePublicDeploymentAcceptance({
  acceptanceManifest,
  frontendManifest,
  workerManifest,
  pageUrl: 'https://khadija-s-fps.pages.dev/public-deployment-acceptance.html',
  runtimeAudit: 'fail',
  activeRestrictedGlobals: ['KHADIJA_MULTIPLAYER_FINAL_CERTIFICATION'],
  uiStatusText: 'CHECK FAILED',
  gameBuild: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
  gamePatch: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
  manualProof: {
    createJoin: true,
    shortRun: true,
    leaveRejoin: true
  }
});
assert.equal(exposed.status, 'FAIL');
assert.equal(exposed.blocking, true);
assert.ok(exposed.errors.some((item) => item.code === 'RUNTIME_AUDIT_NOT_PASS'));
assert.ok(exposed.errors.some((item) => item.code === 'PUBLIC_DEBUG_GLOBALS_EXPOSED'));
assert.ok(exposed.errors.some((item) => item.code === 'CERTIFIED_SERVER_UI_NOT_READY'));

const mismatch = evaluatePublicDeploymentAcceptance({
  acceptanceManifest,
  frontendManifest: { ...frontendManifest, patch: 'wrong-patch' },
  workerManifest,
  pageUrl: 'https://khadija-s-fps.pages.dev/public-deployment-acceptance.html',
  runtimeAudit: 'pass',
  activeRestrictedGlobals: [],
  uiStatusText: PUBLIC_DEPLOYMENT_ACCEPTANCE_UI_READY_TEXT,
  gameBuild: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
  gamePatch: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
  manualProof: {
    createJoin: true,
    shortRun: true,
    leaveRejoin: true
  }
});
assert.equal(mismatch.status, 'FAIL');
assert.ok(mismatch.errors.some((item) => item.code === 'FRONTEND_PATCH_MISMATCH'));
assert.ok(mismatch.errors.some((item) => item.code === 'FRONTEND_WORKER_PATCH_MISMATCH'));

assert.equal(
  normalizePublicDeploymentAcceptanceWorkerReleaseEndpoint('wss://example.test/ws?x=1'),
  'https://example.test/release'
);
assert.equal(
  normalizePublicDeploymentAcceptanceWorkerReleaseEndpoint('example.test'),
  'https://example.test/release'
);

const diagnostic = createCompactPublicDeploymentDiagnostic(passing, {
  checkedAt: '2026-07-10T12:00:00.000Z',
  roomCode: 'AB23CD'
});
assert.equal(diagnostic.schema, 1);
assert.equal(diagnostic.status, 'PASS');
assert.equal(diagnostic.ready, true);
assert.equal(diagnostic.twoClientProof.roomCode, 'AB23CD');
assert.deepEqual(diagnostic.errors, []);

console.log('M3.85-M3.86 public deployment acceptance core tests passed.');
