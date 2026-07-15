import assert from 'node:assert/strict';
import {
  BOT1_VIRTUAL_PLAYER_ID,
  isAuthoritativeTeamEliminated
} from './bot_team_elimination_core.js';

const hostId = 'host-player';
const humanId = 'human-client';

function eliminated(snapshotPlayers, connectedPlayerIds = [hostId]) {
  return isAuthoritativeTeamEliminated({
    snapshotPlayers,
    connectedPlayerIds,
    virtualPlayerIds: [BOT1_VIRTUAL_PLAYER_ID]
  });
}

assert.equal(eliminated([
  { playerId: hostId, connected: true, lifeState: 'DOWNED' },
  { playerId: BOT1_VIRTUAL_PLAYER_ID, connected: true, lifeState: 'ACTIVE' }
]), false, 'downed host plus active wingmate remains recoverable');

assert.equal(eliminated([
  { playerId: hostId, connected: true, lifeState: 'DOWNED' }
]), false, 'DOWNED alone is not terminal before bleedout');

assert.equal(eliminated([
  { playerId: hostId, connected: true, lifeState: 'SPECTATING' },
  { playerId: BOT1_VIRTUAL_PLAYER_ID, connected: true, lifeState: 'ACTIVE' }
]), false, 'active virtual wingmate keeps the run alive');

assert.equal(eliminated([
  { playerId: hostId, connected: true, lifeState: 'SPECTATING' },
  { playerId: BOT1_VIRTUAL_PLAYER_ID, connected: true, lifeState: 'SPECTATING' }
]), true, 'host and wingmate both terminal ends the run');

assert.equal(eliminated([
  { playerId: hostId, connected: true, lifeState: 'SPECTATING' },
  { playerId: humanId, connected: true, lifeState: 'DOWNED' }
], [hostId, humanId]), false, 'two-human all-downed state waits for bleedout');

assert.equal(eliminated([
  { playerId: hostId, connected: true, lifeState: 'SPECTATING' },
  { playerId: humanId, connected: true, lifeState: 'ELIMINATED' }
], [hostId, humanId]), true, 'all real participants terminal ends the run');

assert.equal(eliminated([
  { playerId: hostId, connected: true, lifeState: 'SPECTATING' },
  { playerId: 'untrusted-virtual-id', connected: true, lifeState: 'ACTIVE' }
]), true, 'unknown virtual entries cannot keep a run alive');

assert.equal(eliminated([], [hostId]), false, 'missing authority state is never elimination proof');
assert.equal(eliminated([], []), false, 'empty room cannot trigger team elimination');

console.log('BOT.1 R2.3 Worker team-elimination tests passed.');
