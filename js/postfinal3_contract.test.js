import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUICK_MESSAGE_DEFINITIONS,
  QUICK_MESSAGE_PATCH
} from './multiplayer/quick_message_core.js';
import {
  TACTICAL_PING_TYPES,
  validateTacticalPingPayload
} from './multiplayer/tactical_ping_core.js';
import {
  SQUAD_COMMAND_PATCH,
  buildSquadCommandIntent
} from './multiplayer/squad_command_core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const release = JSON.parse(read('multiplayer-release.json'));
const wheel = read('js/multiplayer/quick_message_wheel.js');
const tactical = read('js/multiplayer/tactical_ping.js');
const bot = read('js/multiplayer/bot.js');
const foundation = read('js/multiplayer/foundation.js');
const hud = read('js/multiplayer/squad_intent_hud.js');
const audio = read('js/multiplayer/coop_audio_core.js');
const main = read('js/main.js');
const builder = read('scripts/build_production.py');

assert.equal(release.protocol, 6);
assert.equal(release.squadCommandTeamIntelligence.patch, SQUAD_COMMAND_PATCH);
assert.equal(release.squadCommandTeamIntelligence.commandWheel.commands, 8);
assert.equal(release.squadCommandTeamIntelligence.workerChangeRequired, false);
assert.equal(release.squadCommandTeamIntelligence.protocolUnchanged, true);
assert.equal(release.m5Communication.desktopControl, 'Hold C and press 1-8');
assert.equal(QUICK_MESSAGE_PATCH, 'post-final3-r1-squad-command-wheel');
assert.equal(QUICK_MESSAGE_DEFINITIONS.length, 8);

for (const type of [
  TACTICAL_PING_TYPES.DEFEND,
  TACTICAL_PING_TYPES.REGROUP,
  TACTICAL_PING_TYPES.INTERACT,
  TACTICAL_PING_TYPES.REVIVE
]) {
  const result = validateTacticalPingPayload({
    pingId: `postfinal3-${type}`,
    type,
    ownerPlayerId: 'player-a',
    ownerName: 'Abrar',
    position: { x: 1, y: 2, z: 3 },
    createdAt: 100
  }, { now: 100 });
  assert.equal(result.ok, true, type);
  assert.ok(buildSquadCommandIntent(result.ping, { now: 100, epochNow: 1000 }), type);
}

assert.match(wheel, /GAMEPAD_OPEN_BUTTON\s*=\s*8/);
assert.match(wheel, /navigator\.getGamepads/);
assert.match(wheel, /quickMessageTypeForDigit/);
assert.match(wheel, /commands:\s*QUICK_MESSAGE_DEFINITIONS\.length/);
assert.match(tactical, /onAcceptedPing/);
assert.match(tactical, /findDownedTeammatePosition/);
assert.match(bot, /handleTacticalCommand\(/);
assert.match(bot, /squadIntentStatus/);
assert.match(bot, /CANNOT OPERATE INTERACTABLE/);
assert.match(foundation, /new MultiplayerSquadIntentHud/);
assert.match(foundation, /botManager\?\.handleTacticalCommand/);
assert.match(foundation, /squadIntentHud\?\.update/);
assert.match(hud, /SQUAD INTENT/);
assert.match(hud, /RESPONDING TO/);
assert.match(audio, /case 'DEFEND'/);
assert.match(audio, /case 'REGROUP'/);
assert.match(audio, /case 'INTERACT'/);
assert.match(audio, /case 'REVIVE'/);
assert.match(main, /dataset\.kaQuickMessageWheel === 'open'/);
assert.match(builder, /POST_FINAL3_PATCH = "post-final3-r1-squad-command-team-intelligence"/);
assert.match(builder, /"post_final3"/);

console.log('POST-FINAL.3 combined squad command and team intelligence contract: PASS');
