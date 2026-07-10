// js/multiplayer/refresh_proof_core.js
// M3.47-M3.48 — deterministic proof that room, run, authority, and checkpoint hydration returned.

export const MULTIPLAYER_REFRESH_PROOF_PATCH = 'm3-production-release-manifest-r1';
export const MULTIPLAYER_REFRESH_PROOF_PROTOCOL = 6;
export const MULTIPLAYER_REFRESH_PROOF_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_REFRESH_PROOF_TIMEOUT_MS = 12 * 1000;
export const MULTIPLAYER_REFRESH_PROOF_MIN_TIMEOUT_MS = 1500;
export const MULTIPLAYER_REFRESH_PROOF_MAX_TIMEOUT_MS = 20 * 1000;

function finiteTime(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function normalizeRoomCode(value = '') {
  const roomCode = cleanText(value).toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
  return /^[A-Z2-9]{6}$/.test(roomCode) ? roomCode : '';
}

function normalizeRoomStatus(value = '') {
  const status = cleanText(value).toLowerCase();
  if (status === 'in-run') return 'in-run';
  if (status === 'lobby') return 'lobby';
  if (status === 'ended') return 'ended';
  return status.slice(0, 40) || null;
}

function normalizeTimeout(value) {
  const requested = finiteTime(value, MULTIPLAYER_REFRESH_PROOF_TIMEOUT_MS);
  return Math.min(
    MULTIPLAYER_REFRESH_PROOF_MAX_TIMEOUT_MS,
    Math.max(MULTIPLAYER_REFRESH_PROOF_MIN_TIMEOUT_MS, requested)
  );
}

function normalizeHydration(value) {
  if (!value || typeof value !== 'object') return null;
  const status = cleanText(value.status).toUpperCase().slice(0, 40) || null;
  const health = cleanText(value.health).toUpperCase().slice(0, 20) || null;
  const runId = cleanText(value.runId).slice(0, 160) || null;
  return Object.freeze({
    status,
    health,
    reason: cleanText(value.reason).slice(0, 200) || null,
    continuity: cleanText(value.continuity).toUpperCase().slice(0, 60) || null,
    runId,
    authorityEpoch: finiteTime(value.authorityEpoch),
    checkpointExpected: value.checkpointExpected === true,
    final: value.final === true
  });
}

export function createMultiplayerRefreshRunProof({
  roomCode = '',
  roomStatus = '',
  runId = '',
  authorityEpoch = 0,
  startedAt = Date.now(),
  timeoutMs = MULTIPLAYER_REFRESH_PROOF_TIMEOUT_MS
} = {}) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const normalizedRoomStatus = normalizeRoomStatus(roomStatus);
  const normalizedRunId = cleanText(runId).slice(0, 160) || null;
  if (!normalizedRoomCode || !normalizedRoomStatus) return null;
  if (normalizedRoomStatus === 'in-run' && !normalizedRunId) return null;

  const normalizedStartedAt = finiteTime(startedAt);
  const normalizedTimeoutMs = normalizeTimeout(timeoutMs);
  return Object.freeze({
    version: 2,
    roomCode: normalizedRoomCode,
    roomStatus: normalizedRoomStatus,
    runId: normalizedRunId,
    authorityEpoch: finiteTime(authorityEpoch),
    startedAt: normalizedStartedAt,
    timeoutMs: normalizedTimeoutMs,
    deadlineAt: normalizedStartedAt + normalizedTimeoutMs
  });
}

function normalizeProof(value) {
  if (!value || typeof value !== 'object') return null;
  return createMultiplayerRefreshRunProof({
    roomCode: value.roomCode,
    roomStatus: value.roomStatus,
    runId: value.runId,
    authorityEpoch: value.authorityEpoch,
    startedAt: value.startedAt,
    timeoutMs: value.timeoutMs
  });
}

export function evaluateMultiplayerRefreshRunProof({
  proof = null,
  now = Date.now(),
  connected = false,
  roomCode = '',
  roomStatus = '',
  runActive = false,
  runId = '',
  authorityEpoch = 0,
  hydration = null,
  error = ''
} = {}) {
  const normalized = normalizeProof(proof);
  const checkedAt = finiteTime(now);
  if (!normalized) {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-refresh-run-proof',
      checkedAt,
      final: true
    });
  }

  const actualRoomCode = normalizeRoomCode(roomCode);
  const actualRoomStatus = normalizeRoomStatus(roomStatus);
  const actualRunId = cleanText(runId).slice(0, 160) || null;
  const actualAuthorityEpoch = finiteTime(authorityEpoch);
  const actualHydration = normalizeHydration(hydration);
  const detail = cleanText(error).slice(0, 200);
  const elapsedMs = Math.max(0, checkedAt - normalized.startedAt);
  const remainingMs = Math.max(0, normalized.deadlineAt - checkedAt);

  let status = 'VERIFYING';
  let health = 'WARN';
  let reason = normalized.roomStatus === 'in-run'
    ? 'awaiting-local-run-rebuild'
    : 'awaiting-room-proof';
  let continuity = null;
  let final = false;

  if (detail) {
    status = 'FAILED';
    health = 'FAIL';
    reason = detail;
    final = true;
  } else if (connected !== true) {
    if (checkedAt >= normalized.deadlineAt) {
      status = 'TIMED_OUT';
      health = 'FAIL';
      reason = 'refresh-proof-connection-timeout';
      final = true;
    }
  } else if (!actualRoomCode || actualRoomCode !== normalized.roomCode) {
    status = 'FAILED';
    health = 'FAIL';
    reason = 'refresh-proof-room-mismatch';
    final = true;
  } else if (normalized.roomStatus !== 'in-run') {
    status = 'RESTORED';
    health = 'PASS';
    reason = 'room-runtime-proof-complete';
    continuity = 'ROOM_PROVED';
    final = true;
  } else if (actualRoomStatus && actualRoomStatus !== 'in-run') {
    status = 'DEGRADED';
    health = 'WARN';
    reason = 'active-run-ended-during-refresh';
    continuity = 'ROOM_ONLY';
    final = true;
  } else if (runActive === true && actualRunId && actualRunId !== normalized.runId) {
    status = 'FAILED';
    health = 'FAIL';
    reason = 'refresh-proof-run-mismatch';
    final = true;
  } else if (
    runActive === true
    && actualRunId === normalized.runId
    && actualAuthorityEpoch >= normalized.authorityEpoch
  ) {
    if (!actualHydration) {
      reason = 'awaiting-refresh-hydration-seal';
    } else if (actualHydration.runId && actualHydration.runId !== normalized.runId) {
      status = 'FAILED';
      health = 'FAIL';
      reason = 'refresh-proof-hydration-run-mismatch';
      final = true;
    } else if (
      actualHydration.final === true
      && actualHydration.authorityEpoch < normalized.authorityEpoch
    ) {
      status = 'FAILED';
      health = 'FAIL';
      reason = 'refresh-proof-hydration-authority-regression';
      final = true;
    } else if (
      actualHydration.health === 'FAIL'
      || ['FAILED', 'TIMED_OUT', 'INVALID'].includes(actualHydration.status)
    ) {
      status = 'FAILED';
      health = 'FAIL';
      reason = actualHydration.reason || 'refresh-proof-hydration-failed';
      final = true;
    } else if (
      actualHydration.status === 'SEALED'
      && actualHydration.health === 'PASS'
      && actualHydration.final === true
      && actualHydration.runId === normalized.runId
      && actualHydration.authorityEpoch >= normalized.authorityEpoch
    ) {
      status = 'RESTORED';
      health = 'PASS';
      reason = 'active-run-hydration-proof-complete';
      continuity = 'RUN_HYDRATED';
      final = true;
    } else {
      reason = 'awaiting-refresh-hydration-seal';
    }
  }

  if (!final && checkedAt >= normalized.deadlineAt) {
    status = 'TIMED_OUT';
    health = 'FAIL';
    if (
      runActive === true
      && actualRunId === normalized.runId
      && actualAuthorityEpoch >= normalized.authorityEpoch
    ) {
      reason = 'refresh-proof-hydration-timeout';
    } else if (runActive === true && actualAuthorityEpoch < normalized.authorityEpoch) {
      reason = 'refresh-proof-authority-timeout';
    } else {
      reason = 'refresh-proof-local-run-timeout';
    }
    final = true;
  }

  return Object.freeze({
    ...normalized,
    status,
    health,
    reason,
    continuity,
    checkedAt,
    elapsedMs,
    remainingMs,
    actual: Object.freeze({
      connected: connected === true,
      roomCode: actualRoomCode || null,
      roomStatus: actualRoomStatus,
      runActive: runActive === true,
      runId: actualRunId,
      authorityEpoch: actualAuthorityEpoch,
      hydration: actualHydration
    }),
    final
  });
}
