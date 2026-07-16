import assert from 'node:assert/strict';
import {
  createGuestCloudProfile,
  mergeCloudProfiles
} from './cloud_profile_core.js';

function makeProfile(profileId, progression, revision, createdAt) {
  return createGuestCloudProfile({
    profileId,
    legacyStorage: {
      ka_progression_v1: JSON.stringify(progression),
      ka_challenges_v1: JSON.stringify({ version: 1, unlocked: {}, totalUnlocked: 0 }),
      fps_hi_score: '0',
      fps_hi_wave: '1'
    },
    now: createdAt + 100,
    createdAt,
    revision
  });
}

const left = makeProfile('profile-a', {
  version: 2,
  xp: 1000,
  totalKills: 100,
  unlocks: { TITLE_SURVIVOR: 100, BADGE_MARKSMAN: 200 },
  equipped: { title: 'TITLE_SURVIVOR', badge: 'BADGE_MARKSMAN', banner: 'BANNER_STANDARD', updatedAt: 500 },
  operations: {
    daily: {
      key: '2026-07-15',
      operations: [{ id: 'DAILY_KILLS', progress: 20, target: 40, completed: false }]
    }
  },
  recentRuns: [{ runId: 'run-a', endedAt: 1000, score: 500 }]
}, 2, 100);

const right = makeProfile('profile-b', {
  version: 2,
  xp: 1500,
  totalKills: 80,
  unlocks: { TITLE_SURVIVOR: 120, BANNER_NEON_VETERAN: 300 },
  equipped: { title: 'TITLE_OUTBREAK_ROOKIE', badge: 'BADGE_RECRUIT', banner: 'BANNER_NEON_VETERAN', updatedAt: 900 },
  operations: {
    daily: {
      key: '2026-07-15',
      operations: [{ id: 'DAILY_KILLS', progress: 35, target: 40, completed: false }]
    }
  },
  recentRuns: [{ runId: 'run-b', endedAt: 1200, score: 700 }]
}, 3, 200);

const merged = mergeCloudProfiles(left, right, { now: 2000 });
assert.equal(merged.progression.xp, 1500);
assert.equal(merged.progression.totalKills, 100);
assert.equal(merged.progression.unlocks.BADGE_MARKSMAN, 200);
assert.equal(merged.progression.unlocks.BANNER_NEON_VETERAN, 300);
assert.equal(merged.progression.equipped.title, 'TITLE_OUTBREAK_ROOKIE');
assert.ok(Array.isArray(merged.progression.recentRuns));
assert.equal(merged.progression.recentRuns.length, 2);

const stored = JSON.parse(merged.legacyStorage.ka_progression_v1);
assert.equal(stored.equipped.title, 'TITLE_OUTBREAK_ROOKIE');
assert.equal(stored.unlocks.BADGE_MARKSMAN, 200);
assert.equal(stored.recentRuns.length, 2);

console.log('PROG.1 nested cloud progression merge tests: PASS');
