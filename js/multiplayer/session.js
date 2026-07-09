// js/multiplayer/session.js

import { MULTIPLAYER_EVENTS } from './event_bus.js';

const CLIENT_ID_STORAGE_KEY = 'ka_multiplayer_client_id';

function makeId(prefix) {
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomPart}`;
}

function readOrCreateClientId() {
  try {
    const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;

    const created = makeId('client');
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return makeId('client');
  }
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export const SESSION_MODES = Object.freeze({
  SINGLEPLAYER: 'singleplayer',
  HOST: 'host',
  CLIENT: 'client'
});

export const SESSION_STATUS = Object.freeze({
  IDLE: 'idle',
  READY: 'ready',
  IN_RUN: 'in-run',
  ENDED: 'ended'
});

export class MultiplayerSession {
  constructor({ eventBus, transport } = {}) {
    this.eventBus = eventBus;
    this.transport = transport;
    this.clientId = readOrCreateClientId();
    this.sessionId = makeId('session');
    this.mode = SESSION_MODES.SINGLEPLAYER;
    this.status = SESSION_STATUS.IDLE;
    this.roomId = null;
    this.hostPlayerId = null;
    this.run = null;

    this.eventBus?.emit(MULTIPLAYER_EVENTS.SESSION_CREATED, this.getSnapshot());
  }

  initializeLocalSession({ hostPlayerId } = {}) {
    this.mode = SESSION_MODES.SINGLEPLAYER;
    this.roomId = null;
    this.hostPlayerId = hostPlayerId || this.hostPlayerId;
    this.setStatus(SESSION_STATUS.READY, { mode: this.mode });
    return this.getSnapshot();
  }

  configureOnlineSession({
    mode,
    roomId,
    sessionId,
    hostPlayerId,
    preserveRun = false
  } = {}) {
    if (![SESSION_MODES.HOST, SESSION_MODES.CLIENT].includes(mode)) {
      throw new TypeError('Online session mode must be host or client.');
    }
    if (!roomId || !sessionId) {
      throw new TypeError('Online session requires roomId and sessionId.');
    }

    const previousSessionId = this.sessionId;
    this.mode = mode;
    this.roomId = String(roomId);
    this.sessionId = String(sessionId);
    this.hostPlayerId = hostPlayerId || null;
    if (!preserveRun) this.run = null;

    this.setStatus(
      preserveRun && this.run?.active
        ? SESSION_STATUS.IN_RUN
        : SESSION_STATUS.READY,
      {
        mode,
        roomId: this.roomId,
        previousSessionId,
        preserveRun
      }
    );

    return this.getSnapshot();
  }


  updateOnlineAuthority({
    mode,
    hostPlayerId,
    authorityEpoch = 0
  } = {}) {
    if ([SESSION_MODES.HOST, SESSION_MODES.CLIENT].includes(mode)) {
      this.mode = mode;
    }
    this.hostPlayerId = hostPlayerId || null;
    if (this.run) {
      this.run.authorityEpoch = Math.max(
        0,
        Math.floor(Number(authorityEpoch) || 0)
      );
    }
    return this.getSnapshot();
  }

  restoreOnlineRun({
    runId,
    mapId = 'grid_bunker',
    difficulty = 1,
    authorityEpoch = 0
  } = {}) {
    if (!runId) return this.getSnapshot();
    this.run = {
      runId: String(runId),
      active: true,
      mapId,
      difficulty: Number(difficulty) || 1,
      fromRespawn: false,
      authorityEpoch: Math.max(0, Math.floor(Number(authorityEpoch) || 0)),
      resumed: true,
      startedAt: nowMs(),
      endedAt: null,
      endReason: null
    };
    this.setStatus(SESSION_STATUS.IN_RUN, {
      runId: this.run.runId,
      resumed: true
    });
    return this.getSnapshot();
  }

  returnToLocalSession({ hostPlayerId } = {}) {
    const previous = this.getSnapshot();
    this.mode = SESSION_MODES.SINGLEPLAYER;
    this.roomId = null;
    this.sessionId = makeId('session');
    this.hostPlayerId = hostPlayerId || this.hostPlayerId;
    this.run = null;
    this.setStatus(SESSION_STATUS.READY, {
      mode: this.mode,
      previousRoomId: previous.roomId
    });
    return this.getSnapshot();
  }

  beginRun({
    runId = null,
    mapId = 'grid_bunker',
    difficulty = 1,
    fromRespawn = false
  } = {}) {
    if (this.run?.active) {
      this.endRun({ reason: 'restarted' });
    }

    this.run = {
      runId: runId || makeId('run'),
      active: true,
      mapId,
      difficulty: Number(difficulty) || 1,
      fromRespawn: fromRespawn === true,
      authorityEpoch: 0,
      resumed: false,
      startedAt: nowMs(),
      endedAt: null,
      endReason: null
    };

    this.setStatus(SESSION_STATUS.IN_RUN, { runId: this.run.runId });
    this.eventBus?.emit(MULTIPLAYER_EVENTS.RUN_STARTED, this.getSnapshot());
    return this.getSnapshot();
  }

  endRun({ reason = 'ended', playerSnapshot = null } = {}) {
    if (!this.run?.active) return this.getSnapshot();

    this.run.active = false;
    this.run.endedAt = nowMs();
    this.run.endReason = String(reason || 'ended');

    this.eventBus?.emit(MULTIPLAYER_EVENTS.RUN_ENDED, {
      session: this.getSnapshot(),
      player: playerSnapshot
    });

    this.setStatus(SESSION_STATUS.READY, {
      runId: this.run.runId,
      reason: this.run.endReason
    });

    return this.getSnapshot();
  }

  setStatus(nextStatus, details = {}) {
    if (this.status === nextStatus) return;

    const previousStatus = this.status;
    this.status = nextStatus;
    this.eventBus?.emit(MULTIPLAYER_EVENTS.SESSION_STATUS_CHANGED, {
      previousStatus,
      status: nextStatus,
      details,
      sessionId: this.sessionId
    });
  }

  getSnapshot() {
    return {
      clientId: this.clientId,
      sessionId: this.sessionId,
      mode: this.mode,
      status: this.status,
      roomId: this.roomId,
      hostPlayerId: this.hostPlayerId,
      run: this.run ? { ...this.run } : null
    };
  }
}
