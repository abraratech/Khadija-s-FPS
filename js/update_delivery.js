// POST-LAUNCH.4 R1 — player-safe update delivery and stale-shell recovery.
import {
  CURRENT_RELEASE,
  compareReleaseDescriptors,
  createRefreshUrl,
  shouldDeferUpdate
} from './update_delivery_core.js';

const CHECK_URL = 'release-version.json';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 20 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const SNOOZE_MS = 15 * 60 * 1000;
const SIGNAL_KEY = 'ka_release_update_signal_v1';
const CHANNEL_NAME = 'ka-release-updates-v1';

let pendingRelease = null;
let snoozedUntil = 0;
let checking = false;
let checkTimer = 0;
let intervalTimer = 0;
let pendingSafetyTimer = 0;
let channel = null;
let banner = null;

function stripRefreshMarker() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('ka_release')) return;
    url.searchParams.delete('ka_release');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // A restricted history API must never block game startup.
  }
}

function isElementVisible(element) {
  if (!element || element.hidden) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function getSafetyState() {
  const menu = document.getElementById('menu');
  const roomView = document.getElementById('ka-coop-room-view');
  const matchmakingStatus = document.getElementById('ka-matchmaking-status');
  const matchmakingCancel = document.getElementById('ka-matchmaking-cancel');

  return {
    documentVisible: document.visibilityState !== 'hidden',
    menuVisible: isElementVisible(menu),
    activeLobby: isElementVisible(roomView),
    matchmakingActive: isElementVisible(matchmakingStatus) && isElementVisible(matchmakingCancel)
  };
}

function ensureBanner() {
  if (banner?.isConnected) return banner;

  const root = document.createElement('aside');
  root.id = 'ka-update-ready';
  root.className = 'ka-update-ready';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <div class="ka-update-ready__icon" aria-hidden="true">↻</div>
    <div class="ka-update-ready__copy">
      <strong>UPDATE READY</strong>
      <span>A newer arena version is available.</span>
      <small>Your settings and progress stay saved.</small>
    </div>
    <div class="ka-update-ready__actions">
      <button class="ka-update-ready__primary" data-update-action="refresh" type="button">REFRESH NOW</button>
      <button class="ka-update-ready__later" data-update-action="later" type="button">LATER</button>
    </div>`;

  root.querySelector('[data-update-action="refresh"]')?.addEventListener('click', () => {
    if (!pendingRelease || shouldDeferUpdate(getSafetyState())) {
      renderUpdateState();
      return;
    }
    try {
      sessionStorage.setItem('ka_update_reload_from', CURRENT_RELEASE.releaseId);
      sessionStorage.setItem('ka_update_reload_to', pendingRelease.releaseId);
    } catch {
      // Session storage is optional.
    }
    window.dispatchEvent(new CustomEvent('ka:update-refresh', {
      detail: { from: CURRENT_RELEASE.releaseId, to: pendingRelease.releaseId }
    }));
    window.location.replace(createRefreshUrl(window.location, pendingRelease.releaseId));
  });

  root.querySelector('[data-update-action="later"]')?.addEventListener('click', () => {
    snoozedUntil = Date.now() + SNOOZE_MS;
    root.hidden = true;
  });

  document.body.appendChild(root);
  banner = root;
  return root;
}

function renderUpdateState() {
  const root = ensureBanner();
  const deferred = pendingRelease && shouldDeferUpdate(getSafetyState());
  const snoozed = Date.now() < snoozedUntil;
  root.hidden = !pendingRelease || deferred || snoozed;
  document.documentElement.classList.toggle('ka-update-pending', Boolean(pendingRelease));

  if (pendingRelease && deferred && !pendingSafetyTimer) {
    pendingSafetyTimer = window.setInterval(() => {
      if (!pendingRelease) return;
      renderUpdateState();
      if (!shouldDeferUpdate(getSafetyState())) {
        window.clearInterval(pendingSafetyTimer);
        pendingSafetyTimer = 0;
      }
    }, 1000);
  }
}

function acceptRemoteRelease(value, broadcast = true) {
  const comparison = compareReleaseDescriptors(CURRENT_RELEASE, value);
  if (!comparison.updateAvailable) return false;
  if (
    pendingRelease
    && pendingRelease.releaseSequence > comparison.remote.releaseSequence
  ) return false;

  pendingRelease = comparison.remote;
  renderUpdateState();

  if (broadcast) {
    try { channel?.postMessage(pendingRelease); } catch { /* optional */ }
    try {
      localStorage.setItem(SIGNAL_KEY, JSON.stringify({ ...pendingRelease, signalledAt: Date.now() }));
    } catch {
      // Cross-tab signaling is optional.
    }
  }
  return true;
}

async function checkForUpdate() {
  if (checking || navigator.onLine === false || document.visibilityState === 'hidden') return;
  checking = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = new URL(CHECK_URL, document.baseURI);
    url.searchParams.set('ka_check', String(Date.now()));
    const response = await fetch(url.href, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) return;
    acceptRemoteRelease(await response.json());
  } catch {
    // Update checks are silent and must not disrupt play.
  } finally {
    window.clearTimeout(timeout);
    checking = false;
  }
}

function scheduleCheck(delay = 0) {
  window.clearTimeout(checkTimer);
  checkTimer = window.setTimeout(() => void checkForUpdate(), Math.max(0, delay));
}

function initializeCrossTabSignals() {
  if ('BroadcastChannel' in window) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', (event) => acceptRemoteRelease(event.data, false));
    } catch {
      channel = null;
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== SIGNAL_KEY || !event.newValue) return;
    try { acceptRemoteRelease(JSON.parse(event.newValue), false); } catch { /* ignore */ }
  });
}

function initializeUpdateDelivery() {
  stripRefreshMarker();
  ensureBanner();
  initializeCrossTabSignals();

  window.addEventListener('online', () => scheduleCheck(800));
  window.addEventListener('pageshow', () => scheduleCheck(1200));
  window.addEventListener('ka:menu-screen', renderUpdateState);
  document.addEventListener('visibilitychange', () => {
    renderUpdateState();
    if (document.visibilityState === 'visible') scheduleCheck(1000);
  });

  const menu = document.getElementById('menu');
  if (menu && 'MutationObserver' in window) {
    new MutationObserver(renderUpdateState).observe(menu, {
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
  }

  scheduleCheck(INITIAL_CHECK_DELAY_MS);
  intervalTimer = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);

  window.KHADIJA_UPDATE_DELIVERY = Object.freeze({
    current: CURRENT_RELEASE,
    checkNow: () => checkForUpdate(),
    getPending: () => pendingRelease,
    canRefreshNow: () => !shouldDeferUpdate(getSafetyState())
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeUpdateDelivery, { once: true });
} else {
  initializeUpdateDelivery();
}

window.addEventListener('beforeunload', () => {
  window.clearTimeout(checkTimer);
  window.clearInterval(intervalTimer);
  window.clearInterval(pendingSafetyTimer);
  try { channel?.close(); } catch { /* optional */ }
});
