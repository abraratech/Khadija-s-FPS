import {
  DEFAULT_PLAYER_PREFERENCES,
  loadPlayerPreferences,
  mergePlayerPreferences,
  resetPlayerPreferences as resetStoredPlayerPreferences,
  savePlayerPreferences
} from './player_preferences_core.js';

let preferences = loadPlayerPreferences();
let initialized = false;

function byId(id) {
  return document.getElementById(id);
}

function applyCrosshairVisibility() {
  const crosshair = byId('crosshair');
  if (crosshair) {
    crosshair.style.visibility = preferences.crosshairEnabled ? '' : 'hidden';
    crosshair.setAttribute('aria-hidden', preferences.crosshairEnabled ? 'false' : 'true');
  }
  document.documentElement.dataset.kaCrosshairEnabled = preferences.crosshairEnabled ? 'on' : 'off';
}

function syncPlayerPreferenceControls() {
  const musicSlider = byId('music-volume-slider');
  const musicLabel = byId('music-volume-current');
  const crosshairSelect = byId('crosshair-enabled-select');
  const adsSelect = byId('ads-mode-select');
  const invertSelect = byId('mouse-invert-y-select');
  if (musicSlider) musicSlider.value = String(preferences.musicVolume);
  if (musicLabel) musicLabel.textContent = `${preferences.musicVolume}%`;
  if (crosshairSelect) crosshairSelect.value = preferences.crosshairEnabled ? 'on' : 'off';
  if (adsSelect) adsSelect.value = preferences.adsMode;
  if (invertSelect) invertSelect.value = preferences.invertY ? 'on' : 'off';
  applyCrosshairVisibility();
}

function emitPreferenceChange() {
  window.dispatchEvent(new CustomEvent('ka:player-preferences-change', {
    detail: getPlayerPreferencesSnapshot()
  }));
}

export function setPlayerPreferences(patch) {
  preferences = savePlayerPreferences(mergePlayerPreferences(preferences, patch));
  syncPlayerPreferenceControls();
  emitPreferenceChange();
  return getPlayerPreferencesSnapshot();
}

export function resetPlayerPreferences() {
  preferences = resetStoredPlayerPreferences();
  syncPlayerPreferenceControls();
  emitPreferenceChange();
  return getPlayerPreferencesSnapshot();
}

export function getPlayerPreferencesSnapshot() {
  return Object.freeze({ ...preferences });
}

export function getMusicVolumePercent() {
  return preferences.musicVolume;
}

export function getCrosshairEnabled() {
  return preferences.crosshairEnabled;
}

export function getAdsMode() {
  return preferences.adsMode;
}

export function getInvertYEnabled() {
  return preferences.invertY;
}

function bindOnce(element, eventName, handler) {
  if (!element || element.dataset.kaPlayerPreferencesBound === '1') return;
  element.dataset.kaPlayerPreferencesBound = '1';
  element.addEventListener(eventName, handler);
}

export function initPlayerPreferencesControls({ onReset = null } = {}) {
  preferences = loadPlayerPreferences();
  syncPlayerPreferenceControls();
  if (initialized) return getPlayerPreferencesSnapshot();
  initialized = true;

  const musicSlider = byId('music-volume-slider');
  bindOnce(musicSlider, 'input', () => setPlayerPreferences({ musicVolume: Number(musicSlider.value) }));

  const crosshairSelect = byId('crosshair-enabled-select');
  bindOnce(crosshairSelect, 'change', () => setPlayerPreferences({ crosshairEnabled: crosshairSelect.value !== 'off' }));

  const adsSelect = byId('ads-mode-select');
  bindOnce(adsSelect, 'change', () => setPlayerPreferences({ adsMode: adsSelect.value }));

  const invertSelect = byId('mouse-invert-y-select');
  bindOnce(invertSelect, 'change', () => setPlayerPreferences({ invertY: invertSelect.value === 'on' }));

  const resetButton = byId('reset-player-preferences-btn');
  bindOnce(resetButton, 'click', () => {
    resetPlayerPreferences();
    if (typeof onReset === 'function') onReset({ ...DEFAULT_PLAYER_PREFERENCES });
  });

  return getPlayerPreferencesSnapshot();
}
