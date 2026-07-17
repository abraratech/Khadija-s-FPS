import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POST_FINAL4_OPERATION_KINDS,
  POST_FINAL4_PATCH,
  PostFinal4ObjectiveDirector
} from './postfinal4_objective_core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const release = JSON.parse(read('multiplayer-release.json'));
const content = read('js/content1.js');
const foundation = read('js/multiplayer/foundation.js');
const bot = read('js/multiplayer/bot.js');
const squad = read('js/multiplayer/squad_command_core.js');
const sharedWorld = read('js/multiplayer/shared_world.js');
const main = read('js/main.js');
const controls = read('js/controls.js');
const summary = read('js/run_summary.js');
const ui = read('js/ui.js');
const index = read('index.html');
const hudCss = read('css/hud.css');
const builder = read('scripts/build_production.py');

assert.equal(release.protocol, 6);
assert.equal(release.dynamicOperationsObjectiveDirector.patch, POST_FINAL4_PATCH);
assert.equal(release.dynamicOperationsObjectiveDirector.operationTypes.length, 6);
assert.equal(release.dynamicOperationsObjectiveDirector.mapAuthoredSafeAnchors, 6);
assert.equal(release.dynamicOperationsObjectiveDirector.existingContent1Transport, true);
assert.equal(release.dynamicOperationsObjectiveDirector.protocolUnchanged, true);
assert.equal(release.dynamicOperationsObjectiveDirector.workerChangeRequired, false);

const director = new PostFinal4ObjectiveDirector();
assert.ok(Object.values(POST_FINAL4_OPERATION_KINDS).includes(director.state.current.kind));
assert.match(content, /postFinal4/);
assert.match(content, /sendContent1State/);
assert.match(content, /handleHostMigration/);
assert.match(content, /awardTeamObjective/);
assert.match(content, /recordRunDynamicOperation/);
assert.match(content, /objective-hud-mode-select/);
assert.match(content, /DYNAMIC_OPERATION_COMPLETED/);
assert.match(content, /DYNAMIC_OPERATION_FAILED/);

assert.match(foundation, /contentAdapter = null/);
assert.match(foundation, /getParticipants:/);
assert.match(foundation, /awardTeamObjective:/);
assert.match(foundation, /handleObjectiveDirective:/);
assert.match(foundation, /interactHeld: interactHeld === true/);
assert.match(main, /awardLocalPoints:/);
assert.match(main, /interactHeld: multiplayerInteractHeld/);
assert.match(controls, /interactHeld/);
assert.match(controls, /gamepadInput\?\.interactHeld/);
assert.match(bot, /handleObjectiveDirective\(/);
assert.match(bot, /objectiveCommand/);
assert.match(bot, /objectiveDirector === true/);
assert.match(squad, /enemy\.content1Id/);
assert.match(sharedWorld, /objectivePriority/);
assert.match(sharedWorld, /content1Id/);

assert.match(summary, /recordRunDynamicOperation/);
assert.match(summary, /dynamicOperationsCompleted/);
assert.match(ui, /final-dynamic-operations/);
assert.match(index, /id="objective-hud-mode-select"/);
assert.match(index, /id="final-objective-rewards"/);
assert.match(hudCss, /ka-postfinal4-hud/);
assert.match(hudCss, /ka-objective-hud-compact/);
assert.match(builder, /POST_FINAL4_PATCH = "post-final4-r1-dynamic-operations-objective-director"/);
assert.match(builder, /"post_final4"/);

console.log('POST-FINAL.4 combined dynamic operations and objective director contract: PASS');
