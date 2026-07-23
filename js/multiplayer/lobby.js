// js/multiplayer/lobby.js
// PVP.2 R2.1 — production multiplayer service is fixed internally and never player-configurable.

import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { SESSION_MODES } from './session.js';
import { TRANSPORT_MODES, TRANSPORT_STATES } from './transport.js';
import { MultiplayerLobbyUI } from './lobby_ui.js';
import { MULTIPLAYER_PRODUCTION_WORKER_URL } from './production_release_core.js';
import {
  MULTIPLAYER_BUILD_ID,
  MULTIPLAYER_PROTOCOL_VERSION
} from './protocol.js';
import { handleMultiplayerBuildDrift } from './build_drift.js';
import {
  consumeMultiplayerRefreshResume,
  markMultiplayerRefreshResumeResult
} from './refresh_resume.js';
import {
  cancelMultiplayerRefreshResumeWatchdog,
  completeMultiplayerRefreshResumeWatchdog,
  failMultiplayerRefreshResumeWatchdog,
  startMultiplayerRefreshResumeWatchdog
} from './refresh_watchdog.js';
import {
  cancelMultiplayerRefreshRunProof,
  failMultiplayerRefreshRunProof,
  startMultiplayerRefreshRunProof
} from './refresh_proof.js';
import {
  getMultiplayerRefreshHydrationSnapshot
} from './refresh_hydration.js';
import {
  checkMultiplayerProductionRelease,
  getMultiplayerProductionReleaseSnapshot,
  requireMultiplayerProductionReleaseReady,
  subscribeMultiplayerProductionRelease
} from './production_release.js';
import { PublicMatchmakingClient } from './matchmaking.js';
import { PublicRoomDirectoryClient } from './room_directory.js';
import { Pvp2CompetitiveClient } from './pvp2.js';
import { PVP2_MODE, createPvp2CustomRoomPolicy, createPvp2PublicQueuePreferences } from './pvp2_core.js';
import { normalizePvp1Mode } from './pvp1_core.js';
import {
  match3PartyErrorMessage,
  normalizeMatch3PartyContext
} from './match3_core.js';
import {
  getSocialMatchmakingPartyContext,
  getSocialPartyMatchmakingTicket
} from '../social_bridge.js';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeRoomCode() {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(
    bytes,
    (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]
  ).join('');
}

function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
}

const LAST_ROOM_STORAGE_KEY = 'ka_multiplayer_last_room';

function reconnectStorageKey(roomCode) {
    return `ka_multiplayer_reconnect_${roomCode}`;
}

function readPersistentValue(key) {
    try {
        const localValue = localStorage.getItem(key);
        if (localValue !== null) return localValue;
    } catch {
        // Fall through to session storage.
    }
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function writePersistentValue(key, value) {
    try {
        localStorage.setItem(key, value);
        return;
    } catch {
        try {
            sessionStorage.setItem(key, value);
        } catch {
            // Ignore restricted storage modes.
        }
    }
}

function loadReconnectToken(roomCode) {
    const normalized = normalizeRoomCode(roomCode);
    if (!normalized) return null;
    return readPersistentValue(reconnectStorageKey(normalized));
}

function saveReconnectToken(roomCode, token) {
    const normalized = normalizeRoomCode(roomCode);
    if (!normalized || !token) return;
    writePersistentValue(reconnectStorageKey(normalized), token);
}

function loadLastRoom() {
    try {
        const parsed = JSON.parse(readPersistentValue(LAST_ROOM_STORAGE_KEY) || 'null');
        const roomCode = normalizeRoomCode(parsed?.roomCode);
        if (roomCode.length !== 6) return null;
        return {
            roomCode,
            serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
            displayName: String(parsed?.displayName || 'Player').trim().slice(0, 24) || 'Player',
            savedAt: Math.max(0, Number(parsed?.savedAt) || 0)
        };
    } catch {
        return null;
    }
}

function saveLastRoom({ roomCode, displayName } = {}) {
    const normalized = normalizeRoomCode(roomCode);
    if (normalized.length !== 6) return null;
    const value = {
        roomCode: normalized,
        serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
        displayName: String(displayName || 'Player').trim().slice(0, 24) || 'Player',
        savedAt: Date.now()
    };
    writePersistentValue(LAST_ROOM_STORAGE_KEY, JSON.stringify(value));
    return value;
}

export class MultiplayerLobbyController {
  constructor({
    eventBus,
    transport,
    session,
    runtime,
    players,
    localPlayerId,
    onStartRun,
    onRunEnded,
    onHostMigrated,
    onLeftRoom,
    onBotFillRequested,
    onBotDismissRequested
  } = {}) {
    this.eventBus = eventBus;
    this.transport = transport;
    this.session = session;
    this.runtime = runtime;
    this.players = players;
    this.localPlayerId = localPlayerId;
    this.onStartRun = onStartRun;
    this.onRunEnded = onRunEnded;
    this.onHostMigrated = onHostMigrated;
    this.onLeftRoom = onLeftRoom;
    this.onBotFillRequested = (
      typeof onBotFillRequested === 'function'
        ? onBotFillRequested
        : null
    );
    this.onBotDismissRequested = (
      typeof onBotDismissRequested === 'function'
        ? onBotDismissRequested
        : null
    );
    this.lastAuthorityEpoch = 0;
    this.ui = null;
    this.unsubscribe = [];
    this.error = null;
    this.connected = false;
    this.room = null;
    this.productionRelease = getMultiplayerProductionReleaseSnapshot();
        this.lastRoom = loadLastRoom();
        this.pendingLeaveResolver = null;
        this.pendingQuickMatchAssignment = null;
        this.pendingBotFill = null;
        this.quickMatchConnectInFlight = false;
        this.matchmaking = new PublicMatchmakingClient({
          onChange: (snapshot) => {
            this.matchmakingState = snapshot;
            this.render();
          },
          onMatch: (assignment) => {
            void this.handleQuickMatchFound(assignment);
          }
        });
        this.matchmakingState = this.matchmaking.getSnapshot();
        this.pvp2 = new Pvp2CompetitiveClient({
          onChange: (snapshot) => {
            this.pvp2State = snapshot;
            this.render();
          }
        });
        this.pvp2State = this.pvp2.getSnapshot();
        this.pendingPublicListing = null;
        this.pendingDirectoryJoin = null;
        this.roomDirectory = new PublicRoomDirectoryClient({
          onChange: (snapshot) => {
            this.roomDirectoryState = snapshot;
            this.render();
          }
        });
        this.roomDirectoryState = this.roomDirectory.getSnapshot();
        this.directoryHeartbeatTimer = null;
  }

  initialize() {
    this.ui = new MultiplayerLobbyUI({
      actions: {
        quickMatch: (options) => this.startQuickMatch(options),
        refreshPvp2: (options) => this.refreshPvp2(options),
        browseOpenRooms: (options) => this.browseOpenRooms(options),
        joinOpenRoom: (options) => this.joinOpenRoom(options),
        findOpenRoom: (options) => this.findOpenRoom(options),
        createPublicRoom: (options) => this.createPublicRoom(options),
        deployBotFill: (options) => this.deployBotFill(options),
        findReplacementPublicAlly: (options) => this.findReplacementPublicAlly(options),
        deployRoomBotFill: (options) => this.deployRoomBotFill(options),
        dismissRoomBotFill: () => this.dismissRoomBotFill(),
        cancelQuickMatch: () => this.cancelQuickMatch(),
        createRoom: (options) => this.createRoom(options),
        joinRoom: (options) => this.joinRoom(options),
                rejoinLastRoom: (options) => this.rejoinLastRoom(options),
        setReady: (ready) => this.setReady(ready),
        updateSettings: (settings) => this.updateSettings(settings),
        startRun: () => this.startRun(),
        leaveRoom: () => this.leaveRoom(), kickPlayer: (playerId) => this.kickPlayer(playerId), transferHost: (playerId) => this.transferHost(playerId)
      }
    });
    this.ui.initialize();

    this.unsubscribe.push(
      this.eventBus.on(MULTIPLAYER_EVENTS.TRANSPORT_CONTROL, (event) => {
        this.handleControl(event.payload);
      })
    );

    this.unsubscribe.push(
      this.eventBus.on(MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED, () => {
        this.render();
      })
    );

    this.unsubscribe.push(
      subscribeMultiplayerProductionRelease((snapshot) => {
        this.productionRelease = snapshot;
        this.render();
      })
    );

    this.unsubscribe.push(
      this.eventBus.on(MULTIPLAYER_EVENTS.TRANSPORT_ERROR, (event) => {
      failMultiplayerRefreshResumeWatchdog({
        reason: 'refresh-resume-transport-error',
        message: event.payload?.message || 'Multiplayer connection error.'
      });
      failMultiplayerRefreshRunProof({
        reason: 'refresh-proof-transport-error',
        message: event.payload?.message || 'Multiplayer connection error.'
      });
        this.error = event.payload?.message || 'Multiplayer connection error.';
        this.render();
      })
    );

    this.unsubscribe.push(
      this.eventBus.on(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, (event) => {
        this.room = event.payload?.room || this.room;
        this.render();
      })
    );

    this.render();
    this.directoryHeartbeatTimer = setInterval(() => {
      const local = this.room?.players?.find(
        (entry) => entry.playerId === this.localPlayerId
      );
      if (
        this.connected
        && local?.isHost === true
        && this.room?.settings?.publicListing === true
      ) {
        this.transport.sendControl('directory-heartbeat', {});
      }
    }, 15_000);
    const refreshResume = consumeMultiplayerRefreshResume({
      lastRoom: this.lastRoom || loadLastRoom(),
      connected: this.connected,
      connecting: false
    });
    if (refreshResume.autoRejoin) {
      this.error = 'FRESH CLIENT READY — REJOINING LAST CO-OP ROOM';
      this.render();
      Promise.resolve().then(async () => {
        markMultiplayerRefreshResumeResult({
          status: 'CONNECTING',
          roomCode: refreshResume.lastRoom?.roomCode || null,
          reason: 'automatic-rejoin-started'
        });
        startMultiplayerRefreshResumeWatchdog({
          roomCode: refreshResume.lastRoom?.roomCode || null,
          onTimeout: () => {
            markMultiplayerRefreshResumeResult({
              status: 'FAILED',
              roomCode: refreshResume.lastRoom?.roomCode || null,
              reason: 'automatic-rejoin-timeout'
            });
            void this.transport.disconnect('refresh-resume-timeout', {
              fallbackLocal: true
            });
            this.connected = false;
            this.room = null;
            this.error = 'AUTO-REJOIN TIMED OUT — ROOM MAY BE CLOSED. REJOIN MANUALLY OR ENTER A NEW CODE';
            this.render();
          }
        });
        const started = await this.rejoinLastRoom({
          displayName: refreshResume.lastRoom?.displayName
        });
        if (!started) {
          failMultiplayerRefreshResumeWatchdog({
            reason: 'automatic-rejoin-failed'
          });
          markMultiplayerRefreshResumeResult({
            status: 'FAILED',
            roomCode: refreshResume.lastRoom?.roomCode || null,
            reason: 'automatic-rejoin-failed'
          });
        }
      });
    }
    return this.getSnapshot();
  }

  async browseOpenRooms({ serverUrl, filters = {}, searchPriority = 'balanced' } = {}) {
    serverUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    if (this.connected || this.quickMatchConnectInFlight) return false;
    this.error = null;
    this.render();
    try {
      await requireMultiplayerProductionReleaseReady(serverUrl);
    } catch (error) {
      this.error = String(
        'Online services are temporarily unavailable.'
      ).toUpperCase();
      this.render();
      return false;
    }
    const party = normalizeMatch3PartyContext(
      getSocialMatchmakingPartyContext()
    );
    if (!party.eligible) {
      this.error = match3PartyErrorMessage(party.reason).toUpperCase();
      this.render();
      return false;
    }
    if (party.active) {
      this.error = match3PartyErrorMessage(
        'PARTY_OPEN_ROOM_RESERVATION_UNSUPPORTED'
      ).toUpperCase();
      this.render();
      return false;
    }
    const snapshot = await this.roomDirectory.list({
      serverUrl,
      playerId: this.localPlayerId,
      protocol: MULTIPLAYER_PROTOCOL_VERSION,
      build: MULTIPLAYER_BUILD_ID,
      searchPriority,
      filters: {
        ...filters,
        requiredSlots: party.memberCount
      }
    });
    this.roomDirectoryState = snapshot;
    this.render();
    return snapshot.status === 'ready';
  }

  async joinOpenRoom({
    listingId,
    joinToken,
    displayName,
    serverUrl,
    partySize = 1
  } = {}) {
    serverUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    if (this.connected || this.quickMatchConnectInFlight) return false;
    this.quickMatchConnectInFlight = true;
    this.error = null;
    this.render();
    try {
      await requireMultiplayerProductionReleaseReady(serverUrl);
      const assignment = await this.roomDirectory.requestJoin({
        serverUrl,
        playerId: this.localPlayerId,
        protocol: MULTIPLAYER_PROTOCOL_VERSION,
        build: MULTIPLAYER_BUILD_ID,
        listingId,
        joinToken,
        partySize
      });
      this.pendingDirectoryJoin = {
        listingId: assignment.listingId,
        serverUrl
      };
      const connected = await this.connect({
        roomCode: assignment.roomCode,
        displayName,
        serverUrl,
        joinMode: 'join',
        admissionToken: assignment.admissionToken,
        gameMode: assignment.gameMode || 'coop'
      });
      if (!connected) {
        this.quickMatchConnectInFlight = false;
        this.pendingDirectoryJoin = null;
        await this.roomDirectory.list({
          serverUrl,
          playerId: this.localPlayerId,
          protocol: MULTIPLAYER_PROTOCOL_VERSION,
          build: MULTIPLAYER_BUILD_ID,
          filters: this.roomDirectoryState?.filters || {},
          searchPriority: this.roomDirectoryState?.searchPriority || 'balanced'
        });
        this.render();
        return false;
      }
      return true;
    } catch (error) {
      this.quickMatchConnectInFlight = false;
      this.pendingDirectoryJoin = null;
      this.error = String(
        error?.message || 'Unable to join the selected public room.'
      ).toUpperCase();
      await this.roomDirectory.list({
        serverUrl,
        playerId: this.localPlayerId,
        protocol: MULTIPLAYER_PROTOCOL_VERSION,
        build: MULTIPLAYER_BUILD_ID,
        filters: this.roomDirectoryState?.filters || {},
        searchPriority: this.roomDirectoryState?.searchPriority || 'balanced'
      });
      this.render();
      return false;
    }
  }

  async findOpenRoom({
    displayName,
    serverUrl,
    gameMode = PVP2_MODE,
    mapId = '',
    difficulty = null,
    searchPriority = 'balanced'
  } = {}) {
    serverUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    if (this.connected || this.quickMatchConnectInFlight) return false;
    if (this.matchmaking?.isActive?.()) {
      await this.matchmaking.cancel({ reason: 'find-open-room' });
    }
    this.quickMatchConnectInFlight = true;
    this.error = null;
    this.render();
    try {
      await requireMultiplayerProductionReleaseReady(serverUrl);
      const assignment = await this.roomDirectory.findOpenRoom({
        serverUrl,
        playerId: this.localPlayerId,
        protocol: MULTIPLAYER_PROTOCOL_VERSION,
        build: MULTIPLAYER_BUILD_ID,
        gameMode,
        mapId,
        difficulty,
        searchPriority,
        partySize: 1
      });
      this.pendingDirectoryJoin = {
        listingId: assignment.listingId,
        serverUrl
      };
      const connected = await this.connect({
        roomCode: assignment.roomCode,
        displayName,
        serverUrl,
        joinMode: 'join',
        admissionToken: assignment.admissionToken,
        gameMode: assignment.gameMode || gameMode
      });
      if (!connected) {
        this.quickMatchConnectInFlight = false;
        this.pendingDirectoryJoin = null;
      }
      return connected;
    } catch (error) {
      this.quickMatchConnectInFlight = false;
      this.pendingDirectoryJoin = null;
      this.error = String(
        error?.message || 'No compatible open public room is available.'
      ).toUpperCase();
      if ([
        'NO_OPEN_ROOM_AVAILABLE',
        'MATCHMAKING_ENDPOINT_NOT_FOUND',
        'NOT_FOUND',
        'HTTP_404'
      ].includes(String(error?.code || '').toUpperCase())) {
        this.ui?.switchHubTab?.('rooms');
      }
      this.render();
      return false;
    }
  }

  async createPublicRoom({
    displayName,
    serverUrl,
    gameMode = 'coop',
    teamSize = 1,
    mapId = 'grid_bunker',
    difficulty = 1
  } = {}) {
    serverUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    if (this.connected || this.quickMatchConnectInFlight) return false;
    if (this.matchmaking?.isActive?.()) {
      await this.matchmaking.cancel({ reason: 'public-room-create' });
    }
    const pvp = String(gameMode || '').toLowerCase() === PVP2_MODE;
    const policy = pvp
      ? createPvp2CustomRoomPolicy({ teamSize })
      : Object.freeze({
          gameMode: 'coop',
          maxPlayers: 4,
          publicListing: true,
          allowLateJoin: true,
          ranked: false
        });
    this.pendingPublicListing = Object.freeze({
      ...policy,
      mapId: String(mapId || 'grid_bunker').slice(0, 80),
      difficulty: pvp ? 1 : (Number(difficulty) || 1)
    });
    const connected = await this.connect({
      roomCode: makeRoomCode(),
      displayName,
      serverUrl,
      joinMode: 'create',
      gameMode: policy.gameMode
    });
    if (!connected) this.pendingPublicListing = null;
    return connected;
  }

  async createRoom({
    displayName,
    serverUrl,
    gameMode = 'coop'
  } = {}) {
    serverUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    if (this.matchmaking?.isActive?.()) {
      await this.matchmaking.cancel({ reason: 'private-room-create' });
    }
    const roomCode = makeRoomCode();
    return this.connect({
      roomCode,
      displayName,
      serverUrl,
      joinMode: 'create',
      gameMode: normalizePvp1Mode(gameMode)
    });
  }

  async joinRoom({ roomCode, displayName, serverUrl } = {}) {
    serverUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    if (this.matchmaking?.isActive?.()) {
      await this.matchmaking.cancel({ reason: 'private-room-join' });
    }
    const normalized = normalizeRoomCode(roomCode);
    if (normalized.length !== 6) {
      this.error = 'ENTER A VALID SIX-CHARACTER ROOM CODE';
      this.render();
      return false;
    }

    return this.connect({
      roomCode: normalized,
      displayName,
      serverUrl,
      joinMode: 'join'
    });
  }

  async startQuickMatch({
    displayName,
    serverUrl,
    mapId = 'grid_bunker',
    difficulty = 1,
    searchPriority = 'balanced',
    regionPolicy = 'auto',
    preferredRegion = 'AUTO',
    allowBackfill = true,
    joinInProgress = true,
    mode = 'coop'
  } = {}) {
    serverUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    if (this.connected || this.quickMatchConnectInFlight) return false;
    this.error = null;
    this.render();

    try {
      await requireMultiplayerProductionReleaseReady(serverUrl);
    } catch (error) {
      this.error = String(
        'Online services are temporarily unavailable.'
      ).toUpperCase();
      this.render();
      return false;
    }

    const pvpPublic = String(mode || '').toLowerCase() === PVP2_MODE;
    const party = pvpPublic
      ? normalizeMatch3PartyContext(null)
      : normalizeMatch3PartyContext(getSocialMatchmakingPartyContext());
    if (!party.eligible) {
      this.error = match3PartyErrorMessage(party.reason).toUpperCase();
      this.render();
      return false;
    }

    let partyTicket = '';
    if (!pvpPublic && party.active) {
      try {
        const ticket = await getSocialPartyMatchmakingTicket({
          playerId: this.localPlayerId,
          tabId: this.matchmaking.tabId,
          protocol: MULTIPLAYER_PROTOCOL_VERSION,
          build: MULTIPLAYER_BUILD_ID
        });
        partyTicket = String(ticket?.ticket || '');
        if (!partyTicket) throw new Error('PARTY_TICKET_REQUIRED');
      } catch (error) {
        this.error = match3PartyErrorMessage(
          String(error?.message || 'PARTY_TICKET_REQUIRED')
        ).toUpperCase();
        this.render();
        return false;
      }
    }

    this.pendingQuickMatchAssignment = null;
    const snapshot = await this.matchmaking.start({
      serverUrl,
      playerId: this.localPlayerId,
      displayName: String(displayName || 'Player').trim().slice(0, 24),
      protocol: MULTIPLAYER_PROTOCOL_VERSION,
      build: MULTIPLAYER_BUILD_ID,
      preferences: pvpPublic
        ? createPvp2PublicQueuePreferences({
            mapId,
            searchPriority,
            regionPolicy,
            preferredRegion
          })
        : {
            mode: 'coop',
            mapId: String(mapId || 'grid_bunker').slice(0, 80),
            difficulty: Number(difficulty) || 1,
            maxPlayers: 2,
            partySize: party.memberCount,
            partyId: party.partyId,
            partyTicket,
            searchPriority,
            regionPolicy,
            preferredRegion,
            allowBackfill,
            joinInProgress
          }
    });
    this.matchmakingState = snapshot;
    this.render();
    return snapshot.status !== 'error';
  }

  async deployBotFill({
    displayName,
    serverUrl,
    mapId = 'grid_bunker',
    difficulty = 1
  } = {}) {
    serverUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    if (
      this.connected
      || this.quickMatchConnectInFlight
      || this.matchmakingState?.status !== 'searching'
      || this.matchmakingState?.botAvailable !== true
    ) {
      return false;
    }

    const request = {
      mapId: String(mapId || 'grid_bunker').slice(0, 80),
      difficulty: Number(difficulty) || 1,
      requestedAt: Date.now()
    };
    this.pendingQuickMatchAssignment = null;
    this.pendingBotFill = request;
    this.quickMatchConnectInFlight = true;
    this.error = null;
    this.render();

    await this.matchmaking.cancel({ reason: 'bot-fill-selected' });

    const connected = await this.connect({
      roomCode: makeRoomCode(),
      displayName: String(displayName || 'Player').trim().slice(0, 24),
      serverUrl,
      joinMode: 'create'
    });

    if (!connected) {
      this.pendingBotFill = null;
      this.quickMatchConnectInFlight = false;
      this.error = this.error || 'UNABLE TO CREATE AI WINGMATE ROOM';
      this.render();
      return false;
    }

    return true;
  }


  async findReplacementPublicAlly({
    displayName,
    serverUrl,
    mapId = 'grid_bunker',
    difficulty = 1
  } = {}) {
    serverUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    const local = this.room?.players?.find(
      (player) => player.playerId === this.localPlayerId
    );
    if (
      !this.connected
      || local?.isHost !== true
      || this.room?.status === 'in-run'
    ) {
      return false;
    }

    const search = {
      displayName: String(displayName || local?.displayName || 'Player')
        .trim().slice(0, 24),
      serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
      mapId: String(mapId || this.room?.settings?.mapId || 'grid_bunker')
        .slice(0, 80),
      difficulty: Number(difficulty || this.room?.settings?.difficulty) || 1
    };

    this.error = 'OPENING A FRESH PUBLIC SEARCH FOR A NEW ALLY';
    this.render();
    await this.leaveRoom();
    this.ui?.open();
    return this.startQuickMatch(search);
  }

  deployRoomBotFill({ mapId = 'grid_bunker', difficulty = 1 } = {}) {
    const local = this.room?.players?.find(
      (player) => player.playerId === this.localPlayerId
    );
    const connectedHumanCount = this.room?.players?.filter((player) => (
      player.isBot !== true && player.connected !== false
    )).length || 0;
    const botPresent = this.room?.players?.some(
      (player) => player.isBot === true && player.connected !== false
    );
    if (
      !this.connected
      || local?.isHost !== true
      || this.room?.status === 'in-run'
      || botPresent
      || connectedHumanCount > 2
    ) {
      return false;
    }

    const request = {
      roomCode: this.room?.roomCode || null,
      mapId: String(mapId || this.room?.settings?.mapId || 'grid_bunker')
        .slice(0, 80),
      difficulty: Number(difficulty || this.room?.settings?.difficulty) || 1,
      requestedAt: Date.now(),
      requestedFromLobby: true
    };
    this.error = null;
    void this.updateSettings({ maxPlayers: 2 });
    this.onBotFillRequested?.(request);
    this.render();
    return true;
  }

  dismissRoomBotFill() {
    const local = this.room?.players?.find(
      (player) => player.playerId === this.localPlayerId
    );
    if (
      !this.connected
      || local?.isHost !== true
      || this.room?.status === 'in-run'
    ) {
      return false;
    }
    this.onBotDismissRequested?.();
    this.render();
    return true;
  }

  async cancelQuickMatch() {
    const wasConnecting = this.quickMatchConnectInFlight;
    this.pendingQuickMatchAssignment = null;
    this.quickMatchConnectInFlight = false;
    await this.matchmaking.cancel({ reason: 'cancelled-by-player' });
    if (wasConnecting && !this.connected) {
      await this.transport.disconnect('quick-match-cancelled', {
        fallbackLocal: true
      });
    }
    this.error = null;
    this.render();
    return true;
  }

  async handleQuickMatchFound(assignment) {
    if (
      !assignment?.roomCode
      || this.connected
      || this.quickMatchConnectInFlight
    ) {
      return false;
    }

    this.pendingQuickMatchAssignment = assignment;
    this.quickMatchConnectInFlight = true;
    this.error = null;
    this.render();

    const identity = this.ui?.getConnectionIdentity?.() || {};
    const connected = await this.connect({
      roomCode: assignment.roomCode,
      displayName: identity.displayName || 'Player',
      serverUrl: identity.serverUrl,
      joinMode: assignment.joinMode || 'join',
      admissionToken: assignment.admissionToken || '',
      gameMode: assignment.gameMode || 'coop'
    });

    if (!connected) {
      this.quickMatchConnectInFlight = false;
      this.pendingQuickMatchAssignment = null;
      this.matchmaking.fail(
        this.error || 'Unable to connect to the assigned public room.'
      );
      this.render();
      return false;
    }

    return true;
  }

  async refreshPvp2({ serverUrl, scope = 'global', region = 'ZZ' } = {}) {
    const url = MULTIPLAYER_PRODUCTION_WORKER_URL;
    const snapshot = await this.pvp2.refresh({
      serverUrl: url,
      playerId: this.localPlayerId,
      scope,
      region
    });
    this.pvp2State = snapshot;
    this.render();
    return snapshot.status === 'ready';
  }

  async rejoinLastRoom({ displayName } = {}) {
        const saved = loadLastRoom();
        if (!saved) {
            this.error = 'NO SAVED CO-OP ROOM';
            this.render();
            return false;
        }
        this.lastRoom = saved;
        return this.connect({
            roomCode: saved.roomCode,
            displayName: String(displayName || saved.displayName || 'Player'),
            serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
            joinMode: 'join'
        });
    }

    async connect({
    roomCode,
    displayName,
    serverUrl,
    joinMode,
    gameMode = 'coop',
    admissionToken = null
  } = {}) {
    this.error = null;
    this.connected = false;
    this.room = null;
    this.render();

    const productionServerUrl = MULTIPLAYER_PRODUCTION_WORKER_URL;
    this.lastRoom = saveLastRoom({
            roomCode,
            displayName
        }) || this.lastRoom;

        try {
      await requireMultiplayerProductionReleaseReady(productionServerUrl);
      await this.transport.connect({
        serverUrl: productionServerUrl,
        roomCode,
        playerId: this.localPlayerId,
        displayName: String(displayName || 'Player').trim().slice(0, 24),
        joinMode,
        gameMode: normalizePvp1Mode(gameMode),
        reconnectToken: loadReconnectToken(roomCode),
        admissionToken
      });
      this.render();
      return true;
    } catch (error) {
      this.error = 'Online services are temporarily unavailable.';
      this.render();
      return false;
    }
  }

  handleControl(message) {
    const action = message?.action;
    const payload = message?.payload || {};

    if (action === 'error') {
      const refreshFailure = failMultiplayerRefreshResumeWatchdog({
        reason: 'refresh-resume-server-rejected',
        message: payload.message || 'Multiplayer server rejected the request.'
      });
      const refreshProofFailure = failMultiplayerRefreshRunProof({
        reason: 'refresh-proof-server-rejected',
        message: payload.message || 'Multiplayer server rejected the request.'
      });
      if (
        refreshFailure?.status === 'FAILED'
        || refreshProofFailure?.status === 'FAILED'
      ) {
        void this.transport.disconnect('refresh-resume-rejected', {
          fallbackLocal: true
        });
        this.connected = false;
        this.room = null;
      }
      this.error = String(payload.message || 'Multiplayer server rejected the request.')
        .toUpperCase();
      if (this.pendingQuickMatchAssignment) {
        this.quickMatchConnectInFlight = false;
        this.pendingQuickMatchAssignment = null;
        this.matchmaking.fail(this.error, 'MATCHED_ROOM_REJECTED');
      }
      if (this.pendingBotFill) {
        this.quickMatchConnectInFlight = false;
        this.pendingBotFill = null;
      }
      if (this.pendingDirectoryJoin) {
        const pendingDirectoryJoin = this.pendingDirectoryJoin;
        this.pendingDirectoryJoin = null;
        this.quickMatchConnectInFlight = false;
        void this.roomDirectory.list({
          serverUrl: pendingDirectoryJoin.serverUrl,
          playerId: this.localPlayerId,
          protocol: MULTIPLAYER_PROTOCOL_VERSION,
          build: MULTIPLAYER_BUILD_ID
        });
      }
      this.render();
      return;
    }

    if (action === 'welcome') {
      if (
        Number(payload.protocol) !== MULTIPLAYER_PROTOCOL_VERSION
        || payload.build !== MULTIPLAYER_BUILD_ID
      ) {
        const buildDrift = handleMultiplayerBuildDrift({
          expectedProtocol: MULTIPLAYER_PROTOCOL_VERSION,
          receivedProtocol: Number(payload.protocol),
          expectedBuild: MULTIPLAYER_BUILD_ID,
          receivedBuild: payload.build
        });
        this.error = buildDrift.message.toUpperCase();
        void this.transport.disconnect('worker-build-mismatch', {
          fallbackLocal: true
        });
        this.render();
        return;
      }

      const room = payload.room;
      if (!room?.roomId || !payload.sessionId) {
        this.error = 'SERVER WELCOME WAS INCOMPLETE';
        this.render();
        return;
      }

      const localRunWasActive = this.session.run?.active === true;

      this.connected = true;
      this.quickMatchConnectInFlight = false;
      this.pendingDirectoryJoin = null;
      this.error = null;
      this.room = room;
      const refreshContinuity = completeMultiplayerRefreshResumeWatchdog({
      connected: true,
      roomCode: room.roomCode,
      roomStatus: room.status
    });
      const refreshProofRequested = refreshContinuity?.status === 'RESTORED';
    if (refreshContinuity?.status === 'FAILED') {
      markMultiplayerRefreshResumeResult({
        status: 'FAILED',
        roomCode: room.roomCode,
        reason: 'refresh-resume-room-mismatch'
      });
      void this.transport.disconnect('refresh-resume-room-mismatch', {
        fallbackLocal: true
      });
      this.connected = false;
      this.room = null;
      this.error = 'AUTO-REJOIN RETURNED THE WRONG ROOM — REJOIN MANUALLY';
      this.render();
      return;
    }
    this.transport.setReconnectToken(payload.reconnectToken);
      saveReconnectToken(room.roomCode, payload.reconnectToken);
            this.lastRoom = saveLastRoom({
                roomCode: room.roomCode,
                serverUrl: this.transport?.serverUrl || this.lastRoom?.serverUrl,
                displayName: room.players.find(
                    (entry) => entry.playerId === this.localPlayerId
                )?.displayName || this.lastRoom?.displayName
            }) || this.lastRoom;

      if (
        this.pendingQuickMatchAssignment
        && this.matchmaking.isMatchedToRoom(room.roomCode)
      ) {
        this.quickMatchConnectInFlight = false;
        this.pendingQuickMatchAssignment = null;
        void this.matchmaking.acknowledgeConnected();
      }

      const local = room.players.find(
        (player) => player.playerId === this.localPlayerId
      );
      if (this.pendingPublicListing && local?.isHost === true) {
        const listingPolicy = this.pendingPublicListing;
        this.pendingPublicListing = null;
        void this.updateSettings({
          maxPlayers: listingPolicy.maxPlayers,
          publicListing: true,
          locked: false,
          allowLateJoin: listingPolicy.allowLateJoin === true,
          mapId: listingPolicy.mapId || 'grid_bunker',
          ...(listingPolicy.gameMode === PVP2_MODE ? {} : { difficulty: Number(listingPolicy.difficulty) || 1 })
        });
      }
      const mode = local?.isHost ? SESSION_MODES.HOST : SESSION_MODES.CLIENT;
      const previousHostPlayerId = this.session.hostPlayerId;
      const preserveRun = localRunWasActive && room.status === 'in-run';

      this.session.configureOnlineSession({
        mode,
        roomId: room.roomId,
        sessionId: payload.sessionId,
        hostPlayerId: room.hostPlayerId,
        preserveRun
      });

      this.runtime.room.replaceFromSnapshot(room, 'server-welcome');

      if (this.pendingBotFill && local?.isHost === true) {
        const botRequest = {
          ...this.pendingBotFill,
          roomCode: room.roomCode
        };
        this.pendingBotFill = null;
        this.quickMatchConnectInFlight = false;
        void this.updateSettings({
          mapId: botRequest.mapId,
          difficulty: botRequest.difficulty,
          maxPlayers: 2
        });
        try {
          this.onBotFillRequested?.(botRequest);
        } catch (error) {
          this.error = String(
            error?.message || 'AI wingmate reservation failed.'
          ).toUpperCase();
        }
      }

      this.runtime.handleHostMigration?.({
        authorityEpoch: room.authorityEpoch,
        hostPlayerId: room.hostPlayerId
      });
      this.lastAuthorityEpoch = Math.max(
        this.lastAuthorityEpoch,
        Number(room.authorityEpoch) || 0
      );

      if (room.status === 'in-run' && !localRunWasActive) {
        this.ui?.close();
        this.onStartRun?.({
          runId: room.runId,
          mapId: room.settings?.mapId || 'grid_bunker',
          difficulty: Number(room.settings?.difficulty) || 1,
          roomCode: room.roomCode,
          resume: true,
          authorityEpoch: room.authorityEpoch,
          checkpoint: payload.checkpoint || null,
          lateJoin: payload.lateJoin || null
        });
      } else if (room.status === 'in-run') {
        this.session.updateOnlineAuthority?.({
          mode,
          hostPlayerId: room.hostPlayerId,
          authorityEpoch: room.authorityEpoch
        });
        this.onHostMigrated?.({
          previousHostPlayerId,
          hostPlayerId: room.hostPlayerId,
          authorityEpoch: room.authorityEpoch,
          checkpoint: payload.checkpoint || null,
          becameHost: local?.isHost === true,
          reason: 'reconnect-welcome'
        });
      }

      if (localRunWasActive && room.status !== 'in-run') {
        this.onRunEnded?.({
          reason: 'reconnected-after-run-ended',
          endedByPlayerId: null,
          room
        });
      }
      if (refreshProofRequested) {
        startMultiplayerRefreshRunProof({
          roomCode: room.roomCode,
          roomStatus: room.status,
          runId: room.runId || null,
          authorityEpoch: room.authorityEpoch,
          readState: () => ({
            connected: this.connected,
            roomCode: this.room?.roomCode,
            roomStatus: this.room?.status,
            runActive: this.session.run?.active === true,
            runId: this.session.run?.runId || null,
            authorityEpoch:
              this.session.run?.authorityEpoch ?? this.lastAuthorityEpoch,
            hydration: getMultiplayerRefreshHydrationSnapshot()
          }),
          onComplete: (proof) => {
            markMultiplayerRefreshResumeResult({
              status: 'CONNECTED',
              roomCode: room.roomCode,
              reason: proof.status === 'DEGRADED'
                ? 'automatic-rejoin-room-restored-run-ended'
                : 'automatic-rejoin-hydration-proved'
            });
            if (proof.status === 'DEGRADED') {
              this.error = 'ROOM RESTORED — PREVIOUS RUN ENDED DURING REFRESH';
              this.ui?.open();
            }
            this.render();
          },
          onFailure: (proof) => {
            markMultiplayerRefreshResumeResult({
              status: 'FAILED',
              roomCode: room.roomCode,
              reason: proof.reason || 'automatic-rejoin-runtime-proof-failed'
            });
            void this.transport.disconnect('refresh-run-proof-failed', {
              fallbackLocal: true
            });
            this.finishLeave();
            this.error = 'AUTO-REJOIN COULD NOT RESTORE THE ACTIVE RUN — REJOIN MANUALLY';
            this.ui?.open();
            this.render();
          }
        });
      } else {
        markMultiplayerRefreshResumeResult({
          status: 'CONNECTED',
          roomCode: room.roomCode,
          reason: 'automatic-rejoin-connected'
        });
      }
      this.render();
      return;
    }

    if (action === 'room-state') {
      if (!payload.room) return;
      const incomingAuthorityEpoch = Math.max(
        0,
        Number(payload.room.authorityEpoch) || 0
      );
      if (
        this.session.run?.active === true
        && incomingAuthorityEpoch < this.lastAuthorityEpoch
      ) {
        return;
      }
      this.connected = true;
      this.room = payload.room;

      const local = payload.room.players?.find(
        (player) => player.playerId === this.localPlayerId
      );
      const previousHostPlayerId = this.session.hostPlayerId;
      const previousEpoch = this.lastAuthorityEpoch;
      const mode = local?.isHost ? SESSION_MODES.HOST : SESSION_MODES.CLIENT;
      this.session.updateOnlineAuthority?.({
        mode,
        hostPlayerId: payload.room.hostPlayerId,
        authorityEpoch: payload.room.authorityEpoch
      });

      this.runtime.room.replaceFromSnapshot(payload.room, 'server-room-state');
      this.runtime.handleHostMigration?.({
        authorityEpoch: payload.room.authorityEpoch,
        hostPlayerId: payload.room.hostPlayerId
      });
      this.lastAuthorityEpoch = Math.max(
        this.lastAuthorityEpoch,
        Number(payload.room.authorityEpoch) || 0
      );

      if (
        this.session.run?.active === true
        && payload.room.status === 'in-run'
        && (
          previousHostPlayerId !== payload.room.hostPlayerId
          || previousEpoch !== this.lastAuthorityEpoch
        )
      ) {
        this.onHostMigrated?.({
          previousHostPlayerId,
          hostPlayerId: payload.room.hostPlayerId,
          authorityEpoch: payload.room.authorityEpoch,
          checkpoint: payload.checkpoint || null,
          becameHost: local?.isHost === true,
          reason: 'room-state-authority-change'
        });
      }

      if (
        this.session.run?.active === true
        && payload.room.status !== 'in-run'
      ) {
        this.onRunEnded?.({
          reason: 'room-returned-to-lobby',
          endedByPlayerId: null,
          room: payload.room
        });
      }

      this.render();
      return;
    }

    if (action === 'start-run') {
      const start = {
        runId: payload.runId,
        mapId: payload.mapId,
        difficulty: Number(payload.difficulty) || 1,
        roomCode: payload.roomCode,
        authorityEpoch: payload.authorityEpoch || this.room?.authorityEpoch || 0,
        resume: false,
        checkpoint: null,
        gameMode: normalizePvp1Mode(payload.gameMode || this.room?.settings?.gameMode),
        pvp: payload.pvp || this.room?.pvp || null
      };

      if (!start.runId || !start.mapId) {
        this.error = 'SERVER START MESSAGE WAS INCOMPLETE';
        this.render();
        return;
      }

      this.ui?.close();
      this.onStartRun?.(start);
      return;
    }

    if (action === 'host-migrated') {
      const room = payload.room || this.room;
      const incomingAuthorityEpoch = Math.max(
        0,
        Number(payload.authorityEpoch || room?.authorityEpoch) || 0
      );
      if (
        this.session.run?.active === true
        && incomingAuthorityEpoch < this.lastAuthorityEpoch
      ) {
        return;
      }
      if (
        room?.hostPlayerId
        && payload.hostPlayerId
        && room.hostPlayerId !== payload.hostPlayerId
      ) {
        return;
      }
      if (room) {
        this.connected = true;
        this.room = room;
        this.runtime.room.replaceFromSnapshot(room, 'server-host-migrated');
      }

      const local = room?.players?.find(
        (entry) => entry?.playerId === this.localPlayerId
      );
      const mode = local?.isHost ? SESSION_MODES.HOST : SESSION_MODES.CLIENT;
      const previousHostPlayerId = payload.previousHostPlayerId
        || this.session.hostPlayerId
        || null;

      this.session.updateOnlineAuthority?.({
        mode,
        hostPlayerId: payload.hostPlayerId || room?.hostPlayerId,
        authorityEpoch: payload.authorityEpoch || room?.authorityEpoch
      });
      this.runtime.handleHostMigration?.({
        authorityEpoch: payload.authorityEpoch || room?.authorityEpoch,
        hostPlayerId: payload.hostPlayerId || room?.hostPlayerId
      });
      this.lastAuthorityEpoch = Math.max(
        this.lastAuthorityEpoch,
        Number(payload.authorityEpoch || room?.authorityEpoch) || 0
      );

      this.onHostMigrated?.({
        previousHostPlayerId,
        hostPlayerId: payload.hostPlayerId || room?.hostPlayerId || null,
        authorityEpoch: payload.authorityEpoch || room?.authorityEpoch || 0,
        checkpoint: payload.checkpoint || null,
        becameHost: local?.isHost === true,
        reason: String(payload.reason || 'host-disconnected')
      });
      this.render();
      return;
    }

    if (action === 'run-ended') {
      if (payload.room) {
        this.connected = true;
        this.room = payload.room;
        this.runtime.room.replaceFromSnapshot(
          payload.room,
          'server-run-ended'
        );
      }

      if (payload.pvp || payload.room?.settings?.gameMode === PVP2_MODE) {
        void this.refreshPvp2({});
      }

      this.onRunEnded?.({
        reason: String(payload.reason || 'ended'),
        endedByPlayerId: payload.endedByPlayerId || null,
        room: this.room
      });
      this.render();
      return;
    }


    if (action === 'kicked') {
      const message = String(
        payload.message || 'REMOVED FROM ROOM BY HOST'
      ).toUpperCase();
      void this.transport.disconnect('kicked', {
        fallbackLocal: true
      });
      this.finishLeave();
      this.error = message;
      this.ui?.open();
      this.render();
      return;
    }

if (action === 'left-room') {
            const resolveLeave = this.pendingLeaveResolver;
            this.pendingLeaveResolver = null;
            resolveLeave?.();
            this.finishLeave();
        }
  }

  setReady(ready) {
    return this.transport.sendControl('set-ready', {
      ready: ready === true
    });
  }

  updateSettings(settings) {
    return this.transport.sendControl('update-settings', settings);
  }

  startRun() {
    return this.transport.sendControl('start-run', {});
  }

  notifyRunEnded(reason = 'ended') {
    const local = this.room?.players?.find(
      (player) => player.playerId === this.localPlayerId
    );
    if (!this.connected || local?.isHost !== true) return false;
    return this.transport.sendControl('end-run', { reason });
  }

  notifyPlayerDied(reason = 'death') {
    if (!this.connected || this.room?.status !== 'in-run') return false;
    return this.transport.sendControl('player-death', {
      reason: String(reason || 'death')
    });
  }


  kickPlayer(playerId) {
    if (!this.connected) return false;
    return this.transport.sendControl('kick-player', {
      playerId: String(playerId || '').slice(0, 160)
    });
  }

  transferHost(playerId, { reason = 'manual-host-transfer' } = {}) {
    if (!this.connected) return false;
    return this.transport.sendControl('transfer-host', {
      playerId: String(playerId || '').slice(0, 160),
      reason: String(reason || 'manual-host-transfer').slice(0, 80)
    });
  }

openLobby() {
    this.ui?.open();
    this.render();
  }

  async leaveRoom() {
        const acknowledged = new Promise((resolve) => {
            this.pendingLeaveResolver = resolve;
            setTimeout(() => {
                if (this.pendingLeaveResolver !== resolve) return;
                this.pendingLeaveResolver = null;
                resolve();
            }, 750);
        });
        try {
            this.transport.sendControl('leave', { reason: 'manual' });
            await acknowledged;
        } finally {
            this.pendingLeaveResolver = null;
            await this.transport.disconnect('left-room', { fallbackLocal: true });
            this.finishLeave();
        }
    }

  finishLeave() {
    cancelMultiplayerRefreshResumeWatchdog({
      reason: 'multiplayer-room-left'
    });
    cancelMultiplayerRefreshRunProof({
      reason: 'multiplayer-room-left'
    });
    this.connected = false;
    this.room = null;
    this.error = null;
    this.quickMatchConnectInFlight = false;
    this.pendingQuickMatchAssignment = null;
    this.pendingPublicListing = null;
    this.roomDirectory.clear();
    if (this.matchmaking?.isActive?.()) {
      void this.matchmaking.cancel({ reason: 'room-left' });
    }
    this.lastAuthorityEpoch = 0;
    this.session.returnToLocalSession({
      hostPlayerId: this.localPlayerId
    });
    this.runtime.resetToLocalRoom();
    this.onLeftRoom?.();
    this.render();
  }

  render() {
    const transportState = this.transport.getState();
    const transportMode = this.transport.getMode();
    const transportConnecting = transportMode === TRANSPORT_MODES.ONLINE
      && [
        TRANSPORT_STATES.CONNECTING,
        TRANSPORT_STATES.RECONNECTING
      ].includes(transportState);
    const connecting = transportConnecting || this.quickMatchConnectInFlight;

    this.ui?.render({
      connected: this.connected,
      connecting,
      transportState,
      transportMode,
      room: this.room,
      productionRelease: this.productionRelease || getMultiplayerProductionReleaseSnapshot(),
      matchmaking: this.matchmakingState || this.matchmaking.getSnapshot(),
      roomDirectory: this.roomDirectoryState || this.roomDirectory.getSnapshot(),
      pvp2: this.pvp2State || this.pvp2.getSnapshot(),
            lastRoom: this.lastRoom || loadLastRoom(),
            localPlayerId: this.localPlayerId,
      error: this.error
    });
  }

  getSnapshot() {
    return {
      connected: this.connected,
      room: this.room,
            lastRoom: this.lastRoom || loadLastRoom(),
            error: this.error,
      productionRelease: this.productionRelease || getMultiplayerProductionReleaseSnapshot(),
      matchmaking: this.matchmakingState || this.matchmaking.getSnapshot(),
      roomDirectory: this.roomDirectoryState || this.roomDirectory.getSnapshot(),
      pvp2: this.pvp2State || this.pvp2.getSnapshot(),
      transport: this.transport.getConnectionSnapshot()
    };
  }

  destroy() {
    cancelMultiplayerRefreshRunProof({ reason: 'multiplayer-lobby-destroyed' });
    if (this.directoryHeartbeatTimer) {
      clearInterval(this.directoryHeartbeatTimer);
      this.directoryHeartbeatTimer = null;
    }
    this.roomDirectory?.clear?.();
    this.matchmaking?.destroy?.();
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
  }
}
