// js/controls.js
// C13 — Rebindable keyboard controls, standard gamepad support, and mobile input settings.

const BINDINGS_KEY = 'ka_keybindings_v1';
const CONTROLLER_SETTINGS_KEY = 'ka_controller_settings_v1';

export const CONTROL_ACTIONS = Object.freeze({
  MOVE_FORWARD: 'moveForward',
  MOVE_BACKWARD: 'moveBackward',
  MOVE_LEFT: 'moveLeft',
  MOVE_RIGHT: 'moveRight',
  JUMP: 'jump',
  SPRINT: 'sprint',
  RELOAD: 'reload',
  INTERACT: 'interact',
  SWITCH_WEAPON: 'switchWeapon',
  PAUSE: 'pause',
  FIRE: 'fire',
  AIM: 'aim'
});

const ACTION_META = Object.freeze({
  [CONTROL_ACTIONS.MOVE_FORWARD]: { label: 'Move Forward', defaultCode: 'KeyW', canonicalCode: 'KeyW' },
  [CONTROL_ACTIONS.MOVE_BACKWARD]: { label: 'Move Backward', defaultCode: 'KeyS', canonicalCode: 'KeyS' },
  [CONTROL_ACTIONS.MOVE_LEFT]: { label: 'Move Left', defaultCode: 'KeyA', canonicalCode: 'KeyA' },
  [CONTROL_ACTIONS.MOVE_RIGHT]: { label: 'Move Right', defaultCode: 'KeyD', canonicalCode: 'KeyD' },
  [CONTROL_ACTIONS.JUMP]: { label: 'Jump', defaultCode: 'Space', canonicalCode: 'Space' },
  [CONTROL_ACTIONS.SPRINT]: { label: 'Sprint', defaultCode: 'ShiftLeft', canonicalCode: 'ShiftLeft' },
  [CONTROL_ACTIONS.RELOAD]: { label: 'Reload', defaultCode: 'KeyR', canonicalCode: 'KeyR' },
  [CONTROL_ACTIONS.INTERACT]: { label: 'Interact', defaultCode: 'KeyE', canonicalCode: 'KeyE' },
  [CONTROL_ACTIONS.SWITCH_WEAPON]: { label: 'Switch Weapon', defaultCode: 'KeyQ', canonicalCode: 'KeyQ' },
  [CONTROL_ACTIONS.PAUSE]: { label: 'Pause', defaultCode: 'Escape', canonicalCode: 'Escape' },
  [CONTROL_ACTIONS.FIRE]: { label: 'Fire', defaultCode: 'Mouse0', canonicalCode: 'MousedownLeft' },
  [CONTROL_ACTIONS.AIM]: { label: 'Aim / ADS', defaultCode: 'Mouse2', canonicalCode: 'MousedownRight' }
});

const RESERVED_CODES = new Set(['F6']);

const DEFAULT_CONTROLLER_SETTINGS = Object.freeze({
  lookSensitivity: 100,
  deadzone: 0.16,
  invertY: false,
  mobileLookSensitivity: 100,
  mobileHaptics: true,
  mobileAutoSprint: true
});

let bindings = readBindings();
let controllerSettings = readControllerSettings();
let captureAction = null;
let uiBound = false;
let keybindReturnFocus = null;
let lastConnectedId = '';
let previousButtons = [];
let lastGamepadIndex = -1;

const gamepadState = {
  connected: false,
  id: 'NONE',
  index: -1,
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  jumpHeld: false,
  sprintHeld: false,
  fireHeld: false,
  aimHeld: false,
  jumpPressed: false,
  reloadPressed: false,
  interactHeld: false,
  interactPressed: false,
  switchPressed: false,
  pausePressed: false,
  firePressed: false,
  lookX: 0,
  lookY: 0,
  leftX: 0,
  leftY: 0
};

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getDefaultBindings() {
  return Object.fromEntries(
    Object.entries(ACTION_META).map(([action, meta]) => [action, meta.defaultCode])
  );
}

function readBindings() {
  const defaults = getDefaultBindings();

  try {
    const stored = safeParse(localStorage.getItem(BINDINGS_KEY), {});
    const merged = { ...defaults };

    Object.keys(ACTION_META).forEach((action) => {
      const code = stored?.[action];
      if (typeof code === 'string' && code.length > 0 && !RESERVED_CODES.has(code)) {
        merged[action] = code;
      }
    });

    return merged;
  } catch {
    return defaults;
  }
}

function saveBindings() {
  try {
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
  } catch {
    // Ignore storage failures in restricted/private browsing modes.
  }
}

function readControllerSettings() {
  try {
    const stored = safeParse(localStorage.getItem(CONTROLLER_SETTINGS_KEY), {});
    return {
      lookSensitivity: Math.round(clamp(stored.lookSensitivity, 50, 180, DEFAULT_CONTROLLER_SETTINGS.lookSensitivity)),
      deadzone: clamp(stored.deadzone, 0.08, 0.35, DEFAULT_CONTROLLER_SETTINGS.deadzone),
      invertY: stored.invertY === true,
      mobileLookSensitivity: Math.round(clamp(stored.mobileLookSensitivity, 55, 170, DEFAULT_CONTROLLER_SETTINGS.mobileLookSensitivity)),
      mobileHaptics: stored.mobileHaptics !== false,
      mobileAutoSprint: stored.mobileAutoSprint !== false
    };
  } catch {
    return { ...DEFAULT_CONTROLLER_SETTINGS };
  }
}

function saveControllerSettings() {
  try {
    localStorage.setItem(CONTROLLER_SETTINGS_KEY, JSON.stringify(controllerSettings));
  } catch {
    // Ignore storage failures in restricted/private browsing modes.
  }
}

function buttonValue(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  if (!button) return 0;
  return Math.max(Number(button.value) || 0, button.pressed ? 1 : 0);
}

function buttonPressed(gamepad, index, threshold = 0.5) {
  const value = buttonValue(gamepad, index);
  const previous = previousButtons[index] || 0;
  return value >= threshold && previous < threshold;
}

function applyDeadzone(value, deadzone) {
  const magnitude = Math.abs(Number(value) || 0);
  if (magnitude <= deadzone) return 0;
  const normalized = (magnitude - deadzone) / Math.max(0.001, 1 - deadzone);
  return Math.sign(value) * Math.min(1, normalized);
}

function getPrimaryGamepad() {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;

  const pads = navigator.getGamepads();
  if (!pads) return null;

  if (lastGamepadIndex >= 0 && pads[lastGamepadIndex]?.connected) {
    return pads[lastGamepadIndex];
  }

  for (const pad of pads) {
    if (pad?.connected) return pad;
  }

  return null;
}

function updateControllerStatusUI() {
  const statusText = gamepadState.connected
    ? `CONNECTED · ${shortGamepadName(gamepadState.id)}`
    : 'NOT CONNECTED';

  ['controller-status', 'pause-controller-status'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = statusText;
    el.classList.toggle('connected', gamepadState.connected);
  });
}

function shortGamepadName(id) {
  const text = String(id || 'GAMEPAD')
    .replace(/\([^)]*\)/g, '')
    .replace(/standard gamepad/ig, '')
    .trim();
  return (text || 'STANDARD GAMEPAD').slice(0, 34).toUpperCase();
}

function updateBindingBadges() {
  document.querySelectorAll('[data-binding-action]').forEach((el) => {
    const action = el.getAttribute('data-binding-action');
    if (!ACTION_META[action]) return;
    el.textContent = getBindingLabel(action);
  });
}

function renderKeybindList() {
  const list = document.getElementById('keybind-list');
  if (!list) return;

  list.innerHTML = '';

  Object.entries(ACTION_META).forEach(([action, meta]) => {
    const row = document.createElement('div');
    row.className = 'keybind-row';

    const label = document.createElement('span');
    label.textContent = meta.label;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'keybind-capture-btn';
    button.dataset.action = action;
    button.textContent = captureAction === action ? 'PRESS INPUT…' : getBindingLabel(action);
    button.addEventListener('click', () => {
      captureAction = action;
      renderKeybindList();
    });

    row.append(label, button);
    list.appendChild(row);
  });
}

function setModalVisible(visible) {
  const modal = document.getElementById('keybind-modal');
  if (!modal) return;

  if (visible) {
    keybindReturnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : document.getElementById('open-keybinds-btn');
    modal.inert = false;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      document.getElementById('close-keybinds-btn')?.focus();
    });
  } else {
    captureAction = null;
    if (modal.contains(document.activeElement)) {
      document.activeElement?.blur?.();
    }
    modal.inert = true;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');

    const returnTarget = keybindReturnFocus?.isConnected
      ? keybindReturnFocus
      : document.getElementById('open-keybinds-btn');
    queueMicrotask(() => returnTarget?.focus?.());
  }

  renderKeybindList();
}

function assignCapturedBinding(code) {
  if (!captureAction || !code) return false;

  const duplicateAction = Object.keys(bindings).find((action) => (
    action !== captureAction && bindings[action] === code
  ));

  if (duplicateAction) {
    const oldCode = bindings[captureAction];
    bindings[duplicateAction] = oldCode;
  }

  bindings[captureAction] = code;
  captureAction = null;
  saveBindings();
  renderKeybindList();
  updateBindingBadges();

  const warning = document.getElementById('keybind-warning');
  if (warning) warning.textContent = 'Bindings are saved automatically.';
  return true;
}

function handleCaptureMousedown(event) {
  if (!captureAction) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  assignCapturedBinding(`Mouse${event.button}`);
}

function handleCaptureKeydown(event) {
  if (!captureAction) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const code = event.code;
  if (code === 'Escape') {
    captureAction = null;
    renderKeybindList();
    const warning = document.getElementById('keybind-warning');
    if (warning) warning.textContent = 'Binding capture cancelled.';
    return;
  }

  if (!code || RESERVED_CODES.has(code)) {
    const warning = document.getElementById('keybind-warning');
    if (warning) warning.textContent = 'That key is reserved for diagnostics or development tools.';
    return;
  }

  assignCapturedBinding(code);
}

function syncControllerSettingsUI() {
  const sensitivity = String(controllerSettings.lookSensitivity);
  const deadzonePercent = String(Math.round(controllerSettings.deadzone * 100));
  const mobileSensitivity = String(controllerSettings.mobileLookSensitivity);

  ['controller-sensitivity-slider', 'pause-controller-sensitivity-slider'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = sensitivity;
  });
  ['controller-sensitivity-current', 'pause-controller-sensitivity-current'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${sensitivity}%`;
  });

  const deadzone = document.getElementById('controller-deadzone-slider');
  if (deadzone) deadzone.value = deadzonePercent;
  const deadzoneLabel = document.getElementById('controller-deadzone-current');
  if (deadzoneLabel) deadzoneLabel.textContent = `${deadzonePercent}%`;

  const invert = document.getElementById('controller-invert-y-select');
  if (invert) invert.value = controllerSettings.invertY ? 'on' : 'off';

  const mobile = document.getElementById('mobile-look-sensitivity-slider');
  if (mobile) mobile.value = mobileSensitivity;
  const mobileLabel = document.getElementById('mobile-look-sensitivity-current');
  if (mobileLabel) mobileLabel.textContent = `${mobileSensitivity}%`;

  const haptics = document.getElementById('mobile-haptics-select');
  if (haptics) haptics.value = controllerSettings.mobileHaptics ? 'on' : 'off';

  const autoSprint = document.getElementById('mobile-auto-sprint-select');
  if (autoSprint) autoSprint.value = controllerSettings.mobileAutoSprint ? 'on' : 'off';
}

function bindRange(ids, callback) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => callback(Number(el.value)));
  });
}

export function initControlsUI() {
  if (uiBound) {
    updateBindingBadges();
    updateControllerStatusUI();
    syncControllerSettingsUI();
    return;
  }

  uiBound = true;

  const keybindModal = document.getElementById('keybind-modal');
  if (keybindModal) keybindModal.inert = true;

  document.getElementById('open-keybinds-btn')?.addEventListener('click', () => {
    setModalVisible(true);
  });
  document.getElementById('close-keybinds-btn')?.addEventListener('click', () => {
    setModalVisible(false);
  });
  document.getElementById('close-keybinds-btn-bottom')?.addEventListener('click', () => {
    setModalVisible(false);
  });
  document.getElementById('keybind-modal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'keybind-modal') setModalVisible(false);
  });
  document.getElementById('reset-keybinds-btn')?.addEventListener('click', () => {
    bindings = getDefaultBindings();
    saveBindings();
    captureAction = null;
    renderKeybindList();
    updateBindingBadges();
  });

  window.addEventListener('keydown', handleCaptureKeydown, true);
  window.addEventListener('mousedown', handleCaptureMousedown, true);
  window.addEventListener('gamepadconnected', (event) => {
    lastGamepadIndex = event.gamepad?.index ?? -1;
    gamepadState.connected = true;
    gamepadState.id = event.gamepad?.id || 'STANDARD GAMEPAD';
    gamepadState.index = lastGamepadIndex;
    lastConnectedId = gamepadState.id;
    updateControllerStatusUI();
  });
  window.addEventListener('gamepaddisconnected', (event) => {
    if (event.gamepad?.index === lastGamepadIndex) lastGamepadIndex = -1;
    gamepadState.connected = false;
    gamepadState.id = 'NONE';
    gamepadState.index = -1;
    lastConnectedId = '';
    previousButtons = [];
    updateControllerStatusUI();
  });

  bindRange(['controller-sensitivity-slider', 'pause-controller-sensitivity-slider'], (value) => {
    controllerSettings.lookSensitivity = Math.round(clamp(value, 50, 180, 100));
    saveControllerSettings();
    syncControllerSettingsUI();
  });

  bindRange(['controller-deadzone-slider'], (value) => {
    controllerSettings.deadzone = clamp(value / 100, 0.08, 0.35, 0.16);
    saveControllerSettings();
    syncControllerSettingsUI();
  });

  document.getElementById('controller-invert-y-select')?.addEventListener('change', (event) => {
    controllerSettings.invertY = event.target.value === 'on';
    saveControllerSettings();
    syncControllerSettingsUI();
  });

  bindRange(['mobile-look-sensitivity-slider'], (value) => {
    controllerSettings.mobileLookSensitivity = Math.round(clamp(value, 55, 170, 100));
    saveControllerSettings();
    syncControllerSettingsUI();
  });

  document.getElementById('mobile-haptics-select')?.addEventListener('change', (event) => {
    controllerSettings.mobileHaptics = event.target.value !== 'off';
    saveControllerSettings();
    syncControllerSettingsUI();
  });

  document.getElementById('mobile-auto-sprint-select')?.addEventListener('change', (event) => {
    controllerSettings.mobileAutoSprint = event.target.value !== 'off';
    saveControllerSettings();
    syncControllerSettingsUI();
  });

  renderKeybindList();
  updateBindingBadges();
  syncControllerSettingsUI();
  updateControllerStatusUI();
}

export function getKeyboardAction(code) {
  return Object.keys(ACTION_META).find((action) => bindings[action] === code) || null;
}

export function getMouseAction(button) {
  return Object.keys(ACTION_META).find((action) => bindings[action] === `Mouse${button}`) || null;
}

export function getCanonicalCode(action) {
  return ACTION_META[action]?.canonicalCode || null;
}

export function getBindingCode(action) {
  return bindings[action] || ACTION_META[action]?.defaultCode || '';
}

export function getBindingLabel(action) {
  return formatKeyCode(getBindingCode(action));
}

export function formatKeyCode(code) {
  const direct = {
    Mouse0: 'L-MOUSE',
    Mouse1: 'M-MOUSE',
    Mouse2: 'R-MOUSE',
    Mouse3: 'MOUSE 4',
    Mouse4: 'MOUSE 5',
    Space: 'SPACE',
    Escape: 'ESC',
    ShiftLeft: 'L-SHIFT',
    ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT',
    AltRight: 'R-ALT',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backquote: '`'
  };

  if (direct[code]) return direct[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `NUM ${code.slice(6)}`;
  return String(code || 'UNBOUND').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

export function isKeybindingCaptureActive() {
  return captureAction !== null;
}

export function pollGamepadInput() {
  const gamepad = getPrimaryGamepad();

  Object.assign(gamepadState, {
    connected: Boolean(gamepad),
    id: gamepad?.id || 'NONE',
    index: gamepad?.index ?? -1,
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    jumpHeld: false,
    sprintHeld: false,
    fireHeld: false,
    aimHeld: false,
    jumpPressed: false,
    reloadPressed: false,
    interactHeld: false,
    interactPressed: false,
    switchPressed: false,
    pausePressed: false,
    firePressed: false,
    lookX: 0,
    lookY: 0,
    leftX: 0,
    leftY: 0
  });

  if (!gamepad) {
    previousButtons = [];
    lastGamepadIndex = -1;
    if (lastConnectedId) {
      lastConnectedId = '';
      updateControllerStatusUI();
    }
    return gamepadState;
  }

  lastGamepadIndex = gamepad.index;
  const deadzone = controllerSettings.deadzone;
  const leftX = applyDeadzone(gamepad.axes?.[0], deadzone);
  const leftY = applyDeadzone(gamepad.axes?.[1], deadzone);
  const rightX = applyDeadzone(gamepad.axes?.[2], deadzone);
  const rawRightY = applyDeadzone(gamepad.axes?.[3], deadzone);
  const rightY = controllerSettings.invertY ? -rawRightY : rawRightY;
  const lookScale = controllerSettings.lookSensitivity / 100;

  gamepadState.leftX = leftX;
  gamepadState.leftY = leftY;
  gamepadState.moveForward = leftY < -0.18;
  gamepadState.moveBackward = leftY > 0.18;
  gamepadState.moveLeft = leftX < -0.18;
  gamepadState.moveRight = leftX > 0.18;
  gamepadState.lookX = rightX * lookScale;
  gamepadState.lookY = rightY * lookScale;
  gamepadState.jumpHeld = buttonValue(gamepad, 0) >= 0.5;
  gamepadState.reloadPressed = buttonPressed(gamepad, 2);
  gamepadState.switchPressed = buttonPressed(gamepad, 3);
  gamepadState.interactHeld = buttonValue(gamepad, 5) >= 0.5 || buttonValue(gamepad, 4) >= 0.5;
  gamepadState.interactPressed = buttonPressed(gamepad, 5) || buttonPressed(gamepad, 4);
  gamepadState.aimHeld = buttonValue(gamepad, 6) >= 0.28;
  gamepadState.fireHeld = buttonValue(gamepad, 7) >= 0.28;
  gamepadState.sprintHeld = buttonValue(gamepad, 10) >= 0.5;
  gamepadState.pausePressed = buttonPressed(gamepad, 9);
  gamepadState.jumpPressed = buttonPressed(gamepad, 0);
  gamepadState.firePressed = buttonPressed(gamepad, 7, 0.28);

  previousButtons = Array.from(gamepad.buttons || [], (button) => (
    Math.max(Number(button?.value) || 0, button?.pressed ? 1 : 0)
  ));

  if (gamepad.id !== lastConnectedId) {
    lastConnectedId = gamepad.id;
    updateControllerStatusUI();
  }

  return gamepadState;
}

export function populateFrameKeys(baseKeys, gamepadInput, outKeys) {
  const out = outKeys || {};
  const actions = [
    CONTROL_ACTIONS.MOVE_FORWARD,
    CONTROL_ACTIONS.MOVE_BACKWARD,
    CONTROL_ACTIONS.MOVE_LEFT,
    CONTROL_ACTIONS.MOVE_RIGHT,
    CONTROL_ACTIONS.JUMP,
    CONTROL_ACTIONS.SPRINT,
    CONTROL_ACTIONS.FIRE,
    CONTROL_ACTIONS.AIM,
    CONTROL_ACTIONS.INTERACT
  ];

  actions.forEach((action) => {
    const canonical = getCanonicalCode(action);
    out[canonical] = Boolean(baseKeys?.[canonical]);
  });

  out.KeyW = out.KeyW || Boolean(gamepadInput?.moveForward);
  out.KeyS = out.KeyS || Boolean(gamepadInput?.moveBackward);
  out.KeyA = out.KeyA || Boolean(gamepadInput?.moveLeft);
  out.KeyD = out.KeyD || Boolean(gamepadInput?.moveRight);
  out.Space = out.Space || Boolean(gamepadInput?.jumpHeld);
  out.ShiftLeft = out.ShiftLeft || Boolean(gamepadInput?.sprintHeld);
  out.MousedownLeft = Boolean(out.MousedownLeft || baseKeys?.MousedownLeft || gamepadInput?.fireHeld);
  out.MousedownRight = Boolean(out.MousedownRight || baseKeys?.MousedownRight || gamepadInput?.aimHeld);
  const interactCode = getCanonicalCode(CONTROL_ACTIONS.INTERACT);
  if (interactCode) {
    out[interactCode] = Boolean(out[interactCode] || gamepadInput?.interactHeld);
  }

  return out;
}

export function getMobileLookSensitivityMultiplier() {
  return controllerSettings.mobileLookSensitivity / 100;
}

export function getMobileAutoSprintEnabled() {
  return controllerSettings.mobileAutoSprint !== false;
}

export function triggerMobileHaptic(duration = 12) {
  if (!controllerSettings.mobileHaptics) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try {
    navigator.vibrate(Math.max(5, Math.min(35, Number(duration) || 12)));
    return true;
  } catch {
    return false;
  }
}

export function getControlsSnapshot() {
  return {
    bindings: { ...bindings },
    captureAction,
    controller: {
      connected: gamepadState.connected,
      id: gamepadState.id,
      index: gamepadState.index,
      lookSensitivity: controllerSettings.lookSensitivity,
      deadzone: controllerSettings.deadzone,
      invertY: controllerSettings.invertY
    },
    mobile: {
      lookSensitivity: controllerSettings.mobileLookSensitivity,
      haptics: controllerSettings.mobileHaptics,
      autoSprint: controllerSettings.mobileAutoSprint,
      adsMode: 'hold'
    }
  };
}

if (typeof window !== 'undefined') {
  window.KAGetControls = getControlsSnapshot;
  window.KAResetKeybinds = () => {
    bindings = getDefaultBindings();
    saveBindings();
    renderKeybindList();
    updateBindingBadges();
    return getControlsSnapshot();
  };
}
