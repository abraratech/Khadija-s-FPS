// js/multiplayer/refresh_resume.js
// M3.41-M3.42 — browser storage/runtime for refresh-safe room rejoin.

import {
  buildCleanMultiplayerRefreshUrl,
  createMultiplayerRefreshResumeIntent,
  evaluateMultiplayerRefreshResume
} from './refresh_resume_core.js';

const STORAGE_KEY = 'khadija:mp-refresh-room-resume-v1';
let activeSnapshot = null;

function publish(snapshot) {
  activeSnapshot = Object.freeze({ ...snapshot });
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_REFRESH_RESUME = activeSnapshot;
    } catch {
      // Read-only globals must not block recovery.
    }
  }
  return activeSnapshot;
}

function readAndConsumeIntent() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY);
    window.sessionStorage?.removeItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cleanRefreshTokenFromAddressBar(href) {
  if (typeof window === 'undefined') return;
  const cleanUrl = buildCleanMultiplayerRefreshUrl(href);
  if (cleanUrl === href) return;
  try {
    window.history?.replaceState?.(window.history.state, '', cleanUrl);
  } catch {
    // URL cleanup is cosmetic and must not block the rejoin.
  }
}

export function armMultiplayerRefreshResume({ signature, refreshUrl, now = Date.now() } = {}) {
  const intent = createMultiplayerRefreshResumeIntent({ signature, refreshUrl, now });
  if (!intent) {
    return publish({
      status: 'INVALID',
      reason: 'refresh-resume-intent-not-armed',
      armedAt: now
    });
  }

  let stored = false;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(intent));
      stored = true;
    } catch {
      stored = false;
    }
  }

  return publish({
    status: stored ? 'ARMED' : 'STORAGE_BLOCKED',
    reason: stored ? 'refresh-resume-intent-armed' : 'session-storage-unavailable',
    armedAt: intent.armedAt,
    expiresAt: intent.expiresAt,
    refreshToken: intent.refreshToken,
    signature: intent.signature
  });
}

export function consumeMultiplayerRefreshResume({
  lastRoom = null,
  connected = false,
  connecting = false,
  now = Date.now()
} = {}) {
  const intent = readAndConsumeIntent();
  const currentHref = typeof window === 'undefined'
    ? 'http://localhost/'
    : window.location?.href || 'http://localhost/';
  const hostname = typeof window === 'undefined'
    ? 'localhost'
    : window.location?.hostname || '';

  const result = evaluateMultiplayerRefreshResume({
    intent,
    currentHref,
    hostname,
    lastRoom,
    connected,
    connecting,
    now
  });

  cleanRefreshTokenFromAddressBar(currentHref);
  return publish({
    ...result,
    consumedAt: now
  });
}

export function markMultiplayerRefreshResumeResult({
  status,
  roomCode = null,
  reason = '',
  now = Date.now()
} = {}) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  const prior = activeSnapshot;
  if (!prior) return null;

  const allowed = (
    (normalizedStatus === 'CONNECTING' && prior.status === 'READY')
    || (normalizedStatus === 'FAILED' && ['READY', 'CONNECTING'].includes(prior.status))
    || (normalizedStatus === 'CONNECTED' && prior.status === 'CONNECTING')
  );
  if (!allowed) return prior;

  return publish({
    ...prior,
    status: normalizedStatus,
    reason: String(reason || prior.reason || '').slice(0, 160),
    roomCode: String(roomCode || prior.lastRoom?.roomCode || '').slice(0, 6) || null,
    updatedAt: now
  });
}

export function getMultiplayerRefreshResumeSnapshot() {
  return activeSnapshot;
}
