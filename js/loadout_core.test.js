import assert from 'node:assert/strict';
import {
  LOADOUT_PATCH,
  LOADOUT_PROFILE_KEY,
  LOADOUT_PROFILE_VERSION,
  MAX_LOADOUT_PRESETS,
  MAX_AVATAR_PRESETS,
  createDefaultLoadoutProfile,
  normalizeLoadoutProfile,
  parseLoadoutProfile,
  serializeLoadoutProfile,
  getActiveLoadoutPreset,
  getProgressionCosmeticCollection,
  sanitizePresetCosmetics,
  createFrozenLoadoutSnapshot,
  mergeLoadoutProfiles,
  getLoadoutMergePolicy,
} from './loadout_core.js';

const NOW = 1760000000000;
const avatar = {
  skin: 'deep',
  suit: 'violet',
  armor: 'ivory',
  accent: 'neon-pink',
  hairStyle: 'cap',
  hairColor: 'silver',
};

assert.equal(LOADOUT_PROFILE_KEY, 'ka_loadout_profile_v1');
assert.equal(LOADOUT_PROFILE_VERSION, 1);
assert.equal(LOADOUT_PATCH, 'loadout1-r1-saved-presets-avatar-cosmetic-collections');

const defaults = createDefaultLoadoutProfile({ now: NOW, avatarProfile: avatar });
assert.equal(defaults.presets.length, 2);
assert.equal(defaults.avatarPresets.length, 1);
assert.equal(defaults.avatarPresets[0].avatar.skin, 'deep');
assert.equal(getActiveLoadoutPreset(defaults).name, 'Field Standard');

const roundTrip = parseLoadoutProfile(serializeLoadoutProfile(defaults), { now: NOW });
assert.equal(roundTrip.recovered, false);
assert.deepEqual(roundTrip.profile, defaults);

const corrupt = parseLoadoutProfile('{bad-json', { now: NOW, avatarProfile: avatar });
assert.equal(corrupt.recovered, true);
assert.equal(corrupt.reason, 'CORRUPT_JSON');
assert.equal(corrupt.profile.presets.length >= 1, true);

const oversized = normalizeLoadoutProfile({
  version: 1,
  activeLoadoutId: 'missing',
  activeAvatarPresetId: 'missing',
  avatarPresets: Array.from({ length: 12 }, (_, index) => ({
    id: index < 2 ? 'duplicate' : `avatar-${index}`,
    name: `Avatar ${index}`,
    avatar,
    updatedAt: NOW + index,
  })),
  presets: Array.from({ length: 12 }, (_, index) => ({
    id: index < 2 ? 'duplicate' : `loadout-${index}`,
    name: `Loadout ${index}`,
    primary: index % 2 ? 'RIFLE' : 'INVALID',
    secondary: index % 2 ? 'RIFLE' : 'SHOTGUN',
    doctrine: 'INVALID',
    avatarPresetId: 'missing',
    updatedAt: NOW + index,
  })),
}, { now: NOW, avatarProfile: avatar });

assert.equal(oversized.presets.length, MAX_LOADOUT_PRESETS);
assert.equal(oversized.avatarPresets.length, MAX_AVATAR_PRESETS);
assert.equal(new Set(oversized.presets.map((entry) => entry.id)).size, oversized.presets.length);
assert.equal(new Set(oversized.avatarPresets.map((entry) => entry.id)).size, oversized.avatarPresets.length);
assert.equal(oversized.presets.every((entry) => entry.primary !== entry.secondary), true);
assert.equal(oversized.presets.every((entry) => entry.doctrine === 'BALANCED'), true);
assert.equal(oversized.presets.some((entry) => entry.id === oversized.activeLoadoutId), true);
assert.equal(oversized.avatarPresets.some((entry) => entry.id === oversized.activeAvatarPresetId), true);

const progression = {
  unlocks: {
    TITLE_SURVIVOR: NOW,
    BADGE_RECRUIT: NOW,
    BANNER_STANDARD: NOW,
    TITLE_BUNKER_BREAKER: NOW,
  },
  equipped: {
    title: 'TITLE_SURVIVOR',
    badge: 'BADGE_RECRUIT',
    banner: 'BANNER_STANDARD',
  },
};
const collection = getProgressionCosmeticCollection(progression);
assert.equal(collection.find((entry) => entry.id === 'TITLE_BUNKER_BREAKER').unlocked, true);
assert.equal(collection.find((entry) => entry.id === 'BADGE_LEGEND').unlocked, false);

const requestedPreset = {
  cosmetics: {
    title: 'TITLE_BUNKER_BREAKER',
    badge: 'BADGE_LEGEND',
    banner: '<script>',
  },
};
assert.deepEqual(sanitizePresetCosmetics(requestedPreset, progression), {
  title: 'TITLE_BUNKER_BREAKER',
  badge: 'BADGE_RECRUIT',
  banner: 'BANNER_STANDARD',
});

const frozen = createFrozenLoadoutSnapshot({
  ...defaults,
  presets: defaults.presets.map((entry, index) => index === 0 ? {
    ...entry,
    cosmetics: requestedPreset.cosmetics,
  } : entry),
}, progression, {
  now: NOW,
  runId: 'run-one',
  mapId: 'neon_depot',
  difficulty: 1.5,
  mode: 'multiplayer',
});

assert.equal(frozen.runId, 'run-one');
assert.equal(frozen.mapId, 'neon_depot');
assert.equal(frozen.balancePolicy.startingWeapon, 'PISTOL');
assert.equal(frozen.balancePolicy.grantsCombatPower, false);
assert.equal(frozen.balancePolicy.preferencesOnly, true);
assert.equal(frozen.cosmetics.title, 'TITLE_BUNKER_BREAKER');
assert.equal(frozen.cosmetics.badge, 'BADGE_RECRUIT');

const left = normalizeLoadoutProfile({
  ...defaults,
  updatedAt: NOW,
  presets: defaults.presets.map((entry, index) => index === 0 ? {
    ...entry,
    name: 'Left Version',
    updatedAt: NOW,
  } : entry),
}, { now: NOW });
const right = normalizeLoadoutProfile({
  ...defaults,
  updatedAt: NOW + 50,
  activeLoadoutId: defaults.presets[1].id,
  presets: defaults.presets.map((entry, index) => index === 0 ? {
    ...entry,
    name: 'Right Version',
    updatedAt: NOW + 100,
  } : entry),
}, { now: NOW + 50 });
const merged = mergeLoadoutProfiles(left, right, { now: NOW + 100 });
assert.equal(merged.activeLoadoutId, defaults.presets[1].id);
assert.equal(merged.presets.find((entry) => entry.id === defaults.presets[0].id).name, 'Right Version');
assert.equal(getLoadoutMergePolicy().combatPower, 'never granted by saved presets');

console.log('LOADOUT.1 core tests: PASS');
