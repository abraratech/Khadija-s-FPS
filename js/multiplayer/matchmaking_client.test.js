import { PublicMatchmakingClient } from './matchmaking.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const responses = [
  {
    ok: true,
    schema: 1,
    patch: 'match1-public-foundation-r1',
    ticketId: 'ticket-1',
    token: 'token-1',
    status: 'queued',
    queuedAt: 1000,
    fallbackAt: 13000,
    region: 'AS',
    queueDepth: 1
  },
  {
    ok: true,
    schema: 1,
    patch: 'match1-public-foundation-r1',
    ticketId: 'ticket-1',
    status: 'completed',
    queuedAt: 1000,
    assignment: {
      matchId: 'match-1',
      roomCode: 'ABC234',
      joinMode: 'join',
      connectAfterMs: 0,
      mapId: 'grid_bunker',
      difficulty: 1,
      maxPlayers: 2,
      scope: 'regional',
      region: 'AS'
    }
  }
];

const fetchImpl = async (url, options = {}) => {
  if (String(url).includes('/matchmaking/enqueue')) {
    return new Response(JSON.stringify(responses[0]), {
      status: 202,
      headers: { 'content-type': 'application/json' }
    });
  }
  if (String(url).includes('/matchmaking/ack')) {
    return new Response(JSON.stringify(responses[1]), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  throw new Error(`Unexpected request: ${url} ${options.method || 'GET'}`);
};

let now = 1000;
let matched = null;
const client = new PublicMatchmakingClient({
  fetchImpl,
  now: () => now,
  onMatch: (assignment) => {
    matched = assignment;
  }
});

const started = await client.start({
  serverUrl: 'https://example.workers.dev',
  playerId: 'player-1',
  displayName: 'Abrar',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  preferences: {
    mapId: 'grid_bunker',
    difficulty: 1,
    maxPlayers: 2
  }
});
assert(started.status === 'searching', 'client should enter searching state');

client.acceptServerSnapshot({
  ...responses[0],
  status: 'matched',
  token: '',
  assignment: responses[1].assignment
});
await new Promise((resolve) => setTimeout(resolve, 10));
assert(matched?.roomCode === 'ABC234', 'match callback should receive room');
assert(client.getSnapshot().status === 'connecting', 'client should enter connecting state');

const acknowledged = await client.acknowledgeConnected();
assert(acknowledged, 'acknowledgement should succeed');
assert(client.getSnapshot().status === 'completed', 'client should complete lifecycle');

client.destroy();
console.log('MATCH.1 browser matchmaking client tests passed');
