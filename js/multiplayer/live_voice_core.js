// js/multiplayer/live_voice_core.js
export const LIVE_VOICE_PATCH = 'm5-coop-turn-fallback-r1';
export const LIVE_VOICE_SIGNAL_ACTION = 'voice-signal';
export const LIVE_VOICE_STUN_URL = 'stun:stun.cloudflare.com:3478';
export const LIVE_VOICE_SIGNAL_KINDS = Object.freeze({
  READY: 'ready',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  PTT_STATE: 'ptt-state',
  STOP: 'stop',
});
export const LIVE_VOICE_MAX_SDP_LENGTH = 24_000;
export const LIVE_VOICE_MAX_CANDIDATE_LENGTH = 4_096;

const VALID_KINDS = new Set(Object.values(LIVE_VOICE_SIGNAL_KINDS));

function cleanString(value, maxLength = 180) {
  return String(value ?? '')
    .normalize?.('NFKC')
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    ?.trim()
    ?.slice(0, maxLength) || '';
}

export function shouldInitiateVoiceOffer(localPlayerId, remotePlayerId) {
  const local = cleanString(localPlayerId, 160);
  const remote = cleanString(remotePlayerId, 160);
  return Boolean(local && remote && local !== remote && local.localeCompare(remote) < 0);
}

export function roomVoicePeers(room, localPlayerId) {
  const local = cleanString(localPlayerId, 160);
  const players = Array.isArray(room?.players) ? room.players : [];
  const seen = new Set();
  const peers = [];
  for (const entry of players) {
    const playerId = cleanString(entry?.playerId || entry?.id, 160);
    if (!playerId || playerId === local || entry?.connected === false || seen.has(playerId)) continue;
    seen.add(playerId);
    peers.push(Object.freeze({
      playerId,
      displayName: cleanString(entry?.displayName || entry?.name || 'Player', 24) || 'Player',
    }));
  }
  return Object.freeze(peers.sort((a, b) => a.playerId.localeCompare(b.playerId)));
}

export function normalizeSessionDescription(candidate, expectedType = null) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const type = cleanString(candidate.type, 16).toLowerCase();
  if (!['offer', 'answer'].includes(type)) return null;
  if (expectedType && type !== expectedType) return null;
  const sdp = String(candidate.sdp || '').slice(0, LIVE_VOICE_MAX_SDP_LENGTH);
  if (!sdp) return null;
  return Object.freeze({ type, sdp });
}

export function normalizeIceCandidate(candidate) {
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const value = String(candidate.candidate || '').slice(0, LIVE_VOICE_MAX_CANDIDATE_LENGTH);
  if (!value) return null;
  const sdpMid = candidate.sdpMid === null || candidate.sdpMid === undefined
    ? null
    : cleanString(candidate.sdpMid, 80);
  const index = Number(candidate.sdpMLineIndex);
  const usernameFragment = candidate.usernameFragment === null || candidate.usernameFragment === undefined
    ? null
    : cleanString(candidate.usernameFragment, 256);
  return Object.freeze({
    candidate: value,
    sdpMid,
    sdpMLineIndex: Number.isInteger(index) && index >= 0 && index <= 128 ? index : null,
    usernameFragment,
  });
}

export function normalizeIncomingVoiceSignal(candidate, { localPlayerId = null } = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const kind = cleanString(candidate.kind, 32).toLowerCase();
  if (!VALID_KINDS.has(kind)) return null;
  const fromPlayerId = cleanString(candidate.fromPlayerId, 160);
  const targetPlayerId = cleanString(candidate.targetPlayerId, 160);
  const local = cleanString(localPlayerId, 160);
  if (!fromPlayerId || !targetPlayerId || fromPlayerId === targetPlayerId) return null;
  if (local && targetPlayerId !== local) return null;

  const normalized = {
    signalId: cleanString(candidate.signalId, 200),
    kind,
    fromPlayerId,
    fromDisplayName: cleanString(candidate.fromDisplayName || 'Player', 24) || 'Player',
    targetPlayerId,
    sentAt: Math.max(0, Number(candidate.sentAt) || 0),
    active: candidate.active === true,
    description: null,
    candidate: null,
  };

  if (kind === LIVE_VOICE_SIGNAL_KINDS.OFFER) {
    normalized.description = normalizeSessionDescription(candidate.description, 'offer');
    if (!normalized.description) return null;
  } else if (kind === LIVE_VOICE_SIGNAL_KINDS.ANSWER) {
    normalized.description = normalizeSessionDescription(candidate.description, 'answer');
    if (!normalized.description) return null;
  } else if (kind === LIVE_VOICE_SIGNAL_KINDS.ICE_CANDIDATE) {
    normalized.candidate = normalizeIceCandidate(candidate.candidate);
    if (!normalized.candidate) return null;
  }

  return Object.freeze(normalized);
}

export function liveVoiceAvailability({
  secureContext = globalThis.isSecureContext === true,
  mediaDevices = globalThis.navigator?.mediaDevices,
  peerConnection = globalThis.RTCPeerConnection,
  roomAvailable = false,
} = {}) {
  if (!secureContext) return Object.freeze({ available: false, reason: 'insecure-context', label: 'VOICE REQUIRES HTTPS OR LOCALHOST' });
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    return Object.freeze({ available: false, reason: 'microphone-unavailable', label: 'MICROPHONE API NOT AVAILABLE' });
  }
  if (typeof peerConnection !== 'function') {
    return Object.freeze({ available: false, reason: 'webrtc-unavailable', label: 'WEBRTC IS NOT AVAILABLE' });
  }
  if (roomAvailable !== true) {
    return Object.freeze({ available: false, reason: 'offline', label: 'JOIN A CO-OP ROOM FOR LIVE VOICE' });
  }
  return Object.freeze({ available: true, reason: 'ready', label: 'LIVE VOICE READY TO START' });
}
