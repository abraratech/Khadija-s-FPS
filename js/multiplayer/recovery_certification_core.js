// js/multiplayer/recovery_certification_core.js

export const RECOVERY_CERTIFICATION_STATES = Object.freeze({
  IDLE: 'IDLE',
  PREFLIGHT: 'PREFLIGHT',
  BASELINE: 'BASELINE',
  WIFI: 'WIFI',
  LOSSY: 'LOSSY',
  DISCONNECT: 'DISCONNECT',
  RECOVERY: 'RECOVERY',
  FINALIZE: 'FINALIZE',
  COMPLETE: 'COMPLETE',
  ABORTED: 'ABORTED'
});

export const RECOVERY_CERTIFICATION_THRESHOLDS = Object.freeze({
  recoveryWarnMs: 12000,
  recoveryFailMs: 25000,
  staleWorldWarnMs: 6000,
  finalWorldAgeFailMs: 5000,
  finalQueuedPacketsFail: 0,
  resyncWarnCount: 12
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function issue(code, message, details = {}) {
  return { code, message, details };
}

export function createCertificationMetrics() {
  return {
    samples: 0,
    startedAt: null,
    finishedAt: null,
    forcedDisconnectAccepted: false,
    disconnectObserved: false,
    reconnectObserved: false,
    recoveryCompleted: false,
    recoveryDurationMs: null,
    recoveryTimedOut: false,
    authorityEpochRegressions: 0,
    minAuthorityEpoch: null,
    maxAuthorityEpoch: null,
    maxWorldAgeMs: 0,
    maxRttMs: 0,
    maxJitterMs: 0,
    maxLossPercent: 0,
    maxQueuedPackets: 0,
    initialEnvelopeCount: 0,
    finalEnvelopeCount: 0,
    initialResyncCount: 0,
    finalResyncCount: 0,
    initialGapCount: 0,
    finalGapCount: 0,
    finalTransportState: 'unknown',
    finalReconciliationStatus: 'WAITING',
    finalAwaitingStreams: [],
    finalWorldAgeMs: null,
    finalFaultActive: false,
    finalQueuedPackets: 0,
    warningsObserved: 0
  };
}

export function observeCertificationSample(metrics, sample = {}) {
  const next = { ...metrics };
  next.samples += 1;

  const authorityEpoch = Number(sample.authorityEpoch);
  if (Number.isFinite(authorityEpoch)) {
    if (next.maxAuthorityEpoch !== null && authorityEpoch < next.maxAuthorityEpoch) {
      next.authorityEpochRegressions += 1;
    }
    next.minAuthorityEpoch = next.minAuthorityEpoch === null
      ? authorityEpoch
      : Math.min(next.minAuthorityEpoch, authorityEpoch);
    next.maxAuthorityEpoch = next.maxAuthorityEpoch === null
      ? authorityEpoch
      : Math.max(next.maxAuthorityEpoch, authorityEpoch);
  }

  next.maxWorldAgeMs = Math.max(next.maxWorldAgeMs, finite(sample.worldAgeMs));
  next.maxRttMs = Math.max(next.maxRttMs, finite(sample.rttMs));
  next.maxJitterMs = Math.max(next.maxJitterMs, finite(sample.jitterMs));
  next.maxLossPercent = Math.max(next.maxLossPercent, finite(sample.lossPercent));
  next.maxQueuedPackets = Math.max(next.maxQueuedPackets, finite(sample.queuedPackets));
  return next;
}

export function evaluateRecoveryCertification(metrics = {}, thresholds = RECOVERY_CERTIFICATION_THRESHOLDS) {
  const failures = [];
  const warnings = [];

  if (metrics.forcedDisconnectAccepted !== true) {
    failures.push(issue('FORCED_DISCONNECT_REJECTED', 'The runtime rejected the forced-disconnect certification step.'));
  }
  if (metrics.recoveryTimedOut) {
    failures.push(issue('RECOVERY_TIMEOUT', 'Recovery did not complete before the certification timeout.'));
  }
  if (metrics.forcedDisconnectAccepted && !metrics.reconnectObserved) {
    failures.push(issue('RECONNECT_NOT_OBSERVED', 'The transport did not reconnect after the forced disconnect.'));
  }
  if (finite(metrics.authorityEpochRegressions) > 0) {
    failures.push(issue('AUTHORITY_EPOCH_REGRESSION', 'Authority epoch moved backwards during certification.', {
      count: metrics.authorityEpochRegressions
    }));
  }
  if (metrics.finalTransportState !== 'connected') {
    failures.push(issue('FINAL_TRANSPORT_NOT_CONNECTED', 'Certification ended without a connected transport.', {
      state: metrics.finalTransportState
    }));
  }
  if (metrics.finalReconciliationStatus === 'RECOVERING') {
    failures.push(issue('FINAL_SYNC_RECOVERING', 'Reconciliation was still recovering when certification ended.'));
  }
  if (Array.isArray(metrics.finalAwaitingStreams) && metrics.finalAwaitingStreams.length > 0) {
    failures.push(issue('FINAL_STREAMS_MISSING', 'Authoritative streams were still missing after recovery.', {
      streams: metrics.finalAwaitingStreams
    }));
  }
  if (
    Number.isFinite(Number(metrics.finalWorldAgeMs))
    && Number(metrics.finalWorldAgeMs) > thresholds.finalWorldAgeFailMs
  ) {
    failures.push(issue('FINAL_WORLD_STALE', 'The final authoritative world snapshot was stale.', {
      worldAgeMs: metrics.finalWorldAgeMs
    }));
  }
  if (metrics.finalFaultActive === true) {
    failures.push(issue('FAULTS_LEFT_ENABLED', 'Fault simulation remained enabled after certification.'));
  }
  if (finite(metrics.finalQueuedPackets) > thresholds.finalQueuedPacketsFail) {
    failures.push(issue('FAULT_QUEUE_NOT_DRAINED', 'Simulated packets remained queued after certification.', {
      queuedPackets: metrics.finalQueuedPackets
    }));
  }

  if (!metrics.disconnectObserved && metrics.forcedDisconnectAccepted) {
    warnings.push(issue('DISCONNECT_TRANSITION_TOO_FAST', 'The forced disconnect completed before a disconnected state could be sampled.'));
  }
  if (
    Number.isFinite(Number(metrics.recoveryDurationMs))
    && Number(metrics.recoveryDurationMs) > thresholds.recoveryWarnMs
  ) {
    warnings.push(issue('SLOW_RECOVERY', 'Recovery completed, but exceeded the warning threshold.', {
      recoveryDurationMs: metrics.recoveryDurationMs
    }));
  }
  if (finite(metrics.maxWorldAgeMs) > thresholds.staleWorldWarnMs) {
    warnings.push(issue('WORLD_STALE_DURING_TEST', 'World snapshots became stale during a fault stage.', {
      maxWorldAgeMs: metrics.maxWorldAgeMs
    }));
  }

  const envelopeDelta = finite(metrics.finalEnvelopeCount) - finite(metrics.initialEnvelopeCount);
  if (envelopeDelta <= 0) {
    warnings.push(issue('NO_ENVELOPE_PROGRESS', 'No accepted-envelope progress was measured during certification.', {
      envelopeDelta
    }));
  }

  const resyncDelta = finite(metrics.finalResyncCount) - finite(metrics.initialResyncCount);
  if (resyncDelta > thresholds.resyncWarnCount) {
    warnings.push(issue('EXCESSIVE_RESYNC', 'Recovery required an unusually high number of resync requests.', {
      resyncDelta
    }));
  }

  return {
    status: failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS',
    failures,
    warnings,
    summary: {
      samples: finite(metrics.samples),
      recoveryDurationMs: metrics.recoveryDurationMs,
      envelopeDelta,
      resyncDelta,
      sequenceGapDelta: finite(metrics.finalGapCount) - finite(metrics.initialGapCount),
      maxWorldAgeMs: finite(metrics.maxWorldAgeMs),
      maxRttMs: finite(metrics.maxRttMs),
      maxJitterMs: finite(metrics.maxJitterMs),
      maxLossPercent: finite(metrics.maxLossPercent),
      maxQueuedPackets: finite(metrics.maxQueuedPackets)
    }
  };
}
