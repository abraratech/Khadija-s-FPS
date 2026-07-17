import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POST_FINAL8_BOSS_STATUS,
  POST_FINAL8_FACTIONS,
  POST_FINAL8_PATCH,
  PostFinal8ReplayDirector
} from './postfinal8_replayability_core.js';
import {
  MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE
} from './multiplayer/production_release_core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const release = JSON.parse(read('multiplayer-release.json'));
const content = read('js/content1.js');
const enemy = read('js/enemy.js');
const weapons = read('js/weapons.js');
const sharedWorld = read('js/multiplayer/shared_world.js');
const bot = read('js/multiplayer/bot.js');
const summary = read('js/run_summary.js');
const ui = read('js/ui.js');
const index = read('index.html');
const hud = read('css/hud.css');
const builder = read('scripts/build_production.py');

assert.equal(release.protocol, 6);
assert.equal(release.certifiedBaselineSha, MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE);
assert.equal(release.postFinal8.patch, POST_FINAL8_PATCH);
assert.equal(release.postFinal8.sourceBaselineSha, '298ff47a5706c630ef48ed2d26625502440efb4f');
assert.equal(release.postFinal8.certifiedFrontendBaselineSha, MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE);
assert.equal(release.postFinal8.workerChangeRequired, false);
assert.equal(release.postFinal8.frontendOnly, true);
assert.equal(release.postFinal8.protocolUnchanged, true);
assert.deepEqual(
  release.postFinal8.enemyFactions,
  Object.values(POST_FINAL8_FACTIONS)
);
assert.equal(release.postFinal8.bossPhases, 3);
assert.equal(release.postFinal8.bossCandidatesPerFaction, 2);
assert.equal(release.postFinal8.aiBossAwareness, true);
assert.equal(release.postFinal8.humanSquadCommandOverride, true);

const director = new PostFinal8ReplayDirector();
director.reset({
  runId: 'contract-run',
  mapId: 'hospital_wing',
  missionId: 'WHITE-LINE',
  difficulty: 1.4,
  playerCount: 2
});
assert.ok(Object.values(POST_FINAL8_FACTIONS).includes(director.state.faction.id));
assert.equal(director.state.modifiers.length, 2);
assert.equal(director.state.eliteAffixes.length, 2);
assert.equal(director.state.boss.status, POST_FINAL8_BOSS_STATUS.PENDING);
assert.ok(Object.keys(director.getEncounterMultipliers()).length >= 6);

assert.match(content, /PostFinal8ReplayDirector/);
assert.match(content, /postFinal8/);
assert.match(content, /KAContent1EnemyDamaged/);
assert.match(content, /recordEnemyDamage/);
assert.match(content, /recordBossKilled/);
assert.match(content, /getEncounterMultipliers/);
assert.match(content, /replaceSnapshot\(snapshot\.postFinal8/);
assert.match(content, /recordRunPostFinal8Replayability/);
assert.match(content, /BOSS PHASE/);
assert.match(content, /FACTION_ASSIGNED/);

assert.match(enemy, /KAContent1EnemyDamaged/);
assert.match(enemy, /isPostFinal8Boss/);
assert.match(weapons, /KAContent1EnemyDamaged/);
assert.match(sharedWorld, /KAContent1EnemyDamaged/);
assert.match(sharedWorld, /postFinal8BossPhase/);

assert.match(bot, /postfinal8-replayability-director/);
assert.match(bot, /bossTargetId/);
assert.match(bot, /bossStagger/);
assert.match(bot, /BOSS PHASE/);

assert.match(summary, /factionOperationsCompleted/);
assert.match(summary, /recordRunPostFinal8Replayability/);
assert.match(summary, /replayMasteryGrade/);
assert.match(ui, /final-enemy-faction/);
assert.match(ui, /final-replay-mastery/);
assert.match(index, /id="final-boss-defeated"/);
assert.match(index, /id="final-replay-medals"/);
assert.match(hud, /ka-postfinal8-faction/);
assert.match(hud, /ka-postfinal8-boss/);

assert.match(builder, /POST_FINAL8_PATCH/);
assert.match(builder, /POST_FINAL8_SOURCE_BASELINE_SHA/);
assert.match(builder, /POST_FINAL8_CERTIFIED_FRONTEND_BASELINE_SHA/);
assert.match(builder, /"post_final8"/);
assert.match(builder, /"worker_change_required": False/);

const workerFiles = [
  'multiplayer-server/package.json',
  'multiplayer-server/package-lock.json',
  'multiplayer-server/src/index.js',
  'multiplayer-server/src/ops_hub.js',
  'multiplayer-server/src/social_hub.js'
];
for (const relative of workerFiles) {
  assert.ok(fs.existsSync(path.join(root, relative)));
}

console.log('POST-FINAL.8 combined release contract passed');
