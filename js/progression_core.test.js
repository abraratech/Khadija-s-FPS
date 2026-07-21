import assert from 'node:assert/strict';
import {
  PROGRESSION_PATCH,
  PROGRESSION_VERSION,
  PROGRESSION_MAX_LEVEL,
  defaultProgressionProfile,
  normalizeProgressionProfile,
  deriveProgressionLevel,
  normalizeProgressionOperations,
  applyProgressionOperationEvent,
  evaluateProgressionUnlocks,
  calculateProgressionRunReward,
  getProgressionUnlockPresentation
} from './progression_core.js';

assert.equal(PROGRESSION_PATCH, 'prog1-r1-unified-progression-retention');
assert.equal(PROGRESSION_VERSION, 4);
assert.equal(PROGRESSION_MAX_LEVEL, 50);

const migrated = normalizeProgressionProfile({
  version: 1,
  xp: 1600,
  totalRuns: 7,
  totalKills: 123,
  totalHeadshots: 31,
  bestScore: 4500,
  bestWave: 8
}, Date.UTC(2026, 6, 15));
assert.equal(migrated.version, 4);
assert.equal(migrated.totalRuns, 7);
assert.equal(migrated.totalKills, 123);
assert.ok(migrated.level >= 2);
assert.ok(migrated.unlocks.TITLE_SURVIVOR);
assert.equal(migrated.economy.patch, 'post-final9-r1-economy-rewards-long-term-progression');
assert.equal(migrated.world6.patch, 'gameplay6-r1-world-progression');
assert.equal(migrated.world6.points, 0);

const level = deriveProgressionLevel(0);
assert.deepEqual(level, {
  level: 1,
  xpIntoLevel: 0,
  xpToNext: level.xpToNext,
  capped: false
});
assert.ok(level.xpToNext > 0);

const dayOne = Date.UTC(2026, 6, 15, 12);
const operationsA = normalizeProgressionOperations({}, dayOne);
const operationsB = normalizeProgressionOperations(operationsA, dayOne + 60_000);
assert.deepEqual(
  operationsA.daily.operations.map((entry) => entry.id),
  operationsB.daily.operations.map((entry) => entry.id)
);
const operationsNextDay = normalizeProgressionOperations(operationsA, dayOne + 24 * 60 * 60 * 1000);
assert.notEqual(operationsNextDay.daily.key, operationsA.daily.key);

const firstOperation = operationsA.daily.operations[0];
const eventKindByOperation = {
  KILLS: 'KILL',
  HEADSHOTS: 'HEADSHOT',
  WAVES: 'WAVE',
  HARD_WAVES: 'WAVE',
  DAMAGE: 'DAMAGE',
  REVIVES: 'REVIVE',
  OBJECTIVES: 'OBJECTIVE',
  CHALLENGES: 'CHALLENGE',
  RUNS: 'RUN_COMPLETE',
  COOP_RUNS: 'RUN_COMPLETE'
};
const operationResult = applyProgressionOperationEvent(operationsA, {
  kind: eventKindByOperation[firstOperation.kind],
  amount: firstOperation.target,
  mode: 'multiplayer',
  difficulty: 1.5
}, dayOne);
assert.equal(operationResult.completed.length >= 1, true);
assert.equal(operationResult.completed.some((entry) => entry.id === firstOperation.id), true);

const unlockProfile = defaultProgressionProfile(dayOne);
unlockProfile.xp = 999999;
unlockProfile.totalKills = 1000;
unlockProfile.totalHeadshots = 200;
unlockProfile.totalRevives = 20;
unlockProfile.bestWave = 25;
unlockProfile.multiplayerRuns = 30;
unlockProfile.objectivesCompleted = 30;
unlockProfile.totalWaves = 150;
unlockProfile.operationsCompleted = 60;
const unlockResult = evaluateProgressionUnlocks(unlockProfile, dayOne);
assert.ok(unlockResult.newlyUnlocked.length >= 10);
const unlockPresentation = getProgressionUnlockPresentation({
  ...unlockProfile,
  unlocks: unlockResult.unlocks
});
assert.ok(unlockPresentation.some((entry) => entry.id === 'TITLE_ARENA_LEGEND' && entry.unlocked));

const completedReward = calculateProgressionRunReward({
  score: 5500,
  wave: 10,
  difficulty: 1.5,
  mode: 'multiplayer',
  reason: 'DEATH'
});
assert.equal(completedReward.abandoned, false);
assert.ok(completedReward.total > 0);
assert.ok(completedReward.breakdown.multiplayer > 0);

const abandonedReward = calculateProgressionRunReward({
  score: 5500,
  wave: 10,
  difficulty: 1.5,
  mode: 'multiplayer',
  reason: 'QUIT TO MENU'
});
assert.equal(abandonedReward.abandoned, true);
assert.equal(abandonedReward.breakdown.completion, 0);

console.log('PROG.1 progression core tests: PASS');
