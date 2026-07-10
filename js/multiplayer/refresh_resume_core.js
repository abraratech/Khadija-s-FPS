// js/multiplayer/refresh_resume_core.js
// M3.41-M3.42 — deterministic one-shot room resume after a public stale-client refresh.

export const MULTIPLAYER_REFRESH_RESUME_PATCH = 'm3-refresh-hydration-seal-r1';
export const MULTIPLAYER_REFRESH_RESUME_VERSION = 1;
export const MULTIPLAYER_REFRESH_RESUME_TTL_MS = 2 * 60 * 1000;

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function finiteTime(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function safeUrl(href) {
  try {
    return new URL(String(href || ''), 'http://localhost/');
  } catch {
    return new URL('http://localhost/');
  }
}

export function isLoopbackRefreshResumeHost(hostname = '') {
  const host = cleanText(hostname).toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.localhost')
    || /^127(?:\.\d{1,3}){3}$/.test(host);
}

export function readMultiplayerRefreshToken(href = '') {
  const value = safeUrl(href).searchParams.get('mpRefresh');
  return cleanText(value);
}

export function normalizeMultiplayerLastRoom(value = null) {
  if (!value || typeof value !== 'object') return null;
  const roomCode = cleanText(value.roomCode).toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
  const serverUrl = cleanText(value.serverUrl);
  const displayName = cleanText(value.displayName, 'Player').slice(0, 24) || 'Player';
  if (!/^[A-Z2-9]{6}$/.test(roomCode) || !serverUrl) return null;
  return Object.freeze({ roomCode, serverUrl, displayName });
}

export function createMultiplayerRefreshResumeIntent({
  signature = '',
  refreshUrl = '',
  now = Date.now(),
  ttlMs = MULTIPLAYER_REFRESH_RESUME_TTL_MS
} = {}) {
  const normalizedSignature = cleanText(signature).slice(0, 320);
  const refreshToken = readMultiplayerRefreshToken(refreshUrl).slice(0, 80);
  const armedAt = finiteTime(now);
  const lifetime = Math.max(1000, finiteTime(ttlMs, MULTIPLAYER_REFRESH_RESUME_TTL_MS));
  if (!normalizedSignature || !refreshToken) return null;
  return Object.freeze({
    version: MULTIPLAYER_REFRESH_RESUME_VERSION,
    signature: normalizedSignature,
    refreshToken,
    armedAt,
    expiresAt: armedAt + lifetime
  });
}

function normalizeIntent(value) {
  if (!value || typeof value !== 'object') return null;
  const version = Math.trunc(Number(value.version));
  const signature = cleanText(value.signature).slice(0, 320);
  const refreshToken = cleanText(value.refreshToken).slice(0, 80);
  const armedAt = finiteTime(value.armedAt, -1);
  const expiresAt = finiteTime(value.expiresAt, -1);
  if (
    version !== MULTIPLAYER_REFRESH_RESUME_VERSION
    || !signature
    || !refreshToken
    || armedAt < 0
    || expiresAt <= armedAt
  ) {
    return null;
  }
  return Object.freeze({ version, signature, refreshToken, armedAt, expiresAt });
}

export function evaluateMultiplayerRefreshResume({
  intent = null,
  currentHref = 'http://localhost/',
  hostname = '',
  lastRoom = null,
  connected = false,
  connecting = false,
  now = Date.now()
} = {}) {
  const normalizedIntent = normalizeIntent(intent);
  const checkedAt = finiteTime(now);
  const currentUrl = safeUrl(currentHref);
  const currentToken = cleanText(currentUrl.searchParams.get('mpRefresh')).slice(0, 80);
  const effectiveHostname = cleanText(hostname || currentUrl.hostname);
  const normalizedRoom = normalizeMultiplayerLastRoom(lastRoom);

  let status = 'NONE';
  let reason = 'no-refresh-resume-intent';
  let autoRejoin = false;

  if (intent && !normalizedIntent) {
    status = 'INVALID';
    reason = 'invalid-refresh-resume-intent';
  } else if (normalizedIntent) {
    if (checkedAt > normalizedIntent.expiresAt || checkedAt < normalizedIntent.armedAt) {
      status = 'EXPIRED';
      reason = 'refresh-resume-intent-expired';
    } else if (isLoopbackRefreshResumeHost(effectiveHostname)) {
      status = 'BLOCKED';
      reason = 'loopback-auto-rejoin-blocked';
    } else if (!currentToken || currentToken !== normalizedIntent.refreshToken) {
      status = 'BLOCKED';
      reason = 'refresh-token-mismatch';
    } else if (connected === true || connecting === true) {
      status = 'BUSY';
      reason = 'multiplayer-connection-already-active';
    } else if (!normalizedRoom) {
      status = 'NO_ROOM';
      reason = 'no-valid-last-room';
    } else {
      status = 'READY';
      reason = 'fresh-client-room-rejoin-ready';
      autoRejoin = true;
    }
  }

  return Object.freeze({
    status,
    reason,
    autoRejoin,
    checkedAt,
    refreshToken: normalizedIntent?.refreshToken || currentToken || null,
    signature: normalizedIntent?.signature || null,
    lastRoom: normalizedRoom
  });
}

export function buildCleanMultiplayerRefreshUrl(href = '') {
  const url = safeUrl(href);
  url.searchParams.delete('mpRefresh');
  return url.toString();
}
