import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.join(here, relative), 'utf8');

const core = read('gameplay4_boss_encounter_core.js');
const content = read('content1.js');
const enemy = read('enemy.js');
const weapons = read('weapons.js');
const sharedWorld = read('multiplayer/shared_world.js');
const foundation = read('multiplayer/foundation.js');
const replayability = read('postfinal8_replayability_core.js');
const runSummary = read('run_summary.js');
const updateDelivery = read('update_delivery_core.js');
const buildProduction = read('../scripts/build_production.py');
const verifyProduction = read('../scripts/verify_launch2_build.py');
const release = JSON.parse(read('../release-version.json'));
const metadata = JSON.parse(read('../multiplayer-release.json'));

assert.match(core, /GAMEPLAY4_PATCH = 'gameplay4-r1-expanded-boss-encounters'/);
for (const profile of ['JUGGERNAUT', 'MATRIARCH', 'DETONATOR']) {
  assert.match(core, new RegExp(profile));
}
for (const marker of [
  'GAMEPLAY4_ABILITY_STATE',
  'GAMEPLAY4_ABILITY_WARNING',
  'GAMEPLAY4_ABILITY_INTERRUPTED',
  'GAMEPLAY4_VULNERABILITY_OPENED',
  'claimAbilityCommit',
  'getGameplay4ReinforcementTuning',
  'teamDamageScale',
  'targetRoleId'
]) {
  assert.ok(core.includes(marker), `Missing GAMEPLAY.4 core marker: ${marker}`);
}
assert.match(core, /this\.state\.gameMode === 'pvp'/);

for (const marker of [
  'Gameplay4BossDirector',
  'this.bossEncounterDirector = new Gameplay4BossDirector()',
  'window.KAGetGameplay4BossSnapshot',
  'window.KAGetGameplay4BossDamageScale',
  'window.KAClaimGameplay4AbilityCommit',
  'getGameplay4ReinforcementTuning',
  'recordRunGameplay4BossEncounter',
  'snapshot.gameplay4',
  'payload.snapshot.gameplay4',
  'gameplay4ReinforcementPhase'
]) {
  assert.ok(content.includes(marker), `Missing GAMEPLAY.4 CONTENT.1 marker: ${marker}`);
}
assert.match(content, /return \{ \.\.\.base, postFinal4, postFinal7, postFinal8, gameplay2, gameplay3, gameplay4, gameplay5, gameplay6 \}/);
assert.match(content, /this\.bossEncounterDirector\.replaceSnapshot\(snapshot\.gameplay4/);

for (const marker of [
  'ensureGameplay4TelegraphMesh',
  'updateGameplay4BossRuntime',
  'KAClaimGameplay4AbilityCommit',
  'GAMEPLAY4_CONTROL'
]) {
  if (marker === 'GAMEPLAY4_CONTROL') continue;
  assert.ok(enemy.includes(marker), `Missing GAMEPLAY.4 enemy marker: ${marker}`);
}
assert.match(enemy, /RingGeometry/);
assert.match(enemy, /damageEnemyTarget\(target, damage/);
assert.match(weapons, /KAGetGameplay4BossDamageScale/);
assert.match(sharedWorld, /KAGetGameplay4BossDamageScale/);
assert.match(foundation, /roleId: coop2Manager\?\.getRoleForPlayer/);

assert.match(replayability, /boss\('DEMOLITION-CHIEF',[^\n]*'EXPLODER'/);
assert.match(replayability, /boss\('PLAGUE-MATRIARCH',[^\n]*'RANGED'/);
assert.match(replayability, /type === clean\(this\.state\.boss\.enemyType/);
assert.match(runSummary, /recordRunGameplay4BossEncounter/);
assert.match(runSummary, /gameplay4BossInterrupts/);

assert.equal(release.releaseId, 'gameplay6-r1-world-progression');
assert.equal(release.productVersion, '1.7.0-gameplay6-r1');
assert.equal(release.releaseSequence, 2026072104);
assert.equal(release.sourceBaselineSha, 'b3544e114ce02047b3705af14fcc94428c8cdbe8');
assert.equal(release.workerBaselineSha, '2a038bef08f3d27a71159ac6ef597139acfc58b1');
assert.equal(release.baselineWorkerVersionId, '4f384856-891f-4563-b148-148c2f90cd98');
assert.equal(release.workerChangeRequired, false);
assert.equal(metadata.releaseLabel, 'GAMEPLAY.6 R1 - World Progression');
assert.equal(metadata.gameplay4?.patch, 'gameplay4-r1-expanded-boss-encounters');
assert.equal(metadata.gameplay4?.bossPhases, 3);
assert.deepEqual(metadata.gameplay4?.bossProfiles, ['JUGGERNAUT', 'MATRIARCH', 'DETONATOR']);
for (const field of [
  'telegraphedAbilities',
  'interruptibleAbilities',
  'vulnerabilityWindows',
  'arenaDamageZones',
  'phaseReinforcementPressure',
  'soloDamageScaling',
  'coopRoleAwareTargeting',
  'boundedReinforcementScaling',
  'abilityCommitIdempotence',
  'bossTypeMatching',
  'pvpExcluded',
  'hostAuthoritative',
  'lateJoinSnapshot',
  'reconnectRestoration',
  'hostMigrationCheckpoint',
  'rewardAuthority',
  'runSummaryIntegration',
  'protocolUnchanged',
  'frontendOnly'
]) {
  assert.equal(metadata.gameplay4?.[field], true, `Missing GAMEPLAY.4 policy: ${field}`);
}
assert.equal(metadata.gameplay4?.workerChangeRequired, false);
assert.match(updateDelivery, /gameplay6-r1-world-progression/);
assert.match(updateDelivery, /releaseSequence: 2026072104/);
assert.match(buildProduction, /GAMEPLAY4_RELEASE_SEQUENCE = 2026072102/);
assert.match(buildProduction, /"gameplay4":/);
assert.match(verifyProduction, /GAMEPLAY\.4 production manifest patch mismatch/);
assert.match(verifyProduction, /GAMEPLAY\.4 must remain frontend-only/);

const pvpEnd = foundation.indexOf('content1Manager?.endRun?.()', foundation.indexOf('if (pvpRun)'));
assert.ok(pvpEnd >= 0, 'PvP runs must keep CONTENT.1 and GAMEPLAY.4 inactive.');

console.log('GAMEPLAY.4 source integration contract passed');
