import assert from 'node:assert/strict';
import {
  expiredHostRequiresElection,
  hostFlagsForPlayers,
  resolvePinnedHostPlayerId,
  shouldRetainHostDuringDisconnect
} from './host_authority_core.js';

const players = {
  host: { playerId: 'host', connected: true, joinedAt: 10, isHost: true },
  ally: { playerId: 'ally', connected: false, joinedAt: 20, isHost: false }
};

assert.equal(resolvePinnedHostPlayerId({
  currentHostPlayerId: 'host',
  joiningPlayerId: 'ally',
  players
}), 'host', 'reconnecting ally may not steal a retained host lease');

assert.equal(resolvePinnedHostPlayerId({
  currentHostPlayerId: 'host',
  joiningPlayerId: 'ally',
  players: {
    host: { ...players.host, connected: false },
    ally: { ...players.ally, connected: false }
  }
}), 'host', 'temporarily disconnected host remains pinned during grace');

assert.equal(resolvePinnedHostPlayerId({
  currentHostPlayerId: null,
  joiningPlayerId: 'new-player',
  players: {}
}), 'new-player', 'first player owns a fresh room');

assert.deepEqual(hostFlagsForPlayers(players, 'host'), {
  host: true,
  ally: false
});

assert.equal(shouldRetainHostDuringDisconnect({
  roomStatus: 'in-run',
  wasHost: true
}), true);
assert.equal(shouldRetainHostDuringDisconnect({
  roomStatus: 'waiting',
  wasHost: true
}), false);
assert.equal(expiredHostRequiresElection({
  hostPlayerId: 'host',
  expiredPlayerIds: ['ally', 'host']
}), true);

console.log('BOT.1 R2.8.1 host authority core tests passed.');
