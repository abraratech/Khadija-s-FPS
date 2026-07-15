import {
  PUBLIC_MATCHMAKING_PATCH,
  PUBLIC_MATCHMAKING_SCHEMA,
  createQuickMatchRequest,
  matchmakingEndpoint,
  matchmakingStatusPresentation,
  normalizeMatchmakingHttpBase,
  normalizeMatchmakingResponse,
  normalizeQuickMatchPreferences
} from './matchmaking_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(PUBLIC_MATCHMAKING_SCHEMA === 1, 'schema mismatch');
assert(PUBLIC_MATCHMAKING_PATCH === 'match1-public-foundation-r1', 'patch mismatch');
assert(
  normalizeMatchmakingHttpBase('wss://example.workers.dev/ws')
    === 'https://example.workers.dev',
  'WebSocket URL should normalize to HTTPS base'
);
assert(
  matchmakingEndpoint('https://example.workers.dev/', '/matchmaking/status', {
    ticketId: 'ticket-1',
    token: 'token-1'
  }).includes('/matchmaking/status?'),
  'status endpoint should include query parameters'
);

const preferences = normalizeQuickMatchPreferences({
  mapId: 'grid_bunker',
  difficulty: 2,
  maxPlayers: 7
});
assert(preferences.maxPlayers === 4, 'max players should clamp to four');

const request = createQuickMatchRequest({
  playerId: 'player-1',
  displayName: '<Abrar>',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  tabId: 'tab-1',
  preferences
});
assert(request.displayName === 'Abrar', 'display name should be sanitized');
assert(request.mode === 'coop', 'mode should be co-op');

const response = normalizeMatchmakingResponse({
  ok: true,
  schema: 1,
  patch: PUBLIC_MATCHMAKING_PATCH,
  ticketId: 'ticket-1',
  token: 'queue-token',
  status: 'matched',
  queuedAt: 1000,
  fallbackAt: 13000,
  assignment: {
    matchId: 'match-1',
    roomCode: 'abc234',
    joinMode: 'join',
    connectAfterMs: 140,
    mapId: 'grid_bunker',
    difficulty: 1,
    maxPlayers: 2,
    scope: 'regional',
    region: 'AS'
  }
});
assert(response.assignment.roomCode === 'ABC234', 'room code should normalize');
assert(response.status === 'matched', 'matched response expected');

const searching = matchmakingStatusPresentation({
  status: 'searching',
  queuedAt: 1000,
  fallbackAt: 13000
}, { now: 5000 });
assert(searching.title === 'SEARCHING FOR OPERATIVES', 'search title mismatch');
assert(searching.detail.includes('GLOBAL IN 8s'), 'fallback countdown mismatch');

const matched = matchmakingStatusPresentation({
  status: 'matched',
  queuedAt: 1000
}, { now: 5000 });
assert(matched.title === 'MATCH FOUND', 'matched title mismatch');

console.log('MATCH.1 frontend matchmaking core tests passed');
