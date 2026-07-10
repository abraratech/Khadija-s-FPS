// js/multiplayer/refresh_readiness_core.js
// M3.49-M3.50 — deterministic refresh-resume gameplay readiness gate.

export const MULTIPLAYER_REFRESH_READINESS_PATCH = 'm3-production-release-manifest-r1';
export const MULTIPLAYER_REFRESH_READINESS_PROTOCOL = 6;
export const MULTIPLAYER_REFRESH_READINESS_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_REFRESH_READINESS_TIMEOUT_MS = 12 * 1000;
export const MULTIPLAYER_REFRESH_READINESS_MIN_TIMEOUT_MS = 1500;
export const MULTIPLAYER_REFRESH_READINESS_MAX_TIMEOUT_MS = 20 * 1000;

function finiteTime(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
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

function normalizeTimeout(value) {
  const requested = finiteTime(value, MULTIPLAYER_REFRESH_READINESS_TIMEOUT_MS);
  return Math.min(
    MULTIPLAYER_REFRESH_READINESS_MAX_TIMEOUT_MS,
    Math.max(MULTIPLAYER_REFRESH_READINESS_MIN_TIMEOUT_MS, requested)
  );
}

function normalizeHydration(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.freeze({
    status: cleanText(value.status).toUpperCase().slice(0, 40) || null,
    health: cleanText(value.health).toUpperCase().slice(0, 20) || null,
    reason: cleanText(value.reason).slice(0, 200) || null,
    continuity: cleanText(value.continuity).toUpperCase().slice(0, 60) || null,
    runId: cleanText(value.runId).slice(0, 160) || null,
    authorityEpoch: finiteTime(value.authorityEpoch),
    checkpointExpected: value.checkpointExpected === true,
    final: value.final === true
  });
}

export function createMultiplayerRefreshReadinessGate({
  roomCode = '',
  runId = '',
  authorityEpoch = 0,
  checkpointExpected = false,
  startedAt = Date.now(),
  timeoutMs = MULTIPLAYER_REFRESH_READINESS_TIMEOUT_MS
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

function normalizeGate(value) {
  if (!value || typeof value !== 'object') return null;
  return createMultiplayerRefreshReadinessGate({
    roomCode: value.roomCode,
    runId: value.runId,
    authorityEpoch: value.authorityEpoch,
    checkpointExpected: value.checkpointExpected,
    startedAt: value.startedAt,
    timeoutMs: value.timeoutMs
  });
}

export function evaluateMultiplayerRefreshReadiness({
  gate = null,
  now = Date.now(),
  connected = false,
  runActive = false,
  runId = '',
  authorityEpoch = 0,
  hydration = null,
  worldReady = false,
  localStateReady = false,
  error = ''
} = {}) {
  const normalized = normalizeGate(gate);
  const checkedAt = finiteTime(now);
  if (!normalized) {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-refresh-readiness-gate',
      blocking: true,
      checkedAt,
      final: true
    });
  }

  const actualRunId = cleanText(runId).slice(0, 160) || null;
  const actualAuthorityEpoch = finiteTime(authorityEpoch);
  const actualHydration = normalizeHydration(hydration);
  const detail = cleanText(error).slice(0, 200);
  const elapsedMs = Math.max(0, checkedAt - normalized.startedAt);
  const remainingMs = Math.max(0, normalized.deadlineAt - checkedAt);

  let status = 'BLOCKED';
  let health = 'WARN';
  let reason = 'awaiting-refresh-gameplay-readiness';
  let continuity = null;
  let blocking = true;
  let final = false;

  if (detail) {
    status = 'FAILED';
    health = 'FAIL';
    reason = detail;
    final = true;
  } else if (connected !== true) {
    reason = 'awaiting-refresh-readiness-connection';
  } else if (runActive !== true) {
    reason = 'awaiting-refresh-readiness-run';
  } else if (actualRunId && actualRunId !== normalized.runId) {
    status = 'FAILED';
    health = 'FAIL';
    reason = 'refresh-readiness-run-mismatch';
    final = true;
  } else if (actualAuthorityEpoch < normalized.authorityEpoch) {
    reason = 'awaiting-refresh-readiness-authority';
  } else if (!actualHydration) {
    reason = 'awaiting-refresh-readiness-hydration';
  } else if (actualHydration.runId && actualHydration.runId !== normalized.runId) {
    status = 'FAILED';
    health = 'FAIL';
    reason = 'refresh-readiness-hydration-run-mismatch';
    final = true;
  } else if (
    actualHydration.health === 'FAIL'
    || ['FAILED', 'TIMED_OUT', 'INVALID'].includes(actualHydration.status)
  ) {
    status = 'FAILED';
    health = 'FAIL';
    reason = actualHydration.reason || 'refresh-readiness-hydration-failed';
    final = true;
  } else if (
    actualHydration.status !== 'SEALED'
    || actualHydration.health !== 'PASS'
    || actualHydration.final !== true
  ) {
    reason = 'awaiting-refresh-readiness-hydration';
  } else if (actualHydration.authorityEpoch < normalized.authorityEpoch) {
    status = 'FAILED';
    health = 'FAIL';
    reason = 'refresh-readiness-hydration-authority-regression';
    final = true;
  } else if (worldReady !== true) {
    reason = 'awaiting-refresh-readiness-world';
  } else if (localStateReady !== true) {
    reason = 'awaiting-refresh-readiness-local-state';
  } else {
    status = 'READY';
    health = 'PASS';
    reason = normalized.checkpointExpected
      ? 'refresh-checkpoint-gameplay-ready'
      : 'refresh-runtime-gameplay-ready';
    continuity = 'GAMEPLAY_READY';
    blocking = false;
    final = true;
  }

  if (!final && checkedAt >= normalized.deadlineAt) {
    status = 'TIMED_OUT';
    health = 'FAIL';
    reason = 'refresh-gameplay-readiness-timeout';
    blocking = true;
    final = true;
  }

  return Object.freeze({
    ...normalized,
    status,
    health,
    reason,
    continuity,
    blocking,
    checkedAt,
    elapsedMs,
    remainingMs,
    actual: Object.freeze({
      connected: connected === true,
      runActive: runActive === true,
      runId: actualRunId,
      authorityEpoch: actualAuthorityEpoch,
      hydration: actualHydration,
      worldReady: worldReady === true,
      localStateReady: localStateReady === true
    }),
    final
  });
}
