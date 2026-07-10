import assert from 'node:assert/strict';
import {
  MULTIPLAYER_RELEASE_SEAL_BUILD,
  MULTIPLAYER_RELEASE_SEAL_PATCH,
  MULTIPLAYER_RELEASE_SEAL_PROTOCOL,
  buildMultiplayerReleaseSealFingerprint,
  buildMultiplayerReleaseSealReport,
  evaluateMultiplayerReleaseSeal,
  stableMultiplayerReleaseSealStringify
} from './release_seal_core.js';

function passingEvidence(overrides = {}) {
  return {
    protocolVersion: MULTIPLAYER_RELEASE_SEAL_PROTOCOL,
    build: MULTIPLAYER_RELEASE_SEAL_BUILD,
    patch: MULTIPLAYER_RELEASE_SEAL_PATCH,
    releaseGuard: {
      policy: {
        allowed: true,
        loopback: true,
        explicitRequested: true,
        legacySignals: []
      },
      gate: { status: 'WARN', errors: [], warnings: ['Local debug mode active.'] }
    },
    recoveryCertification: { status: 'PASS', result: { status: 'PASS' } },
    releaseCandidate: {
      status: 'PASS',
      result: { status: 'PASS' },
      checklist: {
        twoClientsConnected: true,
        remotePlayerVisible: true,
        sharedCombatWorld: true,
        sharedEconomy: true,
        downedReviveSpectate: true,
        reconnectRecovery: true,
        hostMigration: true,
        runSummary: true,
        publicDebugLockdown: true,
        deploymentSmoke: true
      }
    },
    launchObserver: { status: 'PASS', result: { status: 'PASS' } },
    soakCertification: {
      status: 'PASS',
      result: {
        status: 'PASS',
        complete: true,
        elapsedMs: 120000,
        targetMs: 120000,
        sampleCount: 120,
        metrics: {
          maxDisconnectMs: 1200,
          maxRecoveryMs: 1800,
          maxLaunchFailStreakMs: 0,
          maxRttMs: 82,
          maxJitterMs: 14,
          maxLossPct: 0,
          authorityEpochRegressions: 0,
          faultSamples: 0
        }
      },
      state: {
        complete: true,
        running: false,
        paused: false,
        elapsedMs: 120000,
        targetMs: 120000,
        sampleCount: 120
      }
    },
    ...overrides
  };
}

const passing = evaluateMultiplayerReleaseSeal(passingEvidence());
assert.equal(passing.status, 'PASS');
assert.equal(passing.sealed, true);
assert.match(passing.fingerprint, /^KA-MP-[0-9A-F]{8}$/);
assert.equal(passing.errors.length, 0);
assert.equal(passing.warnings.length, 0);

const deterministicA = evaluateMultiplayerReleaseSeal(passingEvidence());
const deterministicB = evaluateMultiplayerReleaseSeal(passingEvidence());
assert.equal(deterministicA.fingerprint, deterministicB.fingerprint);
assert.equal(
  buildMultiplayerReleaseSealFingerprint(deterministicA.summary),
  deterministicA.fingerprint
);

const reordered = stableMultiplayerReleaseSealStringify({ z: 1, a: { y: 2, x: 3 } });
assert.equal(reordered, '{"a":{"x":3,"y":2},"z":1}');

const pending = evaluateMultiplayerReleaseSeal(passingEvidence({
  soakCertification: {
    status: 'RUNNING',
    result: { status: 'RUNNING', complete: false, sampleCount: 20 },
    state: { running: true, paused: false, complete: false, sampleCount: 20 }
  }
}));
assert.equal(pending.status, 'WARN');
assert.equal(pending.sealed, false);
assert.equal(pending.fingerprint, null);
assert.ok(pending.warnings.some((entry) => entry.code === 'SOAK_CERTIFICATION_PENDING'));
assert.ok(pending.warnings.some((entry) => entry.code === 'SOAK_NOT_FINAL'));

const failedIdentity = evaluateMultiplayerReleaseSeal(passingEvidence({ protocolVersion: 5 }));
assert.equal(failedIdentity.status, 'FAIL');
assert.ok(failedIdentity.errors.some((entry) => entry.code === 'PROTOCOL_MISMATCH'));

const failedGuard = evaluateMultiplayerReleaseSeal(passingEvidence({
  releaseGuard: {
    policy: { allowed: true, loopback: true, explicitRequested: true, legacySignals: [] },
    gate: { status: 'FAIL', errors: ['bad build'] }
  }
}));
assert.equal(failedGuard.status, 'FAIL');
assert.ok(failedGuard.errors.some((entry) => entry.code === 'RELEASE_GUARD_FAILED'));

const failedLegacy = evaluateMultiplayerReleaseSeal(passingEvidence({
  releaseGuard: {
    policy: { allowed: true, loopback: true, explicitRequested: true, legacySignals: ['local-storage'] },
    gate: { status: 'WARN', errors: [] }
  }
}));
assert.equal(failedLegacy.status, 'FAIL');
assert.ok(failedLegacy.errors.some((entry) => entry.code === 'LEGACY_DEBUG_SIGNAL'));

const incompleteManual = passingEvidence();
incompleteManual.releaseCandidate = {
  ...incompleteManual.releaseCandidate,
  checklist: { ...incompleteManual.releaseCandidate.checklist, deploymentSmoke: false }
};
const manualWarning = evaluateMultiplayerReleaseSeal(incompleteManual);
assert.equal(manualWarning.status, 'WARN');
assert.ok(manualWarning.warnings.some((entry) => entry.code === 'MANUAL_ACCEPTANCE_INCOMPLETE'));

const report = buildMultiplayerReleaseSealReport(passingEvidence(), passing, {
  createdAt: '2026-07-10T00:00:00.000Z'
});
assert.equal(report.status, 'PASS');
assert.equal(report.fingerprint, passing.fingerprint);
assert.equal(report.createdAt, '2026-07-10T00:00:00.000Z');
assert.equal(report.patch, MULTIPLAYER_RELEASE_SEAL_PATCH);

console.log('release_seal_core tests passed');
