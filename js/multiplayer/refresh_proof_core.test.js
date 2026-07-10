import assert from 'node:assert/strict';
import {
  createMultiplayerRefreshRunProof,
  evaluateMultiplayerRefreshRunProof,
  MULTIPLAYER_REFRESH_PROOF_BUILD,
  MULTIPLAYER_REFRESH_PROOF_MAX_TIMEOUT_MS,
  MULTIPLAYER_REFRESH_PROOF_MIN_TIMEOUT_MS,
  MULTIPLAYER_REFRESH_PROOF_PATCH,
  MULTIPLAYER_REFRESH_PROOF_PROTOCOL,
  MULTIPLAYER_REFRESH_PROOF_TIMEOUT_MS
} from './refresh_proof_core.js';

assert.equal(MULTIPLAYER_REFRESH_PROOF_PATCH, 'm3-refresh-run-proof-r1');
assert.equal(MULTIPLAYER_REFRESH_PROOF_PROTOCOL, 6);
assert.equal(MULTIPLAYER_REFRESH_PROOF_BUILD, 'm3-team-final-world-reconnect-r3');
assert.equal(MULTIPLAYER_REFRESH_PROOF_TIMEOUT_MS, 8000);

const startedAt = 100000;
const runProof = createMultiplayerRefreshRunProof({
  roomCode: 'abc234',
  roomStatus: 'in-run',
  runId: 'run-42',
  authorityEpoch: 7,
  startedAt
});
assert.equal(runProof.roomCode, 'ABC234');
assert.equal(runProof.deadlineAt, startedAt + 8000);

const verifying = evaluateMultiplayerRefreshRunProof({
  proof: runProof,
  now: startedAt + 100,
  connected: true,
  roomCode: 'ABC234',
  roomStatus: 'in-run',
  runActive: false
});
assert.equal(verifying.status, 'VERIFYING');
assert.equal(verifying.final, false);

const restored = evaluateMultiplayerRefreshRunProof({
  proof: runProof,
  now: startedAt + 900,
  connected: true,
  roomCode: 'ABC234',
  roomStatus: 'in-run',
  runActive: true,
  runId: 'run-42',
  authorityEpoch: 7
});
assert.equal(restored.status, 'RESTORED');
assert.equal(restored.health, 'PASS');
assert.equal(restored.continuity, 'RUN_PROVED');

const epochWait = evaluateMultiplayerRefreshRunProof({
  proof: runProof,
  now: startedAt + 900,
  connected: true,
  roomCode: 'ABC234',
  roomStatus: 'in-run',
  runActive: true,
  runId: 'run-42',
  authorityEpoch: 6
});
assert.equal(epochWait.status, 'VERIFYING');

const runMismatch = evaluateMultiplayerRefreshRunProof({
  proof: runProof,
  now: startedAt + 900,
  connected: true,
  roomCode: 'ABC234',
  roomStatus: 'in-run',
  runActive: true,
  runId: 'run-other',
  authorityEpoch: 7
});
assert.equal(runMismatch.status, 'FAILED');
assert.equal(runMismatch.reason, 'refresh-proof-run-mismatch');

const roomMismatch = evaluateMultiplayerRefreshRunProof({
  proof: runProof,
  now: startedAt + 900,
  connected: true,
  roomCode: 'DEF567',
  roomStatus: 'in-run'
});
assert.equal(roomMismatch.status, 'FAILED');
assert.equal(roomMismatch.reason, 'refresh-proof-room-mismatch');

const runEnded = evaluateMultiplayerRefreshRunProof({
  proof: runProof,
  now: startedAt + 900,
  connected: true,
  roomCode: 'ABC234',
  roomStatus: 'lobby'
});
assert.equal(runEnded.status, 'DEGRADED');
assert.equal(runEnded.health, 'WARN');
assert.equal(runEnded.continuity, 'ROOM_ONLY');

const timedOut = evaluateMultiplayerRefreshRunProof({
  proof: runProof,
  now: runProof.deadlineAt,
  connected: true,
  roomCode: 'ABC234',
  roomStatus: 'in-run',
  runActive: false
});
assert.equal(timedOut.status, 'TIMED_OUT');
assert.equal(timedOut.reason, 'refresh-proof-local-run-timeout');

const lobbyProof = createMultiplayerRefreshRunProof({
  roomCode: 'ABC234',
  roomStatus: 'lobby',
  startedAt
});
const lobbyRestored = evaluateMultiplayerRefreshRunProof({
  proof: lobbyProof,
  now: startedAt + 10,
  connected: true,
  roomCode: 'ABC234',
  roomStatus: 'lobby'
});
assert.equal(lobbyRestored.status, 'RESTORED');
assert.equal(lobbyRestored.continuity, 'ROOM_PROVED');

const minimum = createMultiplayerRefreshRunProof({
  roomCode: 'ABC234', roomStatus: 'lobby', startedAt, timeoutMs: 1
});
assert.equal(minimum.timeoutMs, MULTIPLAYER_REFRESH_PROOF_MIN_TIMEOUT_MS);
const maximum = createMultiplayerRefreshRunProof({
  roomCode: 'ABC234', roomStatus: 'lobby', startedAt, timeoutMs: 999999
});
assert.equal(maximum.timeoutMs, MULTIPLAYER_REFRESH_PROOF_MAX_TIMEOUT_MS);

assert.equal(createMultiplayerRefreshRunProof({ roomCode: 'bad', roomStatus: 'lobby' }), null);
assert.equal(createMultiplayerRefreshRunProof({ roomCode: 'ABC234', roomStatus: 'in-run' }), null);
assert.equal(evaluateMultiplayerRefreshRunProof({ proof: null }).status, 'INVALID');
console.log('refresh_proof_core tests passed');
