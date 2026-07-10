// js/multiplayer/tab_recovery_seal_core.js
// M3.71-M3.72 — deterministic single-tab recovery final seal.

export const MULTIPLAYER_TAB_RECOVERY_SEAL_PATCH = 'm3-tab-recovery-seal-r1';
export const MULTIPLAYER_TAB_RECOVERY_SEAL_PROTOCOL = 6;
export const MULTIPLAYER_TAB_RECOVERY_SEAL_BUILD = 'm3-team-final-world-reconnect-r3';

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function finiteTime(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function normalizeSnapshot(value = null) {
  if (!value || typeof value !== 'object') return null;
  return Object.freeze({
    status: cleanText(value.status).toUpperCase().slice(0, 80) || null,
    health: cleanText(value.health).toUpperCase().slice(0, 20) || null,
    reason: cleanText(value.reason).slice(0, 220) || null,
    action: cleanText(value.action).toUpperCase().slice(0, 80) || null,
    continuity: cleanText(value.continuity).toUpperCase().slice(0, 80) || null,
    blocking: value.blocking === true,
    owner: value.owner === true,
    sealed: value.sealed === true,
    final: value.final === true,
    quiesced: value.quiesced === true,
    storedMatchesLocalOwner: value.storedMatchesLocalOwner === true,
    expectedEpoch: finiteTime(value.expectedEpoch),
    checkedAt: finiteTime(value.checkedAt)
  });
}

export function evaluateMultiplayerTabRecoverySeal({
  lease = null,
  transport = null,
  resilience = null,
  ownerProbe = null,
  epochFence = null,
  activeRun = false,
  now = Date.now()
} = {}) {
  const checkedAt = finiteTime(now);
  const normalizedLease = normalizeSnapshot(lease);
  const normalizedTransport = normalizeSnapshot(transport);
  const normalizedResilience = normalizeSnapshot(resilience);
  const normalizedProbe = normalizeSnapshot(ownerProbe);
  const normalizedFence = normalizeSnapshot(epochFence);

  const leaseStatus = normalizedLease?.status || null;
  const transportStatus = normalizedTransport?.status || null;
  const resilienceStatus = normalizedResilience?.status || null;
  const fenceStatus = normalizedFence?.status || null;

  const base = {
    version: 1,
    checkedAt,
    activeRun: activeRun === true,
    lease: normalizedLease,
    transport: normalizedTransport,
    resilience: normalizedResilience,
    ownerProbe: normalizedProbe,
    epochFence: normalizedFence
  };

  const failed = (reason, continuity = 'RECOVERY_CONTRADICTION') =>
    Object.freeze({
      ...base,
      status: 'FAILED',
      health: 'FAIL',
      reason,
      continuity,
      blocking: true,
      sealed: false,
      final: true
    });

  if (
    ['FAILED', 'STORAGE_BLOCKED', 'INVALID'].includes(leaseStatus)
    || ['RESUME_FAILED', 'INVALID'].includes(transportStatus)
    || resilienceStatus === 'FAILED'
    || fenceStatus === 'VIOLATION'
  ) {
    return failed(
      normalizedFence?.reason
      || normalizedResilience?.reason
      || normalizedTransport?.reason
      || normalizedLease?.reason
      || 'tab-recovery-seal-runtime-failed',
      'RECOVERY_FAILED'
    );
  }

  if (activeRun !== true) {
    if (
      leaseStatus !== 'INACTIVE'
      || normalizedLease?.owner === true
      || normalizedLease?.blocking === true
    ) {
      return failed('tab-recovery-seal-inactive-lease-retained');
    }

    if (
      !['INACTIVE', 'QUIESCED', null].includes(transportStatus)
      && normalizedTransport?.quiesced !== true
    ) {
      return failed('tab-recovery-seal-inactive-transport-active');
    }

    return Object.freeze({
      ...base,
      status: 'SEALED',
      health: 'PASS',
      reason: 'tab-recovery-seal-lease-released',
      continuity: 'LEASE_RELEASED',
      blocking: false,
      sealed: true,
      final: true
    });
  }

  if (fenceStatus === 'FENCED') {
    if (
      normalizedFence?.action !== 'QUIESCE'
      || normalizedLease?.owner === true
      || normalizedLease?.blocking !== true
    ) {
      return failed('tab-recovery-seal-fenced-owner-not-demoted');
    }

    if (
      transportStatus !== 'QUIESCED'
      && normalizedTransport?.quiesced !== true
    ) {
      return Object.freeze({
        ...base,
        status: 'RECOVERING',
        health: 'WARN',
        reason: 'tab-recovery-seal-fenced-owner-quiescing',
        continuity: 'FENCED_OWNER_SHUTDOWN',
        blocking: true,
        sealed: false,
        final: false
      });
    }

    return Object.freeze({
      ...base,
      status: 'SEALED',
      health: 'PASS',
      reason: 'tab-recovery-seal-fenced-owner-shut-down',
      continuity: 'FENCED_OWNER',
      blocking: true,
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
      && resilienceStatus === 'SEALED'
      && normalizedResilience?.continuity === 'ACTIVE_OWNER'
      && fenceStatus === 'SEALED'
      && normalizedFence?.blocking === false
    ) {
      const reclaimed = (
        normalizedProbe?.status === 'STALE'
        || normalizedLease?.action === 'RECLAIM'
        || normalizedLease?.reason === 'tab-lease-stale-owner-reclaimed'
      );

      return Object.freeze({
        ...base,
        status: 'SEALED',
        health: 'PASS',
        reason: reclaimed
          ? 'tab-recovery-seal-reclaimed-owner-active'
          : 'tab-recovery-seal-active-owner',
        continuity: reclaimed ? 'RECLAIMED_OWNER' : 'ACTIVE_OWNER',
        blocking: false,
        sealed: true,
        final: true
      });
    }

    return Object.freeze({
      ...base,
      status: 'RECOVERING',
      health: 'WARN',
      reason: 'tab-recovery-seal-owner-convergence',
      continuity: 'OWNER_RECOVERY',
      blocking: true,
      sealed: false,
      final: false
    });
  }

  if (
    normalizedLease?.owner === false
    && normalizedLease?.blocking === true
  ) {
    if (
      transportStatus === 'QUIESCED'
      && resilienceStatus === 'SEALED'
      && normalizedResilience?.continuity === 'PASSIVE_TAB'
      && ['SEALED', 'READY', null].includes(fenceStatus)
    ) {
      return Object.freeze({
        ...base,
        status: 'SEALED',
        health: 'PASS',
        reason: 'tab-recovery-seal-passive-tab',
        continuity: 'PASSIVE_TAB',
        blocking: true,
        sealed: true,
        final: true
      });
    }

    if (
      transportStatus === 'OWNER_CONNECTED'
      || normalizedTransport?.quiesced === false
      && normalizedFence?.action === 'QUIESCE'
    ) {
      return failed('tab-recovery-seal-passive-tab-connected');
    }

    return Object.freeze({
      ...base,
      status: 'RECOVERING',
      health: 'WARN',
      reason: 'tab-recovery-seal-passive-tab-convergence',
      continuity: 'PASSIVE_QUIESCENCE',
      blocking: true,
      sealed: false,
      final: false
    });
  }

  return Object.freeze({
    ...base,
    status: 'OBSERVING',
    health: 'WARN',
    reason: 'tab-recovery-seal-ownership-transition',
    continuity: 'OWNERSHIP_TRANSITION',
    blocking:
      normalizedLease?.blocking === true
      || normalizedTransport?.blocking === true
      || normalizedFence?.blocking === true,
    sealed: false,
    final: false
  });
}
