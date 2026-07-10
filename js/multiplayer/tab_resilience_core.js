// js/multiplayer/tab_resilience_core.js
// M3.65-M3.66 — deterministic single-tab ownership final seal.

export const MULTIPLAYER_TAB_RESILIENCE_PATCH = 'm3-final-certification-seal-r1';
export const MULTIPLAYER_TAB_RESILIENCE_PROTOCOL = 6;
export const MULTIPLAYER_TAB_RESILIENCE_BUILD = 'm3-team-final-world-reconnect-r3';

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
    owner: value.owner === true,
    final: value.final === true,
    instanceId: cleanText(value.instanceId).slice(0, 160) || null,
    pageId: cleanText(value.pageId).slice(0, 160) || null,
    transportState: cleanText(value.transportState).toLowerCase().slice(0, 40) || null,
    transportMode: cleanText(value.transportMode).toLowerCase().slice(0, 40) || null,
    quiesced: value.quiesced === true,
    checkedAt: finiteTime(value.checkedAt)
  });
}

export function evaluateMultiplayerTabResilience({
  lease = null,
  transport = null,
  activeRun = false,
  leaseStored = false,
  storedOwnerMatches = false,
  now = Date.now()
} = {}) {
  const checkedAt = finiteTime(now);
  const normalizedLease = normalizeSnapshot(lease);
  const normalizedTransport = normalizeSnapshot(transport);
  const leaseStatus = normalizedLease?.status || null;
  const transportStatus = normalizedTransport?.status || null;

  const base = {
    version: 1,
    checkedAt,
    activeRun: activeRun === true,
    leaseStored: leaseStored === true,
    storedOwnerMatches: storedOwnerMatches === true,
    lease: normalizedLease,
    transport: normalizedTransport
  };

  const contradiction = (reason, blocking = true) => Object.freeze({
    ...base,
    status: 'FAILED',
    health: 'FAIL',
    reason,
    continuity: 'OWNERSHIP_CONTRADICTION',
    blocking,
    sealed: false,
    final: true
  });

  if (
    ['FAILED', 'STORAGE_BLOCKED', 'INVALID'].includes(leaseStatus)
    || ['RESUME_FAILED', 'INVALID'].includes(transportStatus)
  ) {
    return Object.freeze({
      ...base,
      status: 'FAILED',
      health: 'FAIL',
      reason:
        normalizedTransport?.reason
        || normalizedLease?.reason
        || 'tab-resilience-runtime-failed',
      continuity: 'OWNERSHIP_FAILED',
      blocking: true,
      sealed: false,
      final: true
    });
  }

  if (activeRun !== true) {
    if (leaseStored === true) {
      return contradiction('tab-resilience-inactive-retained-lease', false);
    }
    if (
      ['OWNER_CONNECTED', 'RESUMING'].includes(transportStatus)
      || (
        normalizedTransport?.transportMode === 'online'
        && normalizedTransport?.transportState === 'connected'
      )
    ) {
      return contradiction('tab-resilience-inactive-connected-transport', false);
    }
    return Object.freeze({
      ...base,
      status: 'SEALED',
      health: 'PASS',
      reason: 'tab-resilience-lease-released',
      continuity: 'LEASE_RELEASED',
      blocking: false,
      sealed: true,
      final: true
    });
  }

  if (
    normalizedLease?.owner === true
    && normalizedLease?.blocking === false
  ) {
    if (
      transportStatus === 'OWNER_CONNECTED'
      && normalizedTransport?.blocking === false
      && leaseStored === true
      && storedOwnerMatches === true
    ) {
      return Object.freeze({
        ...base,
        status: 'SEALED',
        health: 'PASS',
        reason: 'tab-resilience-active-owner-sealed',
        continuity: 'ACTIVE_OWNER',
        blocking: false,
        sealed: true,
        final: true
      });
    }

    if (
      ['RESUMING', 'OWNER_WAITING', 'WAITING'].includes(transportStatus)
      || transportStatus == null
    ) {
      return Object.freeze({
        ...base,
        status: 'RECOVERING',
        health: 'WARN',
        reason:
          normalizedTransport?.reason
          || 'tab-resilience-owner-transport-recovery',
        continuity: 'OWNER_RECOVERY',
        blocking: true,
        sealed: false,
        final: false
      });
    }

    if (
      transportStatus === 'QUIESCED'
      || normalizedTransport?.quiesced === true
      || normalizedTransport?.transportState === 'disconnected'
    ) {
      return contradiction('tab-resilience-owner-transport-quiesced');
    }

    if (leaseStored !== true || storedOwnerMatches !== true) {
      return contradiction('tab-resilience-owner-lease-not-confirmed');
    }
  }

  if (
    normalizedLease?.blocking === true
    && normalizedLease?.owner === false
  ) {
    if (
      transportStatus === 'QUIESCED'
      && normalizedTransport?.blocking === true
    ) {
      return Object.freeze({
        ...base,
        status: 'SEALED',
        health: 'PASS',
        reason: 'tab-resilience-passive-tab-sealed',
        continuity: 'PASSIVE_TAB',
        blocking: true,
        sealed: true,
        final: true
      });
    }

    if (
      transportStatus === 'QUIESCING'
      || transportStatus === 'WAITING'
      || transportStatus == null
    ) {
      return Object.freeze({
        ...base,
        status: 'RECOVERING',
        health: 'WARN',
        reason:
          normalizedTransport?.reason
          || 'tab-resilience-passive-tab-quiescing',
        continuity: 'PASSIVE_QUIESCENCE',
        blocking: true,
        sealed: false,
        final: false
      });
    }

    if (
      transportStatus === 'OWNER_CONNECTED'
      || (
        normalizedTransport?.transportMode === 'online'
        && normalizedTransport?.transportState === 'connected'
      )
    ) {
      return contradiction('tab-resilience-passive-tab-connected');
    }
  }

  if (
    ['PROBING', 'OWNED', 'CONFLICT'].includes(leaseStatus)
    || ['WAITING', 'QUIESCING', 'RESUMING'].includes(transportStatus)
  ) {
    return Object.freeze({
      ...base,
      status: 'OBSERVING',
      health: 'WARN',
      reason: 'tab-resilience-ownership-transition',
      continuity: 'OWNERSHIP_TRANSITION',
      blocking:
        normalizedLease?.blocking === true
        || normalizedTransport?.blocking === true,
      sealed: false,
      final: false
    });
  }

  return Object.freeze({
    ...base,
    status: 'READY',
    health: 'PASS',
    reason: 'tab-resilience-guard-ready',
    continuity: 'IDLE',
    blocking: normalizedLease?.blocking === true,
    sealed: false,
    final: false
  });
}
