import assert from 'node:assert/strict';
import { PublicRoomDirectoryClient } from './room_directory.js';

function fakeJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

const calls = [];
let joinCalls = 0;
const client = new PublicRoomDirectoryClient({
  fetchImpl: async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/matchmaking/rooms/list')) {
      return fakeJsonResponse({
        ok: true,
        schema: 1,
        patch: 'match3-r1-party-quality-room-discovery',
        region: 'AS',
        rooms: [{
          listingId: 'listing-1',
          joinToken: 'join-1',
          gameMode: 'pvp-team-elimination',
          ranked: false,
          mapId: 'grid_bunker',
          difficulty: 1,
          status: 'waiting',
          connectedHumans: 1,
          reservedHumans: 0,
          maxPlayers: 2,
          openHumanSlots: 1,
          hasBot: false,
          allowLateJoin: true,
          region: 'AS',
          scope: 'regional'
        }]
      });
    }
    joinCalls += 1;
    await Promise.resolve();
    return fakeJsonResponse({
      ok: true,
      assignment: {
        roomCode: 'ABC234',
        joinMode: 'join',
        admissionToken: 'admission-1',
        admissionExpiresAt: Date.now() + 15000,
        gameMode: 'pvp-team-elimination',
        ranked: false
      }
    });
  }
});

const list = await client.list({
  serverUrl: 'https://example.workers.dev',
  playerId: 'player-1',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1'
});
assert.equal(list.status, 'ready');
assert.equal(list.rooms.length, 1);
assert.equal(list.rooms[0].gameMode, 'pvp-team-elimination');
const options = {
  serverUrl: 'https://example.workers.dev',
  playerId: 'player-1',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  listingId: 'listing-1',
  joinToken: 'join-1'
};
const [first, second] = await Promise.all([
  client.requestJoin(options),
  client.requestJoin(options)
]);
assert.equal(first.roomCode, 'ABC234');
assert.equal(second.admissionToken, 'admission-1');
assert.equal(first.gameMode, 'pvp-team-elimination');
assert.equal(joinCalls, 1, 'duplicate join clicks must share one request');
assert.equal(calls.length, 2);
console.log('MATCH.2 R1.1 frontend room admission client tests passed');
