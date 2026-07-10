// js/multiplayer/refresh_watchdog_core.js
// M3.43-M3.44 — deterministic refresh-resume continuity and timeout policy.

export const MULTIPLAYER_REFRESH_WATCHDOG_PATCH = 'm3-tab-recovery-seal-r1';
export const MULTIPLAYER_REFRESH_WATCHDOG_PROTOCOL = 6;
export const MULTIPLAYER_REFRESH_WATCHDOG_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_REFRESH_WATCHDOG_TIMEOUT_MS = 15 * 1000;
export const MULTIPLAYER_REFRESH_WATCHDOG_MIN_TIMEOUT_MS = 3 * 1000;
export const MULTIPLAYER_REFRESH_WATCHDOG_MAX_TIMEOUT_MS = 30 * 1000;

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
  const requested = finiteTime(value, MULTIPLAYER_REFRESH_WATCHDOG_TIMEOUT_MS);
  return Math.min(
    MULTIPLAYER_REFRESH_WATCHDOG_MAX_TIMEOUT_MS,
    Math.max(MULTIPLAYER_REFRESH_WATCHDOG_MIN_TIMEOUT_MS, requested)
  );
}

export function createMultiplayerRefreshWatchdog({
  roomCode = '',
  startedAt = Date.now(),
  timeoutMs = MULTIPLAYER_REFRESH_WATCHDOG_TIMEOUT_MS
} = {}) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!normalizedRoomCode) return null;
  const normalizedStartedAt = finiteTime(startedAt);
  const normalizedTimeoutMs = normalizeTimeout(timeoutMs);
  return Object.freeze({
    version: 1,
    roomCode: normalizedRoomCode,
    startedAt: normalizedStartedAt,
    timeoutMs: normalizedTimeoutMs,
    deadlineAt: normalizedStartedAt + normalizedTimeoutMs
  });
}

function normalizeWatchdog(value) {
  if (!value || typeof value !== 'object') return null;
  const roomCode = normalizeRoomCode(value.roomCode);
  const startedAt = finiteTime(value.startedAt, -1);
  const timeoutMs = normalizeTimeout(value.timeoutMs);
  const deadlineAt = finiteTime(value.deadlineAt, -1);
  if (!roomCode || startedAt < 0 || deadlineAt !== startedAt + timeoutMs) return null;
  return Object.freeze({ version: 1, roomCode, startedAt, timeoutMs, deadlineAt });
}

export function evaluateMultiplayerRefreshWatchdog({
  watchdog = null,
  now = Date.now(),
  connected = false,
  roomCode = '',
  roomStatus = '',
  error = ''
} = {}) {
  const normalized = normalizeWatchdog(watchdog);
  const checkedAt = finiteTime(now);
  if (!normalized) {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-refresh-watchdog',
      checkedAt,
      final: true
    });
  }

  const elapsedMs = Math.max(0, checkedAt - normalized.startedAt);
  const remainingMs = Math.max(0, normalized.deadlineAt - checkedAt);
  const normalizedError = cleanText(error).slice(0, 200);
  const receivedRoomCode = normalizeRoomCode(roomCode);
  const normalizedRoomStatus = normalizeRoomStatus(roomStatus);

  let status = 'CONNECTING';
  let health = 'WARN';
  let reason = 'awaiting-room-welcome';
  let continuity = null;
  let final = false;

  if (normalizedError) {
    status = 'FAILED';
    health = 'FAIL';
    reason = normalizedError;
    final = true;
  } else if (connected === true) {
    if (!receivedRoomCode || receivedRoomCode !== normalized.roomCode) {
      status = 'FAILED';
      health = 'FAIL';
      reason = 'refresh-resume-room-mismatch';
      final = true;
    } else {
      status = 'RESTORED';
      health = 'PASS';
      continuity = normalizedRoomStatus === 'in-run' ? 'RUN_RESTORED' : 'ROOM_RESTORED';
      reason = normalizedRoomStatus === 'in-run'
        ? 'active-run-continuity-restored'
        : 'room-continuity-restored';
      final = true;
    }
  } else if (checkedAt >= normalized.deadlineAt) {
    status = 'TIMED_OUT';
    health = 'FAIL';
    reason = 'refresh-resume-welcome-timeout';
    final = true;
  }

  return Object.freeze({
    ...normalized,
    status,
    health,
    reason,
    continuity,
    roomStatus: normalizedRoomStatus,
    receivedRoomCode: receivedRoomCode || null,
    checkedAt,
    elapsedMs,
    remainingMs,
    final
  });
}
