// js/multiplayer/refresh_hydration_core.js
// M3.47-M3.48 — deterministic proof that refresh-resume checkpoint hydration completed.

export const MULTIPLAYER_REFRESH_HYDRATION_PATCH = 'm3-production-release-manifest-r1';
export const MULTIPLAYER_REFRESH_HYDRATION_PROTOCOL = 6;
export const MULTIPLAYER_REFRESH_HYDRATION_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_REFRESH_HYDRATION_TIMEOUT_MS = 10 * 1000;
export const MULTIPLAYER_REFRESH_HYDRATION_MIN_TIMEOUT_MS = 1500;
export const MULTIPLAYER_REFRESH_HYDRATION_MAX_TIMEOUT_MS = 20 * 1000;

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

function normalizeTimeout(value) {
  const requested = finiteTime(value, MULTIPLAYER_REFRESH_HYDRATION_TIMEOUT_MS);
  return Math.min(
    MULTIPLAYER_REFRESH_HYDRATION_MAX_TIMEOUT_MS,
    Math.max(MULTIPLAYER_REFRESH_HYDRATION_MIN_TIMEOUT_MS, requested)
  );
}

export function createMultiplayerRefreshHydrationSeal({
  roomCode = '',
  runId = '',
  authorityEpoch = 0,
  checkpointExpected = false,
  startedAt = Date.now(),
  timeoutMs = MULTIPLAYER_REFRESH_HYDRATION_TIMEOUT_MS
} = {}) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const normalizedRunId = cleanText(runId).slice(0, 160);
  if (!normalizedRoomCode || !normalizedRunId) return null;

  const normalizedStartedAt = finiteTime(startedAt);
  const normalizedTimeoutMs = normalizeTimeout(timeoutMs);
  return Object.freeze({
    version: 1,
    roomCode: normalizedRoomCode,
    runId: normalizedRunId,
    authorityEpoch: finiteTime(authorityEpoch),
    checkpointExpected: checkpointExpected === true,
    startedAt: normalizedStartedAt,
    timeoutMs: normalizedTimeoutMs,
    deadlineAt: normalizedStartedAt + normalizedTimeoutMs
  });
}

function normalizeSeal(value) {
  if (!value || typeof value !== 'object') return null;
  return createMultiplayerRefreshHydrationSeal({
    roomCode: value.roomCode,
    runId: value.runId,
    authorityEpoch: value.authorityEpoch,
    checkpointExpected: value.checkpointExpected,
    startedAt: value.startedAt,
    timeoutMs: value.timeoutMs
  });
}

export function evaluateMultiplayerRefreshHydration({
  seal = null,
  now = Date.now(),
  connected = true,
  runActive = true,
  runId = '',
  authorityEpoch = 0,
  finalized = false,
  checkpointApplied = false,
  error = ''
} = {}) {
  const normalized = normalizeSeal(seal);
  const checkedAt = finiteTime(now);
  if (!normalized) {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-refresh-hydration-seal',
      checkedAt,
      final: true
    });
  }

  const actualRunId = cleanText(runId).slice(0, 160) || null;
  const actualAuthorityEpoch = finiteTime(authorityEpoch);
  const detail = cleanText(error).slice(0, 200);
  const elapsedMs = Math.max(0, checkedAt - normalized.startedAt);
  const remainingMs = Math.max(0, normalized.deadlineAt - checkedAt);

  let status = 'APPLYING';
  let health = 'WARN';
  let reason = 'awaiting-refresh-checkpoint-finalization';
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
      reason = 'refresh-hydration-connection-timeout';
      final = true;
    } else {
      reason = 'awaiting-refresh-hydration-connection';
    }
  } else if (runActive !== true) {
    if (checkedAt >= normalized.deadlineAt) {
      status = 'TIMED_OUT';
      health = 'FAIL';
      reason = 'refresh-hydration-run-timeout';
      final = true;
    } else {
      reason = 'awaiting-refresh-hydration-run';
    }
  } else if (actualRunId && actualRunId !== normalized.runId) {
    status = 'FAILED';
    health = 'FAIL';
    reason = 'refresh-hydration-run-mismatch';
    final = true;
  } else if (finalized === true && actualAuthorityEpoch < normalized.authorityEpoch) {
    status = 'FAILED';
    health = 'FAIL';
    reason = 'refresh-hydration-authority-regression';
    final = true;
  } else if (finalized === true) {
    if (normalized.checkpointExpected && checkpointApplied !== true) {
      status = 'FAILED';
      health = 'FAIL';
      reason = 'refresh-hydration-checkpoint-missing';
      final = true;
    } else {
      status = 'SEALED';
      health = 'PASS';
      reason = normalized.checkpointExpected
        ? 'refresh-checkpoint-hydration-sealed'
        : 'refresh-runtime-finalization-sealed';
      continuity = normalized.checkpointExpected
        ? 'CHECKPOINT_APPLIED'
        : 'RUNTIME_FINALIZED';
      final = true;
    }
  } else if (checkedAt >= normalized.deadlineAt) {
    status = 'TIMED_OUT';
    health = 'FAIL';
    reason = 'refresh-hydration-finalize-timeout';
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
      runActive: runActive === true,
      runId: actualRunId,
      authorityEpoch: actualAuthorityEpoch,
      finalized: finalized === true,
      checkpointApplied: checkpointApplied === true
    }),
    final
  });
}
