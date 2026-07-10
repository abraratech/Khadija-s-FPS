// js/multiplayer/final_certification_core.test.js
import assert from 'node:assert/strict';
import {
  buildMultiplayerFinalCertificationBundle,
  evaluateMultiplayerFinalCertification,
  MULTIPLAYER_FINAL_CERTIFICATION_PATCH,
  MULTIPLAYER_FINAL_CERTIFICATION_PROTOCOL
} from './final_certification_core.js';

assert.equal(
  MULTIPLAYER_FINAL_CERTIFICATION_PATCH,
  'm3-production-release-manifest-r1'
);
assert.equal(MULTIPLAYER_FINAL_CERTIFICATION_PROTOCOL, 6);

const session = {
  status: 'PASS',
  result: {
    status: 'PASS',
    scenarioSummary: {
      passed: 10,
      failed: 0,
      pending: 0,
      total: 10
    },
    sampleSummary: {
      pass: 120,
      warn: 0,
      fail: 0
    }
  },
  state: {
    complete: true,
    sampleCount: 120
  }
};

const pairing = {
  status: 'PASS',
  result: {
    status: 'PASS',
    paired: true,
    overlapMs: 120000,
    errors: [],
    warnings: []
  },
  localEvidence: {
    digest: 'fnv1a32-local'
  },
  peerEvidence: {
    digest: 'fnv1a32-peer'
  }
};

const passing = evaluateMultiplayerFinalCertification({
  session,
  pairing,
  releaseCandidate: { status: 'PASS' },
  soak: { status: 'PASS' },
  recovery: { status: 'PASS' },
  tabRecovery: {
    status: 'SEALED',
    health: 'PASS',
    continuity: 'ACTIVE_OWNER',
    sealed: true
  },
  epochFence: {
    status: 'SEALED',
    health: 'PASS',
    action: 'NONE'
  },
  final: true
});
assert.equal(passing.status, 'PASS');
assert.equal(passing.releaseReady, true);
assert.equal(passing.errors.length, 0);

const failedPairing = evaluateMultiplayerFinalCertification({
  session,
  pairing: {
    status: 'FAIL',
    result: {
      paired: false,
      overlapMs: 0,
      errors: [{ code: 'SESSION_CODE_MISMATCH' }]
    }
  },
  tabRecovery: {
    status: 'SEALED',
    health: 'PASS',
    continuity: 'ACTIVE_OWNER',
    sealed: true
  },
  epochFence: {
    status: 'SEALED',
    health: 'PASS',
    action: 'NONE'
  }
});
assert.equal(failedPairing.status, 'FAIL');
assert.equal(
  failedPairing.errors.some(
    (entry) => entry.code === 'DUAL_CLIENT_PAIRING_NOT_PASS'
  ),
  true
);

const failedSession = evaluateMultiplayerFinalCertification({
  session: {
    ...session,
    status: 'FAIL',
    result: {
      ...session.result,
      status: 'FAIL',
      sampleSummary: {
        pass: 119,
        warn: 0,
        fail: 1
      }
    }
  },
  pairing,
  tabRecovery: {
    status: 'SEALED',
    health: 'PASS',
    continuity: 'ACTIVE_OWNER',
    sealed: true
  },
  epochFence: {
    status: 'SEALED',
    health: 'PASS',
    action: 'NONE'
  }
});
assert.equal(failedSession.status, 'FAIL');
assert.equal(
  failedSession.errors.some(
    (entry) => entry.code === 'SESSION_AUTOMATIC_FAILURES'
  ),
  true
);

const contradiction = evaluateMultiplayerFinalCertification({
  session,
  pairing,
  tabRecovery: {
    status: 'SEALED',
    health: 'PASS',
    continuity: 'ACTIVE_OWNER',
    sealed: true
  },
  epochFence: {
    status: 'FENCED',
    health: 'FAIL',
    action: 'QUIESCE'
  }
});
assert.equal(contradiction.status, 'FAIL');
assert.equal(
  contradiction.errors.some(
    (entry) => entry.code === 'FENCE_QUIESCE_CONTRADICTION'
  ),
  true
);

const bundle = buildMultiplayerFinalCertificationBundle({
  verdict: passing,
  session,
  pairing,
  tabRecovery: {
    status: 'SEALED',
    health: 'PASS',
    continuity: 'ACTIVE_OWNER',
    sealed: true
  },
  epochFence: {
    status: 'SEALED',
    health: 'PASS',
    action: 'NONE'
  },
  metadata: {
    tester: 'Abrar',
    notes: 'Final certification'
  }
});
assert.equal(bundle.milestone, 'M3.77-M3.78');
assert.equal(bundle.verdict.status, 'PASS');
assert.equal(bundle.digest.startsWith('fnv1a32-'), true);

console.log('final_certification_core tests passed');
