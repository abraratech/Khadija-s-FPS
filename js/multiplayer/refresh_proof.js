// js/multiplayer/refresh_proof.js
// M3.45-M3.46 — browser runtime for second-stage refresh room/run continuity proof.

import {
  createMultiplayerRefreshRunProof,
  evaluateMultiplayerRefreshRunProof,
  MULTIPLAYER_REFRESH_PROOF_TIMEOUT_MS
} from './refresh_proof_core.js';

const POLL_INTERVAL_MS = 100;
let activeProof = null;
let activeSnapshot = null;
let intervalHandle = null;
let readStateCallback = null;
let completeCallback = null;
let failureCallback = null;

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_REFRESH_PROOF = activeSnapshot;
    } catch {
      // Read-only globals must not interrupt recovery.
    }
  }
  return activeSnapshot;
}

function clearPoll() {
  if (intervalHandle !== null && typeof clearInterval === 'function') {
    clearInterval(intervalHandle);
  }
  intervalHandle = null;
}

function resetActive() {
  clearPoll();
  activeProof = null;
  readStateCallback = null;
  completeCallback = null;
  failureCallback = null;
}

function finish(result) {
  const onComplete = completeCallback;
  const onFailure = failureCallback;
  const snapshot = publish(result);
  if (!result?.final) return snapshot;

  resetActive();
  try {
    if (result.health === 'FAIL') onFailure?.(snapshot);
    else onComplete?.(snapshot);
  } catch {
    // Evidence must survive optional lobby callback failures.
  }
  return snapshot;
}

function poll(now = Date.now()) {
  if (!activeProof) return activeSnapshot;
  let state = {};
  try {
    state = readStateCallback?.() || {};
  } catch (error) {
    state = { error: error?.message || 'refresh-proof-state-read-failed' };
  }
  return finish(evaluateMultiplayerRefreshRunProof({
    proof: activeProof,
    now,
    ...state
  }));
}

export function startMultiplayerRefreshRunProof({
  roomCode = '',
  roomStatus = '',
  runId = '',
  authorityEpoch = 0,
  timeoutMs = MULTIPLAYER_REFRESH_PROOF_TIMEOUT_MS,
  now = Date.now(),
  readState = null,
  onComplete = null,
  onFailure = null
} = {}) {
  resetActive();
  activeProof = createMultiplayerRefreshRunProof({
    roomCode,
    roomStatus,
    runId,
    authorityEpoch,
    timeoutMs,
    startedAt: now
  });
  readStateCallback = typeof readState === 'function' ? readState : null;
  completeCallback = typeof onComplete === 'function' ? onComplete : null;
  failureCallback = typeof onFailure === 'function' ? onFailure : null;

  if (!activeProof || !readStateCallback) {
    const result = {
      status: 'INVALID',
      health: 'FAIL',
      reason: !activeProof ? 'invalid-refresh-run-proof' : 'refresh-proof-state-reader-missing',
      checkedAt: now,
      final: true
    };
    return finish(result);
  }

  const initial = poll(now);
  if (!initial?.final && typeof setInterval === 'function') {
    intervalHandle = setInterval(() => poll(Date.now()), POLL_INTERVAL_MS);
  }
  return initial;
}

export function failMultiplayerRefreshRunProof({
  reason = 'refresh-proof-connection-failed',
  message = '',
  now = Date.now()
} = {}) {
  if (!activeProof) return null;
  return finish(evaluateMultiplayerRefreshRunProof({
    proof: activeProof,
    now,
    error: String(message || reason || 'refresh-proof-connection-failed').trim().slice(0, 200)
  }));
}

export function cancelMultiplayerRefreshRunProof({
  reason = 'refresh-run-proof-cancelled',
  now = Date.now()
} = {}) {
  if (!activeProof) return null;
  const prior = activeProof;
  resetActive();
  return publish({
    ...prior,
    status: 'CANCELLED',
    health: 'WARN',
    reason: String(reason || 'refresh-run-proof-cancelled').slice(0, 160),
    checkedAt: now,
    elapsedMs: Math.max(0, now - prior.startedAt),
    remainingMs: Math.max(0, prior.deadlineAt - now),
    final: true
  });
}

export function getMultiplayerRefreshRunProofSnapshot() {
  return activeSnapshot;
}
