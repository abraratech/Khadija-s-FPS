// BOT.1 R2.8 — authenticated virtual companion relay identity.

import { BOT1_VIRTUAL_PLAYER_ID } from './bot_team_elimination_core.js';

export const BOT1_VIRTUAL_ACTOR_TYPES = Object.freeze([
  'player-snapshot',
  'gameplay-action'
]);

const VIRTUAL_TYPES = new Set(BOT1_VIRTUAL_ACTOR_TYPES);

function clean(value, limit = 160) {
  return String(value || '').trim().slice(0, limit);
}

function validBotPayload(envelope = {}) {
  if (envelope.type === 'player-snapshot') {
    const state = envelope.payload?.state || {};
    return state.isBot === true
      && clean(state.botProfile, 80).startsWith('bot1-');
  }
  if (envelope.type === 'gameplay-action') {
    return clean(envelope.payload?.botProfile, 80).startsWith('bot1-');
  }
  return false;
}

export function resolveRelayActorIdentity({
  senderPlayerId,
  hostPlayerId,
  envelope
} = {}) {
  const sender = clean(senderPlayerId);
  const host = clean(hostPlayerId);
  const claimed = clean(envelope?.playerId);

  if (!sender) {
    return { accepted: false, reason: 'missing-sender' };
  }

  if (claimed !== BOT1_VIRTUAL_PLAYER_ID) {
    return {
      accepted: true,
      actorPlayerId: sender,
      senderPlayerId: sender,
      virtualActor: false,
      reason: claimed && claimed !== sender ? 'physical-identity-normalized' : 'physical-actor'
    };
  }

  if (sender !== host) {
    return { accepted: false, reason: 'virtual-actor-requires-host' };
  }
  if (!VIRTUAL_TYPES.has(String(envelope?.type || ''))) {
    return { accepted: false, reason: 'virtual-actor-type-rejected' };
  }
  if (!validBotPayload(envelope)) {
    return { accepted: false, reason: 'virtual-actor-payload-rejected' };
  }

  return {
    accepted: true,
    actorPlayerId: BOT1_VIRTUAL_PLAYER_ID,
    senderPlayerId: sender,
    virtualActor: true,
    reason: 'host-authorized-virtual-companion'
  };
}
