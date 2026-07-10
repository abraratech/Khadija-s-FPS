import assert from 'node:assert/strict';
import {
  MULTIPLAYER_RELEASE_CANDIDATE_BUILD,
  MULTIPLAYER_RELEASE_CANDIDATE_PATCH,
  MULTIPLAYER_RELEASE_CANDIDATE_PROTOCOL,
  RELEASE_CANDIDATE_CHECKLIST,
  evaluateMultiplayerReleaseCandidate,
  normalizeReleaseCandidateChecklist
} from './release_candidate_core.js';

const completeChecklist = Object.fromEntries(
  RELEASE_CANDIDATE_CHECKLIST.map(({ key }) => [key, true])
);

const healthyInput = {
  protocolVersion: MULTIPLAYER_RELEASE_CANDIDATE_PROTOCOL,
  build: MULTIPLAYER_RELEASE_CANDIDATE_BUILD,
  patch: MULTIPLAYER_RELEASE_CANDIDATE_PATCH,
  releaseGuard: {
    policy: { allowed: true },
    gate: { status: 'WARN', errors: [], warnings: ['Loopback debug mode is intentionally enabled.'] }
  },
  recoveryCertification: { result: { status: 'PASS' } },
  session: { mode: 'host', run: { active: true } },
  transport: { mode: 'online', state: 'connected' },
  lobby: { connected: true, room: { players: [{ playerId: 'a' }, { playerId: 'b' }] } },
  runtime: {
    authorityEpoch: 2,
    reconciliation: { status: 'SYNCED', awaitingStreams: [] },
    faultSimulation: { active: false, queuedPackets: 0, config: { enabled: false } },
    metrics: { authorityMigrations: 1 }
  },
  hostMigration: { authorityEpoch: 2 },
  checklist: completeChecklist,
  environment: { loopback: true, debugAllowed: true }
};

const healthy = evaluateMultiplayerReleaseCandidate(healthyInput);
assert.equal(healthy.status, 'PASS');
assert.equal(healthy.summary.completedManualChecks, RELEASE_CANDIDATE_CHECKLIST.length);
assert.equal(healthy.summary.workerHandshakePassed, true);

const incomplete = evaluateMultiplayerReleaseCandidate({
  ...healthyInput,
  checklist: { twoClientsConnected: true }
});
assert.equal(incomplete.status, 'WARN');
assert.ok(incomplete.warnings.some((entry) => entry.code === 'MANUAL_CHECKLIST_INCOMPLETE'));

const mismatch = evaluateMultiplayerReleaseCandidate({
  ...healthyInput,
  protocolVersion: 5,
  build: 'wrong-build',
  patch: 'wrong-patch'
});
assert.equal(mismatch.status, 'FAIL');
assert.ok(mismatch.errors.length >= 3);

const guardFailure = evaluateMultiplayerReleaseCandidate({
  ...healthyInput,
  releaseGuard: { gate: { status: 'FAIL', errors: ['debug surface exposed'] } }
});
assert.equal(guardFailure.status, 'FAIL');
assert.ok(guardFailure.errors.some((entry) => entry.code === 'RELEASE_GUARD_FAILED'));

const dirtyFaults = evaluateMultiplayerReleaseCandidate({
  ...healthyInput,
  runtime: {
    ...healthyInput.runtime,
    faultSimulation: { active: true, queuedPackets: 3, config: { enabled: true } }
  }
});
assert.equal(dirtyFaults.status, 'FAIL');
assert.ok(dirtyFaults.errors.some((entry) => entry.code === 'FAULT_SIMULATION_NOT_CLEAN'));

const recovering = evaluateMultiplayerReleaseCandidate({
  ...healthyInput,
  runtime: {
    ...healthyInput.runtime,
    reconciliation: { status: 'RECOVERING', awaitingStreams: ['world', 'economy'] }
  }
});
assert.equal(recovering.status, 'FAIL');
assert.ok(recovering.errors.some((entry) => entry.code === 'AUTHORITATIVE_RECOVERY_INCOMPLETE'));

const normalized = normalizeReleaseCandidateChecklist({ twoClientsConnected: 1, hostMigration: true });
assert.equal(normalized.twoClientsConnected, false);
assert.equal(normalized.hostMigration, true);
assert.equal(Object.keys(normalized).length, RELEASE_CANDIDATE_CHECKLIST.length);

console.log('M3.31-M3.32 release candidate core tests passed.');
