import assert from 'node:assert/strict';
import {
  GAMEPLAY4_ABILITY_STATE,
  GAMEPLAY4_BOSS_STATUS,
  Gameplay4BossDirector,
  getGameplay4ReinforcementTuning
} from './gameplay4_boss_encounter_core.js';

const start = 1_800_100_000_000;
const participants = [
  {
    playerId: 'vanguard',
    roleId: 'VANGUARD',
    connected: true,
    alive: true,
    position: { x: 8, y: 0, z: 0 }
  },
  {
    playerId: 'medic',
    roleId: 'FIELD_MEDIC',
    connected: true,
    alive: true,
    position: { x: 6, y: 0, z: 0 }
  },
  {
    playerId: 'recon',
    roleId: 'RECON',
    connected: true,
    alive: true,
    position: { x: 10, y: 0, z: 0 }
  },
  {
    playerId: 'support',
    roleId: 'SUPPORT',
    connected: true,
    alive: true,
    position: { x: 7, y: 0, z: 0 }
  }
];

const host = new Gameplay4BossDirector();
host.reset({
  runId: 'run-gp4-multiplayer',
  mapId: 'hospital_wing',
  gameMode: 'survival',
  now: start
});
assert.equal(host.bindBoss({
  bossId: 'PLAGUE-MATRIARCH',
  bossLabel: 'Plague Matriarch',
  enemyId: 'boss-matriarch',
  enemyType: 'RANGED',
  maxHealth: 900,
  health: 900,
  position: { x: 0, y: 0, z: 0 }
}, start), true);

host.update(start + 2800, {
  boss: { phase: 0, status: 'ACTIVE', health: 900, maxHealth: 900 },
  bossPosition: { x: 0, y: 0, z: 0 },
  participants
});
assert.equal(host.state.ability.state, GAMEPLAY4_ABILITY_STATE.WARNING);
assert.equal(host.state.ability.targetPlayerId, 'vanguard');
assert.equal(host.state.ability.targetRoleId, 'VANGUARD');
assert.equal(host.state.teamSize, 4);
assert.equal(host.state.ability.damage, 16);

const reinforcement = getGameplay4ReinforcementTuning(host.getSnapshot(start + 2800), 'add-1');
assert.equal(reinforcement.active, true);
assert.equal(reinforcement.phase, 1);
assert.ok(reinforcement.healthScale > 1);
assert.equal(
  getGameplay4ReinforcementTuning(host.getSnapshot(start + 2800), 'boss-matriarch').active,
  false
);

const warningEndsAt = host.state.ability.endsAt;
host.update(warningEndsAt, {
  boss: { phase: 0, status: 'ACTIVE', health: 900, maxHealth: 900 },
  bossPosition: { x: 0, y: 0, z: 0 },
  participants
});
assert.equal(host.state.ability.state, GAMEPLAY4_ABILITY_STATE.ACTIVE);
const serial = host.state.ability.serial;
const preCommitSnapshot = host.getSnapshot(warningEndsAt);

const migratedHost = new Gameplay4BossDirector();
migratedHost.reset({
  runId: 'run-gp4-multiplayer',
  mapId: 'hospital_wing',
  gameMode: 'survival',
  now: warningEndsAt
});
assert.equal(migratedHost.replaceSnapshot(preCommitSnapshot, warningEndsAt), true);
assert.equal(migratedHost.claimAbilityCommit(serial, warningEndsAt + 1), true);
assert.equal(migratedHost.claimAbilityCommit(serial, warningEndsAt + 2), false);

const committedSnapshot = migratedHost.getSnapshot(warningEndsAt + 2);
const lateJoin = new Gameplay4BossDirector();
lateJoin.reset({
  runId: 'run-gp4-multiplayer',
  mapId: 'hospital_wing',
  gameMode: 'survival',
  now: warningEndsAt + 2
});
assert.equal(lateJoin.replaceSnapshot(committedSnapshot, warningEndsAt + 2), true);
assert.equal(lateJoin.getSnapshot(warningEndsAt + 2).ability.damageApplied, true);
assert.equal(lateJoin.claimAbilityCommit(serial, warningEndsAt + 3), false);

const wrongRun = new Gameplay4BossDirector();
wrongRun.reset({ runId: 'different-run', gameMode: 'survival', now: start });
assert.equal(wrongRun.replaceSnapshot(committedSnapshot, warningEndsAt + 2), false);

const pvp = new Gameplay4BossDirector();
pvp.reset({ runId: 'pvp-run', mapId: 'pvp_foundry', gameMode: 'pvp', now: start });
assert.equal(pvp.bindBoss({ enemyId: 'pvp-boss' }, start), false);
assert.equal(pvp.replaceSnapshot(committedSnapshot, warningEndsAt + 2), false);
assert.equal(pvp.getSnapshot(start).active, false);
assert.equal(pvp.getSnapshot(start).status, GAMEPLAY4_BOSS_STATUS.INACTIVE);
assert.equal(getGameplay4ReinforcementTuning(pvp.getSnapshot(start), 'pvp-add').active, false);

const solo = new Gameplay4BossDirector();
solo.reset({ runId: 'solo-run', mapId: 'hospital_wing', gameMode: 'survival', now: start });
solo.bindBoss({
  bossId: 'PLAGUE-MATRIARCH',
  enemyId: 'solo-boss',
  enemyType: 'RANGED',
  maxHealth: 900,
  health: 900
}, start);
solo.update(start + 2800, {
  boss: { phase: 0, status: 'ACTIVE', health: 900, maxHealth: 900 },
  participants: [participants[1]]
});
assert.equal(solo.state.teamSize, 1);
assert.equal(solo.state.ability.damage, 12);
assert.ok(solo.state.ability.damage < host.state.ability.damage);

console.log('GAMEPLAY.4 multiplayer restoration, role targeting, and PvP isolation tests passed');
