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
    this.hostPlayerId = hostPlayerId || this.hostPlayerId;
    this.setStatus(SESSION_STATUS.READY, { mode: this.mode });
    return this.getSnapshot();
  }

  beginRun({ mapId = 'grid_bunker', difficulty = 1, fromRespawn = false } = {}) {
    if (this.run?.active) {
      this.endRun({ reason: 'restarted' });
    }

    this.run = {
      runId: makeId('run'),
      active: true,
      mapId,
      difficulty: Number(difficulty) || 1,
      fromRespawn: fromRespawn === true,
      startedAt: performance.now(),
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
    this.run.endedAt = performance.now();
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
