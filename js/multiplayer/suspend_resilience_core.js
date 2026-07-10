// js/multiplayer/suspend_resilience_core.js
// M3.59-M3.60 — deterministic suspension recovery final seal.

export const MULTIPLAYER_SUSPEND_RESILIENCE_PATCH = 'm3-suspend-resilience-seal-r1';
export const MULTIPLAYER_SUSPEND_RESILIENCE_PROTOCOL = 6;
export const MULTIPLAYER_SUSPEND_RESILIENCE_BUILD = 'm3-team-final-world-reconnect-r3';

function finiteTime(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function normalizeSnapshot(value = null) {
  if (!value || typeof value !== 'object') return null;
  return Object.freeze({
    status: cleanText(value.status).toUpperCase().slice(0, 60) || null,
    health: cleanText(value.health).toUpperCase().slice(0, 20) || null,
    reason: cleanText(value.reason).slice(0, 200) || null,
    action: cleanText(value.action).toUpperCase().slice(0, 60) || null,
    blocking: value.blocking === true,
    final: value.final === true,
    incidentId: cleanText(value.incidentId).slice(0, 160) || null,
    checkedAt: finiteTime(value.checkedAt),
    wakeProbe: value.wakeProbe && typeof value.wakeProbe === 'object'
      ? normalizeSnapshot(value.wakeProbe)
      : null
  });
}

export function evaluateMultiplayerSuspendResilience({
  guard = null,
  probe = null,
  handoffActive = false,
  incidentStored = false,
  now = Date.now()
} = {}) {
  const checkedAt = finiteTime(now);
  const normalizedGuard = normalizeSnapshot(guard);
  const normalizedProbe = normalizeSnapshot(probe);
  const guardStatus = normalizedGuard?.status || 'IDLE';
  const probeStatus = normalizedProbe?.status || null;

  const base = {
    version: 1,
    checkedAt,
    guard: normalizedGuard,
    probe: normalizedProbe,
    handoffActive: handoffActive === true,
    incidentStored: incidentStored === true
  };

  const contradiction = (reason) => Object.freeze({
    ...base,
    status: 'FAILED',
    health: 'FAIL',
    reason,
    continuity: 'RESILIENCE_CONTRADICTION',
    blocking: true,
    sealed: false,
    final: true
  });

  if (
    ['FAILED', 'ARM_FAILED', 'INVALID'].includes(guardStatus)
    || probeStatus === 'INVALID'
  ) {
    return Object.freeze({
      ...base,
      status: 'FAILED',
      health: 'FAIL',
      reason:
        normalizedGuard?.reason
        || normalizedProbe?.reason
        || 'suspend-resilience-runtime-failed',
      continuity: 'RECOVERY_FAILED',
      blocking: true,
      sealed: false,
      final: true
    });
  }

  if (guardStatus === 'RESUMED_LIVE') {
    const effectiveProbe = normalizedGuard?.wakeProbe || normalizedProbe;
    if (
      effectiveProbe?.status !== 'HEALTHY'
      || normalizedGuard.blocking === true
      || normalizedGuard.action !== 'CONTINUE'
      || incidentStored === true
    ) {
      return contradiction('suspend-resilience-live-resume-contradiction');
    }

    return Object.freeze({
      ...base,
      status: 'SEALED',
      health: 'PASS',
      reason: 'suspend-resilience-live-socket-sealed',
      continuity: 'LIVE_SOCKET',
      blocking: false,
      sealed: true,
      final: true
    });
  }

  if (guardStatus === 'ARMED') {
    if (
      normalizedGuard.action !== 'RELOAD'
      || normalizedGuard.blocking !== true
    ) {
      return contradiction('suspend-resilience-refresh-arm-contradiction');
    }

    return Object.freeze({
      ...base,
      status: 'SEALED',
      health: 'PASS',
      reason: 'suspend-resilience-safe-refresh-armed',
      continuity: 'SAFE_REFRESH_ARMED',
      blocking: true,
      sealed: true,
      final: true
    });
  }

  if (guardStatus === 'HANDOFF' || handoffActive === true) {
    if (incidentStored === true) {
      return contradiction('suspend-resilience-handoff-retained-incident');
    }

    return Object.freeze({
      ...base,
      status: 'SEALED',
      health: 'PASS',
      reason: 'suspend-resilience-refresh-handoff-sealed',
      continuity: 'SAFE_REFRESH_HANDOFF',
      blocking: false,
      sealed: true,
      final: true
    });
  }

  if (
    ['WAITING_ONLINE', 'PROBE_REQUIRED', 'RECOVERY_ACTIVE'].includes(guardStatus)
    || ['PROBING', 'WAITING_ONLINE', 'STALE'].includes(probeStatus)
  ) {
    return Object.freeze({
      ...base,
      status: 'RECOVERING',
      health: 'WARN',
      reason:
        normalizedProbe?.reason
        || normalizedGuard?.reason
        || 'suspend-resilience-recovery-active',
      continuity: 'RECOVERY_ACTIVE',
      blocking: true,
      sealed: false,
      final: false
    });
  }

  if (guardStatus === 'SUSPENDED') {
    return Object.freeze({
      ...base,
      status: 'OBSERVING',
      health: 'PASS',
      reason: 'suspend-resilience-tab-hidden',
      continuity: 'SUSPENDED',
      blocking: false,
      sealed: false,
      final: false
    });
  }

  return Object.freeze({
    ...base,
    status: 'READY',
    health: 'PASS',
    reason: 'suspend-resilience-guard-ready',
    continuity: 'IDLE',
    blocking: normalizedGuard?.blocking === true,
    sealed: false,
    final: false
  });
}
