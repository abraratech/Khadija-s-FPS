// js/multiplayer/room_controls_core.test.js
import assert from 'node:assert/strict';
import {
  ROOM_PLAYER_LIMITS,
  canHostManagePlayer,
  getAdmissionRejection,
  normalizeRoomControlSettings,
  normalizeRoomPlayerLimit
} from './room_controls_core.js';

assert.equal(normalizeRoomPlayerLimit(-4), 2);
assert.equal(normalizeRoomPlayerLimit(3.9), 3);
assert.equal(normalizeRoomPlayerLimit(100), 4);
assert.equal(normalizeRoomPlayerLimit('bad'), 4);

assert.deepEqual(
  normalizeRoomControlSettings(
    { maxPlayers: 2, locked: true, allowLateJoin: false },
    { connectedCount: 3, status: 'waiting' }
  ),
  { maxPlayers: 3, locked: true, allowLateJoin: false }
);

assert.equal(
  getAdmissionRejection({
    connectedCount: 1,
    settings: { maxPlayers: 4, locked: true }
  }),
  'This room is locked by the host.'
);

assert.equal(
  getAdmissionRejection({
    connectedCount: 1,
    status: 'in-run',
    settings: { maxPlayers: 4, allowLateJoin: false }
  }),
  'Late joining is disabled for this run.'
);

assert.equal(
  getAdmissionRejection({
    connectedCount: 2,
    settings: { maxPlayers: 2 }
  }),
  'Room is full.'
);

assert.equal(
  getAdmissionRejection({
    connectedCount: 4,
    existing: true,
    settings: { maxPlayers: 2, locked: true }
  }),
  null
);

assert.equal(
  getAdmissionRejection({
    kickedUntil: 20_000,
    now: 10_000
  }),
  'You were removed from this room by the host.'
);

assert.deepEqual(
  canHostManagePlayer({
    actorPlayerId: 'host',
    hostPlayerId: 'host',
    targetPlayerId: 'operative',
    targetConnected: true
  }),
  { ok: true, reason: null }
);

assert.equal(
  canHostManagePlayer({
    actorPlayerId: 'operative',
    hostPlayerId: 'host',
    targetPlayerId: 'other',
    targetConnected: true
  }).ok,
  false
);

assert.equal(ROOM_PLAYER_LIMITS.MIN, 2);
assert.equal(ROOM_PLAYER_LIMITS.MAX, 4);

console.log(
  'M3.17-M3.18 tests passed: room limits, locking, late-join '
  + 'admission, kick cooldown, and host-management validation are valid.'
);
