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
  REMOTE_SNAPSHOT_RECEIVED: 'multiplayer:remote-snapshot-received',
  REMOTE_WORLD_SNAPSHOT_RECEIVED: 'multiplayer:remote-world-snapshot-received',
  REMOTE_ENEMY_HIT_RECEIVED: 'multiplayer:remote-enemy-hit-received',
  REMOTE_PLAYER_DAMAGE_RECEIVED: 'multiplayer:remote-player-damage-received',
  REMOTE_ECONOMY_REQUEST_RECEIVED: 'multiplayer:remote-economy-request-received',
  REMOTE_ECONOMY_RESULT_RECEIVED: 'multiplayer:remote-economy-result-received',
  REMOTE_ECONOMY_SNAPSHOT_RECEIVED: 'multiplayer:remote-economy-snapshot-received',
  REMOTE_REVIVE_STATE_RECEIVED: 'multiplayer:remote-revive-state-received',
  AUTHORITY_EPOCH_CHANGED: 'multiplayer:authority-epoch-changed'
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
    this.worldSequence = 0;
    this.hitSequence = 0;
    this.damageSequence = 0;
    this.economyRequestSequence = 0;
    this.economyResultSequence = 0;
    this.economySnapshotSequence = 0;
    this.reviveStateSequence = 0;
    this.authorityEpoch = 0;
    this.unsubscribe = [];
    this.lastRemoteCommands = new Map();
    this.remoteActions = [];
    this.metrics = {
      envelopesSent: 0,
      envelopesAccepted: 0,
      envelopesRejected: 0,
      loopbackIgnored: 0,
      staleSnapshotsRejected: 0,
      worldSnapshotsSent: 0,
      worldSnapshotsReceived: 0,
      hitRequestsSent: 0,
      hitRequestsReceived: 0,
      playerDamageSent: 0,
      playerDamageReceived: 0,
      economyRequestsSent: 0,
      economyRequestsReceived: 0,
      economyResultsSent: 0,
      economyResultsReceived: 0,
      economySnapshotsSent: 0,
      economySnapshotsReceived: 0,
      reviveStatesSent: 0,
      reviveStatesReceived: 0,
      staleAuthorityEnvelopesRejected: 0,
      authorityMigrations: 0
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
    this.worldSequence = 0;
    this.hitSequence = 0;
    this.damageSequence = 0;
    this.economyRequestSequence = 0;
    this.economyResultSequence = 0;
    this.economySnapshotSequence = 0;
    this.reviveStateSequence = 0;
    this.authorityEpoch = Math.max(
      0,
      Math.floor(Number(
        this.room?.authorityEpoch
        ?? run?.authorityEpoch
        ?? 0
      ) || 0)
    );
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

  sendWorldSnapshot(snapshot) {
    if (!this.initialized || !this.session?.run?.active || !snapshot) return null;
    this.worldSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.WORLD_SNAPSHOT,
      snapshot,
      this.worldSequence
    );
    this.metrics.worldSnapshotsSent += 1;
    return envelope;
  }

  sendEnemyHitRequest(hit) {
    if (!this.initialized || !this.session?.run?.active || !hit?.enemyId) {
      return null;
    }
    this.hitSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.ENEMY_HIT_REQUEST,
      hit,
      this.hitSequence
    );
    this.metrics.hitRequestsSent += 1;
    return envelope;
  }

  sendPlayerDamage(damage) {
    if (
      !this.initialized
      || !this.session?.run?.active
      || !damage?.targetPlayerId
    ) {
      return null;
    }

    this.damageSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.PLAYER_DAMAGE,
      damage,
      this.damageSequence
    );
    this.metrics.playerDamageSent += 1;
    return envelope;
  }

  sendEconomyRequest(request) {
    if (!this.initialized || !this.session?.run?.active || !request?.requestId) {
      return null;
    }

    this.economyRequestSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.ECONOMY_REQUEST,
      request,
      this.economyRequestSequence
    );
    this.metrics.economyRequestsSent += 1;
    return envelope;
  }

  sendEconomyResult(result) {
    if (
      !this.initialized
      || !this.session?.run?.active
      || !result?.targetPlayerId
    ) {
      return null;
    }

    this.economyResultSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.ECONOMY_RESULT,
      result,
      this.economyResultSequence
    );
    this.metrics.economyResultsSent += 1;
    return envelope;
  }

  sendEconomySnapshot(snapshot) {
    if (!this.initialized || !this.session?.run?.active || !snapshot) {
      return null;
    }

    this.economySnapshotSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.ECONOMY_SNAPSHOT,
      snapshot,
      this.economySnapshotSequence
    );
    this.metrics.economySnapshotsSent += 1;
    return envelope;
  }

  sendReviveState(state) {
    if (!this.initialized || !this.session?.run?.active || !state) {
      return null;
    }

    this.reviveStateSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.REVIVE_STATE,
      state,
      this.reviveStateSequence
    );
    this.metrics.reviveStatesSent += 1;
    return envelope;
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
      authorityEpoch: overrides.authorityEpoch !== undefined
        ? overrides.authorityEpoch
        : this.authorityEpoch,
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

    if (Number(envelope.authorityEpoch) < this.authorityEpoch) {
      this.metrics.staleAuthorityEnvelopesRejected += 1;
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

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.WORLD_SNAPSHOT) {
      this.metrics.worldSnapshotsReceived += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_WORLD_SNAPSHOT_RECEIVED,
        { envelope }
      );
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.ENEMY_HIT_REQUEST) {
      this.metrics.hitRequestsReceived += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ENEMY_HIT_RECEIVED,
        { envelope }
      );
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.PLAYER_DAMAGE) {
      this.metrics.playerDamageReceived += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_PLAYER_DAMAGE_RECEIVED,
        { envelope }
      );
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.ECONOMY_REQUEST) {
      this.metrics.economyRequestsReceived += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ECONOMY_REQUEST_RECEIVED,
        { envelope }
      );
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.ECONOMY_RESULT) {
      this.metrics.economyResultsReceived += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ECONOMY_RESULT_RECEIVED,
        { envelope }
      );
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.ECONOMY_SNAPSHOT) {
      this.metrics.economySnapshotsReceived += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ECONOMY_SNAPSHOT_RECEIVED,
        { envelope }
      );
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.REVIVE_STATE) {
      this.metrics.reviveStatesReceived += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_REVIVE_STATE_RECEIVED,
        { envelope }
      );
      return { accepted: true };
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

  setAuthorityEpoch(authorityEpoch, {
    hostPlayerId = null,
    reason = 'host-migration'
  } = {}) {
    const nextEpoch = Math.max(
      0,
      Math.floor(Number(authorityEpoch) || 0)
    );
    if (nextEpoch < this.authorityEpoch) return false;

    const previousEpoch = this.authorityEpoch;
    this.authorityEpoch = nextEpoch;
    this.room.authorityEpoch = nextEpoch;
    if (hostPlayerId) this.room.hostPlayerId = hostPlayerId;

    if (nextEpoch !== previousEpoch) {
      this.metrics.authorityMigrations += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.AUTHORITY_EPOCH_CHANGED,
        {
          previousEpoch,
          authorityEpoch: nextEpoch,
          hostPlayerId,
          reason
        }
      );
    }
    return true;
  }

  handleHostMigration({
    authorityEpoch = 0,
    hostPlayerId = null
  } = {}) {
    return this.setAuthorityEpoch(authorityEpoch, {
      hostPlayerId,
      reason: 'server-host-migrated'
    });
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
      authorityEpoch: this.authorityEpoch,
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
