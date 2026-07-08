// js/multiplayer/foundation.js
import { MultiplayerEventBus, MULTIPLAYER_EVENTS } from './event_bus.js';
import { MultiplayerSession } from './session.js';
import { MultiplayerPlayerRegistry } from './player_registry.js';
import { NullMultiplayerTransport } from './transport.js';

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
  initialized = true;

  console.info('[M1.1] Multiplayer foundation ready in single-player compatibility mode.');
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
  return multiplayerSession.beginRun({ mapId, difficulty, fromRespawn });
}

export function endMultiplayerRun({ reason = 'ended', player = null } = {}) {
  if (!initialized) return null;

  const state = multiplayerPlayers.syncLocalPlayer(player, performance.now(), { force: true });
  return multiplayerSession.endRun({
    reason,
    playerSnapshot: state
  });
}

export function syncMultiplayerLocalPlayer(player, now = performance.now()) {
  if (!initialized) return null;
  return multiplayerPlayers.syncLocalPlayer(player, now);
}

export function getMultiplayerFoundationSnapshot() {
  return {
    initialized,
    session: multiplayerSession.getSnapshot(),
    players: multiplayerPlayers.getPlayersSnapshot(),
    transportState: multiplayerTransport.getState()
  };
}

export { MULTIPLAYER_EVENTS };
