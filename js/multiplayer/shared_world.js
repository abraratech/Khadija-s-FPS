// js/multiplayer/shared_world.js

import * as THREE from 'three';
import { createProceduralZombieVisual } from '../actors/procedural_zombie.js';
import { MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js';

const SNAPSHOT_INTERVAL_MS = 50;
const SNAPSHOT_STALE_MS = 1800;
const MAX_REMOTE_DAMAGE = 9999;
const MAX_HIT_REQUESTS_PER_SECOND = 45;

const TYPE_META = Object.freeze({
  SHAMBLER: {
    color: 0x446644,
    scale: [1, 1, 1],
    damage: 15,
    contactRange: 1.45,
    contactCooldown: 1.4,
    radius: 0.45
  },
  CRAWLER: {
    color: 0x667a3a,
    scale: [0.95, 0.62, 0.95],
    damage: 10,
    contactRange: 1.05,
    contactCooldown: 1.25,
    radius: 0.36
  },
  RUNNER: {
    color: 0x883333,
    scale: [0.85, 1.05, 0.85],
    damage: 9,
    contactRange: 1.35,
    contactCooldown: 0.9,
    radius: 0.40
  },
  BRUTE: {
    color: 0x4b275f,
    scale: [1.28, 1.28, 1.28],
    damage: 24,
    contactRange: 1.8,
    contactCooldown: 1.75,
    radius: 0.66
  },
  GOLIATH: {
    color: 0x1a1a1a,
    scale: [1.8, 1.8, 1.8],
    damage: 40,
    contactRange: 3.0,
    contactCooldown: 2.35,
    radius: 1.20
  },
  EXPLODER: {
    color: 0xff4400,
    scale: [1.15, 1.15, 1.15],
    damage: 42,
    contactRange: 2.25,
    contactCooldown: 2.0,
    radius: 0.50
  },
  RANGED: {
    color: 0x00ffff,
    scale: [0.8, 1.2, 0.8],
    damage: 18,
    contactRange: 1.45,
    contactCooldown: 1.8,
    radius: 0.40
  }
});

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.SHAMBLER;
}

function vectorPayload(vector) {
  return {
    x: Number(vector?.x || 0),
    y: Number(vector?.y || 0),
    z: Number(vector?.z || 0)
  };
}

function setEnemyReference(root, enemy) {
  root.userData.eRef = enemy;
  root.traverse?.((child) => {
    child.userData.eRef = enemy;
  });
}

function safeRemoveFromArray(array, value) {
  const index = array.indexOf(value);
  if (index >= 0) array.splice(index, 1);
}

export class SharedWorldManager {
  constructor({
    scene,
    eventBus,
    runtime,
    session,
    player,
    adapter,
    economy,
    revive
  } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.runtime = runtime;
    this.session = session;
    this.player = player;
    this.adapter = adapter || {};
    this.economy = economy || null;
    this.revive = revive || null;
    this.active = false;
    this.initializedForRun = false;
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotReceivedAt = -Infinity;
    this.authorityCounter = 0;
    this.authorityEpoch = 0;
    this.latestRemoteSnapshot = null; this.remoteAuthorityConnectionEpoch = null;
    this.enemyIdentity = new WeakMap();
    this.proxies = new Map();
    this.remoteTargets = new Map();
    this.hitWindows = new Map();
    this.scoredRemoteShots = new Set();
    this.unsubscribe = [];

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_WORLD_SNAPSHOT_RECEIVED,
        (event) => this.handleWorldSnapshot(event?.payload?.envelope)
      ) || (() => {})
    );

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_ENEMY_HIT_RECEIVED,
        (event) => this.handleEnemyHitRequest(event?.payload?.envelope)
      ) || (() => {})
    );

    this.unsubscribe.push(
      this.eventBus?.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_PLAYER_DAMAGE_RECEIVED,
        (event) => this.handlePlayerDamage(event?.payload?.envelope)
      ) || (() => {})
    );
  }

  isOnline() {
    return this.session?.mode === 'host' || this.session?.mode === 'client';
  }

  isAuthority() {
    return this.session?.mode !== 'client';
  }

  beginRun() {
    this.active = true;
    this.initializedForRun = false;
    this.lastSnapshotSentAt = -Infinity;
    this.lastSnapshotReceivedAt = -Infinity;
    this.authorityCounter = 0;
    this.authorityEpoch = Math.max(0, Number(this.runtime?.authorityEpoch) || 0);
    this.latestRemoteSnapshot = null; this.remoteAuthorityConnectionEpoch = null;
    this.enemyIdentity = new WeakMap();
    this.hitWindows.clear();
    this.scoredRemoteShots.clear();
    this.remoteTargets.clear();
    this.clearProxies();
    if (!this.isAuthority()) this.adapter.clearEnemiesForNetworkProxyMode?.();

    if (this.isAuthority()) {
      this.adapter.configureMultiplayerEnemyAuthority?.({
        localPlayerId: this.runtime?.localPlayerId || null,
        getTargets: () => this.getRemoteAuthorityTargets(),
        damageTarget: (target, damage, sourcePosition, damageType) => (
          this.damageAuthorityTarget(
            target,
            damage,
            sourcePosition,
            damageType
          )
        ),
        awardKill: (payload) => this.economy?.awardCombat?.(payload) === true
      });
    } else {
      this.adapter.configureMultiplayerEnemyAuthority?.(null);
    }
  }

  initializeEnemies() {
    if (!this.active || this.initializedForRun) return;
    this.initializedForRun = true;

    if (this.isAuthority()) {
      this.adapter.initEnemies?.();
      return;
    }

    this.adapter.clearEnemiesForNetworkProxyMode?.();
    this.clearProxies();
    this.latestRemoteSnapshot = null;
    this.remoteAuthorityConnectionEpoch = null;
    this.adapter.applyNetworkWaveState?.(1, false);
  }

  update(dt, now = nowMs()) {
    if (!this.active) return;

    if (!this.initializedForRun) {
      this.initializeEnemies();
    }

    if (this.isAuthority()) {
      this.adapter.updateEnemies?.(dt);
      if (this.isOnline() && now - this.lastSnapshotSentAt >= SNAPSHOT_INTERVAL_MS) {
        this.lastSnapshotSentAt = now;
        this.runtime?.sendWorldSnapshot?.(this.buildSnapshot(now));
      }
      return;
    }

    this.updateClientProxies(dt, now);
  }

forceAuthoritativeSnapshot(reason = 'manual') {
    if (!this.active || !this.isOnline() || !this.isAuthority()) return null;
    const now = nowMs();
    this.lastSnapshotSentAt = now;
    const snapshot = this.buildSnapshot(now);
    snapshot.reconciliationReason = String(reason || 'manual').slice(0, 80);
    return this.runtime?.sendWorldSnapshot?.(snapshot) || null;
  }

  endRun() {
    this.active = false;
    this.initializedForRun = false;
    this.adapter.configureMultiplayerEnemyAuthority?.(null);
    this.clearProxies();
    if (!this.isAuthority()) this.adapter.clearEnemiesForNetworkProxyMode?.();
    this.latestRemoteSnapshot = null;
    this.remoteAuthorityConnectionEpoch = null;
    this.lastSnapshotReceivedAt = -Infinity;
    this.lastSnapshotSentAt = -Infinity;
    this.authorityCounter = 0;
    this.enemyIdentity = new WeakMap();
    this.remoteTargets.clear();
    this.hitWindows.clear();
    this.scoredRemoteShots.clear();
  }

  buildSnapshot(now) {
    const enemies = this.adapter.getActiveEnemies?.() || [];
    return { runId: this.session?.run?.runId || null, serverFrameTime: now,
      authorityEpoch: this.authorityEpoch,
      wave: Math.max(1, Number(this.adapter.getCurrentWave?.()) || 1),
      specialRound: this.adapter.getSpecialRound?.() === true,
      waveState: this.adapter.getNetworkEnemyWaveState?.() || null,
      scoredShotKeys: Array.from(this.scoredRemoteShots).slice(-512),
      enemies: enemies.map((enemy) => this.serializeEnemy(enemy))
    };
  }

  serializeEnemy(enemy) {
    let identity = this.enemyIdentity.get(enemy);

    if (!identity || (enemy.alive && identity.lastAlive === false)) {
      const existingId = enemy.networkId || null;
      if (!existingId) this.authorityCounter += 1;
      identity = {
        id: existingId
          || `enemy-${this.session?.run?.runId || 'run'}-${this.authorityCounter}`,
        lastAlive: enemy.alive === true
      };
      this.enemyIdentity.set(enemy, identity);
    }

    identity.lastAlive = enemy.alive === true;
    enemy.networkId = identity.id;

    return {
      id: identity.id,
      type: String(enemy.type || 'SHAMBLER'),
      position: vectorPayload(enemy.mesh?.position),
      yaw: Number(enemy.mesh?.rotation?.y || 0),
      health: Math.max(0, Number(enemy.health) || 0),
      maxHealth: Math.max(1, Number(enemy.maxHealth) || 100),
      alive: enemy.alive === true,
      walkT: Number(enemy.walkT || 0),
      attackState: String(enemy.attackState || 'IDLE'),
      attackAnimT: Number(enemy.attackAnimT || 0),
      hitReactT: Number(enemy.hitReactT || 0),
      targetPlayerId: enemy.targetPlayerId || null,
      content1Id: enemy.content1Id || null,
      objectivePriority: enemy.isPostFinal4Priority === true,
      postFinal8Boss: enemy.isPostFinal8Boss === true,
      postFinal8BossPhase: Math.max(0, Number(enemy.postFinal8BossPhase) || 0),
      postFinal8FactionId: enemy.postFinal8FactionId || null,
      postFinal8FactionLabel: enemy.postFinal8FactionLabel || null
    };
  }

  handleWorldSnapshot(envelope) {
    if (!this.active || this.isAuthority()) return;

    const expectedHost = this.runtime?.room?.hostPlayerId
      || this.session?.hostPlayerId
      || null;

    if (expectedHost && envelope?.playerId !== expectedHost) return;
    if (envelope?.runId && envelope.runId !== this.session?.run?.runId) return;

    const snapshot = envelope?.payload;
    if (!snapshot || !Array.isArray(snapshot.enemies)) return;

    if (snapshot.runId && snapshot.runId !== this.session?.run?.runId) return;
    const incomingConnectionEpoch = Math.max(
      0,
      Math.floor(Number(envelope?.connectionEpoch) || 0)
    );
    if (
      this.remoteAuthorityConnectionEpoch !== null
      && incomingConnectionEpoch < this.remoteAuthorityConnectionEpoch
    ) return;
    if (
      this.remoteAuthorityConnectionEpoch !== null
      && incomingConnectionEpoch > this.remoteAuthorityConnectionEpoch
    ) {
      this.clearProxies();
      this.latestRemoteSnapshot = null;
      this.lastSnapshotReceivedAt = -Infinity;
    }
    this.remoteAuthorityConnectionEpoch = incomingConnectionEpoch;
    const incomingFrame = Number(snapshot.serverFrameTime) || 0;
    const previousFrame = Number(this.latestRemoteSnapshot?.serverFrameTime) || -Infinity;
    const incomingEpoch = Number(envelope?.authorityEpoch ?? snapshot.authorityEpoch) || 0;
    if (incomingEpoch < this.authorityEpoch) return;
    if (incomingEpoch === this.authorityEpoch && incomingFrame <= previousFrame) return;
    this.latestRemoteSnapshot = JSON.parse(JSON.stringify(snapshot));
    this.authorityEpoch = Math.max(
      this.authorityEpoch,
      Number(envelope?.authorityEpoch ?? snapshot.authorityEpoch) || 0
    );
    this.lastSnapshotReceivedAt = nowMs();
    this.adapter.applyNetworkWaveState?.(
      snapshot.wave,
      snapshot.specialRound === true
    );

    const seen = new Set();

    snapshot.enemies.forEach((state) => {
      if (!state?.id) return;
      seen.add(state.id);
      let proxy = this.proxies.get(state.id);
      if (!proxy) {
        proxy = this.createProxy(state);
      }
      this.applyProxyState(proxy, state);
    });

    Array.from(this.proxies.entries()).forEach(([enemyId, proxy]) => {
      if (!seen.has(enemyId)) {
        this.removeProxy(enemyId, proxy);
      }
    });
  }

  createProxy(state) {
    const meta = typeMeta(state.type);
    const mesh = new THREE.Group();
    mesh.name = `network-enemy-${state.id}`;

    const visual = createProceduralZombieVisual({ color: meta.color });
    visual.scale.set(meta.scale[0], meta.scale[1], meta.scale[2]);
    mesh.add(visual);

    const proxy = {
      networkId: state.id,
      type: state.type || 'SHAMBLER',
      mesh,
      visual,
      health: Number(state.health) || 1,
      maxHealth: Number(state.maxHealth) || 100,
      alive: state.alive !== false,
      isNetworkProxy: true,
      colRadius: meta.radius,
      damage: meta.damage,
      attackRange: meta.contactRange,
      attackRate: meta.contactCooldown,
      contactCooldown: 0,
            predictedDeadUntil: 0,
            targetPosition: new THREE.Vector3(),
      targetYaw: Number(state.yaw || 0),
      walkT: Number(state.walkT || 0),
      attackState: String(state.attackState || 'IDLE'),
      attackAnimT: Number(state.attackAnimT || 0),
      hitReactT: Number(state.hitReactT || 0),
      targetPlayerId: state.targetPlayerId || null,
      content1Id: state.content1Id || null,
      isPostFinal4Priority: state.objectivePriority === true,
      isPostFinal8Boss: state.postFinal8Boss === true,
      postFinal8BossPhase: Math.max(0, Number(state.postFinal8BossPhase) || 0),
      postFinal8FactionId: state.postFinal8FactionId || null,
      postFinal8FactionLabel: state.postFinal8FactionLabel || null,
      handleNetworkHit: (hit) => {
                const predictedDamage = Math.max(1, Math.min(
                    MAX_REMOTE_DAMAGE,
                    Number(hit?.damage) || 1
                ));

                // Client prediction is visual only. The host remains authoritative,
                // but hit reaction/death no longer waits a full network round trip.
                proxy.hitReactT = Math.max(Number(proxy.hitReactT) || 0, 0.16);
                proxy.health = Math.max(0, Number(proxy.health || 0) - predictedDamage);
                if (proxy.health <= 0) {
                    proxy.alive = false;
                    proxy.predictedDeadUntil = nowMs() + 600;
                    proxy.mesh.visible = false;
                }

                this.runtime?.sendEnemyHitRequest?.({
                    enemyId: state.id,
                    damage: predictedDamage,
                    headshot: hit?.headshot === true,
                    distance: Math.max(0, Number(hit?.distance) || 0),
                    weaponFamily: String(hit?.weaponFamily || 'UNKNOWN').slice(0, 32),
                    point: hit?.point || null
                });
            }
    };

    setEnemyReference(mesh, proxy);
    mesh.position.set(
      Number(state.position?.x || 0),
      Number(state.position?.y || 0),
      Number(state.position?.z || 0)
    );
    proxy.targetPosition.copy(mesh.position);
    mesh.rotation.y = proxy.targetYaw;
    mesh.visible = proxy.alive;

    this.scene?.add(mesh);
    this.proxies.set(state.id, proxy);

    const activeEnemies = this.adapter.getActiveEnemies?.();
    if (Array.isArray(activeEnemies) && !activeEnemies.includes(proxy)) {
      activeEnemies.push(proxy);
    }

    return proxy;
  }

  applyProxyState(proxy, state) {
        proxy.type = state.type || proxy.type;
        const authoritativeHealth = Math.max(0, Number(state.health) || 0);
        const authoritativeAlive = state.alive !== false && authoritativeHealth > 0;
        const predictionActive = (
            Number(proxy.predictedDeadUntil || 0) > nowMs()
            && authoritativeAlive
        );

        proxy.maxHealth = Math.max(
            1,
            Number(state.maxHealth) || proxy.maxHealth
        );

        if (predictionActive) {
            proxy.health = Math.min(
                Math.max(0, Number(proxy.health) || 0),
                authoritativeHealth
            );
            proxy.alive = false;
        } else {
            proxy.health = authoritativeHealth;
            proxy.alive = authoritativeAlive;
            proxy.predictedDeadUntil = 0;
        }

        proxy.walkT = Number(state.walkT || proxy.walkT || 0);
        proxy.attackState = String(state.attackState || 'IDLE');
        proxy.attackAnimT = Number(state.attackAnimT || 0);
        proxy.hitReactT = Math.max(
            Number(state.hitReactT || 0),
            Number(proxy.hitReactT || 0)
        );
        proxy.targetPlayerId = state.targetPlayerId || null;
        proxy.content1Id = state.content1Id || null;
        proxy.isPostFinal4Priority = state.objectivePriority === true;
        proxy.isPostFinal8Boss = state.postFinal8Boss === true;
        proxy.postFinal8BossPhase = Math.max(0, Number(state.postFinal8BossPhase) || 0);
        proxy.postFinal8FactionId = state.postFinal8FactionId || null;
        proxy.postFinal8FactionLabel = state.postFinal8FactionLabel || null;
        proxy.visual?.traverse?.((child) => {
          const materials = Array.isArray(child?.material)
            ? child.material
            : (child?.material ? [child.material] : []);
          materials.forEach((material) => {
            if (!material?.emissive?.setHex) return;
            if (proxy.isPostFinal8Boss) {
              material.emissive.setHex(0xff3d9a);
              material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, 0.72);
            } else if (proxy.isPostFinal4Priority) {
              material.emissive.setHex(0x00d4ff);
              material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, 0.42);
            }
          });
        });
        proxy.targetPosition.set(
            Number(state.position?.x || 0),
            Number(state.position?.y || 0),
            Number(state.position?.z || 0)
        );
        proxy.targetYaw = Number(state.yaw || 0);
        proxy.mesh.visible = proxy.alive;
    }

  updateClientProxies(dt, now) {
    const stale = now - this.lastSnapshotReceivedAt > SNAPSHOT_STALE_MS;
    const blend = 1 - Math.exp(-Math.max(0, dt) * 16);

    this.proxies.forEach((proxy) => {
      proxy.contactCooldown = Math.max(0, proxy.contactCooldown - dt);
      proxy.mesh.visible = proxy.alive && !stale;
      if (!proxy.mesh.visible) return;

      const moveDeltaX = proxy.targetPosition.x - proxy.mesh.position.x;
      const moveDeltaZ = proxy.targetPosition.z - proxy.mesh.position.z;
      const isMoving = (
        moveDeltaX * moveDeltaX + moveDeltaZ * moveDeltaZ
      ) > 0.0004;

      proxy.mesh.position.lerp(proxy.targetPosition, blend);

      if (isMoving) {
        // Face the direction the synchronized proxy is actually travelling.
        // This prevents a newly created proxy from briefly retaining an older
        // host-facing yaw while it moves toward an operative.
        proxy.mesh.lookAt(
          proxy.targetPosition.x,
          proxy.mesh.position.y,
          proxy.targetPosition.z
        );
      } else {
        const yawDelta = Math.atan2(
          Math.sin(proxy.targetYaw - proxy.mesh.rotation.y),
          Math.cos(proxy.targetYaw - proxy.mesh.rotation.y)
        );
        proxy.mesh.rotation.y += yawDelta * blend;
      }

      proxy.walkT += dt * 7;
      proxy.visual.position.y = Math.sin(proxy.walkT * 2) * 0.025;
      proxy.visual.rotation.z = Math.sin(proxy.walkT) * 0.018;

      // Damage is authoritative on the host and arrives through
      // PLAYER_DAMAGE envelopes. Client proxies are visual/raycast targets only.
    });
  }

  configureAuthorityAdapter() {
    if (!this.isAuthority()) {
      this.adapter.configureMultiplayerEnemyAuthority?.(null);
      return;
    }

    this.adapter.configureMultiplayerEnemyAuthority?.({
      localPlayerId: this.runtime?.localPlayerId || null,
      getTargets: () => this.getRemoteAuthorityTargets(),
      damageTarget: (target, damage, sourcePosition, damageType) => (
        this.damageAuthorityTarget(target, damage, sourcePosition, damageType)
      ),
      awardKill: (payload) => this.economy?.awardCombat?.(payload) === true
    });
  }

  applyMigrationCheckpoint(checkpoint = null, {
    becameHost = this.isAuthority()
  } = {}) {
    const checkpointConnectionEpoch = Math.max(
      0,
      Math.floor(Number(checkpoint?.authorityConnectionEpoch) || 0)
    );
    const snapshot = checkpoint?.world || this.latestRemoteSnapshot;
    if (!snapshot || !Array.isArray(snapshot.enemies)) {
      if (!becameHost) return false;
      this.clearProxies();
      this.adapter.initEnemies?.();
      this.initializedForRun = true;
      this.configureAuthorityAdapter();
      return true;
    }

    this.authorityEpoch = Math.max(
      this.authorityEpoch,
      Number(checkpoint?.authorityEpoch ?? snapshot.authorityEpoch) || 0
    );

    if (becameHost) {
      this.remoteAuthorityConnectionEpoch = null;
      this.clearProxies();
      this.scoredRemoteShots = new Set(
        Array.isArray(snapshot.scoredShotKeys)
          ? snapshot.scoredShotKeys.slice(-512)
          : []
      );
      this.adapter.restoreNetworkEnemySnapshot?.(snapshot);
      this.adapter.resumeNetworkWaveAfterMigration?.(snapshot);
      this.initializedForRun = true;
      this.enemyIdentity = new WeakMap();
      this.authorityCounter = 0;
      (this.adapter.getActiveEnemies?.() || []).forEach((enemy) => {
        if (!enemy?.networkId) return;
        const suffix = Number(String(enemy.networkId).split('-').pop()) || 0;
        this.authorityCounter = Math.max(this.authorityCounter, suffix);
        this.enemyIdentity.set(enemy, {
          id: enemy.networkId,
          lastAlive: enemy.alive === true
        });
      });
      this.configureAuthorityAdapter();
      this.lastSnapshotSentAt = -Infinity;
      this.runtime?.sendWorldSnapshot?.(this.buildSnapshot(nowMs()));
      return true;
    }

    this.adapter.clearEnemiesForNetworkProxyMode?.();
    this.clearProxies();
    this.remoteAuthorityConnectionEpoch = checkpointConnectionEpoch || null;
    this.latestRemoteSnapshot = JSON.parse(JSON.stringify(snapshot));
    this.adapter.applyNetworkWaveState?.(
      snapshot.wave,
      snapshot.specialRound === true
    );
    const seen = new Set();
    snapshot.enemies.forEach((state) => {
      if (!state?.id) return;
      seen.add(state.id);
      let proxy = this.proxies.get(state.id);
      if (!proxy) proxy = this.createProxy(state);
      this.applyProxyState(proxy, state);
    });
    Array.from(this.proxies.entries()).forEach(([enemyId, proxy]) => {
      if (!seen.has(enemyId)) this.removeProxy(enemyId, proxy);
    });
    this.initializedForRun = true;
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
    if (becameHost) {
      return this.applyMigrationCheckpoint(checkpoint, { becameHost: true });
    }

    this.configureAuthorityAdapter();
    const applied = this.applyMigrationCheckpoint(
      checkpoint,
      { becameHost: false }
    );
    if (applied) return true;

    // Never keep enemy proxies from the previous authority when a migration
    // checkpoint is missing. Clear them and request a fresh host snapshot.
    this.adapter.clearEnemiesForNetworkProxyMode?.();
    this.clearProxies();
    this.latestRemoteSnapshot = null;
    this.remoteAuthorityConnectionEpoch = null;
    this.lastSnapshotReceivedAt = -Infinity;
    this.initializedForRun = true;
    this.runtime?.sendStateResyncRequest?.({
      reason: 'host-migration-checkpoint-missing',
      targetHostPlayerId: this.session?.hostPlayerId || null
    });
    return false;
  }


  isLateJoinProtected(playerId, now = Date.now()) {
    if (!playerId) return false;
    const roomPlayer = (
      this.runtime?.room?.getSnapshot?.()?.players || []
    ).find((entry) => entry?.playerId === playerId);
    return Boolean(
      roomPlayer
      && roomPlayer.connected !== false
      && Number(roomPlayer.lateJoinProtectionUntil || 0) > Number(now)
    );
  }

getRemoteAuthorityTargets(now = nowMs()) {
    if (!this.active || !this.isAuthority() || !this.isOnline()) return [];

    const roomPlayers = this.runtime?.room?.getSnapshot?.()?.players || [];
    const roomIds = new Set();
    const targets = [];

    roomPlayers.forEach((roomPlayer) => {
      const playerId = roomPlayer?.playerId;
      if (!playerId || playerId === this.runtime?.localPlayerId) return;
      roomIds.add(playerId);
      if (this.isLateJoinProtected(playerId, Date.now())) return;

      const sampledState = this.runtime?.sampleRemotePlayer?.(playerId, now)?.state;
      const authorityState = this.revive?.getAuthorityPlayerState?.(playerId);
      let target = this.remoteTargets.get(playerId);
      const position = (
        roomPlayer.connected === false
          ? authorityState?.position || sampledState?.position || target?.pos
          : sampledState?.position || authorityState?.position || target?.pos
      );
      if (!target && !position) return;

      if (!target) {
        target = {
          playerId,
          isLocal: false,
          pos: new THREE.Vector3(),
          alive: true,
          health: 100,
          maxHealth: 100,
          connected: roomPlayer.connected !== false
        };
        this.remoteTargets.set(playerId, target);
      }

      if (position) {
        target.pos.set(
          Number(position.x || 0),
          Number(position.y || 0),
          Number(position.z || 0)
        );
      }
      target.connected = roomPlayer.connected !== false;
      target.health = Math.max(0, Number(
        authorityState?.health ?? sampledState?.health ?? target.health ?? 100
      ));
      target.maxHealth = Math.max(1, Number(
        authorityState?.maxHealth ?? sampledState?.maxHealth ?? target.maxHealth ?? 100
      ));
      const lifeState = String(
        authorityState?.lifeState
        || sampledState?.lifeState
        || (sampledState?.alive === false ? 'DOWNED' : 'ACTIVE')
      ).toUpperCase();
      target.alive = lifeState === 'ACTIVE' && target.health > 0;
      targets.push(target);
    });

    Array.from(this.remoteTargets.keys()).forEach((playerId) => {
      if (!roomIds.has(playerId)) this.remoteTargets.delete(playerId);
    });

    return targets;
  }

  damageAuthorityTarget(
    target,
    damage,
    sourcePosition = null,
    damageType = 'UNKNOWN'
  ) {
    if (!target?.playerId) return false; if (this.isLateJoinProtected(target.playerId, Date.now())) return false;

    const amount = Math.max(0, Number(damage) || 0);
    if (amount <= 0 || target.alive === false) return false;

    if (target.isLocal || target.playerId === this.runtime?.localPlayerId) {
      this.adapter.damagePlayer?.(amount, sourcePosition, damageType);
      return true;
    }

    const authorityResult = this.revive?.applyAuthorityDamage?.(
      target.playerId,
      amount,
      { sourcePosition, damageType, now: nowMs() }
    );
    if (authorityResult?.applied) {
      target.health = Math.max(0, Number(authorityResult.health) || 0);
      target.alive = authorityResult.lifeState === 'ACTIVE' && target.health > 0;
    }

    const delivered = target.connected !== false
      ? Boolean(this.runtime?.sendPlayerDamage?.({
          targetPlayerId: target.playerId,
          damage: amount,
          authoritativeHealth: authorityResult?.applied
            ? Math.max(0, Number(authorityResult.health) || 0)
            : null,
          authorityLifeState: authorityResult?.lifeState || null,
          damageType: String(damageType || 'UNKNOWN').slice(0, 40),
          sourcePosition: sourcePosition
            ? vectorPayload(sourcePosition)
            : null
        }))
      : false;
    return Boolean(authorityResult?.applied || delivered);
  }

  handlePlayerDamage(envelope) {
    if (!this.active || this.isAuthority()) return;

    const expectedHost = this.runtime?.room?.hostPlayerId
      || this.session?.hostPlayerId
      || null;

    if (expectedHost && envelope?.playerId !== expectedHost) return;
    if (envelope?.runId && envelope.runId !== this.session?.run?.runId) return;

    const damage = envelope?.payload;
    if (
      damage?.targetPlayerId !== this.runtime?.localPlayerId
      || this.player?.alive !== true || this.isLateJoinProtected(this.runtime?.localPlayerId, Date.now())
    ) {
      return;
    }

    const source = damage.sourcePosition
      ? new THREE.Vector3(
          Number(damage.sourcePosition.x || 0),
          Number(damage.sourcePosition.y || 0),
          Number(damage.sourcePosition.z || 0)
        )
      : null;

    const authoritativeHealth = Number(damage.authoritativeHealth);
    const amount = Number.isFinite(authoritativeHealth)
      ? Math.max(0, Number(this.player?.health || 0) - Math.max(0, authoritativeHealth))
      : Math.max(0, Number(damage.damage) || 0);
    if (amount <= 0) return;

    this.adapter.damagePlayer?.(
      amount,
      source,
      String(damage.damageType || 'UNKNOWN')
    );
  }

  isAuthorizedRemoteCombatant(playerId) {
    if (!playerId) return false;
    return (this.runtime?.room?.getSnapshot?.()?.players || []).some((entry) => (
      entry?.playerId === playerId
      && entry.isBot !== true
      && entry.connected !== false
    ));
  }

  handleEnemyHitRequest(envelope) {
    if (!this.active || !this.isAuthority() || this.session?.mode !== 'host') {
      return;
    }

    if (envelope?.runId && envelope.runId !== this.session?.run?.runId) return;
    if (!this.isAuthorizedRemoteCombatant(envelope?.playerId)) return;
    if (!this.allowHitRequest(envelope?.playerId)) return;

    const hit = envelope?.payload;
    const enemyId = String(hit?.enemyId || '');
    if (!enemyId) return;

    const enemies = this.adapter.getActiveEnemies?.() || [];
    const enemy = enemies.find(
      (candidate) => candidate?.alive && candidate.networkId === enemyId
    );
    if (!enemy) return;

    const remoteState = this.runtime?.sampleRemotePlayer?.(
      envelope.playerId,
      nowMs()
    )?.state;

    const weaponFamily = String(hit?.weaponFamily || 'UNKNOWN').toUpperCase();
    const reportedDistance = Number(hit?.distance);
    if (
      remoteState?.position
      && Number.isFinite(reportedDistance)
      && reportedDistance > 140
    ) {
      return;
    }
    if (weaponFamily === 'MELEE') {
      if (!Number.isFinite(reportedDistance) || reportedDistance > 3.25) return;
      if (remoteState?.position && enemy?.mesh?.position) {
        const dx = Number(enemy.mesh.position.x || 0) - Number(remoteState.position.x || 0);
        const dy = Number(enemy.mesh.position.y || 0) - Number(remoteState.position.y || 0);
        const dz = Number(enemy.mesh.position.z || 0) - Number(remoteState.position.z || 0);
        if (Math.hypot(dx, dy, dz) > 4.0) return;
      }
    }

    const baseDamage = Math.max(
      1,
      Math.min(MAX_REMOTE_DAMAGE, Math.round(Number(hit?.damage) || 1))
    );
    const gameplay4DamageScale = Math.max(0.5, Math.min(2,
      Number(globalThis.KAGetGameplay4BossDamageScale?.({
        enemyId: enemy.content1Id || enemy.networkId || enemyId,
        headshot: hit?.headshot === true
      })) || 1
    ));
    const damage = Math.max(1, Math.min(
      Math.round(MAX_REMOTE_DAMAGE * 2),
      Math.round(baseDamage * gameplay4DamageScale)
    ));
    const previousHealth = Math.max(0, Number(enemy.health) || 0);
    const killed = previousHealth > 0 && previousHealth - damage <= 0;

    if (!killed) {
      const shotId = String(hit?.shotId || envelope.sequence || 'shot');
      const scoreKey = `${envelope.playerId}:${shotId}:${enemyId}`;
      if (!this.scoredRemoteShots.has(scoreKey)) {
        this.scoredRemoteShots.add(scoreKey);
        if (this.scoredRemoteShots.size > 1024) {
          const oldest = this.scoredRemoteShots.values().next().value;
          if (oldest) this.scoredRemoteShots.delete(oldest);
        }
        const multiplier = Number(remoteState?.doublePointsTimer || 0) > 0 ? 2 : 1;
        this.economy?.awardCombat?.({
          playerId: envelope.playerId,
          points: 10 * multiplier,
          kills: 0,
          label: 'HIT',
          headshot: hit?.headshot === true
        });
      }
    }

    enemy.health -= damage;
    enemy.hitReactT = Math.max(
      enemy.hitReactT || 0,
      hit?.headshot ? 0.22 : 0.15
    );
    try {
      globalThis.KAContent1EnemyDamaged?.({
        enemyId: enemy.content1Id || enemy.networkId || enemyId,
        damage: Math.min(previousHealth, damage),
        headshot: hit?.headshot === true,
        actorId: envelope.playerId,
        health: Math.max(0, Number(enemy.health) || 0),
        maxHealth: Math.max(1, Number(enemy.maxHealth) || 1)
      });
    } catch {
      // POST-FINAL.8 replayability is optional during isolated network tests.
    }

    if (enemy.health <= 0 && enemy.alive) {
      this.adapter.killEnemy?.(enemy, {
        headshot: hit?.headshot === true,
        distance: Math.max(0, Number(hit?.distance) || 0),
        weaponFamily: String(hit?.weaponFamily || 'REMOTE'),
        damage,
        source: 'REMOTE_PLAYER',
        playerId: envelope.playerId,
        creditPlayerId: envelope.playerId,
        creditLocal: false,
        doublePoints: Number(remoteState?.doublePointsTimer || 0) > 0
      });
    }
  }

  allowHitRequest(playerId) {
    if (!playerId) return false;
    const now = nowMs();
    let window = this.hitWindows.get(playerId);

    if (!window || now - window.startedAt >= 1000) {
      window = { startedAt: now, count: 0 };
      this.hitWindows.set(playerId, window);
    }

    window.count += 1;
    return window.count <= MAX_HIT_REQUESTS_PER_SECOND;
  }

  removeProxy(enemyId, proxy = this.proxies.get(enemyId)) {
    if (!proxy) return;
    proxy.mesh?.parent?.remove(proxy.mesh);
    safeRemoveFromArray(this.adapter.getActiveEnemies?.() || [], proxy);
    this.proxies.delete(enemyId);
  }

  clearProxyArray() {
    const activeEnemies = this.adapter.getActiveEnemies?.();
    if (!Array.isArray(activeEnemies)) return;

    for (let index = activeEnemies.length - 1; index >= 0; index -= 1) {
      if (activeEnemies[index]?.isNetworkProxy) {
        activeEnemies.splice(index, 1);
      }
    }
  }

  clearProxies() {
    this.proxies.forEach((proxy, enemyId) => {
      this.removeProxy(enemyId, proxy);
    });
    this.proxies.clear();
    this.clearProxyArray();
  }

  getSnapshot() {
    return {
      active: this.active,
      authority: this.isAuthority(),
      mode: this.session?.mode || 'singleplayer',
      authorityEpoch: this.authorityEpoch,
      hasMigrationCheckpoint: Boolean(this.latestRemoteSnapshot),
      proxies: this.proxies.size,
      lastSnapshotReceivedAt: this.lastSnapshotReceivedAt,
      lastSnapshotSentAt: this.lastSnapshotSentAt
    };
  }

  destroy() {
    this.endRun();
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
  }
}
