// multiplayer-server/src/voice_signal_core.test.js
import assert from 'node:assert/strict';
import {
  VOICE_SIGNAL_KINDS,
  VOICE_SIGNAL_PATCH,
  buildVoiceSignalRelay,
  validateVoiceSignalRequest,
} from './voice_signal_core.js';

assert.equal(VOICE_SIGNAL_PATCH, 'm5-coop-live-voice-r1');

const context = {
  senderPlayerId: 'player-a',
  connectedPlayerIds: ['player-a', 'player-b'],
};
assert.equal(validateVoiceSignalRequest({
  targetPlayerId: 'player-a',
  kind: VOICE_SIGNAL_KINDS.READY,
}, context).reason, 'invalid-target');
assert.equal(validateVoiceSignalRequest({
  targetPlayerId: 'player-c',
  kind: VOICE_SIGNAL_KINDS.READY,
}, context).reason, 'target-unavailable');
assert.equal(validateVoiceSignalRequest({
  targetPlayerId: 'player-b',
  kind: 'unknown',
}, context).reason, 'invalid-signal');

const offer = validateVoiceSignalRequest({
  targetPlayerId: 'player-b',
  kind: VOICE_SIGNAL_KINDS.OFFER,
  description: { type: 'offer', sdp: 'v=0' },
}, context);
assert.equal(offer.ok, true);
assert.equal(offer.signal.description.type, 'offer');

const candidate = validateVoiceSignalRequest({
  targetPlayerId: 'player-b',
  kind: VOICE_SIGNAL_KINDS.ICE_CANDIDATE,
  candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
}, context);
assert.equal(candidate.ok, true);

const relay = buildVoiceSignalRelay({
  signal: offer.signal,
  fromPlayerId: 'player-a',
  fromDisplayName: '<Abrar>',
  sentAt: 100,
});
assert.equal(relay.fromPlayerId, 'player-a');
assert.equal(relay.targetPlayerId, 'player-b');
assert.equal(relay.fromDisplayName, '<Abrar>');
assert.equal(relay.sentAt, 100);
assert.equal('audio' in relay, false);

console.log('voice_signal_core tests passed');
