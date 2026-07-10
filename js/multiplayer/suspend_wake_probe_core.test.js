// js/multiplayer/suspend_wake_probe_core.test.js
import assert from 'node:assert/strict';
import {
  createMultiplayerSuspendWakeProbe,
  evaluateMultiplayerSuspendWakeProbe,
  MULTIPLAYER_SUSPEND_WAKE_PROBE_PATCH,
  MULTIPLAYER_SUSPEND_WAKE_PROBE_PROTOCOL,
  MULTIPLAYER_SUSPEND_WAKE_PROBE_TIMEOUT_MS
} from './suspend_wake_probe_core.js';

assert.equal(
  MULTIPLAYER_SUSPEND_WAKE_PROBE_PATCH,
  'm3-production-release-manifest-r1'
);
assert.equal(MULTIPLAYER_SUSPEND_WAKE_PROBE_PROTOCOL, 6);
assert.equal(MULTIPLAYER_SUSPEND_WAKE_PROBE_TIMEOUT_MS, 2800);

const probe = createMultiplayerSuspendWakeProbe({
  incidentId: 'incident-57',
  runId: 'run-57',
  startedAt: 1000,
  timeoutMs: 2800
});
assert.ok(probe);

const probing = evaluateMultiplayerSuspendWakeProbe({
  probe,
  now: 1200,
  online: true,
  transportState: 'connected',
  networkQuality: {
    level: 'RECONNECTING',
    silenceMs: 18000,
    lastPongAt: 0,
    pendingPings: 1
  },
  pingIssued: true
});
assert.equal(probing.status, 'PROBING');
assert.equal(probing.action, 'POLL');
assert.equal(probing.blocking, true);

const healthyPong = evaluateMultiplayerSuspendWakeProbe({
  probe,
  now: 1450,
  online: true,
  transportState: 'connected',
  networkQuality: {
    level: 'GOOD',
    silenceMs: 40,
    lastPongAt: 1420,
    pendingPings: 0
  },
  pingIssued: true
});
assert.equal(healthyPong.status, 'HEALTHY');
assert.equal(healthyPong.action, 'CONTINUE');
assert.equal(healthyPong.blocking, false);

const healthyEnvelope = evaluateMultiplayerSuspendWakeProbe({
  probe,
  now: 1450,
  online: true,
  transportState: 'connected',
  networkQuality: {
    level: 'GOOD',
    silenceMs: 80,
    lastPongAt: 0,
    pendingPings: 1
  }
});
assert.equal(healthyEnvelope.status, 'HEALTHY');
assert.equal(
  healthyEnvelope.reason,
  'suspend-wake-probe-envelope-confirmed'
);

const waiting = evaluateMultiplayerSuspendWakeProbe({
  probe,
  now: 1500,
  online: false,
  transportState: 'connected'
});
assert.equal(waiting.status, 'WAITING_ONLINE');
assert.equal(waiting.action, 'WAIT_ONLINE');
assert.equal(waiting.final, false);

const staleTransport = evaluateMultiplayerSuspendWakeProbe({
  probe,
  now: 1600,
  online: true,
  transportState: 'error'
});
assert.equal(staleTransport.status, 'STALE');
assert.equal(staleTransport.action, 'REFRESH');

const timedOut = evaluateMultiplayerSuspendWakeProbe({
  probe,
  now: 3900,
  online: true,
  transportState: 'reconnecting',
  networkQuality: {
    silenceMs: 20000,
    lastPongAt: 0
  }
});
assert.equal(timedOut.status, 'STALE');
assert.equal(timedOut.reason, 'suspend-wake-probe-timeout');

assert.equal(
  createMultiplayerSuspendWakeProbe({
    incidentId: '',
    runId: 'run-57'
  }),
  null
);

console.log('suspend_wake_probe_core tests passed');
