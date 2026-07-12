// multiplayer-server/src/voice_signal_core.js
export const VOICE_SIGNAL_PATCH = 'm5-coop-voice-reliability-r1';
export const VOICE_SIGNAL_KINDS = Object.freeze({
  READY: 'ready',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  PTT_STATE: 'ptt-state',
  STOP: 'stop',
});
export const VOICE_SIGNAL_MAX_SDP_LENGTH = 24_000;
export const VOICE_SIGNAL_MAX_CANDIDATE_LENGTH = 4_096;

const VALID_KINDS = new Set(Object.values(VOICE_SIGNAL_KINDS));

function cleanString(value, maxLength = 180) {
  return String(value ?? '')
    .normalize?.('NFKC')
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    ?.trim()
    ?.slice(0, maxLength) || '';
}

function cleanDescription(candidate, expectedType) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const type = cleanString(candidate.type, 16).toLowerCase();
  if (type !== expectedType) return null;
  const sdp = String(candidate.sdp || '').slice(0, VOICE_SIGNAL_MAX_SDP_LENGTH);
  if (!sdp) return null;
  return Object.freeze({ type, sdp });
}

function cleanCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const value = String(candidate.candidate || '').slice(0, VOICE_SIGNAL_MAX_CANDIDATE_LENGTH);
  if (!value) return null;
  const index = Number(candidate.sdpMLineIndex);
  return Object.freeze({
    candidate: value,
    sdpMid: candidate.sdpMid === null || candidate.sdpMid === undefined
      ? null
      : cleanString(candidate.sdpMid, 80),
    sdpMLineIndex: Number.isInteger(index) && index >= 0 && index <= 128 ? index : null,
    usernameFragment: candidate.usernameFragment === null || candidate.usernameFragment === undefined
      ? null
      : cleanString(candidate.usernameFragment, 256),
  });
}

export function validateVoiceSignalRequest(
  payload,
  { senderPlayerId = null, connectedPlayerIds = [] } = {}
) {
  const sender = cleanString(senderPlayerId, 160);
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const targetPlayerId = cleanString(source.targetPlayerId, 160);
  const kind = cleanString(source.kind, 32).toLowerCase();
  if (!sender || !targetPlayerId || targetPlayerId === sender) {
    return Object.freeze({ ok: false, reason: 'invalid-target', signal: null });
  }
  const connected = new Set(
    Array.isArray(connectedPlayerIds)
      ? connectedPlayerIds.map((value) => cleanString(value, 160)).filter(Boolean)
      : []
  );
  if (!connected.has(targetPlayerId)) {
    return Object.freeze({ ok: false, reason: 'target-unavailable', signal: null });
  }
  if (!VALID_KINDS.has(kind)) {
    return Object.freeze({ ok: false, reason: 'invalid-signal', signal: null });
  }

  const signal = {
    targetPlayerId,
    kind,
    active: source.active === true,
    description: null,
    candidate: null,
  };

  if (kind === VOICE_SIGNAL_KINDS.OFFER) {
    signal.description = cleanDescription(source.description, 'offer');
    if (!signal.description) return Object.freeze({ ok: false, reason: 'invalid-signal', signal: null });
  } else if (kind === VOICE_SIGNAL_KINDS.ANSWER) {
    signal.description = cleanDescription(source.description, 'answer');
    if (!signal.description) return Object.freeze({ ok: false, reason: 'invalid-signal', signal: null });
  } else if (kind === VOICE_SIGNAL_KINDS.ICE_CANDIDATE) {
    signal.candidate = cleanCandidate(source.candidate);
    if (!signal.candidate) return Object.freeze({ ok: false, reason: 'invalid-signal', signal: null });
  }

  return Object.freeze({ ok: true, reason: 'accepted', signal: Object.freeze(signal) });
}

export function buildVoiceSignalRelay({
  signal,
  fromPlayerId,
  fromDisplayName,
  sentAt = Date.now(),
} = {}) {
  const sender = cleanString(fromPlayerId, 160);
  if (!sender || !signal?.targetPlayerId || !VALID_KINDS.has(signal?.kind)) {
    throw new TypeError('A valid voice signal and sender are required.');
  }
  const timestamp = Math.max(0, Number(sentAt) || Date.now());
  return Object.freeze({
    signalId: `voice:${sender}:${signal.targetPlayerId}:${signal.kind}:${timestamp}`,
    kind: signal.kind,
    fromPlayerId: sender,
    fromDisplayName: cleanString(fromDisplayName || 'Player', 24) || 'Player',
    targetPlayerId: signal.targetPlayerId,
    description: signal.description || null,
    candidate: signal.candidate || null,
    active: signal.active === true,
    sentAt: timestamp,
  });
}
