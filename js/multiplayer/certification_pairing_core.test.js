// js/multiplayer/certification_pairing_core.test.js
import assert from 'node:assert/strict';
import {
  createMultiplayerCertificationClientEvidence,
  evaluateMultiplayerCertificationPairing,
  hashMultiplayerCertificationEvidence,
  validateMultiplayerCertificationClientEvidence,
  MULTIPLAYER_CERTIFICATION_PAIRING_PATCH,
  MULTIPLAYER_CERTIFICATION_PAIRING_PROTOCOL
} from './certification_pairing_core.js';

assert.equal(
  MULTIPLAYER_CERTIFICATION_PAIRING_PATCH,
  'm3-production-release-manifest-r1'
);
assert.equal(MULTIPLAYER_CERTIFICATION_PAIRING_PROTOCOL, 6);

function certification(status = 'PASS') {
  return {
    status,
    result: {
      status,
      scenarioSummary: {
        passed: 10,
        failed: 0,
        pending: 0,
        total: 10
      },
      sampleSummary: {
        pass: 120,
        warn: 0,
        fail: 0,
        activeOwner: 120,
        passiveTab: 0,
        reclaimedOwner: 0
      },
      errors: [],
      warnings: []
    },
    state: {
      running: false,
      paused: false,
      complete: true,
      elapsedMs: 120000,
      targetMs: 120000,
      sampleCount: 120
    }
  };
}

const host = createMultiplayerCertificationClientEvidence({
  sessionCode: 'arena-427',
  clientId: 'host-client-id',
  role: 'host',
  capturedAt: 200000,
  certification: certification(),
  tabRecovery: {
    status: 'SEALED',
    health: 'PASS',
    continuity: 'ACTIVE_OWNER',
    blocking: false,
    sealed: true
  },
  epochFence: {
    status: 'SEALED',
    health: 'PASS',
    action: 'NONE',
    blocking: false
  }
});
assert.ok(host);
assert.equal(host.sessionCode, 'ARENA-427');
assert.equal(
  validateMultiplayerCertificationClientEvidence(host).valid,
  true
);
assert.equal(
  host.digest,
  hashMultiplayerCertificationEvidence(host)
);

const client = createMultiplayerCertificationClientEvidence({
  sessionCode: 'arena-427',
  clientId: 'peer-client-id',
  role: 'client',
  capturedAt: 205000,
  certification: certification(),
  tabRecovery: {
    status: 'SEALED',
    health: 'PASS',
    continuity: 'ACTIVE_OWNER',
    blocking: false,
    sealed: true
  },
  epochFence: {
    status: 'SEALED',
    health: 'PASS',
    action: 'NONE',
    blocking: false
  }
});

const paired = evaluateMultiplayerCertificationPairing({
  localEvidence: host,
  peerEvidence: client,
  final: true
});
assert.equal(paired.status, 'PASS');
assert.equal(paired.paired, true);
assert.equal(paired.overlapMs >= 60000, true);

const collision = createMultiplayerCertificationClientEvidence({
  sessionCode: 'arena-427',
  clientId: 'host-client-id',
  role: 'client',
  capturedAt: 205000,
  certification: certification(),
  tabRecovery: {
    status: 'SEALED',
    health: 'PASS',
    continuity: 'ACTIVE_OWNER'
  },
  epochFence: {
    status: 'SEALED',
    health: 'PASS'
  }
});
const collisionResult = evaluateMultiplayerCertificationPairing({
  localEvidence: host,
  peerEvidence: collision,
  final: true
});
assert.equal(collisionResult.status, 'FAIL');
assert.equal(
  collisionResult.errors.some(
    (entry) => entry.code === 'CLIENT_ID_COLLISION'
  ),
  true
);

const tampered = {
  ...client,
  sessionCode: 'OTHER'
};
assert.equal(
  validateMultiplayerCertificationClientEvidence(tampered).valid,
  false
);

const shortClient = createMultiplayerCertificationClientEvidence({
  sessionCode: 'arena-427',
  clientId: 'short-client-id',
  role: 'client',
  capturedAt: 205000,
  certification: {
    ...certification(),
    state: {
      ...certification().state,
      elapsedMs: 30000,
      sampleCount: 30
    }
  },
  tabRecovery: {
    status: 'SEALED',
    health: 'PASS',
    continuity: 'ACTIVE_OWNER'
  },
  epochFence: {
    status: 'SEALED',
    health: 'PASS'
  }
});
const shortResult = evaluateMultiplayerCertificationPairing({
  localEvidence: host,
  peerEvidence: shortClient,
  final: true
});
assert.equal(shortResult.status, 'FAIL');
assert.equal(
  shortResult.errors.some(
    (entry) => entry.code === 'INSUFFICIENT_CLIENT_SAMPLES'
  ),
  true
);

console.log('certification_pairing_core tests passed');
