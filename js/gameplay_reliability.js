import {
  GAMEPLAY_RELIABILITY_PATCH,
  isPlayerPositionSafe,
  normalizePlayerReliabilityState
} from './gameplay_reliability_core.js';
import {
  WAVE_SPAWN_INTEGRITY_PATCH,
  normalizeWaveIncident
} from './wave_spawn_integrity_core.js';

const INCIDENT_STORAGE_KEY = 'ka_wave_incident_history_v1';
const MAX_PERSISTED_INCIDENTS = 40;

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
let incidentHistory = readIncidentHistory();
let incidentIds = new Set(incidentHistory.map((incident) => incident.id));

function copyPosition(value) {
  return {
    x: Number(value?.x) || 0,
    y: Number(value?.y) || 0,
    z: Number(value?.z) || 0
  };
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function readIncidentHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(INCIDENT_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeWaveIncident(entry))
      .filter((entry) => entry.id)
      .slice(-MAX_PERSISTED_INCIDENTS);
  } catch {
    return [];
  }
}

function saveIncidentHistory() {
  try {
    localStorage.setItem(
      INCIDENT_STORAGE_KEY,
      JSON.stringify(incidentHistory.slice(-MAX_PERSISTED_INCIDENTS))
    );
  } catch {
    // Private/restricted storage must not affect gameplay.
  }
}

function runContext() {
  const value = refs?.getRunContext?.() || {};
  return {
    mapId: String(value.mapId || 'unknown'),
    difficulty: Math.max(0.1, Number(value.difficulty) || 1),
    mode: String(value.mode || 'single')
  };
}

function syncEnemyIncidents(enemySnapshot = null) {
  const entries = Array.isArray(enemySnapshot?.incidents)
    ? enemySnapshot.incidents
    : (enemySnapshot?.latestIncident ? [enemySnapshot.latestIncident] : []);
  if (entries.length === 0) return 0;

  const context = runContext();
  let added = 0;
  for (const entry of entries) {
    const normalized = normalizeWaveIncident({
      ...entry,
      mapId: entry?.mapId || context.mapId,
      difficulty: entry?.difficulty || context.difficulty,
      mode: entry?.mode || context.mode
    });
    if (!normalized.id || incidentIds.has(normalized.id)) continue;
    incidentIds.add(normalized.id);
    incidentHistory.push(normalized);
    added += 1;
  }

  if (incidentHistory.length > MAX_PERSISTED_INCIDENTS) {
    incidentHistory = incidentHistory.slice(-MAX_PERSISTED_INCIDENTS);
    incidentIds = new Set(incidentHistory.map((incident) => incident.id));
  }
  if (added > 0) saveIncidentHistory();
  return added;
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
  root.dataset.kaGameplayReliabilityPatch = WAVE_SPAWN_INTEGRITY_PATCH;
  root.dataset.kaWaveIncidentCount = String(incidentHistory.length);
}

function buildIncidentReport() {
  const context = runContext();
  const enemies = refs?.getEnemyReliabilitySnapshot?.() || null;
  syncEnemyIncidents(enemies);
  return Object.freeze({
    patch: WAVE_SPAWN_INTEGRITY_PATCH,
    generatedAt: Date.now(),
    context: Object.freeze(context),
    currentEnemyState: enemies,
    incidentCount: incidentHistory.length,
    incidents: Object.freeze(incidentHistory.slice(-MAX_PERSISTED_INCIDENTS))
  });
}

function buildSnapshot(now = performance.now()) {
  const player = refs?.player;
  const enemies = refs?.getEnemyReliabilitySnapshot?.() || null;
  syncEnemyIncidents(enemies);
  snapshot = Object.freeze({
    patch: WAVE_SPAWN_INTEGRITY_PATCH,
    previousPatch: GAMEPLAY_RELIABILITY_PATCH,
    initialized,
    active,
    runSeconds: active ? Math.max(0, (now - runStartedAt) / 1000) : 0,
    lastUpdateAt,
    playerCorrections,
    positionRecoveries,
    lastCorrection,
    context: Object.freeze(runContext()),
    player: player
      ? Object.freeze({
        health: Number(player.health) || 0,
        maxHealth: Number(player.maxHealth) || 100,
        alive: player.alive === true,
        lifeState: lifeState(),
        position: copyPosition(player.pos)
      })
      : null,
    enemies,
    combat: refs?.getCombatReliabilitySnapshot?.() || null,
    revive: refs?.getReviveSnapshot?.() || null,
    waveIncidentCount: incidentHistory.length,
    latestWaveIncident: incidentHistory[incidentHistory.length - 1] || null,
    waveIncidents: Object.freeze(incidentHistory.slice(-12))
  });
  return snapshot;
}

export function initGameplayReliability(config = {}) {
  if (initialized) return buildSnapshot();
  refs = {
    player: config.player || null,
    getGameState: config.getGameState || (() => 'menu'),
    getRunContext: config.getRunContext || (() => ({})),
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
  window.KAGetWaveIncidentHistory = () => cloneJson(incidentHistory) || [];
  window.KAGetWaveIncidentReport = () => cloneJson(buildIncidentReport());
  window.KAClearWaveIncidentHistory = () => {
    incidentHistory = [];
    incidentIds = new Set();
    saveIncidentHistory();
    publish();
    return [];
  };
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
