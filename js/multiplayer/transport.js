// js/multiplayer/transport.js
import { MULTIPLAYER_EVENTS } from './event_bus.js';

export const TRANSPORT_STATES = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
});

// M1.1 intentionally uses a no-network transport. Future WebSocket/WebRTC
// transports can implement the same interface without changing game systems.
export class NullMultiplayerTransport {
  constructor({ eventBus } = {}) {
    this.eventBus = eventBus;
    this.state = TRANSPORT_STATES.DISCONNECTED;
  }

  getState() {
    return this.state;
  }

  async connect() {
    this.setState(TRANSPORT_STATES.CONNECTED, { mode: 'local-only' });
    return true;
  }

  async disconnect(reason = 'manual') {
    this.setState(TRANSPORT_STATES.DISCONNECTED, { reason });
    return true;
  }

  send(type, payload = {}) {
    if (this.state !== TRANSPORT_STATES.CONNECTED) return false;

    this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_MESSAGE, {
      direction: 'local-loopback',
      type,
      payload
    });

    return true;
  }

  setState(nextState, details = {}) {
    if (this.state === nextState) return;

    const previousState = this.state;
    this.state = nextState;

    this.eventBus?.emit(MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED, {
      previousState,
      state: nextState,
      details
    });
  }
}
