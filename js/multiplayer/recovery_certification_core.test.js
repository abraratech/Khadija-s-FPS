import assert from 'node:assert/strict';
import {
  createCertificationMetrics,
  evaluateRecoveryCertification,
  observeCertificationSample
} from './recovery_certification_core.js';

function healthyMetrics() {
  return {
    ...createCertificationMetrics(),
    samples: 20,
    forcedDisconnectAccepted: true,
    disconnectObserved: true,
    reconnectObserved: true,
    recoveryCompleted: true,
    recoveryDurationMs: 4500,
    initialEnvelopeCount: 10,
    finalEnvelopeCount: 100,
    initialResyncCount: 0,
    finalResyncCount: 2,
    initialGapCount: 0,
    finalGapCount: 1,
    finalTransportState: 'connected',
    finalReconciliationStatus: 'HEALTHY',
    finalAwaitingStreams: [],
    finalWorldAgeMs: 400,
    finalFaultActive: false,
    finalQueuedPackets: 0
  };
}

assert.equal(evaluateRecoveryCertification(healthyMetrics()).status, 'PASS');

const timedOut = healthyMetrics();
timedOut.recoveryTimedOut = true;
assert.equal(evaluateRecoveryCertification(timedOut).status, 'FAIL');

const regression = healthyMetrics();
regression.authorityEpochRegressions = 1;
assert.equal(evaluateRecoveryCertification(regression).status, 'FAIL');

const warning = healthyMetrics();
warning.recoveryDurationMs = 15000;
assert.equal(evaluateRecoveryCertification(warning).status, 'WARN');

let observed = createCertificationMetrics();
observed = observeCertificationSample(observed, {
  authorityEpoch: 3,
  worldAgeMs: 250,
  rttMs: 90,
  jitterMs: 12,
  lossPercent: 2,
  queuedPackets: 4
});
observed = observeCertificationSample(observed, {
  authorityEpoch: 2,
  worldAgeMs: 500,
  rttMs: 120,
  jitterMs: 20,
  lossPercent: 4,
  queuedPackets: 8
});
assert.equal(observed.authorityEpochRegressions, 1);
assert.equal(observed.maxWorldAgeMs, 500);
assert.equal(observed.maxQueuedPackets, 8);

console.log('recovery_certification_core.test.js passed');
