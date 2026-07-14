// js/multiplayer/post1b_text_chat_contract.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./text_chat.js', import.meta.url), 'utf8');
assert.match(source, /TEXT_CHAT_ATTENTION_PATCH/);
assert.match(source, /ka-coop-lobby-text-chat/);
assert.match(source, /ka-multiplayer-chat-notification/);
assert.match(source, /Unread chat messages/);
assert.match(source, /ROOM TEXT CHAT/);
assert.match(source, /Message room…/);
assert.match(source, /playAttentionSound/);
assert.match(source, /shouldNotifyTextChat/);
assert.match(source, /lobbyVisible/);
assert.match(source, /muteAllText/);
assert.doesNotMatch(source, /\.innerHTML\s*=/);
console.log('POST.1B text chat notification and lobby contract tests passed');
