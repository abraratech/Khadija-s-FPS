// js/multiplayer/foundation.js

import { MultiplayerEventBus, MULTIPLAYER_EVENTS } from './event_bus.js';
import { MultiplayerSession } from './session.js';
import { MultiplayerPlayerRegistry } from './player_registry.js';
import { MultiplayerTransport } from './transport.js';
import { MultiplayerRuntime } from './runtime.js';
import { MultiplayerLobbyController } from './lobby.js';
import { RemotePlayerManager } from './remote_players.js';

let sessionRef = null;
let runLauncher = null;
let pendingOnlineRun = null;
let remotePlayerManager = null;
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

export function initializeMultiplayerFoundation(player, { scene = null } = {}) {
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
        console.error('[M2] Multiplayer run launcher has not been registered.');
      }
    }
  });
  lobbyController.initialize();

  initialized = true;

  console.info(
    '[M2.1-M2.4] Online lobby, WebSocket transport, synchronized launch, and remote players ready.'
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
  return sessionSnapshot;
}

export function endMultiplayerRun({ reason = 'ended', player = null } = {}) {
  if (!initialized) return null;

  const state = multiplayerPlayers.syncLocalPlayer(
    player,
    performance.now(),
    { force: true }
  );

  multiplayerRuntime.endRun();
  remotePlayerManager?.endRun();
  lobbyController?.notifyRunEnded?.(reason);

  return multiplayerSession.endRun({
    reason,
    playerSnapshot: state
  });
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
    remotePlayers: remotePlayerManager?.getSnapshot?.() || null
  };
}

export { MULTIPLAYER_EVENTS };
