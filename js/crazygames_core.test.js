import assert from 'node:assert/strict';
import {
  CG1_PATCH,
  buildCrazyGamesRoomUpdate,
  classifyCrazyGamesAdError,
  normalizeCrazyGamesEnvironment,
  normalizeCrazyGamesInviteParams,
  normalizeCrazyGamesUsername
} from './crazygames_core.js';

assert.equal(CG1_PATCH, 'cg1-r1-crazygames-basic-launch-readiness');
assert.equal(normalizeCrazyGamesEnvironment('CrazyGames'), 'crazygames');
assert.equal(normalizeCrazyGamesEnvironment('other'), 'disabled');
assert.equal(normalizeCrazyGamesUsername(' Player🔥 One '), 'Player One');
assert.deepEqual(normalizeCrazyGamesInviteParams({roomCode:'ab23cd', serverUrl:'wss://example.test/ws', mode:'pvp'}), {
  roomCode: 'AB23CD', serverUrl: 'wss://example.test/ws', mode: 'pvp'
});
assert.equal(normalizeCrazyGamesInviteParams({roomCode:'bad'}).roomCode, '');
const room = buildCrazyGamesRoomUpdate({roomId:'room-1', roomCode:'AB23CD', players:[{connected:true}], maxPlayers:2, serverUrl:'wss://x', mode:'coop'});
assert.equal(room.roomId, 'room-1');
assert.equal(room.isJoinable, true);
assert.equal(room.inviteParams.roomCode, 'AB23CD');
assert.equal(classifyCrazyGamesAdError({code:'adsDisabledBasicLaunch'}).nonFatal, true);
assert.equal(classifyCrazyGamesAdError({code:'other'}).shouldResume, true);
console.log('CG.1 CrazyGames platform policy core tests: PASS');
