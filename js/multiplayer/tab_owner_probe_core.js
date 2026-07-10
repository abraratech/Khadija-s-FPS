// js/multiplayer/tab_owner_probe_core.js
// M3.67-M3.68 — deterministic owner liveness challenge and crash reclaim.

export const MULTIPLAYER_TAB_OWNER_PROBE_PATCH = 'm3-tab-recovery-seal-r1';
export const MULTIPLAYER_TAB_OWNER_PROBE_PROTOCOL = 6;
export const MULTIPLAYER_TAB_OWNER_PROBE_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_TAB_OWNER_PROBE_TIMEOUT_MS = 650;

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

function normalizeLeaseOwner(value = null) {
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

export function createMultiplayerTabOwnerProbe({
  probeId = '',
  lease = null,
  challengerInstanceId = '',
  challengerPageId = '',
  startedAt = Date.now(),
  timeoutMs = MULTIPLAYER_TAB_OWNER_PROBE_TIMEOUT_MS
} = {}) {
  const normalizedProbeId = normalizeId(probeId);
  const owner = normalizeLeaseOwner(lease);
  const normalizedChallengerInstanceId = normalizeId(challengerInstanceId);
  const normalizedChallengerPageId = normalizeId(challengerPageId);

  if (
    !normalizedProbeId
    || !owner
    || !normalizedChallengerInstanceId
    || !normalizedChallengerPageId
  ) {
    return null;
  }

  const normalizedStartedAt = finiteTime(startedAt);
  const normalizedTimeoutMs = Math.max(
    200,
    finiteTime(timeoutMs, MULTIPLAYER_TAB_OWNER_PROBE_TIMEOUT_MS)
  );

  return Object.freeze({
    version: 1,
    probeId: normalizedProbeId,
    ownerInstanceId: owner.instanceId,
    ownerPageId: owner.pageId,
    ownerEpoch: owner.epoch,
    challengerInstanceId: normalizedChallengerInstanceId,
    challengerPageId: normalizedChallengerPageId,
    startedAt: normalizedStartedAt,
    timeoutMs: normalizedTimeoutMs,
    deadlineAt: normalizedStartedAt + normalizedTimeoutMs
  });
}

export function isMultiplayerTabOwnerProbeAckValid({
  probe = null,
  ack = null
} = {}) {
  if (!probe || typeof probe !== 'object') return false;
  if (!ack || typeof ack !== 'object') return false;

  return (
    normalizeId(ack.probeId) === probe.probeId
    && normalizeId(ack.ownerInstanceId) === probe.ownerInstanceId
    && normalizeId(ack.ownerPageId) === probe.ownerPageId
    && Math.max(1, finiteTime(ack.ownerEpoch, 1)) === probe.ownerEpoch
  );
}

export function evaluateMultiplayerTabOwnerProbe({
  probe = null,
  currentLease = null,
  ack = null,
  now = Date.now()
} = {}) {
  const checkedAt = finiteTime(now);
  if (!probe || typeof probe !== 'object') {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-tab-owner-probe',
      action: 'REEVALUATE',
      final: true,
      checkedAt
    });
  }

  const normalizedProbe = createMultiplayerTabOwnerProbe({
    probeId: probe.probeId,
    lease: {
      instanceId: probe.ownerInstanceId,
      pageId: probe.ownerPageId,
      epoch: probe.ownerEpoch
    },
    challengerInstanceId: probe.challengerInstanceId,
    challengerPageId: probe.challengerPageId,
    startedAt: probe.startedAt,
    timeoutMs: probe.timeoutMs
  });
  if (!normalizedProbe) {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-tab-owner-probe',
      action: 'REEVALUATE',
      final: true,
      checkedAt
    });
  }

  const currentOwner = normalizeLeaseOwner(currentLease);
  const sameOwner = Boolean(
    currentOwner
    && currentOwner.instanceId === normalizedProbe.ownerInstanceId
    && currentOwner.pageId === normalizedProbe.ownerPageId
    && currentOwner.epoch === normalizedProbe.ownerEpoch
  );

  const base = {
    ...normalizedProbe,
    checkedAt,
    remainingMs: Math.max(0, normalizedProbe.deadlineAt - checkedAt)
  };

  if (!sameOwner) {
    return Object.freeze({
      ...base,
      status: 'LEASE_CHANGED',
      health: 'PASS',
      reason: 'tab-owner-probe-lease-changed',
      action: 'REEVALUATE',
      final: true
    });
  }

  if (isMultiplayerTabOwnerProbeAckValid({
    probe: normalizedProbe,
    ack
  })) {
    return Object.freeze({
      ...base,
      status: 'ALIVE',
      health: 'PASS',
      reason: 'tab-owner-probe-acknowledged',
      action: 'BLOCK',
      final: true
    });
  }

  if (checkedAt >= normalizedProbe.deadlineAt) {
    return Object.freeze({
      ...base,
      status: 'STALE',
      health: 'WARN',
      reason: 'tab-owner-probe-timeout',
      action: 'RECLAIM',
      final: true
    });
  }

  return Object.freeze({
    ...base,
    status: 'PROBING',
    health: 'WARN',
    reason: 'tab-owner-probe-awaiting-ack',
    action: 'WAIT',
    final: false
  });
}
