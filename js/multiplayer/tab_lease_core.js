// js/multiplayer/tab_lease_core.js
// M3.61-M3.62 — deterministic browser-instance ownership lease policy.

export const MULTIPLAYER_TAB_LEASE_PATCH = 'm3-tab-ownership-seal-r1';
export const MULTIPLAYER_TAB_LEASE_PROTOCOL = 6;
export const MULTIPLAYER_TAB_LEASE_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_TAB_LEASE_TTL_MS = 6500;
export const MULTIPLAYER_TAB_LEASE_RENEW_MS = 2000;

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

export function createMultiplayerTabLease({
  instanceId = '',
  pageId = '',
  epoch = 1,
  acquiredAt = Date.now(),
  heartbeatAt = acquiredAt,
  ttlMs = MULTIPLAYER_TAB_LEASE_TTL_MS,
  reason = 'acquire'
} = {}) {
  const normalizedInstanceId = normalizeId(instanceId);
  const normalizedPageId = normalizeId(pageId);
  if (!normalizedInstanceId || !normalizedPageId) return null;

  const normalizedAcquiredAt = finiteTime(acquiredAt);
  const normalizedHeartbeatAt = Math.max(
    normalizedAcquiredAt,
    finiteTime(heartbeatAt, normalizedAcquiredAt)
  );
  const lifetime = Math.max(
    2000,
    finiteTime(ttlMs, MULTIPLAYER_TAB_LEASE_TTL_MS)
  );

  return Object.freeze({
    version: 1,
    instanceId: normalizedInstanceId,
    pageId: normalizedPageId,
    epoch: Math.max(1, finiteTime(epoch, 1)),
    acquiredAt: normalizedAcquiredAt,
    heartbeatAt: normalizedHeartbeatAt,
    expiresAt: normalizedHeartbeatAt + lifetime,
    reason: cleanText(reason, 'acquire').slice(0, 80)
  });
}

export function normalizeMultiplayerTabLease(value = null) {
  if (!value || typeof value !== 'object') return null;
  return createMultiplayerTabLease({
    instanceId: value.instanceId,
    pageId: value.pageId,
    epoch: value.epoch,
    acquiredAt: value.acquiredAt,
    heartbeatAt: value.heartbeatAt,
    ttlMs: Math.max(
      2000,
      finiteTime(value.expiresAt) - finiteTime(value.heartbeatAt)
    ),
    reason: value.reason
  });
}

export function evaluateMultiplayerTabLease({
  lease = null,
  instanceId = '',
  pageId = '',
  now = Date.now(),
  activeRun = false,
  allowSameInstanceHandoff = false,
  forceTakeover = false,
  ttlMs = MULTIPLAYER_TAB_LEASE_TTL_MS
} = {}) {
  const checkedAt = finiteTime(now);
  const normalizedInstanceId = normalizeId(instanceId);
  const normalizedPageId = normalizeId(pageId);
  const normalizedLease = normalizeMultiplayerTabLease(lease);

  if (!normalizedInstanceId || !normalizedPageId) {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-tab-instance-identity',
      action: 'NONE',
      blocking: true,
      final: true,
      checkedAt
    });
  }

  const base = {
    checkedAt,
    instanceId: normalizedInstanceId,
    pageId: normalizedPageId,
    lease: normalizedLease
  };

  if (activeRun !== true) {
    return Object.freeze({
      ...base,
      status: 'INACTIVE',
      health: 'PASS',
      reason: 'tab-lease-no-active-run',
      action: normalizedLease?.instanceId === normalizedInstanceId
        && normalizedLease?.pageId === normalizedPageId
        ? 'RELEASE'
        : 'NONE',
      blocking: false,
      owner: false,
      final: true
    });
  }

  const expired = (
    !normalizedLease
    || checkedAt > normalizedLease.expiresAt
  );

  if (expired) {
    const nextLease = createMultiplayerTabLease({
      instanceId: normalizedInstanceId,
      pageId: normalizedPageId,
      epoch: Math.max(1, finiteTime(normalizedLease?.epoch) + 1),
      acquiredAt: checkedAt,
      heartbeatAt: checkedAt,
      ttlMs,
      reason: normalizedLease ? 'expired-takeover' : 'acquire'
    });
    return Object.freeze({
      ...base,
      status: 'OWNED',
      health: 'PASS',
      reason: normalizedLease
        ? 'tab-lease-expired-owner-replaced'
        : 'tab-lease-acquired',
      action: 'ACQUIRE',
      blocking: false,
      owner: true,
      nextLease,
      final: true
    });
  }

  const exactOwner = (
    normalizedLease.instanceId === normalizedInstanceId
    && normalizedLease.pageId === normalizedPageId
  );

  if (exactOwner) {
    const nextLease = createMultiplayerTabLease({
      ...normalizedLease,
      heartbeatAt: checkedAt,
      ttlMs,
      reason: 'renew'
    });
    return Object.freeze({
      ...base,
      status: 'OWNED',
      health: 'PASS',
      reason: 'tab-lease-renewed',
      action: 'RENEW',
      blocking: false,
      owner: true,
      nextLease,
      final: true
    });
  }

  const sameInstance = normalizedLease.instanceId === normalizedInstanceId;
  if (sameInstance && allowSameInstanceHandoff === true) {
    const nextLease = createMultiplayerTabLease({
      instanceId: normalizedInstanceId,
      pageId: normalizedPageId,
      epoch: normalizedLease.epoch + 1,
      acquiredAt: checkedAt,
      heartbeatAt: checkedAt,
      ttlMs,
      reason: 'reload-handoff'
    });
    return Object.freeze({
      ...base,
      status: 'OWNED',
      health: 'PASS',
      reason: 'tab-lease-reload-handoff',
      action: 'HANDOFF',
      blocking: false,
      owner: true,
      nextLease,
      final: true
    });
  }

  if (forceTakeover === true) {
    const nextLease = createMultiplayerTabLease({
      instanceId: normalizedInstanceId,
      pageId: normalizedPageId,
      epoch: normalizedLease.epoch + 1,
      acquiredAt: checkedAt,
      heartbeatAt: checkedAt,
      ttlMs,
      reason: 'explicit-takeover'
    });
    return Object.freeze({
      ...base,
      status: 'OWNED',
      health: 'WARN',
      reason: 'tab-lease-explicit-takeover',
      action: 'TAKEOVER',
      blocking: false,
      owner: true,
      nextLease,
      final: true
    });
  }

  return Object.freeze({
    ...base,
    status: 'CONFLICT',
    health: 'WARN',
    reason: sameInstance
      ? 'tab-lease-duplicate-instance'
      : 'tab-lease-owned-by-another-tab',
    action: 'BLOCK',
    blocking: true,
    owner: false,
    ownerInstanceId: normalizedLease.instanceId,
    ownerPageId: normalizedLease.pageId,
    ownerEpoch: normalizedLease.epoch,
    remainingMs: Math.max(0, normalizedLease.expiresAt - checkedAt),
    final: false
  });
}
