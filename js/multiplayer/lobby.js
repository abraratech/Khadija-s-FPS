// js/multiplayer/lobby.js

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { SESSION_MODES } from './session.js';
import { TRANSPORT_MODES, TRANSPORT_STATES } from './transport.js';
import { MultiplayerLobbyUI } from './lobby_ui.js';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeRoomCode() {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(
    bytes,
    (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]
  ).join('');
}

function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
}

function reconnectStorageKey(roomCode) {
  return `ka_multiplayer_reconnect_${roomCode}`;
}

function loadReconnectToken(roomCode) {
  try {
    return sessionStorage.getItem(reconnectStorageKey(roomCode));
  } catch {
    return null;
  }
}

function saveReconnectToken(roomCode, token) {
  try {
    if (token) sessionStorage.setItem(reconnectStorageKey(roomCode), token);
  } catch {
    // Ignore restricted session storage.
  }
}

export class MultiplayerLobbyController {
  constructor({
    eventBus,
    transport,
    session,
    runtime,
    players,
    localPlayerId,
    onStartRun
  } = {}) {
    this.eventBus = eventBus;
    this.transport = transport;
    this.session = session;
    this.runtime = runtime;
    this.players = players;
    this.localPlayerId = localPlayerId;
    this.onStartRun = onStartRun;
    this.ui = null;
    this.unsubscribe = [];
    this.error = null;
    this.connected = false;
    this.room = null;
  }

  initialize() {
    this.ui = new MultiplayerLobbyUI({
      actions: {
        createRoom: (options) => this.createRoom(options),
        joinRoom: (options) => this.joinRoom(options),
        setReady: (ready) => this.setReady(ready),
        updateSettings: (settings) => this.updateSettings(settings),
        startRun: () => this.startRun(),
        leaveRoom: () => this.leaveRoom()
      }
    });
    this.ui.initialize();

    this.unsubscribe.push(
      this.eventBus.on(MULTIPLAYER_EVENTS.TRANSPORT_CONTROL, (event) => {
        this.handleControl(event.payload);
      })
    );

    this.unsubscribe.push(
      this.eventBus.on(MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED, () => {
        this.render();
      })
    );

    this.unsubscribe.push(
      this.eventBus.on(MULTIPLAYER_EVENTS.TRANSPORT_ERROR, (event) => {
        this.error = event.payload?.message || 'Multiplayer connection error.';
        this.render();
      })
    );

    this.unsubscribe.push(
      this.eventBus.on(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, (event) => {
        this.room = event.payload?.room || this.room;
        this.render();
      })
    );

    this.render();
    return this.getSnapshot();
  }

  async createRoom({ displayName, serverUrl } = {}) {
    const roomCode = makeRoomCode();
    return this.connect({
      roomCode,
      displayName,
      serverUrl,
      joinMode: 'create'
    });
  }

  async joinRoom({ roomCode, displayName, serverUrl } = {}) {
    const normalized = normalizeRoomCode(roomCode);
    if (normalized.length !== 6) {
      this.error = 'ENTER A VALID SIX-CHARACTER ROOM CODE';
      this.render();
      return false;
    }

    return this.connect({
      roomCode: normalized,
      displayName,
      serverUrl,
      joinMode: 'join'
    });
  }

  async connect({
    roomCode,
    displayName,
    serverUrl,
    joinMode
  } = {}) {
    this.error = null;
    this.connected = false;
    this.room = null;
    this.render();

    if (!String(serverUrl || '').trim()) {
      this.error = 'DEPLOY THE WORKER, THEN ENTER ITS SERVER URL';
      this.render();
      return false;
    }

    try {
      await this.transport.connect({
        serverUrl,
        roomCode,
        playerId: this.localPlayerId,
        displayName: String(displayName || 'Player').trim().slice(0, 24),
        joinMode,
        reconnectToken: loadReconnectToken(roomCode)
      });
      this.render();
      return true;
    } catch (error) {
      this.error = error?.message || 'Unable to connect to multiplayer server.';
      this.render();
      return false;
    }
  }

  handleControl(message) {
    const action = message?.action;
    const payload = message?.payload || {};

    if (action === 'error') {
      this.error = String(payload.message || 'Multiplayer server rejected the request.')
        .toUpperCase();
      this.render();
      return;
    }

    if (action === 'welcome') {
      const room = payload.room;
      if (!room?.roomId || !payload.sessionId) {
        this.error = 'SERVER WELCOME WAS INCOMPLETE';
        this.render();
        return;
      }

      this.connected = true;
      this.error = null;
      this.room = room;
      this.transport.setReconnectToken(payload.reconnectToken);
      saveReconnectToken(room.roomCode, payload.reconnectToken);

      const local = room.players.find(
        (player) => player.playerId === this.localPlayerId
      );
      const mode = local?.isHost ? SESSION_MODES.HOST : SESSION_MODES.CLIENT;

      this.session.configureOnlineSession({
        mode,
        roomId: room.roomId,
        sessionId: payload.sessionId,
        hostPlayerId: room.hostPlayerId
      });

      this.runtime.room.replaceFromSnapshot(room, 'server-welcome');
      this.render();
      return;
    }

    if (action === 'room-state') {
      if (!payload.room) return;
      this.connected = true;
      this.room = payload.room;

      const local = payload.room.players?.find(
        (player) => player.playerId === this.localPlayerId
      );
      this.session.mode = local?.isHost ? SESSION_MODES.HOST : SESSION_MODES.CLIENT;
      this.session.hostPlayerId = payload.room.hostPlayerId || null;

      this.runtime.room.replaceFromSnapshot(payload.room, 'server-room-state');
      this.render();
      return;
    }

    if (action === 'start-run') {
      const start = {
        runId: payload.runId,
        mapId: payload.mapId,
        difficulty: Number(payload.difficulty) || 1,
        roomCode: payload.roomCode
      };

      if (!start.runId || !start.mapId) {
        this.error = 'SERVER START MESSAGE WAS INCOMPLETE';
        this.render();
        return;
      }

      this.ui?.close();
      this.onStartRun?.(start);
      return;
    }

    if (action === 'left-room') {
      this.finishLeave();
    }
  }

  setReady(ready) {
    return this.transport.sendControl('set-ready', {
      ready: ready === true
    });
  }

  updateSettings(settings) {
    return this.transport.sendControl('update-settings', settings);
  }

  startRun() {
    return this.transport.sendControl('start-run', {});
  }

  notifyRunEnded(reason = 'ended') {
    const local = this.room?.players?.find(
      (player) => player.playerId === this.localPlayerId
    );
    if (!this.connected || local?.isHost !== true) return false;
    return this.transport.sendControl('end-run', { reason });
  }

  async leaveRoom() {
    try {
      this.transport.sendControl('leave', { reason: 'manual' });
    } finally {
      await this.transport.disconnect('left-room', { fallbackLocal: true });
      this.finishLeave();
    }
  }

  finishLeave() {
    this.connected = false;
    this.room = null;
    this.error = null;
    this.session.returnToLocalSession({
      hostPlayerId: this.localPlayerId
    });
    this.runtime.resetToLocalRoom();
    this.render();
  }

  render() {
    const transportState = this.transport.getState();
    const transportMode = this.transport.getMode();
    const connecting = transportMode === TRANSPORT_MODES.ONLINE
      && [
        TRANSPORT_STATES.CONNECTING,
        TRANSPORT_STATES.RECONNECTING
      ].includes(transportState);

    this.ui?.render({
      connected: this.connected,
      connecting,
      transportState,
      transportMode,
      room: this.room,
      localPlayerId: this.localPlayerId,
      error: this.error
    });
  }

  getSnapshot() {
    return {
      connected: this.connected,
      room: this.room,
      error: this.error,
      transport: this.transport.getConnectionSnapshot()
    };
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
  }
}
