// M4.51-M4.54 — deterministic cloud-sync retry, lease, integrity, and deletion helpers.

export const CLOUD_RELIABILITY_PATCH = 'm4-cloud-sync-reliability-r1';
export const CLOUD_SYNC_QUEUE_LIMIT = 2;
export const CLOUD_SYNC_QUEUE_MAX_BYTES = 2_900_000;
export const CLOUD_SYNC_BACKOFF_BASE_MS = 2_000;
export const CLOUD_SYNC_BACKOFF_MAX_MS = 5 * 60_000;
export const CLOUD_SYNC_LEASE_MS = 15_000;
export const CLOUD_SYNC_LEASE_RENEW_MS = 5_000;
export const CLOUD_CLOCK_SKEW_WARNING_MS = 5 * 60_000;
export const CLOUD_ACTIVITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const CLOUD_TOMBSTONE_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function integer(value, fallback = 0, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, fallback))));
}
function clean(value, fallback = '', limit = 240) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function validOperationId(value) {
  return /^[a-zA-Z0-9:_-]{12,180}$/.test(String(value || ''));
}
function validChecksum(value) {
  return /^[a-f0-9]{8,128}$/i.test(String(value || ''));
}

export function createSyncQueueEntry({
  operationId,
  profile,
  expectedCloudRevision = 0,
  fingerprint = '',
  checksum = '',
  reason = 'sync',
  now = Date.now(),
  queuedAt = now,
  attempts = 0,
  nextAttemptAt = queuedAt,
  lastAttemptAt = 0,
  lastError = ''
} = {}) {
  if (!validOperationId(operationId)) throw new TypeError('SYNC_OPERATION_ID_INVALID');
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new TypeError('SYNC_PROFILE_INVALID');
  const profileCopy = clone(profile);
  const entryChecksum = clean(checksum || profileCopy.legacyFingerprint, '', 128).toLowerCase();
  if (!validChecksum(entryChecksum)) throw new TypeError('SYNC_CHECKSUM_INVALID');
  return Object.freeze({
    operationId: clean(operationId, '', 180),
    reason: clean(reason, 'sync', 80),
    expectedCloudRevision: integer(expectedCloudRevision, 0),
    fingerprint: clean(fingerprint || profileCopy.legacyFingerprint || entryChecksum, entryChecksum, 128),
    checksum: entryChecksum,
    profile: profileCopy,
    queuedAt: integer(queuedAt, now, 1),
    attempts: integer(attempts, 0, 0, 1000),
    nextAttemptAt: integer(nextAttemptAt, queuedAt, 1),
    lastAttemptAt: integer(lastAttemptAt, 0),
    lastError: clean(lastError, '', 160)
  });
}

export function normalizeSyncQueue(value, { now = Date.now() } = {}) {
  const source = Array.isArray(value) ? value : [];
  const byOperation = new Map();
  for (const raw of source) {
    const item = object(raw);
    if (!validOperationId(item.operationId) || !item.profile || typeof item.profile !== 'object') continue;
    const checksum = clean(item.checksum || item.profile?.legacyFingerprint, '', 128).toLowerCase();
    if (!validChecksum(checksum)) continue;
    const normalized = {
      operationId: clean(item.operationId, '', 180),
      reason: clean(item.reason, 'sync', 80),
      expectedCloudRevision: integer(item.expectedCloudRevision, 0),
      fingerprint: clean(item.fingerprint || item.profile?.legacyFingerprint || checksum, checksum, 128),
      checksum,
      profile: clone(item.profile),
      queuedAt: integer(item.queuedAt, now, 1),
      attempts: integer(item.attempts, 0, 0, 1000),
      nextAttemptAt: integer(item.nextAttemptAt, now, 1),
      lastAttemptAt: integer(item.lastAttemptAt, 0),
      lastError: clean(item.lastError, '', 160)
    };
    byOperation.set(normalized.operationId, normalized);
  }
  let result = [...byOperation.values()].sort((a, b) => a.queuedAt - b.queuedAt || a.operationId.localeCompare(b.operationId));
  const latestByFingerprint = new Map();
  for (const item of result) latestByFingerprint.set(item.fingerprint, item);
  result = [...latestByFingerprint.values()].sort((a, b) => a.queuedAt - b.queuedAt || a.operationId.localeCompare(b.operationId));
  result = result.slice(-CLOUD_SYNC_QUEUE_LIMIT);
  while (result.length > 1 && JSON.stringify(result).length > CLOUD_SYNC_QUEUE_MAX_BYTES) result.shift();
  return Object.freeze(result.map((entry) => Object.freeze(entry)));
}

export function enqueueSync(queue, entry, options = {}) {
  const normalizedEntry = createSyncQueueEntry(entry);
  const current = normalizeSyncQueue(queue, options).filter((item) => item.fingerprint !== normalizedEntry.fingerprint);
  return normalizeSyncQueue([...current, normalizedEntry], options);
}

export function completeSyncQueue(queue, operationId, options = {}) {
  return normalizeSyncQueue(queue, options).filter((entry) => entry.operationId !== operationId);
}

export function computeSyncRetryDelay(attempt, random = 0.5) {
  const safeAttempt = integer(attempt, 1, 1, 30);
  const raw = Math.min(CLOUD_SYNC_BACKOFF_MAX_MS, CLOUD_SYNC_BACKOFF_BASE_MS * (2 ** (safeAttempt - 1)));
  const unit = Math.max(0, Math.min(1, finite(random, 0.5)));
  const jitter = 0.8 + unit * 0.4;
  return Math.max(CLOUD_SYNC_BACKOFF_BASE_MS, Math.min(CLOUD_SYNC_BACKOFF_MAX_MS, Math.round(raw * jitter)));
}

export function markSyncAttempt(entry, { now = Date.now(), error = 'OFFLINE', random = 0.5 } = {}) {
  const normalized = normalizeSyncQueue([entry], { now })[0];
  if (!normalized) throw new TypeError('SYNC_QUEUE_ENTRY_INVALID');
  const attempts = normalized.attempts + 1;
  return Object.freeze({
    ...normalized,
    attempts,
    lastAttemptAt: integer(now, Date.now(), 1),
    nextAttemptAt: integer(now, Date.now(), 1) + computeSyncRetryDelay(attempts, random),
    lastError: clean(error, 'OFFLINE', 160)
  });
}

export function replaceSyncQueueEntry(queue, entry, options = {}) {
  const items = normalizeSyncQueue(queue, options).filter((item) => item.operationId !== entry.operationId);
  return normalizeSyncQueue([...items, entry], options);
}

export function peekReadySync(queue, now = Date.now()) {
  return normalizeSyncQueue(queue, { now }).find((entry) => entry.nextAttemptAt <= now) || null;
}

export function nextSyncRetryAt(queue, now = Date.now()) {
  const items = normalizeSyncQueue(queue, { now });
  return items.length ? Math.min(...items.map((entry) => entry.nextAttemptAt)) : 0;
}

export function normalizeSyncLease(value) {
  const source = object(value);
  const ownerId = clean(source.ownerId, '', 120);
  if (!ownerId) return Object.freeze({ ownerId: '', acquiredAt: 0, heartbeatAt: 0, expiresAt: 0 });
  return Object.freeze({
    ownerId,
    acquiredAt: integer(source.acquiredAt, 0),
    heartbeatAt: integer(source.heartbeatAt, 0),
    expiresAt: integer(source.expiresAt, 0)
  });
}

export function acquireSyncLease(value, { ownerId, now = Date.now(), ttlMs = CLOUD_SYNC_LEASE_MS } = {}) {
  const owner = clean(ownerId, '', 120);
  if (!owner) throw new TypeError('SYNC_LEASE_OWNER_INVALID');
  const current = normalizeSyncLease(value);
  const safeNow = integer(now, Date.now(), 1);
  if (current.ownerId && current.ownerId !== owner && current.expiresAt > safeNow) {
    return Object.freeze({ acquired: false, lease: current });
  }
  const acquiredAt = current.ownerId === owner && current.acquiredAt ? current.acquiredAt : safeNow;
  return Object.freeze({
    acquired: true,
    lease: Object.freeze({
      ownerId: owner,
      acquiredAt,
      heartbeatAt: safeNow,
      expiresAt: safeNow + integer(ttlMs, CLOUD_SYNC_LEASE_MS, 1000, 120000)
    })
  });
}

export function renewSyncLease(value, { ownerId, now = Date.now(), ttlMs = CLOUD_SYNC_LEASE_MS } = {}) {
  const current = normalizeSyncLease(value);
  const owner = clean(ownerId, '', 120);
  if (!owner || current.ownerId !== owner || current.expiresAt <= now) {
    return Object.freeze({ renewed: false, lease: current });
  }
  return Object.freeze({
    renewed: true,
    lease: Object.freeze({ ...current, heartbeatAt: integer(now, Date.now(), 1), expiresAt: integer(now, Date.now(), 1) + integer(ttlMs, CLOUD_SYNC_LEASE_MS, 1000, 120000) })
  });
}

export function releaseSyncLease(value, ownerId) {
  const current = normalizeSyncLease(value);
  if (current.ownerId !== clean(ownerId, '', 120)) return current;
  return normalizeSyncLease(null);
}

export function syncLeaseOwnedBy(value, ownerId, now = Date.now()) {
  const current = normalizeSyncLease(value);
  return Boolean(current.ownerId && current.ownerId === clean(ownerId, '', 120) && current.expiresAt > now);
}

export function calculateClockSkew({ serverTime, clientSentAt, clientReceivedAt } = {}) {
  const sent = finite(clientSentAt, 0);
  const received = finite(clientReceivedAt, sent);
  const server = finite(serverTime, 0);
  if (!(sent > 0 && received >= sent && server > 0)) {
    return Object.freeze({ valid: false, offsetMs: 0, roundTripMs: 0, warning: false });
  }
  const midpoint = sent + (received - sent) / 2;
  const offsetMs = Math.round(server - midpoint);
  return Object.freeze({
    valid: true,
    offsetMs,
    roundTripMs: Math.max(0, Math.round(received - sent)),
    warning: Math.abs(offsetMs) > CLOUD_CLOCK_SKEW_WARNING_MS
  });
}

export function createAccountTombstone({ accountId, deletedAt = Date.now(), deletionId, deviceId = '' } = {}) {
  const cleanAccount = clean(accountId, '', 80);
  const cleanDeletion = clean(deletionId, '', 120);
  if (!/^cloud-[a-f0-9]{32}$/i.test(cleanAccount)) throw new TypeError('TOMBSTONE_ACCOUNT_INVALID');
  if (!cleanDeletion) throw new TypeError('TOMBSTONE_ID_INVALID');
  const timestamp = integer(deletedAt, Date.now(), 1);
  return Object.freeze({
    accountId: cleanAccount,
    deletedAt: timestamp,
    deletionId: cleanDeletion,
    deviceId: clean(deviceId, '', 120),
    retainUntil: timestamp + CLOUD_TOMBSTONE_RETENTION_MS
  });
}

export function normalizeAccountTombstone(value) {
  const source = object(value);
  try {
    return createAccountTombstone(source);
  } catch {
    return null;
  }
}

export function tombstoneBlocksAccount(value, accountId, now = Date.now()) {
  const tombstone = normalizeAccountTombstone(value);
  return Boolean(tombstone && tombstone.accountId === clean(accountId, '', 80) && tombstone.retainUntil > now);
}

export function verifyProfileIntegrity(profile, expectedChecksum, checksumFunction) {
  if (typeof checksumFunction !== 'function') throw new TypeError('CHECKSUM_FUNCTION_REQUIRED');
  const expected = clean(expectedChecksum, '', 128).toLowerCase();
  const actual = clean(checksumFunction(profile), '', 128).toLowerCase();
  return Object.freeze({ valid: Boolean(expected && actual && expected === actual), expected, actual });
}

export function verifyHistoryIntegrity(profile, historyEntry, checksumFunction) {
  const entry = object(historyEntry);
  const checksum = verifyProfileIntegrity(profile, entry.checksum, checksumFunction);
  const revision = integer(entry.revision, 0);
  const profileRevision = integer(profile?.revision, 0);
  return Object.freeze({
    valid: checksum.valid && revision > 0 && profileRevision > 0,
    checksum,
    revision,
    profileRevision
  });
}

export function pruneCloudActivity(value, { now = Date.now(), retentionMs = CLOUD_ACTIVITY_RETENTION_MS, limit = 100 } = {}) {
  const cutoff = integer(now, Date.now(), 1) - integer(retentionMs, CLOUD_ACTIVITY_RETENTION_MS, 1);
  const items = Array.isArray(value) ? value : [];
  return Object.freeze(items
    .filter((entry) => entry && typeof entry === 'object' && integer(entry.at, 0) >= cutoff)
    .sort((a, b) => integer(b.at, 0) - integer(a.at, 0) || clean(a.id).localeCompare(clean(b.id)))
    .slice(0, integer(limit, 100, 1, 1000))
    .map((entry) => Object.freeze({ ...entry })));
}

export function buildReliabilitySnapshot({ queue = [], lease = null, now = Date.now(), checksumVerified = false, lastSuccessfulSyncAt = 0, clockOffsetMs = 0 } = {}) {
  const normalizedQueue = normalizeSyncQueue(queue, { now });
  const normalizedLease = normalizeSyncLease(lease);
  return Object.freeze({
    patch: CLOUD_RELIABILITY_PATCH,
    queuedChanges: normalizedQueue.length,
    nextRetryAt: nextSyncRetryAt(normalizedQueue, now),
    leaseOwner: normalizedLease.ownerId,
    leaseExpiresAt: normalizedLease.expiresAt,
    checksumVerified: checksumVerified === true,
    lastSuccessfulSyncAt: integer(lastSuccessfulSyncAt, 0),
    clockOffsetMs: Math.round(finite(clockOffsetMs, 0))
  });
}
