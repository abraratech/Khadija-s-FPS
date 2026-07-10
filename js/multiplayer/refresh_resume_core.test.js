import assert from 'node:assert/strict';
import {
  buildCleanMultiplayerRefreshUrl,
  createMultiplayerRefreshResumeIntent,
  evaluateMultiplayerRefreshResume,
  normalizeMultiplayerLastRoom,
  readMultiplayerRefreshToken
} from './refresh_resume_core.js';

const now = 500000;
const publicUrl = 'https://khadija-s-fps.pages.dev/?room=ABC234&mpRefresh=500000';
const room = {
  roomCode: 'abc234',
  serverUrl: 'https://worker.example.test',
  displayName: 'Abrar'
};

const intent = createMultiplayerRefreshResumeIntent({
  signature: '6|5|build-a|build-b',
  refreshUrl: publicUrl,
  now
});

assert.equal(intent.refreshToken, '500000');
assert.equal(readMultiplayerRefreshToken(publicUrl), '500000');
assert.deepEqual(normalizeMultiplayerLastRoom(room), {
  roomCode: 'ABC234',
  serverUrl: 'https://worker.example.test',
  displayName: 'Abrar'
});

const ready = evaluateMultiplayerRefreshResume({
  intent,
  currentHref: publicUrl,
  hostname: 'khadija-s-fps.pages.dev',
  lastRoom: room,
  now: now + 100
});
assert.equal(ready.status, 'READY');
assert.equal(ready.autoRejoin, true);
assert.equal(ready.lastRoom.roomCode, 'ABC234');

const mismatch = evaluateMultiplayerRefreshResume({
  intent,
  currentHref: 'https://khadija-s-fps.pages.dev/?mpRefresh=wrong',
  hostname: 'khadija-s-fps.pages.dev',
  lastRoom: room,
  now: now + 100
});
assert.equal(mismatch.status, 'BLOCKED');
assert.equal(mismatch.reason, 'refresh-token-mismatch');

const loopback = evaluateMultiplayerRefreshResume({
  intent,
  currentHref: 'http://localhost/?mpRefresh=500000',
  hostname: 'localhost',
  lastRoom: room,
  now: now + 100
});
assert.equal(loopback.status, 'BLOCKED');
assert.equal(loopback.reason, 'loopback-auto-rejoin-blocked');

const expired = evaluateMultiplayerRefreshResume({
  intent,
  currentHref: publicUrl,
  hostname: 'khadija-s-fps.pages.dev',
  lastRoom: room,
  now: intent.expiresAt + 1
});
assert.equal(expired.status, 'EXPIRED');

const noRoom = evaluateMultiplayerRefreshResume({
  intent,
  currentHref: publicUrl,
  hostname: 'khadija-s-fps.pages.dev',
  lastRoom: null,
  now: now + 100
});
assert.equal(noRoom.status, 'NO_ROOM');
assert.equal(noRoom.autoRejoin, false);

const busy = evaluateMultiplayerRefreshResume({
  intent,
  currentHref: publicUrl,
  hostname: 'khadija-s-fps.pages.dev',
  lastRoom: room,
  connected: true,
  now: now + 100
});
assert.equal(busy.status, 'BUSY');

const cleanUrl = buildCleanMultiplayerRefreshUrl(publicUrl);
assert.equal(cleanUrl.includes('mpRefresh='), false);
assert.equal(cleanUrl.includes('room=ABC234'), true);

assert.equal(createMultiplayerRefreshResumeIntent({
  signature: '',
  refreshUrl: publicUrl,
  now
}), null);

console.log('refresh_resume_core tests passed');
