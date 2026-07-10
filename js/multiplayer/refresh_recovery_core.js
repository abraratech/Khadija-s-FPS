// js/multiplayer/refresh_recovery_core.js
// M3.51-M3.52 — deterministic one-retry refresh failure escape policy.

export const MULTIPLAYER_REFRESH_RECOVERY_PATCH = 'm3-suspend-resilience-seal-r1';
export const MULTIPLAYER_REFRESH_RECOVERY_PROTOCOL = 6;
export const MULTIPLAYER_REFRESH_RECOVERY_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_REFRESH_RECOVERY_VERSION = 1;
export const MULTIPLAYER_REFRESH_RECOVERY_MAX_RETRIES = 1;
export const MULTIPLAYER_REFRESH_RECOVERY_TTL_MS = 2 * 60 * 1000;

function finiteTime(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function normalizeRoomCode(value = '') {
  const roomCode = cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
  return /^[A-Z2-9]{6}$/.test(roomCode) ? roomCode : '';
}

function normalizeRetryCount(value = 0) {
  return Math.min(
    MULTIPLAYER_REFRESH_RECOVERY_MAX_RETRIES,
    finiteTime(value)
  );
}

export function createMultiplayerRefreshRecoveryIdentity({
  roomCode = '',
  runId = '',
  authorityEpoch = 0
} = {}) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const normalizedRunId = cleanText(runId).slice(0, 160);
  if (!normalizedRoomCode || !normalizedRunId) return null;
  return `${normalizedRoomCode}|${normalizedRunId}|${finiteTime(authorityEpoch)}`;
}

export function createMultiplayerRefreshRecoveryRecord({
  readiness = null,
  retryCount = 0,
  now = Date.now(),
  ttlMs = MULTIPLAYER_REFRESH_RECOVERY_TTL_MS
} = {}) {
  if (!readiness || typeof readiness !== 'object') return null;

  const status = cleanText(readiness.status).toUpperCase();
  const health = cleanText(readiness.health).toUpperCase();
  if (
    readiness.final !== true
    || health !== 'FAIL'
    || !['FAILED', 'TIMED_OUT', 'INVALID'].includes(status)
  ) {
    return null;
  }

  const identity = createMultiplayerRefreshRecoveryIdentity({
    roomCode: readiness.roomCode,
    runId: readiness.runId,
    authorityEpoch: readiness.authorityEpoch
  });
  if (!identity) return null;

  const createdAt = finiteTime(now);
  const lifetime = Math.max(1000, finiteTime(ttlMs, MULTIPLAYER_REFRESH_RECOVERY_TTL_MS));
  const normalizedRetryCount = normalizeRetryCount(retryCount);

  return Object.freeze({
    version: MULTIPLAYER_REFRESH_RECOVERY_VERSION,
    identity,
    roomCode: normalizeRoomCode(readiness.roomCode),
    runId: cleanText(readiness.runId).slice(0, 160),
    authorityEpoch: finiteTime(readiness.authorityEpoch),
    sourceStatus: status,
    reason: cleanText(readiness.reason, 'refresh-recovery-failed').slice(0, 200),
    retryCount: normalizedRetryCount,
    canRetry: normalizedRetryCount < MULTIPLAYER_REFRESH_RECOVERY_MAX_RETRIES,
    status: 'PROMPT',
    createdAt,
    expiresAt: createdAt + lifetime,
    final: false
  });
}

export function normalizeMultiplayerRefreshRecoveryRecord(
  value = null,
  now = Date.now()
) {
  if (!value || typeof value !== 'object') return null;
  const version = Math.trunc(Number(value.version));
  const identity = cleanText(value.identity).slice(0, 400);
  const roomCode = normalizeRoomCode(value.roomCode);
  const runId = cleanText(value.runId).slice(0, 160);
  const authorityEpoch = finiteTime(value.authorityEpoch);
  const retryCount = normalizeRetryCount(value.retryCount);
  const createdAt = finiteTime(value.createdAt, -1);
  const expiresAt = finiteTime(value.expiresAt, -1);
  const checkedAt = finiteTime(now);

  if (
    version !== MULTIPLAYER_REFRESH_RECOVERY_VERSION
    || !identity
    || !roomCode
    || !runId
    || identity !== createMultiplayerRefreshRecoveryIdentity({
      roomCode,
      runId,
      authorityEpoch
    })
    || createdAt < 0
    || expiresAt <= createdAt
    || checkedAt > expiresAt
  ) {
    return null;
  }

  return Object.freeze({
    version,
    identity,
    roomCode,
    runId,
    authorityEpoch,
    sourceStatus: cleanText(value.sourceStatus).toUpperCase().slice(0, 40),
    reason: cleanText(value.reason, 'refresh-recovery-failed').slice(0, 200),
    retryCount,
    canRetry: retryCount < MULTIPLAYER_REFRESH_RECOVERY_MAX_RETRIES,
    status: cleanText(value.status, 'PROMPT').toUpperCase().slice(0, 40),
    createdAt,
    expiresAt,
    final: value.final === true
  });
}

export function transitionMultiplayerRefreshRecovery({
  record = null,
  action = '',
  now = Date.now()
} = {}) {
  const normalized = normalizeMultiplayerRefreshRecoveryRecord(record, now);
  if (!normalized) {
    return Object.freeze({
      status: 'INVALID',
      reason: 'invalid-refresh-recovery-record',
      canRetry: false,
      final: true
    });
  }

  const normalizedAction = cleanText(action).toUpperCase();
  if (normalizedAction === 'RETRY') {
    if (!normalized.canRetry) {
      return Object.freeze({
        ...normalized,
        status: 'RETRY_EXHAUSTED',
        reason: 'refresh-recovery-retry-exhausted',
        canRetry: false,
        final: false,
        updatedAt: finiteTime(now)
      });
    }
    const retryCount = normalized.retryCount + 1;
    return Object.freeze({
      ...normalized,
      status: 'RETRYING',
      reason: 'refresh-recovery-retry-armed',
      retryCount,
      canRetry: retryCount < MULTIPLAYER_REFRESH_RECOVERY_MAX_RETRIES,
      final: false,
      updatedAt: finiteTime(now)
    });
  }

  if (normalizedAction === 'RECOVER') {
    return Object.freeze({
      ...normalized,
      status: 'RECOVERED',
      reason: 'refresh-recovery-succeeded',
      canRetry: false,
      final: true,
      updatedAt: finiteTime(now)
    });
  }

  if (normalizedAction === 'ESCAPE') {
    return Object.freeze({
      ...normalized,
      status: 'ESCAPED',
      reason: 'refresh-recovery-returned-to-lobby',
      canRetry: false,
      final: true,
      updatedAt: finiteTime(now)
    });
  }

  if (normalizedAction === 'CANCEL') {
    return Object.freeze({
      ...normalized,
      status: 'CANCELLED',
      reason: 'refresh-recovery-cancelled',
      canRetry: false,
      final: true,
      updatedAt: finiteTime(now)
    });
  }

  return Object.freeze({
    ...normalized,
    status: 'PROMPT',
    final: false,
    updatedAt: finiteTime(now)
  });
}
