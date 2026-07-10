import assert from 'node:assert/strict';
import {
  createMultiplayerRefreshWatchdog,
  evaluateMultiplayerRefreshWatchdog,
  MULTIPLAYER_REFRESH_WATCHDOG_BUILD,
  MULTIPLAYER_REFRESH_WATCHDOG_MAX_TIMEOUT_MS,
  MULTIPLAYER_REFRESH_WATCHDOG_MIN_TIMEOUT_MS,
  MULTIPLAYER_REFRESH_WATCHDOG_PATCH,
  MULTIPLAYER_REFRESH_WATCHDOG_PROTOCOL,
  MULTIPLAYER_REFRESH_WATCHDOG_TIMEOUT_MS
} from './refresh_watchdog_core.js';

assert.equal(MULTIPLAYER_REFRESH_WATCHDOG_PATCH, 'm3-refresh-run-proof-r1');
assert.equal(MULTIPLAYER_REFRESH_WATCHDOG_PROTOCOL, 6);
assert.equal(MULTIPLAYER_REFRESH_WATCHDOG_BUILD, 'm3-team-final-world-reconnect-r3');
assert.equal(MULTIPLAYER_REFRESH_WATCHDOG_TIMEOUT_MS, 15000);

const startedAt = 100000;
const watchdog = createMultiplayerRefreshWatchdog({
  roomCode: 'abc234',
  startedAt
});
assert.equal(watchdog.roomCode, 'ABC234');
assert.equal(watchdog.deadlineAt, startedAt + 15000);

const connecting = evaluateMultiplayerRefreshWatchdog({
  watchdog,
  now: startedAt + 500
});
assert.equal(connecting.status, 'CONNECTING');
assert.equal(connecting.health, 'WARN');
assert.equal(connecting.final, false);

const runRestored = evaluateMultiplayerRefreshWatchdog({
  watchdog,
  now: startedAt + 900,
  connected: true,
  roomCode: 'ABC234',
  roomStatus: 'in-run'
});
assert.equal(runRestored.status, 'RESTORED');
assert.equal(runRestored.health, 'PASS');
assert.equal(runRestored.continuity, 'RUN_RESTORED');
assert.equal(runRestored.reason, 'active-run-continuity-restored');

const roomRestored = evaluateMultiplayerRefreshWatchdog({
  watchdog,
  now: startedAt + 900,
  connected: true,
  roomCode: 'ABC234',
  roomStatus: 'lobby'
});
assert.equal(roomRestored.continuity, 'ROOM_RESTORED');

const mismatch = evaluateMultiplayerRefreshWatchdog({
  watchdog,
  now: startedAt + 900,
  connected: true,
  roomCode: 'DEF567',
  roomStatus: 'lobby'
});
assert.equal(mismatch.status, 'FAILED');
assert.equal(mismatch.reason, 'refresh-resume-room-mismatch');

const rejected = evaluateMultiplayerRefreshWatchdog({
  watchdog,
  now: startedAt + 1200,
  error: 'room no longer exists'
});
assert.equal(rejected.status, 'FAILED');
assert.equal(rejected.reason, 'room no longer exists');

const timedOut = evaluateMultiplayerRefreshWatchdog({
  watchdog,
  now: watchdog.deadlineAt
});
assert.equal(timedOut.status, 'TIMED_OUT');
assert.equal(timedOut.reason, 'refresh-resume-welcome-timeout');
assert.equal(timedOut.remainingMs, 0);

const minimum = createMultiplayerRefreshWatchdog({
  roomCode: 'ABC234',
  startedAt,
  timeoutMs: 1
});
assert.equal(minimum.timeoutMs, MULTIPLAYER_REFRESH_WATCHDOG_MIN_TIMEOUT_MS);

const maximum = createMultiplayerRefreshWatchdog({
  roomCode: 'ABC234',
  startedAt,
  timeoutMs: 999999
});
assert.equal(maximum.timeoutMs, MULTIPLAYER_REFRESH_WATCHDOG_MAX_TIMEOUT_MS);

assert.equal(createMultiplayerRefreshWatchdog({ roomCode: 'bad' }), null);
assert.equal(evaluateMultiplayerRefreshWatchdog({ watchdog: null }).status, 'INVALID');

console.log('refresh_watchdog_core tests passed');
