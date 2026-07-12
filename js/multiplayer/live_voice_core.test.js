// js/multiplayer/live_voice_core.test.js
import assert from 'node:assert/strict';
import {
  LIVE_VOICE_PATCH,
  LIVE_VOICE_SIGNAL_KINDS,
  LIVE_VOICE_STUN_URL,
  liveVoiceAvailability,
  normalizeIceCandidate,
  normalizeIncomingVoiceSignal,
  normalizeSessionDescription,
  roomVoicePeers,
  shouldInitiateVoiceOffer,
} from './live_voice_core.js';

assert.equal(LIVE_VOICE_PATCH, 'm5-coop-turn-fallback-r1');
assert.equal(LIVE_VOICE_STUN_URL, 'stun:stun.cloudflare.com:3478');
assert.equal(shouldInitiateVoiceOffer('player-a', 'player-b'), true);
assert.equal(shouldInitiateVoiceOffer('player-b', 'player-a'), false);
assert.equal(shouldInitiateVoiceOffer('player-a', 'player-a'), false);

const peers = roomVoicePeers({
  players: [
    { playerId: 'player-b', displayName: 'Khadija', connected: true },
    { playerId: 'player-a', displayName: 'Abrar', connected: true },
    { playerId: 'player-c', displayName: 'Away', connected: false },
  ],
}, 'player-a');
assert.deepEqual(peers.map((entry) => entry.playerId), ['player-b']);

assert.deepEqual(normalizeSessionDescription({ type: 'offer', sdp: 'v=0' }, 'offer'), { type: 'offer', sdp: 'v=0' });
assert.equal(normalizeSessionDescription({ type: 'answer', sdp: 'v=0' }, 'offer'), null);
assert.deepEqual(
  normalizeIceCandidate({ candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 }),
  { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: null }
);

const incoming = normalizeIncomingVoiceSignal({
  signalId: 'voice-1',
  kind: LIVE_VOICE_SIGNAL_KINDS.OFFER,
  fromPlayerId: 'player-a',
  fromDisplayName: 'Abrar',
  targetPlayerId: 'player-b',
  description: { type: 'offer', sdp: 'v=0' },
  sentAt: 100,
}, { localPlayerId: 'player-b' });
assert.equal(incoming.kind, LIVE_VOICE_SIGNAL_KINDS.OFFER);
assert.equal(incoming.fromDisplayName, 'Abrar');
assert.equal(normalizeIncomingVoiceSignal({ ...incoming, targetPlayerId: 'player-c' }, { localPlayerId: 'player-b' }), null);

assert.equal(liveVoiceAvailability({ secureContext: false, roomAvailable: true }).reason, 'insecure-context');
assert.equal(liveVoiceAvailability({
  secureContext: true,
  mediaDevices: { getUserMedia() {} },
  peerConnection: class {},
  roomAvailable: true,
}).available, true);

console.log('live_voice_core tests passed');
