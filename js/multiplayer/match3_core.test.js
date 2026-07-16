import {
  MATCH3_MAX_GAMEPLAY_HUMANS,
  MATCH3_PATCH,
  MATCH3_SCHEMA,
  match3PartyErrorMessage,
  match3QueueLabel,
  normalizeMatch3PartyContext,
  normalizeMatch3RoomFilters,
  normalizeMatch3SearchPreferences,
  roomEntryMatchesFilters,
  sortMatch3Rooms
} from './match3_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(MATCH3_SCHEMA === 2, 'MATCH.3 schema mismatch');
assert(MATCH3_PATCH === 'match3-r1-party-quality-room-discovery', 'MATCH.3 patch mismatch');
assert(MATCH3_MAX_GAMEPLAY_HUMANS === 2, 'current gameplay human limit mismatch');

const quality = normalizeMatch3SearchPreferences({
  searchPriority: 'quality',
  regionPolicy: 'auto'
});
assert(quality.globalExpansionMs === 20_000, 'quality expansion delay mismatch');

const regional = normalizeMatch3SearchPreferences({ regionPolicy: 'regional-only' });
assert(regional.globalExpansionMs === 0, 'regional-only should not expand globally');

const solo = normalizeMatch3PartyContext(null);
assert(solo.eligible && solo.memberCount === 1, 'solo context mismatch');

const member = normalizeMatch3PartyContext({
  state: {
    party: {
      partyId: 'party-1',
      isLeader: false,
      members: [{ socialId: 'social-111111111111111111111111' }]
    }
  }
});
assert(member.reason === 'PARTY_LEADER_REQUIRED', 'party member leader guard missing');

const oversized = normalizeMatch3PartyContext({
  state: {
    party: {
      partyId: 'party-2',
      isLeader: true,
      members: [
        { socialId: 'social-111111111111111111111111' },
        { socialId: 'social-222222222222222222222222' },
        { socialId: 'social-333333333333333333333333' }
      ]
    }
  }
});
assert(oversized.reason === 'PARTY_TOO_LARGE_FOR_CURRENT_COOP', 'oversized party guard missing');
assert(match3PartyErrorMessage(oversized.reason).includes('two human'), 'party error copy mismatch');

const filters = normalizeMatch3RoomFilters({
  mapId: 'grid_bunker',
  difficulty: 1,
  status: 'waiting',
  regionScope: 'regional',
  bot: 'without-bot',
  requiredSlots: 1
});
const rooms = [
  {
    listingId: 'global',
    mapId: 'grid_bunker',
    difficulty: 1,
    status: 'waiting',
    scope: 'global',
    hasBot: false,
    openHumanSlots: 1,
    updatedAt: 100
  },
  {
    listingId: 'regional',
    mapId: 'grid_bunker',
    difficulty: 1,
    status: 'waiting',
    scope: 'regional',
    hasBot: false,
    openHumanSlots: 1,
    updatedAt: 200
  }
];
assert(roomEntryMatchesFilters(rooms[1], filters), 'regional room should match');
assert(!roomEntryMatchesFilters(rooms[0], filters), 'global room should be filtered');
assert(sortMatch3Rooms(rooms, { filters })[0].listingId === 'regional', 'room sort mismatch');
assert(match3QueueLabel({ party: solo, preferences: quality }).includes('QUALITY'), 'queue label mismatch');

assert(
  match3PartyErrorMessage('PARTY_OPEN_ROOM_RESERVATION_UNSUPPORTED').includes('solo operatives'),
  'party Open Room guidance should preserve the party instead of attempting a non-atomic join'
);

console.log('MATCH.3 frontend quality and party core tests passed');
