// js/multiplayer/production_release_closure_core.test.js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  canonicalProductionReleaseClosureJson,
  createExpectedProductionReleaseClosureManifest,
  createProductionOperationsHandoff,
  createProductionReleaseClosureCertificate,
  evaluateProductionReleaseClosure,
  PRODUCTION_RELEASE_CLOSURE_BASELINE_SHA,
  PRODUCTION_RELEASE_CLOSURE_BUILD,
  PRODUCTION_RELEASE_CLOSURE_CERTIFIED_SHA,
  PRODUCTION_RELEASE_CLOSURE_FRONTEND_ORIGIN,
  PRODUCTION_RELEASE_CLOSURE_PATCH,
  PRODUCTION_RELEASE_CLOSURE_RELEASE_PATCH,
  PRODUCTION_RELEASE_CLOSURE_RELEASE_STATUS,
  PRODUCTION_RELEASE_CLOSURE_ROLLBACK_SHA,
  PRODUCTION_RELEASE_CLOSURE_WORKER_ORIGIN,
  PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID
} from './production_release_closure_core.js';

const digest = (value) => createHash('sha256').update(canonicalProductionReleaseClosureJson(value)).digest('hex');
const manifest = createExpectedProductionReleaseClosureManifest();
const certificatePayload = {
  schema: 1,
  milestone: 'M3.87-M3.88',
  patch: 'm3-production-go-live-seal-r1',
  decision: 'GO_LIVE_APPROVED',
  createdAt: '2026-07-10T20:00:00.000Z',
  approvedBy: 'Abrar Ahmed',
  approvalConfirmed: true,
  releaseIdentity: {
    protocol: 6, build: PRODUCTION_RELEASE_CLOSURE_BUILD,
    releasePatch: PRODUCTION_RELEASE_CLOSURE_RELEASE_PATCH,
    certifiedFrontendSha: PRODUCTION_RELEASE_CLOSURE_CERTIFIED_SHA,
    releaseStatus: PRODUCTION_RELEASE_CLOSURE_RELEASE_STATUS
  },
  deployment: {
    frontendOrigin: PRODUCTION_RELEASE_CLOSURE_FRONTEND_ORIGIN,
    frontendCommitSha: '69761f9adc2c2a1143840f246093779da2cb2d6a',
    workerOrigin: PRODUCTION_RELEASE_CLOSURE_WORKER_ORIGIN,
    workerVersionId: PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID
  },
  rollbackAuthorization: { frontendCommitSha: PRODUCTION_RELEASE_CLOSURE_ROLLBACK_SHA }
};
const certificate = { ...certificatePayload, certificateSha256: digest(certificatePayload) };
const sampleTimes = ['2026-07-10T21:00:00.000Z','2026-07-10T21:00:20.000Z','2026-07-10T21:00:40.000Z'];
const watchPayload = {
  schema: 1,
  milestone: 'M3.89-M3.90',
  patch: 'm3-post-go-live-watch-r1',
  createdAt: '2026-07-10T21:02:00.000Z',
  operator: 'Abrar Ahmed',
  status: 'GREEN',
  releaseIdentity: { ...certificate.releaseIdentity },
  sourceGoLiveCertificateSha256: certificate.certificateSha256,
  summary: { samples:3, passCount:3, warnCount:0, failCount:0, windowMs:40000, enoughSamples:true, enoughWindow:true },
  samples: sampleTimes.map((sampledAt) => ({ sampledAt, status:'PASS', errorCodes:[], warningCodes:[], timings:{ frontend:100 } })),
  rollbackReference: { frontendCommitSha:PRODUCTION_RELEASE_CLOSURE_ROLLBACK_SHA, workerVersionId:PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID, workerChangeRequired:false },
  notes: null
};
const watch = { ...watchPayload, documentSha256: digest(watchPayload) };
const evaluation = evaluateProductionReleaseClosure({
  manifest, goLiveCertificate:certificate, goLiveDigestValid:true,
  watchEvidence:watch, watchDigestValid:true,
  nowMs:Date.parse('2026-07-10T22:00:00.000Z')
});
assert.equal(evaluation.ready, true);
assert.equal(evaluation.status, 'PASS');

const degradedPayload = { ...watchPayload, status:'DEGRADED' };
const degraded = { ...degradedPayload, documentSha256:digest(degradedPayload) };
const blocked = evaluateProductionReleaseClosure({
  manifest, goLiveCertificate:certificate, goLiveDigestValid:true,
  watchEvidence:degraded, watchDigestValid:true,
  nowMs:Date.parse('2026-07-10T22:00:00.000Z')
});
assert.equal(blocked.ready, false);
assert.ok(blocked.errors.some((item) => item.code === 'WATCH_EVIDENCE_MISMATCH'));

const badChainPayload = { ...watchPayload, sourceGoLiveCertificateSha256:'b'.repeat(64) };
const badChain = { ...badChainPayload, documentSha256:digest(badChainPayload) };
const chainBlocked = evaluateProductionReleaseClosure({
  manifest, goLiveCertificate:certificate, goLiveDigestValid:true,
  watchEvidence:badChain, watchDigestValid:true,
  nowMs:Date.parse('2026-07-10T22:00:00.000Z')
});
assert.ok(chainBlocked.errors.some((item) => item.code === 'WATCH_EVIDENCE_MISMATCH'));

const stale = evaluateProductionReleaseClosure({
  manifest, goLiveCertificate:certificate, goLiveDigestValid:true,
  watchEvidence:watch, watchDigestValid:true,
  nowMs:Date.parse('2026-07-20T22:00:00.000Z')
});
assert.ok(stale.errors.some((item) => item.code === 'WATCH_EVIDENCE_STALE'));

const closurePayload = createProductionReleaseClosureCertificate(evaluation, certificate, watch, {
  closedBy:'Abrar Ahmed', confirmation:true, createdAt:'2026-07-10T22:05:00.000Z'
});
assert.equal(closurePayload.status, 'CLOSED_GREEN');
assert.equal(closurePayload.deployment.frontendCommitSha, PRODUCTION_RELEASE_CLOSURE_BASELINE_SHA);
assert.throws(() => createProductionReleaseClosureCertificate(evaluation, certificate, watch, { closedBy:'Abrar Ahmed', confirmation:false }), /confirmation/);
const closure = { ...closurePayload, documentSha256:digest(closurePayload) };
const handoff = createProductionOperationsHandoff(closure, {
  owner:'Abrar Ahmed', confirmation:true, createdAt:'2026-07-10T22:06:00.000Z'
});
assert.equal(handoff.decision, 'OPERATIONS_HANDOFF_ACCEPTED');
assert.equal(handoff.rollbackPlan.frontendCommitSha, PRODUCTION_RELEASE_CLOSURE_ROLLBACK_SHA);
assert.throws(() => createProductionOperationsHandoff(closure, { owner:'Abrar Ahmed', confirmation:false }), /confirmation/);
assert.equal(PRODUCTION_RELEASE_CLOSURE_PATCH, 'm3-production-release-closure-r1');
console.log('production release closure core tests passed');
