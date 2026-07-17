import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POST_FINAL7_PATCH,
  POST_FINAL7_RISK_CHOICES,
  POST_FINAL7_STAGE_TYPES,
  PostFinal7MissionDirector,
  getPostFinal7MissionDefinition
} from './postfinal7_operation_core.js';
import {
  MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE
} from './multiplayer/production_release_core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const release = JSON.parse(read('multiplayer-release.json'));
const content = read('js/content1.js');
const bot = read('js/multiplayer/bot.js');
const summary = read('js/run_summary.js');
const ui = read('js/ui.js');
const index = read('index.html');
const hud = read('css/hud.css');
const builder = read('scripts/build_production.py');

assert.equal(release.protocol, 6);
assert.equal(release.postFinal7.patch, POST_FINAL7_PATCH);
assert.equal(release.postFinal7.sourceBaselineSha, '83a44d5aad87b6785b8d466d8fb69bed0cb676f3');
assert.equal(release.postFinal7.certifiedFrontendBaselineSha, MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE);
assert.equal(release.certifiedBaselineSha, MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE);
assert.equal(release.postFinal7.workerChangeRequired, false);
assert.equal(release.postFinal7.frontendOnly, true);
assert.equal(release.postFinal7.existingContent1Transport, true);
assert.equal(release.postFinal7.protocolUnchanged, true);
assert.equal(release.postFinal7.missionChains, 6);
assert.equal(release.postFinal7.stagesPerChain, 6);

for (const mapId of [
  'grid_bunker',
  'industrial_yard',
  'neon_depot',
  'parking_garage',
  'hospital_wing',
  'reactor_courtyard'
]) {
  const definition = getPostFinal7MissionDefinition(mapId);
  assert.equal(definition.stages.length, 6);
  assert.deepEqual(
    definition.stages.map((entry) => entry.type),
    [
      POST_FINAL7_STAGE_TYPES.INFILTRATE,
      POST_FINAL7_STAGE_TYPES.RECOVER,
      POST_FINAL7_STAGE_TYPES.SECONDARY,
      POST_FINAL7_STAGE_TYPES.DEFEND,
      POST_FINAL7_STAGE_TYPES.HUNT,
      POST_FINAL7_STAGE_TYPES.EXTRACT
    ]
  );
}

const director = new PostFinal7MissionDirector();
director.reset({
  runId: 'contract',
  mapId: 'reactor_courtyard',
  difficulty: 1.25,
  playerCount: 2
});
assert.equal(director.getDirective().humanSquadCommandsOverride, true);
assert.equal(director.state.riskChoice, POST_FINAL7_RISK_CHOICES.PENDING);

assert.match(content, /PostFinal7MissionDirector/);
assert.match(content, /postFinal7/);
assert.match(content, /MISSION_RISK_CHOICE/);
assert.match(content, /chooseMissionRisk/);
assert.match(content, /ensureMissionObjective/);
assert.match(content, /recordRunPostFinal7Mission/);
assert.match(content, /handleHostMigration/);
assert.match(content, /replaceSnapshot\(snapshot\.postFinal7/);
assert.match(content, /sendContent1State/);
assert.match(content, /OVERDRIVE/);

assert.match(bot, /postfinal7-mission-director/);
assert.match(bot, /BOSS TARGET ACKNOWLEDGED/);
assert.match(bot, /humanSquadCommandsOverride/);
assert.match(bot, /missionStageType/);

assert.match(summary, /missionChainsCompleted/);
assert.match(summary, /missionMedals/);
assert.match(summary, /recordRunPostFinal7Mission/);
assert.match(ui, /final-mission-chains/);
assert.match(ui, /final-mission-medals/);
assert.match(index, /id="final-mission-risk"/);
assert.match(index, /id="final-mission-medals"/);
assert.match(hud, /ka-postfinal7-risk/);
assert.match(hud, /pointer-events: auto/);

assert.match(builder, /POST_FINAL7_PATCH/);
assert.match(builder, /"post_final7"/);
assert.match(builder, /"worker_change_required": False/);
assert.match(builder, /POST_FINAL7_CERTIFIED_FRONTEND_BASELINE_SHA/);

console.log('POST-FINAL.7 combined release contract passed');
