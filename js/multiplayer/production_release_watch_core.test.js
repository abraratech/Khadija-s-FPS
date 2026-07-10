// js/multiplayer/production_release_watch_core.test.js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  canonicalProductionReleaseWatchJson,
  createExpectedProductionReleaseWatchManifest,
  createProductionReleaseWatchEvidence,
  createProductionRollbackDecision,
  evaluateProductionGoLiveCertificate,
  evaluateProductionReleaseWatchSample,
  evaluateProductionReleaseWatchWindow,
  PRODUCTION_RELEASE_WATCH_BUILD,
  PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA,
  PRODUCTION_RELEASE_WATCH_FRONTEND_ORIGIN,
  PRODUCTION_RELEASE_WATCH_PATCH,
  PRODUCTION_RELEASE_WATCH_PROTOCOL,
  PRODUCTION_RELEASE_WATCH_RELEASE_PATCH,
  PRODUCTION_RELEASE_WATCH_RELEASE_STATUS,
  PRODUCTION_RELEASE_WATCH_ROLLBACK_SHA,
  PRODUCTION_RELEASE_WATCH_UI_READY_TEXT,
  PRODUCTION_RELEASE_WATCH_WORKER_ORIGIN,
  PRODUCTION_RELEASE_WATCH_WORKER_VERSION_ID
} from './production_release_watch_core.js';

const manifest = createExpectedProductionReleaseWatchManifest();
const certificatePayload = {
  schema: 1,
  milestone: 'M3.87-M3.88',
  patch: 'm3-production-go-live-seal-r1',
  decision: 'GO_LIVE_APPROVED',
  createdAt: '2026-07-10T20:00:00.000Z',
  approvedBy: 'Abrar Ahmed',
  approvalConfirmed: true,
  sourceDiagnosticSha256: 'a'.repeat(64),
  sourceEvidence: { roomCode: 'AB23CD' },
  releaseIdentity: {
    protocol: PRODUCTION_RELEASE_WATCH_PROTOCOL,
    build: PRODUCTION_RELEASE_WATCH_BUILD,
    releasePatch: PRODUCTION_RELEASE_WATCH_RELEASE_PATCH,
    certifiedFrontendSha: PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA,
    releaseStatus: PRODUCTION_RELEASE_WATCH_RELEASE_STATUS
  },
  deployment: {
    frontendOrigin: PRODUCTION_RELEASE_WATCH_FRONTEND_ORIGIN,
    frontendCommitSha: '69761f9adc2c2a1143840f246093779da2cb2d6a',
    workerOrigin: PRODUCTION_RELEASE_WATCH_WORKER_ORIGIN,
    workerVersionId: PRODUCTION_RELEASE_WATCH_WORKER_VERSION_ID
  },
  rollbackAuthorization: { frontendCommitSha: PRODUCTION_RELEASE_WATCH_ROLLBACK_SHA }
};
const certificateSha256 = createHash('sha256').update(canonicalProductionReleaseWatchJson(certificatePayload)).digest('hex');
const certificate = { ...certificatePayload, certificateSha256 };

const certificateEvaluation = evaluateProductionGoLiveCertificate({
  manifest,
  certificate,
  certificateDigestValid: true,
  nowMs: Date.parse('2026-07-10T21:00:00.000Z')
});
assert.equal(certificateEvaluation.ready, true);
assert.equal(certificateEvaluation.status, 'PASS');

const badCertificate = evaluateProductionGoLiveCertificate({
  manifest,
  certificate: { ...certificate, deployment: { ...certificate.deployment, workerVersionId: 'wrong' } },
  certificateDigestValid: false,
  nowMs: Date.parse('2026-07-10T21:00:00.000Z')
});
assert.equal(badCertificate.ready, false);
assert.ok(badCertificate.errors.some((item) => item.code === 'GO_LIVE_CERTIFICATE_DIGEST_MISMATCH'));

function passingSample(sampledAt) {
  return evaluateProductionReleaseWatchSample({
    sampledAt,
    pageUrl: 'https://khadija-s-fps.pages.dev/production-release-watch.html',
    frontendManifest: {
      ok: true, service: 'khadijas-arena-frontend', protocol: PRODUCTION_RELEASE_WATCH_PROTOCOL,
      build: PRODUCTION_RELEASE_WATCH_BUILD, patch: PRODUCTION_RELEASE_WATCH_RELEASE_PATCH,
      certifiedBaselineSha: PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA, releaseStatus: PRODUCTION_RELEASE_WATCH_RELEASE_STATUS
    },
    workerHealth: { ok: true, protocol: PRODUCTION_RELEASE_WATCH_PROTOCOL, build: PRODUCTION_RELEASE_WATCH_BUILD },
    workerRelease: {
      ok: true, service: 'khadijas-arena-multiplayer', protocol: PRODUCTION_RELEASE_WATCH_PROTOCOL,
      build: PRODUCTION_RELEASE_WATCH_BUILD, patch: PRODUCTION_RELEASE_WATCH_RELEASE_PATCH,
      certifiedFrontendSha: PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA, releaseStatus: PRODUCTION_RELEASE_WATCH_RELEASE_STATUS
    },
    runtimeAudit: 'pass',
    activeRestrictedGlobals: [],
    uiStatusText: PRODUCTION_RELEASE_WATCH_UI_READY_TEXT,
    gameBuild: PRODUCTION_RELEASE_WATCH_BUILD,
    gamePatch: PRODUCTION_RELEASE_WATCH_RELEASE_PATCH,
    responseTimesMs: { frontend: 100, workerHealth: 100, workerRelease: 100, runtime: 200 }
  });
}

const samples = [
  passingSample('2026-07-10T21:00:00.000Z'),
  passingSample('2026-07-10T21:00:20.000Z'),
  passingSample('2026-07-10T21:00:40.000Z')
];
assert.ok(samples.every((sample) => sample.status === 'PASS'));
const green = evaluateProductionReleaseWatchWindow({ certificateEvaluation, samples });
assert.equal(green.status, 'GREEN');
assert.equal(green.ready, true);

const failed = { ...samples[0], sampledAt: '2026-07-10T21:01:00.000Z', status: 'FAIL', critical: true, errors: [{ code: 'WORKER_HEALTH_NOT_OK' }], warnings: [] };
const degraded = evaluateProductionReleaseWatchWindow({ certificateEvaluation, samples: [samples[0], samples[1], failed] });
assert.equal(degraded.status, 'DEGRADED');
const rollback = evaluateProductionReleaseWatchWindow({ certificateEvaluation, samples: [samples[0], failed, { ...failed, sampledAt: '2026-07-10T21:01:20.000Z' }] });
assert.equal(rollback.status, 'ROLLBACK_AUTHORIZED');
assert.equal(rollback.rollbackAuthorized, true);

const evidence = createProductionReleaseWatchEvidence(green, samples, certificate, {
  operator: 'Abrar Ahmed',
  createdAt: '2026-07-10T21:02:00.000Z'
});
assert.equal(evidence.status, 'GREEN');
assert.equal(evidence.samples.length, 3);

const drill = createProductionRollbackDecision(green, certificate, {
  approvedBy: 'Abrar Ahmed', confirmation: true, rehearsalOnly: true,
  createdAt: '2026-07-10T21:03:00.000Z'
});
assert.equal(drill.mode, 'DRILL_ONLY_DO_NOT_EXECUTE');
assert.throws(() => createProductionRollbackDecision(green, certificate, {
  approvedBy: 'Abrar Ahmed', confirmation: true, rehearsalOnly: false
}), /two or more failed/);
const emergency = createProductionRollbackDecision(rollback, certificate, {
  approvedBy: 'Abrar Ahmed', confirmation: true, rehearsalOnly: false,
  createdAt: '2026-07-10T21:04:00.000Z'
});
assert.equal(emergency.mode, 'EMERGENCY_ROLLBACK_AUTHORIZED');
assert.equal(PRODUCTION_RELEASE_WATCH_PATCH, 'm3-post-go-live-watch-r1');
console.log('production release watch core tests passed');
