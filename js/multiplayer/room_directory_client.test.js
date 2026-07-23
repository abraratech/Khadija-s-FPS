import assert from 'node:assert/strict';
import { PublicRoomDirectoryClient } from './room_directory.js';

function fakeJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

function openRoomPayload() {
  return {
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
  };
}

function assignmentPayload() {
  return {
    ok: true,
    assignment: {
      roomCode: 'ABC234',
      joinMode: 'join',
      listingId: 'listing-1',
      admissionToken: 'admission-1',
      admissionExpiresAt: Date.now() + 15000,
      gameMode: 'pvp-team-elimination',
      ranked: false
    }
  };
}

const calls = [];
let joinCalls = 0;
const client = new PublicRoomDirectoryClient({
  fetchImpl: async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/matchmaking/rooms/list')) {
      return fakeJsonResponse(openRoomPayload());
    }
    joinCalls += 1;
    await Promise.resolve();
    return fakeJsonResponse(assignmentPayload());
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

const found = await client.findOpenRoom({
  serverUrl: 'https://example.workers.dev',
  playerId: 'player-1',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  gameMode: 'pvp-team-elimination'
});
assert.equal(found.roomCode, 'ABC234');
assert.ok(calls.some((entry) => entry.url.includes('/matchmaking/rooms/find')));
assert.equal(calls.length, 3);

// QUALITY.2 R2: a missing atomic endpoint falls back to list + join.
const fallbackCalls = [];
const fallbackClient = new PublicRoomDirectoryClient({
  fetchImpl: async (url, options = {}) => {
    const target = String(url);
    fallbackCalls.push({ url: target, options });
    if (target.includes('/matchmaking/rooms/find')) {
      return fakeJsonResponse({
        ok: false,
        error: 'MATCHMAKING_ENDPOINT_NOT_FOUND'
      }, 404);
    }
    if (target.includes('/matchmaking/rooms/list')) {
      return fakeJsonResponse(openRoomPayload());
    }
    if (target.includes('/matchmaking/rooms/join')) {
      return fakeJsonResponse(assignmentPayload());
    }
    throw new Error(`Unexpected fallback URL: ${target}`);
  }
});
const fallbackAssignment = await fallbackClient.findOpenRoom({
  serverUrl: 'https://example.workers.dev',
  playerId: 'player-2',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  gameMode: 'pvp-team-elimination'
});
assert.equal(fallbackAssignment.roomCode, 'ABC234');
assert.equal(fallbackClient.getSnapshot().compatibilityFallbackUsed, true);
assert.deepEqual(
  fallbackCalls.map((entry) => new URL(entry.url).pathname),
  [
    '/matchmaking/rooms/find',
    '/matchmaking/rooms/list',
    '/matchmaking/rooms/join'
  ]
);

// A valid empty pool is visible and actionable rather than appearing inert.
const emptyClient = new PublicRoomDirectoryClient({
  fetchImpl: async () => fakeJsonResponse({
    ok: false,
    error: 'NO_OPEN_ROOM_AVAILABLE',
    message: 'No open unranked PvP room is available.'
  }, 404)
});
await assert.rejects(
  emptyClient.findOpenRoom({
    serverUrl: 'https://example.workers.dev',
    playerId: 'player-3',
    protocol: 6,
    build: 'm5-coop-turn-fallback-r1',
    gameMode: 'pvp-team-elimination'
  }),
  (error) => error?.code === 'NO_OPEN_ROOM_AVAILABLE'
);
assert.equal(emptyClient.getSnapshot().status, 'ready');
assert.equal(emptyClient.getSnapshot().rooms.length, 0);
assert.match(emptyClient.getSnapshot().error, /Rated Quick Match/);

console.log('QUALITY.2 R2 frontend room discovery resilience tests passed');
