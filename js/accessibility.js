// js/accessibility.js
// POST-FINAL.10 R1 — persistent Version 1.0 accessibility presentation controls.

import {
  normalizePostFinal10Accessibility
} from './postfinal10_core.js';

const STORAGE_KEY = 'ka_accessibility_v1';

const CROSSHAIR_COLORS = Object.freeze({
  white: '#ffffff',
  cyan: '#00e5ff',
  green: '#44ff88',
  yellow: '#ffe15a'
});

const SIGNAL_PALETTES = Object.freeze({
  standard: Object.freeze({
    enemy: '#ff4a36',
    ally: '#6dff9f',
    objective: '#34d8ff',
    revive: '#ff6f9f',
    warning: '#ffe45c',
    neutral: '#f4fbff'
  }),
  deuteranopia: Object.freeze({
    enemy: '#ff8a1f',
    ally: '#5ec8ff',
    objective: '#f2dc5d',
    revive: '#d9a7ff',
    warning: '#fff2a8',
    neutral: '#ffffff'
  }),
  protanopia: Object.freeze({
    enemy: '#ffb000',
    ally: '#4bc7ff',
    objective: '#fff07a',
    revive: '#c7a3ff',
    warning: '#f6e58d',
    neutral: '#ffffff'
  }),
  tritanopia: Object.freeze({
    enemy: '#ff5f76',
    ally: '#82e36f',
    objective: '#ffd166',
    revive: '#ff9bc2',
    warning: '#ffe19a',
    neutral: '#ffffff'
  }),
  monochrome: Object.freeze({
    enemy: '#ffffff',
    ally: '#d6d6d6',
    objective: '#f2f2f2',
    revive: '#bfbfbf',
    warning: '#e6e6e6',
    neutral: '#ffffff'
  })
});

let settings = readSettings();
let bound = false;

function systemDefaults() {
  const match = (query) => {
    try { return window.matchMedia?.(query)?.matches === true; } catch { return false; }
  };
  return {
    prefersReducedMotion: match('(prefers-reduced-motion: reduce)'),
    prefersHighContrast: match('(prefers-contrast: more)')
  };
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
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizePostFinal10Accessibility(
      raw ? safeParse(raw) : {},
      raw ? {} : systemDefaults()
    );
  } catch {
    return normalizePostFinal10Accessibility({}, systemDefaults());
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Restricted/private storage must not prevent gameplay.
  }
}

function update(patch = {}) {
  settings = normalizePostFinal10Accessibility({ ...settings, ...patch });
  saveSettings();
  applyAccessibilitySettings();
  return settings;
}

function setControlValue(id, value) {
  const element = document.getElementById(id);
  if (element && element.value !== String(value)) element.value = String(value);
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function crosshairColorValue(color) {
  return CROSSHAIR_COLORS[color] || CROSSHAIR_COLORS.white;
}

export function getAccessibleSignalPalette() {
  return SIGNAL_PALETTES[settings.colorVision] || SIGNAL_PALETTES.standard;
}

export function resolveAccessibleSignalColor(kind, fallback = '#f4fbff') {
  const token = String(kind || '').trim().toUpperCase();
  let semantic = 'neutral';
  if (token.includes('ENEMY') || token.includes('HOSTILE')) semantic = 'enemy';
  else if (token.includes('REVIVE') || token.includes('HELP') || token.includes('DOWN')) semantic = 'revive';
  else if (token.includes('FOLLOW') || token.includes('ALLY') || token.includes('TEAM')) semantic = 'ally';
  else if (token.includes('MOVE') || token.includes('DEFEND') || token.includes('REGROUP') || token.includes('INTERACT') || token.includes('OBJECTIVE')) semantic = 'objective';
  else if (token.includes('AMMO') || token.includes('WARNING') || token.includes('BUY')) semantic = 'warning';
  const palette = getAccessibleSignalPalette();
  return palette[semantic] || fallback;
}

export function applyAccessibilitySettings() {
  const root = document.documentElement;
  const body = document.body;
  const crosshair = document.getElementById('crosshair');
  const palette = getAccessibleSignalPalette();

  root.style.setProperty('--ka-hud-scale', String(settings.hudScale / 100));
  root.style.setProperty('--ka-crosshair-scale', String(settings.crosshairSize / 100));
  root.style.setProperty('--ka-crosshair-color', crosshairColorValue(settings.crosshairColor));
  root.style.setProperty('--ka-text-scale', String(settings.textScale / 100));
  root.style.setProperty('--ka-caption-scale', String(settings.captionScale / 100));
  root.style.setProperty('--ka-signal-enemy', palette.enemy);
  root.style.setProperty('--ka-signal-ally', palette.ally);
  root.style.setProperty('--ka-signal-objective', palette.objective);
  root.style.setProperty('--ka-signal-revive', palette.revive);
  root.style.setProperty('--ka-signal-warning', palette.warning);

  body?.classList.toggle('ka-reduced-motion', settings.reducedMotion);
  body?.classList.toggle('ka-high-contrast', settings.highContrast);
  body?.classList.toggle('ka-focus-assist', settings.focusAssist);
  if (body) body.dataset.kaColorVision = settings.colorVision;

  if (crosshair) {
    crosshair.classList.remove(
      'crosshair-style-classic',
      'crosshair-style-dot',
      'crosshair-style-ring'
    );
    crosshair.classList.add(`crosshair-style-${settings.crosshairStyle}`);
  }

  syncAccessibilityUI();
}

export function syncAccessibilityUI() {
  const motionValue = settings.reducedMotion ? 'on' : 'off';
  const contrastValue = settings.highContrast ? 'on' : 'off';
  const focusValue = settings.focusAssist ? 'on' : 'off';

  ['reduced-motion-select', 'pause-reduced-motion-select'].forEach((id) => setControlValue(id, motionValue));
  ['high-contrast-select', 'pause-high-contrast-select'].forEach((id) => setControlValue(id, contrastValue));
  ['focus-assist-select'].forEach((id) => setControlValue(id, focusValue));
  ['hud-scale-slider', 'pause-hud-scale-slider'].forEach((id) => setControlValue(id, settings.hudScale));
  ['hud-scale-current', 'pause-hud-scale-current'].forEach((id) => setText(id, `${settings.hudScale}%`));
  ['text-scale-slider', 'pause-text-scale-slider'].forEach((id) => setControlValue(id, settings.textScale));
  ['text-scale-current', 'pause-text-scale-current'].forEach((id) => setText(id, `${settings.textScale}%`));
  ['caption-scale-slider'].forEach((id) => setControlValue(id, settings.captionScale));
  ['caption-scale-current'].forEach((id) => setText(id, `${settings.captionScale}%`));
  ['color-vision-select', 'pause-color-vision-select'].forEach((id) => setControlValue(id, settings.colorVision));
  setControlValue('crosshair-style-select', settings.crosshairStyle);
  setControlValue('crosshair-color-select', settings.crosshairColor);
  setControlValue('crosshair-size-slider', settings.crosshairSize);
  setText('crosshair-size-current', `${settings.crosshairSize}%`);
  setControlValue('damage-flash-select', settings.damageFlash);
}

function bindSelect(ids, callback) {
  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener('change', () => callback(element.value));
  });
}

function bindRange(ids, callback) {
  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.addEventListener('input', () => callback(Number(element.value)));
  });
}

export function initAccessibilityControls() {
  if (bound) {
    applyAccessibilitySettings();
    return;
  }
  bound = true;

  bindSelect(['reduced-motion-select', 'pause-reduced-motion-select'], (value) => update({ reducedMotion: value === 'on' }));
  bindSelect(['high-contrast-select', 'pause-high-contrast-select'], (value) => update({ highContrast: value === 'on' }));
  bindSelect(['focus-assist-select'], (value) => update({ focusAssist: value === 'on' }));
  bindRange(['hud-scale-slider', 'pause-hud-scale-slider'], (value) => update({ hudScale: value }));
  bindRange(['text-scale-slider', 'pause-text-scale-slider'], (value) => update({ textScale: value }));
  bindRange(['caption-scale-slider'], (value) => update({ captionScale: value }));
  bindSelect(['color-vision-select', 'pause-color-vision-select'], (value) => update({ colorVision: value }));
  bindSelect(['crosshair-style-select'], (value) => update({ crosshairStyle: value }));
  bindSelect(['crosshair-color-select'], (value) => update({ crosshairColor: value }));
  bindRange(['crosshair-size-slider'], (value) => update({ crosshairSize: value }));
  bindSelect(['damage-flash-select'], (value) => update({ damageFlash: value }));

  document.getElementById('reset-accessibility-btn')?.addEventListener('click', () => {
    settings = normalizePostFinal10Accessibility({}, systemDefaults());
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
  return Object.freeze({
    ...settings,
    motionScale: getMotionScale(),
    damageFlashScale: getDamageFlashScale(),
    signalPalette: getAccessibleSignalPalette()
  });
}

if (typeof window !== 'undefined') {
  window.KAGetAccessibility = getAccessibilitySnapshot;
  window.KAResetAccessibility = () => {
    settings = normalizePostFinal10Accessibility({}, systemDefaults());
    saveSettings();
    applyAccessibilitySettings();
    return getAccessibilitySnapshot();
  };
}
