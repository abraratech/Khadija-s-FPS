import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYER_PREFERENCES,
  PLAYER_PREFERENCES_STORAGE_KEY,
  loadPlayerPreferences,
  mergePlayerPreferences,
  normalizePlayerPreferences,
  resetPlayerPreferences,
  savePlayerPreferences,
  serializePlayerPreferences
} from './player_preferences_core.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    read(key) { return values.get(key); }
  };
}

assert.deepEqual(normalizePlayerPreferences(), DEFAULT_PLAYER_PREFERENCES);
assert.deepEqual(normalizePlayerPreferences({
  musicVolume: 127.6,
  crosshairEnabled: 'off',
  adsMode: 'toggle',
  invertY: 'on'
}), {
  schema: 1,
  musicVolume: 100,
  crosshairEnabled: false,
  adsMode: 'toggle',
  invertY: true
});
assert.equal(normalizePlayerPreferences({ musicVolume: -8 }).musicVolume, 0);
assert.equal(normalizePlayerPreferences({ adsMode: 'invalid' }).adsMode, 'hold');
assert.deepEqual(mergePlayerPreferences({ musicVolume: 15, invertY: true }, { adsMode: 'toggle' }), {
  schema: 1,
  musicVolume: 15,
  crosshairEnabled: true,
  adsMode: 'toggle',
  invertY: true
});

const storage = memoryStorage();
const saved = savePlayerPreferences({ musicVolume: 42, crosshairEnabled: false }, storage);
assert.equal(saved.musicVolume, 42);
assert.deepEqual(loadPlayerPreferences(storage), {
  schema: 1,
  musicVolume: 42,
  crosshairEnabled: false,
  adsMode: 'hold',
  invertY: false
});
assert.equal(storage.read(PLAYER_PREFERENCES_STORAGE_KEY), serializePlayerPreferences(saved));
assert.deepEqual(resetPlayerPreferences(storage), DEFAULT_PLAYER_PREFERENCES);
assert.deepEqual(loadPlayerPreferences(memoryStorage({ [PLAYER_PREFERENCES_STORAGE_KEY]: '{bad json' })), DEFAULT_PLAYER_PREFERENCES);
assert.doesNotThrow(() => savePlayerPreferences({}, { setItem() { throw new Error('blocked'); } }));

console.log('Player preferences core tests passed');
