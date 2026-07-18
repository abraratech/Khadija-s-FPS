import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const index = read('../index.html');
const lobbyUi = read('./multiplayer/lobby_ui.js');
const matchmaking = read('./multiplayer/matchmaking_core.js');
const release = JSON.parse(read('../multiplayer-release.json'));

assert.match(index, /ONLINE READY/);
assert.match(index, /Khadija's Arena · Version 1\.0/);
assert.doesNotMatch(index, /BUILD ONLINE/);
assert.doesNotMatch(index, /Khadija Protocol/i);

assert.match(lobbyUi, /ONLINE OPERATIONS/);
assert.match(lobbyUi, /Secure managed online connection/);
assert.match(lobbyUi, /SEARCHING BY CONNECTION, ARENA AND REGION/);
assert.doesNotMatch(lobbyUi, /KHADIJA PROTOCOL/);
assert.doesNotMatch(lobbyUi, /MATCH BY BUILD, PROTOCOL/);
assert.doesNotMatch(lobbyUi, /production connection/i);

assert.match(matchmaking, /SEARCHING BY CONNECTION, ARENA AND REGION/);
assert.doesNotMatch(matchmaking, /MATCH BY BUILD, PROTOCOL/);

assert.equal(release.postLaunch3.patch, 'post-launch3-r1-player-facing-language-service-polish');
assert.equal(release.postLaunch3.sourceBaselineSha, '5963185b25ff51232643cb4e3d49d9a7000a7508');
assert.equal(release.postLaunch3.internalCompatibilityChecksPreserved, true);
assert.equal(release.postLaunch3.frontendOnly, true);
assert.equal(release.postLaunch3.workerChangeRequired, false);
assert.equal(release.postLaunch3.gameplayAuthorityUnchanged, true);

console.log('POST-LAUNCH.3 player-facing language and service polish contract: PASS');
