// js/accessibility.js
// C13 — Persistent accessibility and HUD presentation settings.

const STORAGE_KEY = 'ka_accessibility_v1';

const DEFAULTS = Object.freeze({
  reducedMotion: false,
  highContrast: false,
  hudScale: 100,
  crosshairStyle: 'classic',
  crosshairColor: 'white',
  crosshairSize: 100,
  damageFlash: 'normal'
});

const VALID_CROSSHAIR_STYLES = new Set(['classic', 'dot', 'ring']);
const VALID_CROSSHAIR_COLORS = new Set(['white', 'cyan', 'green', 'yellow']);
const VALID_DAMAGE_FLASH = new Set(['normal', 'low', 'off']);

let settings = readSettings();
let bound = false;

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readSettings() {
  try {
    const stored = safeParse(localStorage.getItem(STORAGE_KEY));
    return {
      reducedMotion: stored.reducedMotion === true,
      highContrast: stored.highContrast === true,
      hudScale: Math.round(clamp(stored.hudScale, 85, 130, DEFAULTS.hudScale)),
      crosshairStyle: VALID_CROSSHAIR_STYLES.has(stored.crosshairStyle) ? stored.crosshairStyle : DEFAULTS.crosshairStyle,
      crosshairColor: VALID_CROSSHAIR_COLORS.has(stored.crosshairColor) ? stored.crosshairColor : DEFAULTS.crosshairColor,
      crosshairSize: Math.round(clamp(stored.crosshairSize, 80, 150, DEFAULTS.crosshairSize)),
      damageFlash: VALID_DAMAGE_FLASH.has(stored.damageFlash) ? stored.damageFlash : DEFAULTS.damageFlash
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures in restricted/private browsing modes.
  }
}

function setControlValue(id, value) {
  const el = document.getElementById(id);
  if (el && el.value !== String(value)) el.value = String(value);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getCrosshairColorValue(color) {
  const colors = {
    white: '#ffffff',
    cyan: '#00e5ff',
    green: '#44ff88',
    yellow: '#ffe15a'
  };
  return colors[color] || colors.white;
}

export function applyAccessibilitySettings() {
  const root = document.documentElement;
  const body = document.body;
  const crosshair = document.getElementById('crosshair');

  root.style.setProperty('--ka-hud-scale', String(settings.hudScale / 100));
  root.style.setProperty('--ka-crosshair-scale', String(settings.crosshairSize / 100));
  root.style.setProperty('--ka-crosshair-color', getCrosshairColorValue(settings.crosshairColor));

  body?.classList.toggle('ka-reduced-motion', settings.reducedMotion);
  body?.classList.toggle('ka-high-contrast', settings.highContrast);

  if (crosshair) {
    crosshair.classList.remove('crosshair-style-classic', 'crosshair-style-dot', 'crosshair-style-ring');
    crosshair.classList.add(`crosshair-style-${settings.crosshairStyle}`);
  }

  syncAccessibilityUI();
}

export function syncAccessibilityUI() {
  const motionValue = settings.reducedMotion ? 'on' : 'off';
  const contrastValue = settings.highContrast ? 'on' : 'off';

  ['reduced-motion-select', 'pause-reduced-motion-select'].forEach((id) => setControlValue(id, motionValue));
  ['high-contrast-select'].forEach((id) => setControlValue(id, contrastValue));
  ['hud-scale-slider', 'pause-hud-scale-slider'].forEach((id) => setControlValue(id, settings.hudScale));
  ['hud-scale-current', 'pause-hud-scale-current'].forEach((id) => setText(id, `${settings.hudScale}%`));
  setControlValue('crosshair-style-select', settings.crosshairStyle);
  setControlValue('crosshair-color-select', settings.crosshairColor);
  setControlValue('crosshair-size-slider', settings.crosshairSize);
  setText('crosshair-size-current', `${settings.crosshairSize}%`);
  setControlValue('damage-flash-select', settings.damageFlash);
}

function bindSelect(ids, callback) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      callback(el.value);
      saveSettings();
      applyAccessibilitySettings();
    });
  });
}

function bindRange(ids, callback) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      callback(Number(el.value));
      saveSettings();
      applyAccessibilitySettings();
    });
  });
}

export function initAccessibilityControls() {
  if (bound) {
    applyAccessibilitySettings();
    return;
  }

  bound = true;

  bindSelect(['reduced-motion-select', 'pause-reduced-motion-select'], (value) => {
    settings.reducedMotion = value === 'on';
  });
  bindSelect(['high-contrast-select'], (value) => {
    settings.highContrast = value === 'on';
  });
  bindRange(['hud-scale-slider', 'pause-hud-scale-slider'], (value) => {
    settings.hudScale = Math.round(clamp(value, 85, 130, DEFAULTS.hudScale));
  });
  bindSelect(['crosshair-style-select'], (value) => {
    if (VALID_CROSSHAIR_STYLES.has(value)) settings.crosshairStyle = value;
  });
  bindSelect(['crosshair-color-select'], (value) => {
    if (VALID_CROSSHAIR_COLORS.has(value)) settings.crosshairColor = value;
  });
  bindRange(['crosshair-size-slider'], (value) => {
    settings.crosshairSize = Math.round(clamp(value, 80, 150, DEFAULTS.crosshairSize));
  });
  bindSelect(['damage-flash-select'], (value) => {
    if (VALID_DAMAGE_FLASH.has(value)) settings.damageFlash = value;
  });

  document.getElementById('reset-accessibility-btn')?.addEventListener('click', () => {
    settings = { ...DEFAULTS };
    saveSettings();
    applyAccessibilitySettings();
  });

  applyAccessibilitySettings();
}

export function getMotionScale() {
  return settings.reducedMotion ? 0.15 : 1;
}

export function getDamageFlashScale() {
  if (settings.damageFlash === 'off') return 0;
  if (settings.damageFlash === 'low') return 0.35;
  return 1;
}

export function getAccessibilitySnapshot() {
  return { ...settings, motionScale: getMotionScale(), damageFlashScale: getDamageFlashScale() };
}

if (typeof window !== 'undefined') {
  window.KAGetAccessibility = getAccessibilitySnapshot;
  window.KAResetAccessibility = () => {
    settings = { ...DEFAULTS };
    saveSettings();
    applyAccessibilitySettings();
    return getAccessibilitySnapshot();
  };
}
