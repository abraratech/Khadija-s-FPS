// js/multiplayer/foundation.js

import { MultiplayerEventBus, MULTIPLAYER_EVENTS } from './event_bus.js';
import { MultiplayerSession } from './session.js';
import { MultiplayerPlayerRegistry } from './player_registry.js';
import { MultiplayerTransport } from './transport.js';
import { MultiplayerRuntime } from './runtime.js';
import { MultiplayerLobbyController } from './lobby.js';
import { RemotePlayerManager } from './remote_players.js';
import { SharedWorldManager } from './shared_world.js';
import { MultiplayerEconomyManager } from './economy.js';
import { MultiplayerReviveManager } from './revive.js';

let sessionRef = null;
let runLauncher = null;
let runEndHandler = null;
let pendingOnlineRun = null;
let remotePlayerManager = null;
let sharedWorldManager = null;
let economyManager = null;
let reviveManager = null;
let lobbyController = null;

export const multiplayerEvents = new MultiplayerEventBus({
  sourceIdProvider: () => sessionRef?.clientId || 'bootstrap'
});

export const multiplayerTransport = new MultiplayerTransport({
  eventBus: multiplayerEvents
});

sessionRef = new MultiplayerSession({
  eventBus: multiplayerEvents,
  transport: multiplayerTransport
});

export const multiplayerSession = sessionRef;

export const multiplayerPlayers = new MultiplayerPlayerRegistry({
  eventBus: multiplayerEvents,
  syncIntervalMs: 50
});

export const multiplayerRuntime = new MultiplayerRuntime({
  eventBus: multiplayerEvents,
  transport: multiplayerTransport,
  session: multiplayerSession,
  players: multiplayerPlayers,
  commandSendIntervalMs: 1000 / 30,
  snapshotInterpolationDelayMs: 100
});

let initialized = false;

function localPlayerId() {
  return `player-${multiplayerSession.clientId}`;
}

export function registerMultiplayerRunLauncher(launcher) {
  if (typeof launcher !== 'function') {
    throw new TypeError('registerMultiplayerRunLauncher requires a function.');
  }
  runLauncher = launcher;
}

export function registerMultiplayerRunEndHandler(handler) {
  if (typeof handler !== 'function') {
    throw new TypeError(
      'registerMultiplayerRunEndHandler requires a function.'
    );
  }
  runEndHandler = handler;
}

export function initializeMultiplayerFoundation(
  player,
  {
    scene = null,
    worldAdapter = null,
    economyAdapter = null,
    reviveAdapter = null
  } = {}
) {
  if (initialized) return getMultiplayerFoundationSnapshot();

  const playerId = localPlayerId();

  multiplayerPlayers.registerLocalPlayer(player, {
    playerId,
    displayName: 'Player 1'
  });

  multiplayerSession.initializeLocalSession({ hostPlayerId: playerId });
  multiplayerTransport.connect();
  multiplayerRuntime.initialize({ localPlayerId: playerId });

  remotePlayerManager = new RemotePlayerManager({
    scene,
    eventBus: multiplayerEvents,
    runtime: multiplayerRuntime,
    localPlayerId: playerId
  });

  economyManager = new MultiplayerEconomyManager({
    eventBus: multiplayerEvents,
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    players: multiplayerPlayers,
    player,
    adapter: economyAdapter
  });

  sharedWorldManager = new SharedWorldManager({
    scene,
    eventBus: multiplayerEvents,
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    player,
    adapter: worldAdapter,
    economy: economyManager
  });

  reviveManager = new MultiplayerReviveManager({
    eventBus: multiplayerEvents,
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    player,
    scene,
    adapter: reviveAdapter
  });

  lobbyController = new MultiplayerLobbyController({
    eventBus: multiplayerEvents,
    transport: multiplayerTransport,
    session: multiplayerSession,
    runtime: multiplayerRuntime,
    players: multiplayerPlayers,
    localPlayerId: playerId,
    onStartRun: (start) => {
      pendingOnlineRun = start;
      if (typeof runLauncher === 'function') {
        runLauncher(start);
      } else {
        console.error('[M3] Multiplayer run launcher has not been registered.');
      }
    },
    onRunEnded: (details = {}) => {
      pendingOnlineRun = null;
      sharedWorldManager?.endRun();
      reviveManager?.endRun();
      economyManager?.endRun();
      multiplayerRuntime.endRun();
      remotePlayerManager?.endRun();

      const state = multiplayerPlayers.syncLocalPlayer(
        player,
        performance.now(),
        { force: true }
      );

      multiplayerSession.endRun({
        reason: details.reason || 'ended',
        playerSnapshot: state
      });

      runEndHandler?.(details);
    }
  });
  lobbyController.initialize();

  initialized = true;

  console.info(
    '[M3.5-M3.6] Downed, revive, spectating, and team elimination ready.'
  );

  return getMultiplayerFoundationSnapshot();
}

export function beginMultiplayerRun({
  mapId,
  difficulty,
  fromRespawn = false
} = {}) {
  if (!initialized) {
    throw new Error('Multiplayer foundation must be initialized before a run starts.');
  }

  multiplayerPlayers.syncLocalPlayer(null, performance.now(), { force: true });

  const pending = pendingOnlineRun;
  pendingOnlineRun = null;

  const sessionSnapshot = multiplayerSession.beginRun({
    runId: pending?.runId || null,
    mapId: pending?.mapId || mapId,
    difficulty: pending?.difficulty ?? difficulty,
    fromRespawn
  });

  multiplayerRuntime.beginRun(sessionSnapshot);
  remotePlayerManager?.beginRun();
  economyManager?.beginRun();
  reviveManager?.beginRun();
  sharedWorldManager?.beginRun();
  return sessionSnapshot;
}

export function endMultiplayerRun({
  reason = 'ended',
  player = null,
  notifyServer = true
} = {}) {
  if (!initialized) return null;

  const state = multiplayerPlayers.syncLocalPlayer(
    player,
    performance.now(),
    { force: true }
  );

  sharedWorldManager?.endRun();
  reviveManager?.endRun();
  economyManager?.endRun();
  multiplayerRuntime.endRun();
  remotePlayerManager?.endRun();

  if (notifyServer) {
    lobbyController?.notifyRunEnded?.(reason);
  }

  return multiplayerSession.endRun({
    reason,
    playerSnapshot: state
  });
}

export function notifyMultiplayerPlayerDeath(reason = 'death') {
  return lobbyController?.notifyPlayerDied?.(reason) === true;
}

export function openMultiplayerLobby() {
  lobbyController?.openLobby?.();
}

export function isOnlineMultiplayerRun() {
  return multiplayerSession?.run?.active === true
    && (
      multiplayerSession.mode === 'host'
      || multiplayerSession.mode === 'client'
    );
}

export function initializeSharedMultiplayerEconomy() {
  if (!initialized) return;
  economyManager?.initializeWorld();
}

export function updateSharedMultiplayerEconomy(
  now = performance.now()
) {
  if (!initialized) return;
  economyManager?.update(now);
}

export function requestMultiplayerInteraction(request) {
  if (!initialized) return false;
  return economyManager?.requestInteraction?.(request) === true;
}

export function awardMultiplayerCombat(payload = {}) {
  if (!initialized) return false;
  return economyManager?.awardCombat?.({
    ...payload,
    playerId: payload.playerId || multiplayerRuntime.localPlayerId
  }) === true;
}

export function getLocalMultiplayerPlayerId() {
  return multiplayerRuntime.localPlayerId || null;
}

export function refundMultiplayerPoints(playerId, points, label) {
  if (!initialized) return false;
  return economyManager?.refundPlayer?.(playerId, points, label) === true;
}

export function isSharedMultiplayerEconomyAuthority() {
  if (!initialized) return true;
  return economyManager?.isAuthority?.() !== false;
}

export function initializeSharedMultiplayerEnemies() {
  if (!initialized) return;
  sharedWorldManager?.initializeEnemies();
}

export function updateSharedMultiplayerWorld(
  dt,
  now = performance.now()
) {
  if (!initialized) return;
  sharedWorldManager?.update(dt, now);
}

export function updateMultiplayerRevive(
  dt,
  now = performance.now(),
  options = {}
) {
  if (!initialized) return;
  reviveManager?.update(dt, now, options);
}

export function notifyMultiplayerLocalDowned(reason = 'damage') {
  if (!initialized) return false;
  return reviveManager?.handleLocalDeath?.(reason) === true;
}

export function isMultiplayerLifeInputBlocked() {
  if (!initialized) return false;
  return reviveManager?.isInputBlocked?.() === true;
}

export function getMultiplayerReviveSnapshot() {
  if (!initialized) return null;
  return reviveManager?.getSnapshot?.() || null;
}

export function isSharedMultiplayerWorldAuthority() {
  if (!initialized) return true;
  return sharedWorldManager?.isAuthority?.() !== false;
}

// Retained for compatibility with M1.1 callers and tests.
export function syncMultiplayerLocalPlayer(player, now = performance.now()) {
  if (!initialized) return null;
  return multiplayerPlayers.syncLocalPlayer(player, now);
}

export function syncMultiplayerFrame(
  player,
  frameKeys = {},
  {
    dt = 0,
    now = performance.now(),
    lookDeltaX = 0,
    lookDeltaY = 0
  } = {}
) {
  if (!initialized) return null;

  const state = multiplayerPlayers.syncLocalPlayer(player, now);
  const input = multiplayerRuntime.captureFrame({
    frameKeys,
    player,
    dt,
    lookDeltaX,
    lookDeltaY,
    now
  });

  remotePlayerManager?.update(now);
  return { state, input };
}

export function sampleRemoteMultiplayerPlayer(
  playerId,
  now = performance.now()
) {
  if (!initialized) return null;
  return multiplayerRuntime.sampleRemotePlayer(playerId, now);
}

export function getMultiplayerFoundationSnapshot() {
  return {
    initialized,
    session: multiplayerSession.getSnapshot(),
    players: multiplayerPlayers.getPlayersSnapshot(),
    transportState: multiplayerTransport.getState(),
    runtime: multiplayerRuntime.getSnapshot(),
    lobby: lobbyController?.getSnapshot?.() || null,
    remotePlayers: remotePlayerManager?.getSnapshot?.() || null,
    sharedWorld: sharedWorldManager?.getSnapshot?.() || null,
    economy: economyManager?.getSnapshot?.() || null,
    revive: reviveManager?.getSnapshot?.() || null
  };
}

export { MULTIPLAYER_EVENTS };
