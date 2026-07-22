import assert from 'node:assert/strict';
import { MultiplayerCommandStream } from './multiplayer/command_stream.js';
import { createDefaultLoadout2MasteryProfile, getLoadout2CombatTuning } from './loadout2_mastery_core.js';

const stream = new MultiplayerCommandStream({ sendIntervalMs: 33 });
stream.beginRun('loadout2-coop-run');
let captured = stream.capture({ frameKeys: { KeyV: true }, player: {}, now: 100 });
assert.equal(captured.actions.length, 1);
assert.equal(captured.actions[0].action, 'MELEE');
assert.equal(captured.command.input.melee, true);
captured = stream.capture({ frameKeys: { KeyV: true }, player: {}, now: 110 });
assert.equal(captured.actions.length, 0);
captured = stream.capture({ frameKeys: { KeyV: false }, player: {}, now: 145 });
assert.equal(captured.command.input.melee, false);

const profile = createDefaultLoadout2MasteryProfile(1000);
const coop = getLoadout2CombatTuning(profile, 'MELEE', { gameMode: 'survival' });
const pvp = getLoadout2CombatTuning(profile, 'MELEE', { gameMode: 'pvp-team-elimination' });
assert.equal(coop.meleeEnabled, true);
assert.equal(pvp.meleeEnabled, false);
assert.equal(pvp.masteryScale, 0);

console.log('LOADOUT.2 multiplayer action and PvP-isolation tests passed');
