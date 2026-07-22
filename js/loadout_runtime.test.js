import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
  clear() { this.values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const {
  initializeLoadoutSystems,
  getLoadoutProfileSnapshot,
  saveLoadoutPreset,
  activateLoadoutPreset,
  saveAvatarPreset,
  freezeActiveLoadoutForRun,
  getFrozenLoadoutForRun,
  clearFrozenLoadoutForRun,
} = await import('./loadout.js');

const unlocked = {
  TITLE_SURVIVOR: 1,
  BADGE_RECRUIT: 1,
  BANNER_STANDARD: 1,
  TITLE_BUNKER_BREAKER: 2,
};
const equipped = [];

initializeLoadoutSystems({
  getProgressionSnapshot: () => ({ profile: { unlocks: unlocked, equipped: {} } }),
  equipProgressionCosmetic: (id) => {
    equipped.push(id);
    return { ok: true };
  },
});

const initial = getLoadoutProfileSnapshot();
assert.equal(initial.presets.length, 2);
assert.equal(initial.avatarPresets.length, 1);

const avatarResult = saveAvatarPreset({
  name: 'Night Operator',
  avatar: {
    skin: 'deep',
    suit: 'slate',
    armor: 'graphite',
    accent: 'white',
    hairStyle: 'cap',
    hairColor: 'silver',
  },
});
assert.equal(avatarResult.ok, true);

const loadoutResult = saveLoadoutPreset({
  name: 'Night Watch',
  primary: 'SNIPER',
  secondary: 'RIFLE',
  doctrine: 'PRECISION',
  specializationId: 'MARKSMAN',
  avatarPresetId: avatarResult.preset.id,
  cosmetics: {
    title: 'TITLE_BUNKER_BREAKER',
    badge: 'BADGE_LEGEND',
    banner: 'BANNER_STANDARD',
  },
});
assert.equal(loadoutResult.ok, true);
assert.equal(activateLoadoutPreset(loadoutResult.preset.id, { applyPresentation: false }).ok, true);

const frozen = freezeActiveLoadoutForRun({
  runId: 'runtime-test-run',
  mapId: 'reactor_courtyard',
  difficulty: 1.5,
  mode: 'multiplayer',
});
assert.equal(frozen.loadoutName, 'Night Watch');
assert.equal(frozen.primary, 'SNIPER');
assert.equal(frozen.balancePolicy.startingWeapon, 'PISTOL');
assert.equal(frozen.balancePolicy.grantsCombatPower, true);
assert.equal(frozen.balancePolicy.pvpIsolated, true);
assert.equal(frozen.specializationId, 'MARKSMAN');
assert.equal(frozen.cosmetics.title, 'TITLE_BUNKER_BREAKER');
assert.equal(frozen.cosmetics.badge, 'BADGE_RECRUIT');
assert.deepEqual(equipped.slice(-3), [
  'TITLE_BUNKER_BREAKER',
  'BADGE_RECRUIT',
  'BANNER_STANDARD',
]);

assert.equal(getFrozenLoadoutForRun().runId, 'runtime-test-run');
clearFrozenLoadoutForRun();
assert.equal(getFrozenLoadoutForRun(), null);

console.log('LOADOUT.2 runtime persistence tests: PASS');
