// js/multiplayer/foundation.js

import { MultiplayerEventBus, MULTIPLAYER_EVENTS } from './event_bus.js';
import { MultiplayerSession } from './session.js';
import { MultiplayerPlayerRegistry } from './player_registry.js';
import { NullMultiplayerTransport } from './transport.js';
import { MultiplayerRuntime } from './runtime.js';

let sessionRef = null;

export const multiplayerEvents = new MultiplayerEventBus({
  sourceIdProvider: () => sessionRef?.clientId || 'bootstrap'
});

export const multiplayerTransport = new NullMultiplayerTransport({
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

export function initializeMultiplayerFoundation(player) {
  if (initialized) return getMultiplayerFoundationSnapshot();

  const playerId = localPlayerId();

  multiplayerPlayers.registerLocalPlayer(player, {
    playerId,
    displayName: 'Player 1'
  });

  multiplayerSession.initializeLocalSession({ hostPlayerId: playerId });
  multiplayerTransport.connect();
  multiplayerRuntime.initialize({ localPlayerId: playerId });

  initialized = true;

  console.info(
    '[M1.2-M1.5] Multiplayer protocol, command stream, snapshot buffer, and room model ready.'
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

  const sessionSnapshot = multiplayerSession.beginRun({
    mapId,
    difficulty,
    fromRespawn
  });

  multiplayerRuntime.beginRun(sessionSnapshot);
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

  return { state, input };
}

export function sampleRemoteMultiplayerPlayer(playerId, now = performance.now()) {
  if (!initialized) return null;
  return multiplayerRuntime.sampleRemotePlayer(playerId, now);
}

export function getMultiplayerFoundationSnapshot() {
  return {
    initialized,
    session: multiplayerSession.getSnapshot(),
    players: multiplayerPlayers.getPlayersSnapshot(),
    transportState: multiplayerTransport.getState(),
    runtime: multiplayerRuntime.getSnapshot()
  };
}

export { MULTIPLAYER_EVENTS };
