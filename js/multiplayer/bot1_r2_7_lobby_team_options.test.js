import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BOT1_PATCH,
  shouldPreserveBotReservation
} from './bot_core.js';

assert.ok(['bot1-lobby-recovery-companion-slot-r2-7', 'bot1-late-join-companion-integrity-r2-8'].includes(BOT1_PATCH));
assert.equal(shouldPreserveBotReservation({
  requested: true,
  connectedHumanCount: 2,
  roomExists: true,
  reason: 'run-ended'
}), true, 'human ally must not dismiss the companion reservation');
assert.equal(shouldPreserveBotReservation({
  requested: true,
  connectedHumanCount: 3,
  roomExists: true,
  reason: 'run-ended'
}), false, 'the companion must not extend rooms beyond two human operatives');
assert.equal(shouldPreserveBotReservation({
  requested: true,
  connectedHumanCount: 1,
  roomExists: true,
  reason: 'host-dismissed'
}), false, 'explicit host dismissal must clear the companion');

const bot = fs.readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
assert.equal(bot.includes("replacementReason = 'human-joined-before-run'"), false);
assert.equal(bot.includes("removeForHuman('human-replaced-between-waves')"), false);
assert.ok(bot.includes('do not auto-stand-down for the supported host + ally team'));
assert.ok(bot.includes("removeForHuman('human-cap-exceeded')"));

const lobby = fs.readFileSync(new URL('./lobby.js', import.meta.url), 'utf8');
assert.ok(lobby.includes('findReplacementPublicAlly'));
assert.ok(lobby.includes('deployRoomBotFill'));
assert.ok(lobby.includes('dismissRoomBotFill'));
assert.ok(lobby.includes('OPENING A FRESH PUBLIC SEARCH FOR A NEW ALLY'));

const ui = fs.readFileSync(new URL('./lobby_ui.js', import.meta.url), 'utf8');
assert.ok(ui.includes('FIND NEW PUBLIC ALLY'));
assert.ok(ui.includes('CALL AI WINGMAN'));
assert.ok(ui.includes('DISMISS WINGMAN'));
assert.ok(ui.includes('connectedHumanCount < 2'));
assert.ok(ui.includes('connectedHumanCount <= 2'));
assert.ok(ui.includes("this.elements.maxPlayers.value = '2'"));

const foundation = fs.readFileSync(new URL('./foundation.js', import.meta.url), 'utf8');
assert.ok(foundation.includes("botManager?.clearReservation?.('host-dismissed')"));

console.log('BOT.1 R2.7 lobby recovery and companion-slot tests passed.');
