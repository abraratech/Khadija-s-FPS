// LAUNCH.1 R1 — first-run welcome guide and launch-safe player experience.

export const LAUNCH1_PATCH = 'launch1-r1-first-run-welcome-production-language';
export const LAUNCH1_WELCOME_KEY = 'ka_launch1_welcome_seen_v1';

let initialized = false;
let lastFocusedElement = null;

function readSeen() {
  try {
    return localStorage.getItem(LAUNCH1_WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSeen(seen = true) {
  try {
    if (seen) localStorage.setItem(LAUNCH1_WELCOME_KEY, '1');
    else localStorage.removeItem(LAUNCH1_WELCOME_KEY);
  } catch {
    // Private or restricted storage must not block the menu.
  }
}

function focusableElements(root) {
  return Array.from(root?.querySelectorAll?.(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) || []).filter((element) => !element.hidden && element.offsetParent !== null);
}

function navigateTo(screen) {
  const safeScreen = ['home', 'map', 'multiplayer'].includes(screen) ? screen : 'home';
  window.dispatchEvent(new CustomEvent('ka:menu-screen', {
    detail: { screen: safeScreen, source: LAUNCH1_PATCH }
  }));
}

export function closeLaunch1Welcome({ remember = true, screen = '' } = {}) {
  const root = document.getElementById('launch1-welcome');
  if (!root) return false;
  if (remember) writeSeen(true);
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('ka-launch1-welcome-open');
  if (screen) navigateTo(screen);
  if (lastFocusedElement?.focus) {
    try { lastFocusedElement.focus({ preventScroll: true }); } catch { lastFocusedElement.focus(); }
  }
  lastFocusedElement = null;
  return true;
}

export function openLaunch1Welcome({ force = false } = {}) {
  const root = document.getElementById('launch1-welcome');
  const menu = document.getElementById('menu');
  if (!root || !menu) return false;
  if (!force && readSeen()) return false;
  if (menu.style.display === 'none') return false;

  lastFocusedElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('ka-launch1-welcome-open');
  const primary = root.querySelector('[data-launch1-action="solo"]');
  requestAnimationFrame(() => primary?.focus?.({ preventScroll: true }));
  return true;
}

function bindDialog(root) {
  root.querySelectorAll('[data-launch1-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.launch1Action;
      if (action === 'solo') closeLaunch1Welcome({ remember: true, screen: 'map' });
      else if (action === 'multiplayer') closeLaunch1Welcome({ remember: true, screen: 'multiplayer' });
      else closeLaunch1Welcome({ remember: true, screen: 'home' });
    });
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLaunch1Welcome({ remember: true, screen: 'home' });
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = focusableElements(root);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

export function initLaunch1Experience() {
  if (initialized || typeof document === 'undefined') return false;
  initialized = true;
  const root = document.getElementById('launch1-welcome');
  if (!root) return false;
  bindDialog(root);

  document.getElementById('launch1-replay-welcome-btn')?.addEventListener('click', () => {
    openLaunch1Welcome({ force: true });
  });
  window.addEventListener('ka:launch-guide-open', () => openLaunch1Welcome({ force: true }));

  window.setTimeout(() => {
    if (!readSeen()) openLaunch1Welcome();
  }, 450);
  return true;
}
