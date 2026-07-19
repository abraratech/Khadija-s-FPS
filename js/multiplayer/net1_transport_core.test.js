import assert from 'node:assert/strict';
import { Net1WebRtcMesh } from './webrtc_transport.js';
import { NET1_CHANNELS, NET1_TRANSPORT_PATHS } from './webrtc_core.js';

class FakeChannel {
  constructor(label) {
    this.label = label;
    this.readyState = 'open';
    this.bufferedAmount = 0;
    this.sent = [];
    this.listeners = new Map();
  }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  send(value) { this.sent.push(value); }
  close() { this.readyState = 'closed'; }
}

class FakePeerConnection {
  constructor(config) {
    this.config = config;
    this.connectionState = 'connected';
    this.iceConnectionState = 'connected';
    this.localDescription = null;
    this.remoteDescription = null;
    this.listeners = new Map();
    this.channels = [];
  }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  createDataChannel(label) {
    const channel = new FakeChannel(label);
    this.channels.push(channel);
    return channel;
  }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0\r\n' }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  async addIceCandidate() {}
  async getStats() {
    return new Map([
      ['local', { id: 'local', type: 'local-candidate', candidateType: 'host' }],
      ['remote', { id: 'remote', type: 'remote-candidate', candidateType: 'srflx' }],
      ['pair', { id: 'pair', type: 'candidate-pair', selected: true, state: 'succeeded', localCandidateId: 'local', remoteCandidateId: 'remote' }]
    ]);
  }
  close() { this.connectionState = 'closed'; }
}

const signals = [];
const received = [];
const paths = [];
const scope = {
  RTCPeerConnection: FakePeerConnection,
  RTCSessionDescription: class { constructor(value) { Object.assign(this, value); } },
  RTCIceCandidate: class { constructor(value) { Object.assign(this, value); } },
  isSecureContext: true
};
const mesh = new Net1WebRtcMesh({
  rtcScope: scope,
  sendSignal: (signal) => signals.push(signal),
  onEnvelope: (envelope) => received.push(envelope),
  onPathChanged: ({ path }) => paths.push(path)
});
mesh.configure({
  localPlayerId: 'a-player',
  enabled: true,
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
  room: {
    hostPlayerId: 'a-player',
    players: [
      { playerId: 'a-player', connected: true },
      { playerId: 'b-player', connected: true }
    ]
  }
});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(signals[0]?.kind, 'offer');
assert.equal(signals[0]?.targetPlayerId, 'b-player');
const state = mesh.peers.get('b-player');
assert.ok(state);
assert.deepEqual(state.pc.config.iceServers[0].urls, ['stun:stun.cloudflare.com:3478']);
assert.equal(state.reliable.label, NET1_CHANNELS.RELIABLE);
assert.equal(state.snapshot.label, NET1_CHANNELS.SNAPSHOT);
mesh.updatePath();
assert.equal(mesh.getSnapshot().path, NET1_TRANSPORT_PATHS.DIRECT);
assert.equal(mesh.sendEnvelope({ type: 'player-snapshot', playerId: 'a-player', messageId: 'm1' }, { channel: NET1_CHANNELS.SNAPSHOT }), true);
assert.equal(state.snapshot.sent.length, 1);
state.snapshot.bufferedAmount = 100 * 1024;
assert.equal(mesh.sendEnvelope({ type: 'player-snapshot', playerId: 'a-player', messageId: 'm2' }, { channel: NET1_CHANNELS.SNAPSHOT }), true);
assert.equal(mesh.getSnapshot().stats.snapshotDrops, 1);
state.snapshot.bufferedAmount = 0;
mesh.handleDirectMessage(state, JSON.stringify({
  kind: 'envelope',
  envelope: { type: 'player-snapshot', playerId: 'b-player', messageId: 'm3' },
  net1: { sourcePlayerId: 'b-player' }
}));
assert.equal(received.length, 1);
mesh.handleDirectMessage(state, JSON.stringify({
  kind: 'envelope',
  envelope: { type: 'world-snapshot', playerId: 'b-player', messageId: 'spoof' },
  net1: { sourcePlayerId: 'b-player' }
}));
assert.equal(received.length, 1, 'Non-host authority snapshot must be rejected.');
mesh.closeAll('test');
assert.equal(mesh.getSnapshot().path, NET1_TRANSPORT_PATHS.CLOUD_RELAY);
console.log('NET.1 WebRTC mesh transport core tests: PASS');
