// js/multiplayer/lobby.js

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { SESSION_MODES } from './session.js';
import { TRANSPORT_MODES, TRANSPORT_STATES } from './transport.js';
import { MultiplayerLobbyUI } from './lobby_ui.js';
import {
  MULTIPLAYER_BUILD_ID,
  MULTIPLAYER_PROTOCOL_VERSION
} from './protocol.js';
import { handleMultiplayerBuildDrift } from './build_drift.js';
import {
  consumeMultiplayerRefreshResume,
  markMultiplayerRefreshResumeResult
} from './refresh_resume.js';
import {
  cancelMultiplayerRefreshResumeWatchdog,
  completeMultiplayerRefreshResumeWatchdog,
  failMultiplayerRefreshResumeWatchdog,
  startMultiplayerRefreshResumeWatchdog
} from './refresh_watchdog.js';

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

const LAST_ROOM_STORAGE_KEY = 'ka_multiplayer_last_room';

function reconnectStorageKey(roomCode) {
    return `ka_multiplayer_reconnect_${roomCode}`;
}

function readPersistentValue(key) {
    try {
        const localValue = localStorage.getItem(key);
        if (localValue !== null) return localValue;
    } catch {
        // Fall through to session storage.
    }
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function writePersistentValue(key, value) {
    try {
        localStorage.setItem(key, value);
        return;
    } catch {
        try {
            sessionStorage.setItem(key, value);
        } catch {
            // Ignore restricted storage modes.
        }
    }
}

function loadReconnectToken(roomCode) {
    const normalized = normalizeRoomCode(roomCode);
    if (!normalized) return null;
    return readPersistentValue(reconnectStorageKey(normalized));
}

function saveReconnectToken(roomCode, token) {
    const normalized = normalizeRoomCode(roomCode);
    if (!normalized || !token) return;
    writePersistentValue(reconnectStorageKey(normalized), token);
}

function loadLastRoom() {
    try {
        const parsed = JSON.parse(readPersistentValue(LAST_ROOM_STORAGE_KEY) || 'null');
        const roomCode = normalizeRoomCode(parsed?.roomCode);
        const serverUrl = String(parsed?.serverUrl || '').trim();
        if (roomCode.length !== 6 || !serverUrl) return null;
        return {
            roomCode,
            serverUrl,
            displayName: String(parsed?.displayName || 'Player').trim().slice(0, 24) || 'Player',
            savedAt: Math.max(0, Number(parsed?.savedAt) || 0)
        };
    } catch {
        return null;
    }
}

function saveLastRoom({ roomCode, serverUrl, displayName } = {}) {
    const normalized = normalizeRoomCode(roomCode);
    const normalizedServer = String(serverUrl || '').trim();
    if (normalized.length !== 6 || !normalizedServer) return null;
    const value = {
        roomCode: normalized,
        serverUrl: normalizedServer,
        displayName: String(displayName || 'Player').trim().slice(0, 24) || 'Player',
        savedAt: Date.now()
    };
    writePersistentValue(LAST_ROOM_STORAGE_KEY, JSON.stringify(value));
    return value;
}

export class MultiplayerLobbyController {
  constructor({
    eventBus,
    transport,
    session,
    runtime,
    players,
    localPlayerId,
    onStartRun,
    onRunEnded,
    onHostMigrated,
    onLeftRoom
  } = {}) {
    this.eventBus = eventBus;
    this.transport = transport;
    this.session = session;
    this.runtime = runtime;
    this.players = players;
    this.localPlayerId = localPlayerId;
    this.onStartRun = onStartRun;
    this.onRunEnded = onRunEnded;
    this.onHostMigrated = onHostMigrated;
    this.onLeftRoom = onLeftRoom;
    this.lastAuthorityEpoch = 0;
    this.ui = null;
    this.unsubscribe = [];
    this.error = null;
    this.connected = false;
    this.room = null;
        this.lastRoom = loadLastRoom();
        this.pendingLeaveResolver = null;
  }

  initialize() {
    this.ui = new MultiplayerLobbyUI({
      actions: {
        createRoom: (options) => this.createRoom(options),
        joinRoom: (options) => this.joinRoom(options),
                rejoinLastRoom: (options) => this.rejoinLastRoom(options),
        setReady: (ready) => this.setReady(ready),
        updateSettings: (settings) => this.updateSettings(settings),
        startRun: () => this.startRun(),
        leaveRoom: () => this.leaveRoom(), kickPlayer: (playerId) => this.kickPlayer(playerId), transferHost: (playerId) => this.transferHost(playerId)
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
      failMultiplayerRefreshResumeWatchdog({
        reason: 'refresh-resume-transport-error',
        message: event.payload?.message || 'Multiplayer connection error.'
      });
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
    const refreshResume = consumeMultiplayerRefreshResume({
      lastRoom: this.lastRoom || loadLastRoom(),
      connected: this.connected,
      connecting: false
    });
    if (refreshResume.autoRejoin) {
      this.error = 'FRESH CLIENT READY — REJOINING LAST CO-OP ROOM';
      this.render();
      Promise.resolve().then(async () => {
        markMultiplayerRefreshResumeResult({
          status: 'CONNECTING',
          roomCode: refreshResume.lastRoom?.roomCode || null,
          reason: 'automatic-rejoin-started'
        });
        startMultiplayerRefreshResumeWatchdog({
          roomCode: refreshResume.lastRoom?.roomCode || null,
          onTimeout: () => {
            markMultiplayerRefreshResumeResult({
              status: 'FAILED',
              roomCode: refreshResume.lastRoom?.roomCode || null,
              reason: 'automatic-rejoin-timeout'
            });
            void this.transport.disconnect('refresh-resume-timeout', {
              fallbackLocal: true
            });
            this.connected = false;
            this.room = null;
            this.error = 'AUTO-REJOIN TIMED OUT — ROOM MAY BE CLOSED. REJOIN MANUALLY OR ENTER A NEW CODE';
            this.render();
          }
        });
        const started = await this.rejoinLastRoom({
          displayName: refreshResume.lastRoom?.displayName
        });
        if (!started) {
          failMultiplayerRefreshResumeWatchdog({
            reason: 'automatic-rejoin-failed'
          });
          markMultiplayerRefreshResumeResult({
            status: 'FAILED',
            roomCode: refreshResume.lastRoom?.roomCode || null,
            reason: 'automatic-rejoin-failed'
          });
        }
      });
    }
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

  async rejoinLastRoom({ displayName } = {}) {
        const saved = loadLastRoom();
        if (!saved) {
            this.error = 'NO SAVED CO-OP ROOM';
            this.render();
            return false;
        }
        this.lastRoom = saved;
        return this.connect({
            roomCode: saved.roomCode,
            displayName: String(displayName || saved.displayName || 'Player'),
            serverUrl: saved.serverUrl,
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

    this.lastRoom = saveLastRoom({
            roomCode,
            serverUrl,
            displayName
        }) || this.lastRoom;

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
      const refreshFailure = failMultiplayerRefreshResumeWatchdog({
        reason: 'refresh-resume-server-rejected',
        message: payload.message || 'Multiplayer server rejected the request.'
      });
      if (refreshFailure?.status === 'FAILED') {
        void this.transport.disconnect('refresh-resume-rejected', {
          fallbackLocal: true
        });
        this.connected = false;
        this.room = null;
      }
      this.error = String(payload.message || 'Multiplayer server rejected the request.')
        .toUpperCase();
      this.render();
      return;
    }

    if (action === 'welcome') {
      if (
        Number(payload.protocol) !== MULTIPLAYER_PROTOCOL_VERSION
        || payload.build !== MULTIPLAYER_BUILD_ID
      ) {
        const buildDrift = handleMultiplayerBuildDrift({
          expectedProtocol: MULTIPLAYER_PROTOCOL_VERSION,
          receivedProtocol: Number(payload.protocol),
          expectedBuild: MULTIPLAYER_BUILD_ID,
          receivedBuild: payload.build
        });
        this.error = buildDrift.message.toUpperCase();
        void this.transport.disconnect('worker-build-mismatch', {
          fallbackLocal: true
        });
        this.render();
        return;
      }

      const room = payload.room;
      if (!room?.roomId || !payload.sessionId) {
        this.error = 'SERVER WELCOME WAS INCOMPLETE';
        this.render();
        return;
      }

      const localRunWasActive = this.session.run?.active === true;

      this.connected = true;
      this.error = null;
      this.room = room;
      const refreshContinuity = completeMultiplayerRefreshResumeWatchdog({
      connected: true,
      roomCode: room.roomCode,
      roomStatus: room.status
    });
    if (refreshContinuity?.status === 'FAILED') {
      markMultiplayerRefreshResumeResult({
        status: 'FAILED',
        roomCode: room.roomCode,
        reason: 'refresh-resume-room-mismatch'
      });
      void this.transport.disconnect('refresh-resume-room-mismatch', {
        fallbackLocal: true
      });
      this.connected = false;
      this.room = null;
      this.error = 'AUTO-REJOIN RETURNED THE WRONG ROOM — REJOIN MANUALLY';
      this.render();
      return;
    }
    markMultiplayerRefreshResumeResult({
      status: 'CONNECTED',
      roomCode: room.roomCode,
      reason: 'automatic-rejoin-connected'
    });
    this.transport.setReconnectToken(payload.reconnectToken);
      saveReconnectToken(room.roomCode, payload.reconnectToken);
            this.lastRoom = saveLastRoom({
                roomCode: room.roomCode,
                serverUrl: this.transport?.serverUrl || this.lastRoom?.serverUrl,
                displayName: room.players.find(
                    (entry) => entry.playerId === this.localPlayerId
                )?.displayName || this.lastRoom?.displayName
            }) || this.lastRoom;

      const local = room.players.find(
        (player) => player.playerId === this.localPlayerId
      );
      const mode = local?.isHost ? SESSION_MODES.HOST : SESSION_MODES.CLIENT;
      const previousHostPlayerId = this.session.hostPlayerId;
      const preserveRun = localRunWasActive && room.status === 'in-run';

      this.session.configureOnlineSession({
        mode,
        roomId: room.roomId,
        sessionId: payload.sessionId,
        hostPlayerId: room.hostPlayerId,
        preserveRun
      });

      this.runtime.room.replaceFromSnapshot(room, 'server-welcome');
      this.runtime.handleHostMigration?.({
        authorityEpoch: room.authorityEpoch,
        hostPlayerId: room.hostPlayerId
      });
      this.lastAuthorityEpoch = Math.max(
        this.lastAuthorityEpoch,
        Number(room.authorityEpoch) || 0
      );

      if (room.status === 'in-run' && !localRunWasActive) {
        this.ui?.close();
        this.onStartRun?.({
          runId: room.runId,
          mapId: room.settings?.mapId || 'grid_bunker',
          difficulty: Number(room.settings?.difficulty) || 1,
          roomCode: room.roomCode,
          resume: true,
          authorityEpoch: room.authorityEpoch,
          checkpoint: payload.checkpoint || null
        });
      } else if (room.status === 'in-run') {
        this.session.updateOnlineAuthority?.({
          mode,
          hostPlayerId: room.hostPlayerId,
          authorityEpoch: room.authorityEpoch
        });
        this.onHostMigrated?.({
          previousHostPlayerId,
          hostPlayerId: room.hostPlayerId,
          authorityEpoch: room.authorityEpoch,
          checkpoint: payload.checkpoint || null,
          becameHost: local?.isHost === true,
          reason: 'reconnect-welcome'
        });
      }

      if (localRunWasActive && room.status !== 'in-run') {
        this.onRunEnded?.({
          reason: 'reconnected-after-run-ended',
          endedByPlayerId: null,
          room
        });
      }

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
      const previousHostPlayerId = this.session.hostPlayerId;
      const previousEpoch = this.lastAuthorityEpoch;
      const mode = local?.isHost ? SESSION_MODES.HOST : SESSION_MODES.CLIENT;
      this.session.updateOnlineAuthority?.({
        mode,
        hostPlayerId: payload.room.hostPlayerId,
        authorityEpoch: payload.room.authorityEpoch
      });

      this.runtime.room.replaceFromSnapshot(payload.room, 'server-room-state');
      this.runtime.handleHostMigration?.({
        authorityEpoch: payload.room.authorityEpoch,
        hostPlayerId: payload.room.hostPlayerId
      });
      this.lastAuthorityEpoch = Math.max(
        this.lastAuthorityEpoch,
        Number(payload.room.authorityEpoch) || 0
      );

      if (
        this.session.run?.active === true
        && payload.room.status === 'in-run'
        && (
          previousHostPlayerId !== payload.room.hostPlayerId
          || previousEpoch !== this.lastAuthorityEpoch
        )
      ) {
        this.onHostMigrated?.({
          previousHostPlayerId,
          hostPlayerId: payload.room.hostPlayerId,
          authorityEpoch: payload.room.authorityEpoch,
          checkpoint: payload.checkpoint || null,
          becameHost: local?.isHost === true,
          reason: 'room-state-authority-change'
        });
      }

      if (
        this.session.run?.active === true
        && payload.room.status !== 'in-run'
      ) {
        this.onRunEnded?.({
          reason: 'room-returned-to-lobby',
          endedByPlayerId: null,
          room: payload.room
        });
      }

      this.render();
      return;
    }

    if (action === 'start-run') {
      const start = {
        runId: payload.runId,
        mapId: payload.mapId,
        difficulty: Number(payload.difficulty) || 1,
        roomCode: payload.roomCode,
        authorityEpoch: payload.authorityEpoch || this.room?.authorityEpoch || 0,
        resume: false,
        checkpoint: null
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

    if (action === 'host-migrated') {
      const room = payload.room || this.room;
      if (room) {
        this.connected = true;
        this.room = room;
        this.runtime.room.replaceFromSnapshot(room, 'server-host-migrated');
      }

      const local = room?.players?.find(
        (entry) => entry?.playerId === this.localPlayerId
      );
      const mode = local?.isHost ? SESSION_MODES.HOST : SESSION_MODES.CLIENT;
      const previousHostPlayerId = payload.previousHostPlayerId
        || this.session.hostPlayerId
        || null;

      this.session.updateOnlineAuthority?.({
        mode,
        hostPlayerId: payload.hostPlayerId || room?.hostPlayerId,
        authorityEpoch: payload.authorityEpoch || room?.authorityEpoch
      });
      this.runtime.handleHostMigration?.({
        authorityEpoch: payload.authorityEpoch || room?.authorityEpoch,
        hostPlayerId: payload.hostPlayerId || room?.hostPlayerId
      });
      this.lastAuthorityEpoch = Math.max(
        this.lastAuthorityEpoch,
        Number(payload.authorityEpoch || room?.authorityEpoch) || 0
      );

      this.onHostMigrated?.({
        previousHostPlayerId,
        hostPlayerId: payload.hostPlayerId || room?.hostPlayerId || null,
        authorityEpoch: payload.authorityEpoch || room?.authorityEpoch || 0,
        checkpoint: payload.checkpoint || null,
        becameHost: local?.isHost === true,
        reason: String(payload.reason || 'host-disconnected')
      });
      this.render();
      return;
    }

    if (action === 'run-ended') {
      if (payload.room) {
        this.connected = true;
        this.room = payload.room;
        this.runtime.room.replaceFromSnapshot(
          payload.room,
          'server-run-ended'
        );
      }

      this.onRunEnded?.({
        reason: String(payload.reason || 'ended'),
        endedByPlayerId: payload.endedByPlayerId || null,
        room: this.room
      });
      this.render();
      return;
    }

    
    if (action === 'kicked') {
      const message = String(
        payload.message || 'REMOVED FROM ROOM BY HOST'
      ).toUpperCase();
      void this.transport.disconnect('kicked', {
        fallbackLocal: true
      });
      this.finishLeave();
      this.error = message;
      this.ui?.open();
      this.render();
      return;
    }

if (action === 'left-room') {
            const resolveLeave = this.pendingLeaveResolver;
            this.pendingLeaveResolver = null;
            resolveLeave?.();
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

  notifyPlayerDied(reason = 'death') {
    if (!this.connected || this.room?.status !== 'in-run') return false;
    return this.transport.sendControl('player-death', {
      reason: String(reason || 'death')
    });
  }

  
  kickPlayer(playerId) {
    if (!this.connected) return false;
    return this.transport.sendControl('kick-player', {
      playerId: String(playerId || '').slice(0, 160)
    });
  }

  transferHost(playerId) {
    if (!this.connected) return false;
    return this.transport.sendControl('transfer-host', {
      playerId: String(playerId || '').slice(0, 160)
    });
  }

openLobby() {
    this.ui?.open();
    this.render();
  }

  async leaveRoom() {
        const acknowledged = new Promise((resolve) => {
            this.pendingLeaveResolver = resolve;
            setTimeout(() => {
                if (this.pendingLeaveResolver !== resolve) return;
                this.pendingLeaveResolver = null;
                resolve();
            }, 750);
        });
        try {
            this.transport.sendControl('leave', { reason: 'manual' });
            await acknowledged;
        } finally {
            this.pendingLeaveResolver = null;
            await this.transport.disconnect('left-room', { fallbackLocal: true });
            this.finishLeave();
        }
    }

  finishLeave() {
    cancelMultiplayerRefreshResumeWatchdog({
      reason: 'multiplayer-room-left'
    });
    this.connected = false;
    this.room = null;
    this.error = null;
    this.lastAuthorityEpoch = 0;
    this.session.returnToLocalSession({
      hostPlayerId: this.localPlayerId
    });
    this.runtime.resetToLocalRoom();
    this.onLeftRoom?.();
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
            lastRoom: this.lastRoom || loadLastRoom(),
            localPlayerId: this.localPlayerId,
      error: this.error
    });
  }

  getSnapshot() {
    return {
      connected: this.connected,
      room: this.room,
            lastRoom: this.lastRoom || loadLastRoom(),
            error: this.error,
      transport: this.transport.getConnectionSnapshot()
    };
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
  }
}
