// NET.1 R1 — secure browser WebRTC DataChannel mesh with Worker signaling.

import {
  NET1_CHANNELS,
  NET1_PATCH,
  NET1_TRANSPORT_PATHS,
  net1EnvelopeSourceAllowed,
  net1HumanPeerIds,
  net1Supported,
  normalizeNet1IceServers,
  resolveNet1PathFromCandidateStats,
  sanitizeNet1Signal
} from './webrtc_core.js';

const MAX_RELIABLE_BUFFERED_BYTES = 384 * 1024;
const MAX_SNAPSHOT_BUFFERED_BYTES = 48 * 1024;
const MAX_DIRECT_MESSAGE_BYTES = 128 * 1024;
const PEER_RETRY_DELAYS_MS = Object.freeze([250, 750, 1600, 3200]);

function bytes(value) {
  if (typeof TextEncoder === 'function') {
    return new TextEncoder().encode(String(value)).byteLength;
  }
  return String(value).length;
}

function safeClose(value) {
  try { value?.close?.(); } catch { /* browser close race */ }
}

export class Net1WebRtcMesh {
  constructor({
    sendSignal,
    onEnvelope,
    onPathChanged,
    rtcScope = globalThis
  } = {}) {
    this.sendSignal = sendSignal;
    this.onEnvelope = onEnvelope;
    this.onPathChanged = onPathChanged;
    this.rtcScope = rtcScope;
    this.enabled = false;
    this.localPlayerId = null;
    this.room = null;
    this.iceServers = normalizeNet1IceServers([]);
    this.turnConfigured = false;
    this.peers = new Map();
    this.path = NET1_TRANSPORT_PATHS.CLOUD_RELAY;
    this.stats = {
      offersSent: 0,
      answersSent: 0,
      candidatesSent: 0,
      directMessagesSent: 0,
      directMessagesReceived: 0,
      snapshotDrops: 0,
      reliableFallbacks: 0,
      peerRestarts: 0
    };
  }

  configure({ localPlayerId, room, iceServers, enabled = true, turnConfigured = false } = {}) {
    this.localPlayerId = String(localPlayerId || this.localPlayerId || '');
    this.enabled = enabled === true && net1Supported(this.rtcScope) && Boolean(this.localPlayerId);
    this.turnConfigured = turnConfigured === true;
    this.iceServers = normalizeNet1IceServers(iceServers);
    if (!this.enabled) {
      this.closeAll('unsupported-or-disabled');
      this.setPath(NET1_TRANSPORT_PATHS.CLOUD_RELAY);
      return this.getSnapshot();
    }
    if (room) this.syncRoom(room);
    return this.getSnapshot();
  }

  syncRoom(room) {
    this.room = room || null;
    if (!this.enabled || !this.localPlayerId) return this.getSnapshot();
    const desired = new Set(net1HumanPeerIds(room, this.localPlayerId));
    for (const peerId of this.peers.keys()) {
      if (!desired.has(peerId)) this.closePeer(peerId, 'roster-removed');
    }
    for (const peerId of desired) {
      const state = this.ensurePeer(peerId);
      if (this.localPlayerId.localeCompare(peerId) < 0 && !state.started) {
        this.startOffer(peerId).catch(() => this.scheduleRestart(peerId));
      }
    }
    this.updatePath();
    return this.getSnapshot();
  }

  ensurePeer(peerId) {
    const cleanPeerId = String(peerId || '');
    if (!cleanPeerId || cleanPeerId === this.localPlayerId) return null;
    const existing = this.peers.get(cleanPeerId);
    if (existing && existing.pc?.connectionState !== 'closed') return existing;

    const RTCPeerConnectionCtor = this.rtcScope.RTCPeerConnection;
    const pc = new RTCPeerConnectionCtor({
      iceServers: this.iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 2
    });
    const state = {
      peerId: cleanPeerId,
      pc,
      reliable: null,
      snapshot: null,
      started: false,
      connected: false,
      path: NET1_TRANSPORT_PATHS.NEGOTIATING,
      pendingCandidates: [],
      retryAttempt: 0,
      retryTimer: null,
      lastConnectedAt: 0,
      lastMessageAt: 0
    };
    this.peers.set(cleanPeerId, state);

    pc.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return;
      this.stats.candidatesSent += 1;
      this.sendSignal?.({
        kind: 'candidate',
        targetPlayerId: cleanPeerId,
        candidate: event.candidate.toJSON?.() || event.candidate
      });
    });
    pc.addEventListener('datachannel', (event) => this.attachChannel(state, event.channel));
    pc.addEventListener('connectionstatechange', () => this.handleConnectionState(state));
    pc.addEventListener('iceconnectionstatechange', () => {
      if (['failed', 'disconnected'].includes(pc.iceConnectionState)) {
        this.scheduleRestart(cleanPeerId);
      }
    });
    return state;
  }

  attachChannel(state, channel) {
    if (!channel) return;
    if (channel.label === NET1_CHANNELS.SNAPSHOT) state.snapshot = channel;
    else if (channel.label === NET1_CHANNELS.RELIABLE) state.reliable = channel;
    else {
      safeClose(channel);
      return;
    }
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('open', () => {
      state.connected = this.peerReady(state);
      state.lastConnectedAt = Date.now();
      this.updatePeerPath(state).catch(() => {});
      this.updatePath();
    });
    channel.addEventListener('close', () => {
      state.connected = false;
      this.updatePath();
    });
    channel.addEventListener('error', () => {
      state.connected = false;
      this.updatePath();
    });
    channel.addEventListener('message', (event) => this.handleDirectMessage(state, event.data));
  }

  createChannels(state) {
    if (!state.reliable) {
      this.attachChannel(state, state.pc.createDataChannel(NET1_CHANNELS.RELIABLE, {
        ordered: true
      }));
    }
    if (!state.snapshot) {
      this.attachChannel(state, state.pc.createDataChannel(NET1_CHANNELS.SNAPSHOT, {
        ordered: false,
        maxRetransmits: 0
      }));
    }
  }

  async startOffer(peerId, { iceRestart = false } = {}) {
    const state = this.ensurePeer(peerId);
    if (!state || !this.enabled) return false;
    state.started = true;
    this.createChannels(state);
    const offer = await state.pc.createOffer({ iceRestart });
    await state.pc.setLocalDescription(offer);
    this.stats.offersSent += 1;
    this.sendSignal?.({
      kind: 'offer',
      targetPlayerId: peerId,
      description: state.pc.localDescription
    });
    this.setPath(NET1_TRANSPORT_PATHS.NEGOTIATING);
    return true;
  }

  async handleSignal(payload = {}) {
    if (!this.enabled) return false;
    const signal = sanitizeNet1Signal(payload, {
      targetPlayerId: this.localPlayerId
    });
    if (!signal || signal.targetPlayerId !== this.localPlayerId) return false;
    const peerId = signal.sourcePlayerId;
    const state = this.ensurePeer(peerId);
    if (!state) return false;

    if (signal.kind === 'candidate') {
      const IceCandidate = this.rtcScope.RTCIceCandidate;
      const candidate = typeof IceCandidate === 'function'
        ? new IceCandidate(signal.candidate)
        : signal.candidate;
      if (!state.pc.remoteDescription) {
        state.pendingCandidates.push(candidate);
      } else {
        await state.pc.addIceCandidate(candidate).catch(() => {});
      }
      return true;
    }

    if (signal.kind === 'renegotiate') {
      if (this.localPlayerId.localeCompare(peerId) < 0) {
        await this.startOffer(peerId, { iceRestart: true });
      }
      return true;
    }

    const SessionDescription = this.rtcScope.RTCSessionDescription;
    const description = typeof SessionDescription === 'function'
      ? new SessionDescription(signal.description)
      : signal.description;
    if (description.type === 'offer') {
      state.started = true;
      await state.pc.setRemoteDescription(description);
      for (const candidate of state.pendingCandidates.splice(0)) {
        await state.pc.addIceCandidate(candidate).catch(() => {});
      }
      const answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);
      this.stats.answersSent += 1;
      this.sendSignal?.({
        kind: 'answer',
        targetPlayerId: peerId,
        description: state.pc.localDescription
      });
      return true;
    }

    await state.pc.setRemoteDescription(description);
    for (const candidate of state.pendingCandidates.splice(0)) {
      await state.pc.addIceCandidate(candidate).catch(() => {});
    }
    return true;
  }

  peerReady(state) {
    return Boolean(
      state
      && state.reliable?.readyState === 'open'
      && state.snapshot?.readyState === 'open'
      && ['connected', 'completed'].includes(
        state.pc.connectionState === 'connected'
          ? 'connected'
          : state.pc.iceConnectionState
      )
    );
  }

  allPeersReady() {
    const expected = net1HumanPeerIds(this.room, this.localPlayerId);
    if (!expected.length) return false;
    return expected.every((peerId) => this.peerReady(this.peers.get(peerId)));
  }

  sendEnvelope(envelope, { channel = NET1_CHANNELS.RELIABLE } = {}) {
    if (!this.enabled || !this.allPeersReady()) return false;
    const encoded = JSON.stringify({
      kind: 'envelope',
      envelope,
      net1: {
        patch: NET1_PATCH,
        sourcePlayerId: this.localPlayerId,
        sentAt: Date.now()
      }
    });
    if (bytes(encoded) > MAX_DIRECT_MESSAGE_BYTES) return false;

    const states = net1HumanPeerIds(this.room, this.localPlayerId)
      .map((peerId) => this.peers.get(peerId));
    for (const state of states) {
      const dataChannel = channel === NET1_CHANNELS.SNAPSHOT
        ? state?.snapshot
        : state?.reliable;
      const limit = channel === NET1_CHANNELS.SNAPSHOT
        ? MAX_SNAPSHOT_BUFFERED_BYTES
        : MAX_RELIABLE_BUFFERED_BYTES;
      if (!dataChannel || dataChannel.readyState !== 'open') return false;
      if (dataChannel.bufferedAmount > limit) {
        if (channel === NET1_CHANNELS.SNAPSHOT) {
          this.stats.snapshotDrops += 1;
          return true;
        }
        this.stats.reliableFallbacks += 1;
        return false;
      }
    }
    states.forEach((state) => {
      const dataChannel = channel === NET1_CHANNELS.SNAPSHOT
        ? state.snapshot
        : state.reliable;
      dataChannel.send(encoded);
    });
    this.stats.directMessagesSent += states.length;
    return true;
  }

  handleDirectMessage(state, raw) {
    if (typeof raw !== 'string' || bytes(raw) > MAX_DIRECT_MESSAGE_BYTES) return;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message?.kind !== 'envelope' || !message.envelope) return;
    if (message.net1?.sourcePlayerId && message.net1.sourcePlayerId !== state.peerId) return;
    if (!net1EnvelopeSourceAllowed(message.envelope, state.peerId, this.room)) return;
    state.lastMessageAt = Date.now();
    this.stats.directMessagesReceived += 1;
    this.onEnvelope?.(message.envelope, {
      sourcePlayerId: state.peerId,
      path: state.path,
      receivedAt: Date.now()
    });
  }

  async updatePeerPath(state) {
    const stats = await state.pc.getStats();
    state.path = resolveNet1PathFromCandidateStats(stats);
    this.updatePath();
  }

  handleConnectionState(state) {
    const connectionState = state.pc.connectionState;
    state.connected = this.peerReady(state);
    if (connectionState === 'connected') {
      state.retryAttempt = 0;
      state.lastConnectedAt = Date.now();
      this.updatePeerPath(state).catch(() => {});
    } else if (['failed', 'closed'].includes(connectionState)) {
      state.connected = false;
      this.scheduleRestart(state.peerId);
    }
    this.updatePath();
  }

  scheduleRestart(peerId) {
    const state = this.peers.get(peerId);
    if (!state || state.retryTimer || !this.enabled) return;
    const delay = PEER_RETRY_DELAYS_MS[Math.min(
      state.retryAttempt,
      PEER_RETRY_DELAYS_MS.length - 1
    )];
    state.retryAttempt += 1;
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      if (!this.peers.has(peerId)) return;
      this.stats.peerRestarts += 1;
      if (this.localPlayerId.localeCompare(peerId) < 0) {
        this.startOffer(peerId, { iceRestart: true }).catch(() => {});
      } else {
        this.sendSignal?.({ kind: 'renegotiate', targetPlayerId: peerId });
      }
    }, delay);
  }

  updatePath() {
    const expected = net1HumanPeerIds(this.room, this.localPlayerId);
    if (!this.enabled || !expected.length) {
      this.setPath(NET1_TRANSPORT_PATHS.CLOUD_RELAY);
      return;
    }
    if (!this.allPeersReady()) {
      this.setPath(NET1_TRANSPORT_PATHS.NEGOTIATING);
      return;
    }
    const states = expected.map((peerId) => this.peers.get(peerId));
    this.setPath(states.some((state) => state?.path === NET1_TRANSPORT_PATHS.TURN_RELAY)
      ? NET1_TRANSPORT_PATHS.TURN_RELAY
      : NET1_TRANSPORT_PATHS.DIRECT);
  }

  setPath(nextPath) {
    if (this.path === nextPath) return;
    const previousPath = this.path;
    this.path = nextPath;
    this.onPathChanged?.({ previousPath, path: nextPath, snapshot: this.getSnapshot() });
  }

  closePeer(peerId, reason = 'closed') {
    const state = this.peers.get(peerId);
    if (!state) return false;
    if (state.retryTimer) clearTimeout(state.retryTimer);
    safeClose(state.reliable);
    safeClose(state.snapshot);
    safeClose(state.pc);
    this.peers.delete(peerId);
    this.updatePath();
    return reason;
  }

  closeAll(reason = 'closed') {
    Array.from(this.peers.keys()).forEach((peerId) => this.closePeer(peerId, reason));
    this.room = null;
    this.updatePath();
  }

  getSnapshot() {
    const peers = Array.from(this.peers.values()).map((state) => ({
      playerId: state.peerId,
      connected: this.peerReady(state),
      path: state.path,
      reliableState: state.reliable?.readyState || 'closed',
      snapshotState: state.snapshot?.readyState || 'closed',
      lastConnectedAt: state.lastConnectedAt,
      lastMessageAt: state.lastMessageAt
    }));
    return {
      schema: 1,
      patch: NET1_PATCH,
      enabled: this.enabled,
      supported: net1Supported(this.rtcScope),
      path: this.path,
      directReady: this.allPeersReady(),
      turnConfigured: this.turnConfigured,
      peerCount: peers.length,
      connectedPeerCount: peers.filter((entry) => entry.connected).length,
      peers,
      stats: { ...this.stats }
    };
  }
}
