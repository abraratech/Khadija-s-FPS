// js/multiplayer/refresh_recovery.js
// M3.53-M3.54 — controlled retry and escape wired to resilience sealing.

import {
  createMultiplayerRefreshRecoveryIdentity,
  createMultiplayerRefreshRecoveryRecord,
  normalizeMultiplayerRefreshRecoveryRecord,
  transitionMultiplayerRefreshRecovery,
  MULTIPLAYER_REFRESH_RECOVERY_TTL_MS
} from './refresh_recovery_core.js';
import {
  armMultiplayerRefreshResume
} from './refresh_resume.js';
import {
  buildCleanMultiplayerRefreshUrl
} from './refresh_resume_core.js';
import {
  syncMultiplayerRefreshResilience
} from './refresh_resilience.js';

const STORAGE_KEY = 'khadija:mp-refresh-recovery-v1';
const RESUME_STORAGE_KEY = 'khadija:mp-refresh-room-resume-v1';
const OVERLAY_ID = 'ka-refresh-recovery-overlay';
const STYLE_ID = 'ka-refresh-recovery-style';

let activeRecord = null;
let activeSnapshot = null;

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_REFRESH_RECOVERY = activeSnapshot;
    } catch {
      // Diagnostics must never prevent the escape path.
    }
  }
  syncMultiplayerRefreshResilience({
    recovery: activeSnapshot
  });
  return activeSnapshot;
}

function readStored(now = Date.now()) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const normalized = normalizeMultiplayerRefreshRecoveryRecord(
      JSON.parse(raw),
      now
    );
    if (!normalized) {
      window.sessionStorage?.removeItem(STORAGE_KEY);
    }
    return normalized;
  } catch {
    return null;
  }
}

function writeStored(record) {
  if (typeof window === 'undefined') return false;
  try {
    window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function clearStored() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Restricted storage must not block recovery.
  }
}

function clearResumeIntent() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.removeItem(RESUME_STORAGE_KEY);
  } catch {
    // Restricted storage must not block a clean lobby escape.
  }
}

function cleanReason(reason = '') {
  return String(reason || 'The refreshed run could not be restored.')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 180);
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(4, 8, 15, 0.88);
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
    }
    #${OVERLAY_ID}[hidden] { display: none !important; }
    #${OVERLAY_ID} .ka-refresh-recovery-card {
      width: min(520px, 100%);
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 14px;
      padding: 24px;
      background: #111827;
      color: #f8fafc;
      box-shadow: 0 24px 80px rgba(0,0,0,0.55);
      text-align: center;
    }
    #${OVERLAY_ID} h2 {
      margin: 0 0 10px;
      font-size: 1.45rem;
    }
    #${OVERLAY_ID} p {
      margin: 8px 0 18px;
      color: #cbd5e1;
      line-height: 1.45;
    }
    #${OVERLAY_ID} .ka-refresh-recovery-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
    }
    #${OVERLAY_ID} button {
      min-width: 150px;
      border: 0;
      border-radius: 9px;
      padding: 11px 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    #${OVERLAY_ID} [data-action="retry"] {
      background: #f8fafc;
      color: #0f172a;
    }
    #${OVERLAY_ID} [data-action="escape"] {
      background: #334155;
      color: #f8fafc;
    }
    #${OVERLAY_ID} .ka-refresh-recovery-note {
      margin-top: 14px;
      font-size: 0.82rem;
      color: #94a3b8;
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
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'ka-refresh-recovery-title');
  overlay.innerHTML = `
    <div class="ka-refresh-recovery-card">
      <h2 id="ka-refresh-recovery-title">CO-OP RECOVERY DID NOT COMPLETE</h2>
      <p data-role="reason"></p>
      <div class="ka-refresh-recovery-actions">
        <button type="button" data-action="retry">RETRY RECOVERY</button>
        <button type="button" data-action="escape">RETURN TO LOBBY</button>
      </div>
      <div class="ka-refresh-recovery-note" data-role="note"></div>
    </div>
  `;

  overlay.querySelector('[data-action="retry"]')?.addEventListener(
    'click',
    () => requestMultiplayerRefreshRecoveryRetry()
  );
  overlay.querySelector('[data-action="escape"]')?.addEventListener(
    'click',
    () => escapeMultiplayerRefreshRecoveryToLobby()
  );
  document.body?.appendChild(overlay);
  return overlay;
}

function hideOverlay() {
  const overlay = typeof document === 'undefined'
    ? null
    : document.getElementById(OVERLAY_ID);
  if (overlay) overlay.hidden = true;
}

function showOverlay(record) {
  const overlay = ensureOverlay();
  if (!overlay) return;

  try {
    document.exitPointerLock?.();
  } catch {
    // Pointer-lock release is best effort.
  }

  const reason = overlay.querySelector('[data-role="reason"]');
  const retry = overlay.querySelector('[data-action="retry"]');
  const note = overlay.querySelector('[data-role="note"]');

  if (reason) {
    reason.textContent = cleanReason(record.reason);
  }
  if (retry) {
    retry.hidden = record.canRetry !== true;
    retry.disabled = record.canRetry !== true;
  }
  if (note) {
    note.textContent = record.canRetry
      ? 'One automatic recovery retry is available.'
      : 'The recovery retry has already been used. Return to the lobby and rejoin manually.';
  }
  overlay.hidden = false;
  retry?.focus?.();
}

function createRetryToken() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function currentCleanUrl() {
  const href = typeof window === 'undefined'
    ? 'http://localhost/'
    : window.location?.href || 'http://localhost/';
  return new URL(buildCleanMultiplayerRefreshUrl(href));
}

export function handleMultiplayerRefreshRecoveryFailure(
  readiness,
  now = Date.now()
) {
  const identity = createMultiplayerRefreshRecoveryIdentity({
    roomCode: readiness?.roomCode,
    runId: readiness?.runId,
    authorityEpoch: readiness?.authorityEpoch
  });
  const stored = readStored(now);
  const retryCount = stored?.identity === identity ? stored.retryCount : 0;
  const record = createMultiplayerRefreshRecoveryRecord({
    readiness,
    retryCount,
    now,
    ttlMs: MULTIPLAYER_REFRESH_RECOVERY_TTL_MS
  });
  if (!record) return null;

  activeRecord = record;
  writeStored(record);
  showOverlay(record);
  return publish(record);
}

export function requestMultiplayerRefreshRecoveryRetry(now = Date.now()) {
  if (!activeRecord) return null;
  const transition = transitionMultiplayerRefreshRecovery({
    record: activeRecord,
    action: 'RETRY',
    now
  });
  activeRecord = transition;
  publish(transition);

  if (transition.status !== 'RETRYING') {
    showOverlay(transition);
    return transition;
  }

  if (!writeStored(transition)) {
    const failed = Object.freeze({
      ...transition,
      status: 'RETRY_STORAGE_BLOCKED',
      reason: 'Unable to save the controlled retry. Return to the lobby.',
      canRetry: false
    });
    activeRecord = failed;
    showOverlay(failed);
    return publish(failed);
  }

  const target = currentCleanUrl();
  const refreshToken = createRetryToken().slice(0, 80);
  target.searchParams.set('mpRefresh', refreshToken);
  const signature = [
    'refresh-recovery',
    transition.identity,
    transition.retryCount,
    now
  ].join(':').slice(0, 320);

  const armed = armMultiplayerRefreshResume({
    signature,
    refreshUrl: target.toString(),
    now
  });
  if (armed?.status !== 'ARMED') {
    const failed = Object.freeze({
      ...transition,
      status: 'RETRY_ARM_FAILED',
      reason: 'Unable to arm the controlled retry. Return to the lobby.',
      canRetry: false
    });
    activeRecord = failed;
    showOverlay(failed);
    return publish(failed);
  }

  hideOverlay();
  if (typeof window !== 'undefined') {
    window.location?.replace?.(target.toString());
  }
  return transition;
}

export function escapeMultiplayerRefreshRecoveryToLobby(now = Date.now()) {
  const transition = activeRecord
    ? transitionMultiplayerRefreshRecovery({
        record: activeRecord,
        action: 'ESCAPE',
        now
      })
    : Object.freeze({
        status: 'ESCAPED',
        reason: 'refresh-recovery-returned-to-lobby',
        canRetry: false,
        final: true,
        updatedAt: now
      });

  activeRecord = null;
  clearStored();
  clearResumeIntent();
  hideOverlay();
  publish(transition);

  if (typeof window !== 'undefined') {
    const target = currentCleanUrl();
    window.location?.replace?.(target.toString());
  }
  return transition;
}

export function completeMultiplayerRefreshRecovery(now = Date.now()) {
  const stored = activeRecord || readStored(now);
  const transition = stored
    ? transitionMultiplayerRefreshRecovery({
        record: stored,
        action: 'RECOVER',
        now
      })
    : Object.freeze({
        status: 'RECOVERED',
        reason: 'refresh-recovery-succeeded',
        canRetry: false,
        final: true,
        updatedAt: now
      });

  activeRecord = null;
  clearStored();
  hideOverlay();
  return publish(transition);
}

export function cancelMultiplayerRefreshRecovery(now = Date.now()) {
  const stored = activeRecord || readStored(now);
  const transition = stored
    ? transitionMultiplayerRefreshRecovery({
        record: stored,
        action: 'CANCEL',
        now
      })
    : Object.freeze({
        status: 'CANCELLED',
        reason: 'refresh-recovery-cancelled',
        canRetry: false,
        final: true,
        updatedAt: now
      });

  activeRecord = null;
  clearStored();
  hideOverlay();
  return publish(transition);
}

export function syncMultiplayerRefreshRecoveryFromReadiness(
  readiness,
  now = Date.now()
) {
  if (!readiness || typeof readiness !== 'object') return activeSnapshot;

  if (
    readiness.status === 'READY'
    && readiness.health === 'PASS'
    && readiness.blocking === false
  ) {
    return completeMultiplayerRefreshRecovery(now);
  }

  if (
    readiness.final === true
    && readiness.health === 'FAIL'
    && ['FAILED', 'TIMED_OUT', 'INVALID'].includes(readiness.status)
  ) {
    return handleMultiplayerRefreshRecoveryFailure(readiness, now);
  }

  if (readiness.status === 'CANCELLED') {
    return cancelMultiplayerRefreshRecovery(now);
  }

  hideOverlay();
  return activeSnapshot;
}

export function getMultiplayerRefreshRecoverySnapshot() {
  return activeSnapshot;
}
