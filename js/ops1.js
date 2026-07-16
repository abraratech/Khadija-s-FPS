// OPS.1 R1 — privacy-aware client operations runtime.

import { ONLINE_LEADERBOARD_WORKER_URL } from './online_leaderboards_core.js';
import {
  OPS1_PATCH,
  OPS1_PREFERENCES_KEY,
  OPS1_QUEUE_KEY,
  bucketOpsMetric,
  enqueueOpsEvent,
  normalizeOpsEvent,
  normalizeOpsHealth,
  normalizeOpsPreferences,
  normalizeOpsQueue
} from './ops1_core.js';

const REQUEST_TIMEOUT_MS = 9_000;
const HEALTH_REFRESH_MS = 5 * 60 * 1000;
const ERROR_DEDUPE_MS = 30_000;

let initialized = false;
let preferences = normalizeOpsPreferences({});
let queue = [];
let busy = false;
let healthTimer = null;
let lastHealth = normalizeOpsHealth({});
let statusText = 'OPERATIONS INITIALIZING';
let recentFingerprints = new Map();

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value ?? '');
}

function setStatus(text, tone = 'neutral') {
  statusText = String(text || 'OPERATIONS OFFLINE').slice(0, 120);
  const element = document.getElementById('ops1-status');
  if (element) {
    element.textContent = statusText;
    element.dataset.tone = tone;
  }
}

function persistPreferences() {
  preferences = normalizeOpsPreferences({
    ...preferences,
    updatedAt: Date.now()
  });
  writeJson(OPS1_PREFERENCES_KEY, preferences);
}

function persistQueue() {
  queue = normalizeOpsQueue(queue);
  if (queue.length) {
    writeJson(OPS1_QUEUE_KEY, queue);
  } else {
    try {
      localStorage.removeItem(OPS1_QUEUE_KEY);
    } catch {
      // Storage is optional.
    }
  }
  setText('ops1-queue-count', String(queue.length));
}

function syncControls() {
  const level = document.getElementById('ops1-telemetry-level');
  const crash = document.getElementById('ops1-crash-reporting');
  if (level) level.value = preferences.telemetryLevel;
  if (crash) {
    crash.checked = preferences.crashReports === true;
    crash.disabled = preferences.telemetryLevel === 'off';
  }
  setText('ops1-queue-count', String(queue.length));
  setText(
    'ops1-privacy-summary',
    preferences.telemetryLevel === 'off'
      ? 'Operational data is disabled. Manual service-health checks remain available.'
      : preferences.telemetryLevel === 'standard'
        ? 'Sends redacted crashes, route failures, and coarse performance buckets.'
        : 'Sends only redacted crashes and critical service failures.'
  );
}

async function request(path, {
  method = 'GET',
  body = null,
  timeoutMs = REQUEST_TIMEOUT_MS,
  keepalive = false
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${ONLINE_LEADERBOARD_WORKER_URL}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      keepalive
    });
  } finally {
    clearTimeout(timer);
  }
}

function rememberFingerprint(event) {
  const now = Date.now();
  for (const [key, timestamp] of recentFingerprints) {
    if (now - timestamp > ERROR_DEDUPE_MS) recentFingerprints.delete(key);
  }
  const previous = recentFingerprints.get(event.fingerprint) || 0;
  if (now - previous < ERROR_DEDUPE_MS) return false;
  recentFingerprints.set(event.fingerprint, now);
  return true;
}

export async function flushOps1Queue({ keepalive = false } = {}) {
  if (busy || !queue.length || !navigator.onLine) return false;
  busy = true;
  try {
    while (queue.length) {
      const event = queue[0];
      let response;
      try {
        response = await request('/ops/events', {
          method: 'POST',
          body: { event },
          keepalive
        });
      } catch {
        setStatus(`OPERATIONS QUEUED · ${queue.length}`, 'warning');
        return false;
      }

      if (response.status === 429 || response.status >= 500) {
        setStatus(`OPERATIONS QUEUED · ${queue.length}`, 'warning');
        return false;
      }

      queue.shift();
      persistQueue();
    }
    setStatus(
      lastHealth.ok
        ? `SERVICE ${lastHealth.status.toUpperCase()} · PRIVACY ${preferences.telemetryLevel.toUpperCase()}`
        : `PRIVACY ${preferences.telemetryLevel.toUpperCase()} · HEALTH NOT CHECKED`,
      lastHealth.status === 'degraded' ? 'warning' : 'good'
    );
    return true;
  } finally {
    busy = false;
  }
}

export function recordOps1Event(input = {}, {
  keepalive = false
} = {}) {
  const event = normalizeOpsEvent(
    {
      ...input,
      releasePatch: input.releasePatch || OPS1_PATCH,
      timestamp: input.timestamp || Date.now()
    },
    { preferences }
  );
  if (!event || !rememberFingerprint(event)) return null;
  queue = enqueueOpsEvent(queue, event);
  persistQueue();
  void flushOps1Queue({ keepalive });
  return event;
}

export function recordOps1RouteFailure(route, status, reason = '') {
  return recordOps1Event({
    type: 'route-failure',
    severity: Number(status) >= 500 ? 'error' : 'warning',
    message: reason || `Route failed with status ${status}`,
    context: {
      route,
      status,
      online: navigator.onLine,
      retryable: Number(status) >= 500 || Number(status) === 429
    }
  });
}

export function recordOps1Performance({
  fps = 0,
  rtt = 0,
  jitter = 0,
  packetLoss = 0,
  mode = ''
} = {}) {
  if (!preferences.performanceMetrics) return null;
  return recordOps1Event({
    type: 'performance',
    severity: 'info',
    message: 'Coarse performance sample',
    context: {
      mode,
      bucket: bucketOpsMetric(fps, [20, 30, 45, 60, 90]),
      category: [
        `rtt:${bucketOpsMetric(rtt, [50, 100, 180, 300])}`,
        `jitter:${bucketOpsMetric(jitter, [10, 25, 50, 100])}`,
        `loss:${bucketOpsMetric(packetLoss, [0, 1, 3, 8])}`
      ].join('|')
    }
  });
}

export async function refreshOps1Health({ announce = false } = {}) {
  try {
    const response = await request('/ops/health');
    const value = await response.json().catch(() => ({}));
    lastHealth = normalizeOpsHealth(value);
    if (!response.ok || !lastHealth.ok) {
      setStatus('SERVICE HEALTH UNAVAILABLE', 'warning');
      if (announce) {
        recordOps1RouteFailure('/ops/health', response.status, value.error);
      }
      return lastHealth;
    }

    const tone = lastHealth.status === 'degraded' ? 'warning' : 'good';
    setStatus(
      `SERVICE ${lastHealth.status.toUpperCase()} · PRIVACY ${preferences.telemetryLevel.toUpperCase()}`,
      tone
    );
    setText(
      'ops1-health-details',
      `${lastHealth.events} events · ${lastHealth.errors} errors · ${lastHealth.reportsPending} reports pending`
    );
    return lastHealth;
  } catch {
    lastHealth = normalizeOpsHealth({});
    setStatus(
      navigator.onLine ? 'SERVICE HEALTH UNAVAILABLE' : 'OFFLINE · OPERATIONS QUEUED',
      'warning'
    );
    return lastHealth;
  }
}

function bindControls() {
  document.getElementById('ops1-telemetry-level')?.addEventListener(
    'change',
    (event) => {
      preferences = normalizeOpsPreferences({
        ...preferences,
        telemetryLevel: event.target.value,
        crashReports: event.target.value === 'off'
          ? false
          : preferences.crashReports
      });
      persistPreferences();
      syncControls();
      if (preferences.telemetryLevel === 'off') {
        queue = [];
        persistQueue();
        setStatus('OPERATIONAL DATA DISABLED', 'neutral');
      } else {
        void flushOps1Queue();
        void refreshOps1Health();
      }
    }
  );

  document.getElementById('ops1-crash-reporting')?.addEventListener(
    'change',
    (event) => {
      preferences = normalizeOpsPreferences({
        ...preferences,
        crashReports: event.target.checked
      });
      persistPreferences();
      syncControls();
    }
  );

  document.getElementById('ops1-health-refresh')?.addEventListener(
    'click',
    () => void refreshOps1Health({ announce: true })
  );

  document.getElementById('ops1-clear-local')?.addEventListener(
    'click',
    () => {
      queue = [];
      recentFingerprints.clear();
      persistQueue();
      setStatus('LOCAL OPERATIONS QUEUE CLEARED', 'good');
    }
  );
}

function installGlobalErrorCapture() {
  window.addEventListener('error', (event) => {
    if (!preferences.crashReports) return;
    recordOps1Event({
      type: 'client-crash',
      severity: 'error',
      message: event.message || 'Unhandled client error',
      stack: event.error?.stack || '',
      context: {
        source: 'window-error',
        route: location.pathname,
        online: navigator.onLine,
        visibility: document.visibilityState
      }
    }, { keepalive: true });
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!preferences.crashReports) return;
    const reason = event.reason;
    recordOps1Event({
      type: 'client-rejection',
      severity: 'error',
      message: reason?.message || String(reason || 'Unhandled promise rejection'),
      stack: reason?.stack || '',
      context: {
        source: 'unhandled-rejection',
        route: location.pathname,
        online: navigator.onLine,
        visibility: document.visibilityState
      }
    }, { keepalive: true });
  });

  window.addEventListener('online', () => {
    void flushOps1Queue();
    void refreshOps1Health();
  });

  window.addEventListener('offline', () => {
    setStatus(`OFFLINE · ${queue.length} OPERATIONS QUEUED`, 'warning');
  });

  window.addEventListener('pagehide', () => {
    void flushOps1Queue({ keepalive: true });
  });
}

export function getOps1Snapshot() {
  return Object.freeze({
    patch: OPS1_PATCH,
    preferences,
    queuedEvents: queue.length,
    health: lastHealth,
    statusText
  });
}

export function initOps1Systems() {
  if (initialized) return getOps1Snapshot();
  initialized = true;

  preferences = normalizeOpsPreferences(
    readJson(OPS1_PREFERENCES_KEY, {})
  );
  queue = normalizeOpsQueue(readJson(OPS1_QUEUE_KEY, []));
  persistPreferences();
  persistQueue();

  bindControls();
  installGlobalErrorCapture();
  syncControls();

  void refreshOps1Health();
  void flushOps1Queue();

  healthTimer = setInterval(() => {
    void refreshOps1Health();
    void flushOps1Queue();
  }, HEALTH_REFRESH_MS);

  setStatus(
    preferences.telemetryLevel === 'off'
      ? 'OPERATIONAL DATA DISABLED'
      : 'OPERATIONS READY',
    preferences.telemetryLevel === 'off' ? 'neutral' : 'good'
  );

  return getOps1Snapshot();
}
