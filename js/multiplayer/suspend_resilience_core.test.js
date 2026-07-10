// js/multiplayer/suspend_resilience_core.test.js
import assert from 'node:assert/strict';
import {
  evaluateMultiplayerSuspendResilience,
  MULTIPLAYER_SUSPEND_RESILIENCE_PATCH,
  MULTIPLAYER_SUSPEND_RESILIENCE_PROTOCOL
} from './suspend_resilience_core.js';

assert.equal(
  MULTIPLAYER_SUSPEND_RESILIENCE_PATCH,
  'm3-production-release-manifest-r1'
);
assert.equal(MULTIPLAYER_SUSPEND_RESILIENCE_PROTOCOL, 6);

const healthyProbe = {
  status: 'HEALTHY',
  health: 'PASS',
  reason: 'suspend-wake-probe-pong-confirmed',
  action: 'CONTINUE',
  blocking: false,
  final: true,
  checkedAt: 1200
};

const live = evaluateMultiplayerSuspendResilience({
  guard: {
    status: 'RESUMED_LIVE',
    health: 'PASS',
    reason: 'suspend-wake-probe-pong-confirmed',
    action: 'CONTINUE',
    blocking: false,
    final: true,
    wakeProbe: healthyProbe
  },
  probe: healthyProbe,
  incidentStored: false,
  now: 1300
});
assert.equal(live.status, 'SEALED');
assert.equal(live.health, 'PASS');
assert.equal(live.continuity, 'LIVE_SOCKET');
assert.equal(live.blocking, false);
assert.equal(live.sealed, true);

const armed = evaluateMultiplayerSuspendResilience({
  guard: {
    status: 'ARMED',
    health: 'PASS',
    reason: 'suspend-resume-refresh-armed',
    action: 'RELOAD',
    blocking: true,
    final: true
  },
  probe: {
    status: 'STALE',
    health: 'FAIL',
    reason: 'suspend-wake-probe-timeout',
    action: 'REFRESH',
    blocking: true,
    final: true
  },
  incidentStored: true,
  now: 1400
});
assert.equal(armed.status, 'SEALED');
assert.equal(armed.continuity, 'SAFE_REFRESH_ARMED');
assert.equal(armed.blocking, true);

const handoff = evaluateMultiplayerSuspendResilience({
  guard: {
    status: 'HANDOFF',
    health: 'PASS',
    reason: 'suspend-resume-refresh-handoff-active',
    action: 'NONE',
    blocking: false,
    final: false
  },
  handoffActive: true,
  incidentStored: false,
  now: 1500
});
assert.equal(handoff.status, 'SEALED');
assert.equal(handoff.continuity, 'SAFE_REFRESH_HANDOFF');
assert.equal(handoff.blocking, false);

const waiting = evaluateMultiplayerSuspendResilience({
  guard: {
    status: 'WAITING_ONLINE',
    health: 'WARN',
    action: 'WAIT_ONLINE',
    blocking: true,
    final: false
  },
  probe: {
    status: 'WAITING_ONLINE',
    health: 'WARN',
    action: 'WAIT_ONLINE',
    blocking: true,
    final: false
  },
  now: 1600
});
assert.equal(waiting.status, 'RECOVERING');
assert.equal(waiting.health, 'WARN');
assert.equal(waiting.final, false);

const liveContradiction = evaluateMultiplayerSuspendResilience({
  guard: {
    status: 'RESUMED_LIVE',
    health: 'PASS',
    action: 'CONTINUE',
    blocking: true,
    final: true,
    wakeProbe: healthyProbe
  },
  probe: healthyProbe,
  now: 1700
});
assert.equal(liveContradiction.status, 'FAILED');
assert.equal(
  liveContradiction.continuity,
  'RESILIENCE_CONTRADICTION'
);

const handoffContradiction = evaluateMultiplayerSuspendResilience({
  guard: {
    status: 'HANDOFF',
    health: 'PASS',
    action: 'NONE',
    blocking: false,
    final: false
  },
  handoffActive: true,
  incidentStored: true,
  now: 1800
});
assert.equal(handoffContradiction.status, 'FAILED');
assert.equal(
  handoffContradiction.reason,
  'suspend-resilience-handoff-retained-incident'
);

const runtimeFailure = evaluateMultiplayerSuspendResilience({
  guard: {
    status: 'ARM_FAILED',
    health: 'FAIL',
    reason: 'suspend-resume-refresh-arm-failed',
    action: 'NONE',
    blocking: true,
    final: true
  },
  now: 1900
});
assert.equal(runtimeFailure.status, 'FAILED');
assert.equal(runtimeFailure.health, 'FAIL');

console.log('suspend_resilience_core tests passed');
