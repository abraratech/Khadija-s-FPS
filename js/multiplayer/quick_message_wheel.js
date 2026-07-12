// js/multiplayer/quick_message_wheel.js
import {
  QUICK_MESSAGE_DEFINITIONS,
  QUICK_MESSAGE_PATCH,
  isQuickMessageAllowed,
  quickMessageFeedback,
  quickMessageTypeForDigit
} from './quick_message_core.js';

const ROOT_ID = 'ka-quick-message-wheel';
const MOBILE_BUTTON_ID = 'ka-quick-message-mobile-button';

let initialized = false;
let wheelOpen = false;
let root = null;
let mobileButton = null;
let config = null;

function editableTarget(target) {
  return target instanceof Element
    && target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function onlineNow() {
  return config?.isOnline?.() === true;
}

function playingNow() {
  return String(config?.getGameState?.() || '') === 'playing';
}

function aliveNow() {
  return config?.getPlayerAlive?.() === true;
}

function setWheelOpen(open) {
  wheelOpen = open === true && onlineNow() && playingNow();
  if (root) {
    root.style.display = wheelOpen ? 'grid' : 'none';
    root.setAttribute('aria-hidden', wheelOpen ? 'false' : 'true');
  }
  document.documentElement.dataset.kaQuickMessageWheel = wheelOpen ? 'open' : 'closed';
  return wheelOpen;
}

function send(type) {
  const gate = isQuickMessageAllowed(type, {
    online: onlineNow(),
    alive: aliveNow()
  });
  if (!gate.allowed) {
    config?.showToast?.(quickMessageFeedback({ accepted: false, reason: gate.reason }, type));
    return { accepted: false, reason: gate.reason };
  }
  const result = config?.sendMessage?.(type) || { accepted: false, reason: 'not-ready' };
  config?.showToast?.(quickMessageFeedback(result, type));
  if (result.accepted === true) setWheelOpen(false);
  return result;
}

function makeButton(definition) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.quickMessageType = definition.type;
  button.setAttribute('aria-label', `${definition.digit}. ${definition.label}`);
  Object.assign(button.style, {
    width: 'min(210px, 42vw)',
    minHeight: '82px',
    padding: '12px 14px',
    border: '1px solid rgba(77, 224, 255, .72)',
    borderRadius: '12px',
    background: 'linear-gradient(145deg, rgba(4, 18, 28, .96), rgba(7, 10, 18, .96))',
    boxShadow: '0 0 18px rgba(0, 212, 255, .18)',
    color: '#f4fbff',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'left',
    cursor: 'pointer'
  });

  const heading = document.createElement('strong');
  heading.textContent = `${definition.digit}  ${definition.label.toUpperCase()}`;
  Object.assign(heading.style, {
    display: 'block',
    color: '#72e8ff',
    fontSize: '14px',
    letterSpacing: '.06em'
  });

  const detail = document.createElement('span');
  detail.textContent = definition.description;
  Object.assign(detail.style, {
    display: 'block',
    marginTop: '5px',
    color: '#c8d9e5',
    fontSize: '11px',
    lineHeight: '1.3'
  });

  button.append(heading, detail);
  button.addEventListener('mouseenter', () => {
    button.style.borderColor = '#ffffff';
    button.style.transform = 'translateY(-1px)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.borderColor = 'rgba(77, 224, 255, .72)';
    button.style.transform = '';
  });
  button.addEventListener('click', () => send(definition.type));
  return button;
}

function ensureUi() {
  if (root || typeof document === 'undefined') return;

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Co-op quick messages');
  root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '75',
    display: 'none',
    placeItems: 'center',
    padding: '22px',
    background: 'radial-gradient(circle at center, rgba(2, 12, 20, .58), rgba(0, 0, 0, .78))',
    backdropFilter: 'blur(3px)',
    pointerEvents: 'none'
  });

  const shell = document.createElement('div');
  Object.assign(shell.style, {
    width: 'min(700px, 96vw)',
    padding: '18px',
    border: '1px solid rgba(89, 226, 255, .62)',
    borderRadius: '18px',
    background: 'rgba(2, 8, 14, .93)',
    boxShadow: '0 0 34px rgba(0, 212, 255, .24)',
    pointerEvents: 'auto'
  });

  const title = document.createElement('div');
  title.textContent = 'TACTICAL QUICK MESSAGE';
  Object.assign(title.style, {
    color: '#e9fbff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '16px',
    fontWeight: '900',
    letterSpacing: '.12em',
    textAlign: 'center'
  });

  const subtitle = document.createElement('div');
  subtitle.textContent = 'Hold C and press 1–6 · release C to close';
  Object.assign(subtitle.style, {
    margin: '5px 0 14px',
    color: '#88a9b8',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '11px',
    textAlign: 'center'
  });

  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
    justifyItems: 'center'
  });
  QUICK_MESSAGE_DEFINITIONS.forEach((definition) => grid.appendChild(makeButton(definition)));

  shell.append(title, subtitle, grid);
  root.appendChild(shell);
  document.body.appendChild(root);

  mobileButton = document.createElement('button');
  mobileButton.id = MOBILE_BUTTON_ID;
  mobileButton.type = 'button';
  mobileButton.textContent = 'COMMS';
  mobileButton.setAttribute('aria-label', 'Open co-op quick messages');
  Object.assign(mobileButton.style, {
    position: 'fixed',
    right: '18px',
    bottom: '104px',
    zIndex: '74',
    display: 'none',
    width: '64px',
    height: '46px',
    border: '1px solid #55e5ff',
    borderRadius: '12px',
    background: 'rgba(2, 14, 22, .88)',
    color: '#e8fbff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '11px',
    fontWeight: '900',
    letterSpacing: '.08em',
    boxShadow: '0 0 16px rgba(0, 212, 255, .25)'
  });
  mobileButton.addEventListener('click', () => setWheelOpen(!wheelOpen));
  document.body.appendChild(mobileButton);
}

function syncUi() {
  ensureUi();
  const available = onlineNow() && playingNow();
  if (!available && wheelOpen) setWheelOpen(false);
  if (mobileButton) {
    mobileButton.style.display = config?.isMobile === true && available ? 'block' : 'none';
  }
}

function onKeyDown(event) {
  if (editableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

  if (event.code === 'KeyC' && !event.repeat) {
    if (onlineNow() && playingNow()) {
      event.preventDefault();
      setWheelOpen(true);
    }
    return;
  }

  if (!wheelOpen) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    setWheelOpen(false);
    return;
  }

  const type = quickMessageTypeForDigit(event.code);
  if (type) {
    event.preventDefault();
    send(type);
  }
}

function onKeyUp(event) {
  if (event.code !== 'KeyC') return;
  if (wheelOpen) {
    event.preventDefault();
    setWheelOpen(false);
  }
}

export function initMultiplayerQuickMessageWheel(options = {}) {
  config = {
    isMobile: options.isMobile === true,
    isOnline: typeof options.isOnline === 'function' ? options.isOnline : () => false,
    getGameState: typeof options.getGameState === 'function' ? options.getGameState : () => 'menu',
    getPlayerAlive: typeof options.getPlayerAlive === 'function' ? options.getPlayerAlive : () => true,
    sendMessage: typeof options.sendMessage === 'function' ? options.sendMessage : () => ({ accepted: false, reason: 'not-ready' }),
    showToast: typeof options.showToast === 'function' ? options.showToast : () => {}
  };
  ensureUi();
  syncUi();

  if (!initialized) {
    initialized = true;
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', () => setWheelOpen(false));
    setInterval(syncUi, 250);
  }

  const api = Object.freeze({
    patch: QUICK_MESSAGE_PATCH,
    open: () => setWheelOpen(true),
    close: () => setWheelOpen(false),
    send,
    getSnapshot: () => Object.freeze({
      initialized,
      open: wheelOpen,
      online: onlineNow(),
      playing: playingNow()
    })
  });
  try {
    window.KHADIJA_QUICK_MESSAGES = api;
  } catch {
    // Diagnostics must never interrupt startup.
  }
  return api;
}
