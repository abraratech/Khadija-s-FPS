// js/multiplayer/refresh_watchdog.js
// M3.43-M3.44 — browser runtime for refresh-resume continuity and safe fallback.

import {
  createMultiplayerRefreshWatchdog,
  evaluateMultiplayerRefreshWatchdog,
  MULTIPLAYER_REFRESH_WATCHDOG_TIMEOUT_MS
} from './refresh_watchdog_core.js';

let activeWatchdog = null;
let activeSnapshot = null;
let timeoutHandle = null;
let timeoutCallback = null;

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_REFRESH_WATCHDOG = activeSnapshot;
    } catch {
      // Read-only globals must not block multiplayer recovery.
    }
  }
  return activeSnapshot;
}

function clearTimer() {
  if (timeoutHandle !== null && typeof clearTimeout === 'function') {
    clearTimeout(timeoutHandle);
  }
  timeoutHandle = null;
}

function finish(result) {
  if (result?.final) {
    clearTimer();
    activeWatchdog = null;
    timeoutCallback = null;
  }
  return publish(result);
}

export function startMultiplayerRefreshResumeWatchdog({
  roomCode = '',
  timeoutMs = MULTIPLAYER_REFRESH_WATCHDOG_TIMEOUT_MS,
  now = Date.now(),
  onTimeout = null
} = {}) {
  clearTimer();
  activeWatchdog = createMultiplayerRefreshWatchdog({ roomCode, timeoutMs, startedAt: now });
  timeoutCallback = typeof onTimeout === 'function' ? onTimeout : null;

  if (!activeWatchdog) {
    timeoutCallback = null;
    return publish({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-refresh-watchdog-room',
      checkedAt: now,
      final: true
    });
  }

  const initial = evaluateMultiplayerRefreshWatchdog({ watchdog: activeWatchdog, now });
  publish(initial);

  if (typeof setTimeout === 'function') {
    timeoutHandle = setTimeout(() => {
      if (!activeWatchdog) return;
      const result = evaluateMultiplayerRefreshWatchdog({
        watchdog: activeWatchdog,
        now: Date.now()
      });
      const callback = timeoutCallback;
      finish(result);
      if (result.status === 'TIMED_OUT') {
        try {
          callback?.(result);
        } catch {
          // Recovery evidence must survive an optional UI callback failure.
        }
      }
    }, activeWatchdog.timeoutMs + 10);
  }

  return activeSnapshot;
}

export function completeMultiplayerRefreshResumeWatchdog({
  connected = true,
  roomCode = '',
  roomStatus = '',
  now = Date.now()
} = {}) {
  if (!activeWatchdog) return null;
  return finish(evaluateMultiplayerRefreshWatchdog({
    watchdog: activeWatchdog,
    now,
    connected,
    roomCode,
    roomStatus
  }));
}

export function failMultiplayerRefreshResumeWatchdog({
  reason = 'refresh-resume-connection-failed',
  message = '',
  now = Date.now()
} = {}) {
  if (!activeWatchdog) return null;
  const detail = String(message || reason || 'refresh-resume-connection-failed').trim().slice(0, 200);
  return finish(evaluateMultiplayerRefreshWatchdog({
    watchdog: activeWatchdog,
    now,
    error: detail
  }));
}

export function cancelMultiplayerRefreshResumeWatchdog({
  reason = 'refresh-resume-watchdog-cancelled',
  now = Date.now()
} = {}) {
  if (!activeWatchdog) return null;
  clearTimer();
  const prior = activeWatchdog;
  activeWatchdog = null;
  timeoutCallback = null;
  return publish({
    ...prior,
    status: 'CANCELLED',
    health: 'WARN',
    reason: String(reason || 'refresh-resume-watchdog-cancelled').slice(0, 160),
    checkedAt: now,
    elapsedMs: Math.max(0, now - prior.startedAt),
    remainingMs: Math.max(0, prior.deadlineAt - now),
    final: true
  });
}

export function getMultiplayerRefreshResumeWatchdogSnapshot() {
  return activeSnapshot;
}
