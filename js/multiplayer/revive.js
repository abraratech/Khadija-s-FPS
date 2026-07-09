// js/multiplayer/revive.js
import * as THREE from 'three';
import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js';
import { MULTIPLAYER_LIFE_STATES, ReviveAuthority } from './revive_core.js';

const REVIVE_MESSAGE_KIND = Object.freeze({
  COMMAND: 'command',
  SNAPSHOT: 'snapshot'
});

const REVIVE_ACTIONS = Object.freeze({
  DOWNED: 'DOWNED',
  HOLD: 'HOLD',
  SNAPSHOT_REQUEST: 'SNAPSHOT_REQUEST'
});

const SNAPSHOT_INTERVAL_MS = 100;
const HOLD_SEND_INTERVAL_MS = 90;
const REQUEST_INTERVAL_MS = 1000;
const SNAPSHOT_STALE_MS = 1500;

function nowMs() {
  return (
    typeof performance !== 'undefined'
    && typeof performance.now === 'function'
  ) ? performance.now() : Date.now();
}

function vectorPayload(value) {
  return {
    x: Number(value?.x || 0),
    y: Number(value?.y || 0),
    z: Number(value?.z || 0)
  };
}

function distanceSquared(a, b) {
  const dx = Number(a?.x || 0) - Number(b?.x || 0);
  const dy = Number(a?.y || 0) - Number(b?.y || 0);
  const dz = Number(a?.z || 0) - Number(b?.z || 0);
  return dx * dx + dy * dy + dz * dz;
}

function makeMarkerTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(40, 0, 0, 0.84)';
  context.fillRect(8, 22, 496, 116);
  context.strokeStyle = '#ff4a36';
  context.lineWidth = 8;
  context.strokeRect(8, 22, 496, 116);
  context.font = '800 44px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#ffffff';
  context.fillText(`REVIVE ${String(label || 'TEAMMATE').slice(0, 16)}`, 256, 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class MultiplayerReviveManager {
  constructor({
    eventBus,
    runtime,
    session,
    player,
    scene = null,
    adapter = null
  } = {}) {
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.session = session;
    this.player = player;
    this.scene = scene;
    this.adapter = adapter || {};
    this.core = new ReviveAuthority();
    this.active = false;
    this.latestSnapshot = null;
    this.authorityEpoch = 0;
    this.room = null;
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotReceivedAt = -Infinity;
    this.lastSnapshotRequestAt = -Infinity;
    this.lastHoldSentAt = -Infinity;
    this.lastHoldTargetId = null;
    this.pendingDownAt = -Infinity;
    this.teamEndRequested = false;
    this.localAppliedState = MULTIPLAYER_LIFE_STATES.ACTIVE;
    this.localRespawnNonce = 0;
        this.activeHealthInitialized = false;
    this.currentReviveTarget = null;
    this.hudRoot = null;
    this.hudStatus = null;
    this.hudTeam = null;
    this.markers = new Map();
    this.spectatorTargetId = null;
    this.spectatorPosition = new THREE.Vector3();
    this.unsubscribe = [];

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_REVIVE_STATE_RECEIVED,
        (event) => this.handleReviveEnvelope(event?.payload?.envelope)
      ) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED,
        (event) => {
          this.room = event?.payload?.room || null;
          this.syncRoomPlayers(nowMs());
        }
      ) || (() => {})
    );
    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED,
        (event) => {
          if (
            this.active
            && event?.payload?.state === 'connected'
            && !this.isAuthority()
          ) {
            this.requestSnapshot(true);
          }
        }
      ) || (() => {})
    );
  }

  isOnline() {
    return (
      this.session?.run?.active === true
      && (
        this.session?.mode === 'host'
        || this.session?.mode === 'client'
      )
    );
  }

  isAuthority() {
    return this.session?.mode === 'host';
  }

  beginRun() {
    this.active = this.isOnline();
    this.latestSnapshot = null;
    this.authorityEpoch = Math.max(0, Number(this.runtime?.authorityEpoch) || 0);
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotReceivedAt = -Infinity;
    this.lastSnapshotRequestAt = -Infinity;
    this.lastHoldSentAt = -Infinity;
    this.lastHoldTargetId = null;
    this.pendingDownAt = -Infinity;
    this.teamEndRequested = false;
    this.localAppliedState = MULTIPLAYER_LIFE_STATES.ACTIVE;
    this.localRespawnNonce = 0;
        this.activeHealthInitialized = false;
    this.currentReviveTarget = null;
    this.spectatorTargetId = null;
    this.core.reset({
      runId: this.session?.run?.runId || null,
      wave: this.adapter.getWave?.() || 1
    });

    if (!this.active) {
      this.hideHud();
      this.clearMarkers();
      return;
    }

    this.applyLocalFlags(MULTIPLAYER_LIFE_STATES.ACTIVE);
    this.syncRoomPlayers(nowMs());
    const localId = this.runtime?.localPlayerId;
    if (localId) {
      this.core.ensurePlayer(localId, {
        connected: true,
        displayName: this.localDisplayName(),
        health: this.player?.health,
        maxHealth: this.player?.maxHealth,
        position: this.player?.pos,
        now: nowMs()
      });
    }
    this.ensureHud();

    if (this.isAuthority()) {
      this.publishSnapshot(nowMs(), true);
    } else {
      this.requestSnapshot(true);
    }
  }

  endRun() {
    this.releaseHold(true);
    this.active = false;
    this.latestSnapshot = null;
    this.currentReviveTarget = null;
    this.teamEndRequested = false;
    this.pendingDownAt = -Infinity;
    this.core.reset();
    this.hideHud();
    this.clearMarkers();
    this.applyLocalFlags(MULTIPLAYER_LIFE_STATES.ACTIVE, {
      preserveAlive: true
    });
  }

  localDisplayName() {
    const room = this.runtime?.room?.getSnapshot?.() || this.room;
    const localId = this.runtime?.localPlayerId;
    return (
      room?.players?.find((entry) => entry?.playerId === localId)?.displayName
      || 'Player'
    );
  }

  syncRoomPlayers(now = nowMs()) {
    if (!this.active) return;
    const room = this.runtime?.room?.getSnapshot?.() || this.room;
    if (!room?.players) return;
    this.room = room;
    const seen = new Set();

    room.players.forEach((entry) => {
      if (!entry?.playerId) return;
      seen.add(entry.playerId);
      this.core.ensurePlayer(entry.playerId, {
        displayName: entry.displayName,
        connected: entry.connected !== false,
        now
      });
      this.core.setConnected(
        entry.playerId,
        entry.connected !== false,
        now
      );
    });

    this.core.players.forEach((entry, playerId) => {
      if (!seen.has(playerId)) {
        this.core.setConnected(playerId, false, now);
      }
    });
  }

  updatePlayerPositions(now = nowMs()) {
    const localId = this.runtime?.localPlayerId;
    if (localId) {
      this.core.updatePlayer(localId, {
        displayName: this.localDisplayName(),
        connected: true,
        position: this.player?.pos,
        health: this.player?.health,
        maxHealth: this.player?.maxHealth,
        now
      });
    }

    if (!this.isAuthority()) return;
    const room = this.runtime?.room?.getSnapshot?.() || this.room;
    room?.players?.forEach((entry) => {
      if (
        !entry?.playerId
        || entry.playerId === localId
        || entry.connected === false
      ) {
        return;
      }
      const state = this.runtime?.sampleRemotePlayer?.(
        entry.playerId,
        now
      )?.state;
      if (!state?.position) return;
      this.core.updatePlayer(entry.playerId, {
        displayName: entry.displayName,
        connected: true,
        position: state.position,
        health: state.health,
        maxHealth: state.maxHealth,
        now
      });
    });
  }

  update(dt, now = nowMs(), { interactHeld = false } = {}) {
    if (!this.active || !this.isOnline()) return;
    this.syncRoomPlayers(now);
    this.updatePlayerPositions(now);

    if (this.isAuthority()) {
      this.core.update({
        now,
        dtMs: Math.max(0, Number(dt) || 0) * 1000,
        wave: this.adapter.getWave?.() || 1
      });
      this.processAuthorityEvents();
      this.latestSnapshot = this.core.getSnapshot(now);
            this.ensureTeamElimination(this.latestSnapshot);
            this.applyLocalFromSnapshot(this.latestSnapshot);
      this.updateReviveHold(interactHeld, now);
      this.publishSnapshot(now);
    } else {
      if (now - this.lastSnapshotReceivedAt > SNAPSHOT_STALE_MS) {
        this.requestSnapshot();
      }
      this.applyLocalFromSnapshot(this.latestSnapshot);
      this.updateReviveHold(interactHeld, now);
    }

    if (this.isTeamEliminated(this.latestSnapshot)) {
      this.currentReviveTarget = null;
      this.releaseHold(true);
      this.clearMarkers();
    }
    this.updateSpectatorCamera();
    this.renderHud(now);
    this.updateMarkers();
  }

  handleLocalDeath(reason = 'damage') {
    if (
      !this.active
      || !this.isOnline()
      || this.isInputBlocked()
    ) {
      return false;
    }
    const localId = this.runtime?.localPlayerId;
    if (!localId) return false;

    const now = nowMs();
    this.pendingDownAt = now;
    this.localAppliedState = MULTIPLAYER_LIFE_STATES.DOWNED;
    this.applyLocalFlags(MULTIPLAYER_LIFE_STATES.DOWNED);
    this.adapter.clearInput?.();

    if (this.isAuthority()) {
      this.core.downPlayer(localId, {
        now,
        wave: this.adapter.getWave?.() || 1,
        position: this.player?.pos,
        displayName: this.localDisplayName()
      });
      this.processAuthorityEvents();
      this.latestSnapshot = this.core.getSnapshot(now);
      this.publishSnapshot(now, true);
    } else {
      this.runtime?.sendReviveState?.({
        kind: REVIVE_MESSAGE_KIND.COMMAND,
        action: REVIVE_ACTIONS.DOWNED,
        reason: String(reason || 'damage').slice(0, 40),
        wave: this.adapter.getWave?.() || 1,
        position: vectorPayload(this.player?.pos)
      });
    }
    return true;
  }

  handleReviveEnvelope(envelope) {
    if (
      !this.active
      || !envelope
      || (
        envelope.runId
        && envelope.runId !== this.session?.run?.runId
      )
    ) {
      return;
    }

    const payload = envelope.payload || {};
    if (
      payload.kind === REVIVE_MESSAGE_KIND.SNAPSHOT
      && !this.isAuthority()
    ) {
      const expectedHost = (
        this.runtime?.room?.getSnapshot?.()?.hostPlayerId
        || this.session?.hostPlayerId
        || null
      );
      if (expectedHost && envelope.playerId !== expectedHost) return;
      if (!payload.snapshot?.players) return;
      const receivedAt = nowMs();
      const authorityTime = Number(payload.snapshot.serverTime || receivedAt);
      const snapshot = {
        ...payload.snapshot,
        serverTime: receivedAt,
        players: payload.snapshot.players.map((entry) => {
          if (
            entry?.lifeState !== MULTIPLAYER_LIFE_STATES.DOWNED
            || !Number.isFinite(Number(entry.bleedoutEndsAt))
          ) {
            return { ...entry };
          }
          const remaining = Math.max(
            0,
            Number(entry.bleedoutEndsAt) - authorityTime
          );
          return {
            ...entry,
            downedAt: receivedAt - Math.max(
              0,
              Number(payload.snapshot.bleedoutMs || 30_000) - remaining
            ),
            bleedoutEndsAt: receivedAt + remaining
          };
        })
      };
      this.latestSnapshot = snapshot;
      this.authorityEpoch = Math.max(
        this.authorityEpoch,
        Number(envelope?.authorityEpoch ?? snapshot.authorityEpoch) || 0
      );
      this.core.replaceSnapshot(snapshot);
      this.lastSnapshotReceivedAt = receivedAt;
      this.applyLocalFromSnapshot(snapshot);
      return;
    }

    if (
      payload.kind !== REVIVE_MESSAGE_KIND.COMMAND
      || !this.isAuthority()
    ) {
      return;
    }

    const actorId = envelope.playerId;
    if (!actorId) return;
    const now = nowMs();

    if (payload.action === REVIVE_ACTIONS.DOWNED) {
      const sampled = this.runtime?.sampleRemotePlayer?.(
        actorId,
        now
      )?.state;
      this.core.downPlayer(actorId, {
        now,
        wave: payload.wave || this.adapter.getWave?.() || 1,
        position: sampled?.position || payload.position,
        displayName: this.displayNameFor(actorId)
      });
      this.processAuthorityEvents();
      this.publishSnapshot(now, true);
      return;
    }

    if (payload.action === REVIVE_ACTIONS.HOLD) {
      this.core.setReviveHold(actorId, payload.targetPlayerId, {
        holding: payload.holding === true,
        now,
        position: this.runtime?.sampleRemotePlayer?.(
          actorId,
          now
        )?.state?.position || payload.position
      });
      return;
    }

    if (payload.action === REVIVE_ACTIONS.SNAPSHOT_REQUEST) {
      this.publishSnapshot(now, true);
    }
  }

  displayNameFor(playerId) {
    const room = this.runtime?.room?.getSnapshot?.() || this.room;
    return (
      room?.players?.find((entry) => entry?.playerId === playerId)
        ?.displayName
      || 'Player'
    );
  }

  isTeamEliminated(snapshot = this.latestSnapshot) {
    if (!snapshot?.players) return false;
    if (snapshot.teamEliminated === true) return true;
    const connected = snapshot.players.filter(
      (entry) => entry?.connected !== false
    );
    return connected.length > 0 && connected.every((entry) => (
      entry.lifeState === MULTIPLAYER_LIFE_STATES.DOWNED
      || entry.lifeState === MULTIPLAYER_LIFE_STATES.SPECTATING
      || entry.lifeState === 'ELIMINATED'
    ));
  }

ensureTeamElimination(snapshot = this.latestSnapshot) {
        if (
            !this.active
            || !this.isAuthority()
            || this.teamEndRequested
            || !snapshot?.players
        ) {
            return false;
        }
        const eliminated = this.isTeamEliminated(snapshot);
        if (!eliminated) return false;
        this.teamEndRequested = true;
        this.adapter.requestTeamGameOver?.();
        return true;
    }

    processAuthorityEvents() {
    this.core.consumeEvents().forEach((event) => {
      const stampedEvent = {
        ...event,
        at: nowMs(),
        eventId: [
          event.type,
          event.playerId || '',
          event.reviverId || '',
          this.core?.wave || 1,
          Math.floor(nowMs())
        ].join(':')
      };
      this.adapter.onReviveEvent?.(stampedEvent);
      if (event.type === 'TEAM_ELIMINATED') {
        if (!this.teamEndRequested) {
          this.teamEndRequested = true;
          this.adapter.requestTeamGameOver?.();
        }
        return;
      }
      if (event.type === 'DOWNED') {
        if (event.playerId === this.runtime?.localPlayerId) {
          this.adapter.showToast?.(
            'DOWNED · TEAMMATE CAN REVIVE YOU',
            '#ff4a36',
            2200
          );
        }
        return;
      }
      if (event.type === 'REVIVED') {
        if (event.playerId === this.runtime?.localPlayerId) {
          this.adapter.showToast?.('REVIVED', '#55ff88', 1800);
        }
        return;
      }
      if (event.type === 'RESPAWN') {
        if (event.playerId === this.runtime?.localPlayerId) {
          this.adapter.showToast?.(
            'RESPAWNED FOR THE NEW WAVE',
            '#00d4ff',
            2000
          );
        }
      }
    });
  }

  publishSnapshot(now = nowMs(), force = false) {
    if (
      !this.active
      || !this.isAuthority()
      || (
        !force
        && now - this.lastSnapshotSentAt < SNAPSHOT_INTERVAL_MS
      )
    ) {
      return false;
    }
    this.lastSnapshotSentAt = now;
    const snapshot = {
      ...this.core.getSnapshot(now),
      authorityEpoch: this.authorityEpoch
    };
    this.latestSnapshot = snapshot;
    this.runtime?.sendReviveState?.({
      kind: REVIVE_MESSAGE_KIND.SNAPSHOT,
      snapshot
    });
    return true;
  }

  requestSnapshot(force = false) {
    const now = nowMs();
    if (
      !force
      && now - this.lastSnapshotRequestAt < REQUEST_INTERVAL_MS
    ) {
      return false;
    }
    this.lastSnapshotRequestAt = now;
    this.runtime?.sendReviveState?.({
      kind: REVIVE_MESSAGE_KIND.COMMAND,
      action: REVIVE_ACTIONS.SNAPSHOT_REQUEST
    });
    return true;
  }

  normalizeCheckpointSnapshot(snapshot, receivedAt = nowMs()) {
    if (!snapshot?.players) return null;
    const authorityTime = Number(snapshot.serverTime || receivedAt);
    return {
      ...snapshot,
      serverTime: receivedAt,
      players: snapshot.players.map((entry) => {
        if (
          entry?.lifeState !== MULTIPLAYER_LIFE_STATES.DOWNED
          || !Number.isFinite(Number(entry.bleedoutEndsAt))
        ) {
          return { ...entry };
        }
        const remaining = Math.max(
          0,
          Number(entry.bleedoutEndsAt) - authorityTime
        );
        return {
          ...entry,
          downedAt: receivedAt - Math.max(
            0,
            Number(snapshot.bleedoutMs || 30_000) - remaining
          ),
          bleedoutEndsAt: receivedAt + remaining
        };
      })
    };
  }

  applyMigrationCheckpoint(checkpoint = null, {
    becameHost = this.isAuthority()
  } = {}) {
    const source = checkpoint?.revive || this.latestSnapshot;
    const snapshot = this.normalizeCheckpointSnapshot(source);
    if (!snapshot) return false;

    this.authorityEpoch = Math.max(
      this.authorityEpoch,
      Number(checkpoint?.authorityEpoch ?? source.authorityEpoch) || 0
    );
    snapshot.authorityEpoch = this.authorityEpoch;
    this.latestSnapshot = snapshot;
    this.core.replaceSnapshot(snapshot);
    this.lastSnapshotReceivedAt = nowMs();
    this.syncRoomPlayers(nowMs());
    this.applyLocalFromSnapshot(snapshot);

    if (becameHost) {
      this.teamEndRequested = false;
      this.publishSnapshot(nowMs(), true);
    }
    return true;
  }

  handleHostMigration({
    authorityEpoch = 0,
    checkpoint = null,
    becameHost = false
  } = {}) {
    this.authorityEpoch = Math.max(
      this.authorityEpoch,
      Number(authorityEpoch) || 0
    );
    if (!this.active) return false;
    return this.applyMigrationCheckpoint(checkpoint, { becameHost });
  }

  findNearestDownedTarget() {
    if (
      !this.latestSnapshot?.players
      || this.isInputBlocked()
      || this.isTeamEliminated()
    ) return null;
    const localState = this.latestSnapshot.players.find(
      (entry) => entry?.playerId === this.runtime?.localPlayerId
    )?.lifeState;
    if (localState !== MULTIPLAYER_LIFE_STATES.ACTIVE) return null;
    const localId = this.runtime?.localPlayerId;
    const localPosition = this.player?.pos;
    const range = Number(this.latestSnapshot.reviveRange || 3.2);
    let nearest = null;
    let nearestDistanceSq = range * range;

    this.latestSnapshot.players.forEach((entry) => {
      if (
        !entry?.playerId
        || entry.playerId === localId
        || entry.connected === false
        || entry.lifeState !== MULTIPLAYER_LIFE_STATES.DOWNED
      ) {
        return;
      }
      const value = distanceSquared(localPosition, entry.position);
      if (value <= nearestDistanceSq) {
        nearestDistanceSq = value;
        nearest = {
          ...entry,
          distance: Math.sqrt(value)
        };
      }
    });
    return nearest;
  }

  updateReviveHold(interactHeld, now = nowMs()) {
    const target = this.findNearestDownedTarget();
    this.currentReviveTarget = target;

    if (!interactHeld || !target) {
      this.releaseHold();
      return;
    }

    if (
      this.lastHoldTargetId === target.playerId
      && now - this.lastHoldSentAt < HOLD_SEND_INTERVAL_MS
    ) {
      return;
    }

    this.lastHoldTargetId = target.playerId;
    this.lastHoldSentAt = now;
    if (this.isAuthority()) {
      this.core.setReviveHold(
        this.runtime?.localPlayerId,
        target.playerId,
        {
          holding: true,
          now,
          position: this.player?.pos
        }
      );
    } else {
      this.runtime?.sendReviveState?.({
        kind: REVIVE_MESSAGE_KIND.COMMAND,
        action: REVIVE_ACTIONS.HOLD,
        targetPlayerId: target.playerId,
        holding: true,
        position: vectorPayload(this.player?.pos)
      });
    }
  }

  releaseHold(force = false) {
    if (!this.lastHoldTargetId && !force) return;
    const previousTarget = this.lastHoldTargetId;
    this.lastHoldTargetId = null;
    this.lastHoldSentAt = -Infinity;

    if (!this.active || !previousTarget) return;
    if (this.isAuthority()) {
      this.core.setReviveHold(
        this.runtime?.localPlayerId,
        previousTarget,
        { holding: false, now: nowMs() }
      );
    } else {
      this.runtime?.sendReviveState?.({
        kind: REVIVE_MESSAGE_KIND.COMMAND,
        action: REVIVE_ACTIONS.HOLD,
        targetPlayerId: previousTarget,
        holding: false
      });
    }
  }

  applyLocalFromSnapshot(snapshot) {
        if (!snapshot?.players) return;
        const localId = this.runtime?.localPlayerId;
        const state = snapshot.players.find(
            (entry) => entry?.playerId === localId
        );
        if (!state) return;

        if (
            state.lifeState === MULTIPLAYER_LIFE_STATES.ACTIVE
            && this.pendingDownAt > 0
            && nowMs() - this.pendingDownAt < SNAPSHOT_STALE_MS
        ) {
            return;
        }

        if (state.lifeState !== MULTIPLAYER_LIFE_STATES.ACTIVE) {
            this.pendingDownAt = -Infinity;
        }

        const previous = this.localAppliedState;
        const previousNonce = this.localRespawnNonce;
        const nextNonce = Number(state.respawnNonce || 0);
        const respawned = (
            state.lifeState === MULTIPLAYER_LIFE_STATES.ACTIVE
            && (
                previous === MULTIPLAYER_LIFE_STATES.SPECTATING
                || nextNonce > previousNonce
            )
        );
        const revived = (
            state.lifeState === MULTIPLAYER_LIFE_STATES.ACTIVE
            && previous === MULTIPLAYER_LIFE_STATES.DOWNED
        );

        // Critical lethal-state latch: updatePlayer() sets health to zero and
        // alive=false before main.js reports DOWNED. An older ACTIVE network
        // snapshot must not flip alive back to true during that same frame.
        const localLethalPending = (
            state.lifeState === MULTIPLAYER_LIFE_STATES.ACTIVE
            && !respawned
            && !revived
            && (
                Number(this.player?.health || 0) <= 0
                || this.player?.alive === false
            )
        );
        if (localLethalPending) {
            this.activeHealthInitialized = true;
            this.adapter.setLocalWeaponVisible?.(false);
            return;
        }

        this.localAppliedState = state.lifeState;
        this.localRespawnNonce = nextNonce;

        if (state.lifeState === MULTIPLAYER_LIFE_STATES.DOWNED) {
            this.activeHealthInitialized = true;
            this.applyLocalFlags(MULTIPLAYER_LIFE_STATES.DOWNED);
            this.player.health = 0;
            this.player.vel?.set?.(0, 0, 0);
            this.adapter.clearInput?.();
            this.adapter.syncHud?.();
            return;
        }

        if (state.lifeState === MULTIPLAYER_LIFE_STATES.SPECTATING) {
            this.activeHealthInitialized = true;
            this.applyLocalFlags(MULTIPLAYER_LIFE_STATES.SPECTATING);
            this.player.health = 0;
            this.player.vel?.set?.(0, 0, 0);
            this.adapter.clearInput?.();
            this.adapter.syncHud?.();
            return;
        }

        this.pendingDownAt = -Infinity;
        this.applyLocalFlags(MULTIPLAYER_LIFE_STATES.ACTIVE);

        if (respawned) {
            this.activeHealthInitialized = true;
            this.adapter.respawnLocalPlayer?.({
                health: state.health || state.maxHealth || 100
            });
        } else if (revived) {
            this.activeHealthInitialized = true;
            this.adapter.reviveLocalPlayer?.({
                health: state.health || Math.round(
                    Number(state.maxHealth || 100) * 0.4
                )
            });
        } else if (this.activeHealthInitialized !== true) {
            // Apply authoritative health once when entering/re-entering a run.
            // Routine ACTIVE snapshots must never heal over live combat damage.
            this.activeHealthInitialized = true;
            if (Number.isFinite(Number(state.health))) {
                this.player.health = Math.max(
                    1,
                    Math.min(
                        Number(state.maxHealth || this.player.maxHealth || 100),
                        Number(state.health)
                    )
                );
            }
            this.adapter.syncHud?.();
        } else {
            this.adapter.syncHud?.();
        }
    }

  applyLocalFlags(lifeState, { preserveAlive = false } = {}) {
    if (!this.player) return;
    this.player.multiplayerLifeState = lifeState;
    this.player.isDowned = lifeState === MULTIPLAYER_LIFE_STATES.DOWNED;
    this.player.isSpectating = (
            lifeState === MULTIPLAYER_LIFE_STATES.SPECTATING
        );
        this.adapter.setLocalWeaponVisible?.(
            lifeState === MULTIPLAYER_LIFE_STATES.ACTIVE
        );
    if (!preserveAlive) {
      this.player.alive = lifeState === MULTIPLAYER_LIFE_STATES.ACTIVE;
    }
  }

  isInputBlocked() {
    return (
      this.active
      && this.localAppliedState !== MULTIPLAYER_LIFE_STATES.ACTIVE
    );
  }

  hasReviveTarget() {
    return Boolean(this.currentReviveTarget || this.findNearestDownedTarget());
  }

  updateSpectatorCamera() {
    if (
      !this.active
      || this.localAppliedState !== MULTIPLAYER_LIFE_STATES.SPECTATING
      || !this.adapter.camera
    ) {
      this.spectatorTargetId = null;
      return;
    }

    const candidate = this.latestSnapshot?.players?.find((entry) => (
      entry?.connected !== false
      && entry.playerId !== this.runtime?.localPlayerId
      && entry.lifeState === MULTIPLAYER_LIFE_STATES.ACTIVE
    ));
    if (!candidate) return;
    const sampled = this.runtime?.sampleRemotePlayer?.(
      candidate.playerId,
      nowMs()
    )?.state;
    const state = sampled || candidate;
    if (!state?.position) return;

    this.spectatorTargetId = candidate.playerId;
    const yaw = Number(state.yaw || 0);
    this.spectatorPosition.set(
      Number(state.position.x || 0) - Math.sin(yaw) * 4,
      Number(state.position.y || 1.65) + 1.4,
      Number(state.position.z || 0) + Math.cos(yaw) * 4
    );
    this.adapter.camera.position.lerp(this.spectatorPosition, 0.12);
    this.adapter.camera.lookAt(
      Number(state.position.x || 0),
      Number(state.position.y || 1.65),
      Number(state.position.z || 0)
    );
  }

  ensureHud() {
    if (this.hudRoot || typeof document === 'undefined') return;
    const root = document.createElement('div');
    root.id = 'multiplayer-revive-hud';
    Object.assign(root.style, {
      position: 'fixed',
      left: '50%',
      top: '13%',
      transform: 'translateX(-50%)',
      zIndex: '45',
      pointerEvents: 'none',
      textAlign: 'center',
      fontFamily: 'system-ui, sans-serif',
      textShadow: '0 2px 4px #000',
      minWidth: '300px'
    });

    const status = document.createElement('div');
    Object.assign(status.style, {
      display: 'none',
      padding: '8px 14px',
      background: 'rgba(5, 10, 16, 0.82)',
      border: '2px solid #ff4a36',
      color: '#ffffff',
      fontWeight: '800',
      letterSpacing: '0.06em'
    });

    const team = document.createElement('div');
    Object.assign(team.style, {
      marginTop: '6px',
      color: '#d8f7ff',
      fontSize: '12px',
      fontWeight: '700'
    });

    root.append(status, team);
    document.body.appendChild(root);
    this.hudRoot = root;
    this.hudStatus = status;
    this.hudTeam = team;
  }

  hideHud() {
    if (this.hudRoot) this.hudRoot.style.display = 'none';
  }

  renderHud(now = nowMs()) {
    this.ensureHud();
    if (!this.hudRoot || !this.latestSnapshot) return;
    this.hudRoot.style.display = 'block';
    const local = this.latestSnapshot.players?.find(
      (entry) => entry?.playerId === this.runtime?.localPlayerId
    );
    let status = '';
    let border = '#ff4a36';

    if (this.isTeamEliminated()) {
      status = 'TEAM ELIMINATED · RETURNING TO LOBBY';
      border = '#ff4a36';
    } else if (local?.lifeState === MULTIPLAYER_LIFE_STATES.DOWNED) {
      const seconds = Math.max(
        0,
        Math.ceil((Number(local.bleedoutEndsAt || 0) - now) / 1000)
      );
      status = `DOWNED · BLEED OUT ${seconds}s`;
    } else if (
      local?.lifeState === MULTIPLAYER_LIFE_STATES.SPECTATING
    ) {
      status = 'SPECTATING · RESPAWN NEXT WAVE';
      border = '#00d4ff';
    } else if (this.currentReviveTarget) {
      const progress = Math.round(
        100
        * Number(this.currentReviveTarget.reviveProgressMs || 0)
        / Math.max(1, Number(this.latestSnapshot.reviveHoldMs || 3000))
      );
      status = (
        `HOLD ${this.adapter.getInteractLabel?.() || 'INTERACT'} TO REVIVE `
        + `${this.currentReviveTarget.displayName} `
        + `· ${this.currentReviveTarget.distance.toFixed(1)}m `
        + `· ${progress}%`
      );
      border = '#55ff88';
    }

    this.hudStatus.textContent = status;
    this.hudStatus.style.display = status ? 'block' : 'none';
    this.hudStatus.style.borderColor = border;

    this.hudTeam.textContent = (this.latestSnapshot.players || [])
      .filter((entry) => entry?.connected !== false)
      .map((entry) => (
        `${entry.displayName}: ${entry.lifeState}`
      ))
      .join('  ·  ');
  }

  updateMarkers() {
    if (this.isTeamEliminated()) {
      this.clearMarkers();
      return;
    }
    if (!this.scene || !this.latestSnapshot?.players) return;
    const localId = this.runtime?.localPlayerId;
    const visible = new Set();

    this.latestSnapshot.players.forEach((entry) => {
      if (
        !entry?.playerId
        || entry.playerId === localId
        || entry.connected === false
        || entry.lifeState !== MULTIPLAYER_LIFE_STATES.DOWNED
      ) {
        return;
      }
      visible.add(entry.playerId);
      let marker = this.markers.get(entry.playerId);
      if (!marker) {
        marker = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: makeMarkerTexture(entry.displayName),
            transparent: true,
            depthTest: false,
            depthWrite: false
          })
        );
        marker.name = `revive-marker-${entry.playerId}`;
        marker.scale.set(3.2, 1, 1);
        this.scene.add(marker);
        this.markers.set(entry.playerId, marker);
      }
      marker.position.set(
        Number(entry.position?.x || 0),
        Number(entry.position?.y || 0) + 2.35,
        Number(entry.position?.z || 0)
      );
      marker.visible = true;
    });

    this.markers.forEach((marker, playerId) => {
      if (!visible.has(playerId)) {
        marker.parent?.remove(marker);
        marker.material?.map?.dispose?.();
        marker.material?.dispose?.();
        this.markers.delete(playerId);
      }
    });
  }

  clearMarkers() {
    this.markers.forEach((marker) => {
      marker.parent?.remove(marker);
      marker.material?.map?.dispose?.();
      marker.material?.dispose?.();
    });
    this.markers.clear();
  }

  getSnapshot() {
    return {
      active: this.active,
      authority: this.isAuthority(),
      authorityEpoch: this.authorityEpoch,
      localLifeState: this.localAppliedState,
      currentReviveTargetId: this.currentReviveTarget?.playerId || null,
      spectatorTargetId: this.spectatorTargetId,
      lastSnapshotSentAt: this.lastSnapshotSentAt,
      lastSnapshotReceivedAt: this.lastSnapshotReceivedAt,
      state: this.latestSnapshot
    };
  }

  destroy() {
    this.endRun();
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
  }
}
