import assert from 'node:assert/strict';
import {
  GAMEPLAY4_ABILITY_STATE,
  GAMEPLAY4_BOSS_STATUS,
  GAMEPLAY4_PATCH,
  Gameplay4BossDirector,
  computeGameplay4Reward,
  getGameplay4BossDamageScale,
  getGameplay4Profile
} from './gameplay4_boss_encounter_core.js';

const start = 1_800_000_000_000;
const director = new Gameplay4BossDirector();
director.reset({ runId: 'run-gp4', mapId: 'grid_bunker', gameMode: 'survival', now: start });
assert.equal(director.bindBoss({
  bossId: 'VANGUARD-JUGGERNAUT',
  bossLabel: 'Vanguard Juggernaut',
  enemyId: 'boss-1',
  enemyType: 'GOLIATH',
  maxHealth: 1200,
  health: 1200,
  position: { x: 2, y: 0, z: 3 }
}, start), true);
assert.equal(director.state.patch, GAMEPLAY4_PATCH);
assert.equal(director.state.status, GAMEPLAY4_BOSS_STATUS.ACTIVE);
assert.equal(getGameplay4Profile(director.state).id, 'JUGGERNAUT');
assert.equal(getGameplay4Profile({ bossId: 'PLAGUE-MATRIARCH', enemyType: 'RANGED' }).id, 'MATRIARCH');
assert.equal(getGameplay4Profile({ bossId: 'DEMOLITION-CHIEF', enemyType: 'EXPLODER' }).id, 'DETONATOR');

director.update(start + 2800, {
  boss: { phase: 0, status: 'ACTIVE', health: 1200, maxHealth: 1200 },
  bossPosition: { x: 2, y: 0, z: 3 },
  participants: [{ connected: true, alive: true, position: { x: 8, y: 0, z: 3 } }]
});
assert.equal(director.state.ability.state, GAMEPLAY4_ABILITY_STATE.WARNING);
assert.ok(director.state.ability.radius >= 5);
assert.equal(getGameplay4BossDamageScale(director.getSnapshot(), 'boss-1'), 0.82);

let result = director.observeBossDamage({
  enemyId: 'boss-1',
  damage: 250,
  headshot: true,
  actorId: 'player-1',
  health: 950,
  maxHealth: 1200,
  postFinal8Phase: 0
}, start + 3000);
assert.equal(result.accepted, true);
result = director.observeBossDamage({
  enemyId: 'boss-1',
  damage: 250,
  headshot: true,
  actorId: 'player-1',
  health: 700,
  maxHealth: 1200,
  postFinal8Phase: 1
}, start + 3100);
assert.equal(director.state.phase, 2);
assert.ok(director.state.phaseTransitions >= 1);

// Start the phase-two ability and interrupt it.
director.update(start + 4000, {
  boss: { phase: 1, status: 'ACTIVE', health: 700, maxHealth: 1200 },
  bossPosition: { x: 2, y: 0, z: 3 },
  participants: [{ connected: true, alive: true, position: { x: 7, y: 0, z: 5 } }]
});
assert.equal(director.state.ability.state, GAMEPLAY4_ABILITY_STATE.WARNING);
for (let i = 0; i < 4 && director.state.ability.state === GAMEPLAY4_ABILITY_STATE.WARNING; i += 1) {
  director.observeBossDamage({
    enemyId: 'boss-1',
    damage: 150,
    headshot: true,
    actorId: 'player-1',
    health: 700 - i * 20,
    maxHealth: 1200,
    postFinal8Phase: 1
  }, start + 4100 + i * 20);
}
assert.equal(director.state.ability.state, GAMEPLAY4_ABILITY_STATE.VULNERABLE);
assert.equal(director.state.interruptCount, 2);
assert.equal(getGameplay4BossDamageScale(director.getSnapshot(), 'boss-1', { headshot: true }), 1.48);

director.observeBossDamage({
  enemyId: 'boss-1',
  damage: 60,
  headshot: false,
  health: 500,
  maxHealth: 1200,
  postFinal8Phase: 1
}, start + 4300);
assert.equal(director.state.vulnerabilityHits, 1);

assert.equal(director.recordBossKilled({ enemyId: 'boss-1', actorId: 'player-1' }, start + 5000), true);
assert.equal(director.state.status, GAMEPLAY4_BOSS_STATUS.DEFEATED);
assert.ok(computeGameplay4Reward(director.getSnapshot()) >= 300);
assert.ok(director.getSnapshot().completionId.includes('gameplay4'));

const replacement = new Gameplay4BossDirector();
replacement.reset({ runId: 'run-gp4', mapId: 'grid_bunker', gameMode: 'survival', now: start });
assert.equal(replacement.replaceSnapshot(director.getSnapshot(start + 5000), start + 5000), true);
assert.deepEqual(replacement.getSnapshot(start + 5000), director.getSnapshot(start + 5000));

const pvp = new Gameplay4BossDirector();
pvp.reset({ runId: 'pvp-run', mapId: 'pvp_foundry', gameMode: 'pvp', now: start });
assert.equal(pvp.bindBoss({ enemyId: 'boss-pvp' }, start), false);
assert.equal(pvp.getSnapshot().active, false);

console.log('GAMEPLAY.4 expanded boss encounter core tests passed');
