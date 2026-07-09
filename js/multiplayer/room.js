// js/multiplayer/room.js

import { MULTIPLAYER_EVENTS } from './event_bus.js';

export const ROOM_STATUS = Object.freeze({
  WAITING: 'waiting',
  COUNTDOWN: 'countdown',
  IN_RUN: 'in-run',
  CLOSED: 'closed'
});

function makeRoomId() {
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `room-${randomPart}`;
}

function serializePlayer(player) {
  return {
    playerId: player.playerId,
    displayName: player.displayName || 'Player',
    ready: player.ready === true,
    connected: player.connected !== false,
    isHost: player.isHost === true
  };
}

export class MultiplayerRoomState {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.roomId = null;
    this.roomCode = null;
    this.status = ROOM_STATUS.CLOSED;
    this.hostPlayerId = null;
    this.players = new Map();
    this.settings = {
      maxPlayers: 4,
      mapId: 'grid_bunker',
      difficulty: 1,
      privacy: 'private'
    };
    this.runId = null;
    this.authorityEpoch = 0;
    this.revision = 0;
    this.finalSummary = null;
  }

  createLocalRoom({
    hostPlayer,
    mapId = 'grid_bunker',
    difficulty = 1,
    maxPlayers = 4
  } = {}) {
    if (!hostPlayer?.playerId) {
      throw new TypeError('createLocalRoom requires a host player snapshot.');
    }

    this.roomId = makeRoomId();
    this.roomCode = null;
    this.status = ROOM_STATUS.WAITING;
    this.hostPlayerId = hostPlayer.playerId;
    this.runId = null;
    this.authorityEpoch = 0;
    this.finalSummary = null;
    this.players.clear();
    this.settings = {
      ...this.settings,
      mapId,
      difficulty: Number(difficulty) || 1,
      maxPlayers: Math.max(1, Math.min(4, Math.floor(maxPlayers) || 4))
    };

    this.players.set(hostPlayer.playerId, {
      ...hostPlayer,
      ready: true,
      connected: true,
      isHost: true
    });

    return this.commit('created');
  }

  addPlayer(player) {
    if (!this.roomId || !player?.playerId) return null;
    if (
      this.players.size >= this.settings.maxPlayers
      && !this.players.has(player.playerId)
    ) {
      return null;
    }

    this.players.set(player.playerId, {
      ...player,
      ready: player.ready === true,
      connected: player.connected !== false,
      isHost: player.playerId === this.hostPlayerId
    });

    return this.commit('player-added');
  }

  removePlayer(playerId) {
    if (!this.players.has(playerId)) return false;
    this.players.delete(playerId);

    if (playerId === this.hostPlayerId) {
      const nextHost = Array.from(this.players.values())
        .find((player) => player.connected !== false) || null;
      this.hostPlayerId = nextHost?.playerId || null;
      if (nextHost) nextHost.isHost = true;
    }

    this.commit('player-removed');
    return true;
  }

  setPlayerReady(playerId, ready) {
    const player = this.players.get(playerId);
    if (!player) return false;
    player.ready = ready === true;
    this.commit('ready-changed');
    return true;
  }

  updateSettings(nextSettings = {}, requesterPlayerId = this.hostPlayerId) {
    if (requesterPlayerId !== this.hostPlayerId) return false;
    if (this.status === ROOM_STATUS.IN_RUN) return false;

    if (nextSettings.mapId) this.settings.mapId = String(nextSettings.mapId);
    if (nextSettings.difficulty !== undefined) {
      this.settings.difficulty = Number(nextSettings.difficulty) || 1;
    }
    if (nextSettings.maxPlayers !== undefined) {
      this.settings.maxPlayers = Math.max(
        this.players.size,
        Math.min(4, Math.floor(nextSettings.maxPlayers) || 4)
      );
    }
    if (nextSettings.privacy) {
      this.settings.privacy = String(nextSettings.privacy);
    }

    this.commit('settings-changed');
    return true;
  }

  beginRun({ runId = null, mapId, difficulty } = {}) {
    if (!this.roomId) return null;
    if (mapId) this.settings.mapId = mapId;
    if (difficulty !== undefined) {
      this.settings.difficulty = Number(difficulty) || 1;
    }
    this.runId = runId || this.runId;
    this.status = ROOM_STATUS.IN_RUN;
    this.finalSummary = null;
    return this.commit('run-started');
  }

  endRun() {
    if (!this.roomId || this.status === ROOM_STATUS.CLOSED) return null;
    this.status = ROOM_STATUS.WAITING;
    this.runId = null;
    return this.commit('run-ended');
  }

  close() {
    this.status = ROOM_STATUS.CLOSED;
    this.runId = null;
    this.finalSummary = null;
    return this.commit('closed');
  }

  replaceFromSnapshot(snapshot, reason = 'remote-sync') {
    if (!snapshot?.roomId || !Array.isArray(snapshot.players)) return false;

    this.roomId = snapshot.roomId;
    this.roomCode = snapshot.roomCode || null;
    this.status = Object.values(ROOM_STATUS).includes(snapshot.status)
      ? snapshot.status
      : ROOM_STATUS.WAITING;
    this.hostPlayerId = snapshot.hostPlayerId || null;
    this.settings = { ...this.settings, ...(snapshot.settings || {}) };
    this.runId = snapshot.runId || null;
    this.finalSummary = snapshot.finalSummary || null;
    this.authorityEpoch = Math.max(
      0,
      Math.floor(Number(snapshot.authorityEpoch) || 0)
    );
    this.revision = Math.max(this.revision, Number(snapshot.revision) || 0);
    this.players.clear();

    snapshot.players.forEach((player) => {
      if (player?.playerId) this.players.set(player.playerId, { ...player });
    });

    this.emitChange(reason);
    return true;
  }

  commit(reason) {
    this.revision += 1;
    const snapshot = this.getSnapshot();
    this.emitChange(reason, snapshot);
    return snapshot;
  }

  emitChange(reason, snapshot = this.getSnapshot()) {
    this.eventBus?.emit(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, {
      reason,
      room: snapshot
    });
  }

  getSnapshot() {
    return {
      roomId: this.roomId,
      roomCode: this.roomCode,
      status: this.status,
      hostPlayerId: this.hostPlayerId,
      settings: { ...this.settings },
      players: Array.from(this.players.values(), serializePlayer),
      runId: this.runId,
      authorityEpoch: this.authorityEpoch,
      revision: this.revision,
      finalSummary: this.finalSummary
    };
  }
}
