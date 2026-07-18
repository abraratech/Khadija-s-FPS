import {
  MATCH3_GAMEPLAY_HUMAN_LIMIT,
  MATCH3_SERVER_PATCH,
  MATCH3_SERVER_SCHEMA,
  chooseMatch3Candidate,
  estimatedMatch3WaitMs,
  match3RegionCompatible,
  match3RoomVisibleForFilters,
  normalizeMatch3RoomFilters,
  normalizeMatch3ServerPreferences,
  sortMatch3RoomEntries
} from './match3_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(MATCH3_SERVER_SCHEMA === 2, 'schema mismatch');
assert(MATCH3_SERVER_PATCH === 'match3-r1-party-quality-room-discovery', 'patch mismatch');
assert(MATCH3_GAMEPLAY_HUMAN_LIMIT === 2, 'human limit mismatch');

const quality = normalizeMatch3ServerPreferences({ searchPriority: 'quality' });
assert(quality.globalExpansionMs === 20_000, 'quality fallback mismatch');
const regional = normalizeMatch3ServerPreferences({ regionPolicy: 'regional-only' });
assert(regional.globalExpansionMs === 0, 'regional-only fallback mismatch');

const now = 30_000;
const incoming = {
  ticketId: 'incoming',
  playerId: 'p2',
  status: 'queued',
  queuedAt: 25_000,
  region: 'AS',
  regionPolicy: 'auto',
  fallbackAt: 37_000,
  partySize: 1,
  maxPlayers: 2,
  searchPriority: 'balanced'
};
const sameRegion = {
  ticketId: 'regional',
  playerId: 'p1',
  status: 'queued',
  queuedAt: 20_000,
  region: 'AS',
  regionPolicy: 'auto',
  fallbackAt: 32_000,
  partySize: 1,
  maxPlayers: 2,
  searchPriority: 'quality'
};
const global = {
  ...sameRegion,
  ticketId: 'global',
  playerId: 'p3',
  region: 'EU',
  fallbackAt: 10_000
};
assert(match3RegionCompatible(sameRegion, incoming, now).compatible, 'regional compatibility missing');
assert(chooseMatch3Candidate([global, sameRegion], incoming, { now }).ticket.ticketId === 'regional', 'regional candidate should win');

const room = {
  listingId: 'room-1',
  mapId: 'grid_bunker',
  difficulty: 1,
  status: 'waiting',
  scope: 'regional',
  hasBot: false,
  openHumanSlots: 1,
  updatedAt: now
};
assert(match3RoomVisibleForFilters(room, {
  mapId: 'grid_bunker',
  requiredSlots: 1
}), 'room should match filters');
assert(!match3RoomVisibleForFilters(room, {
  requiredSlots: 2
}), 'room should reject oversized party');
assert(sortMatch3RoomEntries([room], { requiredSlots: 1 }, { now })[0].quality === 'excellent', 'quality label mismatch');
assert(estimatedMatch3WaitMs({ partySize: 2 }) === 1_000, 'party room wait mismatch');

console.log('MATCH.3 Worker quality, party and room filter tests passed');

const pvpDirectoryFilters = normalizeMatch3RoomFilters({ gameMode: 'pvp-team-elimination', difficulty: '' });
assert(pvpDirectoryFilters.gameMode === 'pvp-team-elimination', 'PvP directory mode filter mismatch');
assert(!match3RoomVisibleForFilters({ openHumanSlots: 1, gameMode: 'coop' }, pvpDirectoryFilters), 'Co-Op listing must not match PvP directory filter');
assert(match3RoomVisibleForFilters({ openHumanSlots: 1, gameMode: 'pvp-team-elimination' }, pvpDirectoryFilters), 'PvP listing should match PvP directory filter');
