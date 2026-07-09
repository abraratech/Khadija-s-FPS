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
import { HostMigrationState } from './migration_core.js'; import { MultiplayerNetworkHud } from './network_hud.js';
import { MultiplayerTacticalAwareness } from './tactical_ping.js';
import { MultiplayerCoopStatsManager } from './coop_stats.js';
import { MultiplayerCoopScoreboard } from './coop_scoreboard.js';

let sessionRef = null;
let runLauncher = null;
let runEndHandler = null;
let pendingOnlineRun = null;
let pendingResumeCheckpoint = null;
let remotePlayerManager = null;
let sharedWorldManager = null;
let economyManager = null;
let reviveManager = null; let networkHud = null; let tacticalAwareness = null; let coopStatsManager = null; let coopScoreboard = null;
let lobbyController = null;
const hostMigrationState = new HostMigrationState();

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

function applyHostMigration(details = {}) {
  const authorityEpoch = Math.max(
    0,
    Math.floor(Number(details.authorityEpoch) || 0)
  );
  const becameHost = details.becameHost === true;

  hostMigrationState.begin({
    authorityEpoch,
    hostPlayerId: details.hostPlayerId,
    previousHostPlayerId: details.previousHostPlayerId,
    checkpoint: details.checkpoint,
    migratedAt: Date.now()
  });

  multiplayerRuntime.handleHostMigration?.({
    authorityEpoch,
    hostPlayerId: details.hostPlayerId
  });
  sharedWorldManager?.handleHostMigration?.({
    authorityEpoch,
    checkpoint: details.checkpoint,
    becameHost
  });
  economyManager?.handleHostMigration?.({
    authorityEpoch,
    checkpoint: details.checkpoint,
    becameHost
  });
  reviveManager?.handleHostMigration?.({
    authorityEpoch,
    checkpoint: details.checkpoint,
    becameHost
  });
  coopStatsManager?.handleHostMigration?.({
    authorityEpoch,
    checkpoint: details.checkpoint,
    becameHost
  });
  tacticalAwareness?.handleHostMigration?.({
    authorityEpoch,
    checkpoint: details.checkpoint,
    becameHost
  });

  hostMigrationState.markResumed();
  console.info(
    becameHost
      ? '[M3.7-M3.8] Local player promoted to host; authority restored.'
      : '[M3.7-M3.8] Host migration applied; run remains active.'
  );
}

export function initializeMultiplayerFoundation(
  player,
  {
    scene = null,
    worldAdapter = null,
    economyAdapter = null,
    reviveAdapter = null,
    tacticalAdapter = null,
    statsAdapter = null
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

  coopStatsManager = new MultiplayerCoopStatsManager({
    eventBus: multiplayerEvents,
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    players: multiplayerPlayers,
    getEconomySnapshot:
      () => economyManager?.getSnapshot?.() || null,
    getReviveSnapshot:
      () => reviveManager?.getSnapshot?.() || null,
    getRunSummarySnapshot:
      statsAdapter?.getRunSummarySnapshot || (() => null),
    getWave:
      statsAdapter?.getWave || (() => 1)
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
    adapter: {
      ...(reviveAdapter || {}),
      onReviveEvent: (event) => {
        reviveAdapter?.onReviveEvent?.(event);
        coopStatsManager?.recordReviveEvent?.(event);
      }
    }
  }); networkHud = new MultiplayerNetworkHud({
      runtime: multiplayerRuntime,
      session: multiplayerSession,
      players: multiplayerPlayers,
      getEconomySnapshot:
        () => economyManager?.getSnapshot?.() || null,
      getReviveSnapshot:
        () => reviveManager?.getSnapshot?.() || null,
      getMigrationSnapshot:
        () => hostMigrationState.getSnapshot()
    });

  tacticalAwareness = new MultiplayerTacticalAwareness({
    eventBus: multiplayerEvents,
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    players: multiplayerPlayers,
    player,
    camera: tacticalAdapter?.camera || null,
    getActiveEnemies: tacticalAdapter?.getActiveEnemies || (() => []),
    getWorldTargets: tacticalAdapter?.getWorldTargets || (() => []),
    getReviveSnapshot:
      () => reviveManager?.getSnapshot?.() || null
  });

  coopScoreboard = new MultiplayerCoopScoreboard({
    stats: coopStatsManager,
    session: multiplayerSession
  });
  multiplayerEvents.on(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, () => {
    coopScoreboard?.update?.(performance.now(), { force: true });
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
      pendingResumeCheckpoint = null;
      coopStatsManager?.finalizeRun?.(details.reason || 'ended');
      coopStatsManager?.endRun?.({ preserveFinal: true });
      coopScoreboard?.setHeld?.(false);
      sharedWorldManager?.endRun();
      reviveManager?.endRun();
      economyManager?.endRun();
      multiplayerRuntime.endRun();
      remotePlayerManager?.endRun(); tacticalAwareness?.endRun(); networkHud?.reset();
      hostMigrationState.reset();

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
      coopScoreboard?.update?.(performance.now(), { force: true });
    },
    onHostMigrated: (details = {}) => {
      applyHostMigration(details);
    },
    onLeftRoom: () => {
      coopStatsManager?.endRun?.({ preserveFinal: false });
      coopStatsManager?.clearFinalSummary?.();
      coopScoreboard?.hideAll?.();
    }
  });
  lobbyController.initialize();

  initialized = true;

  console.info(
    '[M3.9-M3.10] Network quality, adaptive interpolation, and co-op HUD ready.'
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
  multiplayerSession.updateOnlineAuthority?.({
    mode: multiplayerSession.mode,
    hostPlayerId: multiplayerSession.hostPlayerId,
    authorityEpoch: pending?.authorityEpoch || 0
  });
  if (multiplayerSession.run) {
    multiplayerSession.run.resumed = pending?.resume === true;
  }

  multiplayerRuntime.beginRun(multiplayerSession.getSnapshot());
  remotePlayerManager?.beginRun();
  economyManager?.beginRun();
  reviveManager?.beginRun();
  sharedWorldManager?.beginRun();
  tacticalAwareness?.beginRun();
  coopStatsManager?.beginRun();
  coopScoreboard?.hideAll?.();

  pendingResumeCheckpoint = pending?.checkpoint
    ? {
        previousHostPlayerId: null,
        hostPlayerId: multiplayerSession.hostPlayerId,
        authorityEpoch: pending.authorityEpoch || 0,
        checkpoint: pending.checkpoint,
        becameHost: multiplayerSession.mode === 'host',
        reason: pending.resume ? 'reconnect-resume' : 'run-start-checkpoint'
      }
    : null;

  if (!pendingResumeCheckpoint) {
    hostMigrationState.reset({
      authorityEpoch: pending?.authorityEpoch || 0,
      hostPlayerId: multiplayerSession.hostPlayerId
    });
  }

  return multiplayerSession.getSnapshot();
}

export function finalizeMultiplayerResume() {
  if (!initialized || !pendingResumeCheckpoint) return false;
  const details = pendingResumeCheckpoint;
  pendingResumeCheckpoint = null;
  applyHostMigration(details);
  return true;
}

export function endMultiplayerRun({
  reason = 'ended',
  player = null,
  notifyServer = true
} = {}) {
  if (!initialized) return null;
  pendingResumeCheckpoint = null;

  const state = multiplayerPlayers.syncLocalPlayer(
    player,
    performance.now(),
    { force: true }
  );

  coopStatsManager?.finalizeRun?.(reason);
  coopStatsManager?.endRun?.({ preserveFinal: true });
  coopScoreboard?.setHeld?.(false);
  sharedWorldManager?.endRun();
  reviveManager?.endRun();
  economyManager?.endRun();
  multiplayerRuntime.endRun();
  remotePlayerManager?.endRun(); tacticalAwareness?.endRun(); networkHud?.reset();
  hostMigrationState.reset();

  if (notifyServer) {
    lobbyController?.notifyRunEnded?.(reason);
  }
  coopScoreboard?.update?.(performance.now(), { force: true });

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

export function placeMultiplayerTacticalPing(now = performance.now()) {
  if (!initialized) return { accepted: false, reason: 'not-initialized' };
  return tacticalAwareness?.placeContextualPing?.(now)
    || { accepted: false, reason: 'not-ready' };
}

export function setMultiplayerScoreboardHeld(held) {
  if (!initialized) return false;
  return coopScoreboard?.setHeld?.(held) === true;
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

  remotePlayerManager?.update(now); tacticalAwareness?.update(now); networkHud?.update(now); coopStatsManager?.update(now); coopScoreboard?.update(now);
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
    revive: reviveManager?.getSnapshot?.() || null, tacticalAwareness: tacticalAwareness?.getSnapshot?.() || null, coopStats: coopStatsManager?.getSnapshot?.() || null, networkQuality: multiplayerRuntime.getNetworkQualitySnapshot(Date.now()), networkHud: networkHud?.getSnapshot?.() || null,
    hostMigration: hostMigrationState.getSnapshot()
  };
}

export { MULTIPLAYER_EVENTS };
