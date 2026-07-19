// NET.1 R1 — WebRTC hybrid transport policy and validation helpers.

export const NET1_PATCH = 'net1-r1-webrtc-hybrid-transport';
export const NET1_SCHEMA = 1;

export const NET1_TRANSPORT_PATHS = Object.freeze({
  LOCAL: 'LOCAL',
  CLOUD_RELAY: 'CLOUD RELAY',
  NEGOTIATING: 'NEGOTIATING',
  DIRECT: 'DIRECT',
  TURN_RELAY: 'TURN RELAY'
});

export const NET1_CHANNELS = Object.freeze({
  RELIABLE: 'ka-reliable',
  SNAPSHOT: 'ka-snapshot'
});

const DIRECT_FAST_TYPES = new Set([
  'input-command',
  'player-snapshot'
]);

const DIRECT_RELIABLE_TYPES = new Set([
  'gameplay-action',
  'tactical-ping',
  'heartbeat',
  'state-resync-request',
  'enemy-hit-request',
  'player-damage',
  'economy-request',
  'economy-result',
  'economy-snapshot',
  'world-snapshot',
  'revive-state',
  'run-stats',
  'coop2-state',
  'content1-state'
]);

const RELAY_SHADOW_TYPES = new Set([
  'enemy-hit-request',
  'player-damage',
  'economy-request',
  'economy-result',
  'economy-snapshot',
  'world-snapshot',
  'revive-state',
  'run-stats',
  'coop2-state',
  'content1-state',
  'state-resync-request'
]);

function cleanString(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

export function net1Supported(scope = globalThis) {
  return Boolean(
    scope
    && typeof scope.RTCPeerConnection === 'function'
    && (scope.isSecureContext === true || scope.location?.hostname === 'localhost')
  );
}

export function normalizeNet1IceServers(value) {
  const entries = Array.isArray(value) ? value : [];
  const normalized = [];
  for (const entry of entries.slice(0, 4)) {
    const urls = Array.isArray(entry?.urls) ? entry.urls : [entry?.urls];
    const cleanUrls = urls
      .map((url) => cleanString(url, 240))
      .filter(Boolean)
      .filter((url) => !/:(53)(?:\?|$)/i.test(url));
    if (!cleanUrls.length) continue;
    const next = { urls: cleanUrls };
    if (entry?.username) next.username = cleanString(entry.username, 512);
    if (entry?.credential) next.credential = cleanString(entry.credential, 512);
    normalized.push(next);
  }
  if (!normalized.length) {
    normalized.push({ urls: ['stun:stun.cloudflare.com:3478'] });
  }
  return normalized;
}

export function resolveNet1EnvelopePolicy(type) {
  const normalized = cleanString(type, 80).toLowerCase();
  if (DIRECT_FAST_TYPES.has(normalized)) {
    return Object.freeze({
      directEligible: true,
      channel: NET1_CHANNELS.SNAPSHOT,
      relayShadow: false,
      priority: 'fast'
    });
  }
  if (DIRECT_RELIABLE_TYPES.has(normalized)) {
    return Object.freeze({
      directEligible: true,
      channel: NET1_CHANNELS.RELIABLE,
      relayShadow: RELAY_SHADOW_TYPES.has(normalized),
      priority: 'critical'
    });
  }
  return Object.freeze({
    directEligible: false,
    channel: NET1_CHANNELS.RELIABLE,
    relayShadow: true,
    priority: 'relay'
  });
}

export function net1DeliveryKey(envelope = {}) {
  const explicit = cleanString(envelope.net1DeliveryKey, 260);
  if (explicit) return explicit;
  const messageId = cleanString(envelope.messageId, 320);
  if (!messageId) return '';
  const suffixIndex = messageId.lastIndexOf(':sender-');
  return suffixIndex > 0 ? messageId.slice(0, suffixIndex) : messageId;
}

export function sanitizeNet1Signal(value, {
  sourcePlayerId = null,
  targetPlayerId = null
} = {}) {
  const signal = value && typeof value === 'object' ? value : {};
  const kind = cleanString(signal.kind, 32).toLowerCase();
  if (!['offer', 'answer', 'candidate', 'renegotiate'].includes(kind)) return null;
  const source = cleanString(sourcePlayerId || signal.sourcePlayerId, 180);
  const target = cleanString(targetPlayerId || signal.targetPlayerId, 180);
  if (!source || !target || source === target) return null;
  const result = { kind, sourcePlayerId: source, targetPlayerId: target };
  if (kind === 'candidate') {
    const candidate = signal.candidate && typeof signal.candidate === 'object'
      ? signal.candidate
      : null;
    if (!candidate) return null;
    result.candidate = {
      candidate: cleanString(candidate.candidate, 2048),
      sdpMid: candidate.sdpMid === null ? null : cleanString(candidate.sdpMid, 64),
      sdpMLineIndex: Number.isFinite(Number(candidate.sdpMLineIndex))
        ? Math.max(0, Math.floor(Number(candidate.sdpMLineIndex)))
        : null,
      usernameFragment: candidate.usernameFragment
        ? cleanString(candidate.usernameFragment, 160)
        : undefined
    };
    return result;
  }
  if (kind === 'renegotiate') return result;
  const description = signal.description && typeof signal.description === 'object'
    ? signal.description
    : null;
  if (!description || !['offer', 'answer'].includes(description.type)) return null;
  result.description = {
    type: description.type,
    sdp: cleanString(description.sdp, 48 * 1024)
  };
  return result;
}


const HOST_ONLY_DIRECT_TYPES = new Set([
  'world-snapshot',
  'player-damage',
  'economy-result',
  'economy-snapshot'
]);

export function net1EnvelopeSourceAllowed(envelope = {}, sourcePlayerId, room = {}) {
  const source = cleanString(sourcePlayerId, 180);
  const actor = cleanString(envelope?.playerId, 180);
  if (!source || !actor) return false;
  const hostPlayerId = cleanString(room?.hostPlayerId, 180);
  const type = cleanString(envelope?.type, 80).toLowerCase();
  const kind = cleanString(envelope?.payload?.kind, 40).toLowerCase();
  const hostOnly = HOST_ONLY_DIRECT_TYPES.has(type)
    || (type === 'revive-state' && kind === 'snapshot')
    || (type === 'coop2-state' && kind === 'snapshot')
    || (type === 'content1-state' && kind === 'snapshot')
    || (type === 'run-stats' && kind === 'final');
  if (hostOnly && source !== hostPlayerId) return false;
  if (actor === source) return true;
  if (source !== hostPlayerId) return false;
  return Object.values(room?.virtualPlayers || {}).some((entry) => (
    cleanString(entry?.playerId, 180) === actor
    && entry?.isBot === true
    && entry?.connected !== false
  ));
}

export function resolveNet1PathFromCandidateStats(stats = []) {
  const entries = Array.isArray(stats) ? stats : Array.from(stats?.values?.() || []);
  const pairs = new Map(entries.map((entry) => [entry.id, entry]));
  const selectedPair = entries.find((entry) => (
    entry?.type === 'candidate-pair'
    && (entry.selected === true || entry.nominated === true)
    && entry.state === 'succeeded'
  ));
  if (!selectedPair) return NET1_TRANSPORT_PATHS.DIRECT;
  const local = pairs.get(selectedPair.localCandidateId);
  const remote = pairs.get(selectedPair.remoteCandidateId);
  return local?.candidateType === 'relay' || remote?.candidateType === 'relay'
    ? NET1_TRANSPORT_PATHS.TURN_RELAY
    : NET1_TRANSPORT_PATHS.DIRECT;
}

export function net1HumanPeerIds(room, localPlayerId) {
  return (room?.players || [])
    .filter((entry) => (
      entry?.playerId
      && entry.playerId !== localPlayerId
      && entry.isBot !== true
      && entry.connected !== false
    ))
    .map((entry) => String(entry.playerId))
    .sort();
}
