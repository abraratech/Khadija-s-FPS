// js/multiplayer/suspend_resume.js
// M3.59-M3.60 — queued lifecycle evaluation with suspension resilience sealing.

import {
  createMultiplayerSuspendIncident,
  evaluateMultiplayerSuspendResume,
  normalizeMultiplayerSuspendIncident,
  MULTIPLAYER_SUSPEND_MIN_GAP_MS
} from './suspend_resume_core.js';
import {
  createMultiplayerSuspendWakeProbe,
  evaluateMultiplayerSuspendWakeProbe,
  MULTIPLAYER_SUSPEND_WAKE_PROBE_POLL_MS
} from './suspend_wake_probe_core.js';
import {
  syncMultiplayerSuspendResilienceGuard,
  syncMultiplayerSuspendResilienceProbe
} from './suspend_resilience.js';
import {
  armMultiplayerRefreshResume
} from './refresh_resume.js';
import {
  buildCleanMultiplayerRefreshUrl
} from './refresh_resume_core.js';

const STORAGE_KEY = 'khadija:mp-suspend-resume-v1';
const OVERLAY_ID = 'ka-suspend-resume-overlay';
const STYLE_ID = 'ka-suspend-resume-style';

let activeIncident = null;
let activeSnapshot = null;
let activeProbeSnapshot = null;
let busy = false;
let pendingOnline = false;
let queuedResumeOptions = null;

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
}

function createToken() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_SUSPEND_GUARD = activeSnapshot;
    } catch {
      // Lifecycle diagnostics must never interrupt the recovery path.
    }
  }
  syncMultiplayerSuspendResilienceGuard(activeSnapshot);
  return activeSnapshot;
}

function publishProbe(snapshot) {
  activeProbeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_WAKE_PROBE = activeProbeSnapshot;
    } catch {
      // Probe diagnostics must never interrupt recovery.
    }
  }
  syncMultiplayerSuspendResilienceProbe(activeProbeSnapshot);
  return activeProbeSnapshot;
}

function mergeQueuedResumeOptions(current, incoming) {
  if (!current) return { ...incoming };
  return {
    ...current,
    ...incoming,
    persisted: current.persisted === true || incoming.persisted === true,
    frozen: current.frozen === true || incoming.frozen === true,
    now: Math.max(Number(current.now) || 0, Number(incoming.now) || 0)
  };
}

function writeIncident(incident) {
  if (typeof window === 'undefined') return false;
  try {
    window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(incident));
    return true;
  } catch {
    return false;
  }
}

function readIncident(now = Date.now()) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const incident = normalizeMultiplayerSuspendIncident(JSON.parse(raw), now);
    if (!incident) {
      window.sessionStorage?.removeItem(STORAGE_KEY);
    }
    return incident;
  } catch {
    return null;
  }
}

function clearIncident() {
  activeIncident = null;
  pendingOnline = false;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Restricted storage does not invalidate the runtime guard.
  }
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483645;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(3, 7, 18, 0.9);
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
    }
    #${OVERLAY_ID}[hidden] { display: none !important; }
    #${OVERLAY_ID} .ka-suspend-card {
      width: min(480px, 100%);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 14px;
      padding: 24px;
      color: #f8fafc;
      background: #111827;
      text-align: center;
      box-shadow: 0 24px 80px rgba(0,0,0,0.55);
    }
    #${OVERLAY_ID} h2 {
      margin: 0 0 10px;
      font-size: 1.35rem;
    }
    #${OVERLAY_ID} p {
      margin: 0;
      color: #cbd5e1;
      line-height: 1.5;
    }
  `;
  document.head?.appendChild(style);
}

function ensureOverlay() {
  if (typeof document === 'undefined') return null;
  ensureStyle();
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.hidden = true;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'assertive');
  overlay.innerHTML = `
    <div class="ka-suspend-card">
      <h2>CO-OP SESSION RECOVERY</h2>
      <p data-role="message">Checking the active co-op connection…</p>
    </div>
  `;
  document.body?.appendChild(overlay);
  return overlay;
}

function showOverlay(message) {
  const overlay = ensureOverlay();
  if (!overlay) return;
  const text = overlay.querySelector('[data-role="message"]');
  if (text) text.textContent = String(message || '').slice(0, 180);
  overlay.hidden = false;
  try {
    document.exitPointerLock?.();
  } catch {
    // Pointer lock release is best effort.
  }
}

function hideOverlay() {
  const overlay = typeof document === 'undefined'
    ? null
    : document.getElementById(OVERLAY_ID);
  if (overlay) overlay.hidden = true;
}

function inputCapture(event) {
  if (activeSnapshot?.blocking !== true) return;
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
  event.stopPropagation?.();
}

function installInputShield() {
  if (typeof window === 'undefined') return;
  for (const type of ['keydown', 'mousedown', 'pointerdown', 'touchstart', 'wheel']) {
    window.addEventListener(type, inputCapture, {
      capture: true,
      passive: false
    });
  }
}

function alreadyRecovering() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location?.search || '');
  if (params.has('mpRefresh')) return true;

  const readiness = window.KHADIJA_MULTIPLAYER_REFRESH_READINESS;
  if (readiness?.blocking === true) return true;

  const recovery = window.KHADIJA_MULTIPLAYER_REFRESH_RECOVERY;
  return [
    'PROMPT',
    'RETRYING',
    'RETRY_EXHAUSTED',
    'RETRY_STORAGE_BLOCKED',
    'RETRY_ARM_FAILED'
  ].includes(String(recovery?.status || '').toUpperCase());
}

function markSuspended(reason = 'visibility-hidden', now = Date.now()) {
  if (activeIncident) return activeIncident;
  const incident = createMultiplayerSuspendIncident({
    hiddenAt: now,
    createdAt: now,
    reason,
    incidentId: createToken()
  });
  if (!incident) return null;
  activeIncident = incident;
  writeIncident(incident);
  publish({
    ...incident,
    status: 'SUSPENDED',
    health: 'PASS',
    reason: 'multiplayer-tab-suspended',
    action: 'WAIT_RESUME',
    blocking: false,
    final: false,
    checkedAt: now
  });
  return incident;
}

function cleanCurrentUrl() {
  const href = typeof window === 'undefined'
    ? 'http://localhost/'
    : window.location?.href || 'http://localhost/';
  return new URL(buildCleanMultiplayerRefreshUrl(href));
}

async function runWakeProbe(foundation, now = Date.now()) {
  const runtime = foundation?.multiplayerRuntime;
  const transport = foundation?.multiplayerTransport;
  const session = foundation?.multiplayerSession;
  const probe = createMultiplayerSuspendWakeProbe({
    incidentId: activeIncident?.incidentId,
    runId: session?.run?.runId || 'active-run',
    startedAt: now
  });
  if (!probe) {
    return publishProbe({
      status: 'INVALID',
      health: 'FAIL',
      reason: 'invalid-suspend-wake-probe',
      action: 'REFRESH',
      blocking: true,
      final: true,
      checkedAt: now
    });
  }

  let pingIssued = false;
  let lastState = null;

  while (true) {
    const checkedAt = Date.now();
    const online = typeof navigator === 'undefined'
      ? true
      : navigator.onLine !== false;
    const transportState = transport?.getState?.() || 'disconnected';

    if (online && transportState === 'connected' && !pingIssued) {
      pingIssued = runtime?.sendHeartbeatPing?.(checkedAt) != null;
    }

    const networkQuality = runtime?.getNetworkQualitySnapshot?.(checkedAt) || null;
    lastState = evaluateMultiplayerSuspendWakeProbe({
      probe,
      now: checkedAt,
      online,
      transportState,
      networkQuality,
      pingIssued
    });
    publishProbe(lastState);

    if (lastState.final === true || lastState.status === 'WAITING_ONLINE') {
      return lastState;
    }

    await sleep(MULTIPLAYER_SUSPEND_WAKE_PROBE_POLL_MS);
  }
}

async function armSafeRefresh(result, session, now = Date.now()) {
  showOverlay('The active socket did not answer. Preparing a safe return to the co-op run…');

  const target = cleanCurrentUrl();
  const refreshToken = createToken().slice(0, 80);
  target.searchParams.set('mpRefresh', refreshToken);

  const runId = String(session?.run?.runId || 'active-run').slice(0, 160);
  const authorityEpoch = Math.max(
    0,
    Math.floor(Number(session?.run?.authorityEpoch) || 0)
  );
  const signature = [
    'suspend-wake-probe',
    activeIncident?.incidentId || 'incident',
    runId,
    authorityEpoch,
    now
  ].join(':').slice(0, 320);

  const armed = armMultiplayerRefreshResume({
    signature,
    refreshUrl: target.toString(),
    now
  });

  if (armed?.status !== 'ARMED') {
    const failed = Object.freeze({
      ...result,
      status: 'ARM_FAILED',
      health: 'FAIL',
      reason: armed?.reason || 'suspend-resume-refresh-arm-failed',
      action: 'NONE',
      blocking: true,
      final: true
    });
    showOverlay('The safe recovery could not be armed. Reload the page manually to return to the room.');
    return publish(failed);
  }

  const armedSnapshot = Object.freeze({
    ...result,
    status: 'ARMED',
    health: 'PASS',
    reason: 'suspend-resume-refresh-armed',
    action: 'RELOAD',
    blocking: true,
    final: true,
    refreshToken: armed.refreshToken || refreshToken
  });
  writeIncident({
    ...activeIncident,
    status: 'ARMED',
    armedAt: now
  });
  publish(armedSnapshot);
  window.location?.replace?.(target.toString());
  return armedSnapshot;
}

async function evaluateResume({
  persisted = false,
  frozen = false,
  reason = 'visibility-visible',
  now = Date.now()
} = {}) {
  if (busy) {
    queuedResumeOptions = mergeQueuedResumeOptions(
      queuedResumeOptions,
      { persisted, frozen, reason, now }
    );
    return activeSnapshot;
  }
  busy = true;
  try {
    activeIncident = activeIncident || readIncident(now);
    if (!activeIncident && (persisted || frozen)) {
      activeIncident = createMultiplayerSuspendIncident({
        hiddenAt: Math.max(0, now - MULTIPLAYER_SUSPEND_MIN_GAP_MS),
        createdAt: now,
        reason,
        incidentId: createToken()
      });
      if (activeIncident) writeIncident(activeIncident);
    }

    if (!activeIncident) {
      return publish({
        status: 'IDLE',
        health: 'PASS',
        reason: 'suspend-resume-no-incident',
        action: 'NONE',
        blocking: false,
        final: false,
        checkedAt: now
      });
    }

    const foundation = await import('./foundation.js');
    const activeRun = foundation.isOnlineMultiplayerRun?.() === true;
    const session = foundation.multiplayerSession || null;
    const online = typeof navigator === 'undefined'
      ? true
      : navigator.onLine !== false;

    const result = evaluateMultiplayerSuspendResume({
      incident: activeIncident,
      now,
      activeRun,
      online,
      alreadyRecovering: alreadyRecovering(),
      persisted,
      frozen
    });
    publish(result);

    if (result.status === 'WAITING_ONLINE') {
      pendingOnline = true;
      showOverlay('The network is offline. Recovery will continue automatically when the connection returns.');
      return result;
    }

    if (result.action !== 'PROBE_TRANSPORT') {
      pendingOnline = false;
      if (!result.blocking) hideOverlay();
      if (['INACTIVE', 'SHORT_GAP'].includes(result.status)) clearIncident();
      return result;
    }

    pendingOnline = false;
    showOverlay('Checking whether the active co-op connection is still healthy…');
    const probe = await runWakeProbe(foundation, now);

    if (probe.status === 'WAITING_ONLINE') {
      pendingOnline = true;
      const waiting = Object.freeze({
        ...result,
        status: 'WAITING_ONLINE',
        health: 'WARN',
        reason: 'suspend-wake-probe-waiting-for-network',
        action: 'WAIT_ONLINE',
        blocking: true,
        final: false
      });
      showOverlay('The network is offline. Recovery will continue automatically when the connection returns.');
      return publish(waiting);
    }

    if (probe.status === 'HEALTHY') {
      clearIncident();
      hideOverlay();
      return publish({
        ...result,
        status: 'RESUMED_LIVE',
        health: 'PASS',
        reason: probe.reason,
        action: 'CONTINUE',
        blocking: false,
        final: true,
        wakeProbe: probe
      });
    }

    return armSafeRefresh({
      ...result,
      wakeProbe: probe
    }, session, Date.now());
  } catch (error) {
    const failed = Object.freeze({
      ...(activeIncident || {}),
      status: 'FAILED',
      health: 'FAIL',
      reason: String(error?.message || error || 'suspend-resume-runtime-failed')
        .slice(0, 200),
      action: 'NONE',
      blocking: true,
      final: true,
      checkedAt: now
    });
    showOverlay('The suspended session could not be checked safely. Reload the page manually to return to the room.');
    return publish(failed);
  } finally {
    busy = false;
    const queued = queuedResumeOptions;
    queuedResumeOptions = null;
    if (queued) {
      queueMicrotask(() => {
        evaluateResume(queued);
      });
    }
  }
}

function initialize() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  installInputShield();

  const params = new URLSearchParams(window.location?.search || '');
  if (params.has('mpRefresh')) {
    clearIncident();
    publishProbe({
      status: 'HANDED_OFF',
      health: 'PASS',
      reason: 'suspend-wake-probe-refresh-handoff-active',
      action: 'NONE',
      blocking: false,
      final: true,
      checkedAt: Date.now()
    });
  } else {
    activeIncident = readIncident(Date.now());
  }

  publish({
    status: params.has('mpRefresh') ? 'HANDOFF' : 'IDLE',
    health: 'PASS',
    reason: params.has('mpRefresh')
      ? 'suspend-resume-refresh-handoff-active'
      : 'suspend-resume-guard-ready',
    action: 'NONE',
    blocking: false,
    final: false,
    checkedAt: Date.now()
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      markSuspended('visibility-hidden');
    } else if (document.visibilityState === 'visible') {
      evaluateResume({ reason: 'visibility-visible' });
    }
  });

  window.addEventListener('pagehide', (event) => {
    if (event.persisted === true) markSuspended('pagehide-persisted');
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted === true) {
      evaluateResume({
        persisted: true,
        reason: 'pageshow-persisted'
      });
    }
  });

  window.addEventListener('freeze', () => {
    markSuspended('page-freeze');
  });

  window.addEventListener('resume', () => {
    evaluateResume({
      frozen: true,
      reason: 'page-resume'
    });
  });

  window.addEventListener('online', () => {
    if (pendingOnline || activeSnapshot?.status === 'WAITING_ONLINE') {
      evaluateResume({ reason: 'network-online' });
    }
  });
}

initialize();

export function getMultiplayerSuspendResumeSnapshot() {
  return activeSnapshot;
}

export function getMultiplayerSuspendWakeProbeSnapshot() {
  return activeProbeSnapshot;
}

export function evaluateMultiplayerSuspendResumeNow(options = {}) {
  return evaluateResume(options);
}
