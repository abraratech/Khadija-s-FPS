// js/multiplayer/foundation.js

import { MultiplayerEventBus, MULTIPLAYER_EVENTS } from './event_bus.js';
import { MultiplayerSession } from './session.js';
import { MultiplayerPlayerRegistry } from './player_registry.js';
import { MultiplayerTransport } from './transport.js';
import { MultiplayerRuntime, MULTIPLAYER_RUNTIME_EVENTS } from './runtime.js';
import { MultiplayerReleaseGuard } from './release_guard.js';
import {
  cancelMultiplayerRefreshHydration,
  completeMultiplayerRefreshHydration,
  getMultiplayerRefreshHydrationSnapshot,
  startMultiplayerRefreshHydration
} from './refresh_hydration.js';
import {
  cancelMultiplayerRefreshReadiness,
  completeMultiplayerRefreshReadiness,
  getMultiplayerRefreshReadinessSnapshot,
  isMultiplayerRefreshReadinessBlocking,
  startMultiplayerRefreshReadiness
} from './refresh_readiness.js';
import { MultiplayerLobbyController } from './lobby.js';
import { RemotePlayerManager } from './remote_players.js';
import { SharedWorldManager } from './shared_world.js';
import { MultiplayerEconomyManager } from './economy.js';
import { MultiplayerReviveManager } from './revive.js';
import { MultiplayerBotManager } from './bot.js';
import { MultiplayerCoop2Manager } from './coop2.js';
import { Content1Manager } from '../content1.js';
import { HostMigrationState } from './migration_core.js'; import { MultiplayerNetworkHud } from './network_hud.js';
import {
  HOST_VISIBILITY_HANDOFF_DELAY_MS,
  chooseHostVisibilityHandoffTarget,
  shouldScheduleHostVisibilityHandoff
} from './host_continuity_core.js';
import { MultiplayerTacticalAwareness } from './tactical_ping.js'; import { MultiplayerTextChat } from './text_chat.js';
import { MultiplayerCoopStatsManager } from './coop_stats.js';
import { MultiplayerCoopScoreboard } from './coop_scoreboard.js'; import { getCoopScalingSnapshot, setCoopScalingContext } from './coop_scaling_core.js';
import { MultiplayerCoopAudioManager } from './coop_audio.js';
import { MultiplayerSquadIntentHud } from './squad_intent_hud.js';
import { MultiplayerPvp1Manager } from './pvp1.js';
import { PVP1_MODE, roomUsesPvp1 } from './pvp1_core.js';

let sessionRef = null;
let runLauncher = null;
let runEndHandler = null;
let pendingOnlineRun = null;
let pendingResumeCheckpoint = null;
let remotePlayerManager = null;
let sharedWorldManager = null;
let botManager = null;
let economyManager = null;
let reviveManager = null; let coop2Manager = null; let content1Manager = null; let networkHud = null;
let multiplayerReleaseGuard = null;
let tacticalAwareness = null; let textChat = null; let coopStatsManager = null; let coopScoreboard = null; let coopAudioManager = null; let squadIntentHud = null; let pvp1Manager = null;
let lobbyController = null; let lastAuthoritativeResyncAt = -Infinity;
let knownConnectedHumanIds = new Set();
let lateJoinBurstSerial = 0;
let hostVisibilityHandoffTimer = null;
let lastHostVisibilityHandoffAt = -Infinity;
let hostVisibilityLifecycleBound = false;
const hostMigrationState = new HostMigrationState();

function clearHostVisibilityHandoffTimer() {
  if (hostVisibilityHandoffTimer !== null) {
    clearTimeout(hostVisibilityHandoffTimer);
    hostVisibilityHandoffTimer = null;
  }
}

function scheduleHostVisibilityHandoff(reason = 'host-tab-hidden') {
  clearHostVisibilityHandoffTimer();
  const room = multiplayerRuntime?.room?.getSnapshot?.() || null;
  const target = chooseHostVisibilityHandoffTarget(
    room?.players || [],
    multiplayerRuntime?.localPlayerId
  );
  const now = Date.now();
  if (!shouldScheduleHostVisibilityHandoff({
    visibilityState: typeof document !== 'undefined'
      ? document.visibilityState
      : 'visible',
    runActive: multiplayerSession?.run?.active === true,
    sessionMode: multiplayerSession?.mode,
    roomStatus: room?.status,
    localPlayerId: multiplayerRuntime?.localPlayerId,
    hostPlayerId: room?.hostPlayerId,
    targetPlayerId: target?.playerId,
    now,
    lastRequestedAt: lastHostVisibilityHandoffAt
  })) return false;

  hostVisibilityHandoffTimer = setTimeout(() => {
    hostVisibilityHandoffTimer = null;
    const currentRoom = multiplayerRuntime?.room?.getSnapshot?.() || null;
    const currentTarget = chooseHostVisibilityHandoffTarget(
      currentRoom?.players || [],
      multiplayerRuntime?.localPlayerId
    );
    const requestedAt = Date.now();
    if (!shouldScheduleHostVisibilityHandoff({
      visibilityState: typeof document !== 'undefined'
        ? document.visibilityState
        : 'visible',
      runActive: multiplayerSession?.run?.active === true,
      sessionMode: multiplayerSession?.mode,
      roomStatus: currentRoom?.status,
      localPlayerId: multiplayerRuntime?.localPlayerId,
      hostPlayerId: currentRoom?.hostPlayerId,
      targetPlayerId: currentTarget?.playerId,
      now: requestedAt,
      lastRequestedAt: lastHostVisibilityHandoffAt
    })) return;

    const sent = lobbyController?.transferHost?.(
      currentTarget.playerId,
      { reason }
    ) === true;
    if (sent) {
      lastHostVisibilityHandoffAt = requestedAt;
      console.info(
        `[MATCH.2 R1.2] Hidden host handed authority to ${currentTarget.playerId}.`
      );
    }
  }, HOST_VISIBILITY_HANDOFF_DELAY_MS);
  return true;
}

function bindHostVisibilityContinuity() {
  if (hostVisibilityLifecycleBound || typeof document === 'undefined') return;
  hostVisibilityLifecycleBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      scheduleHostVisibilityHandoff('host-tab-hidden');
    } else {
      clearHostVisibilityHandoffTimer();
    }
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      scheduleHostVisibilityHandoff('host-page-hidden');
    });
  }
}


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
function syncCoopScalingFromRoom() {
  const room = multiplayerRuntime?.room?.getSnapshot?.() || null;
  const roomMode = room?.settings?.gameMode || 'coop';
  const online = multiplayerSession?.run?.active === true
    && roomMode !== PVP1_MODE
    && (
      multiplayerSession.mode === 'host'
      || multiplayerSession.mode === 'client'
    );
  const connectedPlayers = (room?.players || []).filter(
    (entry) => entry?.connected !== false
  ).length;
  return setCoopScalingContext({
    online,
    playerCount: online ? connectedPlayers : 1
  });
}


function localPlayerId() {
  return `player-${multiplayerSession.clientId}`;
}

function connectedHumanIds(room = multiplayerRuntime?.room?.getSnapshot?.()) {
  return new Set((room?.players || [])
    .filter((entry) => (
      entry?.playerId
      && entry.isBot !== true
      && entry.connected !== false
    ))
    .map((entry) => entry.playerId));
}

function publishLateJoinIntegrityBurst(reason = 'late-join') {
  if (
    pvp1Manager?.isPvpRoom?.() === true
    || multiplayerSession?.run?.active !== true
    || multiplayerSession?.mode !== 'host'
  ) return false;
  const burstNow = performance.now();
  multiplayerPlayers?.syncLocalPlayer?.(null, burstNow, { force: true });
  sharedWorldManager?.forceAuthoritativeSnapshot?.(reason);
  economyManager?.sendSnapshot?.(true);
  reviveManager?.publishSnapshot?.(burstNow, true);
  coopStatsManager?.publishSnapshot?.(true, burstNow);
  coop2Manager?.publishSnapshot?.(true);
  content1Manager?.publishSnapshot?.(true);
  botManager?.publishSnapshot?.(burstNow, true);
  return true;
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
  coop2Manager?.handleHostMigration?.({
    authorityEpoch,
    checkpoint: details.checkpoint,
    becameHost
  });
  content1Manager?.handleHostMigration?.({
    authorityEpoch,
    checkpoint: details.checkpoint,
    becameHost
  });
  tacticalAwareness?.handleHostMigration?.({
    authorityEpoch,
    checkpoint: details.checkpoint,
    becameHost
  });
  botManager?.handleHostMigration?.({
    authorityEpoch,
    checkpoint: details.checkpoint,
    hostPlayerId: details.hostPlayerId,
    previousHostPlayerId: details.previousHostPlayerId,
    becameHost,
    reason: details.reason
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
    statsAdapter = null,
    contentAdapter = null,
    botAdapter = null,
    pvpAdapter = null
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

  pvp1Manager = new MultiplayerPvp1Manager({
    eventBus: multiplayerEvents,
    transport: multiplayerTransport,
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    player,
    remotePlayers: remotePlayerManager,
    adapter: pvpAdapter || {}
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
        coopAudioManager?.handleReviveEvent?.(event);
        if (event?.type === 'REVIVED' && event.reviverId) {
          coop2Manager?.recordAuthorityAction?.('REVIVE', {
            actorId: event.reviverId,
            eventId: event.eventId || `${event.reviverId}:${event.playerId}:${event.at || performance.now()}`,
            at: event.at || performance.now(),
            isBot: event.reviverId === 'bot-wingmate-r1'
          });
        }
      }
    }
  });

  sharedWorldManager = new SharedWorldManager({
    scene,
    eventBus: multiplayerEvents,
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    player,
    adapter: worldAdapter,
    economy: economyManager,
    revive: reviveManager
  });

  botManager = new MultiplayerBotManager({
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    player,
    remotePlayers: remotePlayerManager,
    sharedWorld: sharedWorldManager,
    revive: reviveManager,
    getActiveEnemies:
      botAdapter?.getActiveEnemies || worldAdapter?.getActiveEnemies || (() => []),
    damageEnemy: botAdapter?.damageEnemy || (() => ({ applied: false })),
    getWorldTargets: botAdapter?.getWorldTargets || (() => []),
    getWave: botAdapter?.getWave || worldAdapter?.getCurrentWave || (() => 1),
    markRunBotAssisted: botAdapter?.markRunBotAssisted || (() => null),
    showToast: botAdapter?.showToast || (() => {}),
    onTeamAction: (kind, details) => {
      coop2Manager?.recordAuthorityAction?.(kind, details);
    }
  });

  coopAudioManager = new MultiplayerCoopAudioManager({
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    player,
    camera: tacticalAdapter?.camera || reviveAdapter?.camera || null,
    getReviveSnapshot:
      () => reviveManager?.getSnapshot?.() || null,
    getBotSnapshot:
      () => botManager?.getSnapshot?.() || null
  });

  coop2Manager = new MultiplayerCoop2Manager({
    eventBus: multiplayerEvents,
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    revive: reviveManager,
    bot: botManager,
    showToast: (
      botAdapter?.showToast
      || reviveAdapter?.showToast
      || (() => {})
    )
  });

  content1Manager = new Content1Manager({
    eventBus: multiplayerEvents,
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    scene,
    player,
    getParticipants: (now = performance.now()) => {
      const room = multiplayerRuntime?.room?.getSnapshot?.() || null;
      const revivePlayers = reviveManager?.getSnapshot?.()?.state?.players || [];
      const reviveById = new Map(
        revivePlayers
          .filter((entry) => entry?.playerId)
          .map((entry) => [entry.playerId, entry])
      );
      const botSnapshot = botManager?.getSnapshot?.() || null;
      return (room?.players || []).map((entry) => {
        const reviveState = reviveById.get(entry.playerId) || null;
        const sampled = entry.playerId === multiplayerRuntime?.localPlayerId
          ? null
          : multiplayerRuntime?.sampleRemotePlayer?.(entry.playerId, now);
        const botState = entry.isBot === true
          ? botSnapshot?.state || null
          : null;
        const local = entry.playerId === multiplayerRuntime?.localPlayerId;
        const position = local
          ? player?.pos
          : (botState?.position || sampled?.state?.position || reviveState?.position || null);
        const lifeState = String(
          reviveState?.lifeState
          || botState?.lifeState
          || sampled?.state?.lifeState
          || 'ACTIVE'
        ).toUpperCase();
        return {
          playerId: entry.playerId,
          displayName: entry.displayName,
          isLocal: local,
          isBot: entry.isBot === true,
          connected: entry.connected !== false,
          alive: lifeState === 'ACTIVE' && (local ? player?.alive !== false : botState?.alive !== false),
          lifeState,
          position
        };
      }).filter((entry) => entry.playerId && entry.position);
    },
    getBotSnapshot: () => botManager?.getSnapshot?.() || null,
    getActiveEnemies: worldAdapter?.getActiveEnemies || (() => []),
    awardTeamObjective: ({ points = 0, label = 'OBJECTIVE COMPLETE' } = {}) => {
      const reward = Math.max(0, Math.floor(Number(points) || 0));
      if (reward <= 0) return false;
      if (multiplayerSession?.mode === 'host' && multiplayerSession?.run?.active === true) {
        const humans = (multiplayerRuntime?.room?.getSnapshot?.()?.players || [])
          .filter((entry) => entry?.playerId && entry.isBot !== true && entry.connected !== false);
        let awarded = false;
        humans.forEach((entry) => {
          awarded = economyManager?.awardCombat?.({
            playerId: entry.playerId,
            points: reward,
            kills: 0,
            label
          }) === true || awarded;
        });
        return awarded;
      }
      return contentAdapter?.awardLocalPoints?.({ points: reward, label }) === true;
    },
    handleObjectiveDirective: (directive) => (
      botManager?.handleObjectiveDirective?.(directive) || false
    ),
    getInteractLabel: (
      contentAdapter?.getInteractLabel
      || reviveAdapter?.getInteractLabel
      || (() => 'INTERACT')
    ),
    showToast: (
      botAdapter?.showToast
      || reviveAdapter?.showToast
      || (() => {})
    )
  });

  networkHud = new MultiplayerNetworkHud({
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

  multiplayerReleaseGuard = new MultiplayerReleaseGuard({
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    transport: multiplayerTransport,
    diagnostics: null,
    certification: null
  });
  multiplayerReleaseGuard.initialize(performance.now());

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
      () => reviveManager?.getSnapshot?.() || null,
    getRoleForPlayer:
      (playerId) => coop2Manager?.getRoleForPlayer?.(playerId) || 'VANGUARD',
    getPingLifetimeMultiplier:
      (playerId) => coop2Manager?.getTacticalPingMultiplier?.(playerId) || 1,
    onTeamAction: (kind, details) => {
      coop2Manager?.recordAction?.(kind, details);
    },
    onRemotePing: (ping, details) => {
      coopAudioManager?.handleTacticalPing?.(ping, {
        remote: true,
        now: details?.receivedAt
      });
    },
    onAcceptedPing: (ping, details) => {
      botManager?.handleTacticalCommand?.(ping, details);
    }
  });

  squadIntentHud = new MultiplayerSquadIntentHud({
    runtime: multiplayerRuntime,
    session: multiplayerSession,
    player,
    getBotSnapshot: () => botManager?.getSnapshot?.() || null,
    getTacticalSnapshot: () => tacticalAwareness?.getSnapshot?.() || null
  });

  coopScoreboard = new MultiplayerCoopScoreboard({
    stats: coopStatsManager,
    session: multiplayerSession
  });
textChat = new MultiplayerTextChat({
  eventBus: multiplayerEvents,
  transport: multiplayerTransport,
  session: multiplayerSession,
  runtime: multiplayerRuntime
});
textChat.initialize();

  multiplayerEvents.on(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, (event) => {
    syncCoopScalingFromRoom();
    coopScoreboard?.update?.(performance.now(), { force: true });

    const room = event?.payload?.room || multiplayerRuntime?.room?.getSnapshot?.();
    const nextHumans = connectedHumanIds(room);
    if (
      multiplayerSession?.run?.active === true
      && multiplayerSession?.mode === 'host'
      && room?.status === 'in-run'
    ) {
      const newRemoteHumans = [...nextHumans].filter((playerId) => (
        playerId !== multiplayerRuntime.localPlayerId
        && !knownConnectedHumanIds.has(playerId)
      ));
      if (newRemoteHumans.length > 0) {
        lateJoinBurstSerial += 1;
        const reason = `late-join-${lateJoinBurstSerial}`;
        publishLateJoinIntegrityBurst(`${reason}-initial`);
        setTimeout(() => publishLateJoinIntegrityBurst(`${reason}-follow-up`), 320);
      }
    }
    knownConnectedHumanIds = nextHumans;
  });

  multiplayerEvents.on(
        MULTIPLAYER_RUNTIME_EVENTS.REMOTE_STATE_RESYNC_REQUEST_RECEIVED,
        (event) => {
            if (
                multiplayerSession?.run?.active !== true
                || multiplayerSession?.mode !== 'host'
            ) {
                return;
            }
            const envelope = event?.payload?.envelope;
            const requestedHost = envelope?.payload?.targetHostPlayerId;
            if (
                requestedHost
                && requestedHost !== multiplayerRuntime.localPlayerId
            ) {
                return;
            }
            const now = performance.now();
            if (now - lastAuthoritativeResyncAt < 450) return;
            lastAuthoritativeResyncAt = now;
            const reason = String(
                envelope?.payload?.reason || 'client-resync'
            ).slice(0, 80);
            const publishRecoveryBurst = (suffix = 'initial') => {
              if (
                multiplayerSession?.run?.active !== true
                || multiplayerSession?.mode !== 'host'
              ) {
                return false;
              }
              const burstNow = performance.now();
              multiplayerPlayers?.syncLocalPlayer?.(
                null,
                burstNow,
                { force: true }
              );
              sharedWorldManager?.forceAuthoritativeSnapshot?.(
                `${reason}-${suffix}`
              );
              economyManager?.sendSnapshot?.(true);
              reviveManager?.publishSnapshot?.(burstNow, true);
              coopStatsManager?.publishSnapshot?.(true, burstNow);
              coop2Manager?.publishSnapshot?.(true);
              content1Manager?.publishSnapshot?.(true);
              botManager?.publishSnapshot?.(burstNow, true);
              return true;
            };
            publishRecoveryBurst('initial');
            setTimeout(() => publishRecoveryBurst('follow-up'), 320);
        }
    );
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
      cancelMultiplayerRefreshHydration({
        reason: 'multiplayer-run-ended'
      });
      cancelMultiplayerRefreshReadiness({
        reason: 'multiplayer-run-ended'
      });
      const pvpRun = pvp1Manager?.isPvpRoom?.() === true;
      if (!pvpRun) {
        coopStatsManager?.finalizeRun?.(details.reason || 'ended');
        coopStatsManager?.endRun?.({ preserveFinal: true });
        coop2Manager?.endRun?.();
        content1Manager?.endRun?.();
        coopScoreboard?.setHeld?.(false);
        botManager?.endRun(details.reason || 'ended');
        sharedWorldManager?.endRun();
        reviveManager?.endRun();
        economyManager?.endRun();
        tacticalAwareness?.endRun();
        squadIntentHud?.endRun();
      }
      pvp1Manager?.endRun?.();
      multiplayerRuntime.endRun();
      remotePlayerManager?.endRun();
      networkHud?.reset();
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
    onBotFillRequested: (details = {}) => {
      botManager?.requestFill?.(details);
      syncCoopScalingFromRoom();
    },
    onBotDismissRequested: () => {
      botManager?.clearReservation?.('host-dismissed');
      syncCoopScalingFromRoom();
    },
    onHostMigrated: (details = {}) => {
      applyHostMigration(details);
    },
    onLeftRoom: () => {
      botManager?.clearReservation?.('left-room');
      cancelMultiplayerRefreshHydration({
        reason: 'multiplayer-room-left'
      });
      cancelMultiplayerRefreshReadiness({
        reason: 'multiplayer-room-left'
      });
      setCoopScalingContext({ online: false, playerCount: 1 });
      knownConnectedHumanIds = new Set();
      coopStatsManager?.endRun?.({ preserveFinal: false });
      coop2Manager?.endRun?.();
      content1Manager?.endRun?.();
      coopStatsManager?.clearFinalSummary?.();
      coopScoreboard?.hideAll?.();
    }
  });
  lobbyController.initialize();
  bindHostVisibilityContinuity();


  initialized = true;

  console.info(
    '[PROG.2] Production multiplayer runtime initialized.'
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
  } syncCoopScalingFromRoom();
  knownConnectedHumanIds = connectedHumanIds();

  multiplayerRuntime.beginRun(multiplayerSession.getSnapshot());
  remotePlayerManager?.beginRun();
  const pvpRun = pvp1Manager?.isPvpRoom?.() === true;
  if (pvpRun) {
    pvp1Manager?.beginRun?.();
    economyManager?.endRun?.();
    reviveManager?.endRun?.();
    sharedWorldManager?.endRun?.();
    botManager?.endRun?.('pvp-isolation');
    coopAudioManager?.endRun?.();
    coop2Manager?.endRun?.();
    content1Manager?.endRun?.();
    tacticalAwareness?.endRun?.();
    squadIntentHud?.endRun?.();
    coopStatsManager?.endRun?.({ preserveFinal: false });
    coopScoreboard?.hideAll?.();
  } else {
    pvp1Manager?.endRun?.();
    economyManager?.beginRun();
    reviveManager?.beginRun();
    sharedWorldManager?.beginRun();
    botManager?.beginRun();
    coopAudioManager?.beginRun();
    coop2Manager?.beginRun();
    content1Manager?.beginRun({
      runId: multiplayerSession.run?.runId,
      mapId: multiplayerSession.run?.mapId || mapId,
      difficulty: multiplayerSession.run?.difficulty ?? difficulty
    });
    tacticalAwareness?.beginRun();
    squadIntentHud?.beginRun();
    coopStatsManager?.beginRun();
    coopScoreboard?.hideAll?.();
  }

  // The runtime must already be inside the resumed run before the forced
  // state event is emitted. Otherwise the first reconnect snapshot is dropped
  // and the authority cannot target or validate this player.
  multiplayerPlayers.syncLocalPlayer(
    null,
    performance.now(),
    { force: true }
  );

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

  if (pending?.resume === true) {
    startMultiplayerRefreshHydration({
      roomCode: pending.roomCode,
      runId: multiplayerSession.run?.runId || pending.runId,
      authorityEpoch:
        multiplayerSession.run?.authorityEpoch
        ?? pending.authorityEpoch
        ?? 0,
      checkpointExpected: Boolean(pending.checkpoint)
    });
    startMultiplayerRefreshReadiness({
      roomCode: pending.roomCode,
      runId: multiplayerSession.run?.runId || pending.runId,
      authorityEpoch:
        multiplayerSession.run?.authorityEpoch
        ?? pending.authorityEpoch
        ?? 0,
      checkpointExpected: Boolean(pending.checkpoint)
    });
  } else {
    cancelMultiplayerRefreshHydration({
      reason: 'non-resume-run-started'
    });
    cancelMultiplayerRefreshReadiness({
      reason: 'non-resume-run-started'
    });
  }
  return multiplayerSession.getSnapshot();
}

export function finalizeMultiplayerResume() {
  if (!initialized) return false;
  const details = pendingResumeCheckpoint;
  pendingResumeCheckpoint = null;
  if (details) applyHostMigration(details);

  // This runs after main.js places the player in the rebuilt map. Always send
  // that authoritative local state, even when the reconnect checkpoint was
  // temporarily unavailable.
  multiplayerPlayers.syncLocalPlayer(
    null,
    performance.now(),
    { force: true }
  );
  const refreshHydration = completeMultiplayerRefreshHydration({
    runId: multiplayerSession.run?.runId || null,
    authorityEpoch:
      multiplayerSession.run?.authorityEpoch
      ?? details?.authorityEpoch
      ?? 0,
    checkpointApplied: Boolean(details?.checkpoint)
  });
  completeMultiplayerRefreshReadiness({
    connected: true,
    runActive: true,
    runId:
      refreshHydration?.runId
      || multiplayerSession.run?.runId
      || null,
    authorityEpoch:
      refreshHydration?.authorityEpoch
      ?? multiplayerSession.run?.authorityEpoch
      ?? 0,
    hydration: refreshHydration,
    worldReady: true,
    localStateReady: true
  });
  return Boolean(details);
}

export function endMultiplayerRun({
  reason = 'ended',
  player = null,
  notifyServer = true,
  preserveFinalSummary = true
} = {}) {
  if (!initialized) return null;
  pendingResumeCheckpoint = null;
  cancelMultiplayerRefreshHydration({
    reason: 'multiplayer-run-ended'
  });
  cancelMultiplayerRefreshReadiness({
    reason: 'multiplayer-run-ended'
  });

  const state = multiplayerPlayers.syncLocalPlayer(
    player,
    performance.now(),
    { force: true }
  );

  const pvpRun = pvp1Manager?.isPvpRoom?.() === true;
  if (!pvpRun) {
    if (preserveFinalSummary) {
      coopStatsManager?.finalizeRun?.(reason);
    }
    coopStatsManager?.endRun?.({ preserveFinal: preserveFinalSummary });
    coop2Manager?.endRun?.();
    if (!preserveFinalSummary) {
      coopStatsManager?.clearFinalSummary?.();
      coopScoreboard?.hideAll?.();
    } else {
      coopScoreboard?.setHeld?.(false);
    }
    coopAudioManager?.endRun();
    botManager?.endRun(reason);
    sharedWorldManager?.endRun();
    reviveManager?.endRun();
    economyManager?.endRun();
    tacticalAwareness?.endRun();
    squadIntentHud?.endRun();
  }
  pvp1Manager?.endRun?.();
  multiplayerRuntime.endRun();
  remotePlayerManager?.endRun();
  networkHud?.reset();
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

export async function leaveMultiplayerRoom() {
  if (!initialized) return false;
  await lobbyController?.leaveRoom?.();
  return true;
}

export function openMultiplayerLobby() {
  lobbyController?.openLobby?.();
}

export function getMultiplayerSocialContext() {
  const room = multiplayerRuntime?.room?.getSnapshot?.() || null;
  const identity = lobbyController?.ui?.getConnectionIdentity?.() || {};
  return Object.freeze({
    connected: multiplayerTransport?.getState?.() === 'connected',
    online: multiplayerTransport?.getMode?.() === 'online',
    runActive: multiplayerSession?.run?.active === true,
    roomId: room?.roomId || '',
    roomCode: room?.roomCode || '',
    roomStatus: room?.status || '',
    hostPlayerId: room?.hostPlayerId || '',
    localPlayerId: multiplayerRuntime?.localPlayerId || '',
    isHost: room?.hostPlayerId === multiplayerRuntime?.localPlayerId,
    players: Array.isArray(room?.players)
      ? room.players.map((entry) => ({ ...entry }))
      : [],
    displayName: identity.displayName || 'Player',
    serverUrl: identity.serverUrl || ''
  });
}

export async function joinMultiplayerSocialRoom({
  roomCode,
  displayName = '',
  serverUrl = ''
} = {}) {
  if (!lobbyController) return false;
  const identity = lobbyController.ui?.getConnectionIdentity?.() || {};
  const targetRoomCode = String(roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (targetRoomCode.length !== 6) return false;
  lobbyController.openLobby?.();
  return lobbyController.joinRoom({
    roomCode: targetRoomCode,
    displayName: String(displayName || identity.displayName || 'Player').trim().slice(0, 24),
    serverUrl: String(serverUrl || identity.serverUrl || '').trim()
  });
}

export function isOnlineMultiplayerRun() {
  return multiplayerSession?.run?.active === true
    && (
      multiplayerSession.mode === 'host'
      || multiplayerSession.mode === 'client'
    );
}

export function getMultiplayerGameMode() {
  const room = multiplayerRuntime?.room?.getSnapshot?.() || null;
  return roomUsesPvp1(room) ? PVP1_MODE : 'coop';
}

export function isMultiplayerPvpRun() {
  return isOnlineMultiplayerRun()
    && pvp1Manager?.isPvpRoom?.() === true;
}

export function attemptMultiplayerPvpShot(payload = {}) {
  if (!initialized) return false;
  return pvp1Manager?.attemptShot?.(payload) === true;
}

export function getMultiplayerPvpSnapshot() {
  if (!initialized) return null;
  return pvp1Manager?.getSnapshot?.() || null;
}

export function initializeSharedMultiplayerEconomy() {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return;
  economyManager?.initializeWorld();
}

export function updateSharedMultiplayerEconomy(
  now = performance.now()
) {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return;
  economyManager?.update(now);
}

export function requestMultiplayerInteraction(request) {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return false;
  return economyManager?.requestInteraction?.(request) === true;
}

export function awardMultiplayerCombat(payload = {}) {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return false;
  return economyManager?.awardCombat?.({
    ...payload,
    playerId: payload.playerId || multiplayerRuntime.localPlayerId
  }) === true;
}

export function getLocalMultiplayerPlayerId() {
  return multiplayerRuntime.localPlayerId || null;
}

export function refundMultiplayerPoints(playerId, points, label) {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return false;
  return economyManager?.refundPlayer?.(playerId, points, label) === true;
}

export function isSharedMultiplayerEconomyAuthority() {
  if (!initialized) return true;
  if (pvp1Manager?.isPvpRoom?.() === true) return false;
  return economyManager?.isAuthority?.() !== false;
}

export function initializeSharedMultiplayerEnemies() {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return;
  sharedWorldManager?.initializeEnemies();
}

export function updateSharedMultiplayerWorld(
  dt,
  now = performance.now()
) {
  if (!initialized) return;
  if (pvp1Manager?.isPvpRoom?.() === true) {
    pvp1Manager.update?.(Date.now());
    return;
  }
  sharedWorldManager?.update(dt, now);
}

export function updateMultiplayerRevive(
  dt,
  now = performance.now(),
  options = {}
) {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return;
  reviveManager?.update(dt, now, options);
}

export function notifyMultiplayerLocalDowned(reason = 'damage') {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return false;
  return reviveManager?.handleLocalDeath?.(reason) === true;
}

export function isMultiplayerLifeInputBlocked() {
  if (!initialized) return false;
  return pvp1Manager?.isInputBlocked?.() === true
    || reviveManager?.isInputBlocked?.() === true;
}

export function getMultiplayerReviveSnapshot() {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return null;
  return reviveManager?.getSnapshot?.() || null;
}

export function getMultiplayerCoopStatsSnapshot() {
  if (!initialized || pvp1Manager?.isPvpRoom?.() === true) return null;
  return coopStatsManager?.getSnapshot?.() || null;
}

export function beginContent1Run(details = {}) {
  if (!initialized) return null;
  return content1Manager?.beginRun?.(details) || null;
}

export function endContent1Run() {
  if (!initialized) return false;
  content1Manager?.endRun?.();
  return true;
}

export function updateContent1Run(dt, details = {}) {
  if (!initialized) return null;
  return content1Manager?.update?.(dt, details) || null;
}

export function getContent1Snapshot() {
  if (!initialized) return null;
  return content1Manager?.getSnapshot?.() || null;
}

export function isSharedMultiplayerWorldAuthority() {
  if (!initialized) return true;
  if (pvp1Manager?.isPvpRoom?.() === true) return false;
  return sharedWorldManager?.isAuthority?.() !== false;
}

export function placeMultiplayerTacticalPing(now = performance.now()) {
  if (!initialized) return { accepted: false, reason: 'not-initialized' };
  return tacticalAwareness?.placeContextualPing?.(now)
    || { accepted: false, reason: 'not-ready' };
}
export function placeMultiplayerQuickMessage(type, now = performance.now()) {
  if (!initialized) return { accepted: false, reason: 'not-initialized' };
  return tacticalAwareness?.placeQuickMessage?.(type, now)
    || { accepted: false, reason: 'not-ready' };
}
export function openMultiplayerTextChat() {
  if (!initialized) return false;
  return textChat?.open?.() === true;
}
export function toggleMultiplayerTextChat() {
  if (!initialized) return false;
  return textChat?.toggle?.() === true;
}
export function sendMultiplayerTextChat(text) {
  if (!initialized) return { accepted: false, reason: 'not-initialized' };
  return textChat?.send?.(text) || { accepted: false, reason: 'not-ready' };
}
export function getMultiplayerReleaseGuardSnapshot() {
  if (!initialized) return null;
  return multiplayerReleaseGuard?.getSnapshot?.() || null;
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
    lookDeltaY = 0,
    interactHeld = false
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

  const pvpRun = pvp1Manager?.isPvpRoom?.() === true;
  remotePlayerManager?.update(now);
  networkHud?.update(now);
  multiplayerReleaseGuard?.update(now);
  if (pvpRun) {
    pvp1Manager?.update?.(Date.now());
    coopScoreboard?.hideAll?.();
  } else {
    botManager?.update(dt, now);
    tacticalAwareness?.update(now);
    squadIntentHud?.update(now);
    coopAudioManager?.update(now);
    coopStatsManager?.update(now);
    coop2Manager?.update(now);
    content1Manager?.update(dt, {
      player,
      wave: sharedWorldManager?.adapter?.getCurrentWave?.() || 1,
      interactHeld: interactHeld === true,
      now
    });
    coopScoreboard?.update(now);
  }
  return { state, input };
}

export function sampleRemoteMultiplayerPlayer(
  playerId,
  now = performance.now()
) {
  if (!initialized) return null;
  return multiplayerRuntime.sampleRemotePlayer(playerId, now);
}

export function isMultiplayerRefreshGameplayBlocked() {
  return isMultiplayerRefreshReadinessBlocking();
}

export function setMultiplayerCoopRole(roleId) {
  if (!initialized) return null;
  return coop2Manager?.setPreferredRole?.(roleId) || null;
}

export function recordMultiplayerCoopAction(kind, details = {}) {
  if (!initialized) return false;
  return coop2Manager?.recordAction?.(kind, details) === true;
}

export function getMultiplayerCoop2Snapshot() {
  if (!initialized) return null;
  return coop2Manager?.getSnapshot?.() || null;
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
    revive: reviveManager?.getSnapshot?.() || null, coop2: coop2Manager?.getSnapshot?.() || null, bot: botManager?.getSnapshot?.() || null, tacticalAwareness: tacticalAwareness?.getSnapshot?.() || null, coopAudio: coopAudioManager?.getSnapshot?.() || null, coopStats: coopStatsManager?.getSnapshot?.() || null, networkQuality: multiplayerRuntime.getNetworkQualitySnapshot(Date.now()), reconciliation: multiplayerRuntime.getReconciliationSnapshot(Date.now()), networkHud: networkHud?.getSnapshot?.() || null,
    hostMigration: hostMigrationState.getSnapshot(),
    coopScaling: getCoopScalingSnapshot(),
    releaseGuard: multiplayerReleaseGuard?.getSnapshot?.() || null,
    refreshHydration: getMultiplayerRefreshHydrationSnapshot(),
    refreshReadiness: getMultiplayerRefreshReadinessSnapshot()
  };
}

export { MULTIPLAYER_EVENTS };
