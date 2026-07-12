// js/multiplayer/text_chat_core.test.js
import assert from 'node:assert/strict';
import {
  TEXT_CHAT_HISTORY_LIMIT,
  TEXT_CHAT_MAX_LENGTH,
  TEXT_CHAT_PATCH,
  TextChatStore,
  normalizeTextChatMessage,
  sanitizeTextChatText
} from './text_chat_core.js';

assert.equal(TEXT_CHAT_PATCH, 'm5-coop-text-chat-r1');
assert.equal(TEXT_CHAT_MAX_LENGTH, 160);
assert.equal(TEXT_CHAT_HISTORY_LIMIT, 50);
assert.equal(sanitizeTextChatText('  hello\n\tteam  '), 'hello team');
assert.equal(sanitizeTextChatText('x'.repeat(200)).length, 160);

const now = 1_700_000_000_000;
const valid = normalizeTextChatMessage({
  messageId: 'chat-1', playerId: 'player-abrar', displayName: '<Abrar>',
  text: 'Ready?', roomCode: 'ABC234', runId: null, sentAt: now
}, { now });
assert.equal(valid.text, 'Ready?');
assert.equal(valid.displayName, '<Abrar>');
assert.equal(normalizeTextChatMessage({ messageId: 'x' }, { now }), null);

const store = new TextChatStore({ historyLimit: 5 });
for (let index = 0; index < 7; index += 1) {
  const result = store.add({
    messageId: `chat-${index}`, playerId: 'player-khadija', displayName: 'Khadija',
    text: `message ${index}`, roomCode: 'ABC234', sentAt: now + index
  }, { now: now + index });
  assert.equal(result.accepted, true);
}
assert.equal(store.getSnapshot().messages.length, 5);
assert.equal(store.add({
  messageId: 'chat-6', playerId: 'player-khadija', displayName: 'Khadija',
  text: 'duplicate', sentAt: now + 6
}, { now: now + 6 }).reason, 'duplicate');
console.log('text_chat_core tests passed');
