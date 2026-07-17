// js/multiplayer/bot.js
// BOT.1 R2.8.2 — grounded wingman movement integrity.

import * as THREE from 'three';
import {
  BOT1_EYE_HEIGHT,
  isBotGroundSupportHit,
  resolveBotGroundEyeY
} from './bot_grounding_core.js';

import {
  SQUAD_COMMAND_STATUS,
  buildSquadCommandIntent,
  chooseCommandEnemyTarget,
  commandReached,
  isMovementSquadCommand,
  isRescueSquadCommand,
  shouldAcceptSquadCommand,
  squadCommandIsActive
} from './squad_command_core.js';
import { TACTICAL_PING_TYPES, normalizePingType } from './tactical_ping_core.js';

import {
  BOT1_BODY_RADIUS,
  BOT1_DISPLAY_NAME,
  BOT1_BURST_PAUSE_MS,
  BOT1_BURST_SHOTS,
  BOT1_FIRE_RANGE,
  BOT1_MAX_HEALTH,
  BOT1_SHOT_DAMAGE,
  BOT1_PATCH,
  BOT1_PLAYER_ID,
  BOT1_REVIVE_RANGE,
  buildBotAuthoritySyncDetails,
  buildSafeAnchorCandidates,
  chooseCollisionSafeStep,
  chooseBotIntent,
  computeBotShotAccuracy,
  computeBotVelocity,
  distanceSquared,
  isCriticalRescueThreat,
  resolveDownedHuman,
  selectBotEnemyTarget,
  selectBotRescueThreat,
  shouldBotFire,
  shouldPreserveBotReservation,
  shouldRecoverBotToHost,
  shouldReplaceBot
} from './bot_core.js';

function nowMs() {
  return (
    typeof performance !== 'undefined'
    && typeof performance.now === 'function'
  ) ? performance.now() : Date.now();
}

function clonePosition(value = {}) {
  return {
    x: Number(value.x || 0),
    y: Number(value.y || 0),
    z: Number(value.z || 0)
  };
}

function livingEnemies(enemies = []) {
  return enemies.filter((enemy) => (
    enemy?.alive !== false
    && Number(enemy?.dyingT) < 0
    && Number(enemy?.health || 0) > 0
  ));
}

const BOT_TEAM_ENEMY_MARK_COOLDOWN_MS = 6500;

export class MultiplayerBotManager {
  constructor({
    runtime,
    session,
    player,
    remotePlayers,
    sharedWorld,
    revive,
    getActiveEnemies = () => [],
    damageEnemy = () => ({ applied: false }),
    getWorldTargets = () => [],
    getWave = () => 1,
    markRunBotAssisted = () => null,
    showToast = () => {},
    onTeamAction = () => {}
  } = {}) {
    this.runtime = runtime;
    this.session = session;
    this.player = player;
    this.remotePlayers = remotePlayers;
    this.sharedWorld = sharedWorld;
    this.revive = revive;
    this.getActiveEnemies = getActiveEnemies;
    this.damageEnemy = damageEnemy;
    this.getWorldTargets = getWorldTargets;
    this.getWave = getWave;
    this.markRunBotAssisted = markRunBotAssisted;
    this.showToast = showToast;
    this.onTeamAction = onTeamAction;

    this.requested = false;
    this.active = false;
    this.runActive = false;
    this.pendingHumanReplacement = false;
    this.request = null;
    this.sequence = 0;
    this.actionSequence = 0;
    this.lastSnapshotAt = -Infinity;
    this.lastShotAt = -Infinity;
    this.lastUpdateAt = 0;
    this.startedAt = 0;
    this.activeMs = 0;
    this.replacementReason = null;
    this.holdPosition = null;
    this.currentTargetId = null;
    this.targetAcquiredAt = -Infinity;
    this.squadCommand = null;
    this.objectiveCommand = null;
    this.squadCommandSequence = 0;
    this.lastTeamEnemyMarkAt = -Infinity;
    this.lastSquadCommandToastAt = -Infinity;
    this.burstShots = 0;
    this.burstPauseUntil = -Infinity;
    this.raycaster = new THREE.Raycaster();
    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.groundRaycaster = new THREE.Raycaster();
    this.groundRayOrigin = new THREE.Vector3();
    this.groundRayDirection = new THREE.Vector3(0, -1, 0);
    this.lastGroundedEyeY = BOT1_EYE_HEIGHT;
    this.lastValidPosition = null;
    this.lastMeaningfulPosition = null;
    this.stuckSince = 0;
    this.lastRecoveryAt = -Infinity;
    this.lastClearanceCheckAt = -Infinity;
    this.state = this.makeInitialState();
  }

  makeInitialState() {
    const host = this.player?.pos || { x: 0, y: 1.75, z: 0 };
    return {
      isBot: true,
      botProfile: BOT1_PATCH,
      displayName: BOT1_DISPLAY_NAME,
      position: {
        x: Number(host.x || 0) + 1.4,
        y: BOT1_EYE_HEIGHT,
        z: Number(host.z || 0) + 1.4
      },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      onGround: true,
      health: BOT1_MAX_HEALTH,
      maxHealth: BOT1_MAX_HEALTH,
      alive: true,
      lifeState: 'ACTIVE',
      kills: 0,
      score: 0,
      isADS: false,
      isSprinting: false,
      reloading: false,
      currentWeaponIdx: 0,
      weaponKey: 'rifle',
      teamAlertSequence: 0,
      teamAlertKind: null,
      teamAlertTargetId: null,
      teamAlertPosition: null,
      teamAlertAtEpochMs: 0,
      squadIntentSequence: 0,
      squadIntentType: null,
      squadIntentStatus: SQUAD_COMMAND_STATUS.IDLE,
      squadIntentOwnerPlayerId: null,
      squadIntentOwnerName: null,
      squadIntentPosition: null,
      squadIntentTargetId: null,
      squadIntentExpiresAtEpochMs: 0,
      squadIntentVisibleUntilEpochMs: 0
    };
  }

  isAuthority() {
    return (
      this.session?.mode === 'host'
      && this.session?.run?.active === true
    );
  }

  requestFill(details = {}) {
    this.requested = true;
    this.request = {
      roomCode: details.roomCode || null,
      mapId: String(details.mapId || 'grid_bunker').slice(0, 80),
      difficulty: Number(details.difficulty) || 1,
      requestedAt: Date.now()
    };
    this.ensureVirtualPlayer();
    this.syncCompanionRoster(true);
    this.showToast?.(
      'AI WINGMATE RESERVED · START THE RUN WHEN READY',
      '#63d8ff',
      2200
    );
    return this.getSnapshot();
  }

  ensureVirtualPlayer() {
    this.remotePlayers?.upsertVirtualPlayer?.({
      playerId: BOT1_PLAYER_ID,
      displayName: BOT1_DISPLAY_NAME,
      ready: true,
      connected: true,
      isHost: false,
      isBot: true,
      botProfile: BOT1_PATCH
    });
  }

  syncCompanionRoster(active = true) {
    return this.runtime?.setVirtualCompanionPresence?.({
      active: active === true,
      playerId: BOT1_PLAYER_ID,
      displayName: BOT1_DISPLAY_NAME,
      botProfile: BOT1_PATCH
    }) === true;
  }

  beginRun() {
    this.runActive = true;
    if (!this.requested && this.hasVirtualReservation()) {
      this.requested = true;
      this.request = this.request || {
        roomCode: this.runtime?.room?.getSnapshot?.()?.roomCode || null,
        mapId: String(this.session?.run?.mapId || 'grid_bunker').slice(0, 80),
        difficulty: Number(this.session?.run?.difficulty) || 1,
        requestedAt: Date.now(),
        restoredForRestart: true
      };
    }
    this.pendingHumanReplacement = false;
    this.replacementReason = null;
    this.lastUpdateAt = nowMs();

    if (!this.requested || !this.isAuthority()) {
      this.active = false;
      return false;
    }

    // R2.7: human players and the AI wingman use separate slot classes.
    // Keep the requested companion deployed with up to two human operatives.
    if (this.connectedHumanCount() > 2) {
      this.clearReservation('human-cap-exceeded');
      this.showToast?.(
        'AI WINGMAN REQUIRES A TWO-HUMAN TEAM LIMIT',
        '#ffc08f',
        2200
      );
      return false;
    }

    this.active = true;
    this.startedAt = nowMs();
    this.activeMs = 0;
    this.state = this.makeInitialState();
    this.currentTargetId = null;
    this.targetAcquiredAt = -Infinity;
    this.squadCommand = null;
    this.objectiveCommand = null;
    this.squadCommandSequence = 0;
    this.holdPosition = null;
    this.burstShots = 0;
    this.burstPauseUntil = -Infinity;
    this.placeAtSafeAnchor(this.player?.pos, this.player?.yaw);
    this.ensureVirtualPlayer();
    this.syncCompanionRoster(true);
    this.syncReviveAuthority(this.startedAt, { initialize: true });
    this.markRunBotAssisted?.({
      botProfile: BOT1_PATCH,
      activeSeconds: 0,
      replacementReason: null
    });
    this.publishSnapshot(this.startedAt, true);
    this.showToast?.('AI WINGMATE DEPLOYED', '#63d8ff', 1800);
    return true;
  }

  endRun(reason = 'run-ended') {
    this.runActive = false;
    if (this.active) {
      this.activeMs += Math.max(0, nowMs() - this.lastUpdateAt);
      this.markRunBotAssisted?.({
        botProfile: BOT1_PATCH,
        activeSeconds: this.activeMs / 1000,
        replacementReason: reason
      });
    }
    const preserveReservation = shouldPreserveBotReservation({
      requested: this.requested || this.hasVirtualReservation(),
      reason,
      connectedHumanCount: this.connectedHumanCount(),
      roomExists: Boolean(this.runtime?.room?.getSnapshot?.()?.roomId)
    });

    this.releaseReviveHold(nowMs());
    this.squadCommand = null;
    this.objectiveCommand = null;
    this.active = false;
    this.remotePlayers?.removePlayer?.(BOT1_PLAYER_ID);
    this.runtime?.removeRemotePlayer?.(BOT1_PLAYER_ID);

    if (preserveReservation) {
      this.requested = true;
      this.replacementReason = `${reason}-awaiting-restart`;
      this.ensureVirtualPlayer();
    } else {
      this.clearReservation(reason);
    }
    return this.getSnapshot();
  }

  hasVirtualReservation() {
    const players = this.runtime?.room?.getSnapshot?.()?.players || [];
    return players.some((entry) => (
      entry?.playerId === BOT1_PLAYER_ID
      && entry.isBot === true
      && entry.connected !== false
    ));
  }

  clearReservation(reason = 'reservation-cleared') {
    this.requested = false;
    this.request = null;
    this.replacementReason = reason;
    this.syncCompanionRoster(false);
    this.runtime?.room?.removeVirtualPlayer?.(BOT1_PLAYER_ID);
    this.remotePlayers?.removePlayer?.(BOT1_PLAYER_ID);
    this.runtime?.removeRemotePlayer?.(BOT1_PLAYER_ID);
    return true;
  }

  connectedHumanCount() {
    const players = this.runtime?.room?.getSnapshot?.()?.players || [];
    return players.filter((entry) => (
      entry?.playerId
      && entry.playerId !== BOT1_PLAYER_ID
      && entry.isBot !== true
      && entry.connected !== false
    )).length;
  }


  handleHostMigration({
    checkpoint = null,
    becameHost = false,
    hostPlayerId = null,
    reason = 'host-migration'
  } = {}) {
    const now = nowMs();
    this.runActive = this.session?.run?.active === true;
    const reserved = this.hasVirtualReservation();

    if (!reserved) {
      this.active = false;
      this.requested = false;
      this.releaseReviveHold(now);
      return false;
    }

    this.requested = true;
    this.request = this.request || {
      roomCode: this.runtime?.room?.getSnapshot?.()?.roomCode || null,
      mapId: String(this.session?.run?.mapId || 'grid_bunker').slice(0, 80),
      difficulty: Number(this.session?.run?.difficulty) || 1,
      requestedAt: Date.now(),
      restoredForHostMigration: true
    };

    if (!becameHost || !this.runActive) {
      // The new authority will publish the same protected virtual actor. Keep
      // the rendered proxy and reservation, but stop this browser's AI loop.
      this.active = false;
      this.releaseReviveHold(now);
      return true;
    }

    const sampled = this.runtime?.sampleRemotePlayer?.(BOT1_PLAYER_ID, now) || null;
    const sampledState = sampled?.state || null;
    const initial = this.makeInitialState();
    this.state = {
      ...initial,
      ...(sampledState || {}),
      isBot: true,
      botProfile: BOT1_PATCH,
      displayName: BOT1_DISPLAY_NAME,
      position: clonePosition(sampledState?.position || initial.position),
      velocity: { x: 0, y: 0, z: 0 }
    };

    const revivePlayer = checkpoint?.revive?.players?.find?.(
      (entry) => entry?.playerId === BOT1_PLAYER_ID
    ) || null;
    if (revivePlayer) {
      this.state.health = Math.max(0, Number(revivePlayer.health) || 0);
      this.state.maxHealth = Math.max(
        1,
        Number(revivePlayer.maxHealth) || BOT1_MAX_HEALTH
      );
      this.state.lifeState = String(revivePlayer.lifeState || 'ACTIVE');
      this.state.alive = this.state.lifeState === 'ACTIVE'
        && this.state.health > 0;
      if (revivePlayer.position) {
        this.state.position = clonePosition(revivePlayer.position);
      }
    }

    const statsPlayer = checkpoint?.stats?.players?.find?.(
      (entry) => entry?.playerId === BOT1_PLAYER_ID
    ) || null;
    if (statsPlayer) {
      this.state.score = Math.max(
        0,
        Math.floor(Number(statsPlayer.currentPoints) || Number(this.state.score) || 0)
      );
      this.state.kills = Math.max(
        0,
        Math.floor(Number(statsPlayer.counters?.kills) || Number(this.state.kills) || 0)
      );
    }

    this.active = true;
    this.pendingHumanReplacement = false;
    this.replacementReason = null;
    this.sequence = Math.max(this.sequence, Math.floor(Number(sampled?.sequence) || 0));
    this.lastUpdateAt = now;
    this.lastSnapshotAt = -Infinity;
    this.currentTargetId = null;
    this.targetAcquiredAt = -Infinity;
    this.burstShots = 0;
    this.burstPauseUntil = -Infinity;
    this.applyGrounding();
    this.resetMovementIntegrity(this.state.position);
    this.ensureVirtualPlayer();
    this.syncCompanionRoster(true);
    this.syncReviveAuthority(now, { initialize: false });
    this.readAuthorityLifeState();
    this.publishSnapshot(now, true);
    this.showToast?.(
      reason === 'host-tab-hidden'
        ? 'HOST TAB PAUSED · AI CONTROL MOVED WITH AUTHORITY'
        : 'AI WINGMAN CONTROL TRANSFERRED TO NEW HOST',
      '#63d8ff',
      2200
    );
    console.info(
      `[BOT.1 R2.8.2] Companion authority restored on ${hostPlayerId || 'new-host'}.`
    );
    return true;
  }

  syncReviveAuthority(now, { initialize = false } = {}) {
    const core = this.revive?.core;
    if (!core) return null;
    const existing = core.players?.get?.(BOT1_PLAYER_ID) || null;
    const details = buildBotAuthoritySyncDetails({
      state: this.state,
      authorityExists: Boolean(existing),
      initialize,
      now
    });
    const state = core.ensurePlayer(BOT1_PLAYER_ID, details);
    core.setConnected(BOT1_PLAYER_ID, this.active, now);
    core.updatePlayer(BOT1_PLAYER_ID, {
      ...details,
      connected: this.active
    });
    return state;
  }

  readAuthorityLifeState() {
    const authority = this.revive?.getAuthorityPlayerState?.(BOT1_PLAYER_ID);
    if (!authority) return;
    this.state.health = Math.max(0, Number(authority.health) || 0);
    this.state.maxHealth = Math.max(
      1,
      Number(authority.maxHealth) || BOT1_MAX_HEALTH
    );
    this.state.lifeState = String(authority.lifeState || 'ACTIVE');
    this.state.alive = this.state.lifeState === 'ACTIVE' && this.state.health > 0;
  }

  authorityTarget() {
    if (!this.active || !this.isAuthority()) return null;
    return {
      playerId: BOT1_PLAYER_ID,
      isBot: true,
      isLocal: false,
      pos: new THREE.Vector3(
        Number(this.state.position.x || 0),
        Number(this.state.position.y || 0),
        Number(this.state.position.z || 0)
      ),
      alive: this.state.alive === true,
      health: Math.max(0, Number(this.state.health) || 0),
      maxHealth: Math.max(1, Number(this.state.maxHealth) || BOT1_MAX_HEALTH),
      connected: true
    };
  }

  resolveGroundedEyeY(position = {}, fallbackEyeY = this.lastGroundedEyeY) {
    const targets = this.getWorldTargets?.() || [];
    const fallback = Number.isFinite(Number(fallbackEyeY))
      ? Number(fallbackEyeY)
      : BOT1_EYE_HEIGHT;
    if (!targets.length) return fallback;

    const currentY = Number(position.y);
    const originY = Math.max(
      BOT1_EYE_HEIGHT + 8,
      Number.isFinite(currentY) ? currentY + 4 : BOT1_EYE_HEIGHT + 8
    );
    this.groundRaycaster.near = 0;
    this.groundRaycaster.far = 80;
    this.groundRayOrigin.set(
      Number(position.x || 0),
      originY,
      Number(position.z || 0)
    );
    this.groundRaycaster.ray.origin.copy(this.groundRayOrigin);
    this.groundRaycaster.ray.direction.copy(this.groundRayDirection);
    const hits = this.groundRaycaster.intersectObjects(targets, false);
    const groundedEyeY = resolveBotGroundEyeY({
      hits,
      fallbackEyeY: fallback,
      eyeHeight: BOT1_EYE_HEIGHT
    });
    if (hits.some(isBotGroundSupportHit)) {
      this.lastGroundedEyeY = groundedEyeY;
    }
    return groundedEyeY;
  }

  applyGrounding(position = this.state.position) {
    const eyeY = this.resolveGroundedEyeY(position);
    this.state.position.y = eyeY;
    this.state.velocity.y = 0;
    this.state.onGround = true;
    return eyeY;
  }

  isBlockingObject(object) {
    return Boolean(
      object
      && object.userData?.playerNonBlockingProjectile !== true
      && object.userData?.isMapDressing !== true
      && object.userData?.noCollision !== true
    );
  }

  firstBlockingHit(origin, direction, distance) {
    const targets = this.getWorldTargets?.() || [];
    if (!targets.length || distance <= 0.001) return null;
    this.raycaster.near = 0.01;
    this.raycaster.far = Math.max(0.01, distance);
    this.raycaster.ray.origin.copy(origin);
    this.raycaster.ray.direction.copy(direction);
    return this.raycaster.intersectObjects(targets, false)
      .find((hit) => this.isBlockingObject(hit?.object)) || null;
  }

  isRouteClear(from = {}, to = {}, radius = BOT1_BODY_RADIUS) {
    const start = clonePosition(from);
    const end = clonePosition(to);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.001) return true;

    const dirX = dx / distance;
    const dirZ = dz / distance;
    const sideX = -dirZ;
    const sideZ = dirX;
    const sideOffsets = [0, radius * 0.82, -radius * 0.82];
    const heightOffsets = [-1.18, -0.52];

    this.rayDirection.set(dirX, 0, dirZ);
    for (const side of sideOffsets) {
      for (const height of heightOffsets) {
        this.rayOrigin.set(
          start.x + sideX * side,
          Number(start.y || 1.75) + height,
          start.z + sideZ * side
        );
        const hit = this.firstBlockingHit(
          this.rayOrigin,
          this.rayDirection,
          distance + radius
        );
        if (hit && Number(hit.distance) <= distance + radius * 0.90) {
          return false;
        }
      }
    }
    return true;
  }

  isPositionClear(position = {}, radius = BOT1_BODY_RADIUS) {
    const directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [0.707, 0.707], [0.707, -0.707],
      [-0.707, 0.707], [-0.707, -0.707]
    ];
    const heightOffsets = [-1.18, -0.52];
    for (const height of heightOffsets) {
      for (const [x, z] of directions) {
        this.rayOrigin.set(
          Number(position.x || 0),
          Number(position.y || 1.75) + height,
          Number(position.z || 0)
        );
        this.rayDirection.set(x, 0, z).normalize();
        const hit = this.firstBlockingHit(
          this.rayOrigin,
          this.rayDirection,
          radius
        );
        if (hit && Number(hit.distance) < radius * 0.92) return false;
      }
    }
    return true;
  }

  resolveSafePositionNear(anchor = {}, yaw = 0, {
    allowAnchorFallback = true
  } = {}) {
    const origin = clonePosition(anchor);
    origin.y = this.resolveGroundedEyeY(origin);
    const candidates = buildSafeAnchorCandidates(origin, yaw);
    for (const candidate of candidates) {
      if (
        this.isRouteClear(origin, candidate, BOT1_BODY_RADIUS)
        && this.isPositionClear(candidate, BOT1_BODY_RADIUS)
      ) {
        return clonePosition(candidate);
      }
    }
    // Initial deployment may use the human anchor as a last-resort safety
    // fallback. Runtime recovery never overlaps the host because that can put
    // both operatives inside the same melee/explosion damage cluster.
    return allowAnchorFallback ? origin : null;
  }

  resetMovementIntegrity(position = this.state.position) {
    this.lastValidPosition = clonePosition(position);
    this.lastMeaningfulPosition = clonePosition(position);
    this.stuckSince = 0;
  }

  placeAtSafeAnchor(anchor = {}, yaw = 0, options = {}) {
    const safe = this.resolveSafePositionNear(anchor, yaw, options);
    if (!safe) return false;
    safe.y = this.resolveGroundedEyeY(safe);
    this.state.position = safe;
    this.state.velocity = { x: 0, y: 0, z: 0 };
    this.state.onGround = true;
    this.resetMovementIntegrity(safe);
    return true;
  }

  moveWithCollision(velocity = {}, step = 0, now = nowMs()) {
    let current = clonePosition(this.state.position);
    if (now - this.lastClearanceCheckAt >= 350) {
      this.lastClearanceCheckAt = now;
      if (
        !this.isPositionClear(current)
        && this.lastValidPosition
        && this.isPositionClear(this.lastValidPosition)
      ) {
        current = clonePosition(this.lastValidPosition);
        this.state.position.x = current.x;
        this.state.position.z = current.z;
      }
    }

    const dx = Number(velocity.x || 0) * step;
    const dz = Number(velocity.z || 0) * step;
    const full = { ...current, x: current.x + dx, z: current.z + dz };
    const xOnly = { ...current, x: current.x + dx };
    const zOnly = { ...current, z: current.z + dz };

    const fullClear = this.isRouteClear(current, full);
    let xClear = false;
    let zClear = false;
    if (!fullClear) {
      xClear = Math.abs(dx) > 0.0001 && this.isRouteClear(current, xOnly);
      zClear = Math.abs(dz) > 0.0001 && this.isRouteClear(current, zOnly);
    }
    const choice = chooseCollisionSafeStep({
      full: fullClear,
      xOnly: xClear,
      zOnly: zClear,
      deltaX: dx,
      deltaZ: dz
    });

    let next = current;
    if (choice === 'FULL') next = full;
    else if (choice === 'X') next = xOnly;
    else if (choice === 'Z') next = zOnly;

    const moved = Math.hypot(next.x - current.x, next.z - current.z);
    this.state.position.x = next.x;
    this.state.position.z = next.z;
    if (choice === 'BLOCKED') {
      this.state.velocity = { x: 0, y: 0, z: 0 };
    } else if (choice === 'X') {
      this.state.velocity = { x: Number(velocity.x || 0), y: 0, z: 0 };
    } else if (choice === 'Z') {
      this.state.velocity = { x: 0, y: 0, z: Number(velocity.z || 0) };
    }

    if (moved > 0.012) {
      this.lastValidPosition = clonePosition(this.state.position);
      if (
        !this.lastMeaningfulPosition
        || Math.sqrt(distanceSquared(this.lastMeaningfulPosition, this.state.position)) > 0.35
      ) {
        this.lastMeaningfulPosition = clonePosition(this.state.position);
        this.stuckSince = 0;
      }
    } else if (Math.hypot(dx, dz) > 0.025 && !this.stuckSince) {
      this.stuckSince = now;
    }

    return { moved, blocked: choice === 'BLOCKED', choice };
  }

  recoverFromStuck(now, intentKind = 'FOLLOW') {
    const host = this.player?.pos;
    if (!host) return false;
    const hostDistance = Math.sqrt(distanceSquared(this.state.position, host));
    const routeClear = this.isRouteClear(this.state.position, host);
    const stuckForMs = this.stuckSince > 0 ? now - this.stuckSince : 0;
    if (!shouldRecoverBotToHost({
      intentKind,
      hostDistance,
      stuckForMs,
      routeClear,
      sinceLastRecoveryMs: now - this.lastRecoveryAt
    })) {
      return false;
    }

    const recovered = this.placeAtSafeAnchor(host, this.player?.yaw, {
      allowAnchorFallback: false
    });
    if (recovered) {
      this.lastRecoveryAt = now;
      this.stuckSince = 0;
      this.state.isADS = false;
    }
    return recovered;
  }

  findAvoidance(direction) {
    const targets = this.getWorldTargets?.() || [];
    if (!targets.length) return null;

    this.rayOrigin.set(
      Number(this.state.position.x || 0),
      Number(this.state.position.y || 1.75) - 0.75,
      Number(this.state.position.z || 0)
    );
    this.rayDirection.set(
      Number(direction.x || 0),
      0,
      Number(direction.z || 0)
    );
    if (this.rayDirection.lengthSq() < 0.0001) return null;
    this.rayDirection.normalize();
    this.raycaster.near = 0.15;
    this.raycaster.far = 1.6;
    this.raycaster.ray.origin.copy(this.rayOrigin);
    this.raycaster.ray.direction.copy(this.rayDirection);
    const hits = this.raycaster.intersectObjects(targets, false);
    const blocking = hits.find((hit) => (
      this.isBlockingObject(hit?.object)
    ));
    if (!blocking) return null;

    return {
      x: -this.rayDirection.z,
      z: this.rayDirection.x
    };
  }

  hasLineOfSight(enemy) {
    const targets = this.getWorldTargets?.() || [];
    if (!enemy?.mesh?.position || !targets.length) return true;

    this.rayOrigin.set(
      Number(this.state.position.x || 0),
      Number(this.state.position.y || 1.75) - 0.35,
      Number(this.state.position.z || 0)
    );
    this.rayDirection.subVectors(
      enemy.mesh.position,
      this.rayOrigin
    );
    const distance = this.rayDirection.length();
    if (distance <= 0.2) return true;
    this.rayDirection.multiplyScalar(1 / distance);
    this.raycaster.near = 0.1;
    this.raycaster.far = Math.max(0.1, distance - 0.4);
    this.raycaster.ray.origin.copy(this.rayOrigin);
    this.raycaster.ray.direction.copy(this.rayDirection);
    const hits = this.raycaster.intersectObjects(targets, false);
    return !hits.some((hit) => (
      this.isBlockingObject(hit?.object)
    ));
  }

  updateRevive(now, downed) {
    if (!downed) {
      this.releaseReviveHold(now);
      return false;
    }

    const distance = Math.sqrt(
      distanceSquared(this.state.position, downed.position)
    );
    if (distance > BOT1_REVIVE_RANGE) {
      this.releaseReviveHold(now);
      return false;
    }

    this.revive?.core?.setReviveHold?.(
      BOT1_PLAYER_ID,
      downed.playerId,
      {
        holding: true,
        now,
        position: this.state.position
      }
    );
    return true;
  }

  releaseReviveHold(now) {
    this.revive?.core?.setReviveHold?.(
      BOT1_PLAYER_ID,
      null,
      { holding: false, now }
    );
  }

  fireAt(enemy, now) {
    if (
      !enemy
      || !shouldBotFire({
        now,
        lastShotAt: this.lastShotAt,
        targetAcquiredAt: this.targetAcquiredAt,
        burstPauseUntil: this.burstPauseUntil
      })
      || !this.hasLineOfSight(enemy)
    ) {
      this.state.isADS = false;
      return false;
    }

    const distance = Math.sqrt(
      distanceSquared(this.state.position, enemy.mesh.position)
    );
    if (distance > BOT1_FIRE_RANGE) {
      this.state.isADS = false;
      return false;
    }

    this.lastShotAt = now;
    this.state.isADS = true;
    const accuracy = computeBotShotAccuracy(distance);
    const roll = Math.abs(
      Math.sin((this.sequence + 1) * 12.9898 + Number(this.getWave?.() || 1))
    );
    if (roll <= accuracy) {
      const result = this.damageEnemy?.(enemy, BOT1_SHOT_DAMAGE, {
        botId: BOT1_PLAYER_ID,
        source: 'BOT',
        headshot: false
      });
      if (result?.killed) {
        this.state.kills += 1;
        this.onTeamAction?.('KILL', {
          actorId: BOT1_PLAYER_ID,
          displayName: BOT1_DISPLAY_NAME,
          isBot: true,
          eventId: `${this.state.runId || 'run'}:${BOT1_PLAYER_ID}:kill:${this.state.kills}`,
          at: now
        });
      }
    }

    this.burstShots += 1;
    if (this.burstShots >= BOT1_BURST_SHOTS) {
      this.burstShots = 0;
      this.burstPauseUntil = now + BOT1_BURST_PAUSE_MS;
    }

    this.actionSequence += 1;
    this.runtime?.sendVirtualGameplayAction?.(
      BOT1_PLAYER_ID,
      {
        action: 'FIRE',
        weaponKey: this.state.weaponKey,
        botProfile: BOT1_PATCH
      },
      this.actionSequence
    );
    this.remotePlayers?.flashMuzzle?.(BOT1_PLAYER_ID);
    return true;
  }

  removeForHuman(reason = 'human-replacement') {
    this.replacementReason = reason;
    this.pendingHumanReplacement = false;
    this.active = false;
    this.releaseReviveHold(nowMs());
    this.clearReservation(reason);
    this.markRunBotAssisted?.({
      botProfile: BOT1_PATCH,
      activeSeconds: this.activeMs / 1000,
      replacementReason: reason
    });
    this.showToast?.(
      'HUMAN OPERATIVE CONNECTED · AI WINGMATE STOOD DOWN',
      '#7df2a5',
      2200
    );
    return true;
  }

  commandOwnerPosition(command, now = nowMs()) {
    if (!command?.ownerPlayerId) return command?.position || null;
    const localPlayerId = this.runtime?.localPlayerId || null;
    if (command.ownerPlayerId === localPlayerId && this.player?.pos) {
      return clonePosition(this.player.pos);
    }
    const sampled = this.runtime?.sampleRemotePlayer?.(command.ownerPlayerId, now);
    return sampled?.state?.position
      ? clonePosition(sampled.state.position)
      : (command.position ? clonePosition(command.position) : null);
  }

  syncSquadIntentState(command, status = command?.status || SQUAD_COMMAND_STATUS.ACKNOWLEDGED, {
    visibleForMs = 0
  } = {}) {
    this.squadCommandSequence += 1;
    this.state.squadIntentSequence = this.squadCommandSequence;
    this.state.squadIntentType = command?.type || this.state.squadIntentType || null;
    this.state.squadIntentStatus = status;
    this.state.squadIntentOwnerPlayerId = command?.ownerPlayerId || this.state.squadIntentOwnerPlayerId || null;
    this.state.squadIntentOwnerName = command?.ownerName || this.state.squadIntentOwnerName || null;
    this.state.squadIntentPosition = command?.position
      ? clonePosition(command.position)
      : (this.state.squadIntentPosition ? clonePosition(this.state.squadIntentPosition) : null);
    this.state.squadIntentTargetId = command?.targetId || null;
    this.state.squadIntentExpiresAtEpochMs = Number(command?.expiresAtEpochMs || 0);
    this.state.squadIntentVisibleUntilEpochMs = visibleForMs > 0
      ? Date.now() + visibleForMs
      : Number(command?.expiresAtEpochMs || 0);
  }

  finishSquadCommand(status = SQUAD_COMMAND_STATUS.COMPLETE, now = nowMs(), message = '') {
    const command = this.squadCommand;
    if (!command) return false;
    this.syncSquadIntentState(command, status, { visibleForMs: 2600 });
    this.squadCommand = null;
    this.holdPosition = null;
    if (message && now - this.lastSquadCommandToastAt >= 900) {
      this.lastSquadCommandToastAt = now;
      this.showToast?.(`WINGMAN · ${message}`, status === SQUAD_COMMAND_STATUS.UNAVAILABLE ? '#ffc08f' : '#7df2a5', 1900);
    }
    this.publishSnapshot(now, true);
    return true;
  }

  handleObjectiveDirective(directive, receivedAt = nowMs()) {
    if (!directive || !this.active || !this.runActive || !this.isAuthority()) {
      this.objectiveCommand = null;
      return false;
    }

    const kind = String(directive.kind || '').toUpperCase();
    const stage = String(directive.stage || '').toUpperCase();
    let type = TACTICAL_PING_TYPES.MOVE;
    let position = directive.position || null;
    let targetId = directive.targetId || null;

    if (kind === 'PRIORITY_TARGET') {
      type = TACTICAL_PING_TYPES.ENEMY;
      if (directive.bossTargetId) targetId = directive.bossTargetId;
    } else if (kind === 'DEFEND_ZONE' || kind === 'EXTRACTION_HOLDOUT') {
      type = TACTICAL_PING_TYPES.DEFEND;
    } else if (kind === 'RESCUE_SURVIVOR' && stage === 'ESCORT') {
      type = TACTICAL_PING_TYPES.MOVE;
      position = directive.secondaryPosition || directive.position;
    } else if ([
      'RESTORE_EQUIPMENT',
      'RETRIEVE_DELIVER',
      'RESCUE_SURVIVOR'
    ].includes(kind)) {
      type = TACTICAL_PING_TYPES.INTERACT;
    } else if (kind === 'SURVIVAL_FALLBACK') {
      type = TACTICAL_PING_TYPES.DEFEND;
    }

    if (!position) {
      this.objectiveCommand = null;
      return false;
    }

    const commandId = `objective:${String(directive.operationId || 'operation')}:${stage}:${String(targetId || '')}`;
    const remainingMs = Math.max(
      1200,
      (Number(directive.expiresAt) || Date.now() + 5000) - Date.now()
    );
    const expiresAt = receivedAt + remainingMs;
    this.objectiveCommand = Object.freeze({
      commandId,
      type,
      priority: directive.bossStatus === 'ACTIVE' ? 30 : 25,
      status: type === TACTICAL_PING_TYPES.DEFEND
        ? SQUAD_COMMAND_STATUS.DEFENDING
        : (type === TACTICAL_PING_TYPES.INTERACT
          ? SQUAD_COMMAND_STATUS.INTERACTING
          : (type === TACTICAL_PING_TYPES.ENEMY
            ? SQUAD_COMMAND_STATUS.ENGAGING
            : SQUAD_COMMAND_STATUS.MOVING)),
      acknowledgement: directive.bossStatus === 'ACTIVE'
        ? `BOSS PHASE ${Math.max(1, Number(directive.bossPhase || 0) + 1)} ACKNOWLEDGED`
        : (directive.bossStage
          ? 'BOSS TARGET ACKNOWLEDGED'
          : (directive.extractionStage
            ? 'EXTRACTION DIRECTIVE ACKNOWLEDGED'
            : 'MISSION DIRECTIVE ACKNOWLEDGED')),
      ownerPlayerId: directive.bossStatus === 'ACTIVE'
        ? 'postfinal8-replayability-director'
        : 'postfinal7-mission-director',
      ownerName: directive.bossStatus === 'ACTIVE'
        ? (directive.bossLabel || directive.factionLabel || 'BOSS DIRECTOR')
        : (directive.missionLabel || 'MISSION DIRECTOR'),
      position: clonePosition(position),
      targetId: targetId ? String(targetId).slice(0, 96) : null,
      createdAt: receivedAt,
      expiresAt,
      createdAtEpochMs: Date.now(),
      expiresAtEpochMs: Date.now() + Math.max(1200, expiresAt - receivedAt),
      objectiveDirector: true,
      operationId: String(directive.operationId || '').slice(0, 180),
      objectiveKind: kind,
      objectiveStage: stage,
      postFinal7Patch: String(directive.postFinal7Patch || '').slice(0, 100),
      missionId: String(directive.missionId || '').slice(0, 100),
      missionLabel: String(directive.missionLabel || '').slice(0, 100),
      missionStageId: String(directive.missionStageId || '').slice(0, 180),
      missionStageType: String(directive.missionStageType || '').slice(0, 40),
      missionStageLabel: String(directive.missionStageLabel || '').slice(0, 100),
      postFinal8Patch: String(directive.postFinal8Patch || '').slice(0, 100),
      factionId: String(directive.factionId || '').slice(0, 80),
      factionLabel: String(directive.factionLabel || '').slice(0, 100),
      bossTargetId: directive.bossTargetId ? String(directive.bossTargetId).slice(0, 96) : null,
      bossLabel: String(directive.bossLabel || '').slice(0, 100),
      bossStatus: String(directive.bossStatus || '').slice(0, 30),
      bossPhase: Math.max(0, Number(directive.bossPhase) || 0),
      bossStagger: Math.max(0, Number(directive.bossStagger) || 0),
      weakPointHits: Math.max(0, Number(directive.weakPointHits) || 0),
      bossStage: directive.bossStage === true,
      extractionStage: directive.extractionStage === true,
      riskChoice: String(directive.riskChoice || '').slice(0, 20),
      humanSquadCommandsOverride: directive.humanSquadCommandsOverride !== false
    });

    if (!this.squadCommand) {
      if (type === TACTICAL_PING_TYPES.DEFEND) {
        this.holdPosition = clonePosition(position);
      } else if (
        this.holdPosition
        && [
          'postfinal4-objective-director',
          'postfinal7-mission-director',
          'postfinal8-replayability-director'
        ].includes(this.state.squadIntentOwnerPlayerId)
      ) {
        this.holdPosition = null;
      }
      this.syncSquadIntentState(this.objectiveCommand, this.objectiveCommand.status);
    }
    return true;
  }

  refreshObjectiveCommand(now = nowMs()) {
    if (!this.objectiveCommand) return null;
    if (!squadCommandIsActive(this.objectiveCommand, now)) {
      this.objectiveCommand = null;
      if (!this.squadCommand) this.holdPosition = null;
      return null;
    }
    return this.objectiveCommand;
  }

  handleTacticalCommand(ping, { receivedAt = nowMs() } = {}) {
    if (!this.active || !this.runActive || !this.isAuthority()) {
      return { accepted: false, reason: 'not-authority' };
    }
    if (!ping?.ownerPlayerId || ping.ownerPlayerId === BOT1_PLAYER_ID) {
      return { accepted: false, reason: 'invalid-owner' };
    }

    const candidate = buildSquadCommandIntent(ping, {
      now: receivedAt,
      epochNow: Date.now()
    });
    if (!candidate) return { accepted: false, reason: 'unsupported-command' };
    if (!shouldAcceptSquadCommand(this.squadCommand, candidate, receivedAt)) {
      return { accepted: false, reason: 'lower-priority' };
    }

    this.squadCommand = candidate;
    if (candidate.type === TACTICAL_PING_TYPES.DEFEND) {
      this.holdPosition = clonePosition(candidate.position);
    } else {
      this.holdPosition = null;
    }
    this.syncSquadIntentState(candidate, SQUAD_COMMAND_STATUS.ACKNOWLEDGED);
    if (receivedAt - this.lastSquadCommandToastAt >= 700) {
      this.lastSquadCommandToastAt = receivedAt;
      this.showToast?.(`WINGMAN · ${candidate.acknowledgement}`, '#63d8ff', 1800);
    }
    this.publishSnapshot(receivedAt, true);
    return { accepted: true, reason: 'acknowledged', command: candidate };
  }

  refreshSquadCommand(now = nowMs()) {
    if (!this.squadCommand) {
      if (
        this.state.squadIntentStatus !== SQUAD_COMMAND_STATUS.IDLE
        && Number(this.state.squadIntentVisibleUntilEpochMs || 0) <= Date.now()
      ) {
        this.state.squadIntentStatus = SQUAD_COMMAND_STATUS.IDLE;
        this.state.squadIntentType = null;
        this.state.squadIntentOwnerPlayerId = null;
        this.state.squadIntentOwnerName = null;
        this.state.squadIntentPosition = null;
        this.state.squadIntentTargetId = null;
        this.state.squadIntentExpiresAtEpochMs = 0;
        this.state.squadIntentVisibleUntilEpochMs = 0;
      }
      return null;
    }
    if (!squadCommandIsActive(this.squadCommand, now)) {
      this.finishSquadCommand(SQUAD_COMMAND_STATUS.COMPLETE, now, 'COMMAND WINDOW COMPLETE');
      return null;
    }

    if ([
      TACTICAL_PING_TYPES.FOLLOW_ME,
      TACTICAL_PING_TYPES.REGROUP,
      TACTICAL_PING_TYPES.NEED_HELP
    ].includes(normalizePingType(this.squadCommand.type))) {
      const livePosition = this.commandOwnerPosition(this.squadCommand, now);
      if (livePosition) {
        this.squadCommand = Object.freeze({
          ...this.squadCommand,
          position: clonePosition(livePosition)
        });
      }
    }
    return this.squadCommand;
  }

  publishTeamEnemyMark(enemy, targetId, now = nowMs()) {
    if (
      !enemy?.mesh?.position
      || now - this.lastTeamEnemyMarkAt < BOT_TEAM_ENEMY_MARK_COOLDOWN_MS
    ) {
      return false;
    }

    this.lastTeamEnemyMarkAt = now;
    this.state.teamAlertSequence = Math.max(
      0,
      Math.floor(Number(this.state.teamAlertSequence) || 0)
    ) + 1;
    this.state.teamAlertKind = 'ENEMY_MARK';
    this.state.teamAlertTargetId = String(targetId || '').slice(0, 96);
    this.state.teamAlertPosition = clonePosition(enemy.mesh.position);
    this.state.teamAlertAtEpochMs = Date.now();
    return true;
  }

  update(dt, now = nowMs()) {
    if (!this.active || !this.runActive || !this.isAuthority()) return;

    const step = Math.max(0, Math.min(0.10, Number(dt) || 0));
    this.activeMs += Math.max(0, now - this.lastUpdateAt);
    this.lastUpdateAt = now;

    const enemies = livingEnemies(this.getActiveEnemies?.() || []);
    const activeCommand = this.refreshSquadCommand(now)
      || this.refreshObjectiveCommand(now);
    const humanCount = this.connectedHumanCount();
    // R2.7: do not auto-stand-down for the supported host + ally team.
    this.pendingHumanReplacement = false;
    if (humanCount > 2) {
      this.removeForHuman('human-cap-exceeded');
      return;
    }

    this.syncReviveAuthority(now);
    this.readAuthorityLifeState();

    if (!this.state.alive) {
      this.state.velocity = { x: 0, y: 0, z: 0 };
      this.state.isADS = false;
      this.publishSnapshot(now);
      return;
    }

    const reviveSnapshot = this.revive?.getSnapshot?.() || null;
    const downed = resolveDownedHuman(reviveSnapshot, {
      hostPlayerId: this.runtime?.localPlayerId,
      hostPlayer: this.player,
      hostPosition: this.player?.pos
    });
    const commandedTarget = downed
      ? null
      : chooseCommandEnemyTarget(enemies, activeCommand);
    const target = downed
      ? null
      : (commandedTarget || selectBotEnemyTarget(
          enemies,
          this.state.position,
          this.player?.pos
        ));
    const rescueThreat = downed
      ? selectBotRescueThreat(
          enemies,
          this.state.position,
          downed.position
        )
      : null;

    const intent = chooseBotIntent({
      botPosition: this.state.position,
      hostPosition: this.player?.pos,
      targetPosition: target?.mesh?.position || null,
      downedTeammatePosition: downed?.position || null,
      holdPosition: this.holdPosition,
      squadCommand: activeCommand && isMovementSquadCommand(activeCommand.type)
        ? activeCommand
        : null
    });

    const direct = {
      x: Number(intent.destination.x || 0) - Number(this.state.position.x || 0),
      z: Number(intent.destination.z || 0) - Number(this.state.position.z || 0)
    };
    const velocityResult = computeBotVelocity({
      position: this.state.position,
      destination: intent.destination,
      desiredDistance: intent.desiredDistance,
      speed: intent.speed,
      dt: step,
      avoidance: this.findAvoidance(direct)
    });

    this.state.velocity = velocityResult.velocity;
    if (velocityResult.moving) {
      this.moveWithCollision(this.state.velocity, step, now);
      this.state.yaw = velocityResult.yaw;
      this.recoverFromStuck(now, intent.kind);
    } else {
      this.stuckSince = 0;
    }
    // R2.8.2: the wingman resolves its own authored floor support. Host jump
    // height and climbable obstacle height must never be copied into the bot.
    this.applyGrounding();
    this.state.isSprinting = intent.speed >= 4.1 && velocityResult.moving;

    if (activeCommand) {
      const commandType = normalizePingType(activeCommand.type);
      if (isRescueSquadCommand(commandType)) {
        if (downed) this.syncSquadIntentState(activeCommand, SQUAD_COMMAND_STATUS.REVIVING);
        else this.finishSquadCommand(SQUAD_COMMAND_STATUS.UNAVAILABLE, now, 'NO DOWNED OPERATIVE FOUND');
      } else if (commandType === TACTICAL_PING_TYPES.ENEMY) {
        if (commandedTarget || activeCommand.objectiveDirector === true) {
          this.syncSquadIntentState(activeCommand, SQUAD_COMMAND_STATUS.ENGAGING);
        } else {
          this.finishSquadCommand(SQUAD_COMMAND_STATUS.COMPLETE, now, 'MARKED THREAT CLEARED');
        }
      } else if ([TACTICAL_PING_TYPES.INTERACT, TACTICAL_PING_TYPES.BUY_OPEN].includes(commandType)) {
        if (activeCommand.objectiveDirector === true) {
          this.syncSquadIntentState(activeCommand, SQUAD_COMMAND_STATUS.INTERACTING);
        } else if (commandReached(activeCommand, this.state.position, 2.0)) {
          this.finishSquadCommand(SQUAD_COMMAND_STATUS.UNAVAILABLE, now, 'CANNOT OPERATE INTERACTABLE');
        } else {
          this.syncSquadIntentState(activeCommand, SQUAD_COMMAND_STATUS.INTERACTING);
        }
      } else if (commandType === TACTICAL_PING_TYPES.MOVE) {
        if (activeCommand.objectiveDirector === true) {
          this.syncSquadIntentState(
            activeCommand,
            commandReached(activeCommand, this.state.position, 1.8)
              ? SQUAD_COMMAND_STATUS.COMPLETE
              : SQUAD_COMMAND_STATUS.MOVING
          );
        } else if (commandReached(activeCommand, this.state.position, 1.8)) {
          this.finishSquadCommand(SQUAD_COMMAND_STATUS.COMPLETE, now, 'MOVE COMPLETE');
        } else {
          this.syncSquadIntentState(activeCommand, SQUAD_COMMAND_STATUS.MOVING);
        }
      } else if (commandType === TACTICAL_PING_TYPES.DEFEND) {
        this.syncSquadIntentState(activeCommand, SQUAD_COMMAND_STATUS.DEFENDING);
      } else if (commandType === TACTICAL_PING_TYPES.NEED_HELP) {
        this.syncSquadIntentState(activeCommand, SQUAD_COMMAND_STATUS.ASSISTING);
      } else {
        this.syncSquadIntentState(activeCommand, SQUAD_COMMAND_STATUS.REGROUPING);
      }
    }

    const criticalRescueThreat = Boolean(
      downed
      && rescueThreat
      && isCriticalRescueThreat(
        rescueThreat,
        this.state.position,
        downed.position
      )
      && this.hasLineOfSight(rescueThreat)
    );
    const reviving = criticalRescueThreat
      ? (this.releaseReviveHold(now), false)
      : this.updateRevive(now, downed);
    const combatTarget = downed ? rescueThreat : target;

    if (!reviving && combatTarget) {
      const targetDx = Number(combatTarget.mesh.position.x || 0)
        - Number(this.state.position.x || 0);
      const targetDz = Number(combatTarget.mesh.position.z || 0)
        - Number(this.state.position.z || 0);
      this.state.yaw = Math.atan2(-targetDx, -targetDz);
      const nextTargetId = String(
        combatTarget.networkEnemyId
        || combatTarget.enemyId
        || combatTarget.id
        || combatTarget.type
        || ''
      );
      if (nextTargetId !== this.currentTargetId) {
        this.currentTargetId = nextTargetId;
        this.targetAcquiredAt = now;
        this.publishTeamEnemyMark(combatTarget, nextTargetId, now);
        this.burstShots = 0;
        this.burstPauseUntil = -Infinity;
      }
      this.fireAt(combatTarget, now);
    } else {
      this.state.isADS = false;
      this.currentTargetId = null;
      this.targetAcquiredAt = -Infinity;
      this.burstShots = 0;
      this.burstPauseUntil = -Infinity;
    }

    this.syncReviveAuthority(now);
    this.publishSnapshot(now);
  }

  publishSnapshot(now, force = false) {
    if (!this.active) return null;
    if (!force && now - this.lastSnapshotAt < 50) return null;
    this.lastSnapshotAt = now;
    this.sequence += 1;
    return this.runtime?.sendVirtualPlayerSnapshot?.(
      BOT1_PLAYER_ID,
      {
        ...this.state,
        position: clonePosition(this.state.position),
        velocity: clonePosition(this.state.velocity),
        botActiveSeconds: this.activeMs / 1000,
        pendingHumanReplacement: this.pendingHumanReplacement
      },
      this.sequence
    );
  }

  getSnapshot() {
    return {
      schema: 1,
      patch: BOT1_PATCH,
      requested: this.requested,
      active: this.active,
      runActive: this.runActive,
      playerId: BOT1_PLAYER_ID,
      displayName: BOT1_DISPLAY_NAME,
      pendingHumanReplacement: this.pendingHumanReplacement,
      activeSeconds: this.activeMs / 1000,
      replacementReason: this.replacementReason,
      request: this.request ? { ...this.request } : null,
      squadCommand: this.squadCommand ? {
        ...this.squadCommand,
        position: clonePosition(this.squadCommand.position)
      } : null,
      objectiveCommand: this.objectiveCommand ? {
        ...this.objectiveCommand,
        position: clonePosition(this.objectiveCommand.position)
      } : null,
      state: {
        ...this.state,
        position: clonePosition(this.state.position),
        velocity: clonePosition(this.state.velocity)
      }
    };
  }
}
