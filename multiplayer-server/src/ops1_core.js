// OPS.1 R1 — Worker operational safety, aggregation and moderation core.

export const OPS1_SERVER_SCHEMA = 1;
export const OPS1_SERVER_PATCH = 'ops1-r1-production-operations-privacy-telemetry';
export const OPS1_EVENT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const OPS1_REPORT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
export const OPS1_AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
export const OPS1_MAX_BODY_BYTES = 16_384;
export const OPS1_MAX_RECENT_ERRORS = 120;
export const OPS1_MAX_REPORTS = 500;

const EVENT_TYPES = new Set([
  'client-crash',
  'client-rejection',
  'route-failure',
  'service-health',
  'matchmaking',
  'room-admission',
  'reconnect',
  'host-migration',
  'progression-receipt',
  'social-safety',
  'live-service',
  'performance',
  'worker-route'
]);

const SEVERITIES = new Set(['info', 'warning', 'error', 'critical']);
const REPORT_CATEGORIES = new Set([
  'harassment',
  'hate',
  'cheating',
  'griefing',
  'inappropriate-name',
  'spam',
  'other'
]);
const REPORT_STATUSES = new Set([
  'pending',
  'reviewing',
  'actioned',
  'dismissed'
]);
const MODERATION_ACTIONS = new Set([
  'none',
  'warning',
  'temporary-restriction',
  'suspension',
  'ban',
  'dismissed'
]);
const CONTEXT_KEYS = Object.freeze([
  'route',
  'routeGroup',
  'status',
  'reason',
  'mode',
  'mapId',
  'difficulty',
  'region',
  'releasePatch',
  'build',
  'phase',
  'bucket',
  'online',
  'visibility',
  'eventName',
  'attempt',
  'retryable',
  'source',
  'category',
  'method',
  'durationBucket'
]);
const NUMBER_KEYS = new Set(['status', 'difficulty', 'bucket', 'attempt']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function cleanOpsString(value, fallback = '', max = 120) {
  const text = String(value ?? fallback)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

export function redactOpsServerText(value, max = 1000) {
  let text = String(value ?? '');
  if (!text) return '';
  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, 'Bearer [redacted]')
    .replace(/\b(?:token|secret|password|authorization|credential)\s*[:=]\s*["']?[^,\s"'<>]{6,}/gi, '$1=[redacted]')
    .replace(/\bcloud-[a-f0-9]{16,}\b/gi, '[account]')
    .replace(/\b(?:social|device|session|ticket|party|match|room|report)-[A-Za-z0-9_-]{12,}\b/gi, '[opaque-id]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, '[ip]')
    .replace(/\b(?:[A-F0-9]{0,4}:){2,}[A-F0-9]{0,4}\b/gi, '[ip]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return '[url]';
      }
    })
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  return text.slice(0, Math.max(0, Math.floor(finite(max, 1000))));
}

export function sanitizeOpsServerContext(value = {}) {
  const output = {};
  if (!value || typeof value !== 'object') return output;
  for (const key of CONTEXT_KEYS) {
    if (!(key in value)) continue;
    if (NUMBER_KEYS.has(key)) {
      output[key] = Math.max(
        0,
        Math.min(1_000_000, Math.floor(finite(value[key], 0)))
      );
    } else if (key === 'online' || key === 'retryable') {
      output[key] = value[key] === true;
    } else {
      output[key] = redactOpsServerText(value[key], 120);
    }
  }
  return output;
}

export function normalizeOpsServerEvent(input = {}, {
  now = Date.now(),
  sourceHash = '',
  region = 'ZZ'
} = {}) {
  const type = cleanOpsString(input.type, '', 48).toLowerCase();
  if (!EVENT_TYPES.has(type)) return null;
  const severity = SEVERITIES.has(input.severity)
    ? input.severity
    : type === 'client-crash' || type === 'client-rejection'
      ? 'error'
      : 'info';
  const timestamp = Math.max(
    Number(now) - 24 * 60 * 60 * 1000,
    Math.min(Number(now) + 5 * 60 * 1000, Math.floor(finite(input.timestamp, now)))
  );
  const stack = redactOpsServerText(
    String(input.stack || '').split('\n').slice(0, 12).join('\n'),
    1600
  );
  return Object.freeze({
    schema: OPS1_SERVER_SCHEMA,
    patch: OPS1_SERVER_PATCH,
    eventId: cleanOpsString(input.eventId, `event-${timestamp}`, 120),
    fingerprint: cleanOpsString(input.fingerprint, '', 80),
    type,
    severity,
    message: redactOpsServerText(input.message, 700),
    stack,
    context: sanitizeOpsServerContext(input.context),
    source: cleanOpsString(input.source, 'frontend', 40).toLowerCase(),
    releasePatch: cleanOpsString(input.releasePatch, '', 100),
    sourceHash: cleanOpsString(sourceHash, '', 64),
    region: cleanOpsString(region, 'ZZ', 16).toUpperCase(),
    timestamp,
    receivedAt: Math.floor(Number(now))
  });
}

export function opsHourKey(timestamp) {
  const date = new Date(Math.max(0, finite(timestamp, Date.now())));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0')
  ].join('-');
}

export function createOpsBucket(timestamp = Date.now()) {
  const hour = opsHourKey(timestamp);
  const [year, month, day, hourValue] = hour.split('-').map(Number);
  return {
    hour,
    startedAt: Date.UTC(year, month - 1, day, hourValue, 0, 0, 0),
    events: 0,
    errors: 0,
    critical: 0,
    status4xx: 0,
    status5xx: 0,
    duration: {
      fast: 0,
      normal: 0,
      slow: 0,
      verySlow: 0
    },
    byType: {},
    byRouteGroup: {},
    byRegion: {}
  };
}

function incrementMap(target, key, amount = 1) {
  const clean = cleanOpsString(key, 'unknown', 80);
  target[clean] = Math.max(0, Math.floor(finite(target[clean], 0))) + amount;
}

export function addEventToOpsBucket(bucketValue, event) {
  const bucket = {
    ...createOpsBucket(event?.receivedAt || Date.now()),
    ...(bucketValue && typeof bucketValue === 'object' ? bucketValue : {})
  };
  bucket.byType = { ...(bucket.byType || {}) };
  bucket.byRouteGroup = { ...(bucket.byRouteGroup || {}) };
  bucket.byRegion = { ...(bucket.byRegion || {}) };
  bucket.duration = {
    fast: 0,
    normal: 0,
    slow: 0,
    verySlow: 0,
    ...(bucket.duration || {})
  };

  bucket.events = Math.max(0, Math.floor(finite(bucket.events, 0))) + 1;
  if (event?.severity === 'error' || event?.severity === 'critical') {
    bucket.errors += 1;
  }
  if (event?.severity === 'critical') bucket.critical += 1;

  const status = Math.floor(finite(event?.context?.status, 0));
  if (status >= 400 && status < 500) bucket.status4xx += 1;
  if (status >= 500) bucket.status5xx += 1;

  incrementMap(bucket.byType, event?.type);
  incrementMap(bucket.byRouteGroup, event?.context?.routeGroup || event?.context?.route || 'client');
  incrementMap(bucket.byRegion, event?.region || 'ZZ');

  const duration = cleanOpsString(event?.context?.durationBucket, '', 24);
  if (duration === 'fast') bucket.duration.fast += 1;
  else if (duration === 'normal') bucket.duration.normal += 1;
  else if (duration === 'slow') bucket.duration.slow += 1;
  else if (duration === 'very-slow') bucket.duration.verySlow += 1;

  return bucket;
}

export function normalizeOpsRateState(value = {}, now = Date.now()) {
  return {
    startedAt: Math.max(0, Math.floor(finite(value.startedAt, now))),
    count: Math.max(0, Math.floor(finite(value.count, 0))),
    strikes: Math.max(0, Math.floor(finite(value.strikes, 0))),
    blockedUntil: Math.max(0, Math.floor(finite(value.blockedUntil, 0)))
  };
}

export function consumeOpsRate(value, {
  now = Date.now(),
  limit = 60,
  windowMs = 60_000,
  blockMs = 5 * 60_000
} = {}) {
  const state = normalizeOpsRateState(value, now);
  if (state.blockedUntil > now) {
    return {
      allowed: false,
      state,
      reason: 'OPS_RATE_BLOCKED',
      retryAfterMs: state.blockedUntil - now
    };
  }
  if (now - state.startedAt >= windowMs) {
    state.startedAt = now;
    state.count = 0;
  }
  if (state.count >= limit) {
    state.strikes += 1;
    state.blockedUntil = now + Math.min(
      24 * 60 * 60 * 1000,
      blockMs * Math.max(1, state.strikes)
    );
    return {
      allowed: false,
      state,
      reason: 'OPS_RATE_LIMITED',
      retryAfterMs: state.blockedUntil - now
    };
  }
  state.count += 1;
  return {
    allowed: true,
    state,
    reason: '',
    retryAfterMs: 0
  };
}

export function normalizeModerationReport(input = {}, {
  now = Date.now(),
  reporterHash = '',
  targetHash = ''
} = {}) {
  const category = REPORT_CATEGORIES.has(input.category)
    ? input.category
    : 'other';
  return Object.freeze({
    reportId: cleanOpsString(input.reportId, `report-${now}`, 120),
    category,
    note: redactOpsServerText(input.note, 240),
    reporterHash: cleanOpsString(reporterHash, '', 64),
    targetHash: cleanOpsString(targetHash, '', 64),
    context: {
      mapId: cleanOpsString(input.context?.mapId, '', 80),
      mode: cleanOpsString(input.context?.mode, '', 40),
      wave: Math.max(0, Math.min(999, Math.floor(finite(input.context?.wave, 0)))),
      roomRef: cleanOpsString(input.context?.roomRef, '', 64)
    },
    status: REPORT_STATUSES.has(input.status) ? input.status : 'pending',
    action: MODERATION_ACTIONS.has(input.action) ? input.action : 'none',
    createdAt: Math.max(0, Math.floor(finite(input.createdAt, now))),
    updatedAt: Math.max(0, Math.floor(finite(input.updatedAt, now))),
    expiresAt: Math.max(
      Math.floor(Number(now)),
      Math.floor(finite(input.expiresAt, Number(now) + OPS1_REPORT_RETENTION_MS))
    )
  });
}

export function applyModerationAction(reportValue, actionValue = {}, {
  now = Date.now(),
  actorHash = ''
} = {}) {
  const report = normalizeModerationReport(reportValue, {
    now,
    reporterHash: reportValue?.reporterHash,
    targetHash: reportValue?.targetHash
  });
  const status = REPORT_STATUSES.has(actionValue.status)
    ? actionValue.status
    : actionValue.action === 'dismissed'
      ? 'dismissed'
      : 'actioned';
  const action = MODERATION_ACTIONS.has(actionValue.action)
    ? actionValue.action
    : 'none';
  return {
    report: {
      ...report,
      status,
      action,
      updatedAt: Math.floor(Number(now))
    },
    audit: {
      auditId: cleanOpsString(
        actionValue.auditId,
        `audit-${Math.floor(Number(now))}`,
        120
      ),
      reportId: report.reportId,
      status,
      action,
      note: redactOpsServerText(actionValue.note, 240),
      actorHash: cleanOpsString(actorHash, '', 64),
      createdAt: Math.floor(Number(now)),
      expiresAt: Math.floor(Number(now) + OPS1_AUDIT_RETENTION_MS)
    }
  };
}

export function moderationRestrictionForAction(actionValue = {}, {
  now = Date.now(),
  reportId = '',
  targetHash = ''
} = {}) {
  const action = MODERATION_ACTIONS.has(actionValue.action)
    ? actionValue.action
    : 'none';
  if (!['temporary-restriction', 'suspension', 'ban'].includes(action)) {
    return null;
  }
  const durationMs = action === 'temporary-restriction'
    ? 24 * 60 * 60 * 1000
    : action === 'suspension'
      ? 7 * 24 * 60 * 60 * 1000
      : 0;
  return Object.freeze({
    targetHash: cleanOpsString(targetHash, '', 64),
    reportId: cleanOpsString(reportId, '', 120),
    action,
    reason: redactOpsServerText(actionValue.note, 160),
    createdAt: Math.floor(Number(now)),
    expiresAt: durationMs > 0 ? Math.floor(Number(now) + durationMs) : 0
  });
}

export function summarizeOpsHealth({
  buckets = [],
  pendingReports = 0,
  now = Date.now(),
  releasePatch = ''
} = {}) {
  const recentFloor = Number(now) - 60 * 60 * 1000;
  const recent = (Array.isArray(buckets) ? buckets : []).filter(
    (bucket) => Math.max(0, finite(bucket?.startedAt, 0)) >= recentFloor
  );
  const totals = recent.reduce((sum, bucket) => ({
    events: sum.events + Math.max(0, finite(bucket?.events, 0)),
    errors: sum.errors + Math.max(0, finite(bucket?.errors, 0)),
    critical: sum.critical + Math.max(0, finite(bucket?.critical, 0)),
    status5xx: sum.status5xx + Math.max(0, finite(bucket?.status5xx, 0))
  }), { events: 0, errors: 0, critical: 0, status5xx: 0 });

  const errorRate = totals.events > 0 ? totals.errors / totals.events : 0;
  const status = totals.critical >= 3
    || totals.status5xx >= 12
    || (totals.events >= 20 && errorRate >= 0.2)
    ? 'degraded'
    : 'healthy';

  return Object.freeze({
    ok: true,
    status,
    patch: OPS1_SERVER_PATCH,
    releasePatch: cleanOpsString(releasePatch, '', 100),
    checkedAt: Math.floor(Number(now)),
    windowMinutes: 60,
    events: Math.floor(totals.events),
    errors: Math.floor(totals.errors),
    critical: Math.floor(totals.critical),
    route5xx: Math.floor(totals.status5xx),
    reportsPending: Math.max(0, Math.floor(finite(pendingReports, 0))),
    privacy: {
      rawIpStored: false,
      rawEmailStored: false,
      preciseLocationStored: false,
      passkeyDetailsStored: false,
      chatTranscriptCollectedByDefault: false
    }
  });
}
