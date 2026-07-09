// js/multiplayer/player_registry.js
import { MULTIPLAYER_EVENTS } from './event_bus.js';

const DEFAULT_SYNC_INTERVAL_MS = 50;
const POSITION_EPSILON = 0.0025;
const ROTATION_EPSILON = 0.0005;

function vectorSnapshot(vector) {
  return {
    x: Number(vector?.x || 0),
    y: Number(vector?.y || 0),
    z: Number(vector?.z || 0)
  };
}

function weaponKey(player) {
  const weapon = player?.inventory?.[player.currentWeaponIdx];
  return weapon?.key || weapon?.name || null;
}

function capturePlayerState(player) {
  return {
    position: vectorSnapshot(player?.pos),
    velocity: vectorSnapshot(player?.vel),
    yaw: Number(player?.yaw || 0),
    pitch: Number(player?.pitch || 0),
    onGround: player?.onGround === true,
    health: Number(player?.health || 0),
    maxHealth: Number(player?.maxHealth || 0),
    alive: player?.alive === true,
    kills: Number(player?.kills || 0),
    score: Number(player?.score || 0),
    instaKillTimer: Number(player?.instaKillTimer || 0),
    doublePointsTimer: Number(player?.doublePointsTimer || 0),
    isADS: player?.isADS === true,
    isSprinting: player?.isSprinting === true,
    reloading: player?.reloading === true,
    currentWeaponIdx: Number(player?.currentWeaponIdx || 0),
    weaponKey: weaponKey(player)
  };
}

function approximatelyEqual(a, b, epsilon) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= epsilon;
}

function vectorsEqual(a, b, epsilon) {
  return approximatelyEqual(a?.x, b?.x, epsilon)
    && approximatelyEqual(a?.y, b?.y, epsilon)
    && approximatelyEqual(a?.z, b?.z, epsilon);
}

function statesEqual(a, b) {
  if (!a || !b) return false;

  return vectorsEqual(a.position, b.position, POSITION_EPSILON)
    && vectorsEqual(a.velocity, b.velocity, POSITION_EPSILON)
    && approximatelyEqual(a.yaw, b.yaw, ROTATION_EPSILON)
    && approximatelyEqual(a.pitch, b.pitch, ROTATION_EPSILON)
    && a.onGround === b.onGround
    && a.health === b.health
    && a.maxHealth === b.maxHealth
    && a.alive === b.alive
    && a.kills === b.kills
    && a.score === b.score
    && a.instaKillTimer === b.instaKillTimer
    && a.doublePointsTimer === b.doublePointsTimer
    && a.isADS === b.isADS
    && a.isSprinting === b.isSprinting
    && a.reloading === b.reloading
    && a.currentWeaponIdx === b.currentWeaponIdx
    && a.weaponKey === b.weaponKey;
}

export class MultiplayerPlayerRegistry {
  constructor({ eventBus, syncIntervalMs = DEFAULT_SYNC_INTERVAL_MS } = {}) {
    this.eventBus = eventBus;
    this.syncIntervalMs = syncIntervalMs;
    this.players = new Map();
    this.localPlayerId = null;
  }

  registerLocalPlayer(livePlayer, {
    playerId,
    displayName = 'Player 1'
  } = {}) {
    if (!livePlayer || typeof livePlayer !== 'object') {
      throw new TypeError('registerLocalPlayer requires the live player object.');
    }

    if (!playerId) {
      throw new TypeError('registerLocalPlayer requires a playerId.');
    }

    this.localPlayerId = playerId;

    const record = {
      playerId,
      displayName,
      isLocal: true,
      connected: true,
      livePlayer,
      state: capturePlayerState(livePlayer),
      lastSyncAt: -Infinity
    };

    this.players.set(playerId, record);
    this.eventBus?.emit(MULTIPLAYER_EVENTS.PLAYER_JOINED, this.serializeRecord(record));
    return this.serializeRecord(record);
  }

  removePlayer(playerId, reason = 'left') {
    const record = this.players.get(playerId);
    if (!record) return false;

    this.players.delete(playerId);
    if (this.localPlayerId === playerId) this.localPlayerId = null;

    this.eventBus?.emit(MULTIPLAYER_EVENTS.PLAYER_LEFT, {
      playerId,
      reason
    });

    return true;
  }

  syncLocalPlayer(livePlayer, now = performance.now(), { force = false } = {}) {
    const record = this.players.get(this.localPlayerId);
    if (!record) return null;

    if (livePlayer && record.livePlayer !== livePlayer) {
      record.livePlayer = livePlayer;
    }

    if (!force && now - record.lastSyncAt < this.syncIntervalMs) {
      return record.state;
    }

    const nextState = capturePlayerState(record.livePlayer);
    record.lastSyncAt = now;

    if (!force && statesEqual(record.state, nextState)) {
      return record.state;
    }

    record.state = nextState;

    this.eventBus?.emit(MULTIPLAYER_EVENTS.PLAYER_STATE_CHANGED, {
      playerId: record.playerId,
      isLocal: true,
      state: nextState
    });

    return nextState;
  }

  getLocalPlayerSnapshot() {
    const record = this.players.get(this.localPlayerId);
    return record ? this.serializeRecord(record) : null;
  }

  getPlayersSnapshot() {
    return Array.from(this.players.values(), (record) => this.serializeRecord(record));
  }

  serializeRecord(record) {
    return {
      playerId: record.playerId,
      displayName: record.displayName,
      isLocal: record.isLocal,
      connected: record.connected,
      state: record.state
    };
  }
}
