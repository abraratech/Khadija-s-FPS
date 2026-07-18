import assert from 'node:assert/strict';
import fs from 'node:fs';
import { roomEntryMatchesFilters } from './match3_core.js';

const ui = fs.readFileSync(new URL('./lobby_ui.js', import.meta.url), 'utf8');
const lobby = fs.readFileSync(new URL('./lobby.js', import.meta.url), 'utf8');
const directory = fs.readFileSync(new URL('./room_directory.js', import.meta.url), 'utf8');

for (const marker of [
  'ka-pvp3-find-open-pvp',
  'ka-pvp3-find-open-room',
  'ka-room-filter-map',
  'ka-room-filter-difficulty-field',
  'FIND RATED PVP 1V1',
  'JOIN OPEN UNRANKED ROOM'
]) assert.ok(ui.includes(marker), `missing PVP.3 UI marker: ${marker}`);
assert.ok(lobby.includes('async findOpenRoom'), 'controller must support automatic open-room admission');
assert.ok(directory.includes("'/matchmaking/rooms/find'"), 'directory client must use the atomic find endpoint');
assert.ok(ui.includes('this.elements.difficultyField.hidden = isPvp'), 'active PvP lobby must hide difficulty');

const pvp = { gameMode: 'pvp-team-elimination', mapId: 'grid_bunker', difficulty: 1, status: 'waiting', scope: 'global', hasBot: false, openHumanSlots: 1 };
const coop = { ...pvp, gameMode: 'coop' };
assert.equal(roomEntryMatchesFilters(pvp, { difficulty: 2 }), true, 'PvP discovery must ignore difficulty');
assert.equal(roomEntryMatchesFilters(coop, { difficulty: 2 }), false, 'Co-Op discovery keeps difficulty filtering');
console.log('PVP.3 R1 frontend public-room discovery contract: PASS');
