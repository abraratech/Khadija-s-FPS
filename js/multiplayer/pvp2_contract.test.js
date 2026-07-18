import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeMatchmakingResponse,
  normalizeQuickMatchPreferences
} from './matchmaking_core.js';

const root = new URL('../../', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), 'utf8');

const release = JSON.parse(read('multiplayer-release.json'));
const lobbyUi = read('js/multiplayer/lobby_ui.js');
const matchmaking = read('js/multiplayer/matchmaking_core.js');
const css = read('css/multiplayer.css');

assert.equal(release.pvp2.patch, 'pvp2-r2-public-custom-pvp-rooms');
assert.equal(release.pvp2.publicMatchmaking, true);
assert.equal(release.pvp2.publicTeamSize, 1);
assert.equal(release.pvp2.coopIsolationPreserved, true);
assert.match(lobbyUi, /FIND PUBLIC PVP 1V1/);
assert.match(lobbyUi, /CREATE PUBLIC CO-OP ROOM/);
assert.match(lobbyUi, /CREATE PUBLIC PVP ROOM/);
assert.match(lobbyUi, /UNRANKED PVP/);
assert.equal(release.pvp2.publicCustomRooms, true);
assert.equal(release.pvp2.customRoomsRanked, false);
assert.match(lobbyUi, /localReady \? 'NOT READY' : 'READY'/);
assert.match(lobbyUi, /Set status to not ready/);
assert.match(lobbyUi, /COMPETITIVE RECORD/);
assert.match(matchmaking, /pvp-team-elimination/);
assert.match(css, /ka-pvp2/);


const publicPvpPreferences = normalizeQuickMatchPreferences({
  mode: 'pvp-team-elimination',
  partySize: 2,
  allowBackfill: true,
  joinInProgress: true
});
assert.equal(publicPvpPreferences.mode, 'pvp-team-elimination');
assert.equal(publicPvpPreferences.partySize, 1);
assert.equal(publicPvpPreferences.maxPlayers, 2);
assert.equal(publicPvpPreferences.allowBackfill, false);
assert.equal(publicPvpPreferences.joinInProgress, false);

const publicPvpAssignment = normalizeMatchmakingResponse({
  ok: true,
  schema: 2,
  patch: 'match3-r1-party-quality-room-discovery',
  ticketId: 'pvp-ticket',
  status: 'matched',
  mode: 'pvp-team-elimination',
  assignment: {
    matchId: 'pvp-match',
    roomCode: 'PVP234',
    gameMode: 'pvp-team-elimination',
    publicPvp: true,
    maxPlayers: 2
  }
});
assert.equal(publicPvpAssignment.mode, 'pvp-team-elimination');
assert.equal(publicPvpAssignment.assignment.publicPvp, true);
assert.equal(publicPvpAssignment.assignment.gameMode, 'pvp-team-elimination');

console.log('PVP.2 frontend integration contract tests passed');
