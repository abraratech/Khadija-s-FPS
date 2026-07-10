// js/multiplayer/suspend_resume_core.js
// M3.57-M3.58 — deterministic browser suspension recovery policy.

export const MULTIPLAYER_SUSPEND_RESUME_PATCH = 'm3-production-release-manifest-r1';
export const MULTIPLAYER_SUSPEND_RESUME_PROTOCOL = 6;
export const MULTIPLAYER_SUSPEND_RESUME_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_SUSPEND_MIN_GAP_MS = 15 * 1000;
export const MULTIPLAYER_SUSPEND_RECORD_TTL_MS = 5 * 60 * 1000;

function finiteTime(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function normalizeReason(value = '') {
  return cleanText(value, 'visibility-hidden')
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .slice(0, 80);
}

export function createMultiplayerSuspendIncident({
  hiddenAt = Date.now(),
  reason = 'visibility-hidden',
  incidentId = '',
  createdAt = hiddenAt,
  ttlMs = MULTIPLAYER_SUSPEND_RECORD_TTL_MS
} = {}) {
  const normalizedHiddenAt = finiteTime(hiddenAt);
  const normalizedCreatedAt = finiteTime(createdAt, normalizedHiddenAt);
  const normalizedIncidentId = cleanText(incidentId).slice(0, 160);
  if (!normalizedIncidentId) return null;

  const lifetime = Math.max(
    10 * 1000,
    finiteTime(ttlMs, MULTIPLAYER_SUSPEND_RECORD_TTL_MS)
  );

  return Object.freeze({
    version: 1,
    incidentId: normalizedIncidentId,
    reason: normalizeReason(reason),
    hiddenAt: normalizedHiddenAt,
    createdAt: normalizedCreatedAt,
    expiresAt: normalizedCreatedAt + lifetime
  });
}

export function normalizeMultiplayerSuspendIncident(
  value = null,
  now = Date.now()
) {
  if (!value || typeof value !== 'object') return null;
  const incident = createMultiplayerSuspendIncident({
    hiddenAt: value.hiddenAt,
    reason: value.reason,
    incidentId: value.incidentId,
    createdAt: value.createdAt,
    ttlMs: Math.max(
      10 * 1000,
      finiteTime(value.expiresAt) - finiteTime(value.createdAt)
    )
  });
  if (!incident || finiteTime(now) > incident.expiresAt) return null;
  return incident;
}

export function evaluateMultiplayerSuspendResume({
  incident = null,
  now = Date.now(),
  minGapMs = MULTIPLAYER_SUSPEND_MIN_GAP_MS,
  activeRun = false,
  online = true,
  alreadyRecovering = false,
  persisted = false,
  frozen = false
} = {}) {
  const checkedAt = finiteTime(now);
  const normalizedIncident = normalizeMultiplayerSuspendIncident(
    incident,
    checkedAt
  );

  if (!normalizedIncident) {
    return Object.freeze({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-suspend-incident',
      action: 'NONE',
      blocking: false,
      final: true,
      checkedAt
    });
  }

  const thresholdMs = Math.max(1000, finiteTime(
    minGapMs,
    MULTIPLAYER_SUSPEND_MIN_GAP_MS
  ));
  const gapMs = Math.max(0, checkedAt - normalizedIncident.hiddenAt);
  const forcedRecovery = persisted === true || frozen === true;

  const base = {
    ...normalizedIncident,
    checkedAt,
    gapMs,
    thresholdMs,
    activeRun: activeRun === true,
    online: online !== false,
    alreadyRecovering: alreadyRecovering === true,
    persisted: persisted === true,
    frozen: frozen === true
  };

  if (activeRun !== true) {
    return Object.freeze({
      ...base,
      status: 'INACTIVE',
      health: 'PASS',
      reason: 'suspend-resume-no-active-run',
      action: 'NONE',
      blocking: false,
      final: true
    });
  }

  if (alreadyRecovering === true) {
    return Object.freeze({
      ...base,
      status: 'RECOVERY_ACTIVE',
      health: 'PASS',
      reason: 'suspend-resume-recovery-already-active',
      action: 'NONE',
      blocking: true,
      final: true
    });
  }

  if (!forcedRecovery && gapMs < thresholdMs) {
    return Object.freeze({
      ...base,
      status: 'SHORT_GAP',
      health: 'PASS',
      reason: 'suspend-resume-gap-below-threshold',
      action: 'NONE',
      blocking: false,
      final: true
    });
  }

  if (online === false) {
    return Object.freeze({
      ...base,
      status: 'WAITING_ONLINE',
      health: 'WARN',
      reason: 'suspend-resume-waiting-for-network',
      action: 'WAIT_ONLINE',
      blocking: true,
      final: false
    });
  }

  return Object.freeze({
    ...base,
    status: 'PROBE_REQUIRED',
    health: 'WARN',
    reason: forcedRecovery
      ? 'suspend-resume-page-lifecycle-probe'
      : 'suspend-resume-long-gap-probe',
    action: 'PROBE_TRANSPORT',
    blocking: true,
    final: false
  });
}
