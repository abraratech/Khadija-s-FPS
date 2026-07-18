import assert from 'node:assert/strict';
import {
  ROOM_DIRECTORY_ADMISSION_TTL_MS,
  ROOM_DIRECTORY_PATCH,
  activeRoomAdmissionReservation,
  cleanupRoomAdmissionReservations,
  cleanupRoomDirectory,
  countActiveRoomAdmissionReservations,
  evaluateRoomDirectoryAdmission,
  normalizeRoomDirectorySync,
  publicRoomDirectoryEntry,
  roomDirectoryListingVisible,
  roomKickActive
} from './room_directory_core.js';

assert.equal(ROOM_DIRECTORY_PATCH, 'match3-r1-party-quality-room-discovery');
assert.equal(ROOM_DIRECTORY_ADMISSION_TTL_MS, 15_000);
const now = 100000;
const listing = {
  ...normalizeRoomDirectorySync({
    roomCode: 'ABC234',
    listed: true,
    protocol: 6,
    build: 'build-1',
    gameMode: 'pvp-team-elimination',
    ranked: false,
    mapId: 'grid_bunker',
    difficulty: 1,
    status: 'waiting',
    connectedHumans: 1,
    reservedHumans: 0,
    maxPlayers: 2,
    hasBot: true,
    allowLateJoin: true,
    locked: false,
    hostConnected: true,
    region: 'AS'
  }, { now }),
  listingId: 'listing-1',
  joinToken: 'token-1'
};
assert.equal(roomDirectoryListingVisible(listing, { now }), true);
const publicEntry = publicRoomDirectoryEntry(listing, { requestRegion: 'AS', now });
assert.equal(publicEntry.scope, 'regional');
assert.equal(publicEntry.openHumanSlots, 1);
assert.equal(publicEntry.gameMode, 'pvp-team-elimination');
assert.equal(publicEntry.ranked, false);
assert.equal(roomDirectoryListingVisible({ ...listing, status: 'in-run' }, { now }), false);
assert.equal(roomDirectoryListingVisible({ ...listing, reservedHumans: 1 }, { now }), false);

const room = {
  roomCode: 'ABC234',
  sessionId: 'session-1',
  status: 'in-run',
  hostPlayerId: 'host',
  settings: {
    publicListing: true,
    locked: false,
    allowLateJoin: true,
    maxPlayers: 2
  },
  players: {
    host: { playerId: 'host', connected: true, isBot: false }
  },
  kickedPlayers: {},
  directoryAdmissions: {}
};
assert.equal(evaluateRoomDirectoryAdmission({ room, playerId: 'ally', now }).ok, true);
room.directoryAdmissions.other = { token: 'a', expiresAt: now + 1000 };
assert.equal(evaluateRoomDirectoryAdmission({ room, playerId: 'ally', now }).error, 'ROOM_FULL');
assert.equal(countActiveRoomAdmissionReservations(room.directoryAdmissions, { now }), 1);
assert.equal(activeRoomAdmissionReservation(room.directoryAdmissions, 'other', { now }).token, 'a');
const cleanedReservations = cleanupRoomAdmissionReservations({
  expired: { expiresAt: now - 1 },
  active: { expiresAt: now + 1 }
}, { now });
assert.equal(cleanedReservations.changed, true);
assert.deepEqual(Object.keys(cleanedReservations.reservations), ['active']);

delete room.directoryAdmissions.other;
room.kickedPlayers.ally = { sessionId: 'session-1', kickedAt: now };
assert.equal(roomKickActive(room.kickedPlayers, 'ally', 'session-1', { now }), true);
assert.equal(roomKickActive(room.kickedPlayers, 'ally', 'session-2', { now }), false);
assert.equal(evaluateRoomDirectoryAdmission({ room, playerId: 'ally', now }).ok, false);

const cleaned = cleanupRoomDirectory({ one: { ...listing, expiresAt: now - 1 } }, { now });
assert.equal(cleaned.changed, true);
assert.equal(Object.keys(cleaned.listings).length, 0);
console.log('MATCH.2 R1.1 Worker room admission tests passed');
