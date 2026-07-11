import assert from 'node:assert/strict';
import {
  CLOUD_PROFILE_PATCH,
  createGuestCloudProfile,
  isGameOwnedStorageKey,
  mergeCloudProfiles,
  profileChecksum,
  validateCloudProfile
} from './cloud_profile_core.js';

const base = createGuestCloudProfile({
  profileId: 'guest-cloud-test-a',
  createdAt: 1000,
  now: 2000,
  revision: 2,
  legacyStorage: {
    ka_progression_v1: JSON.stringify({ version: 1, xp: 100, bestScore: 400 }),
    ka_challenges_v1: JSON.stringify({ version: 1, unlocked: { FIRST_BLOOD: 1000 } }),
    fps_hi_score: '400',
    fps_hi_wave: '4'
  }
});
const incoming = createGuestCloudProfile({
  profileId: 'guest-cloud-test-b',
  createdAt: 1500,
  now: 3000,
  revision: 5,
  legacyStorage: {
    ka_progression_v1: JSON.stringify({ version: 1, xp: 250, bestScore: 300 }),
    ka_challenges_v1: JSON.stringify({ version: 1, unlocked: { WAVE_10: 2000 } }),
    fps_hi_score: '700',
    fps_hi_wave: '10'
  }
});
const merged = mergeCloudProfiles(base, incoming, { now: 4000 });
assert.equal(CLOUD_PROFILE_PATCH, 'm4-cloud-guest-sync-r1');
assert.equal(validateCloudProfile(merged).valid, true);
assert.equal(merged.profileId, base.profileId);
assert.equal(merged.progression.xp, 250);
assert.equal(merged.records.highScore, 700);
assert.equal(merged.records.highWave, 10);
assert.equal(merged.achievements.totalUnlocked, 2);
const reverse = mergeCloudProfiles(incoming, base, { now: 4000 });
assert.equal(reverse.records.highScore, merged.records.highScore);
assert.equal(reverse.records.highWave, merged.records.highWave);
assert.equal(reverse.progression.xp, merged.progression.xp);
assert.equal(isGameOwnedStorageKey('ka_cloud_profile_token_v1'), false);
assert.equal(isGameOwnedStorageKey('ka_cloud_profile_account_v1'), false);
assert.equal(isGameOwnedStorageKey('ka_accessibility_v1'), true);
console.log('Cloud profile Worker core tests: PASS');
