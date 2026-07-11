export const PLAYER_PREFERENCES_STORAGE_KEY = 'ka_player_preferences_v1';

export const DEFAULT_PLAYER_PREFERENCES = Object.freeze({
  schema: 1,
  musicVolume: 60,
  crosshairEnabled: true,
  adsMode: 'hold',
  invertY: false
});

function clampInteger(value, minimum, maximum, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

function normalizeBoolean(value, fallback) {
  if (value === true || value === false) return value;
  if (value === 'true' || value === 'on' || value === 1) return true;
  if (value === 'false' || value === 'off' || value === 0) return false;
  return fallback;
}

export function normalizePlayerPreferences(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({
    schema: 1,
    musicVolume: clampInteger(source.musicVolume, 0, 100, DEFAULT_PLAYER_PREFERENCES.musicVolume),
    crosshairEnabled: normalizeBoolean(source.crosshairEnabled, DEFAULT_PLAYER_PREFERENCES.crosshairEnabled),
    adsMode: source.adsMode === 'toggle' ? 'toggle' : 'hold',
    invertY: normalizeBoolean(source.invertY, DEFAULT_PLAYER_PREFERENCES.invertY)
  });
}

export function mergePlayerPreferences(current, patch) {
  const base = normalizePlayerPreferences(current);
  const delta = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  return normalizePlayerPreferences({ ...base, ...delta });
}

export function serializePlayerPreferences(value) {
  return JSON.stringify(normalizePlayerPreferences(value));
}

export function loadPlayerPreferences(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(PLAYER_PREFERENCES_STORAGE_KEY);
    if (!raw) return normalizePlayerPreferences();
    return normalizePlayerPreferences(JSON.parse(raw));
  } catch {
    return normalizePlayerPreferences();
  }
}

export function savePlayerPreferences(value, storage = globalThis.localStorage) {
  const normalized = normalizePlayerPreferences(value);
  try {
    storage?.setItem?.(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Restricted/private storage must not prevent gameplay.
  }
  return normalized;
}

export function resetPlayerPreferences(storage = globalThis.localStorage) {
  return savePlayerPreferences(DEFAULT_PLAYER_PREFERENCES, storage);
}
