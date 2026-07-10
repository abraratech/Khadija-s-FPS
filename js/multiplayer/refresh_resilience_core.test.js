// js/multiplayer/refresh_resilience_core.test.js
import assert from 'node:assert/strict';
import {
  evaluateMultiplayerRefreshResilience,
  MULTIPLAYER_REFRESH_RESILIENCE_PATCH,
  MULTIPLAYER_REFRESH_RESILIENCE_PROTOCOL
} from './refresh_resilience_core.js';

assert.equal(
  MULTIPLAYER_REFRESH_RESILIENCE_PATCH,
  'm3-tab-recovery-seal-r1'
);
assert.equal(MULTIPLAYER_REFRESH_RESILIENCE_PROTOCOL, 6);

const recovering = evaluateMultiplayerRefreshResilience({
  readiness: {
    status: 'BLOCKED',
    health: 'WARN',
    blocking: true,
    final: false,
    runId: 'run-53',
    roomCode: 'ABCD23',
    authorityEpoch: 11
  },
  now: 1000
});
assert.equal(recovering.status, 'RECOVERING');
assert.equal(recovering.blocking, true);
assert.equal(recovering.sealed, false);

const sealedRun = evaluateMultiplayerRefreshResilience({
  readiness: {
    status: 'READY',
    health: 'PASS',
    blocking: false,
    final: true,
    runId: 'run-53',
    roomCode: 'ABCD23',
    authorityEpoch: 11
  },
  recovery: {
    status: 'RECOVERED',
    health: '',
    blocking: false,
    canRetry: false,
    retryCount: 0,
    final: true,
    runId: 'run-53',
    roomCode: 'ABCD23',
    authorityEpoch: 11
  },
  resumeIntentPresent: false,
  recoveryIntentPresent: false,
  now: 1100
});
assert.equal(sealedRun.status, 'SEALED');
assert.equal(sealedRun.health, 'PASS');
assert.equal(sealedRun.continuity, 'RUN_RECOVERED');
assert.equal(sealedRun.sealed, true);

const prompt = evaluateMultiplayerRefreshResilience({
  readiness: {
    status: 'TIMED_OUT',
    health: 'FAIL',
    blocking: true,
    final: true,
    runId: 'run-53',
    roomCode: 'ABCD23',
    authorityEpoch: 11
  },
  recovery: {
    status: 'PROMPT',
    canRetry: true,
    retryCount: 0,
    final: false,
    runId: 'run-53',
    roomCode: 'ABCD23',
    authorityEpoch: 11
  },
  recoveryIntentPresent: true,
  now: 1200
});
assert.equal(prompt.status, 'RECOVERY_REQUIRED');
assert.equal(prompt.health, 'WARN');
assert.equal(prompt.blocking, true);

const retrying = evaluateMultiplayerRefreshResilience({
  readiness: {
    status: 'TIMED_OUT',
    health: 'FAIL',
    blocking: true,
    final: true,
    runId: 'run-53',
    roomCode: 'ABCD23',
    authorityEpoch: 11
  },
  recovery: {
    status: 'RETRYING',
    canRetry: false,
    retryCount: 1,
    final: false,
    runId: 'run-53',
    roomCode: 'ABCD23',
    authorityEpoch: 11
  },
  resumeIntentPresent: true,
  recoveryIntentPresent: true,
  now: 1300
});
assert.equal(retrying.status, 'RETRYING');
assert.equal(retrying.health, 'WARN');

const sealedEscape = evaluateMultiplayerRefreshResilience({
  recovery: {
    status: 'ESCAPED',
    canRetry: false,
    retryCount: 1,
    final: true,
    runId: 'run-53',
    roomCode: 'ABCD23',
    authorityEpoch: 11
  },
  resumeIntentPresent: false,
  recoveryIntentPresent: false,
  now: 1400
});
assert.equal(sealedEscape.status, 'SEALED');
assert.equal(sealedEscape.continuity, 'LOBBY_ESCAPE');
assert.equal(sealedEscape.sealed, true);

const badReady = evaluateMultiplayerRefreshResilience({
  readiness: {
    status: 'READY',
    health: 'PASS',
    blocking: true,
    final: true
  },
  now: 1500
});
assert.equal(badReady.status, 'FAILED');
assert.equal(badReady.reason, 'refresh-resilience-ready-still-blocked');

const badEscape = evaluateMultiplayerRefreshResilience({
  recovery: {
    status: 'ESCAPED',
    final: true
  },
  resumeIntentPresent: true,
  now: 1600
});
assert.equal(badEscape.status, 'FAILED');
assert.equal(badEscape.reason, 'refresh-resilience-escape-retained-intent');

const mismatch = evaluateMultiplayerRefreshResilience({
  readiness: {
    status: 'BLOCKED',
    health: 'WARN',
    blocking: true,
    runId: 'run-a',
    roomCode: 'ABCD23'
  },
  recovery: {
    status: 'PROMPT',
    canRetry: true,
    runId: 'run-b',
    roomCode: 'ABCD23'
  },
  now: 1700
});
assert.equal(mismatch.status, 'FAILED');
assert.equal(mismatch.reason, 'refresh-resilience-run-mismatch');

console.log('refresh_resilience_core tests passed');
