import assert from 'node:assert/strict';
import {
  evaluateMultiplayerReleaseGate,
  isLoopbackHostname,
  resolveMultiplayerDebugPolicy
} from './release_guard_core.js';

assert.equal(isLoopbackHostname('localhost'), true);
assert.equal(isLoopbackHostname('dev.localhost'), true);
assert.equal(isLoopbackHostname('127.0.0.1'), true);
assert.equal(isLoopbackHostname('[::1]'), true);
assert.equal(isLoopbackHostname('localhost.example.com'), false);
assert.equal(isLoopbackHostname('example.com'), false);

const localDebug = resolveMultiplayerDebugPolicy({
  hostname: 'localhost',
  search: '?mpDebug=1'
});
assert.equal(localDebug.allowed, true);
assert.equal(localDebug.reason, 'loopback-explicit-debug');

const productionDebug = resolveMultiplayerDebugPolicy({
  hostname: 'game.example.com',
  search: '?mpDebug=1'
});
assert.equal(productionDebug.allowed, false);
assert.equal(productionDebug.reason, 'non-loopback-debug-blocked');

const legacyDebug = resolveMultiplayerDebugPolicy({
  hostname: 'localhost',
  search: '?mpFaults=1',
  globalDebug: true,
  storedDebug: true
});
assert.equal(legacyDebug.allowed, false);
assert.deepEqual(legacyDebug.legacySignals, [
  'mpFaults-query',
  'global-flag',
  'local-storage'
]);

const cleanGate = evaluateMultiplayerReleaseGate({
  debugPolicy: resolveMultiplayerDebugPolicy({ hostname: 'game.example.com' }),
  faultSimulation: { active: false, queuedPackets: 0, config: { enabled: false } },
  recoveryDiagnostics: { debugAllowed: false, visible: false },
  recoveryCertification: { debugAllowed: false, visible: false, running: false }
});
assert.equal(cleanGate.status, 'PASS');

const exposedGate = evaluateMultiplayerReleaseGate({
  debugPolicy: resolveMultiplayerDebugPolicy({ hostname: 'game.example.com' }),
  faultSimulation: { active: true, queuedPackets: 2, config: { enabled: true } },
  recoveryDiagnostics: { debugAllowed: true, visible: true },
  recoveryCertification: { debugAllowed: true, visible: false, running: true }
});
assert.equal(exposedGate.status, 'FAIL');
assert.ok(exposedGate.errors.length >= 4);

const identityMismatchGate = evaluateMultiplayerReleaseGate({
  protocolVersion: 5,
  build: 'wrong-build',
  patch: 'wrong-patch'
});
assert.equal(identityMismatchGate.status, 'FAIL');
assert.equal(identityMismatchGate.errors.length, 3);

const recoveringGate = evaluateMultiplayerReleaseGate({
  debugPolicy: resolveMultiplayerDebugPolicy({ hostname: 'game.example.com' }),
  faultSimulation: { active: false, queuedPackets: 0, config: { enabled: false } },
  recoveryDiagnostics: { debugAllowed: false, visible: false },
  recoveryCertification: { debugAllowed: false, visible: false, running: false },
  runActive: true,
  transportState: 'reconnecting',
  reconciliation: { status: 'RECOVERING', awaitingStreams: ['world', 'economy'] }
});
assert.equal(recoveringGate.status, 'WARN');
assert.ok(recoveringGate.warnings.length >= 3);

const malformedPolicyGate = evaluateMultiplayerReleaseGate({
  debugPolicy: { allowed: false, requested: false },
  faultSimulation: { active: false, queuedPackets: 0 }
});
assert.equal(malformedPolicyGate.status, 'PASS');

console.log('M3.29-M3.30 release guard core tests passed.');
