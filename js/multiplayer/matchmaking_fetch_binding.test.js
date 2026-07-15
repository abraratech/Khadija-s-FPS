import { PublicMatchmakingClient } from './matchmaking.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let now = 1000;
let receiverWasGlobal = false;
const nativeLikeFetch = async function (url) {
  if (this !== globalThis) {
    throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
  }
  receiverWasGlobal = true;
  if (String(url).includes('/matchmaking/enqueue')) {
    return new Response(JSON.stringify({
      ok: true,
      schema: 1,
      patch: 'match1-public-foundation-r1',
      ticketId: 'binding-ticket',
      token: 'binding-token',
      status: 'queued',
      queuedAt: 1000,
      fallbackAt: 13000,
      region: 'AS',
      queueDepth: 1
    }), {
      status: 202,
      headers: { 'content-type': 'application/json' }
    });
  }
  if (String(url).includes('/matchmaking/cancel')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  throw new Error(`Unexpected request: ${url}`);
};

const client = new PublicMatchmakingClient({
  fetchImpl: nativeLikeFetch,
  now: () => now
});

const started = await client.start({
  serverUrl: 'https://example.workers.dev',
  playerId: 'fetch-binding-player',
  displayName: 'Fetch Binding',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  preferences: {
    mapId: 'grid_bunker',
    difficulty: 1,
    maxPlayers: 2
  }
});

assert(receiverWasGlobal, 'native-like fetch must receive the global receiver');
assert(started.status === 'searching', 'safe fetch should start Quick Match');
assert(started.botAvailable === false, 'AI fill should remain hidden initially');

now = 26_001;
client.publish({});
assert(
  client.getSnapshot().botAvailable === true,
  'AI fill should become available after the bounded wait'
);

await client.cancel({ reason: 'test-complete' });
client.destroy();

console.log('BOT.1 Quick Match fetch binding and bot-delay tests passed');
