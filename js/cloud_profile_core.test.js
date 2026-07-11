import assert from 'node:assert/strict';
import {
  CLOUD_PROFILE_PATCH,
  createCloudProfileExport,
  createGuestCloudProfile,
  deriveCloudProfileSections,
  getCloudProfileMergePolicy,
  isGameOwnedStorageKey,
  mergeCloudProfiles,
  parseCloudProfileImport,
  profileChecksum,
  sanitizeLegacyStorage,
  validateCloudProfile
} from './cloud_profile_core.js';

function storage(overrides = {}) {
  return {
    ka_progression_v1: JSON.stringify({ version: 1, xp: 100, totalRuns: 2, bestScore: 900, bestWave: 4 }),
    ka_challenges_v1: JSON.stringify({ version: 1, unlocked: { FIRST_BLOOD: 1000 }, totalUnlocked: 1 }),
    ka_accessibility_v1: JSON.stringify({ hudScale: 100 }),
    ka_online_leaderboard_player_v1: 'player-guest-0001',
    ka_online_leaderboard_name_v1: 'Survivor-A001',
    ka_online_leaderboard_pending_v1: JSON.stringify([{ runId: 'run-a', score: 200 }]),
    fps_hi_score: '900',
    fps_hi_wave: '4',
    mobile_btn_size: '52',
    ...overrides
  };
}

const first = createGuestCloudProfile({
  profileId: 'guest-profile-a',
  legacyStorage: storage(),
  now: 2000,
  createdAt: 1000,
  revision: 2,
  metadata: { migrationSources: ['legacy-local-storage'] }
});
assert.equal(first.patch, CLOUD_PROFILE_PATCH);
assert.equal(CLOUD_PROFILE_PATCH, 'm4-final-player-polish-r1');
assert.equal(first.progression.bestScore, 900);
assert.equal(first.achievements.totalUnlocked, 1);
assert.equal(first.records.highWave, 4);
assert.equal(validateCloudProfile(first).valid, true);
assert.equal(sanitizeLegacyStorage({ evil: 'x', ka_ok: 'yes' }).evil, undefined);
assert.equal(isGameOwnedStorageKey('ka_cloud_profile_token_v1'), false);
assert.equal(isGameOwnedStorageKey('ka_cloud_profile_account_v1'), false);
assert.equal(isGameOwnedStorageKey('ka_cloud_profile_device_name_v1'), false);
assert.equal(deriveCloudProfileSections(storage()).identity.displayName, 'Survivor-A001');

const second = createGuestCloudProfile({
  profileId: 'guest-profile-b',
  legacyStorage: storage({
    ka_progression_v1: JSON.stringify({ version: 1, xp: 250, totalRuns: 1, bestScore: 700, bestWave: 8 }),
    ka_challenges_v1: JSON.stringify({ version: 1, unlocked: { FIRST_BLOOD: 1200, WAVE_10: 3000 }, totalUnlocked: 2 }),
    ka_accessibility_v1: JSON.stringify({ hudScale: 120 }),
    ka_online_leaderboard_player_v1: 'player-guest-0002',
    ka_online_leaderboard_name_v1: 'Cloud Survivor',
    ka_online_leaderboard_pending_v1: JSON.stringify([{ runId: 'run-b', score: 400 }]),
    fps_hi_score: '1200',
    fps_hi_wave: '8'
  }),
  now: 4000,
  createdAt: 1500,
  revision: 5
});

const merged = mergeCloudProfiles(first, second, { now: 5000 });
assert.equal(merged.profileId, 'guest-profile-a');
assert.equal(merged.revision, 6);
assert.equal(merged.progression.xp, 250);
assert.equal(merged.progression.totalRuns, 2);
assert.equal(merged.progression.bestScore, 900);
assert.equal(merged.records.highScore, 1200);
assert.equal(merged.records.highWave, 8);
assert.equal(merged.achievements.totalUnlocked, 2);
assert.equal(merged.achievements.unlocked.FIRST_BLOOD, 1000);
assert.equal(merged.identity.leaderboardPlayerId, 'player-guest-0001');
assert.equal(merged.identity.displayName, 'Cloud Survivor');
assert.equal(merged.pendingSubmissions.length, 2);
assert.equal(JSON.parse(merged.settings.ka_accessibility_v1).hudScale, 120);

const reverse = mergeCloudProfiles(second, first, { now: 5000 });
assert.equal(profileChecksum(reverse), profileChecksum(merged));

const envelope = createCloudProfileExport(merged, { exportedAt: 6000 });
assert.equal(parseCloudProfileImport(JSON.stringify(envelope)).valid, true);
const corrupted = { ...envelope, checksum: '00000000' };
assert.equal(parseCloudProfileImport(corrupted).valid, false);
assert.equal(getCloudProfileMergePolicy().revision, 'max revision plus one');

console.log('Cloud profile core tests: PASS');
