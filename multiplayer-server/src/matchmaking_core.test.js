import {
  MATCHMAKING_GLOBAL_FALLBACK_MS,
  MATCHMAKING_PATCH,
  MATCHMAKING_SCHEMA,
  chooseMatchmakingCandidate,
  cleanupMatchmakingTickets,
  makeMatchmakingRoomCode,
  matchmakingCompatibilityKey,
  matchmakingTicketsCompatible,
  normalizeMatchmakingRequest,
  publicMatchmakingTicket
} from './matchmaking_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const base = normalizeMatchmakingRequest({
  playerId: 'player-a',
  displayName: 'Abrar',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  mode: 'coop',
  mapId: 'grid_bunker',
  difficulty: 1,
  maxPlayers: 2,
  tabId: 'tab-a'
}, { region: 'AS', now: 1000 });

const peer = normalizeMatchmakingRequest({
  playerId: 'player-b',
  displayName: 'Khadija',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  mode: 'coop',
  mapId: 'grid_bunker',
  difficulty: 1,
  maxPlayers: 2,
  tabId: 'tab-b'
}, { region: 'AS', now: 1200 });

assert(MATCHMAKING_SCHEMA === 1, 'schema should be 1');
assert(MATCHMAKING_PATCH === 'match2-public-room-admission-r1-1', 'patch mismatch');
assert(matchmakingCompatibilityKey(base) === matchmakingCompatibilityKey(peer), 'compatible key mismatch');
assert(matchmakingTicketsCompatible(base, peer), 'same build/protocol/mode/map should be compatible');

const regional = chooseMatchmakingCandidate(
  [{ ...base, status: 'queued', queuedAt: 1000 }],
  { ...peer, status: 'queued', queuedAt: 1200 },
  { now: 1200 }
);
assert(regional?.ticket?.playerId === 'player-a', 'regional peer should match');
assert(regional.scope === 'regional', 'same region should be regional');

const remotePeer = { ...peer, playerId: 'player-c', region: 'EU', queuedAt: 2000 };
const beforeFallback = chooseMatchmakingCandidate(
  [{ ...base, status: 'queued', queuedAt: 1000 }],
  { ...remotePeer, status: 'queued' },
  { now: 1000 + MATCHMAKING_GLOBAL_FALLBACK_MS - 1 }
);
assert(beforeFallback === null, 'cross-region match must wait for fallback');

const afterFallback = chooseMatchmakingCandidate(
  [{ ...base, status: 'queued', queuedAt: 1000 }],
  { ...remotePeer, status: 'queued' },
  { now: 1000 + MATCHMAKING_GLOBAL_FALLBACK_MS }
);
assert(afterFallback?.scope === 'global', 'cross-region fallback should match');

const incompatible = {
  ...peer,
  playerId: 'player-d',
  build: 'different-build',
  status: 'queued',
  queuedAt: 1000
};
assert(
  chooseMatchmakingCandidate(
    [{ ...base, status: 'queued', queuedAt: 1000 }],
    incompatible,
    { now: 999999 }
  ) === null,
  'different builds must never match'
);

assert(
  makeMatchmakingRoomCode(new Uint8Array([0, 1, 2, 3, 4, 5])).length === 6,
  'room code must be six characters'
);

const expired = cleanupMatchmakingTickets({
  one: {
    ticketId: 'one',
    status: 'queued',
    queuedAt: 0,
    expiresAt: 10
  }
}, { now: 11 });
assert(expired.tickets.one.status === 'expired', 'queued ticket should expire');

const snapshot = publicMatchmakingTicket({
  ticketId: 'ticket-1',
  status: 'matched',
  queuedAt: 1000,
  expiresAt: 91000,
  fallbackAt: 13000,
  region: 'AS',
  mapId: 'grid_bunker',
  difficulty: 1,
  maxPlayers: 2,
  assignment: {
    matchId: 'match-1',
    roomCode: 'ABC234',
    joinMode: 'join',
    connectAfterMs: 140,
    scope: 'regional'
  }
}, { now: 1500, queueDepth: 1 });

assert(snapshot.assignment.roomCode === 'ABC234', 'assignment room missing');
assert(snapshot.elapsedMs === 500, 'elapsed time mismatch');
assert(!Object.hasOwn(snapshot, 'token'), 'public snapshot must not leak token');

console.log('MATCH.1 matchmaking core tests passed');
