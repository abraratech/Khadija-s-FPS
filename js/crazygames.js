// CG.1 R1 — CrazyGames SDK v3 bridge with safe standalone fallback.
import { setPlatformAudioMuted } from './audio.js';
import {
  getMultiplayerGameMode,
  getMultiplayerSocialContext,
  joinMultiplayerSocialRoom,
  multiplayerEvents,
  openMultiplayerLobby
} from './multiplayer/foundation.js';
import { MULTIPLAYER_EVENTS } from './multiplayer/event_bus.js';
import {
  buildCrazyGamesRoomUpdate,
  classifyCrazyGamesAdError,
  isCrazyGamesEnabledEnvironment,
  normalizeCrazyGamesEnvironment,
  normalizeCrazyGamesInviteParams,
  normalizeCrazyGamesUsername,
  shouldUseCrazyGamesPlatformUi
} from './crazygames_core.js';

const DISPLAY_NAME_KEY = 'ka_multiplayer_display_name';
const state = {
  initPromise: null,
  initialized: false,
  enabled: false,
  environment: 'disabled',
  gameplayActive: false,
  adActive: false,
  platformMuted: false,
  user: null,
  settingsListener: null,
  joinListener: null,
  unsubscribers: []
};

function sdk() {
  return globalThis?.CrazyGames?.SDK || null;
}

function safeCall(fn, fallback = null) {
  try {
    return typeof fn === 'function' ? fn() : fallback;
  } catch (error) {
    console.info('[CrazyGames] SDK call skipped:', error?.code || error?.message || error);
    return fallback;
  }
}

export function isCrazyGamesEmbedded() {
  const current = normalizeCrazyGamesEnvironment(sdk()?.environment);
  if (current === 'crazygames') return true;
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('isCrazyGames') === 'true') return true;
    if (Array.from(window.location.ancestorOrigins || []).some((origin) => /(^|\.)crazygames\.com$/i.test(new URL(origin).hostname))) return true;
    return /(^|\.)crazygames\.com$/i.test(new URL(document.referrer || location.href).hostname);
  } catch {
    return false;
  }
}

function applyPlatformMute(muted) {
  state.platformMuted = muted === true;
  setPlatformAudioMuted(state.platformMuted);
}

function applyGameSettings(settings = {}) {
  document.documentElement.dataset.cgDisableChat = settings.disableChat === true ? 'true' : 'false';
  applyPlatformMute(settings.muteAudio === true || state.adActive);
  window.KHADIJA_TEXT_CHAT?.syncAvailability?.();
}

function installPlatformUi() {
  if (!shouldUseCrazyGamesPlatformUi(state.environment)) return;
  document.documentElement.classList.add('ka-crazygames-platform');
  document.documentElement.dataset.crazygames = 'true';

  const authRow = document.getElementById('cloud-profile-auth-row');
  if (authRow) authRow.hidden = true;
  [
    'cloud-profile-enable-btn',
    'cloud-profile-account-action-btn',
    'cloud-profile-manage-btn',
    'cloud-profile-link-create-btn',
    'cloud-profile-link-consume-btn',
    'cloud-profile-delete-btn'
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.hidden = true;
  });

  const cloudRow = document.getElementById('cloud-profile-settings-row');
  const cloudTitle = cloudRow?.querySelector('strong');
  const cloudDescription = cloudRow?.querySelector('small');
  if (cloudTitle) cloudTitle.textContent = 'Progress Save';
  if (cloudDescription) {
    cloudDescription.textContent = 'Progress is saved locally during Basic Launch. CrazyGames account-backed progress can be enabled for Full Launch without changing gameplay.';
  }

  const socialScreen = document.getElementById('social-screen');
  if (socialScreen && !document.getElementById('cg-social-platform-notice')) {
    const notice = document.createElement('section');
    notice.id = 'cg-social-platform-notice';
    notice.className = 'ka-social-panel ka-cg-platform-notice';
    notice.innerHTML = '<span>CRAZYGAMES SOCIAL</span><strong>PLAY WITH FRIENDS THROUGH THE CRAZYGAMES FRIENDS PANEL</strong><p>Join and invite actions are synchronized with your current Khadija\'s Arena room. Arena ID accounts remain available in the standalone version.</p><button class="ka-nav-btn" data-next-screen="multiplayer" type="button">OPEN MULTIPLAYER</button>';
    socialScreen.querySelector('.ka-section-heading')?.insertAdjacentElement('afterend', notice);
  }
}

function applyCrazyGamesUser(user) {
  state.user = user || null;
  const username = normalizeCrazyGamesUsername(user?.username, 'Player');
  if (!user?.username) return username;
  try { localStorage.setItem(DISPLAY_NAME_KEY, username); } catch {}
  const input = document.getElementById('ka-coop-name');
  if (input) input.value = username;
  document.documentElement.dataset.cgUsername = username;
  return username;
}

async function handleJoinInvite(rawInviteParams) {
  const invite = normalizeCrazyGamesInviteParams(rawInviteParams || {});
  if (!invite.roomCode) return false;
  const displayName = normalizeCrazyGamesUsername(
    state.user?.username || safeCall(() => localStorage.getItem(DISPLAY_NAME_KEY), 'Player'),
    'Player'
  );
  openMultiplayerLobby();
  return joinMultiplayerSocialRoom({
    roomCode: invite.roomCode,
    serverUrl: invite.serverUrl,
    displayName
  });
}

function syncRoomToPlatform() {
  if (!state.enabled) return false;
  const game = sdk()?.game;
  if (!game) return false;
  const context = getMultiplayerSocialContext();
  if (!context.roomId && !context.roomCode) {
    safeCall(() => game.leftRoom());
    return true;
  }
  const update = buildCrazyGamesRoomUpdate({
    ...context,
    mode: getMultiplayerGameMode(),
    maxPlayers: context?.players?.some?.((entry) => entry?.teamId) ? 4 : 2
  });
  if (!update) return false;
  safeCall(() => game.updateRoom(update));
  return true;
}

function installMultiplayerBridge() {
  const game = sdk()?.game;
  if (!game) return;
  state.unsubscribers.push(
    multiplayerEvents.on(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, () => syncRoomToPlatform()),
    multiplayerEvents.on(MULTIPLAYER_EVENTS.RUN_STARTED, () => syncRoomToPlatform()),
    multiplayerEvents.on(MULTIPLAYER_EVENTS.RUN_ENDED, () => syncRoomToPlatform()),
    multiplayerEvents.on(MULTIPLAYER_EVENTS.PLAYER_JOINED, () => syncRoomToPlatform()),
    multiplayerEvents.on(MULTIPLAYER_EVENTS.PLAYER_LEFT, () => syncRoomToPlatform())
  );

  state.joinListener = (inviteParams) => { void handleJoinInvite(inviteParams); };
  safeCall(() => game.addJoinRoomListener(state.joinListener));
  if (game.inviteParams) void handleJoinInvite(game.inviteParams);

  if (game.isInstantMultiplayer === true) {
    openMultiplayerLobby();
    setTimeout(() => document.getElementById('ka-coop-quick-match')?.click(), 450);
  }
  syncRoomToPlatform();
}

export function initCrazyGamesIntegration({ showToast = () => {} } = {}) {
  if (state.initPromise) return state.initPromise;
  state.initPromise = (async () => {
    const api = sdk();
    if (!api?.init) return { ...state };
    try {
      await api.init();
    } catch (error) {
      console.info('[CrazyGames] SDK unavailable in this environment.', error?.code || error?.message || error);
      return { ...state };
    }

    state.environment = normalizeCrazyGamesEnvironment(api.environment);
    state.enabled = isCrazyGamesEnabledEnvironment(state.environment);
    state.initialized = true;
    document.documentElement.dataset.cgEnvironment = state.environment;
    if (!state.enabled) return { ...state };

    safeCall(() => api.game.loadingStart());
    applyGameSettings(api.game.settings || {});
    state.settingsListener = (settings) => applyGameSettings(settings || {});
    safeCall(() => api.game.addSettingsChangeListener(state.settingsListener));

    try {
      if (api.user?.isUserAccountAvailable) {
        applyCrazyGamesUser(await api.user.getUser());
      }
    } catch (error) {
      console.info('[CrazyGames] Guest session active.', error?.code || error?.message || error);
    }

    if (api.user?.addAuthListener) {
      safeCall(() => api.user.addAuthListener((user) => applyCrazyGamesUser(user)));
    }

    installPlatformUi();
    installMultiplayerBridge();
    safeCall(() => api.game.loadingStop());
    if (state.environment === 'local') showToast('CRAZYGAMES LOCAL SDK READY', '#00d4ff', 2200);
    return { ...state };
  })();
  return state.initPromise;
}

export function crazyGamesGameplayStart(context = {}) {
  if (!state.enabled || state.gameplayActive) return false;
  const game = sdk()?.game;
  if (!game) return false;
  state.gameplayActive = true;
  safeCall(() => game.setGameContext?.({
    mode: String(context.mode || 'single'),
    map: String(context.mapId || 'unknown'),
    room: String(context.roomCode || '')
  }));
  safeCall(() => game.gameplayStart());
  return true;
}

export function crazyGamesGameplayStop() {
  if (!state.enabled || !state.gameplayActive) return false;
  state.gameplayActive = false;
  const game = sdk()?.game;
  safeCall(() => game?.gameplayStop());
  safeCall(() => game?.clearGameContext?.());
  return true;
}

export function requestCrazyGamesMidgameAd({ reason = 'natural-break' } = {}) {
  if (!state.enabled || state.adActive || state.gameplayActive) return Promise.resolve(false);
  const ad = sdk()?.ad;
  if (!ad?.requestAd) return Promise.resolve(false);
  state.adActive = true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      state.adActive = false;
      applyGameSettings(sdk()?.game?.settings || {});
      resolve(result);
    };
    try {
      ad.requestAd('midgame', {
        adStarted: () => {
          applyPlatformMute(true);
          document.documentElement.dataset.cgAd = 'active';
        },
        adFinished: () => {
          delete document.documentElement.dataset.cgAd;
          finish(true);
        },
        adError: (error) => {
          delete document.documentElement.dataset.cgAd;
          const classification = classifyCrazyGamesAdError(error);
          console.info(`[CrazyGames] Midgame ad skipped (${reason}):`, classification.code);
          finish(false);
        }
      });
    } catch (error) {
      console.info('[CrazyGames] Midgame ad request skipped:', error?.code || error?.message || error);
      finish(false);
    }
    setTimeout(() => finish(false), 45_000);
  });
}

export function getCrazyGamesIntegrationSnapshot() {
  return Object.freeze({
    initialized: state.initialized,
    enabled: state.enabled,
    environment: state.environment,
    gameplayActive: state.gameplayActive,
    adActive: state.adActive,
    platformMuted: state.platformMuted,
    username: state.user?.username || ''
  });
}
