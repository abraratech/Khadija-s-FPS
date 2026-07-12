// js/multiplayer/live_voice_turn_core.js
export const LIVE_VOICE_TURN_PATCH = 'm5-coop-turn-fallback-r1';
export const VOICE_ICE_CONFIG_REQUEST_ACTION = 'voice-ice-config-request';
export const VOICE_ICE_CONFIG_ACTION = 'voice-ice-config';
export const VOICE_ICE_CONFIG_REJECTED_ACTION = 'voice-ice-config-rejected';
export const VOICE_ICE_REQUEST_TIMEOUT_MS = 4500;
export const VOICE_ICE_REFRESH_EARLY_MS = 300000;
export const DEFAULT_VOICE_ICE_SERVERS = Object.freeze([
  Object.freeze({ urls: Object.freeze(['stun:stun.cloudflare.com:3478']) })
]);

function safeText(value, max = 512) {
  return String(value ?? '').trim().slice(0, max);
}

function allowedIceUrl(value) {
  const url = safeText(value, 300);
  if (!/^(stun|turn|turns):/i.test(url)) return '';
  if (/:53(?:\?|$)/i.test(url)) return '';
  try {
    const endpoint = url.replace(/^(stun|turn|turns):/i, '').split('?')[0];
    const host = endpoint.replace(/^\/\//, '').split(':')[0].toLowerCase();
    if (!['stun.cloudflare.com', 'turn.cloudflare.com'].includes(host)) return '';
  } catch {
    return '';
  }
  return url;
}

function normalizeUrls(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(allowedIceUrl).filter(Boolean))].slice(0, 8);
}

export function normalizeVoiceIceServers(candidate) {
  const output = [];
  for (const entry of Array.isArray(candidate) ? candidate.slice(0, 6) : []) {
    const urls = normalizeUrls(entry?.urls);
    if (!urls.length) continue;
    const hasTurn = urls.some((url) => /^turns?:/i.test(url));
    if (hasTurn) {
      const username = safeText(entry?.username, 512);
      const credential = safeText(entry?.credential, 512);
      if (!username || !credential) continue;
      output.push(Object.freeze({ urls: Object.freeze(urls), username, credential }));
    } else {
      output.push(Object.freeze({ urls: Object.freeze(urls) }));
    }
  }
  if (!output.some((entry) => entry.urls.some((url) => /^stun:/i.test(url)))) {
    output.unshift(DEFAULT_VOICE_ICE_SERVERS[0]);
  }
  return Object.freeze(output.length ? output : [...DEFAULT_VOICE_ICE_SERVERS]);
}

export function hasVoiceTurnRelay(iceServers) {
  return normalizeVoiceIceServers(iceServers).some(
    (entry) => entry.urls.some((url) => /^turns?:/i.test(url))
  );
}

export function normalizeVoiceIceConfig(candidate, { now = Date.now() } = {}) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const generatedAt = Math.max(0, Number(source.generatedAt) || now);
  const expiresAt = Math.max(generatedAt + 1000, Number(source.expiresAt) || now + 30000);
  const iceServers = normalizeVoiceIceServers(source.iceServers);
  return Object.freeze({
    iceServers,
    turnRelayConfigured: source.turnRelayConfigured === true && hasVoiceTurnRelay(iceServers),
    source: safeText(source.source || 'stun-only', 80),
    generatedAt,
    expiresAt
  });
}

export function voiceIceConfigFresh(config, now = Date.now()) {
  return Boolean(config && Number(config.expiresAt) - VOICE_ICE_REFRESH_EARLY_MS > now);
}

export function voicePeerConfiguration(iceServers = DEFAULT_VOICE_ICE_SERVERS) {
  return Object.freeze({
    iceServers: normalizeVoiceIceServers(iceServers),
    bundlePolicy: 'max-bundle',
    iceCandidatePoolSize: 1
  });
}
