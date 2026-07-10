// js/multiplayer/suspend_wake_probe_core.js
// M3.57-M3.58 — deterministic wake-time transport liveness policy.

export const MULTIPLAYER_SUSPEND_WAKE_PROBE_PATCH = 'm3-production-release-manifest-r1';
export const MULTIPLAYER_SUSPEND_WAKE_PROBE_PROTOCOL = 6;
export const MULTIPLAYER_SUSPEND_WAKE_PROBE_TIMEOUT_MS = 2800;
export const MULTIPLAYER_SUSPEND_WAKE_PROBE_POLL_MS = 140;
export const MULTIPLAYER_SUSPEND_WAKE_FRESH_SILENCE_MS = 900;

function finiteTime(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function normalizeTransportState(value = '') {
  return cleanText(value).toLowerCase().slice(0, 40);
}

function normalizeNetworkQuality(value = null) {
  if (!value || typeof value !== 'object') {
    return Object.freeze({
      level: 'WAITING',
      silenceMs: Number.POSITIVE_INFINITY,
      lastPongAt: 0,
      pendingPings: 0
    });
  }
  return Object.freeze({
    level: cleanText(value.level, 'WAITING').toUpperCase().slice(0, 40),
    silenceMs: finiteTime(value.silenceMs, Number.POSITIVE_INFINITY),
    lastPongAt: finiteTime(value.lastPongAt),
    pendingPings: finiteTime(value.pendingPings)
  });
}

export function createMultiplayerSuspendWakeProbe({
  incidentId = '',
  runId = '',
  startedAt = Date.now(),
  timeoutMs = MULTIPLAYER_SUSPEND_WAKE_PROBE_TIMEOUT_MS
} = {}) {
  const normalizedIncidentId = cleanText(incidentId).slice(0, 160);
  const normalizedRunId = cleanText(runId, 'active-run').slice(0, 160);
  if (!normalizedIncidentId || !normalizedRunId) return null;

  const normalizedStartedAt = finiteTime(startedAt);
  const normalizedTimeoutMs = Math.max(1000, finiteTime(
    timeoutMs,
    MULTIPLAYER_SUSPEND_WAKE_PROBE_TIMEOUT_MS
  ));

  return Object.freeze({
    version: 1,
    incidentId: normalizedIncidentId,
    runId: normalizedRunId,
    startedAt: normalizedStartedAt,
    timeoutMs: normalizedTimeoutMs,
    deadlineAt: normalizedStartedAt + normalizedTimeoutMs
  });
}

export function evaluateMultiplayerSuspendWakeProbe({
  probe = null,
  now = Date.now(),
  online = true,
  transportState = '',
  networkQuality = null,
  pingIssued = false,
  freshSilenceMs = MULTIPLAYER_SUSPEND_WAKE_FRESH_SILENCE_MS
} = {}) {
  const checkedAt = finiteTime(now);
  if (!probe || typeof probe !== 'object') {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-suspend-wake-probe',
      action: 'REFRESH',
      blocking: true,
      final: true,
      checkedAt
    });
  }

  const normalized = createMultiplayerSuspendWakeProbe({
    incidentId: probe.incidentId,
    runId: probe.runId,
    startedAt: probe.startedAt,
    timeoutMs: probe.timeoutMs
  });
  if (!normalized) {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-suspend-wake-probe',
      action: 'REFRESH',
      blocking: true,
      final: true,
      checkedAt
    });
  }

  const state = normalizeTransportState(transportState);
  const quality = normalizeNetworkQuality(networkQuality);
  const elapsedMs = Math.max(0, checkedAt - normalized.startedAt);
  const remainingMs = Math.max(0, normalized.deadlineAt - checkedAt);
  const silenceLimit = Math.max(100, finiteTime(
    freshSilenceMs,
    MULTIPLAYER_SUSPEND_WAKE_FRESH_SILENCE_MS
  ));
  const freshPong = quality.lastPongAt > normalized.startedAt;
  const freshEnvelope = (
    elapsedMs >= MULTIPLAYER_SUSPEND_WAKE_PROBE_POLL_MS
    && quality.silenceMs <= silenceLimit
  );

  const base = {
    ...normalized,
    checkedAt,
    elapsedMs,
    remainingMs,
    online: online !== false,
    transportState: state || null,
    networkQuality: quality,
    pingIssued: pingIssued === true
  };

  if (online === false) {
    return Object.freeze({
      ...base,
      status: 'WAITING_ONLINE',
      health: 'WARN',
      reason: 'suspend-wake-probe-waiting-for-network',
      action: 'WAIT_ONLINE',
      blocking: true,
      final: false
    });
  }

  if (state === 'connected' && (freshPong || freshEnvelope)) {
    return Object.freeze({
      ...base,
      status: 'HEALTHY',
      health: 'PASS',
      reason: freshPong
        ? 'suspend-wake-probe-pong-confirmed'
        : 'suspend-wake-probe-envelope-confirmed',
      action: 'CONTINUE',
      blocking: false,
      final: true
    });
  }

  if (
    ['disconnected', 'error'].includes(state)
    || checkedAt >= normalized.deadlineAt
  ) {
    return Object.freeze({
      ...base,
      status: 'STALE',
      health: 'FAIL',
      reason: ['disconnected', 'error'].includes(state)
        ? 'suspend-wake-probe-transport-stale'
        : 'suspend-wake-probe-timeout',
      action: 'REFRESH',
      blocking: true,
      final: true
    });
  }

  return Object.freeze({
    ...base,
    status: 'PROBING',
    health: 'WARN',
    reason: state === 'connected'
      ? 'suspend-wake-probe-awaiting-response'
      : 'suspend-wake-probe-awaiting-connection',
    action: 'POLL',
    blocking: true,
    final: false
  });
}
