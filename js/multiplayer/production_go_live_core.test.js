// js/multiplayer/production_go_live_core.test.js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA,
  PRODUCTION_GO_LIVE_BUILD,
  PRODUCTION_GO_LIVE_CERTIFIED_FRONTEND_SHA,
  PRODUCTION_GO_LIVE_FRONTEND_ORIGIN,
  PRODUCTION_GO_LIVE_PATCH,
  PRODUCTION_GO_LIVE_PROTOCOL,
  PRODUCTION_GO_LIVE_RELEASE_PATCH,
  PRODUCTION_GO_LIVE_ROLLBACK_FRONTEND_SHA,
  PRODUCTION_GO_LIVE_UI_READY_TEXT,
  canonicalProductionGoLiveJson,
  createExpectedProductionGoLiveManifest,
  createProductionGoLiveCertificate,
  evaluateProductionGoLiveEvidence
} from './production_go_live_core.js';

assert.equal(PRODUCTION_GO_LIVE_PATCH, 'm3-production-go-live-seal-r1');
assert.equal(PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA, '69761f9adc2c2a1143840f246093779da2cb2d6a');
assert.equal(PRODUCTION_GO_LIVE_ROLLBACK_FRONTEND_SHA, '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250');
assert.equal(PRODUCTION_GO_LIVE_PROTOCOL, 6);
assert.equal(PRODUCTION_GO_LIVE_BUILD, 'm3-team-final-world-reconnect-r3');

const manifest = createExpectedProductionGoLiveManifest();
const diagnostic = {
  schema: 1,
  milestone: 'M3.85-M3.86',
  patch: 'm3-public-deployment-acceptance-r1',
  consolidatedBaselineSha: '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250',
  checkedAt: '2026-07-10T12:00:00.000Z',
  pageUrl: `${PRODUCTION_GO_LIVE_FRONTEND_ORIGIN}/public-deployment-acceptance.html`,
  status: 'PASS',
  automatedReady: true,
  ready: true,
  frontend: {
    protocol: PRODUCTION_GO_LIVE_PROTOCOL,
    build: PRODUCTION_GO_LIVE_BUILD,
    patch: PRODUCTION_GO_LIVE_RELEASE_PATCH,
    certifiedSha: PRODUCTION_GO_LIVE_CERTIFIED_FRONTEND_SHA,
    releaseStatus: 'CERTIFIED'
  },
  worker: {
    protocol: PRODUCTION_GO_LIVE_PROTOCOL,
    build: PRODUCTION_GO_LIVE_BUILD,
    patch: PRODUCTION_GO_LIVE_RELEASE_PATCH,
    certifiedSha: PRODUCTION_GO_LIVE_CERTIFIED_FRONTEND_SHA,
    releaseStatus: 'CERTIFIED'
  },
  runtime: {
    audit: 'pass',
    restrictedGlobals: [],
    uiStatusText: PRODUCTION_GO_LIVE_UI_READY_TEXT,
    gameBuild: PRODUCTION_GO_LIVE_BUILD,
    gamePatch: PRODUCTION_GO_LIVE_RELEASE_PATCH
  },
  twoClientProof: {
    createJoin: true,
    shortRun: true,
    leaveRejoin: true,
    roomCode: 'AB23CD'
  },
  errors: [],
  warnings: ['WORKER_DEPLOYED_AT_MISSING'],
  pending: []
};

const approved = evaluateProductionGoLiveEvidence({
  manifest,
  diagnostic,
  nowMs: Date.parse('2026-07-10T13:00:00.000Z')
});
assert.equal(approved.status, 'APPROVED');
assert.equal(approved.ready, true);
assert.equal(approved.errors.length, 0);
assert.equal(approved.warnings.length, 1);

assert.equal(
  canonicalProductionGoLiveJson({ z: 1, a: { y: 2, b: 3 } }),
  '{"a":{"b":3,"y":2},"z":1}'
);
const sourceDigest = createHash('sha256')
  .update(canonicalProductionGoLiveJson(diagnostic))
  .digest('hex');
const certificate = createProductionGoLiveCertificate(approved, diagnostic, {
  approvedBy: 'Release Operator',
  approvalConfirmed: true,
  createdAt: '2026-07-10T13:01:00.000Z',
  sourceDiagnosticSha256: sourceDigest,
  notes: 'Public two-client proof accepted.'
});
assert.equal(certificate.decision, 'GO_LIVE_APPROVED');
assert.equal(certificate.sourceDiagnosticSha256, sourceDigest);
assert.equal(certificate.deployment.frontendCommitSha, PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA);
assert.equal(certificate.rollbackAuthorization.frontendCommitSha, PRODUCTION_GO_LIVE_ROLLBACK_FRONTEND_SHA);
assert.equal(certificate.sourceEvidence.roomCode, 'AB23CD');

assert.throws(() => createProductionGoLiveCertificate(approved, diagnostic, {
  approvedBy: 'Release Operator',
  approvalConfirmed: false,
  sourceDiagnosticSha256: sourceDigest
}), /Explicit release approval/);

const stale = evaluateProductionGoLiveEvidence({
  manifest,
  diagnostic: { ...diagnostic, checkedAt: '2026-07-08T12:00:00.000Z' },
  nowMs: Date.parse('2026-07-10T13:00:00.000Z')
});
assert.equal(stale.status, 'BLOCKED');
assert.ok(stale.errors.some((item) => item.code === 'SOURCE_EVIDENCE_STALE'));

const wrongOrigin = evaluateProductionGoLiveEvidence({
  manifest,
  diagnostic: { ...diagnostic, pageUrl: 'https://preview.example/public-deployment-acceptance.html' },
  nowMs: Date.parse('2026-07-10T13:00:00.000Z')
});
assert.ok(wrongOrigin.errors.some((item) => item.code === 'SOURCE_PAGE_ORIGIN_MISMATCH'));

const debugMode = evaluateProductionGoLiveEvidence({
  manifest,
  diagnostic: { ...diagnostic, pageUrl: `${PRODUCTION_GO_LIVE_FRONTEND_ORIGIN}/public-deployment-acceptance.html?mpDebug=1` },
  nowMs: Date.parse('2026-07-10T13:00:00.000Z')
});
assert.ok(debugMode.errors.some((item) => item.code === 'SOURCE_DEBUG_MODE_ACTIVE'));

const incomplete = evaluateProductionGoLiveEvidence({
  manifest,
  diagnostic: {
    ...diagnostic,
    twoClientProof: { ...diagnostic.twoClientProof, leaveRejoin: false, roomCode: '' },
    pending: ['MANUAL_LEAVE_REJOIN_PENDING']
  },
  nowMs: Date.parse('2026-07-10T13:00:00.000Z')
});
assert.equal(incomplete.status, 'BLOCKED');
assert.ok(incomplete.errors.some((item) => item.code === 'TWO_CLIENT_LEAVE_REJOIN_MISSING'));
assert.ok(incomplete.errors.some((item) => item.code === 'TWO_CLIENT_ROOM_CODE_INVALID'));
assert.ok(incomplete.errors.some((item) => item.code === 'SOURCE_PENDING_PRESENT'));

const exposed = evaluateProductionGoLiveEvidence({
  manifest,
  diagnostic: {
    ...diagnostic,
    runtime: { ...diagnostic.runtime, restrictedGlobals: ['KHADIJA_MULTIPLAYER_FINAL_CERTIFICATION'] }
  },
  nowMs: Date.parse('2026-07-10T13:00:00.000Z')
});
assert.ok(exposed.errors.some((item) => item.code === 'RUNTIME_DEBUG_GLOBALS_EXPOSED'));

console.log('M3.87-M3.88 production go-live core tests passed.');
