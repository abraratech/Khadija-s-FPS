// PVP.1 R1 frontend integration and isolation contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(relative) {
  return fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
}

const release = JSON.parse(read('multiplayer-release.json'));
const lobbyUi = read('js/multiplayer/lobby_ui.js');
const lobby = read('js/multiplayer/lobby.js');
const transport = read('js/multiplayer/transport.js');
const room = read('js/multiplayer/room.js');
const foundation = read('js/multiplayer/foundation.js');
const weapons = read('js/weapons.js');
const main = read('js/main.js');
const css = read('css/multiplayer.css');

assert.equal(release.protocol, 6);
assert.equal(release.certifiedBaselineSha, '5511d393d7249b5487affa3616716ccb64593e99');
assert.equal(release.pvp1.patch, 'pvp1-r1-isolated-team-elimination-foundation');
assert.equal(release.pvp1.sourceBaselineSha, 'ddbdc3a4b478aa26a515e2dd8dbfc9449885c466');
assert.equal(release.pvp1.privateRooms, true);
assert.equal(release.pvp1.publicMatchmaking, false);
assert.equal(release.pvp1.workerChangeRequired, true);
assert.equal(release.pvp1.featureFlag, 'PVP1_ENABLED');

assert.match(lobbyUi, /pvp-team-elimination/);
assert.match(lobbyUi, /PvP · Team Elimination \(1v1 \/ 2v2\)/);
assert.match(lobbyUi, /START TEAM ELIMINATION/);
assert.match(lobbyUi, /featureEnabled/);
assert.match(lobbyUi, /PUBLIC MATCHMAKING/);
assert.match(lobby, /gameMode: 'coop'/);
assert.match(lobby, /normalizePvp1Mode\(gameMode\)/);
assert.match(transport, /searchParams\.set\('gameMode'/);
assert.match(room, /gameMode: 'coop'/);
assert.match(room, /pvp: this\.pvp/);
assert.match(foundation, /MultiplayerPvp1Manager/);
assert.match(foundation, /pvp-isolation/);
assert.match(foundation, /isMultiplayerPvpRun/);
assert.match(weapons, /configureMultiplayerPvp/);
assert.match(weapons, /multiplayerPvp\?\.isActive/);
assert.match(main, /configureMultiplayerPvp/);
assert.match(main, /endEnemyRun\('pvp-isolation'\)/);
assert.match(css, /\.ka-pvp1-hud/);

console.log('PVP.1 frontend integration contract tests passed');
