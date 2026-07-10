// js/multiplayer/tab_epoch_fence_core.js
// M3.69-M3.70 — deterministic lease-epoch fencing for stale owners.

export const MULTIPLAYER_TAB_EPOCH_FENCE_PATCH = 'm3-production-release-manifest-r1';
export const MULTIPLAYER_TAB_EPOCH_FENCE_PROTOCOL = 6;
export const MULTIPLAYER_TAB_EPOCH_FENCE_BUILD = 'm3-team-final-world-reconnect-r3';

function finiteTime(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function normalizeId(value = '', limit = 160) {
  return cleanText(value)
    .replace(/[^a-zA-Z0-9:_-]+/g, '')
    .slice(0, limit);
}

function normalizeLease(value = null) {
  if (!value || typeof value !== 'object') return null;
  const instanceId = normalizeId(value.instanceId);
  const pageId = normalizeId(value.pageId);
  const epoch = Math.max(1, finiteTime(value.epoch, 1));
  if (!instanceId || !pageId) return null;
  return Object.freeze({
    instanceId,
    pageId,
    epoch
  });
}

export function evaluateMultiplayerTabLeaseWriteFence({
  currentLease = null,
  nextLease = null
} = {}) {
  const current = normalizeLease(currentLease);
  const next = normalizeLease(nextLease);

  if (!next) {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'tab-epoch-fence-invalid-next-lease',
      action: 'BLOCK',
      allowed: false,
      final: true
    });
  }

  if (!current) {
    return Object.freeze({
      status: 'ALLOW',
      health: 'PASS',
      reason: 'tab-epoch-fence-initial-acquire',
      action: 'WRITE',
      allowed: true,
      currentLease: null,
      nextLease: next,
      final: true
    });
  }

  const sameOwner = (
    current.instanceId === next.instanceId
    && current.pageId === next.pageId
  );

  if (sameOwner && next.epoch === current.epoch) {
    return Object.freeze({
      status: 'ALLOW',
      health: 'PASS',
      reason: 'tab-epoch-fence-owner-renew',
      action: 'WRITE',
      allowed: true,
      currentLease: current,
      nextLease: next,
      final: true
    });
  }

  if (next.epoch > current.epoch) {
    return Object.freeze({
      status: 'ALLOW',
      health: 'PASS',
      reason: sameOwner
        ? 'tab-epoch-fence-owner-generation-advance'
        : 'tab-epoch-fence-owner-supersede',
      action: 'WRITE',
      allowed: true,
      currentLease: current,
      nextLease: next,
      final: true
    });
  }

  return Object.freeze({
    status: 'FENCED',
    health: 'WARN',
    reason: sameOwner
      ? 'tab-epoch-fence-stale-owner-generation'
      : 'tab-epoch-fence-stale-owner-write',
    action: 'BLOCK',
    allowed: false,
    currentLease: current,
    nextLease: next,
    final: true
  });
}

export function evaluateMultiplayerTabEpochFence({
  lease = null,
  storedLease = null,
  transport = null,
  now = Date.now()
} = {}) {
  const checkedAt = finiteTime(now);
  const localOwner = lease?.owner === true;
  const localBlocking = lease?.blocking === true;
  const localStatus = cleanText(lease?.status).toUpperCase().slice(0, 60);
  const localInstanceId = normalizeId(lease?.instanceId);
  const localPageId = normalizeId(lease?.pageId);
  const proposedLease = normalizeLease(lease?.nextLease || lease?.lease);
  const stored = normalizeLease(storedLease);

  const expectedInstanceId = (
    proposedLease?.instanceId
    || localInstanceId
  );
  const expectedPageId = (
    proposedLease?.pageId
    || localPageId
  );
  const expectedEpoch = proposedLease?.epoch || 0;

  const storedMatchesLocalOwner = Boolean(
    localOwner
    && stored
    && stored.instanceId === expectedInstanceId
    && stored.pageId === expectedPageId
    && (
      expectedEpoch === 0
      || stored.epoch === expectedEpoch
    )
  );

  const transportStatus = cleanText(transport?.status)
    .toUpperCase()
    .slice(0, 60);
  const transportState = cleanText(transport?.transportState)
    .toLowerCase()
    .slice(0, 40);
  const transportMode = cleanText(transport?.transportMode)
    .toLowerCase()
    .slice(0, 40);
  const quiesced = transport?.quiesced === true;
  const connectedOnline = (
    transportMode === 'online'
    && transportState === 'connected'
    && !quiesced
  );

  const base = {
    version: 1,
    checkedAt,
    leaseStatus: localStatus || null,
    localOwner,
    localBlocking,
    storedMatchesLocalOwner,
    expectedInstanceId: expectedInstanceId || null,
    expectedPageId: expectedPageId || null,
    expectedEpoch,
    storedLease: stored,
    transportStatus: transportStatus || null,
    transportState: transportState || null,
    transportMode: transportMode || null,
    quiesced
  };

  if (localOwner) {
    if (!storedMatchesLocalOwner) {
      return Object.freeze({
        ...base,
        status: 'FENCED',
        health: 'FAIL',
        reason: 'tab-epoch-fence-owner-superseded',
        action: 'QUIESCE',
        blocking: true,
        final: true
      });
    }

    if (connectedOnline && transportStatus === 'OWNER_CONNECTED') {
      return Object.freeze({
        ...base,
        status: 'SEALED',
        health: 'PASS',
        reason: 'tab-epoch-fence-active-owner-confirmed',
        action: 'NONE',
        blocking: false,
        final: true
      });
    }

    return Object.freeze({
      ...base,
      status: 'RECOVERING',
      health: 'WARN',
      reason: 'tab-epoch-fence-owner-transport-recovery',
      action: 'RESUME',
      blocking: true,
      final: false
    });
  }

  if (localBlocking) {
    if (connectedOnline) {
      return Object.freeze({
        ...base,
        status: 'VIOLATION',
        health: 'FAIL',
        reason: 'tab-epoch-fence-passive-tab-connected',
        action: 'QUIESCE',
        blocking: true,
        final: true
      });
    }

    if (
      quiesced
      || transportStatus === 'QUIESCED'
      || transportState === 'disconnected'
    ) {
      return Object.freeze({
        ...base,
        status: 'SEALED',
        health: 'PASS',
        reason: 'tab-epoch-fence-passive-tab-confirmed',
        action: 'NONE',
        blocking: true,
        final: true
      });
    }

    return Object.freeze({
      ...base,
      status: 'RECOVERING',
      health: 'WARN',
      reason: 'tab-epoch-fence-passive-tab-quiescing',
      action: 'QUIESCE',
      blocking: true,
      final: false
    });
  }

  return Object.freeze({
    ...base,
    status: 'READY',
    health: 'PASS',
    reason: 'tab-epoch-fence-ready',
    action: 'NONE',
    blocking: false,
    final: false
  });
}
