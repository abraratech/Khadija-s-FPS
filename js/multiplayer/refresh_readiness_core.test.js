// js/multiplayer/refresh_readiness_core.test.js
import assert from 'node:assert/strict';
import {
  createMultiplayerRefreshReadinessGate,
  evaluateMultiplayerRefreshReadiness,
  MULTIPLAYER_REFRESH_READINESS_PATCH,
  MULTIPLAYER_REFRESH_READINESS_PROTOCOL
} from './refresh_readiness_core.js';

assert.equal(
  MULTIPLAYER_REFRESH_READINESS_PATCH,
  'm3-suspend-resilience-seal-r1'
);
assert.equal(MULTIPLAYER_REFRESH_READINESS_PROTOCOL, 6);

const gate = createMultiplayerRefreshReadinessGate({
  roomCode: 'ABCD23',
  runId: 'run-49',
  authorityEpoch: 7,
  checkpointExpected: true,
  startedAt: 1000,
  timeoutMs: 5000
});

assert.ok(gate);
assert.equal(gate.runId, 'run-49');
assert.equal(gate.authorityEpoch, 7);

const blocked = evaluateMultiplayerRefreshReadiness({
  gate,
  now: 1200,
  connected: true,
  runActive: true,
  runId: 'run-49',
  authorityEpoch: 7
});
assert.equal(blocked.status, 'BLOCKED');
assert.equal(blocked.blocking, true);
assert.equal(blocked.final, false);

const ready = evaluateMultiplayerRefreshReadiness({
  gate,
  now: 1400,
  connected: true,
  runActive: true,
  runId: 'run-49',
  authorityEpoch: 7,
  hydration: {
    status: 'SEALED',
    health: 'PASS',
    reason: 'refresh-checkpoint-hydration-sealed',
    continuity: 'CHECKPOINT_APPLIED',
    runId: 'run-49',
    authorityEpoch: 7,
    checkpointExpected: true,
    final: true
  },
  worldReady: true,
  localStateReady: true
});
assert.equal(ready.status, 'READY');
assert.equal(ready.health, 'PASS');
assert.equal(ready.continuity, 'GAMEPLAY_READY');
assert.equal(ready.blocking, false);
assert.equal(ready.final, true);

const runMismatch = evaluateMultiplayerRefreshReadiness({
  gate,
  now: 1500,
  connected: true,
  runActive: true,
  runId: 'wrong-run',
  authorityEpoch: 7
});
assert.equal(runMismatch.status, 'FAILED');
assert.equal(runMismatch.reason, 'refresh-readiness-run-mismatch');
assert.equal(runMismatch.blocking, true);

const hydrationFailure = evaluateMultiplayerRefreshReadiness({
  gate,
  now: 1600,
  connected: true,
  runActive: true,
  runId: 'run-49',
  authorityEpoch: 7,
  hydration: {
    status: 'FAILED',
    health: 'FAIL',
    reason: 'refresh-hydration-checkpoint-missing',
    runId: 'run-49',
    authorityEpoch: 7,
    final: true
  }
});
assert.equal(hydrationFailure.status, 'FAILED');
assert.equal(
  hydrationFailure.reason,
  'refresh-hydration-checkpoint-missing'
);

const timedOut = evaluateMultiplayerRefreshReadiness({
  gate,
  now: 7001,
  connected: true,
  runActive: true,
  runId: 'run-49',
  authorityEpoch: 7
});
assert.equal(timedOut.status, 'TIMED_OUT');
assert.equal(timedOut.blocking, true);
assert.equal(timedOut.final, true);

assert.equal(
  createMultiplayerRefreshReadinessGate({
    roomCode: 'bad',
    runId: 'run-49'
  }),
  null
);

console.log('refresh_readiness_core tests passed');
