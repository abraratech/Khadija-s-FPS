// js/multiplayer/quick_message_core.test.js
import assert from 'node:assert/strict';
import {
  QUICK_MESSAGE_DEFINITIONS,
  QUICK_MESSAGE_PATCH,
  getQuickMessageDefinition,
  isQuickMessageAllowed,
  quickMessageFeedback,
  quickMessageTypeForDigit
} from './quick_message_core.js';
import { TACTICAL_PING_TYPES, validateTacticalPingPayload } from './tactical_ping_core.js';

assert.equal(QUICK_MESSAGE_PATCH, 'm5-coop-quick-message-wheel-r1');
assert.equal(QUICK_MESSAGE_DEFINITIONS.length, 6);
assert.deepEqual(
  QUICK_MESSAGE_DEFINITIONS.map((entry) => entry.digit),
  ['1', '2', '3', '4', '5', '6']
);
assert.equal(quickMessageTypeForDigit('Digit1'), TACTICAL_PING_TYPES.ENEMY);
assert.equal(quickMessageTypeForDigit('4'), TACTICAL_PING_TYPES.REVIVE_ME);
assert.equal(getQuickMessageDefinition('buy/open this').type, TACTICAL_PING_TYPES.BUY_OPEN);
assert.equal(isQuickMessageAllowed(TACTICAL_PING_TYPES.NEED_AMMO, { online: true, alive: true }).allowed, true);
assert.equal(isQuickMessageAllowed(TACTICAL_PING_TYPES.NEED_AMMO, { online: true, alive: false }).allowed, false);
assert.equal(isQuickMessageAllowed(TACTICAL_PING_TYPES.REVIVE_ME, { online: true, alive: false }).allowed, true);
assert.equal(isQuickMessageAllowed(TACTICAL_PING_TYPES.NEED_HELP, { online: true, alive: false }).allowed, true);
assert.equal(isQuickMessageAllowed(TACTICAL_PING_TYPES.FOLLOW_ME, { online: false, alive: true }).reason, 'offline');

for (const definition of QUICK_MESSAGE_DEFINITIONS) {
  const validation = validateTacticalPingPayload({
    pingId: `quick-${definition.digit}`,
    type: definition.type,
    ownerPlayerId: 'player-abrar',
    ownerName: 'Abrar',
    position: { x: 1, y: 2, z: 3 },
    createdAt: 100
  }, { now: 100 });
  assert.equal(validation.ok, true, definition.type);
  assert.equal(validation.ping.type, definition.type);
}

assert.equal(
  quickMessageFeedback({ accepted: false, reason: 'cooldown' }, TACTICAL_PING_TYPES.ENEMY),
  'Quick message cooling down'
);
assert.equal(
  quickMessageFeedback({ accepted: true }, TACTICAL_PING_TYPES.FOLLOW_ME),
  'Follow me sent'
);

console.log('quick_message_core tests passed');
