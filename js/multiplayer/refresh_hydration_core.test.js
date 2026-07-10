import assert from 'node:assert/strict';
import {
  createMultiplayerRefreshHydrationSeal,
  evaluateMultiplayerRefreshHydration,
  MULTIPLAYER_REFRESH_HYDRATION_BUILD,
  MULTIPLAYER_REFRESH_HYDRATION_MAX_TIMEOUT_MS,
  MULTIPLAYER_REFRESH_HYDRATION_MIN_TIMEOUT_MS,
  MULTIPLAYER_REFRESH_HYDRATION_PATCH,
  MULTIPLAYER_REFRESH_HYDRATION_PROTOCOL,
  MULTIPLAYER_REFRESH_HYDRATION_TIMEOUT_MS
} from './refresh_hydration_core.js';

assert.equal(MULTIPLAYER_REFRESH_HYDRATION_PATCH, 'm3-suspend-resilience-seal-r1');
assert.equal(MULTIPLAYER_REFRESH_HYDRATION_PROTOCOL, 6);
assert.equal(MULTIPLAYER_REFRESH_HYDRATION_BUILD, 'm3-team-final-world-reconnect-r3');
assert.equal(MULTIPLAYER_REFRESH_HYDRATION_TIMEOUT_MS, 10000);

const startedAt = 250000;
const seal = createMultiplayerRefreshHydrationSeal({
  roomCode: 'abc234',
  runId: 'run-55',
  authorityEpoch: 9,
  checkpointExpected: true,
  startedAt
});
assert.equal(seal.roomCode, 'ABC234');
assert.equal(seal.deadlineAt, startedAt + 10000);

const applying = evaluateMultiplayerRefreshHydration({
  seal,
  now: startedAt + 100,
  connected: true,
  runActive: true,
  runId: 'run-55',
  authorityEpoch: 9
});
assert.equal(applying.status, 'APPLYING');
assert.equal(applying.final, false);

const sealed = evaluateMultiplayerRefreshHydration({
  seal,
  now: startedAt + 500,
  connected: true,
  runActive: true,
  runId: 'run-55',
  authorityEpoch: 9,
  finalized: true,
  checkpointApplied: true
});
assert.equal(sealed.status, 'SEALED');
assert.equal(sealed.health, 'PASS');
assert.equal(sealed.continuity, 'CHECKPOINT_APPLIED');

const missingCheckpoint = evaluateMultiplayerRefreshHydration({
  seal,
  now: startedAt + 500,
  connected: true,
  runActive: true,
  runId: 'run-55',
  authorityEpoch: 9,
  finalized: true,
  checkpointApplied: false
});
assert.equal(missingCheckpoint.status, 'FAILED');
assert.equal(missingCheckpoint.reason, 'refresh-hydration-checkpoint-missing');

const runMismatch = evaluateMultiplayerRefreshHydration({
  seal,
  now: startedAt + 500,
  connected: true,
  runActive: true,
  runId: 'run-other',
  authorityEpoch: 9
});
assert.equal(runMismatch.status, 'FAILED');
assert.equal(runMismatch.reason, 'refresh-hydration-run-mismatch');

const epochRegression = evaluateMultiplayerRefreshHydration({
  seal,
  now: startedAt + 500,
  connected: true,
  runActive: true,
  runId: 'run-55',
  authorityEpoch: 8,
  finalized: true,
  checkpointApplied: true
});
assert.equal(epochRegression.status, 'FAILED');
assert.equal(epochRegression.reason, 'refresh-hydration-authority-regression');

const timedOut = evaluateMultiplayerRefreshHydration({
  seal,
  now: seal.deadlineAt,
  connected: true,
  runActive: true,
  runId: 'run-55',
  authorityEpoch: 9
});
assert.equal(timedOut.status, 'TIMED_OUT');
assert.equal(timedOut.reason, 'refresh-hydration-finalize-timeout');

const noCheckpointSeal = createMultiplayerRefreshHydrationSeal({
  roomCode: 'ABC234',
  runId: 'run-56',
  authorityEpoch: 10,
  checkpointExpected: false,
  startedAt
});
const runtimeSealed = evaluateMultiplayerRefreshHydration({
  seal: noCheckpointSeal,
  now: startedAt + 300,
  connected: true,
  runActive: true,
  runId: 'run-56',
  authorityEpoch: 10,
  finalized: true,
  checkpointApplied: false
});
assert.equal(runtimeSealed.status, 'SEALED');
assert.equal(runtimeSealed.continuity, 'RUNTIME_FINALIZED');

const minimum = createMultiplayerRefreshHydrationSeal({
  roomCode: 'ABC234', runId: 'run-a', startedAt, timeoutMs: 1
});
assert.equal(minimum.timeoutMs, MULTIPLAYER_REFRESH_HYDRATION_MIN_TIMEOUT_MS);
const maximum = createMultiplayerRefreshHydrationSeal({
  roomCode: 'ABC234', runId: 'run-b', startedAt, timeoutMs: 999999
});
assert.equal(maximum.timeoutMs, MULTIPLAYER_REFRESH_HYDRATION_MAX_TIMEOUT_MS);

assert.equal(createMultiplayerRefreshHydrationSeal({ roomCode: 'bad', runId: 'run' }), null);
assert.equal(createMultiplayerRefreshHydrationSeal({ roomCode: 'ABC234' }), null);
assert.equal(evaluateMultiplayerRefreshHydration({ seal: null }).status, 'INVALID');
console.log('refresh_hydration_core tests passed');
