// js/multiplayer/refresh_hydration.js
// M3.47-M3.48 — browser runtime for refresh checkpoint hydration sealing.

import {
  createMultiplayerRefreshHydrationSeal,
  evaluateMultiplayerRefreshHydration,
  MULTIPLAYER_REFRESH_HYDRATION_TIMEOUT_MS
} from './refresh_hydration_core.js';

let activeSeal = null;
let activeSnapshot = null;
let timeoutHandle = null;

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_REFRESH_HYDRATION = activeSnapshot;
    } catch {
      // Diagnostic evidence must not interrupt recovery.
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
    activeSeal = null;
  }
  return publish(result);
}

export function startMultiplayerRefreshHydration({
  roomCode = '',
  runId = '',
  authorityEpoch = 0,
  checkpointExpected = false,
  timeoutMs = MULTIPLAYER_REFRESH_HYDRATION_TIMEOUT_MS,
  now = Date.now()
} = {}) {
  clearTimer();
  activeSeal = createMultiplayerRefreshHydrationSeal({
    roomCode,
    runId,
    authorityEpoch,
    checkpointExpected,
    timeoutMs,
    startedAt: now
  });

  if (!activeSeal) {
    return publish({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-refresh-hydration-seal',
      checkedAt: now,
      final: true
    });
  }

  publish(evaluateMultiplayerRefreshHydration({
    seal: activeSeal,
    now,
    connected: true,
    runActive: true,
    runId: activeSeal.runId,
    authorityEpoch: activeSeal.authorityEpoch
  }));

  if (typeof setTimeout === 'function') {
    timeoutHandle = setTimeout(() => {
      if (!activeSeal) return;
      finish(evaluateMultiplayerRefreshHydration({
        seal: activeSeal,
        now: Date.now(),
        connected: true,
        runActive: true,
        runId: activeSeal.runId,
        authorityEpoch: activeSeal.authorityEpoch
      }));
    }, activeSeal.timeoutMs + 10);
  }

  return activeSnapshot;
}

export function completeMultiplayerRefreshHydration({
  runId = '',
  authorityEpoch = 0,
  checkpointApplied = false,
  now = Date.now()
} = {}) {
  if (!activeSeal) return null;
  return finish(evaluateMultiplayerRefreshHydration({
    seal: activeSeal,
    now,
    connected: true,
    runActive: true,
    runId,
    authorityEpoch,
    finalized: true,
    checkpointApplied
  }));
}

export function failMultiplayerRefreshHydration({
  reason = 'refresh-hydration-failed',
  message = '',
  now = Date.now()
} = {}) {
  if (!activeSeal) return null;
  return finish(evaluateMultiplayerRefreshHydration({
    seal: activeSeal,
    now,
    error: String(message || reason || 'refresh-hydration-failed').trim().slice(0, 200)
  }));
}

export function cancelMultiplayerRefreshHydration({
  reason = 'refresh-hydration-cancelled',
  now = Date.now()
} = {}) {
  if (!activeSeal) return null;
  const prior = activeSeal;
  clearTimer();
  activeSeal = null;
  return publish({
    ...prior,
    status: 'CANCELLED',
    health: 'WARN',
    reason: String(reason || 'refresh-hydration-cancelled').slice(0, 160),
    checkedAt: now,
    elapsedMs: Math.max(0, now - prior.startedAt),
    remainingMs: Math.max(0, prior.deadlineAt - now),
    final: true
  });
}

export function getMultiplayerRefreshHydrationSnapshot() {
  return activeSnapshot;
}
