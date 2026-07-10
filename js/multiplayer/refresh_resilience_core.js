// js/multiplayer/refresh_resilience_core.js
// M3.53-M3.54 — deterministic refresh recovery resilience seal.

export const MULTIPLAYER_REFRESH_RESILIENCE_PATCH = 'm3-final-certification-seal-r1';
export const MULTIPLAYER_REFRESH_RESILIENCE_PROTOCOL = 6;
export const MULTIPLAYER_REFRESH_RESILIENCE_BUILD = 'm3-team-final-world-reconnect-r3';

function finiteTime(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function normalizeSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.freeze({
    status: cleanText(value.status).toUpperCase().slice(0, 48) || null,
    health: cleanText(value.health).toUpperCase().slice(0, 20) || null,
    reason: cleanText(value.reason).slice(0, 220) || null,
    continuity: cleanText(value.continuity).toUpperCase().slice(0, 80) || null,
    roomCode: cleanText(value.roomCode).toUpperCase().slice(0, 8) || null,
    runId: cleanText(value.runId).slice(0, 180) || null,
    authorityEpoch: finiteTime(value.authorityEpoch),
    blocking: value.blocking === true,
    canRetry: value.canRetry === true,
    retryCount: finiteTime(value.retryCount),
    final: value.final === true
  });
}

function result({
  status,
  health,
  reason,
  continuity = null,
  blocking = false,
  final = false,
  sealed = false,
  checkedAt,
  readiness,
  recovery,
  resumeIntentPresent,
  recoveryIntentPresent
}) {
  return Object.freeze({
    status,
    health,
    reason,
    continuity,
    blocking,
    final,
    sealed,
    checkedAt,
    readiness,
    recovery,
    storage: Object.freeze({
      resumeIntentPresent: resumeIntentPresent === true,
      recoveryIntentPresent: recoveryIntentPresent === true
    })
  });
}

export function evaluateMultiplayerRefreshResilience({
  readiness = null,
  recovery = null,
  resumeIntentPresent = false,
  recoveryIntentPresent = false,
  now = Date.now()
} = {}) {
  const checkedAt = finiteTime(now);
  const normalizedReadiness = normalizeSnapshot(readiness);
  const normalizedRecovery = normalizeSnapshot(recovery);

  const fail = (reason) => result({
    status: 'FAILED',
    health: 'FAIL',
    reason,
    continuity: 'RESILIENCE_CONTRADICTION',
    blocking: true,
    final: true,
    sealed: false,
    checkedAt,
    readiness: normalizedReadiness,
    recovery: normalizedRecovery,
    resumeIntentPresent,
    recoveryIntentPresent
  });

  if (
    normalizedReadiness?.runId
    && normalizedRecovery?.runId
    && normalizedReadiness.runId !== normalizedRecovery.runId
  ) {
    return fail('refresh-resilience-run-mismatch');
  }

  if (
    normalizedReadiness?.roomCode
    && normalizedRecovery?.roomCode
    && normalizedReadiness.roomCode !== normalizedRecovery.roomCode
  ) {
    return fail('refresh-resilience-room-mismatch');
  }

  if (
    normalizedReadiness?.status === 'READY'
    && normalizedReadiness.blocking
  ) {
    return fail('refresh-resilience-ready-still-blocked');
  }

  if (
    normalizedReadiness?.health === 'FAIL'
    && normalizedReadiness.final
    && !normalizedReadiness.blocking
  ) {
    return fail('refresh-resilience-failure-not-blocked');
  }

  if (
    normalizedRecovery?.status === 'RETRYING'
    && (
      normalizedRecovery.retryCount !== 1
      || normalizedRecovery.canRetry
      || normalizedRecovery.final
    )
  ) {
    return fail('refresh-resilience-invalid-retry-state');
  }

  if (
    normalizedRecovery?.status === 'RETRY_EXHAUSTED'
    && normalizedRecovery.canRetry
  ) {
    return fail('refresh-resilience-exhausted-retry-visible');
  }

  if (
    normalizedRecovery?.status === 'PROMPT'
    && normalizedRecovery.retryCount >= 1
    && normalizedRecovery.canRetry
  ) {
    return fail('refresh-resilience-retry-budget-regressed');
  }

  if (
    ['ESCAPED', 'RECOVERED', 'CANCELLED'].includes(
      normalizedRecovery?.status
    )
    && !normalizedRecovery.final
  ) {
    return fail('refresh-resilience-terminal-recovery-not-final');
  }

  if (normalizedRecovery?.status === 'ESCAPED') {
    if (resumeIntentPresent || recoveryIntentPresent) {
      return fail('refresh-resilience-escape-retained-intent');
    }
    return result({
      status: 'SEALED',
      health: 'PASS',
      reason: 'refresh-resilience-lobby-escape-sealed',
      continuity: 'LOBBY_ESCAPE',
      blocking: false,
      final: true,
      sealed: true,
      checkedAt,
      readiness: normalizedReadiness,
      recovery: normalizedRecovery,
      resumeIntentPresent,
      recoveryIntentPresent
    });
  }

  if (normalizedRecovery?.status === 'CANCELLED') {
    if (recoveryIntentPresent) {
      return fail('refresh-resilience-cancel-retained-recovery-intent');
    }
    return result({
      status: 'SEALED',
      health: 'PASS',
      reason: 'refresh-resilience-cancel-sealed',
      continuity: 'RECOVERY_CANCELLED',
      blocking: false,
      final: true,
      sealed: true,
      checkedAt,
      readiness: normalizedReadiness,
      recovery: normalizedRecovery,
      resumeIntentPresent,
      recoveryIntentPresent
    });
  }

  if (
    normalizedReadiness?.status === 'READY'
    && normalizedReadiness.health === 'PASS'
    && normalizedReadiness.final
    && !normalizedReadiness.blocking
  ) {
    if (
      normalizedRecovery
      && normalizedRecovery.status !== 'RECOVERED'
    ) {
      return fail('refresh-resilience-ready-without-recovered-state');
    }
    if (recoveryIntentPresent) {
      return fail('refresh-resilience-ready-retained-recovery-intent');
    }
    return result({
      status: 'SEALED',
      health: 'PASS',
      reason: 'refresh-resilience-run-recovery-sealed',
      continuity: 'RUN_RECOVERED',
      blocking: false,
      final: true,
      sealed: true,
      checkedAt,
      readiness: normalizedReadiness,
      recovery: normalizedRecovery,
      resumeIntentPresent,
      recoveryIntentPresent
    });
  }

  if (normalizedRecovery?.status === 'RETRYING') {
    return result({
      status: 'RETRYING',
      health: 'WARN',
      reason: 'refresh-resilience-controlled-retry-active',
      continuity: 'CONTROLLED_RETRY',
      blocking: true,
      final: false,
      sealed: false,
      checkedAt,
      readiness: normalizedReadiness,
      recovery: normalizedRecovery,
      resumeIntentPresent,
      recoveryIntentPresent
    });
  }

  if (
    normalizedRecovery?.status === 'PROMPT'
    || normalizedRecovery?.status === 'RETRY_EXHAUSTED'
    || normalizedRecovery?.status === 'RETRY_STORAGE_BLOCKED'
    || normalizedRecovery?.status === 'RETRY_ARM_FAILED'
  ) {
    return result({
      status: normalizedRecovery.canRetry
        ? 'RECOVERY_REQUIRED'
        : 'ESCAPE_REQUIRED',
      health: 'WARN',
      reason: normalizedRecovery.canRetry
        ? 'refresh-resilience-retry-or-escape-required'
        : 'refresh-resilience-lobby-escape-required',
      continuity: normalizedRecovery.canRetry
        ? 'AWAITING_RECOVERY_CHOICE'
        : 'AWAITING_LOBBY_ESCAPE',
      blocking: true,
      final: false,
      sealed: false,
      checkedAt,
      readiness: normalizedReadiness,
      recovery: normalizedRecovery,
      resumeIntentPresent,
      recoveryIntentPresent
    });
  }

  if (
    normalizedReadiness?.health === 'FAIL'
    && normalizedReadiness.final
  ) {
    return fail('refresh-resilience-failure-without-recovery-path');
  }

  if (normalizedReadiness?.blocking) {
    return result({
      status: 'RECOVERING',
      health: 'WARN',
      reason: 'refresh-resilience-recovery-in-progress',
      continuity: 'RECOVERY_IN_PROGRESS',
      blocking: true,
      final: false,
      sealed: false,
      checkedAt,
      readiness: normalizedReadiness,
      recovery: normalizedRecovery,
      resumeIntentPresent,
      recoveryIntentPresent
    });
  }

  return result({
    status: 'IDLE',
    health: 'PASS',
    reason: 'refresh-resilience-idle',
    continuity: 'NO_ACTIVE_REFRESH_RECOVERY',
    blocking: false,
    final: false,
    sealed: false,
    checkedAt,
    readiness: normalizedReadiness,
    recovery: normalizedRecovery,
    resumeIntentPresent,
    recoveryIntentPresent
  });
}
