import { classifyViewport, chooseDirectionalTarget, edgePressed, normalizeAxis } from './controller_navigation_core.js';

const NAV_SELECTOR = [
  'button:not([disabled])',
  'select:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const MODAL_SELECTORS = [
  '[role="dialog"]',
  '.ka-coop-card',
  '.ka-coop-modal',
  '.ka-coop-overlay',
  '#pause-screen',
  '#death-screen',
];

function visible(element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  if (element.closest('[aria-hidden="true"]')) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

function unique(items) {
  return [...new Set(items)];
}

function dispatchValueEvents(element) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

class CrossPlatformUiManager {
  constructor() {
    this.previousButtons = [];
    this.previousAxes = [0, 0];
    this.repeatAt = 0;
    this.lastGamepadAt = 0;
    this.gamepadConnected = false;
    this.inputMode = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
    this.status = null;
    this.animationFrame = 0;
    this.lastFocused = null;
    this.boundRefresh = () => this.refreshViewport();
    this.install();
  }

  install() {
    document.documentElement.dataset.kaInput = this.inputMode;
    document.body.classList.add('ka-ui9-ready');
    this.ensureStatus();
    this.refreshViewport();
    addEventListener('resize', this.boundRefresh, { passive: true });
    addEventListener('orientationchange', this.boundRefresh, { passive: true });
    addEventListener('gamepadconnected', event => {
      this.gamepadConnected = true;
      this.setInputMode('gamepad');
      this.refreshViewport();
      this.showStatus(`CONTROLLER ${event.gamepad?.index ?? 1} READY`);
      this.focusFirstInScope();
    });
    addEventListener('gamepaddisconnected', () => {
      this.gamepadConnected = Boolean(navigator.getGamepads?.().some(Boolean));
      this.refreshViewport();
      if (!this.gamepadConnected && this.inputMode === 'gamepad') this.setInputMode('keyboard');
    });
    addEventListener('keydown', event => {
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) this.setInputMode('keyboard');
    }, true);
    addEventListener('pointerdown', event => {
      this.setInputMode(event.pointerType === 'touch' ? 'touch' : 'pointer');
    }, true);
    addEventListener('touchstart', () => this.setInputMode('touch'), { passive: true, capture: true });
    document.addEventListener('focusin', event => {
      if (event.target instanceof HTMLElement) this.lastFocused = event.target;
    });
    this.animationFrame = requestAnimationFrame(() => this.pollGamepads());
    window.KHADIJA_CROSS_PLATFORM_UI = this;
    window.KA_UI9_REPORT = () => this.getReport();
  }

  ensureStatus() {
    let status = document.getElementById('ka-input-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'ka-input-status';
      status.setAttribute('aria-live', 'polite');
      status.innerHTML = '<b>CONTROLLER ACTIVE</b><span>D-PAD NAVIGATE · A SELECT · B BACK</span>';
      document.body.appendChild(status);
    }
    this.status = status;
  }

  showStatus(message = '') {
    if (!this.status) return;
    const label = this.status.querySelector('b');
    if (label && message) label.textContent = message;
    this.status.dataset.visible = 'true';
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      if (this.status) {
        const current = this.status.querySelector('b');
        if (current) current.textContent = 'CONTROLLER ACTIVE';
      }
    }, 1800);
  }

  setInputMode(mode) {
    if (!mode || this.inputMode === mode) return;
    this.inputMode = mode;
    document.documentElement.dataset.kaInput = mode;
    if (this.status && mode !== 'gamepad') this.status.dataset.visible = 'false';
    if (mode === 'gamepad') this.lastGamepadAt = performance.now();
  }

  refreshViewport() {
    const viewport = classifyViewport(innerWidth, innerHeight);
    document.documentElement.dataset.kaViewport = viewport;
    const hasGamepad = this.gamepadConnected || Boolean(navigator.getGamepads?.().some(Boolean));
    document.documentElement.dataset.kaTv = String(hasGamepad && viewport === 'wide');
    document.documentElement.style.setProperty('--ka-ui9-vw', `${innerWidth}px`);
    document.documentElement.style.setProperty('--ka-ui9-vh', `${innerHeight}px`);
  }

  activeScope() {
    const visibleModals = unique(MODAL_SELECTORS.flatMap(selector => [...document.querySelectorAll(selector)]))
      .filter(visible);
    if (visibleModals.length) return visibleModals.at(-1);

    const menu = document.getElementById('menu');
    if (!visible(menu)) return null;
    const activeScreen = menu.querySelector('[data-menu-screen].active');
    return visible(activeScreen) ? activeScreen : menu;
  }

  navigables(scope = this.activeScope()) {
    if (!scope) return [];
    const items = [...scope.querySelectorAll(NAV_SELECTOR)].filter(element => {
      if (!visible(element)) return false;
      if (element.getAttribute('aria-disabled') === 'true') return false;
      if (element.tabIndex < 0) return false;
      return true;
    });
    if (scope.matches?.(NAV_SELECTOR) && visible(scope)) items.unshift(scope);
    return unique(items);
  }

  focusFirstInScope() {
    const items = this.navigables();
    if (!items.length) return;
    const preferred = items.find(item => item.classList.contains('selected') || item.classList.contains('active')) || items[0];
    preferred.focus({ preventScroll: true });
    preferred.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  move(direction) {
    const scope = this.activeScope();
    const items = this.navigables(scope);
    if (!items.length) return;
    const active = items.includes(document.activeElement) ? document.activeElement : null;
    if (!active) {
      this.focusFirstInScope();
      return;
    }

    if (this.adjustControl(active, direction)) return;

    const currentRect = active.getBoundingClientRect();
    const candidates = items
      .filter(item => item !== active)
      .map(item => ({ element: item, rect: item.getBoundingClientRect() }));
    const target = chooseDirectionalTarget(currentRect, candidates, direction)?.element;
    const fallbackIndex = direction === 'left' || direction === 'up'
      ? (items.indexOf(active) - 1 + items.length) % items.length
      : (items.indexOf(active) + 1) % items.length;
    const next = target || items[fallbackIndex];
    next?.focus({ preventScroll: true });
    next?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
  }

  adjustControl(active, direction) {
    if (!(active instanceof HTMLInputElement || active instanceof HTMLSelectElement)) return false;
    if (!['left', 'right'].includes(direction)) return false;
    const delta = direction === 'right' ? 1 : -1;
    if (active instanceof HTMLInputElement && active.type === 'range') {
      const step = Number(active.step) || 1;
      const minimum = Number(active.min) || 0;
      const maximum = Number(active.max) || 100;
      active.value = String(Math.max(minimum, Math.min(maximum, Number(active.value) + step * delta)));
      dispatchValueEvents(active);
      return true;
    }
    if (active instanceof HTMLSelectElement) {
      active.selectedIndex = Math.max(0, Math.min(active.options.length - 1, active.selectedIndex + delta));
      dispatchValueEvents(active);
      return true;
    }
    return false;
  }

  activate() {
    const scope = this.activeScope();
    const items = this.navigables(scope);
    const active = items.includes(document.activeElement) ? document.activeElement : null;
    if (!active) {
      this.focusFirstInScope();
      return;
    }
    if (active instanceof HTMLInputElement && ['text', 'search', 'email', 'password'].includes(active.type)) {
      active.focus();
      return;
    }
    active.click();
  }

  back() {
    const scope = this.activeScope();
    if (!scope) return;
    const close = [...scope.querySelectorAll('.ka-coop-icon-btn, [aria-label="Close"], [data-close], #close-keybinds-btn')]
      .find(visible);
    if (close instanceof HTMLElement) {
      close.click();
      return;
    }
    const backCandidates = [...scope.querySelectorAll('[data-next-screen], button')].filter(element => {
      if (!visible(element)) return false;
      const text = `${element.textContent || ''} ${element.getAttribute('aria-label') || ''}`.toLowerCase();
      return text.includes('back') || text.includes('close') || text.includes('cancel');
    });
    if (backCandidates[0] instanceof HTMLElement) {
      backCandidates[0].click();
      return;
    }
    const menu = document.getElementById('menu');
    const home = menu?.querySelector('[data-next-screen="home"]');
    if (home instanceof HTMLElement) home.click();
  }

  pollGamepads() {
    const gamepads = navigator.getGamepads?.() || [];
    const gamepad = [...gamepads].find(Boolean);
    this.gamepadConnected = Boolean(gamepad);
    if (gamepad) this.handleGamepad(gamepad);
    if (this.status) this.status.dataset.visible = String(this.inputMode === 'gamepad' && Boolean(this.activeScope()));
    this.animationFrame = requestAnimationFrame(() => this.pollGamepads());
  }

  handleGamepad(gamepad) {
    const buttons = [...gamepad.buttons].map(button => ({ pressed: button.pressed, value: button.value }));
    const axes = [normalizeAxis(gamepad.axes?.[0]), normalizeAxis(gamepad.axes?.[1])];
    const direction = edgePressed(buttons, this.previousButtons, 14) || (axes[0] === -1 && this.previousAxes[0] !== -1) ? 'left'
      : edgePressed(buttons, this.previousButtons, 15) || (axes[0] === 1 && this.previousAxes[0] !== 1) ? 'right'
      : edgePressed(buttons, this.previousButtons, 12) || (axes[1] === -1 && this.previousAxes[1] !== -1) ? 'up'
      : edgePressed(buttons, this.previousButtons, 13) || (axes[1] === 1 && this.previousAxes[1] !== 1) ? 'down'
      : null;

    const now = performance.now();
    if (direction && now >= this.repeatAt && this.activeScope()) {
      this.setInputMode('gamepad');
      this.move(direction);
      this.repeatAt = now + 170;
    }
    if (edgePressed(buttons, this.previousButtons, 0) && this.activeScope()) {
      this.setInputMode('gamepad');
      this.activate();
    }
    if (edgePressed(buttons, this.previousButtons, 1) && this.activeScope()) {
      this.setInputMode('gamepad');
      this.back();
    }
    this.previousButtons = buttons;
    this.previousAxes = axes;
  }

  getReport() {
    const scope = this.activeScope();
    const gamepads = navigator.getGamepads?.() || [];
    return Object.freeze({
      viewport: document.documentElement.dataset.kaViewport || classifyViewport(innerWidth, innerHeight),
      width: innerWidth,
      height: innerHeight,
      inputMode: this.inputMode,
      tvSafeMode: document.documentElement.dataset.kaTv === 'true',
      gamepads: [...gamepads].filter(Boolean).map(gamepad => ({ index: gamepad.index, id: gamepad.id, mapping: gamepad.mapping })),
      activeScope: scope?.id || scope?.getAttribute?.('data-menu-screen') || scope?.className || null,
      focusableCount: this.navigables(scope).length,
      activeElement: document.activeElement?.id || document.activeElement?.textContent?.trim()?.slice(0, 48) || null,
    });
  }
}

new CrossPlatformUiManager();
