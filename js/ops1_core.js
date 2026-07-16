// OPS.1 R1 — privacy-aware operational telemetry core.

export const OPS1_SCHEMA = 1;
export const OPS1_PATCH = 'ops1-r1-production-operations-privacy-telemetry';
export const OPS1_PREFERENCES_KEY = 'ka_ops1_preferences_v1';
export const OPS1_QUEUE_KEY = 'ka_ops1_queue_v1';
export const OPS1_MAX_QUEUE = 24;
export const OPS1_MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

export const OPS1_TELEMETRY_LEVELS = Object.freeze([
  'off',
  'essential',
  'standard'
]);

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
  'performance'
]);

const ESSENTIAL_TYPES = new Set([
  'client-crash',
  'client-rejection',
  'route-failure',
  'service-health',
  'progression-receipt',
  'social-safety',
  'live-service'
]);

const SEVERITIES = new Set(['info', 'warning', 'error', 'critical']);

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
  'category'
]);

const NUMERIC_CONTEXT_KEYS = new Set([
  'status',
  'difficulty',
  'bucket',
  'attempt'
]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function cleanOpsToken(value, fallback = '', max = 80) {
  const text = String(value ?? fallback)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

export function redactOpsText(value, max = 900) {
  let text = String(value ?? '');
  if (!text) return '';

  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, 'Bearer [redacted]')
    .replace(/\b(?:token|secret|password|authorization|credential)\s*[:=]\s*["']?[^,\s"'<>]{6,}/gi, '$1=[redacted]')
    .replace(/\bcloud-[a-f0-9]{16,}\b/gi, '[account]')
    .replace(/\b(?:social|device|session|ticket|party|match|room)-[A-Za-z0-9_-]{12,}\b/gi, '[opaque-id]')
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

  return text.slice(0, Math.max(0, Math.floor(finiteNumber(max, 900))));
}

export function normalizeOpsPreferences(value = {}) {
  const level = OPS1_TELEMETRY_LEVELS.includes(value?.telemetryLevel)
    ? value.telemetryLevel
    : 'essential';
  return Object.freeze({
    schema: OPS1_SCHEMA,
    patch: OPS1_PATCH,
    telemetryLevel: level,
    crashReports: level === 'off' ? false : value?.crashReports !== false,
    performanceMetrics: level === 'standard' && value?.performanceMetrics !== false,
    updatedAt: Math.max(0, Math.floor(finiteNumber(value?.updatedAt, Date.now())))
  });
}

export function sanitizeOpsContext(value = {}) {
  const output = {};
  if (!value || typeof value !== 'object') return output;

  for (const key of CONTEXT_KEYS) {
    if (!(key in value)) continue;
    if (NUMERIC_CONTEXT_KEYS.has(key)) {
      output[key] = Math.max(
        0,
        Math.min(1_000_000, Math.floor(finiteNumber(value[key], 0)))
      );
      continue;
    }
    if (key === 'online' || key === 'retryable') {
      output[key] = value[key] === true;
      continue;
    }
    output[key] = redactOpsText(value[key], 120);
  }
  return output;
}

export function opsFingerprint(value) {
  const text = String(value ?? '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ops-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function shouldSendOpsEvent(preferences, type) {
  const normalized = normalizeOpsPreferences(preferences);
  const cleanType = cleanOpsToken(type, '', 48);
  if (!EVENT_TYPES.has(cleanType)) return false;
  if (normalized.telemetryLevel === 'off') return false;
  if (normalized.telemetryLevel === 'essential') {
    return ESSENTIAL_TYPES.has(cleanType);
  }
  return true;
}

export function normalizeOpsEvent(input = {}, {
  preferences = normalizeOpsPreferences({}),
  now = Date.now()
} = {}) {
  const type = cleanOpsToken(input.type, '', 48).toLowerCase();
  if (!EVENT_TYPES.has(type) || !shouldSendOpsEvent(preferences, type)) {
    return null;
  }

  const severity = SEVERITIES.has(input.severity)
    ? input.severity
    : type === 'client-crash' || type === 'client-rejection'
      ? 'error'
      : 'info';

  const message = redactOpsText(input.message, 700);
  const stack = redactOpsText(
    String(input.stack || '')
      .split('\n')
      .slice(0, 12)
      .join('\n'),
    1600
  );
  const context = sanitizeOpsContext(input.context);
  const timestamp = Math.max(
    0,
    Math.min(
      Math.floor(finiteNumber(now, Date.now()) + 5 * 60 * 1000),
      Math.floor(finiteNumber(input.timestamp, now))
    )
  );
  const source = cleanOpsToken(input.source, 'frontend', 40).toLowerCase();
  const releasePatch = cleanOpsToken(
    input.releasePatch || context.releasePatch,
    '',
    100
  );
  const base = JSON.stringify({
    type,
    severity,
    message,
    stack: stack.split('\n').slice(0, 3).join('\n'),
    context,
    releasePatch,
    source
  });

  return Object.freeze({
    schema: OPS1_SCHEMA,
    patch: OPS1_PATCH,
    eventId: cleanOpsToken(
      input.eventId,
      `${opsFingerprint(`${base}:${timestamp}`)}-${timestamp.toString(36)}`,
      120
    ),
    fingerprint: opsFingerprint(base),
    type,
    severity,
    message,
    stack,
    context,
    source,
    releasePatch,
    timestamp
  });
}

export function normalizeOpsQueue(value, {
  now = Date.now(),
  max = OPS1_MAX_QUEUE
} = {}) {
  const list = Array.isArray(value) ? value : [];
  const floor = Math.max(0, Number(now) - OPS1_MAX_EVENT_AGE_MS);
  const seen = new Set();
  const output = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const timestamp = Math.max(0, Math.floor(finiteNumber(entry.timestamp, 0)));
    const eventId = cleanOpsToken(entry.eventId, '', 120);
    if (!eventId || timestamp < floor || seen.has(eventId)) continue;
    seen.add(eventId);
    output.push({
      ...entry,
      eventId,
      timestamp
    });
  }

  output.sort((left, right) => left.timestamp - right.timestamp);
  return output.slice(-Math.max(1, Math.min(100, Math.floor(finiteNumber(max, OPS1_MAX_QUEUE)))));
}

export function enqueueOpsEvent(queue, event, options = {}) {
  if (!event) return normalizeOpsQueue(queue, options);
  return normalizeOpsQueue([...(Array.isArray(queue) ? queue : []), event], options);
}

export function bucketOpsMetric(value, boundaries = []) {
  const number = finiteNumber(value, 0);
  const sorted = [...boundaries]
    .map((entry) => finiteNumber(entry, 0))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  for (const boundary of sorted) {
    if (number <= boundary) return `le-${boundary}`;
  }
  return sorted.length ? `gt-${sorted.at(-1)}` : 'value';
}

export function normalizeOpsHealth(value = {}) {
  const status = ['healthy', 'degraded', 'unavailable'].includes(value?.status)
    ? value.status
    : value?.ok === true
      ? 'healthy'
      : 'unavailable';
  return Object.freeze({
    ok: value?.ok === true,
    status,
    patch: cleanOpsToken(value?.patch, '', 100),
    releasePatch: cleanOpsToken(value?.releasePatch, '', 100),
    checkedAt: Math.max(0, Math.floor(finiteNumber(value?.checkedAt, 0))),
    windowMinutes: Math.max(0, Math.floor(finiteNumber(value?.windowMinutes, 0))),
    events: Math.max(0, Math.floor(finiteNumber(value?.events, 0))),
    errors: Math.max(0, Math.floor(finiteNumber(value?.errors, 0))),
    reportsPending: Math.max(0, Math.floor(finiteNumber(value?.reportsPending, 0)))
  });
}
