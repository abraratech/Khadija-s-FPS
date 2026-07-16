import assert from 'node:assert/strict';
import {
  createGuestCloudProfile,
  isGameOwnedStorageKey,
  mergeCloudProfiles,
  getCloudProfileMergePolicy,
} from './cloud_profile_core.js';

const key = 'ka_loadout_profile_v1';
assert.equal(isGameOwnedStorageKey(key), true);
assert.equal(isGameOwnedStorageKey('ka_loadout_backup_v1'), false);
assert.equal(isGameOwnedStorageKey('ka_loadout_corrupt_v1'), false);

function loadout(updatedAt, activeLoadoutId, presets) {
  return JSON.stringify({
    version: 1,
    patch: 'loadout1-r1-saved-presets-avatar-cosmetic-collections',
    activeLoadoutId,
    activeAvatarPresetId: 'avatar-one',
    presets,
    avatarPresets: [{
      id: 'avatar-one',
      name: 'Operator One',
      avatar: {
        version: 1,
        skin: 'warm',
        suit: 'arena-cyan',
        armor: 'midnight',
        accent: 'protocol-cyan',
        hairStyle: 'crop',
        hairColor: 'black',
      },
      createdAt: 10,
      updatedAt,
    }],
    createdAt: 10,
    updatedAt,
  });
}

const left = createGuestCloudProfile({
  profileId: 'profile:left-001',
  now: 100,
  legacyStorage: {
    [key]: loadout(100, 'loadout-a', [{
      id: 'loadout-a',
      name: 'Left A',
      primary: 'SMG',
      secondary: 'SHOTGUN',
      avatarPresetId: 'avatar-one',
      createdAt: 10,
      updatedAt: 100,
    }]),
  },
});

const right = createGuestCloudProfile({
  profileId: 'profile:right-002',
  now: 200,
  legacyStorage: {
    [key]: loadout(200, 'loadout-b', [{
      id: 'loadout-a',
      name: 'Right A',
      primary: 'RIFLE',
      secondary: 'SNIPER',
      avatarPresetId: 'avatar-one',
      createdAt: 10,
      updatedAt: 250,
    }, {
      id: 'loadout-b',
      name: 'Right B',
      primary: 'SHOTGUN',
      secondary: 'PISTOL',
      avatarPresetId: 'avatar-one',
      createdAt: 20,
      updatedAt: 200,
    }]),
  },
});

const merged = mergeCloudProfiles(left, right, { now: 300 });
const mergedLoadout = JSON.parse(merged.legacyStorage[key]);
assert.equal(mergedLoadout.activeLoadoutId, 'loadout-b');
assert.equal(mergedLoadout.presets.length, 2);
assert.equal(mergedLoadout.presets.find((entry) => entry.id === 'loadout-a').name, 'Right A');
assert.equal(mergedLoadout.presets.find((entry) => entry.id === 'loadout-a').primary, 'RIFLE');
assert.match(getCloudProfileMergePolicy().loadouts, /union by preset id/i);

console.log('LOADOUT.1 Worker cloud merge tests: PASS');
