import assert from 'node:assert/strict';
import {
  MULTIPLAYER_LAUNCH_OBSERVER_BUILD,
  MULTIPLAYER_LAUNCH_OBSERVER_PATCH,
  MULTIPLAYER_LAUNCH_OBSERVER_PROTOCOL,
  buildLaunchObserverFingerprint,
  diffLaunchObserverFingerprints,
  evaluateMultiplayerLaunchHealth
} from './launch_observer_core.js';

const healthyInput = {
  protocolVersion: MULTIPLAYER_LAUNCH_OBSERVER_PROTOCOL,
  build: MULTIPLAYER_LAUNCH_OBSERVER_BUILD,
  patch: MULTIPLAYER_LAUNCH_OBSERVER_PATCH,
  releaseGuard: {
    policy: { allowed: true },
    gate: { status: 'WARN', errors: [], warnings: ['Loopback debug mode enabled.'] }
  },
  releaseCandidate: { result: { status: 'PASS' } },
  recoveryCertification: { result: { status: 'PASS' } },
  session: { mode: 'host', run: { active: true } },
  transport: { mode: 'online', state: 'connected' },
  lobby: {
    connected: true,
    room: { code: 'ABCD', players: [{ playerId: 'a' }, { playerId: 'b' }] }
  },
  runtime: {
    authorityEpoch: 2,
    reconciliation: { status: 'SYNCED', awaitingStreams: [] },
    faultSimulation: { active: false, queuedPackets: 0, config: { enabled: false } }
  },
  hostMigration: { authorityEpoch: 2 },
  continuity: {
    authorityEpochRegressed: false,
    authorityEpochHighWater: 2,
    disconnectedForMs: 0,
    recoveringForMs: 0
  },
  environment: { loopback: true, debugAllowed: true }
};

const healthy = evaluateMultiplayerLaunchHealth(healthyInput);
assert.equal(healthy.status, 'PASS');
assert.equal(healthy.summary.playerCount, 2);
assert.equal(healthy.summary.handshakePassed, true);

const reconnecting = evaluateMultiplayerLaunchHealth({
  ...healthyInput,
  transport: { mode: 'online', state: 'reconnecting' },
  continuity: { ...healthyInput.continuity, disconnectedForMs: 4000 }
});
assert.equal(reconnecting.status, 'WARN');
assert.ok(reconnecting.warnings.some((entry) => entry.code === 'ACTIVE_RUN_RECONNECTING'));

const disconnected = evaluateMultiplayerLaunchHealth({
  ...healthyInput,
  transport: { mode: 'online', state: 'disconnected' },
  continuity: { ...healthyInput.continuity, disconnectedForMs: 13000 }
});
assert.equal(disconnected.status, 'FAIL');
assert.ok(disconnected.errors.some((entry) => entry.code === 'ACTIVE_RUN_DISCONNECTED'));

const stalledRecovery = evaluateMultiplayerLaunchHealth({
  ...healthyInput,
  runtime: {
    ...healthyInput.runtime,
    reconciliation: { status: 'RECOVERING', awaitingStreams: ['world', 'economy'] }
  },
  continuity: { ...healthyInput.continuity, recoveringForMs: 16000 }
});
assert.equal(stalledRecovery.status, 'FAIL');
assert.ok(stalledRecovery.errors.some((entry) => entry.code === 'AUTHORITATIVE_RECOVERY_STALLED'));

const epochRegression = evaluateMultiplayerLaunchHealth({
  ...healthyInput,
  continuity: {
    ...healthyInput.continuity,
    authorityEpochRegressed: true,
    authorityEpochHighWater: 3
  }
});
assert.equal(epochRegression.status, 'FAIL');
assert.ok(epochRegression.errors.some((entry) => entry.code === 'AUTHORITY_EPOCH_REGRESSION'));

const dirtyFaults = evaluateMultiplayerLaunchHealth({
  ...healthyInput,
  runtime: {
    ...healthyInput.runtime,
    faultSimulation: { active: true, queuedPackets: 2, config: { enabled: true } }
  }
});
assert.equal(dirtyFaults.status, 'FAIL');
assert.ok(dirtyFaults.errors.some((entry) => entry.code === 'FAULT_STATE_DIRTY'));

const firstFingerprint = buildLaunchObserverFingerprint(healthyInput, healthy);
const changedFingerprint = buildLaunchObserverFingerprint({
  ...healthyInput,
  transport: { mode: 'online', state: 'reconnecting' },
  lobby: { ...healthyInput.lobby, room: { code: 'ABCD', players: [{ playerId: 'a' }] } }
}, reconnecting);
const events = diffLaunchObserverFingerprints(firstFingerprint, changedFingerprint, 1000);
assert.ok(events.some((entry) => entry.type === 'health-status'));
assert.ok(events.some((entry) => entry.type === 'transport-state'));
assert.ok(events.some((entry) => entry.type === 'player-count'));
assert.equal(events.every((entry) => entry.at === 1000), true);

console.log('M3.33-M3.34 launch observer core tests passed.');
