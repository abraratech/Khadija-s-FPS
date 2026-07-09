// js/multiplayer/protocol.js

export const MULTIPLAYER_BUILD_ID = 'm3-tactical-awareness-r1';
export const MULTIPLAYER_PROTOCOL_VERSION = 5;
export const MULTIPLAYER_COMPATIBLE_PROTOCOL_VERSIONS = Object.freeze([4, 5]);

export const MULTIPLAYER_MESSAGE_TYPES = Object.freeze({
  INPUT_COMMAND: 'input-command',
  GAMEPLAY_ACTION: 'gameplay-action',
  PLAYER_SNAPSHOT: 'player-snapshot',
  ROOM_STATE: 'room-state',
  WORLD_SNAPSHOT: 'world-snapshot',
  ENEMY_HIT_REQUEST: 'enemy-hit-request',
  PLAYER_DAMAGE: 'player-damage',
  ECONOMY_REQUEST: 'economy-request',
  ECONOMY_RESULT: 'economy-result',
  ECONOMY_SNAPSHOT: 'economy-snapshot',
  REVIVE_STATE: 'revive-state',
  TACTICAL_PING: 'tactical-ping',
  HEARTBEAT: 'heartbeat'
});

const VALID_MESSAGE_TYPES = new Set(Object.values(MULTIPLAYER_MESSAGE_TYPES));
const MAX_PAYLOAD_BYTES = 64 * 1024;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function approximatePayloadBytes(payload) {
  try {
    return new TextEncoder().encode(JSON.stringify(payload ?? {})).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function cleanId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).slice(0, 160);
}

export function createProtocolEnvelope({
  type,
  sessionId,
  runId = null,
  playerId = null,
  sequence = 0,
  payload = {},
  authorityEpoch = 0,
  sentAt = nowMs()
} = {}) {
  if (!VALID_MESSAGE_TYPES.has(type)) {
    throw new TypeError(`Unsupported multiplayer message type: ${String(type)}`);
  }

  const normalizedSessionId = cleanId(sessionId);
  if (!normalizedSessionId) {
    throw new TypeError('A multiplayer protocol envelope requires sessionId.');
  }

  const normalizedSequence = Math.max(0, Math.floor(Number(sequence) || 0));
  const normalizedPlayerId = cleanId(playerId);
  const normalizedRunId = cleanId(runId);

  return Object.freeze({
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    messageId: [
      normalizedSessionId,
      normalizedRunId || 'lobby',
      normalizedPlayerId || 'system',
      type,
      normalizedSequence
    ].join(':'),
    type,
    sessionId: normalizedSessionId,
    runId: normalizedRunId,
    playerId: normalizedPlayerId,
    authorityEpoch: Math.max(0, Math.floor(Number(authorityEpoch) || 0)),
    sequence: normalizedSequence,
    sentAt: Number(sentAt) || nowMs(),
    payload
  });
}

export function validateProtocolEnvelope(candidate, {
  expectedSessionId = null,
  allowDifferentProtocolVersion = false
} = {}) {
  const errors = [];

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, errors: ['Envelope must be an object.'], envelope: null };
  }

  if (
    !allowDifferentProtocolVersion
    && !MULTIPLAYER_COMPATIBLE_PROTOCOL_VERSIONS.includes(
      Number(candidate.protocolVersion)
    )
  ) {
    errors.push(`Unsupported protocol version: ${String(candidate.protocolVersion)}`);
  }

  if (!VALID_MESSAGE_TYPES.has(candidate.type)) {
    errors.push(`Unsupported message type: ${String(candidate.type)}`);
  }

  if (typeof candidate.sessionId !== 'string' || !candidate.sessionId) {
    errors.push('sessionId is required.');
  }

  if (expectedSessionId && candidate.sessionId !== expectedSessionId) {
    errors.push('Envelope belongs to a different session.');
  }

  const candidateAuthorityEpoch = candidate.authorityEpoch === undefined
    && Number(candidate.protocolVersion) === 4
    ? 0
    : candidate.authorityEpoch;
  if (!Number.isInteger(candidateAuthorityEpoch) || candidateAuthorityEpoch < 0) {
    errors.push('authorityEpoch must be a non-negative integer.');
  }

  if (!Number.isInteger(candidate.sequence) || candidate.sequence < 0) {
    errors.push('sequence must be a non-negative integer.');
  }

  if (!Number.isFinite(Number(candidate.sentAt))) {
    errors.push('sentAt must be finite.');
  }

  if (approximatePayloadBytes(candidate.payload) > MAX_PAYLOAD_BYTES) {
    errors.push(`Payload exceeds ${MAX_PAYLOAD_BYTES} bytes.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    envelope: errors.length === 0 ? candidate : null
  };
}

export function isMultiplayerMessageType(type) {
  return VALID_MESSAGE_TYPES.has(type);
}
