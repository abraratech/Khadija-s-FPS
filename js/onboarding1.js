// ONBOARDING.1 R1 — one-click deployment runtime and post-run discovery guidance.

import {
  ONBOARDING1_ACTIVE_RUN_KEY,
  ONBOARDING1_PATCH,
  ONBOARDING1_PROFILE_KEY,
  createOnboarding1QuickPlayPlan,
  getOnboarding1FunnelSnapshot,
  markOnboarding1DiscoverySeen,
  markOnboarding1QuickPlayCompleted,
  markOnboarding1QuickPlayFailed,
  markOnboarding1QuickPlayStarted,
  normalizeOnboarding1DiscoveryScreen,
  parseOnboarding1Profile,
  serializeOnboarding1Profile,
  shouldShowOnboarding1Discovery,
} from './onboarding1_core.js';
import { closeLaunch1Welcome } from './launch1.js';

let initialized = false;
let busy = false;
let profile = null;
let adapters = {
  launchQuickPlay: async () => ({ ok: false, reason: 'NOT_CONFIGURED' }),
  openDiscovery: () => false,
  showToast: () => {},
};

function storageGet(key, session = false) {
  try {
    const storage = session ? globalThis.sessionStorage : globalThis.localStorage;
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key, value, session = false) {
  try {
    const storage = session ? globalThis.sessionStorage : globalThis.localStorage;
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key, session = false) {
  try {
    const storage = session ? globalThis.sessionStorage : globalThis.localStorage;
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}

function loadProfile() {
  const parsed = parseOnboarding1Profile(storageGet(ONBOARDING1_PROFILE_KEY) || '');
  profile = parsed.profile;
  if (parsed.reason !== 'OK') persistProfile(profile, `profile-${parsed.reason.toLowerCase()}`);
  return profile;
}

function persistProfile(next, reason = 'updated') {
  profile = parseOnboarding1Profile(serializeOnboarding1Profile(next)).profile;
  storageSet(ONBOARDING1_PROFILE_KEY, serializeOnboarding1Profile(profile));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ka:onboarding1-profile-change', {
      detail: { reason, profile: getOnboarding1FunnelSnapshot(profile) },
    }));
  }
  renderDiscoveryState();
  return profile;
}

function activeRun() {
  const raw = storageGet(ONBOARDING1_ACTIVE_RUN_KEY, true);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value?.patch === ONBOARDING1_PATCH ? value : null;
  } catch {
    return null;
  }
}

function setActiveRun(plan) {
  storageSet(ONBOARDING1_ACTIVE_RUN_KEY, JSON.stringify({
    patch: ONBOARDING1_PATCH,
    startedAt: Number(plan?.startedAt) || Date.now(),
    firstTime: plan?.firstTime === true,
    source: String(plan?.source || 'quick-play'),
    mapId: String(plan?.mapId || 'grid_bunker'),
    difficulty: Number(plan?.difficulty) || 1,
    loadoutPolicy: String(plan?.loadoutPolicy || 'default-balanced'),
  }), true);
}

function setBusy(next) {
  busy = next === true;
  document.documentElement.dataset.kaOnboarding1Busy = busy ? 'true' : 'false';
  document.querySelectorAll('[data-onboarding1-quick-play]').forEach((button) => {
    button.disabled = busy;
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    const idleLabel = button.dataset.onboarding1IdleLabel || button.textContent.trim();
    button.dataset.onboarding1IdleLabel = idleLabel;
    if (busy) button.textContent = 'DEPLOYING…';
    else button.textContent = idleLabel;
  });
}

function renderDiscoveryState() {
  if (typeof document === 'undefined') return;
  const visible = shouldShowOnboarding1Discovery(profile || loadProfile());
  document.querySelectorAll('[data-onboarding1-discovery-panel]').forEach((panel) => {
    panel.hidden = !visible;
    panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });
  document.documentElement.dataset.kaOnboarding1Discovery = visible ? 'pending' : 'complete';
}

async function startQuickPlay(source = 'quick-play') {
  if (busy) return false;
  const plan = createOnboarding1QuickPlayPlan(profile || loadProfile(), { source });
  closeLaunch1Welcome({ remember: true });
  setBusy(true);
  profile = persistProfile(
    markOnboarding1QuickPlayStarted(profile, plan),
    'quick-play-started',
  );
  setActiveRun(plan);
  window.dispatchEvent(new CustomEvent('ka:onboarding1-quick-play-start', { detail: plan }));

  try {
    const result = await adapters.launchQuickPlay(plan);
    if (result?.ok === false) {
      throw new Error(String(result.reason || 'DEPLOYMENT_FAILED'));
    }
    adapters.showToast?.(
      plan.firstTime
        ? 'QUICK PLAY · GRID BUNKER · NORMAL · FIELD TRAINING ACTIVE'
        : 'QUICK PLAY · GRID BUNKER · NORMAL',
      '#22ff88',
      2800,
    );
    return true;
  } catch (error) {
    storageRemove(ONBOARDING1_ACTIVE_RUN_KEY, true);
    profile = persistProfile(
      markOnboarding1QuickPlayFailed(profile, {
        reason: error?.message || 'DEPLOYMENT_FAILED',
      }),
      'quick-play-failed',
    );
    adapters.showToast?.('QUICK PLAY COULD NOT START · RETURNED TO MENU', '#ff7a59', 3200);
    window.dispatchEvent(new CustomEvent('ka:onboarding1-quick-play-failed', {
      detail: { plan, reason: error?.message || 'DEPLOYMENT_FAILED' },
    }));
    return false;
  } finally {
    setBusy(false);
  }
}

function bindQuickPlayButtons() {
  document.querySelectorAll('[data-onboarding1-quick-play]').forEach((button) => {
    if (button.dataset.onboarding1Bound === 'true') return;
    button.dataset.onboarding1Bound = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void startQuickPlay(button.dataset.onboarding1QuickPlay || 'quick-play');
    });
  });
}

function bindDiscoveryButtons() {
  document.querySelectorAll('[data-onboarding1-discover]').forEach((button) => {
    if (button.dataset.onboarding1DiscoverBound === 'true') return;
    button.dataset.onboarding1DiscoverBound = 'true';
    button.addEventListener('click', () => {
      const screen = normalizeOnboarding1DiscoveryScreen(
        button.dataset.onboarding1Discover,
      );
      profile = persistProfile(
        markOnboarding1DiscoverySeen(profile || loadProfile()),
        `discovery-${screen}`,
      );
      adapters.openDiscovery?.(screen);
    });
  });

  document.querySelectorAll('[data-onboarding1-dismiss]').forEach((button) => {
    if (button.dataset.onboarding1DismissBound === 'true') return;
    button.dataset.onboarding1DismissBound = 'true';
    button.addEventListener('click', () => {
      profile = persistProfile(
        markOnboarding1DiscoverySeen(profile || loadProfile()),
        'discovery-dismissed',
      );
    });
  });
}

export function completeOnboarding1QuickPlayRun({
  reason = 'ENDED',
  mapId = '',
  mode = 'single',
  summary = null,
} = {}) {
  const run = activeRun();
  if (!run) return Object.freeze({ completed: false, reason: 'NOT_ONBOARDING_RUN' });
  if (String(mode) !== 'single' || String(mapId || run.mapId) !== 'grid_bunker') {
    return Object.freeze({ completed: false, reason: 'RUN_CONTEXT_MISMATCH' });
  }

  storageRemove(ONBOARDING1_ACTIVE_RUN_KEY, true);
  profile = persistProfile(
    markOnboarding1QuickPlayCompleted(profile || loadProfile(), { reason }),
    'quick-play-completed',
  );
  renderDiscoveryState();
  window.dispatchEvent(new CustomEvent('ka:onboarding1-quick-play-complete', {
    detail: {
      reason: String(reason || 'ENDED'),
      mapId: 'grid_bunker',
      firstTime: run.firstTime === true,
      summary,
      profile: getOnboarding1FunnelSnapshot(profile),
    },
  }));
  return Object.freeze({
    completed: true,
    firstTime: run.firstTime === true,
    profile: getOnboarding1FunnelSnapshot(profile),
  });
}

export function getOnboarding1Snapshot() {
  return getOnboarding1FunnelSnapshot(profile || loadProfile());
}

export function initOnboarding1Experience({
  launchQuickPlay = null,
  openDiscovery = null,
  showToast = null,
} = {}) {
  if (typeof launchQuickPlay === 'function') adapters.launchQuickPlay = launchQuickPlay;
  if (typeof openDiscovery === 'function') adapters.openDiscovery = openDiscovery;
  if (typeof showToast === 'function') adapters.showToast = showToast;

  if (initialized || typeof document === 'undefined') {
    renderDiscoveryState();
    return getOnboarding1Snapshot();
  }
  initialized = true;
  loadProfile();
  bindQuickPlayButtons();
  bindDiscoveryButtons();
  renderDiscoveryState();
  document.documentElement.dataset.kaOnboarding1 = 'ready';

  window.addEventListener('storage', (event) => {
    if (event.key !== ONBOARDING1_PROFILE_KEY) return;
    loadProfile();
    renderDiscoveryState();
  });

  window.KHADIJA_ONBOARDING1 = Object.freeze({
    patch: ONBOARDING1_PATCH,
    quickPlay: (source = 'api') => startQuickPlay(source),
    getSnapshot: getOnboarding1Snapshot,
  });
  return getOnboarding1Snapshot();
}
