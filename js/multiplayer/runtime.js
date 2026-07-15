// js/multiplayer/runtime.js

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import {
  MULTIPLAYER_MESSAGE_TYPES,
  createProtocolEnvelope,
  validateProtocolEnvelope
} from './protocol.js';
import { MultiplayerCommandStream } from './command_stream.js';
import { RemoteSnapshotBuffer } from './snapshot_buffer.js'; import { NetworkQualityTracker } from './network_quality.js';
import { MultiplayerReconciliationTracker } from './reconciliation.js';
import { MultiplayerFaultSimulator } from './fault_simulator.js';
import { MultiplayerRoomState } from './room.js';
import { TRANSPORT_MODES, TRANSPORT_STATES } from './transport.js';

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
  REMOTE_TACTICAL_PING_RECEIVED: 'multiplayer:remote-tactical-ping-received',
  REMOTE_RUN_STATS_RECEIVED: 'multiplayer:remote-run-stats-received',
  AUTHORITY_EPOCH_CHANGED: 'multiplayer:authority-epoch-changed', NETWORK_QUALITY_CHANGED: 'multiplayer:network-quality-changed',
  REMOTE_STATE_RESYNC_REQUEST_RECEIVED: 'multiplayer:remote-state-resync-request-received'
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
    }); this.networkQuality = new NetworkQualityTracker();
    this.reconciliation = new MultiplayerReconciliationTracker();
    this.faultSimulator = new MultiplayerFaultSimulator();
    this.lastNetworkQualityLevel = 'WAITING';
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
    this.tacticalPingSequence = 0;
    this.runStatsSequence = 0;
    this.resyncSequence = 0;
    this.heartbeatSequence = 0; this.lastHeartbeatSentAt = 0; this.authorityEpoch = 0;
    this.runRecovery = {
      active: false,
      reason: 'idle',
      attempt: 0,
      nextAt: 0,
      runId: null,
      worldSeen: false,
      hostSeen: false
    };
    this.unsubscribe = [];
    this.lastRemoteCommands = new Map();
    this.remoteActions = [];
    this.metrics = {
      envelopesSent: 0,
      envelopesAccepted: 0,
      envelopesRejected: 0,
      loopbackIgnored: 0,
      staleSnapshotsRejected: 0, remoteIncarnationResets: 0,
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
      tacticalPingsSent: 0,
      tacticalPingsReceived: 0,
      runStatsSent: 0,
      runStatsReceived: 0,
      staleAuthorityEnvelopesRejected: 0,
      duplicateEnvelopesRejected: 0,
      staleOrderedEnvelopesRejected: 0,
      sequenceGapsDetected: 0,
      resyncRequestsSent: 0,
      resyncRequestsReceived: 0,
      runRecoveryBursts: 0,
      runRecoveriesCompleted: 0,
      authorityMigrations: 0, heartbeatsSent: 0, heartbeatsReceived: 0, heartbeatPongsReceived: 0
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

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED,
        (event) => {
          const transition = event?.payload || {};
          if (
            transition.state === TRANSPORT_STATES.CONNECTED
            && transition.previousState === TRANSPORT_STATES.RECONNECTING
          ) {
            const now = Date.now();
            this.reconciliation.noteReconnect(now);
            this.scheduleRunRecovery('transport-reconnected', now);
          }
        }
      ) || (() => {})
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
    this.resetRunRecovery('local-room-reset');
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
    this.tacticalPingSequence = 0;
    this.runStatsSequence = 0;
    this.resyncSequence = 0; this.heartbeatSequence = 0; this.lastHeartbeatSentAt = 0; this.networkQuality.reset(Date.now());
    this.authorityEpoch = Math.max(
      0,
      Math.floor(Number(
        this.room?.authorityEpoch
        ?? run?.authorityEpoch
        ?? 0
      ) || 0)
    );
    this.reconciliation.beginRun({
      now: Date.now(),
      authorityEpoch: this.authorityEpoch
    });
    this.faultSimulator.beginRun(run?.runId || null);
    this.remoteSnapshots.clear();
    this.lastRemoteCommands.clear();
    this.remoteActions.length = 0;
    this.room.beginRun({
      runId: run?.runId,
      mapId: run?.mapId,
      difficulty: run?.difficulty
    });
    this.sendRoomState();
    if (this.session?.mode === 'client') {
      this.scheduleRunRecovery(
        run?.resumed === true ? 'client-run-resume' : 'client-run-start',
        Date.now()
      );
    } else {
      this.resetRunRecovery('host-run-start');
    }
  }

  endRun() { this.resetRunRecovery('run-ended'); this.networkQuality.reset(Date.now());
    this.faultSimulator.endRun();
    this.reconciliation.endRun(Date.now());
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

    this.updateNetworkQuality(Date.now()); const captured = this.commandStream.capture({
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

  sendTacticalPing(ping) {
    if (!this.initialized || !this.session?.run?.active || !ping?.pingId) {
      return null;
    }

    this.tacticalPingSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.TACTICAL_PING,
      ping,
      this.tacticalPingSequence
    );
    this.metrics.tacticalPingsSent += 1;
    return envelope;
  }

  sendRunStats(payload) {
    if (!this.initialized || !this.session?.run?.active || !payload) {
      return null;
    }

    this.runStatsSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.RUN_STATS,
      payload,
      this.runStatsSequence
    );
    this.metrics.runStatsSent += 1;
    return envelope;
  }


  updateNetworkQuality(now = Date.now()) {
    if (!this.initialized || !this.session?.run?.active) {
      return this.networkQuality.getSnapshot(now);
    }
    this.networkQuality.prune(now);
    if (this.networkQuality.shouldPing(now)) {
      this.sendHeartbeatPing(now);
    }
    this.pollRunRecovery(now);
    const resyncRequest = this.reconciliation.poll({
      now,
      active: this.session?.run?.active === true,
      isClient: this.session?.mode === 'client',
      connected: this.transport?.getState?.() === TRANSPORT_STATES.CONNECTED,
      hostPlayerId: this.room?.hostPlayerId || this.session?.hostPlayerId || null
    });
    if (resyncRequest) {
      this.sendStateResyncRequest(resyncRequest);
    }

    const snapshot = this.networkQuality.getSnapshot(now);
    this.remoteSnapshots.interpolationDelayMs =
      snapshot.interpolationDelayMs;
    if (snapshot.level !== this.lastNetworkQualityLevel) {
      const previousLevel = this.lastNetworkQualityLevel;
      this.lastNetworkQualityLevel = snapshot.level;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.NETWORK_QUALITY_CHANGED,
        { previousLevel, snapshot }
      );
    }
    return snapshot;
  }

  sendHeartbeatPing(now = Date.now()) {
    this.heartbeatSequence += 1;
    const pingId =
      `${this.localPlayerId || 'player'}-`
      + `${this.heartbeatSequence}-${now}`;
    if (!this.networkQuality.startPing(pingId, now)) return null;
    this.lastHeartbeatSentAt = now;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.HEARTBEAT,
      { kind: 'ping', pingId, pingSentAt: now },
      this.heartbeatSequence
    );
    this.metrics.heartbeatsSent += 1;
    return envelope;
  }

  handleHeartbeatEnvelope(envelope) {
    const payload = envelope?.payload || {};
    this.metrics.heartbeatsReceived += 1;

    if (payload.kind === 'ping' && payload.pingId) {
      this.heartbeatSequence += 1;
      return this.sendEnvelope(
        MULTIPLAYER_MESSAGE_TYPES.HEARTBEAT,
        {
          kind: 'pong',
          pingId: payload.pingId,
          pingSentAt: payload.pingSentAt,
          targetPlayerId: envelope.playerId,
          responderPlayerId: this.localPlayerId
        },
        this.heartbeatSequence
      );
    }

    if (
      payload.kind === 'pong'
      && payload.pingId
      && (
        !payload.targetPlayerId
        || payload.targetPlayerId === this.localPlayerId
      )
    ) {
      const rtt = this.networkQuality.recordPong(
        payload.pingId,
        Date.now()
      );
      if (rtt !== null) {
        this.metrics.heartbeatPongsReceived += 1;
      }
      return { accepted: rtt !== null, rtt };
    }

    return { accepted: true };
  }

  getNetworkQualitySnapshot(now = Date.now()) {
    return this.networkQuality.getSnapshot(now);
  }

getReconciliationSnapshot(now = Date.now()) {
    return this.reconciliation.getSnapshot(now);
  }

  resetRunRecovery(reason = 'reset') {
    this.runRecovery = {
      active: false,
      reason,
      attempt: 0,
      nextAt: 0,
      runId: null,
      worldSeen: false,
      hostSeen: false
    };
    return this.runRecovery;
  }

  scheduleRunRecovery(reason = 'client-run-recovery', now = Date.now()) {
    if (
      !this.initialized
      || this.session?.run?.active !== true
      || this.session?.mode !== 'client'
    ) {
      return false;
    }
    this.runRecovery = {
      active: true,
      reason: String(reason || 'client-run-recovery').slice(0, 80),
      attempt: 0,
      nextAt: Number(now) + 120,
      runId: this.session?.run?.runId || null,
      worldSeen: false,
      hostSeen: false
    };
    return true;
  }

  noteRunRecoveryEnvelope(envelope) {
    const recovery = this.runRecovery;
    if (!recovery?.active || !envelope) return false;
    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.WORLD_SNAPSHOT) {
      recovery.worldSeen = true;
    }
    if (
      envelope.type === MULTIPLAYER_MESSAGE_TYPES.PLAYER_SNAPSHOT
      && envelope.playerId
      && envelope.playerId === (
        this.room?.hostPlayerId || this.session?.hostPlayerId || null
      )
    ) {
      recovery.hostSeen = true;
    }
    if (recovery.worldSeen && recovery.hostSeen) {
      recovery.active = false;
      recovery.reason = 'hydrated';
      recovery.nextAt = 0;
      this.metrics.runRecoveriesCompleted += 1;
      return true;
    }
    return false;
  }

  pollRunRecovery(now = Date.now()) {
    const recovery = this.runRecovery;
    if (!recovery?.active || Number(now) < Number(recovery.nextAt || 0)) {
      return null;
    }
    if (
      this.session?.run?.active !== true
      || this.session?.mode !== 'client'
      || this.transport?.getState?.() !== TRANSPORT_STATES.CONNECTED
    ) {
      return null;
    }
    const delays = [420, 950, 1800, 3200];
    if (recovery.attempt >= delays.length) {
      recovery.active = false;
      recovery.reason = 'retry-budget-exhausted';
      recovery.nextAt = 0;
      return null;
    }

    this.players?.syncLocalPlayer?.(
      null,
      nowMs(),
      { force: true }
    );
    const attempt = recovery.attempt + 1;
    const envelope = this.sendStateResyncRequest({
      reason: `${recovery.reason}-attempt-${attempt}`,
      runId: recovery.runId,
      recoveryAttempt: attempt,
      requireWorldSnapshot: recovery.worldSeen !== true,
      requireHostSnapshot: recovery.hostSeen !== true
    });
    recovery.attempt = attempt;
    recovery.nextAt = Number(now) + delays[attempt - 1];
    this.metrics.runRecoveryBursts += 1;
    return envelope;
  }

  sendStateResyncRequest(request = {}) {
    if (
      !this.initialized
      || !this.session?.run?.active
      || this.session?.mode !== 'client'
      || this.transport?.getState?.() !== TRANSPORT_STATES.CONNECTED
    ) {
      return null;
    }
    this.resyncSequence += 1;
    const envelope = this.sendEnvelope(
      MULTIPLAYER_MESSAGE_TYPES.STATE_RESYNC_REQUEST,
      {
        ...request,
        targetHostPlayerId: request.targetHostPlayerId
          || this.room?.hostPlayerId
          || this.session?.hostPlayerId
          || null
      },
      this.resyncSequence
    );
    this.metrics.resyncRequestsSent += 1;
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

    this.faultSimulator.dispatchOutbound(
      type,
      envelope,
      (outboundType, outboundEnvelope) => {
        const sent = this.transport?.send(outboundType, outboundEnvelope) === true;
        if (sent) this.metrics.envelopesSent += 1;
        return sent;
      }
    );

    return envelope;
  }

  handleTransportMessage(message, { bypassFaultSimulation = false } = {}) {
    if (
      !bypassFaultSimulation
      && this.faultSimulator.interceptInbound(
        message,
        () => this.handleTransportMessage(message, {
          bypassFaultSimulation: true
        })
      )
    ) {
      return;
    }

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

    this.networkQuality.markEnvelopeReceived(Date.now()); if (envelope.playerId && envelope.playerId === this.localPlayerId) {
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

    const reconciliation = this.reconciliation.observe(
      envelope,
      Date.now(),
      {
        expectedHostPlayerId: this.room?.hostPlayerId
          || this.session?.hostPlayerId
          || null
      }
    );
    if (!reconciliation.accepted) {
      this.metrics.envelopesRejected += 1;
      if (reconciliation.reason === 'duplicate-message') {
        this.metrics.duplicateEnvelopesRejected += 1;
      } else if (reconciliation.reason === 'stale-ordered-sequence') {
        this.metrics.staleOrderedEnvelopesRejected += 1;
      }
      return reconciliation;
    }
    if (reconciliation.gap > 0) {
      this.metrics.sequenceGapsDetected += reconciliation.gap;
    }

    this.metrics.envelopesAccepted += 1;

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.PLAYER_SNAPSHOT) {
      const receivedAt = nowMs();
      const result = this.remoteSnapshots.push(envelope.playerId, {
        sequence: envelope.sequence,
        connectionEpoch: envelope.connectionEpoch,
        sentAt: receivedAt,
        receivedAt,
        state: envelope.payload?.state
      });
      if (result.reset === true) this.metrics.remoteIncarnationResets += 1;

      if (!result.accepted && result.reason === 'stale-sequence') {
        this.metrics.staleSnapshotsRejected += 1;
      }

      if (result.accepted) {
        this.noteRunRecoveryEnvelope(envelope);
        this.eventBus?.emit(MULTIPLAYER_RUNTIME_EVENTS.REMOTE_SNAPSHOT_RECEIVED, {
          envelope
        });
      }

      return result;
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.WORLD_SNAPSHOT) {
      this.metrics.worldSnapshotsReceived += 1;
      this.noteRunRecoveryEnvelope(envelope);
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

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.TACTICAL_PING) {
      this.metrics.tacticalPingsReceived += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_TACTICAL_PING_RECEIVED,
        { envelope }
      );
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.RUN_STATS) {
      this.metrics.runStatsReceived += 1;
      this.eventBus?.emit(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_RUN_STATS_RECEIVED,
        { envelope }
      );
      return { accepted: true };
    }

    if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.HEARTBEAT) { return this.handleHeartbeatEnvelope(envelope); } if (envelope.type === MULTIPLAYER_MESSAGE_TYPES.INPUT_COMMAND) {
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

    if (
      envelope.type === MULTIPLAYER_MESSAGE_TYPES.STATE_RESYNC_REQUEST
    ) {
      this.metrics.resyncRequestsReceived += 1;
      if (this.session?.mode === 'host') {
        this.eventBus?.emit(
          MULTIPLAYER_RUNTIME_EVENTS.REMOTE_STATE_RESYNC_REQUEST_RECEIVED,
          { envelope }
        );
      }
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


  configureFaultSimulation(config = {}) {
    return this.faultSimulator.configure(config);
  }

  applyFaultSimulationPreset(name = 'clean') {
    return this.faultSimulator.applyPreset(name);
  }

  getFaultSimulationSnapshot() {
    return this.faultSimulator.getSnapshot();
  }

  clearFaultSimulationMetrics() {
    this.faultSimulator.clearMetrics();
    return this.faultSimulator.getSnapshot();
  }

  triggerSimulatedDisconnect() {
    return this.faultSimulator.triggerDisconnect(this.transport);
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
      this.reconciliation.noteAuthorityEpoch(nextEpoch, Date.now());
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
      reconciliation: this.getReconciliationSnapshot(Date.now()),
      networkQuality: this.getNetworkQualitySnapshot(Date.now()),
      faultSimulation: this.getFaultSimulationSnapshot(),
      metrics: { ...this.metrics }
    };
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
    this.faultSimulator.flush('runtime-destroy');
    this.remoteSnapshots.clear();
    this.initialized = false;
  }
}
