// js/multiplayer/runtime.js

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import {
  MULTIPLAYER_MESSAGE_TYPES,
  createProtocolEnvelope,
  validateProtocolEnvelope
} from './protocol.js';
import { MultiplayerCommandStream } from './command_stream.js';
import { RemoteSnapshotBuffer } from './snapshot_buffer.js';
import { MultiplayerRoomState } from './room.js';
import { TRANSPORT_MODES } from './transport.js';

export const MULTIPLAYER_RUNTIME_EVENTS = Object.freeze({
  PROTOCOL_REJECTED: 'multiplayer:protocol-rejected',
  LOCAL_COMMAND_SENT: 'multiplayer:local-command-sent',
  LOCAL_ACTION_SENT: 'multiplayer:local-action-sent',
  REMOTE_COMMAND_RECEIVED: 'multiplayer:remote-command-received',
  REMOTE_ACTION_RECEIVED: 'multiplayer:remote-action-received',
  REMOTE_SNAPSHOT_RECEIVED: 'multiplayer:remote-snapshot-received'
});

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export class MultiplayerRuntime {
  constructor({
    eventBus,
    transport,
    session,
    players,
    commandSendIntervalMs = 1000 / 30,
    snapshotInterpolationDelayMs = 100
  } = {}) {
    this.eventBus = eventBus;
    this.transport = transport;
    this.session = session;
    this.players = players;
    this.commandStream = new MultiplayerCommandStream({
      sendIntervalMs: commandSendIntervalMs
    });
    this.remoteSnapshots = new RemoteSnapshotBuffer({
      interpolationDelayMs: snapshotInterpolationDelayMs
    });
    this.room = new MultiplayerRoomState({ eventBus });
    this.initialized = false;
    this.localPlayerId = null;
    this.snapshotSequence = 0;
    this.roomSequence = 0;
    this.unsubscribe = [];
    this.lastRemoteCommands = new Map();
    this.remoteActions = [];
    this.metrics = {
      envelopesSent: 0,
      envelopesAccepted: 0,
      envelopesRejected: 0,
      loopbackIgnored: 0,
      staleSnapshotsRejected: 0
    };
  }

  initialize({ localPlayerId } = {}) {
    if (this.initialized) return this.getSnapshot();

    this.localPlayerId = localPlayerId || this.players?.localPlayerId || null;

    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_EVENTS.PLAYER_STATE_CHANGED, (event) => {
        const payload = event?.payload;
        if (!payload?.isLocal || !payload?.state) return;
        this.sendPlayerSnapshot(payload.state);
      }) || (() => {})
    );

    this.unsubscribe.push(
      this.eventBus?.on(MULTIPLAYER_EVENTS.TRANSPORT_MESSAGE, (event) => {
        this.handleTransportMessage(event?.payload);
      }) || (() => {})
    );

    const localPlayer = this.players?.getLocalPlayerSnapshot?.();
    if (localPlayer) {
      this.room.createLocalRoom({
        hostPlayer: localPlayer,
        mapId: this.session?.run?.mapId || 'grid_bunker',
        difficulty: this.session?.run?.difficulty || 1
      });
      this.sendRoomState();
    }

    this.initialized = true;
    return this.getSnapshot();
  }

  resetToLocalRoom() {
    this.remoteSnapshots.clear();
    this.lastRemoteCommands.clear();
    this.remoteActions.length = 0;

    const localPlayer = this.players?.getLocalPlayerSnapshot?.();
    if (localPlayer) {
      this.room.createLocalRoom({
        hostPlayer: localPlayer,
        mapId: 'grid_bunker',
        difficulty: 1
      });
    }

    return this.room.getSnapshot();
  }

  beginRun(sessionSnapshot = this.session?.getSnapshot?.()) {
    const run = sessionSnapshot?.run || null;
    this.commandStream.beginRun(run?.runId || null);
    this.snapshotSequence = 0;
    this.remoteSnapshots.clear();
    this.lastRemoteCommands.clear();
    this.remoteActions.length = 0;
    this.room.beginRun({
      runId: run?.runId,
      mapId: run?.mapId,
      difficulty: run?.difficulty
    });
    this.sendRoomState();
  }

  endRun() {
    this.commandStream.endRun();
    this.room.endRun();
    this.sendRoomState();
  }

  captureFrame({
    frameKeys,
    player,
    dt,
    lookDeltaX,
    lookDeltaY,
    now = nowMs()
  } = {}) {
    if (!this.initialized || !this.session?.run?.active) {
      return { command: null, actions: [] };
    }

    const captured = this.commandStream.capture({
      frameKeys,
      player,
      dt,
      lookDeltaX,
      lookDeltaY,
      now
    });

    if (captured.command) {
      const envelope = this.sendEnvelope(
        MULTIPLAYER_MESSAGE_TYPES.INPUT_COMMAND,
        captured.command,
        captured.command.sequence
      );
      this.eventBus?.emit(MULTIPLAYER_RUNTIME_EVENTS.LOCAL_COMMAND_SENT, {
        envelope
      });
    }

    captured.actions.forEach((action) => {
      const envelope = this.sendEnvelope(
        MULTIPLAYER_MESSAGE_TYPES.GAMEPLAY_ACTION,
        action,
        action.sequence
      );
      this.eventBus?.emit(MULTIPLAYER_RUNTIME_EVENTS.LOCAL_ACTION_SENT, {
        envelope
      });
    });

    return captured;
  }

  sendPlayerSnapshot(state) {
    if (!this.initialized || !this.session?.run?.active || !state) return null;
    this.snapshotSequence += 1;
    return this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.PLAYER_SNAPSHOT,
      { state },
      this.snapshotSequence
    );
  }

  sendRoomState() {
    if (!this.room.roomId) return null;
    if (this.transport?.getMode?.() === TRANSPORT_MODES.ONLINE) return null;

    this.roomSequence += 1;
    return this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.ROOM_STATE,
      { room: this.room.getSnapshot() },
      this.roomSequence,
      { runId: this.session?.run?.runId || null }
    );
  }

  sendEnvelope(type, payload, sequence, overrides = {}) {
    const sessionSnapshot = this.session?.getSnapshot?.() || {};
    const envelope = createProtocolEnvelope({
      type,
      sessionId: sessionSnapshot.sessionId,
      runId: overrides.runId !== undefined
        ? overrides.runId
        : sessionSnapshot.run?.runId || null,
      playerId: overrides.playerId !== undefined
        ? overrides.playerId
        : this.localPlayerId,
      sequence,
      payload,
      sentAt: nowMs()
    });

    if (this.transport?.send(type, envelope)) {
      this.metrics.envelopesSent += 1;
    }

    return envelope;
  }

  handleTransportMessage(message) {
    const envelope = message?.payload;
    if (!envelope) return;

    const validation = validateProtocolEnvelope(envelope, {
      expectedSessionId: this.session?.sessionId || null
    });

    if (!validation.ok) {
      this.metrics.envelopesRejected += 1;
      this.eventBus?.emit(MULTIPLAYER_RUNTIME_EVENTS.PROTOCOL_REJECTED, {
        errors: validation.errors,
        candidate: envelope
      });
      return;
    }

    if (envelope.playerId && envelope.playerId === this.localPlayerId) {
      this.metrics.loopbackIgnored += 1;
      return;
    }

    this.ingestRemoteEnvelope(envelope);
  }

  ingestRemoteEnvelope(envelope) {
    const validation = validateProtocolEnvelope(envelope, {
      expectedSessionId: this.session?.sessionId || null
    });

    if (!validation.ok) {
      this.metrics.envelopesRejected += 1;
      return { accepted: false, errors: validation.errors };
    }

    this.metrics.envelopesAccepted += 1;

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.PLAYER_SNAPSHOT) {
      const receivedAt = nowMs();
      const result = this.remoteSnapshots.push(envelope.playerId, {
        sequence: envelope.sequence,
        // Remote performance.now() clocks are not comparable. Place snapshots
        // on the local receive timeline before interpolation.
        sentAt: receivedAt,
        receivedAt,
        state: envelope.payload?.state
      });

      if (!result.accepted && result.reason === 'stale-sequence') {
        this.metrics.staleSnapshotsRejected += 1;
      }

      if (result.accepted) {
        this.eventBus?.emit(MULTIPLAYER_RUNTIME_EVENTS.REMOTE_SNAPSHOT_RECEIVED, {
          envelope
        });
      }

      return result;
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.INPUT_COMMAND) {
      this.lastRemoteCommands.set(envelope.playerId, envelope.payload);
      this.eventBus?.emit(MULTIPLAYER_RUNTIME_EVENTS.REMOTE_COMMAND_RECEIVED, {
        envelope
      });
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.GAMEPLAY_ACTION) {
      this.remoteActions.push(envelope);
      if (this.remoteActions.length > 128) this.remoteActions.shift();
      this.eventBus?.emit(MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ACTION_RECEIVED, {
        envelope
      });
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.ROOM_STATE) {
      return {
        accepted: this.room.replaceFromSnapshot(
          envelope.payload?.room,
          'protocol-room-sync'
        )
      };
    }

    return { accepted: true };
  }

  sampleRemotePlayer(playerId, now = nowMs()) {
    return this.remoteSnapshots.sample(playerId, now);
  }

  removeRemotePlayer(playerId) {
    this.remoteSnapshots.removePlayer(playerId);
    this.lastRemoteCommands.delete(playerId);
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      localPlayerId: this.localPlayerId,
      commandStream: this.commandStream.getSnapshot(),
      remoteSnapshots: this.remoteSnapshots.getSnapshot(),
      room: this.room.getSnapshot(),
      remoteCommandPlayers: Array.from(this.lastRemoteCommands.keys()),
      queuedRemoteActions: this.remoteActions.length,
      metrics: { ...this.metrics }
    };
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
    this.remoteSnapshots.clear();
    this.initialized = false;
  }
}
