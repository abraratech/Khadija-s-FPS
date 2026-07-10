// js/multiplayer/refresh_readiness.js
// M3.53-M3.54 — refresh readiness wired to the final resilience seal.

import {
  createMultiplayerRefreshReadinessGate,
  evaluateMultiplayerRefreshReadiness,
  MULTIPLAYER_REFRESH_READINESS_TIMEOUT_MS
} from './refresh_readiness_core.js';
import {
  syncMultiplayerRefreshRecoveryFromReadiness
} from './refresh_recovery.js';
import {
  syncMultiplayerRefreshResilience
} from './refresh_resilience.js';

let activeGate = null;
let activeSnapshot = null;
let timeoutHandle = null;

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_REFRESH_READINESS = activeSnapshot;
    } catch {
      // Readiness diagnostics must never interrupt recovery.
    }
  }
  const recovery = syncMultiplayerRefreshRecoveryFromReadiness(activeSnapshot);
  syncMultiplayerRefreshResilience({
    readiness: activeSnapshot,
    recovery
  });
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
    activeGate = null;
  }
  return publish(result);
}

export function startMultiplayerRefreshReadiness({
  roomCode = '',
  runId = '',
  authorityEpoch = 0,
  checkpointExpected = false,
  timeoutMs = MULTIPLAYER_REFRESH_READINESS_TIMEOUT_MS,
  now = Date.now()
} = {}) {
  clearTimer();
  activeGate = createMultiplayerRefreshReadinessGate({
    roomCode,
    runId,
    authorityEpoch,
    checkpointExpected,
    timeoutMs,
    startedAt: now
  });

  if (!activeGate) {
    return publish({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-refresh-readiness-gate',
      blocking: true,
      checkedAt: now,
      final: true
    });
  }

  publish(evaluateMultiplayerRefreshReadiness({
    gate: activeGate,
    now,
    connected: true,
    runActive: true,
    runId: activeGate.runId,
    authorityEpoch: activeGate.authorityEpoch
  }));

  if (typeof setTimeout === 'function') {
    timeoutHandle = setTimeout(() => {
      if (!activeGate) return;
      finish(evaluateMultiplayerRefreshReadiness({
        gate: activeGate,
        now: Date.now(),
        connected: true,
        runActive: true,
        runId: activeGate.runId,
        authorityEpoch: activeGate.authorityEpoch
      }));
    }, activeGate.timeoutMs + 10);
  }

  return activeSnapshot;
}

export function completeMultiplayerRefreshReadiness({
  connected = false,
  runActive = false,
  runId = '',
  authorityEpoch = 0,
  hydration = null,
  worldReady = false,
  localStateReady = false,
  now = Date.now()
} = {}) {
  if (!activeGate) return null;
  return finish(evaluateMultiplayerRefreshReadiness({
    gate: activeGate,
    now,
    connected,
    runActive,
    runId,
    authorityEpoch,
    hydration,
    worldReady,
    localStateReady
  }));
}

export function failMultiplayerRefreshReadiness({
  reason = 'refresh-gameplay-readiness-failed',
  message = '',
  now = Date.now()
} = {}) {
  if (!activeGate) return null;
  return finish(evaluateMultiplayerRefreshReadiness({
    gate: activeGate,
    now,
    error: String(message || reason || 'refresh-gameplay-readiness-failed')
      .trim()
      .slice(0, 200)
  }));
}

export function cancelMultiplayerRefreshReadiness({
  reason = 'refresh-gameplay-readiness-cancelled',
  now = Date.now()
} = {}) {
  if (!activeGate) return null;
  const prior = activeGate;
  clearTimer();
  activeGate = null;
  return publish({
    ...prior,
    status: 'CANCELLED',
    health: 'WARN',
    reason: String(reason || 'refresh-gameplay-readiness-cancelled').slice(0, 160),
    blocking: false,
    checkedAt: now,
    elapsedMs: Math.max(0, now - prior.startedAt),
    remainingMs: Math.max(0, prior.deadlineAt - now),
    final: true
  });
}

export function getMultiplayerRefreshReadinessSnapshot() {
  return activeSnapshot;
}

export function isMultiplayerRefreshReadinessBlocking() {
  return activeSnapshot?.blocking === true;
}
