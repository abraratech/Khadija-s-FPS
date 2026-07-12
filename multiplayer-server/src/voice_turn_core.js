// multiplayer-server/src/voice_turn_core.js
export const VOICE_TURN_PATCH = 'm5-coop-turn-fallback-r1';
export const VOICE_ICE_CONFIG_REQUEST_ACTION = 'voice-ice-config-request';
export const VOICE_ICE_CONFIG_ACTION = 'voice-ice-config';
export const VOICE_TURN_CREDENTIAL_TTL_SECONDS = 7200;
export const VOICE_TURN_REQUEST_COOLDOWN_MS = 10000;
const DEFAULT_ICE_SERVERS = Object.freeze([{ urls: Object.freeze(['stun:stun.cloudflare.com:3478']) }]);

function safeText(value, max = 512) { return String(value ?? '').trim().slice(0, max); }
function allowedIceUrl(value) {
  const url = safeText(value, 300);
  if (!/^(stun|turn|turns):/i.test(url) || /:53(?:\?|$)/i.test(url)) return '';
  const endpoint = url.replace(/^(stun|turn|turns):/i, '').split('?')[0];
  const host = endpoint.replace(/^\/\//, '').split(':')[0].toLowerCase();
  return ['stun.cloudflare.com', 'turn.cloudflare.com'].includes(host) ? url : '';
}
function normalizeUrls(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(allowedIceUrl).filter(Boolean))].slice(0, 8);
}

export function sanitizeGeneratedIceServers(candidate) {
  const output = [];
  for (const entry of Array.isArray(candidate) ? candidate.slice(0, 6) : []) {
    const urls = normalizeUrls(entry?.urls);
    if (!urls.length) continue;
    const hasTurn = urls.some((url) => /^turns?:/i.test(url));
    if (hasTurn) {
      const username = safeText(entry?.username, 512);
      const credential = safeText(entry?.credential, 512);
      if (!username || !credential) continue;
      output.push({ urls, username, credential });
    } else output.push({ urls });
  }
  if (!output.some((entry) => entry.urls.some((url) => /^stun:/i.test(url)))) {
    output.unshift({ urls: [...DEFAULT_ICE_SERVERS[0].urls] });
  }
  return output.length ? output : [{ urls: [...DEFAULT_ICE_SERVERS[0].urls] }];
}

export function hasTurnRelay(iceServers) {
  return sanitizeGeneratedIceServers(iceServers).some((entry) => entry.urls.some((url) => /^turns?:/i.test(url)));
}

export function stunOnlyVoiceIceConfig({ now = Date.now(), reason = 'not-configured' } = {}) {
  return {
    iceServers: [{ urls: [...DEFAULT_ICE_SERVERS[0].urls] }],
    turnRelayConfigured: false,
    source: `stun-only:${safeText(reason, 60)}`,
    generatedAt: now,
    expiresAt: now + 600000
  };
}

export function voiceIceConfigFresh(config, now = Date.now()) {
  return Boolean(config && Number(config.expiresAt) > now + 60000);
}

export function consumeVoiceIceRequestRate(state = {}, now = Date.now()) {
  const previous = Number(state.voiceIceLastRequestAt || 0);
  const allowed = previous <= 0 || now - previous >= VOICE_TURN_REQUEST_COOLDOWN_MS;
  return {
    allowed,
    retryAfterMs: allowed ? 0 : VOICE_TURN_REQUEST_COOLDOWN_MS - (now - previous),
    state: { voiceIceLastRequestAt: allowed ? now : previous }
  };
}

export function voiceTurnSecretsConfigured(env = {}) {
  return Boolean(safeText(env.TURN_KEY_ID, 256) && safeText(env.TURN_KEY_API_TOKEN, 1024));
}

export async function generateVoiceIceConfig(env = {}, {
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  ttlSeconds = VOICE_TURN_CREDENTIAL_TTL_SECONDS
} = {}) {
  if (!voiceTurnSecretsConfigured(env) || typeof fetchImpl !== 'function') {
    return stunOnlyVoiceIceConfig({ now, reason: 'not-configured' });
  }
  const keyId = safeText(env.TURN_KEY_ID, 256);
  const token = safeText(env.TURN_KEY_API_TOKEN, 1024);
  const ttl = Math.max(600, Math.min(86400, Math.floor(Number(ttlSeconds) || VOICE_TURN_CREDENTIAL_TTL_SECONDS)));
  try {
    const response = await fetchImpl(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl })
      }
    );
    if (!response?.ok) return stunOnlyVoiceIceConfig({ now, reason: 'upstream-rejected' });
    const body = await response.json();
    const iceServers = sanitizeGeneratedIceServers(body?.iceServers);
    if (!hasTurnRelay(iceServers)) return stunOnlyVoiceIceConfig({ now, reason: 'upstream-no-relay' });
    return {
      iceServers,
      turnRelayConfigured: true,
      source: 'cloudflare-turn',
      generatedAt: now,
      expiresAt: now + (ttl * 1000) - 60000
    };
  } catch {
    return stunOnlyVoiceIceConfig({ now, reason: 'upstream-unavailable' });
  }
}
