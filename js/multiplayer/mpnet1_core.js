// MPNET.1 R1 — transaction reconciliation and emergency co-op resupply policy.

export const MPNET1_SCHEMA = 1;
export const MPNET1_PATCH = 'mpnet1-r1-relay-transaction-resupply-integrity';
export const MPNET1_TRANSACTION_RETENTION_MS = 120_000;
export const MPNET1_MAX_TRANSACTION_RESULTS = 96;
export const MPNET1_EMERGENCY_RESUPPLY_COOLDOWN_MS = 60_000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function whole(value, fallback = 0) {
  return Math.max(0, Math.floor(finite(value, fallback)));
}

function cleanText(value, maxLength = 160) {
  return String(value ?? '').slice(0, maxLength);
}

export function normalizeEmergencyState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    lastWave: whole(source.lastWave),
    lastGrantedAt: whole(source.lastGrantedAt),
    grants: whole(source.grants)
  };
}

export function evaluateEmergencyResupply({
  allAmmoEmpty = false,
  balance = 0,
  cheapestAmmoCost = 0,
  currentWave = 1,
  emergencyState = null,
  now = Date.now(),
  cooldownMs = MPNET1_EMERGENCY_RESUPPLY_COOLDOWN_MS
} = {}) {
  const state = normalizeEmergencyState(emergencyState);
  const wave = Math.max(1, whole(currentWave, 1));
  const cost = Math.max(1, whole(cheapestAmmoCost, 1));
  const score = whole(balance);
  const timestamp = whole(now);
  const cooldown = Math.max(10_000, whole(cooldownMs, MPNET1_EMERGENCY_RESUPPLY_COOLDOWN_MS));

  if (allAmmoEmpty !== true) {
    return { ok: false, reason: 'AMMO REMAINS', retryAfterMs: 0, state };
  }
  if (score >= cost) {
    return { ok: false, reason: 'AMMO PURCHASE AVAILABLE', retryAfterMs: 0, state };
  }

  const sameWave = state.lastWave === wave;
  const elapsed = Math.max(0, timestamp - state.lastGrantedAt);
  if (sameWave && state.lastGrantedAt > 0 && elapsed < cooldown) {
    return {
      ok: false,
      reason: 'EMERGENCY RESUPPLY COOLDOWN',
      retryAfterMs: cooldown - elapsed,
      state
    };
  }

  return {
    ok: true,
    reason: null,
    retryAfterMs: 0,
    state: {
      lastWave: wave,
      lastGrantedAt: timestamp,
      grants: state.grants + 1
    }
  };
}

export function normalizeTransactionResult(result = {}, now = Date.now()) {
  const requestId = cleanText(result.requestId);
  const targetPlayerId = cleanText(result.targetPlayerId);
  if (!requestId || !targetPlayerId) return null;
  return {
    kind: cleanText(result.kind || 'interaction-result', 80),
    requestId,
    targetPlayerId,
    accepted: result.accepted === true,
    reason: result.reason ? cleanText(result.reason, 120) : null,
    interactionKind: result.interactionKind ? cleanText(result.interactionKind, 80) : null,
    cost: whole(result.cost),
    reward: whole(result.reward),
    score: whole(result.score),
    kills: whole(result.kills),
    pointsAwarded: whole(result.pointsAwarded),
    killsAwarded: whole(result.killsAwarded),
    grant: result.grant && typeof result.grant === 'object'
      ? JSON.parse(JSON.stringify(result.grant))
      : null,
    authoritativeState: result.authoritativeState && typeof result.authoritativeState === 'object'
      ? JSON.parse(JSON.stringify(result.authoritativeState))
      : null,
    feedback: result.feedback && typeof result.feedback === 'object'
      ? JSON.parse(JSON.stringify(result.feedback))
      : null,
    committedAt: whole(result.committedAt, now)
  };
}

export function pruneTransactionResults(
  values = [],
  {
    now = Date.now(),
    maxRecords = MPNET1_MAX_TRANSACTION_RESULTS,
    retentionMs = MPNET1_TRANSACTION_RETENTION_MS
  } = {}
) {
  const timestamp = whole(now);
  const cutoff = timestamp - Math.max(5_000, whole(retentionMs, MPNET1_TRANSACTION_RETENTION_MS));
  const limit = Math.max(8, whole(maxRecords, MPNET1_MAX_TRANSACTION_RESULTS));
  return (Array.isArray(values) ? values : [])
    .map((entry) => normalizeTransactionResult(entry, timestamp))
    .filter((entry) => entry && entry.committedAt >= cutoff)
    .sort((left, right) => left.committedAt - right.committedAt)
    .slice(-limit);
}
