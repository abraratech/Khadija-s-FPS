import assert from 'node:assert/strict';
import {
  PUBLIC_ROOM_DIRECTORY_PATCH,
  normalizePublicRoomEntry,
  normalizeRoomAdmissionAssignment,
  normalizeRoomDirectoryResponse,
  roomDirectoryStatusPresentation
} from './room_directory_core.js';

assert.equal(PUBLIC_ROOM_DIRECTORY_PATCH, 'match3-r1-party-quality-room-discovery');
const entry = normalizePublicRoomEntry({
  listingId: 'listing-1',
  joinToken: 'join-1',
  gameMode: 'pvp-team-elimination',
  ranked: false,
  mapId: 'grid_bunker',
  difficulty: 1,
  status: 'waiting',
  connectedHumans: 1,
  reservedHumans: 1,
  maxPlayers: 3,
  hasBot: true,
  allowLateJoin: true,
  region: 'AS',
  scope: 'regional'
});
assert.equal(entry.openHumanSlots, 1);
assert.equal(entry.gameMode, 'pvp-team-elimination');
assert.equal(entry.ranked, false);
const response = normalizeRoomDirectoryResponse({
  ok: true,
  schema: 1,
  patch: PUBLIC_ROOM_DIRECTORY_PATCH,
  region: 'AS',
  rooms: [entry]
});
assert.equal(response.rooms.length, 1);
const assignment = normalizeRoomAdmissionAssignment({
  roomCode: 'ABC234',
  admissionToken: 'admission-1',
  admissionExpiresAt: 1234,
  listingId: 'listing-1',
  gameMode: 'pvp-team-elimination',
  ranked: false
});
assert.equal(assignment.roomCode, 'ABC234');
assert.equal(assignment.admissionToken, 'admission-1');
assert.equal(assignment.gameMode, 'pvp-team-elimination');
assert.equal(roomDirectoryStatusPresentation({ status: 'ready', rooms: response.rooms }).tone, 'success');
assert.equal(roomDirectoryStatusPresentation({ status: 'join-rejected', error: 'Room full' }).tone, 'warning');
console.log('MATCH.2 R1.1 frontend room directory core tests passed');
