// js/multiplayer/refresh_proof_core.js
// M3.45-M3.46 — deterministic second-stage proof that a refreshed client rebuilt its room or active run.

export const MULTIPLAYER_REFRESH_PROOF_PATCH = 'm3-refresh-run-proof-r1';
export const MULTIPLAYER_REFRESH_PROOF_PROTOCOL = 6;
export const MULTIPLAYER_REFRESH_PROOF_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_REFRESH_PROOF_TIMEOUT_MS = 8 * 1000;
export const MULTIPLAYER_REFRESH_PROOF_MIN_TIMEOUT_MS = 1500;
export const MULTIPLAYER_REFRESH_PROOF_MAX_TIMEOUT_MS = 15 * 1000;

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
    version: 1,
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
    status = 'RESTORED';
    health = 'PASS';
    reason = 'active-run-runtime-proof-complete';
    continuity = 'RUN_PROVED';
    final = true;
  } else if (checkedAt >= normalized.deadlineAt) {
    status = 'TIMED_OUT';
    health = 'FAIL';
    reason = runActive === true && actualAuthorityEpoch < normalized.authorityEpoch
      ? 'refresh-proof-authority-timeout'
      : 'refresh-proof-local-run-timeout';
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
      authorityEpoch: actualAuthorityEpoch
    }),
    final
  });
}
