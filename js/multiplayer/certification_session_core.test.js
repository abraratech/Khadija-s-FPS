// js/multiplayer/certification_session_core.test.js
import assert from 'node:assert/strict';
import {
  MULTIPLAYER_CERTIFICATION_SCENARIOS,
  MULTIPLAYER_CERTIFICATION_SESSION_PATCH,
  MULTIPLAYER_CERTIFICATION_SESSION_PROTOCOL,
  buildMultiplayerCertificationEvidence,
  createMultiplayerCertificationSession,
  evaluateMultiplayerCertificationSession,
  recordMultiplayerCertificationSample,
  recordMultiplayerCertificationScenario,
  setMultiplayerCertificationRunState
} from './certification_session_core.js';

assert.equal(
  MULTIPLAYER_CERTIFICATION_SESSION_PATCH,
  'm3-final-certification-seal-r1'
);
assert.equal(MULTIPLAYER_CERTIFICATION_SESSION_PROTOCOL, 6);
assert.equal(MULTIPLAYER_CERTIFICATION_SCENARIOS.length, 10);

let state = createMultiplayerCertificationSession({
  targetMs: 120000,
  startedAt: 1000,
  running: true
});
state = setMultiplayerCertificationRunState(state, {
  running: true,
  at: 1000,
  reason: 'test-start'
});

for (let index = 0; index < 60; index += 1) {
  state = recordMultiplayerCertificationSample(state, {
    at: 2000 + index * 1000,
    deltaMs: 1000,
    releaseCandidateStatus: 'PASS',
    soakStatus: 'RUNNING',
    recoveryStatus: 'PASS',
    tabRecoveryStatus: 'SEALED',
    tabRecoveryContinuity: 'ACTIVE_OWNER',
    epochFenceStatus: 'SEALED'
  });
}

for (const scenario of MULTIPLAYER_CERTIFICATION_SCENARIOS) {
  state = recordMultiplayerCertificationScenario(state, {
    key: scenario.key,
    status: 'PASS',
    note: 'verified',
    at: 70000
  });
}

let result = evaluateMultiplayerCertificationSession(state);
assert.equal(result.status, 'RUNNING');
assert.equal(result.scenarioSummary.passed, 10);
assert.equal(result.sampleCount, 60);

state = setMultiplayerCertificationRunState(state, {
  running: false,
  complete: true,
  at: 130000,
  reason: 'test-finalize'
});
result = evaluateMultiplayerCertificationSession(state, { final: true });
assert.equal(result.status, 'WARN');
assert.equal(
  result.warnings.some((entry) => entry.code === 'TARGET_NOT_REACHED'),
  true
);

let failed = createMultiplayerCertificationSession({
  startedAt: 1000,
  running: true
});
failed = recordMultiplayerCertificationSample(failed, {
  at: 2000,
  deltaMs: 1000,
  releaseCandidateStatus: 'FAIL',
  tabRecoveryStatus: 'FAILED',
  tabRecoveryContinuity: 'RECOVERY_CONTRADICTION',
  epochFenceStatus: 'VIOLATION'
});
const failedResult = evaluateMultiplayerCertificationSession(failed);
assert.equal(failedResult.status, 'FAIL');
assert.equal(failedResult.errors.length > 0, true);

const evidence = buildMultiplayerCertificationEvidence(state, result);
assert.equal(evidence.milestone, 'M3.73-M3.74');
assert.equal(evidence.scenarios.twoClientRoom.status, 'PASS');

console.log('certification_session_core tests passed');
