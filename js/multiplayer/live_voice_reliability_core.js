// js/multiplayer/live_voice_reliability_core.js
export const LIVE_VOICE_RELIABILITY_PATCH = 'm5-coop-voice-reliability-r1';
export const VOICE_DISCONNECT_GRACE_MS = 4000;
export const VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS = 4;
export const VOICE_REPAIR_WINDOW_MS = 60000;
export const VOICE_STATS_SAMPLE_MS = 2500;

const REPAIR_DELAYS_MS = Object.freeze([0, 1600, 3200, 6400, 10000]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeVoicePeerState(connectionState, iceConnectionState) {
  const connection = String(connectionState || '').toLowerCase();
  const ice = String(iceConnectionState || '').toLowerCase();
  if (connection === 'closed' || ice === 'closed') return 'closed';
  if (connection === 'failed' || ice === 'failed') return 'failed';
  if (connection === 'connected' || ice === 'connected' || ice === 'completed') return 'connected';
  if (connection === 'disconnected' || ice === 'disconnected') return 'disconnected';
  if (connection === 'connecting' || connection === 'new' || ice === 'checking' || ice === 'new') return 'connecting';
  return 'unknown';
}

export function voiceRepairDelay(attempt) {
  const index = Math.max(0, Math.min(REPAIR_DELAYS_MS.length - 1, Math.floor(finite(attempt, 0))));
  return REPAIR_DELAYS_MS[index];
}

export function shouldRepairVoicePeer({
  active = false,
  online = true,
  state = 'unknown',
  disconnectedForMs = 0,
  attempts = 0,
  now = Date.now(),
  nextRetryAt = 0,
} = {}) {
  if (active !== true || online !== true) return false;
  if (attempts >= VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS) return false;
  if (finite(nextRetryAt, 0) > finite(now, Date.now())) return false;
  if (state === 'failed') return true;
  return state === 'disconnected' && finite(disconnectedForMs, 0) >= VOICE_DISCONNECT_GRACE_MS;
}

export function normalizeVoiceQualityMetrics(candidate = {}) {
  const packetsReceived = Math.max(0, Math.floor(finite(candidate.packetsReceived, 0)));
  const packetsLost = Math.max(0, Math.floor(finite(candidate.packetsLost, 0)));
  const total = packetsReceived + packetsLost;
  const inferredLoss = total > 0 ? (packetsLost / total) * 100 : 0;
  return Object.freeze({
    packetsReceived,
    packetsLost,
    lossPercent: Math.max(0, Math.min(100, finite(candidate.lossPercent, inferredLoss))),
    jitterMs: Math.max(0, finite(candidate.jitterMs, 0)),
    rttMs: Math.max(0, finite(candidate.rttMs, 0)),
  });
}

export function classifyVoiceQuality(candidate = {}) {
  const metrics = normalizeVoiceQualityMetrics(candidate);
  if (metrics.lossPercent < 1 && metrics.jitterMs < 30 && metrics.rttMs < 180) return 'excellent';
  if (metrics.lossPercent < 3 && metrics.jitterMs < 60 && metrics.rttMs < 300) return 'good';
  if (metrics.lossPercent < 8 && metrics.jitterMs < 120 && metrics.rttMs < 600) return 'degraded';
  return 'poor';
}

export function summarizeVoiceHealth(peers = [], { active = false, online = true } = {}) {
  const values = Array.isArray(peers) ? peers : [];
  if (!active) return Object.freeze({ state: 'off', connected: 0, total: values.length, label: 'LIVE VOICE IS OFF' });
  if (!online) return Object.freeze({ state: 'offline', connected: 0, total: values.length, label: 'NETWORK OFFLINE · PTT MUTED' });
  if (!values.length) return Object.freeze({ state: 'waiting', connected: 0, total: 0, label: 'WAITING FOR A VOICE PEER' });
  const connected = values.filter((entry) => entry?.state === 'connected').length;
  const blocked = values.some((entry) => entry?.blocked === true);
  const recovering = values.some((entry) => entry?.recovering === true || ['failed', 'disconnected'].includes(entry?.state));
  if (blocked) return Object.freeze({ state: 'blocked', connected, total: values.length, label: 'DIRECT VOICE BLOCKED · TURN MAY BE REQUIRED' });
  if (recovering) return Object.freeze({ state: 'recovering', connected, total: values.length, label: `RECOVERING VOICE · ${connected}/${values.length} CONNECTED` });
  const qualities = values.filter((entry) => entry?.state === 'connected').map((entry) => entry?.quality || 'good');
  const rank = { excellent: 0, good: 1, degraded: 2, poor: 3 };
  const quality = qualities.sort((a, b) => (rank[b] ?? 1) - (rank[a] ?? 1))[0] || 'good';
  return Object.freeze({ state: 'connected', connected, total: values.length, quality, label: `VOICE HEALTH · ${connected}/${values.length} · ${quality.toUpperCase()}` });
}
