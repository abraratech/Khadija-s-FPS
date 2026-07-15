import assert from 'node:assert/strict';
import {
  BOT1_VIRTUAL_ACTOR_TYPES,
  resolveRelayActorIdentity
} from './bot_virtual_actor_core.js';

const host = 'player-host';
const ally = 'player-ally';
const bot = 'bot-wingmate-r1';

assert.deepEqual(BOT1_VIRTUAL_ACTOR_TYPES, ['player-snapshot', 'gameplay-action']);

const physical = resolveRelayActorIdentity({
  senderPlayerId: ally,
  hostPlayerId: host,
  envelope: { playerId: host, type: 'enemy-hit-request', payload: {} }
});
assert.equal(physical.accepted, true);
assert.equal(physical.actorPlayerId, ally);
assert.equal(physical.virtualActor, false);

const botSnapshot = resolveRelayActorIdentity({
  senderPlayerId: host,
  hostPlayerId: host,
  envelope: {
    playerId: bot,
    type: 'player-snapshot',
    payload: { state: { isBot: true, botProfile: 'bot1-late-join-companion-integrity-r2-8' } }
  }
});
assert.equal(botSnapshot.accepted, true);
assert.equal(botSnapshot.actorPlayerId, bot);
assert.equal(botSnapshot.senderPlayerId, host);
assert.equal(botSnapshot.virtualActor, true);

const botAction = resolveRelayActorIdentity({
  senderPlayerId: host,
  hostPlayerId: host,
  envelope: {
    playerId: bot,
    type: 'gameplay-action',
    payload: { action: 'FIRE', botProfile: 'bot1-late-join-companion-integrity-r2-8' }
  }
});
assert.equal(botAction.accepted, true);
assert.equal(botAction.virtualActor, true);

assert.equal(resolveRelayActorIdentity({
  senderPlayerId: ally,
  hostPlayerId: host,
  envelope: { playerId: bot, type: 'player-snapshot', payload: { state: { isBot: true, botProfile: 'bot1-test' } } }
}).accepted, false);

assert.equal(resolveRelayActorIdentity({
  senderPlayerId: host,
  hostPlayerId: host,
  envelope: { playerId: bot, type: 'enemy-hit-request', payload: { botProfile: 'bot1-test' } }
}).accepted, false);

assert.equal(resolveRelayActorIdentity({
  senderPlayerId: host,
  hostPlayerId: host,
  envelope: { playerId: bot, type: 'player-snapshot', payload: { state: { isBot: false, botProfile: 'bot1-test' } } }
}).accepted, false);

console.log('bot virtual actor core tests passed');
