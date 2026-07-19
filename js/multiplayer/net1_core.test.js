import assert from 'node:assert/strict';
import {
  NET1_CHANNELS,
  NET1_PATCH,
  NET1_TRANSPORT_PATHS,
  net1DeliveryKey,
  net1EnvelopeSourceAllowed,
  net1HumanPeerIds,
  net1Supported,
  normalizeNet1IceServers,
  resolveNet1EnvelopePolicy,
  resolveNet1PathFromCandidateStats,
  sanitizeNet1Signal
} from './webrtc_core.js';

assert.equal(NET1_PATCH, 'net1-r1-webrtc-hybrid-transport');
assert.equal(net1Supported({
  RTCPeerConnection() {},
  isSecureContext: true
}), true);
assert.equal(net1Supported({ RTCPeerConnection() {}, isSecureContext: false }), false);
assert.equal(net1Supported({
  RTCPeerConnection() {},
  isSecureContext: false,
  location: { hostname: 'localhost' }
}), true);

const ice = normalizeNet1IceServers([
  { urls: ['stun:stun.cloudflare.com:3478', 'turn:example.com:53?transport=udp'] },
  { urls: 'turns:relay.example.com:5349', username: 'user', credential: 'secret' }
]);
assert.deepEqual(ice[0].urls, ['stun:stun.cloudflare.com:3478']);
assert.equal(ice[1].username, 'user');
assert.equal(ice[1].credential, 'secret');
assert.deepEqual(normalizeNet1IceServers([]), [{ urls: ['stun:stun.cloudflare.com:3478'] }]);

assert.deepEqual(resolveNet1EnvelopePolicy('player-snapshot'), {
  directEligible: true,
  channel: NET1_CHANNELS.SNAPSHOT,
  relayShadow: false,
  priority: 'fast'
});
assert.equal(resolveNet1EnvelopePolicy('world-snapshot').relayShadow, true);
assert.equal(resolveNet1EnvelopePolicy('room-state').directEligible, false);
assert.equal(net1DeliveryKey({ messageId: 'p1:player-snapshot:4:sender-p1:connection-2' }), 'p1:player-snapshot:4');
assert.equal(net1DeliveryKey({ net1DeliveryKey: 'explicit' }), 'explicit');

assert.deepEqual(net1HumanPeerIds({ players: [
  { playerId: 'p3', connected: true },
  { playerId: 'p1', connected: true },
  { playerId: 'bot', connected: true, isBot: true },
  { playerId: 'gone', connected: false }
]}, 'p1'), ['p3']);

const offer = sanitizeNet1Signal({
  kind: 'offer',
  sourcePlayerId: 'p1',
  targetPlayerId: 'p2',
  description: { type: 'offer', sdp: 'v=0' }
});
assert.equal(offer.description.type, 'offer');
assert.equal(sanitizeNet1Signal({ kind: 'offer', sourcePlayerId: 'p1', targetPlayerId: 'p1' }), null);
assert.equal(sanitizeNet1Signal({ kind: 'bad', sourcePlayerId: 'p1', targetPlayerId: 'p2' }), null);

const directStats = [
  { id: 'local', type: 'local-candidate', candidateType: 'host' },
  { id: 'remote', type: 'remote-candidate', candidateType: 'srflx' },
  { id: 'pair', type: 'candidate-pair', selected: true, state: 'succeeded', localCandidateId: 'local', remoteCandidateId: 'remote' }
];
assert.equal(resolveNet1PathFromCandidateStats(directStats), NET1_TRANSPORT_PATHS.DIRECT);
assert.equal(resolveNet1PathFromCandidateStats(directStats.map((entry) => entry.id === 'local' ? { ...entry, candidateType: 'relay' } : entry)), NET1_TRANSPORT_PATHS.TURN_RELAY);

const authorityRoom = {
  hostPlayerId: 'host',
  virtualPlayers: { wingman: { playerId: 'bot-1', isBot: true, connected: true } }
};
assert.equal(net1EnvelopeSourceAllowed({ type: 'world-snapshot', playerId: 'host' }, 'host', authorityRoom), true);
assert.equal(net1EnvelopeSourceAllowed({ type: 'world-snapshot', playerId: 'ally' }, 'ally', authorityRoom), false);
assert.equal(net1EnvelopeSourceAllowed({ type: 'revive-state', playerId: 'ally', payload: { kind: 'command' } }, 'ally', authorityRoom), true);
assert.equal(net1EnvelopeSourceAllowed({ type: 'player-snapshot', playerId: 'bot-1' }, 'host', authorityRoom), true);
assert.equal(net1EnvelopeSourceAllowed({ type: 'player-snapshot', playerId: 'host' }, 'ally', authorityRoom), false);

console.log('NET.1 frontend policy and validation core tests: PASS');
