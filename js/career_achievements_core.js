// PROG.1 R1 — player-facing career, operations, unlock, and achievement presentation.

export const CAREER_PRESENTATION_PATCH = 'prog1-r1-unified-progression-retention';

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

function normalizeOperation(entry, scope) {
  return Object.freeze({
    id: cleanText(entry?.id, 'UNKNOWN', 80),
    scope,
    label: cleanText(entry?.label, 'Operation', 100),
    description: cleanText(entry?.description, 'Complete the listed objective.', 260),
    progress: integer(entry?.progress, 0),
    target: integer(entry?.target, 1, 1),
    xp: integer(entry?.xp, 0),
    completed: entry?.completed === true,
    completedAt: integer(entry?.completedAt, 0)
  });
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

  const unlocks = Array.isArray(progression?.unlocks)
    ? progression.unlocks.map((entry) => Object.freeze({
        id: cleanText(entry?.id, 'UNKNOWN', 80),
        kind: cleanText(entry?.kind, 'TITLE', 20),
        label: cleanText(entry?.label, 'Unlock', 100),
        description: cleanText(entry?.description, 'Career reward.', 220),
        tone: cleanText(entry?.tone, '#00d4ff', 24),
        unlocked: entry?.unlocked === true,
        unlockedAt: integer(entry?.unlockedAt, 0),
        equipped: entry?.equipped === true,
        requirement: entry?.requirement || null
      }))
    : [];

  unlocks.sort((left, right) => {
    if (left.unlocked !== right.unlocked) return left.unlocked ? -1 : 1;
    if (left.equipped !== right.equipped) return left.equipped ? -1 : 1;
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.label.localeCompare(right.label);
  });

  const operationGroups = [];
  for (const [scope, cycle] of [
    ['DAILY', progression?.operations?.daily],
    ['WEEKLY', progression?.operations?.weekly]
  ]) {
    operationGroups.push(Object.freeze({
      scope,
      key: cleanText(cycle?.key, 'unknown', 32),
      operations: Object.freeze(
        (Array.isArray(cycle?.operations) ? cycle.operations : [])
          .map((entry) => normalizeOperation(entry, scope))
      )
    }));
  }

  const equippedLookup = new Map(unlocks.map((entry) => [entry.id, entry]));
  const equipped = progression?.equipped || profile?.equipped || {};
  const title = equippedLookup.get(equipped.title);
  const badge = equippedLookup.get(equipped.badge);
  const banner = equippedLookup.get(equipped.banner);

  const recentRuns = Array.isArray(profile.recentRuns)
    ? profile.recentRuns.slice(0, 8).map((entry) => Object.freeze({
        runId: cleanText(entry?.runId, 'run', 100),
        endedAt: integer(entry?.endedAt, 0),
        mapId: cleanText(entry?.mapId, 'unknown', 80),
        mode: cleanText(entry?.mode, 'single', 24),
        score: integer(entry?.score, 0),
        wave: integer(entry?.wave, 1, 1),
        kills: integer(entry?.kills, 0),
        xpEarned: integer(entry?.xpEarned, 0),
        botAssisted: entry?.botAssisted === true
      }))
    : [];

  return Object.freeze({
    patch: CAREER_PRESENTATION_PATCH,
    explanation: Object.freeze({
      level: 'Profile Level is long-term career progress earned from play. It does not increase weapon damage, health, or enemy difficulty.',
      achievements: 'Achievements are permanent milestones. Unlocking one awards career XP and records when it was completed.',
      operations: 'Daily and weekly operations rotate on a UTC schedule. Rewards are granted automatically when an operation is completed.',
      unlocks: 'Career rewards are profile presentation only. Titles, badges, and banners never change combat power.'
    }),
    identity: Object.freeze({
      title: title?.label || 'Survivor',
      titleId: title?.id || 'TITLE_SURVIVOR',
      badge: badge?.label || 'Recruit Shield',
      badgeId: badge?.id || 'BADGE_RECRUIT',
      banner: banner?.label || 'Bunker Standard',
      bannerId: banner?.id || 'BANNER_STANDARD',
      bannerTone: banner?.tone || '#00d4ff'
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
      completedRuns: integer(profile.completedRuns, 0),
      abandonedRuns: integer(profile.abandonedRuns, 0),
      soloRuns: integer(profile.soloRuns, 0),
      multiplayerRuns: integer(profile.multiplayerRuns, 0),
      botAssistedRuns: integer(profile.botAssistedRuns, 0),
      totalKills: integer(profile.totalKills, 0),
      totalHeadshots: integer(profile.totalHeadshots, 0),
      totalAssists: integer(profile.totalAssists, 0),
      totalRevives: integer(profile.totalRevives, 0),
      timesRevived: integer(profile.timesRevived, 0),
      totalWaves: integer(profile.totalWaves, 0),
      totalDamageDealt: integer(profile.totalDamageDealt, 0),
      totalDamageTaken: integer(profile.totalDamageTaken, 0),
      totalPlaySeconds: integer(profile.totalPlaySeconds, 0),
      objectivesCompleted: integer(profile.objectivesCompleted, 0),
      challengesCompleted: integer(profile.challengesCompleted, 0),
      operationsCompleted: integer(profile.operationsCompleted, 0),
      weaponUpgrades: integer(profile.weaponUpgrades, 0),
      perksPurchased: integer(profile.perksPurchased, 0),
      pointsEarned: integer(profile.pointsEarned, 0),
      pointsSpent: integer(profile.pointsSpent, 0),
      bestAccuracy: Math.max(0, Math.min(100, finite(profile.bestAccuracy, 0))),
      longestRunSeconds: integer(profile.longestRunSeconds, 0),
      bestScore: Math.max(integer(profile.bestScore, 0), integer(highScore, 0)),
      bestWave: Math.max(integer(profile.bestWave, 1, 1), integer(highWave, 1, 1)),
      lastRunAt: integer(profile.lastRunAt, 0)
    }),
    operations: Object.freeze(operationGroups),
    operationExpiry: progression?.operationExpiry || null,
    unlocks: Object.freeze(unlocks),
    unlockedRewards: unlocks.filter((entry) => entry.unlocked).length,
    totalRewards: unlocks.length,
    achievements: Object.freeze(achievements.map((entry) => Object.freeze(entry))),
    unlockedCount: achievements.filter((entry) => entry.unlocked).length,
    totalAchievements: achievements.length,
    recentRuns: Object.freeze(recentRuns)
  });
}
