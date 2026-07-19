// js/multiplayer/event_bus.js

export const MULTIPLAYER_EVENTS = Object.freeze({
  SESSION_CREATED: 'multiplayer:session-created',
  SESSION_STATUS_CHANGED: 'multiplayer:session-status-changed',
  RUN_STARTED: 'multiplayer:run-started',
  RUN_ENDED: 'multiplayer:run-ended',
  PLAYER_JOINED: 'multiplayer:player-joined',
  PLAYER_LEFT: 'multiplayer:player-left',
  PLAYER_STATE_CHANGED: 'multiplayer:player-state-changed',
  ROOM_STATE_CHANGED: 'multiplayer:room-state-changed',
  TRANSPORT_STATE_CHANGED: 'multiplayer:transport-state-changed',
  TRANSPORT_PATH_CHANGED: 'multiplayer:transport-path-changed',
  TRANSPORT_MESSAGE: 'multiplayer:transport-message',
  TRANSPORT_CONTROL: 'multiplayer:transport-control',
  TRANSPORT_ERROR: 'multiplayer:transport-error'
});

function makeEventId(sequence) {
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `ka-event-${sequence}-${randomPart}`;
}

function eventTime() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export class MultiplayerEventBus {
  constructor({ sourceIdProvider = () => 'local' } = {}) {
    this.listeners = new Map();
    this.sequence = 0;
    this.sourceIdProvider = sourceIdProvider;
  }

  on(type, listener) {
    if (typeof type !== 'string' || !type) {
      throw new TypeError('MultiplayerEventBus.on requires a non-empty event type.');
    }
    if (typeof listener !== 'function') {
      throw new TypeError('MultiplayerEventBus.on requires a listener function.');
    }

    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    const bucket = this.listeners.get(type);
    bucket.add(listener);
    return () => this.off(type, listener);
  }

  once(type, listener) {
    const unsubscribe = this.on(type, (event) => {
      unsubscribe();
      listener(event);
    });
    return unsubscribe;
  }

  off(type, listener) {
    const bucket = this.listeners.get(type);
    if (!bucket) return false;

    const removed = bucket.delete(listener);
    if (bucket.size === 0) this.listeners.delete(type);
    return removed;
  }

  emit(type, payload = {}, meta = {}) {
    if (typeof type !== 'string' || !type) {
      throw new TypeError('MultiplayerEventBus.emit requires a non-empty event type.');
    }

    this.sequence += 1;
    const event = Object.freeze({
      eventId: makeEventId(this.sequence),
      type,
      sequence: this.sequence,
      timestamp: eventTime(),
      sourceId: meta.sourceId || this.sourceIdProvider() || 'local',
      payload
    });

    const listeners = [
      ...(this.listeners.get(type) || []),
      ...(this.listeners.get('*') || [])
    ];

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error(`[MultiplayerEventBus] Listener failed for ${type}.`, error);
      }
    });

    return event;
  }

  clear() {
    this.listeners.clear();
  }
}
