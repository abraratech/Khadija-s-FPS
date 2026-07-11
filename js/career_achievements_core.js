// M4.59-M4.62 — player-facing career and achievement presentation helpers.

export const CAREER_PRESENTATION_PATCH = 'm4-final-player-polish-r1';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0) {
  return Math.max(minimum, Math.round(finite(value, fallback)));
}

function cleanText(value, fallback = '', maximum = 240) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, maximum);
}

export function buildCareerPresentation({
  progression = {},
  challenges = {},
  highScore = 0,
  highWave = 1
} = {}) {
  const profile = progression?.profile && typeof progression.profile === 'object'
    ? progression.profile
    : {};
  const level = integer(profile.level, 1, 1);
  const xpIntoLevel = integer(profile.xpIntoLevel, 0);
  const xpToNext = integer(profile.xpToNext, 0);
  const maxLevel = integer(progression?.maxLevel, 50, 1);
  const progressPercent = xpToNext > 0
    ? Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpToNext) * 100)))
    : 100;

  const achievements = Array.isArray(challenges?.achievements)
    ? challenges.achievements.map((entry) => ({
        id: cleanText(entry?.id, 'UNKNOWN', 80),
        label: cleanText(entry?.label, 'Achievement', 100),
        description: cleanText(entry?.description, 'Complete the listed milestone.', 260),
        xp: integer(entry?.xp, 0),
        unlocked: entry?.unlocked === true,
        unlockedAt: integer(entry?.unlockedAt, 0)
      }))
    : [];

  achievements.sort((left, right) => {
    if (left.unlocked !== right.unlocked) return left.unlocked ? -1 : 1;
    if (left.unlocked && right.unlocked && left.unlockedAt !== right.unlockedAt) {
      return right.unlockedAt - left.unlockedAt;
    }
    return left.label.localeCompare(right.label);
  });

  return Object.freeze({
    patch: CAREER_PRESENTATION_PATCH,
    explanation: Object.freeze({
      level: 'Profile Level is long-term career progress earned from play. It currently records experience and milestones; it does not increase weapon damage, health, or enemy difficulty.',
      achievements: 'Achievements are permanent milestones. Unlocking one awards career XP and records when it was completed.'
    }),
    level: Object.freeze({
      value: level,
      max: maxLevel,
      totalXp: integer(profile.xp, 0),
      xpIntoLevel,
      xpToNext,
      progressPercent,
      capped: level >= maxLevel || xpToNext === 0
    }),
    stats: Object.freeze({
      totalRuns: integer(profile.totalRuns, 0),
      totalKills: integer(profile.totalKills, 0),
      totalHeadshots: integer(profile.totalHeadshots, 0),
      totalWaves: integer(profile.totalWaves, 0),
      objectivesCompleted: integer(profile.objectivesCompleted, 0),
      challengesCompleted: integer(profile.challengesCompleted, 0),
      weaponUpgrades: integer(profile.weaponUpgrades, 0),
      pointsSpent: integer(profile.pointsSpent, 0),
      bestScore: Math.max(integer(profile.bestScore, 0), integer(highScore, 0)),
      bestWave: Math.max(integer(profile.bestWave, 1, 1), integer(highWave, 1, 1)),
      lastRunAt: integer(profile.lastRunAt, 0)
    }),
    achievements: Object.freeze(achievements.map((entry) => Object.freeze(entry))),
    unlockedCount: achievements.filter((entry) => entry.unlocked).length,
    totalAchievements: achievements.length
  });
}
