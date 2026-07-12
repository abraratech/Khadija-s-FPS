// js/multiplayer/text_chat_safety_contract.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./text_chat.js', import.meta.url), 'utf8');
assert.match(source, /CommunicationSafetyStore/);
assert.match(source, /MUTE ALL/);
assert.match(source, /MUTE PLAYER/);
assert.match(source, /Local chat history cleared/);
assert.match(source, /Message from a muted player hidden/);
assert.match(source, /text\.textContent = message\.text/);
assert.doesNotMatch(source, /innerHTML/);
console.log('text_chat safety contract tests passed');
