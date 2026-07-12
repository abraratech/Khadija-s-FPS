// multiplayer-server/src/text_chat_core.test.js
import assert from 'node:assert/strict';
import {
  TEXT_CHAT_MAX_LENGTH,
  buildTextChatMessage,
  consumeTextChatRate,
  sanitizeTextChatText
} from './text_chat_core.js';

assert.equal(sanitizeTextChatText('  hello\nteam  '), 'hello team');
assert.equal(sanitizeTextChatText('x'.repeat(300)).length, TEXT_CHAT_MAX_LENGTH);
const first = consumeTextChatRate({}, 1000);
assert.equal(first.allowed, true);
const cooldown = consumeTextChatRate(first.state, 1200);
assert.equal(cooldown.reason, 'cooldown');
let state = {};
for (let index = 0; index < 8; index += 1) {
  const result = consumeTextChatRate(state, 10_000 + index * 700);
  assert.equal(result.allowed, true);
  state = result.state;
}
assert.equal(consumeTextChatRate(state, 16_000).reason, 'rate-limit');
const message = buildTextChatMessage({
  messageId: 'chat-1', playerId: 'player-abrar', displayName: 'Abrar',
  text: '<b>ready</b>', roomCode: 'ABC234', runId: null, sentAt: 123
});
assert.equal(message.text, '<b>ready</b>');
assert.equal(message.displayName, 'Abrar');
assert.equal(buildTextChatMessage({ messageId: 'x' }), null);
console.log('Worker text_chat_core tests passed');
