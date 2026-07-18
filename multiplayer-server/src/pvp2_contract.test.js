import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  matchmakingTicketsCompatible,
  normalizeMatchmakingRequest,
  publicMatchmakingTicket
} from './matchmaking_core.js';

const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('./matchmaking_hub.js', import.meta.url), 'utf8');
const matchmaking = fs.readFileSync(new URL('./matchmaking_core.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('./pvp2_core.js', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(index, /PVP2_SERVER_INFO/);
assert.match(index, /recordPvp2PublicResult/);
assert.match(index, /url\.pathname === '\/pvp2\/stats'/);
assert.match(index, /url\.pathname === '\/pvp2\/leaderboard'/);
assert.match(index, /url\.pathname\.startsWith\('\/pvp2\/'\)/);
assert.match(index, /PVP2_PATCH/);
assert.match(core, /pvp2-r2-public-custom-pvp-rooms/);
assert.match(hub, /\/pvp2\/stats/);
assert.match(hub, /\/pvp2\/leaderboard/);
assert.match(hub, /\/pvp2\/result/);
assert.match(matchmaking, /pvp-team-elimination/);
assert.match(wrangler, /PVP2_PUBLIC_MATCHMAKING_ENABLED/);
assert.match(wrangler, /PVP2_PUBLIC_CUSTOM_ROOMS_ENABLED/);
assert.match(index, /publicCustomRooms/);
assert.match(index, /customRoomsRanked: false/);
assert.match(wrangler, /"true"/);


const publicPvpA = normalizeMatchmakingRequest({
  playerId: 'pvp-a',
  displayName: 'Alpha',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  mode: 'pvp-team-elimination',
  mapId: 'grid_bunker',
  partySize: 1,
  allowBackfill: true,
  joinInProgress: true,
  tabId: 'tab-a'
}, { region: 'PK', now: 1000 });
const publicPvpB = normalizeMatchmakingRequest({
  playerId: 'pvp-b',
  displayName: 'Bravo',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  mode: 'pvp-team-elimination',
  mapId: 'grid_bunker',
  partySize: 1,
  tabId: 'tab-b'
}, { region: 'PK', now: 1001 });
assert.equal(publicPvpA.maxPlayers, 2);
assert.equal(publicPvpA.allowBackfill, false);
assert.equal(publicPvpA.joinInProgress, false);
assert.equal(matchmakingTicketsCompatible(publicPvpA, publicPvpB), true);
assert.equal(matchmakingTicketsCompatible(publicPvpA, { ...publicPvpB, mode: 'coop' }), false);
const publicTicket = publicMatchmakingTicket({
  ...publicPvpA,
  ticketId: 'ticket-pvp',
  status: 'matched',
  assignment: {
    matchId: 'match-pvp',
    roomCode: 'PVP234',
    gameMode: 'pvp-team-elimination',
    publicPvp: true,
    maxPlayers: 2
  }
});
assert.equal(publicTicket.mode, 'pvp-team-elimination');
assert.equal(publicTicket.assignment.publicPvp, true);
assert.equal(publicTicket.assignment.gameMode, 'pvp-team-elimination');

console.log('PVP.2 Worker integration contract tests passed');
