// js/multiplayer/transport.js
import { getSocialIdentityTicket } from '../social_bridge.js';

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { Net1WebRtcMesh } from './webrtc_transport.js';
import {
  NET1_TRANSPORT_PATHS,
  net1DeliveryKey,
  resolveNet1EnvelopePolicy
} from './webrtc_core.js';

export const TRANSPORT_STATES = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
});

export const TRANSPORT_MODES = Object.freeze({
  LOCAL: 'local',
  ONLINE: 'online'
});

const RECONNECT_DELAYS_MS = Object.freeze([500, 1000, 2000, 4000, 7000]);
const MAX_INBOUND_BYTES = 128 * 1024;

function textBytes(value) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(String(value)).byteLength;
  }
  return String(value).length;
}

function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
}

export function normalizeWebSocketServerUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  const url = new URL(candidate);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';

  if (!['ws:', 'wss:'].includes(url.protocol)) {
    throw new TypeError('Multiplayer server must use https, http, wss, or ws.');
  }

  const cleanPath = url.pathname.replace(/\/+$/, '');
  url.pathname = cleanPath.endsWith('/ws') ? cleanPath : `${cleanPath}/ws`;
  url.hash = '';
  return url.toString();
}

export class MultiplayerTransport {
  constructor({ eventBus } = {}) {
    this.eventBus = eventBus;
    this.state = TRANSPORT_STATES.DISCONNECTED;
    this.mode = TRANSPORT_MODES.LOCAL;
    this.socket = null;
    this.connectionOptions = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.manualDisconnect = false;
    this.outboundQueue = [];
    this.connectionEpoch = 0;
    this.seenDeliveryKeys = new Map();
    this.net1 = new Net1WebRtcMesh({
      sendSignal: (signal) => this.sendControl('net1-signal', signal),
      onEnvelope: (envelope, meta) => this.handleNet1Envelope(envelope, meta),
      onPathChanged: (details) => {
        this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_PATH_CHANGED, details);
        this.setState(this.state, { force: true, net1: details.snapshot });
      }
    });
  }

  getState() {
    return this.state;
  }

  getMode() {
    return this.mode;
  }

  getConnectionSnapshot() {
    const options = this.connectionOptions || {};
    return {
      state: this.state,
      mode: this.mode,
      roomCode: options.roomCode || null,
      playerId: options.playerId || null,
      displayName: options.displayName || null,
      reconnectAttempt: this.reconnectAttempt,
      queuedMessages: this.outboundQueue.length,
      gameMode: options.gameMode || 'coop',
      connectionEpoch: this.connectionEpoch,
      transportPath: this.mode === TRANSPORT_MODES.LOCAL
        ? NET1_TRANSPORT_PATHS.LOCAL
        : this.net1?.getSnapshot?.().path || NET1_TRANSPORT_PATHS.CLOUD_RELAY,
      net1: this.net1?.getSnapshot?.() || null
    };
  }

  async connect(options = {}) {
    const serverUrl = String(options.serverUrl || '').trim();

    if (!serverUrl) {
      return this.connectLocal();
    }

    return this.connectOnline(options);
  }

  async connectLocal() {
    this.cancelReconnect();
    this.closeSocket('switch-to-local');
    this.mode = TRANSPORT_MODES.LOCAL;
    this.connectionOptions = null;
    this.connectionEpoch = 0;
    this.seenDeliveryKeys.clear();
    this.net1?.closeAll?.('switch-to-local');
    this.manualDisconnect = false;
    this.reconnectAttempt = 0;
    this.setState(TRANSPORT_STATES.CONNECTED, { mode: TRANSPORT_MODES.LOCAL });
    return true;
  }

  async connectOnline(options = {}) {
    const roomCode = normalizeRoomCode(options.roomCode);
    const playerId = String(options.playerId || '').trim();
    const displayName = String(options.displayName || 'Player').trim().slice(0, 24);
    const joinMode = options.joinMode === 'create' ? 'create' : 'join';
    const normalizedUrl = normalizeWebSocketServerUrl(options.serverUrl);
    const gameMode = String(options.gameMode || 'coop').trim().toLowerCase() === 'pvp-team-elimination'
      ? 'pvp-team-elimination'
      : 'coop';

    if (roomCode.length !== 6) {
      throw new TypeError('Room code must contain six letters or numbers.');
    }
    if (!playerId) {
      throw new TypeError('Online multiplayer requires a playerId.');
    }

    this.cancelReconnect();
    this.closeSocket('replace-connection');
    this.net1?.closeAll?.('replace-connection');
    this.seenDeliveryKeys.clear();
    this.connectionEpoch = 0;
    this.mode = TRANSPORT_MODES.ONLINE;
    this.manualDisconnect = false;
    let socialTicket = null;
    try {
      socialTicket = await getSocialIdentityTicket({
        roomCode,
        playerId,
        displayName: displayName || 'Player',
        joinMode
      });
    } catch (error) {
      const code = String(error?.code || error?.message || error || '').toUpperCase();
      if (code.includes('RESTRICTED') || code.includes('BLOCKED')) throw error;
      socialTicket = null;
    }

    this.connectionOptions = {
      serverUrl: normalizedUrl,
      roomCode,
      playerId,
      displayName: displayName || 'Player',
      joinMode,
      gameMode,
      reconnectToken: options.reconnectToken || null,
      admissionToken: options.admissionToken || null,
      socialTicket: typeof socialTicket === 'string'
        ? socialTicket.slice(0, 220)
        : null
    };

    return this.openSocket({ reconnecting: false });
  }

  openSocket({ reconnecting = false } = {}) {
    if (!this.connectionOptions) {
      return Promise.reject(new Error('Online connection options are missing.'));
    }

    const options = this.connectionOptions;
    const url = new URL(options.serverUrl);
    url.searchParams.set('room', options.roomCode);
    url.searchParams.set('playerId', options.playerId);
    url.searchParams.set('name', options.displayName);
    url.searchParams.set('mode', options.joinMode);
    if (options.joinMode === 'create') {
      url.searchParams.set('gameMode', options.gameMode || 'coop');
    }
    if (options.reconnectToken) {
      url.searchParams.set('reconnectToken', options.reconnectToken);
    }
    if (options.admissionToken) {
      url.searchParams.set('admissionToken', options.admissionToken);
    }
    if (options.socialTicket) {
      url.searchParams.set('socialTicket', options.socialTicket);
    }

    this.setState(
      reconnecting ? TRANSPORT_STATES.RECONNECTING : TRANSPORT_STATES.CONNECTING,
      {
        mode: TRANSPORT_MODES.ONLINE,
        roomCode: options.roomCode,
        attempt: this.reconnectAttempt
      }
    );

    return new Promise((resolve, reject) => {
      let settled = false;
      let socket;

      try {
        socket = new WebSocket(url.toString());
      } catch (error) {
        this.setState(TRANSPORT_STATES.ERROR, { error: error.message });
        reject(error);
        return;
      }

      this.socket = socket;

      socket.addEventListener('open', () => {
        settled = true;
        this.reconnectAttempt = 0;
        this.setState(TRANSPORT_STATES.CONNECTED, {
          mode: TRANSPORT_MODES.ONLINE,
          roomCode: options.roomCode
        });
        this.flushQueue();
        resolve(true);
      });

      socket.addEventListener('message', (event) => {
        this.handleInboundMessage(event.data);
      });

      socket.addEventListener('error', () => {
        const error = new Error('The multiplayer WebSocket connection failed.');
        this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_ERROR, {
          message: error.message,
          roomCode: options.roomCode
        });
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      socket.addEventListener('close', (event) => {
        if (this.socket === socket) this.socket = null;
        this.net1?.closeAll?.('websocket-closed');

        const details = {
          code: event.code,
          reason: event.reason || 'connection-closed',
          wasClean: event.wasClean,
          roomCode: options.roomCode
        };

        if (this.manualDisconnect || this.mode !== TRANSPORT_MODES.ONLINE) {
          this.setState(TRANSPORT_STATES.DISCONNECTED, details);
          return;
        }

        if (event.code >= 4000 && event.code < 4100) {
          this.setState(TRANSPORT_STATES.ERROR, {
            ...details,
            error: event.reason || 'The multiplayer server rejected the connection.'
          });
          this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_ERROR, {
            message: event.reason || 'The multiplayer server rejected the connection.',
            details
          });
          return;
        }

        this.scheduleReconnect(details);
      });
    });
  }

  setReconnectToken(token) {
    if (!this.connectionOptions) return;
    this.connectionOptions.reconnectToken = token || null;
    this.connectionOptions.admissionToken = null;
    this.connectionOptions.joinMode = 'join';
  }

  send(type, payload = {}) {
    if (this.mode === TRANSPORT_MODES.LOCAL) {
      if (this.state !== TRANSPORT_STATES.CONNECTED) return false;
      this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_MESSAGE, {
        direction: 'local-loopback',
        type,
        payload
      });
      return true;
    }

    const policy = resolveNet1EnvelopePolicy(type);
    const deliveryKey = net1DeliveryKey(payload);
    const wireEnvelope = {
      ...payload,
      connectionEpoch: Math.max(0, Number(this.connectionEpoch) || 0),
      net1DeliveryKey: deliveryKey || undefined
    };
    const directSent = policy.directEligible
      && this.net1?.sendEnvelope?.(wireEnvelope, { channel: policy.channel }) === true;

    if (directSent && policy.relayShadow !== true) return true;

    const relaySent = this.sendRaw({
      kind: 'envelope',
      type,
      envelope: wireEnvelope
    });
    return directSent || relaySent;
  }

  sendControl(action, payload = {}) {
    if (this.mode !== TRANSPORT_MODES.ONLINE) return false;
    return this.sendRaw({
      kind: 'control',
      action,
      payload
    });
  }

  sendRaw(message) {
    const encoded = JSON.stringify(message);

    if (
      this.socket
      && this.socket.readyState === WebSocket.OPEN
      && this.state === TRANSPORT_STATES.CONNECTED
    ) {
      this.socket.send(encoded);
      return true;
    }

    if (
      message?.kind === 'control'
      && this.mode === TRANSPORT_MODES.ONLINE
      && [
        TRANSPORT_STATES.CONNECTING,
        TRANSPORT_STATES.RECONNECTING
      ].includes(this.state)
    ) {
      if (this.outboundQueue.length < 32) {
        this.outboundQueue.push(encoded);
      }
    }

    return false;
  }

  handleInboundMessage(raw) {
    if (typeof raw !== 'string' || textBytes(raw) > MAX_INBOUND_BYTES) {
      this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_ERROR, {
        message: 'Rejected an oversized or unsupported multiplayer message.'
      });
      return;
    }

    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_ERROR, {
        message: 'Received malformed multiplayer JSON.'
      });
      return;
    }

    if (message?.kind === 'envelope' && message.envelope) {
      this.emitRemoteEnvelope(message.envelope, {
        direction: 'remote-relay',
        path: NET1_TRANSPORT_PATHS.CLOUD_RELAY
      });
      return;
    }

    if (message?.kind === 'control') {
      this.handleNet1Control(message);
      this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_CONTROL, message);
      return;
    }

    this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_ERROR, {
      message: 'Received an unsupported multiplayer message.'
    });
  }


  handleNet1Control(message) {
    const action = String(message?.action || '');
    const payload = message?.payload || {};
    if (action === 'welcome') {
      this.connectionEpoch = Math.max(0, Math.floor(Number(payload.connectionEpoch) || 0));
      this.net1?.configure?.({
        localPlayerId: this.connectionOptions?.playerId,
        room: payload.room || null,
        iceServers: payload.net1?.iceServers,
        enabled: payload.net1?.enabled !== false,
        turnConfigured: payload.net1?.turnConfigured === true
      });
      return;
    }
    if (action === 'room-state' && payload.room) {
      this.net1?.syncRoom?.(payload.room);
      return;
    }
    if (action === 'host-migrated' && payload.room) {
      this.net1?.syncRoom?.(payload.room);
      return;
    }
    if (action === 'net1-signal') {
      this.net1?.handleSignal?.(payload).catch?.(() => {});
    }
  }

  handleNet1Envelope(envelope, meta = {}) {
    this.emitRemoteEnvelope(envelope, {
      direction: 'remote-direct',
      path: meta.path || NET1_TRANSPORT_PATHS.DIRECT,
      sourcePlayerId: meta.sourcePlayerId || null
    });
  }

  emitRemoteEnvelope(envelope, meta = {}) {
    const deliveryKey = net1DeliveryKey(envelope);
    if (deliveryKey && this.deliveryAlreadySeen(deliveryKey)) return false;
    if (deliveryKey) this.rememberDelivery(deliveryKey);
    this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_MESSAGE, {
      direction: meta.direction || 'remote',
      path: meta.path || NET1_TRANSPORT_PATHS.CLOUD_RELAY,
      sourcePlayerId: meta.sourcePlayerId || envelope?.playerId || null,
      type: envelope?.type,
      payload: envelope
    });
    return true;
  }

  deliveryAlreadySeen(key, now = Date.now()) {
    this.pruneDeliveryKeys(now);
    return this.seenDeliveryKeys.has(String(key));
  }

  rememberDelivery(key, now = Date.now()) {
    this.seenDeliveryKeys.set(String(key), Number(now) || Date.now());
    this.pruneDeliveryKeys(now);
  }

  pruneDeliveryKeys(now = Date.now()) {
    const cutoff = (Number(now) || Date.now()) - 30_000;
    for (const [key, seenAt] of this.seenDeliveryKeys.entries()) {
      if (seenAt < cutoff || this.seenDeliveryKeys.size > 4096) {
        this.seenDeliveryKeys.delete(key);
      }
    }
  }

  flushQueue() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const queued = this.outboundQueue.splice(0);
    queued.forEach((message) => this.socket.send(message));
  }

  scheduleReconnect(details = {}) {
    if (this.manualDisconnect || !this.connectionOptions) return;

    if (this.reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
      this.setState(TRANSPORT_STATES.ERROR, {
        ...details,
        error: 'Reconnect limit reached.'
      });
      this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_ERROR, {
        message: 'Unable to reconnect to the multiplayer room.',
        details
      });
      return;
    }

    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt];
    this.reconnectAttempt += 1;
    this.setState(TRANSPORT_STATES.RECONNECTING, {
      ...details,
      delay,
      attempt: this.reconnectAttempt
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket({ reconnecting: true }).catch(() => {
        // A close event or the next explicit retry handles the state.
      });
    }, delay);
  }

  async disconnect(reason = 'manual', { fallbackLocal = true } = {}) {
    this.manualDisconnect = true;
    this.cancelReconnect();

    if (this.mode === TRANSPORT_MODES.ONLINE && this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.sendControl('leave', { reason });
      } catch {
        // The socket may already be closing.
      }
    }

    this.closeSocket(reason);
    this.outboundQueue.length = 0;
    this.connectionOptions = null;
    this.connectionEpoch = 0;
    this.seenDeliveryKeys.clear();
    this.net1?.closeAll?.(reason);

    if (fallbackLocal) {
      return this.connectLocal();
    }

    this.mode = TRANSPORT_MODES.LOCAL;
    this.setState(TRANSPORT_STATES.DISCONNECTED, { reason });
    return true;
  }

  closeSocket(reason = 'closed') {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;

    try {
      if (
        socket.readyState === WebSocket.OPEN
        || socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close(1000, String(reason).slice(0, 120));
      }
    } catch {
      // Ignore browser close races.
    }
  }

  cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  setState(nextState, details = {}) {
    if (this.state === nextState && !details.force) return;

    const previousState = this.state;
    this.state = nextState;
    this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED, {
      previousState,
      state: nextState,
      mode: this.mode,
      details
    });
  }
}

// M1.1 compatibility export.
export class NullMultiplayerTransport extends MultiplayerTransport {}
