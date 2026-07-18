import assert from 'node:assert/strict';
import { CAREER_PRESENTATION_PATCH, buildCareerPresentation } from './career_achievements_core.js';

const value = buildCareerPresentation({
  progression: {
    maxLevel: 50,
    profile: {
      level: 3,
      xp: 1600,
      xpIntoLevel: 250,
      xpToNext: 925,
      totalRuns: 7,
      totalKills: 123,
      totalHeadshots: 31,
      totalWaves: 22,
      objectivesCompleted: 2,
      weaponUpgrades: 1,
      bestScore: 4500,
      bestWave: 8
    }
  },
  challenges: {
    achievements: [
      { id: 'WAVE_10', label: 'Holding the Line', description: 'Reach wave 10.', xp: 100, unlocked: false, unlockedAt: 0 },
      { id: 'FIRST_BLOOD', label: 'First Blood', description: 'First elimination.', xp: 25, unlocked: true, unlockedAt: 1000 }
    ]
  },
  highScore: 5000,
  highWave: 9
});

assert.equal(value.patch, CAREER_PRESENTATION_PATCH);
assert.equal(value.level.value, 3);
assert.equal(value.level.progressPercent, 27);
assert.equal(value.stats.bestScore, 5000);
assert.equal(value.stats.bestWave, 9);
assert.equal(value.unlockedCount, 1);
assert.equal(value.totalAchievements, 2);
assert.equal(value.achievements[0].id, 'FIRST_BLOOD');
assert.equal(value.achievements[0].category, 'COMBAT');
assert.equal(value.achievements[0].rarity, 'COMMON');
assert.equal(value.achievements[0].progressPercent, 100);
const wave = value.achievements.find((entry) => entry.id === 'WAVE_10');
assert.equal(wave.category, 'SURVIVAL');
assert.equal(wave.progressCurrent, 9);
assert.equal(wave.progressTarget, 10);
assert.equal(wave.progressPercent, 90);
assert.match(value.explanation.level, /does not increase weapon damage/i);

console.log('Career and achievements presentation tests: PASS');
