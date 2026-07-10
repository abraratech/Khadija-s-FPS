// js/multiplayer/soak_certification_core.js
// M3.35-M3.36 — deterministic multiplayer burn-in soak evaluation and incident replay.

export const MULTIPLAYER_SOAK_CERTIFICATION_PATCH = 'm3-refresh-recovery-seal-r1';
export const MULTIPLAYER_SOAK_CERTIFICATION_PROTOCOL = 6;
export const MULTIPLAYER_SOAK_CERTIFICATION_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_SOAK_SAMPLE_INTERVAL_MS = 1000;
export const MULTIPLAYER_SOAK_DEFAULT_TARGET_MS = 5 * 60 * 1000;
export const MULTIPLAYER_SOAK_MIN_TARGET_MS = 30 * 1000;
export const MULTIPLAYER_SOAK_MAX_TARGET_MS = 60 * 60 * 1000;
export const MULTIPLAYER_SOAK_MAX_EVENTS = 240;

const DISCONNECT_FAIL_AFTER_MS = 12000;
const RECOVERY_FAIL_AFTER_MS = 15000;
const LAUNCH_FAIL_STREAK_MS = 10000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cleanStatus(value, fallback = 'UNKNOWN') {
  const status = String(value || fallback).trim().toUpperCase();
  return status || fallback;
}

function issue(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function event(at, severity, code, message, details = {}) {
  return Object.freeze({
    at: finite(at, Date.now()),
    severity: cleanStatus(severity, 'INFO'),
    code,
    message,
    details: Object.freeze({ ...details })
  });
}

function appendEvent(events, nextEvent) {
  const next = [...(Array.isArray(events) ? events : []), nextEvent];
  if (next.length > MULTIPLAYER_SOAK_MAX_EVENTS) {
    next.splice(0, next.length - MULTIPLAYER_SOAK_MAX_EVENTS);
  }
  return Object.freeze(next);
}

export function normalizeMultiplayerSoakTargetMs(value, fallback = MULTIPLAYER_SOAK_DEFAULT_TARGET_MS) {
  const numeric = finite(value, fallback);
  return Math.round(clamp(numeric, MULTIPLAYER_SOAK_MIN_TARGET_MS, MULTIPLAYER_SOAK_MAX_TARGET_MS));
}

export function createMultiplayerSoakState({
  targetMs = MULTIPLAYER_SOAK_DEFAULT_TARGET_MS,
  startedAt = null,
  running = false
} = {}) {
  const start = startedAt === null ? null : finite(startedAt, 0);
  return Object.freeze({
    version: 1,
    patch: MULTIPLAYER_SOAK_CERTIFICATION_PATCH,
    targetMs: normalizeMultiplayerSoakTargetMs(targetMs),
    running: running === true,
    paused: false,
    complete: false,
    startedAt: start,
    stoppedAt: null,
    lastSampleAt: start,
    elapsedMs: 0,
    sampleCount: 0,
    healthySamples: 0,
    warningSamples: 0,
    failedSamples: 0,
    connectedSamples: 0,
    twoPlayerSamples: 0,
    activeRunSamples: 0,
    faultSamples: 0,
    authorityEpochRegressions: 0,
    releaseCandidateFailures: 0,
    recoveryCertificationFailures: 0,
    launchFailStreakMs: 0,
    maxLaunchFailStreakMs: 0,
    maxDisconnectMs: 0,
    maxRecoveryMs: 0,
    maxRttMs: 0,
    maxJitterMs: 0,
    maxLossPct: 0,
    lastLaunchStatus: 'UNKNOWN',
    lastTransportState: 'unknown',
    lastReleaseCandidateStatus: 'UNKNOWN',
    lastRecoveryCertificationStatus: 'UNKNOWN',
    events: Object.freeze([])
  });
}

export function setMultiplayerSoakRunState(state, {
  running = state?.running === true,
  paused = state?.paused === true,
  complete = state?.complete === true,
  at = Date.now(),
  reason = 'state-change'
} = {}) {
  const current = state || createMultiplayerSoakState();
  const nextRunning = running === true;
  const nextPaused = nextRunning && paused === true;
  const nextComplete = complete === true;
  const severity = nextComplete ? 'INFO' : nextPaused ? 'WARN' : nextRunning ? 'INFO' : 'INFO';
  const code = nextComplete ? 'SOAK_COMPLETED' : nextPaused ? 'SOAK_PAUSED' : nextRunning ? 'SOAK_STARTED' : 'SOAK_STOPPED';
  const message = nextComplete
    ? 'Burn-in soak marked complete.'
    : nextPaused
      ? 'Burn-in soak paused.'
      : nextRunning
        ? 'Burn-in soak running.'
        : 'Burn-in soak stopped.';
  return Object.freeze({
    ...current,
    running: nextRunning,
    paused: nextPaused,
    complete: nextComplete,
    stoppedAt: nextComplete || !nextRunning ? finite(at, Date.now()) : null,
    events: appendEvent(current.events, event(at, severity, code, message, { reason }))
  });
}

function normalizedSample(sample = {}, previousAt = 0) {
  const at = finite(sample.at, Date.now());
  const launchStatus = cleanStatus(sample.launchStatus);
  const releaseCandidateStatus = cleanStatus(sample.releaseCandidateStatus);
  const recoveryCertificationStatus = cleanStatus(sample.recoveryCertificationStatus);
  const transportState = String(sample.transportState || 'unknown').trim().toLowerCase();
  return {
    at,
    deltaMs: clamp(finite(sample.deltaMs, at - finite(previousAt, at)), 0, 5000),
    launchStatus,
    releaseCandidateStatus,
    recoveryCertificationStatus,
    transportState,
    playerCount: Math.max(0, Math.floor(finite(sample.playerCount, 0))),
    runActive: sample.runActive === true,
    faultActive: sample.faultActive === true,
    queuedPackets: Math.max(0, Math.floor(finite(sample.queuedPackets, 0))),
    authorityEpochRegressed: sample.authorityEpochRegressed === true,
    disconnectedForMs: Math.max(0, finite(sample.disconnectedForMs, 0)),
    recoveringForMs: Math.max(0, finite(sample.recoveringForMs, 0)),
    rttMs: Math.max(0, finite(sample.rttMs, 0)),
    jitterMs: Math.max(0, finite(sample.jitterMs, 0)),
    lossPct: clamp(finite(sample.lossPct, 0), 0, 100)
  };
}

export function recordMultiplayerSoakSample(state, rawSample = {}) {
  const current = state || createMultiplayerSoakState();
  if (!current.running || current.paused || current.complete) return current;

  const sample = normalizedSample(rawSample, current.lastSampleAt ?? current.startedAt ?? 0);
  const healthy = sample.launchStatus === 'PASS';
  const warned = sample.launchStatus === 'WARN';
  const failed = sample.launchStatus === 'FAIL';
  const connected = sample.transportState === 'connected';
  const faultDirty = sample.faultActive || sample.queuedPackets > 0;
  const releaseFailed = sample.releaseCandidateStatus === 'FAIL';
  const certificationFailed = sample.recoveryCertificationStatus === 'FAIL';
  const nextFailStreak = failed ? current.launchFailStreakMs + sample.deltaMs : 0;

  let events = current.events;
  if (sample.launchStatus !== current.lastLaunchStatus) {
    events = appendEvent(events, event(
      sample.at,
      sample.launchStatus === 'FAIL' ? 'FAIL' : sample.launchStatus === 'WARN' ? 'WARN' : 'INFO',
      'LAUNCH_HEALTH_TRANSITION',
      `Launch health changed from ${current.lastLaunchStatus} to ${sample.launchStatus}.`,
      { from: current.lastLaunchStatus, to: sample.launchStatus }
    ));
  }
  if (sample.transportState !== current.lastTransportState) {
    events = appendEvent(events, event(
      sample.at,
      connected ? 'INFO' : 'WARN',
      'TRANSPORT_TRANSITION',
      `Transport changed from ${current.lastTransportState} to ${sample.transportState}.`,
      { from: current.lastTransportState, to: sample.transportState }
    ));
  }
  if (sample.authorityEpochRegressed) {
    events = appendEvent(events, event(sample.at, 'FAIL', 'AUTHORITY_EPOCH_REGRESSION', 'Authority epoch regressed during the soak.'));
  }
  if (faultDirty && current.faultSamples === 0) {
    events = appendEvent(events, event(sample.at, 'FAIL', 'FAULT_STATE_DIRTY', 'Fault simulation or queued packets were detected during a clean soak.', {
      faultActive: sample.faultActive,
      queuedPackets: sample.queuedPackets
    }));
  }
  if (sample.disconnectedForMs > DISCONNECT_FAIL_AFTER_MS && current.maxDisconnectMs <= DISCONNECT_FAIL_AFTER_MS) {
    events = appendEvent(events, event(sample.at, 'FAIL', 'DISCONNECT_STALLED', 'A multiplayer disconnect exceeded the recovery allowance.', {
      disconnectedForMs: sample.disconnectedForMs
    }));
  }
  if (sample.recoveringForMs > RECOVERY_FAIL_AFTER_MS && current.maxRecoveryMs <= RECOVERY_FAIL_AFTER_MS) {
    events = appendEvent(events, event(sample.at, 'FAIL', 'RECOVERY_STALLED', 'Authoritative stream recovery exceeded the recovery allowance.', {
      recoveringForMs: sample.recoveringForMs
    }));
  }
  if (nextFailStreak >= LAUNCH_FAIL_STREAK_MS && current.maxLaunchFailStreakMs < LAUNCH_FAIL_STREAK_MS) {
    events = appendEvent(events, event(sample.at, 'FAIL', 'LAUNCH_FAIL_STREAK', 'Launch health remained failed for too long.', {
      failStreakMs: nextFailStreak
    }));
  }

  return Object.freeze({
    ...current,
    lastSampleAt: sample.at,
    elapsedMs: current.elapsedMs + sample.deltaMs,
    sampleCount: current.sampleCount + 1,
    healthySamples: current.healthySamples + (healthy ? 1 : 0),
    warningSamples: current.warningSamples + (warned ? 1 : 0),
    failedSamples: current.failedSamples + (failed ? 1 : 0),
    connectedSamples: current.connectedSamples + (connected ? 1 : 0),
    twoPlayerSamples: current.twoPlayerSamples + (sample.playerCount >= 2 ? 1 : 0),
    activeRunSamples: current.activeRunSamples + (sample.runActive ? 1 : 0),
    faultSamples: current.faultSamples + (faultDirty ? 1 : 0),
    authorityEpochRegressions: current.authorityEpochRegressions + (sample.authorityEpochRegressed ? 1 : 0),
    releaseCandidateFailures: current.releaseCandidateFailures + (releaseFailed ? 1 : 0),
    recoveryCertificationFailures: current.recoveryCertificationFailures + (certificationFailed ? 1 : 0),
    launchFailStreakMs: nextFailStreak,
    maxLaunchFailStreakMs: Math.max(current.maxLaunchFailStreakMs, nextFailStreak),
    maxDisconnectMs: Math.max(current.maxDisconnectMs, sample.disconnectedForMs),
    maxRecoveryMs: Math.max(current.maxRecoveryMs, sample.recoveringForMs),
    maxRttMs: Math.max(current.maxRttMs, sample.rttMs),
    maxJitterMs: Math.max(current.maxJitterMs, sample.jitterMs),
    maxLossPct: Math.max(current.maxLossPct, sample.lossPct),
    lastLaunchStatus: sample.launchStatus,
    lastTransportState: sample.transportState,
    lastReleaseCandidateStatus: sample.releaseCandidateStatus,
    lastRecoveryCertificationStatus: sample.recoveryCertificationStatus,
    events
  });
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function evaluateMultiplayerSoakCertification(state, { final = false } = {}) {
  const current = state || createMultiplayerSoakState();
  const errors = [];
  const warnings = [];
  const complete = current.complete || final || current.elapsedMs >= current.targetMs;
  const expectedSamples = Math.max(1, Math.floor(current.targetMs / MULTIPLAYER_SOAK_SAMPLE_INTERVAL_MS));
  const minimumSamples = Math.max(20, Math.floor(expectedSamples * 0.7));
  const connectedRatio = ratio(current.connectedSamples, current.sampleCount);
  const twoPlayerRatio = ratio(current.twoPlayerSamples, current.sampleCount);
  const activeRunRatio = ratio(current.activeRunSamples, current.sampleCount);
  const warningRatio = ratio(current.warningSamples, current.sampleCount);

  if (current.sampleCount === 0) warnings.push(issue('NO_SAMPLES', 'No soak samples have been captured.'));
  if (complete && current.elapsedMs < current.targetMs) {
    warnings.push(issue('TARGET_NOT_REACHED', 'The soak was finalized before reaching its target duration.', {
      elapsedMs: current.elapsedMs,
      targetMs: current.targetMs
    }));
  }
  if (complete && current.sampleCount < minimumSamples) {
    errors.push(issue('INSUFFICIENT_SAMPLES', 'The soak did not capture enough samples for certification.', {
      sampleCount: current.sampleCount,
      minimumSamples
    }));
  }
  if (complete && twoPlayerRatio < 0.5) {
    errors.push(issue('TWO_PLAYER_COVERAGE_LOW', 'Less than half of the soak covered a two-player room.', { twoPlayerRatio }));
  }
  if (complete && activeRunRatio < 0.5) {
    errors.push(issue('ACTIVE_RUN_COVERAGE_LOW', 'Less than half of the soak covered an active multiplayer run.', { activeRunRatio }));
  }
  if (complete && connectedRatio < 0.8) {
    errors.push(issue('CONNECTED_COVERAGE_LOW', 'Transport connectivity was below the required soak threshold.', { connectedRatio }));
  }
  if (current.authorityEpochRegressions > 0) {
    errors.push(issue('AUTHORITY_EPOCH_REGRESSION', 'Authority epoch regression was observed.', {
      count: current.authorityEpochRegressions
    }));
  }
  if (current.faultSamples > 0) {
    errors.push(issue('FAULT_STATE_DIRTY', 'Fault simulation or queued packets contaminated the clean soak.', {
      sampleCount: current.faultSamples
    }));
  }
  if (current.maxDisconnectMs > DISCONNECT_FAIL_AFTER_MS) {
    errors.push(issue('DISCONNECT_STALLED', 'Maximum disconnect duration exceeded the allowed threshold.', {
      maxDisconnectMs: current.maxDisconnectMs,
      thresholdMs: DISCONNECT_FAIL_AFTER_MS
    }));
  }
  if (current.maxRecoveryMs > RECOVERY_FAIL_AFTER_MS) {
    errors.push(issue('RECOVERY_STALLED', 'Maximum recovery duration exceeded the allowed threshold.', {
      maxRecoveryMs: current.maxRecoveryMs,
      thresholdMs: RECOVERY_FAIL_AFTER_MS
    }));
  }
  if (current.maxLaunchFailStreakMs >= LAUNCH_FAIL_STREAK_MS) {
    errors.push(issue('LAUNCH_FAIL_STREAK', 'Launch health remained failed beyond the allowed threshold.', {
      maxLaunchFailStreakMs: current.maxLaunchFailStreakMs,
      thresholdMs: LAUNCH_FAIL_STREAK_MS
    }));
  }
  if (current.releaseCandidateFailures > 0 || (complete && current.lastReleaseCandidateStatus !== 'PASS')) {
    errors.push(issue('RELEASE_CANDIDATE_NOT_PASS', 'Release-candidate validation did not remain in PASS state.', {
      failures: current.releaseCandidateFailures,
      finalStatus: current.lastReleaseCandidateStatus
    }));
  }
  if (current.recoveryCertificationFailures > 0 || (complete && current.lastRecoveryCertificationStatus !== 'PASS')) {
    errors.push(issue('RECOVERY_CERTIFICATION_NOT_PASS', 'Recovery certification did not remain in PASS state.', {
      failures: current.recoveryCertificationFailures,
      finalStatus: current.lastRecoveryCertificationStatus
    }));
  }
  if (current.maxLossPct > 10) warnings.push(issue('PACKET_LOSS_HIGH', 'Peak packet loss exceeded 10%.', { maxLossPct: current.maxLossPct }));
  if (current.maxJitterMs > 100) warnings.push(issue('JITTER_HIGH', 'Peak network jitter exceeded 100 ms.', { maxJitterMs: current.maxJitterMs }));
  if (current.maxRttMs > 300) warnings.push(issue('RTT_HIGH', 'Peak round-trip time exceeded 300 ms.', { maxRttMs: current.maxRttMs }));
  if (warningRatio > 0.25) warnings.push(issue('WARNING_RATIO_HIGH', 'More than 25% of soak samples were WARN.', { warningRatio }));

  let status = 'IDLE';
  if (complete) status = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';
  else if (errors.length > 0) status = 'FAIL';
  else if (warnings.length > 0 && current.sampleCount > 0) status = 'WARN';
  else if (current.paused) status = 'PAUSED';
  else if (current.running) status = 'RUNNING';

  return Object.freeze({
    status,
    complete,
    elapsedMs: current.elapsedMs,
    targetMs: current.targetMs,
    progress: clamp(current.elapsedMs / Math.max(1, current.targetMs), 0, 1),
    sampleCount: current.sampleCount,
    minimumSamples,
    ratios: Object.freeze({ connected: connectedRatio, twoPlayer: twoPlayerRatio, activeRun: activeRunRatio, warning: warningRatio }),
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    metrics: Object.freeze({
      maxDisconnectMs: current.maxDisconnectMs,
      maxRecoveryMs: current.maxRecoveryMs,
      maxLaunchFailStreakMs: current.maxLaunchFailStreakMs,
      maxRttMs: current.maxRttMs,
      maxJitterMs: current.maxJitterMs,
      maxLossPct: current.maxLossPct,
      authorityEpochRegressions: current.authorityEpochRegressions,
      faultSamples: current.faultSamples
    })
  });
}

export function buildMultiplayerSoakIncidentReplay(state, result = evaluateMultiplayerSoakCertification(state)) {
  const current = state || createMultiplayerSoakState();
  return Object.freeze({
    patch: MULTIPLAYER_SOAK_CERTIFICATION_PATCH,
    build: MULTIPLAYER_SOAK_CERTIFICATION_BUILD,
    protocol: MULTIPLAYER_SOAK_CERTIFICATION_PROTOCOL,
    status: result.status,
    complete: result.complete,
    startedAt: current.startedAt,
    stoppedAt: current.stoppedAt,
    elapsedMs: current.elapsedMs,
    targetMs: current.targetMs,
    sampleCount: current.sampleCount,
    counts: Object.freeze({
      healthy: current.healthySamples,
      warning: current.warningSamples,
      failed: current.failedSamples,
      connected: current.connectedSamples,
      twoPlayer: current.twoPlayerSamples,
      activeRun: current.activeRunSamples
    }),
    metrics: result.metrics,
    errors: result.errors,
    warnings: result.warnings,
    events: Object.freeze([...(current.events || [])])
  });
}
