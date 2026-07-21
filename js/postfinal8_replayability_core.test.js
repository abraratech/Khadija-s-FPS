import assert from 'node:assert/strict';
import {
  POST_FINAL8_BOSS_STATUS,
  POST_FINAL8_PATCH,
  POST_FINAL8_SCHEMA,
  PostFinal8ReplayDirector,
  computePostFinal8Reward,
  createPostFinal8State,
  normalizePostFinal8State
} from './postfinal8_replayability_core.js';

const stateA = createPostFinal8State({
  runId: 'run-alpha',
  mapId: 'grid_bunker',
  missionId: 'BLACK-VAULT',
  difficulty: 1.6,
  playerCount: 2,
  now: 1000
});
const stateB = createPostFinal8State({
  runId: 'run-alpha',
  mapId: 'grid_bunker',
  missionId: 'BLACK-VAULT',
  difficulty: 1.6,
  playerCount: 2,
  now: 1000
});

assert.equal(stateA.patch, POST_FINAL8_PATCH);
assert.equal(stateA.schema, POST_FINAL8_SCHEMA);
assert.deepEqual(stateA.faction, stateB.faction);
assert.deepEqual(stateA.modifiers, stateB.modifiers);
assert.deepEqual(stateA.eliteAffixes, stateB.eliteAffixes);
assert.equal(stateA.modifiers.length, 3);
assert.equal(new Set(stateA.modifiers.map((entry) => entry.id)).size, stateA.modifiers.length);
assert.equal(new Set(stateA.eliteAffixes.map((entry) => entry.id)).size, stateA.eliteAffixes.length);

const director = new PostFinal8ReplayDirector();
director.reset({
  runId: 'run-alpha',
  mapId: 'grid_bunker',
  missionId: 'BLACK-VAULT',
  difficulty: 1.6,
  playerCount: 2,
  now: 1000
});

const weights = director.getEncounterMultipliers();
assert.ok(Object.keys(weights).length >= 6);
assert.ok(Object.values(weights).every((value) => Number(value) > 0));

const normalTuning = director.nextSpawnTuning({
  enemyType: 'RUNNER',
  bossStage: false,
  elite: false
});
assert.equal(normalTuning.patch, POST_FINAL8_PATCH);
assert.ok(normalTuning.healthScale > 0);
assert.equal(normalTuning.bossProfile, null);

const requiredBossType = director.state.boss.enemyType;
const bossTuning = director.nextSpawnTuning({
  enemyType: requiredBossType,
  bossStage: true,
  elite: true
});
assert.ok(bossTuning.bossProfile);
assert.ok(bossTuning.affixes.length === 2);
assert.ok(bossTuning.healthScale > normalTuning.healthScale);

assert.equal(director.bindBoss({
  enemyId: 'boss-1',
  enemyType: requiredBossType,
  maxHealth: 3000,
  health: 3000
}, 1100), true);
assert.equal(director.state.boss.status, POST_FINAL8_BOSS_STATUS.ACTIVE);

let damage = director.recordBossDamage({
  enemyId: 'boss-1',
  damage: 1200,
  health: 1800,
  maxHealth: 3000,
  headshot: true,
  actorId: 'p1'
}, 1200);
assert.equal(damage.accepted, true);
assert.equal(director.state.boss.phase, 1);
assert.ok(damage.events.some((event) => event.type === 'BOSS_PHASE_CHANGED'));

damage = director.recordBossDamage({
  enemyId: 'boss-1',
  damage: 1000,
  health: 800,
  maxHealth: 3000,
  headshot: true,
  actorId: 'p2'
}, 1300);
assert.equal(director.state.boss.phase, 2);
assert.ok(director.state.boss.weakPointHits >= 2);
assert.ok(director.state.boss.staggerCount >= 1);

assert.equal(director.recordBossKilled({
  enemyId: 'boss-1',
  actorId: 'p2'
}, 1400), true);
assert.equal(director.state.boss.status, POST_FINAL8_BOSS_STATUS.DEFEATED);

assert.equal(director.recordPlayerDowned('p1', 1500), true);
assert.equal(director.recordPlayerDowned('p2', 1600), false);
assert.equal(director.state.noDownedEligible, false);
assert.equal(director.state.playerDownedCount, 1);

assert.equal(director.observeMission({
  status: 'COMPLETE',
  completionId: 'mission-complete',
  riskChoice: 'OVERDRIVE',
  optionalStagesCompleted: 1
}, 1700), true);
assert.equal(director.state.missionComplete, true);
assert.match(director.state.masteryGrade, /^[SABCD]$/);
assert.ok(director.state.medals.length >= 2);
assert.ok(computePostFinal8Reward(director.getSnapshot()) > 0);

const snapshot = director.getSnapshot(1800);
const replacement = new PostFinal8ReplayDirector(snapshot);
assert.equal(replacement.replaceSnapshot(snapshot, 1800), true);
assert.deepEqual(replacement.getSnapshot(1800), snapshot);

const normalized = normalizePostFinal8State({
  ...snapshot,
  modifiers: snapshot.modifiers.slice(0, 1),
  eliteAffixes: snapshot.eliteAffixes.slice(0, 1)
}, 1800);
assert.equal(normalized.modifiers.length, 1);
assert.equal(normalized.eliteAffixes.length, 1);

console.log('POST-FINAL.8 replayability core tests passed');
