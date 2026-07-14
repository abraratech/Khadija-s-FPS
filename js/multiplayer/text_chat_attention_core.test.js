// js/multiplayer/text_chat_attention_core.test.js
import assert from 'node:assert/strict';
import {
  TEXT_CHAT_ATTENTION_PATCH,
  TEXT_CHAT_PREVIEW_LIMIT,
  TEXT_CHAT_UNREAD_LIMIT,
  formatTextChatPreview,
  nextTextChatUnreadCount,
  shouldNotifyTextChat
} from './text_chat_attention_core.js';

assert.equal(TEXT_CHAT_ATTENTION_PATCH, 'post1b-text-chat-attention-lobby-r1');
assert.equal(TEXT_CHAT_UNREAD_LIMIT, 99);
assert.equal(TEXT_CHAT_PREVIEW_LIMIT, 92);
assert.equal(shouldNotifyTextChat(), true);
assert.equal(shouldNotifyTextChat({ muted: true }), false);
assert.equal(shouldNotifyTextChat({ localMessage: true }), false);
assert.equal(shouldNotifyTextChat({ chatOpen: true }), false);
assert.equal(shouldNotifyTextChat({ lobbyVisible: true }), false);
assert.equal(nextTextChatUnreadCount(0, { notify: true }), 1);
assert.equal(nextTextChatUnreadCount(99, { notify: true }), 99);
assert.equal(nextTextChatUnreadCount(8, { clear: true }), 0);
assert.equal(nextTextChatUnreadCount(8), 8);
assert.equal(
  formatTextChatPreview({ displayName: 'Khadija', text: 'Ready for the next wave?' }),
  'Khadija: Ready for the next wave?'
);
assert.ok(formatTextChatPreview({ displayName: 'A', text: 'x'.repeat(200) }).length <= 93);
console.log('POST.1B text chat attention core tests passed');
