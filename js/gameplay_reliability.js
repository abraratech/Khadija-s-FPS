// js/gameplay_reliability.js
import {
  GAMEPLAY_RELIABILITY_PATCH,
  isPlayerPositionSafe,
  normalizePlayerReliabilityState
} from './gameplay_reliability_core.js';

let initialized = false;
let active = false;
let refs = null;
let lastSafePosition = { x: 3, y: 1.75, z: 10 };
let runStartedAt = 0;
let lastUpdateAt = 0;
let playerCorrections = 0;
let positionRecoveries = 0;
let lastCorrection = 'NONE';
let snapshot = null;

function copyPosition(value) {
  return {
    x: Number(value?.x) || 0,
    y: Number(value?.y) || 0,
    z: Number(value?.z) || 0
  };
}

function lifeState() {
  const revive = refs?.getReviveSnapshot?.();
  return (
    revive?.localLifeState
    || refs?.player?.multiplayerLifeState
    || 'ACTIVE'
  );
}

function publish() {
  const root = document.documentElement;
  root.dataset.kaGameplayReliability = initialized ? 'ready' : 'idle';
  root.dataset.kaGameplayReliabilityActive = active ? 'true' : 'false';
  root.dataset.kaGameplayReliabilityLastCorrection = lastCorrection;
  root.dataset.kaGameplayReliabilityPatch = GAMEPLAY_RELIABILITY_PATCH;
}

function buildSnapshot(now = performance.now()) {
  const player = refs?.player;
  snapshot = Object.freeze({
    patch: GAMEPLAY_RELIABILITY_PATCH,
    initialized,
    active,
    runSeconds: active ? Math.max(0, (now - runStartedAt) / 1000) : 0,
    lastUpdateAt,
    playerCorrections,
    positionRecoveries,
    lastCorrection,
    player: player
      ? Object.freeze({
        health: Number(player.health) || 0,
        maxHealth: Number(player.maxHealth) || 100,
        alive: player.alive === true,
        lifeState: lifeState(),
        position: copyPosition(player.pos)
      })
      : null,
    enemies: refs?.getEnemyReliabilitySnapshot?.() || null,
    combat: refs?.getCombatReliabilitySnapshot?.() || null,
    revive: refs?.getReviveSnapshot?.() || null
  });
  return snapshot;
}

export function initGameplayReliability(config = {}) {
  if (initialized) return buildSnapshot();
  refs = {
    player: config.player || null,
    getGameState: config.getGameState || (() => 'menu'),
    getEnemyReliabilitySnapshot:
      config.getEnemyReliabilitySnapshot || (() => null),
    getCombatReliabilitySnapshot:
      config.getCombatReliabilitySnapshot || (() => null),
    getReviveSnapshot:
      config.getReviveSnapshot || (() => null),
    showToast: config.showToast || (() => {})
  };
  initialized = true;
  publish();
  window.KAGetGameplayReliability = () => buildSnapshot();
  return buildSnapshot();
}

export function beginGameplayReliability() {
  if (!initialized) return null;
  active = true;
  runStartedAt = performance.now();
  lastUpdateAt = runStartedAt;
  playerCorrections = 0;
  positionRecoveries = 0;
  lastCorrection = 'NONE';
  if (isPlayerPositionSafe(refs?.player?.pos)) {
    lastSafePosition = copyPosition(refs.player.pos);
  }
  publish();
  return buildSnapshot(runStartedAt);
}

export function updateGameplayReliability(dt = 0, now = performance.now()) {
  if (!initialized) return null;
  const gameState = refs?.getGameState?.() || 'menu';
  if (!active && gameState !== 'playing') {
    lastUpdateAt = now;
    return buildSnapshot(now);
  }

  const player = refs?.player;
  if (!player) return buildSnapshot(now);
  const normalized = normalizePlayerReliabilityState({
    health: player.health,
    maxHealth: player.maxHealth,
    alive: player.alive,
    lifeState: lifeState()
  });

  if (player.maxHealth !== normalized.maxHealth) {
    player.maxHealth = normalized.maxHealth;
    playerCorrections += 1;
    lastCorrection = 'MAX_HEALTH';
  }
  if (player.health !== normalized.health) {
    player.health = normalized.health;
    playerCorrections += 1;
    lastCorrection = 'HEALTH';
  }
  if (player.alive !== normalized.alive && normalized.alive === false) {
    player.alive = false;
    playerCorrections += 1;
    lastCorrection = 'LETHAL_STATE';
  }

  if (isPlayerPositionSafe(player.pos)) {
    lastSafePosition = copyPosition(player.pos);
  } else if (player.pos?.set) {
    player.pos.set(
      lastSafePosition.x,
      lastSafePosition.y,
      lastSafePosition.z
    );
    player.vel?.set?.(0, 0, 0);
    positionRecoveries += 1;
    lastCorrection = 'PLAYER_POSITION';
    refs.showToast?.('PLAYER POSITION RECOVERED', '#ffaa00', 900);
  }

  const currentLifeState = lifeState();
  if (currentLifeState !== 'ACTIVE') {
    player.isADS = false;
    player.isSprinting = false;
    player.currentADSFOV = null;
    player.vel?.set?.(0, 0, 0);
  }

  lastUpdateAt = now;
  publish();
  return buildSnapshot(now);
}

export function endGameplayReliability(reason = 'ended') {
  if (!initialized) return null;
  active = false;
  lastCorrection = `ENDED:${String(reason || 'ended').toUpperCase()}`;
  publish();
  return buildSnapshot();
}

export function getGameplayReliabilitySnapshot() {
  return buildSnapshot();
}
