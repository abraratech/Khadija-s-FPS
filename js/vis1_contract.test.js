import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pvp2RankPresentation } from './multiplayer/pvp2_core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const index = read('index.html');
const hudCss = read('css/hud.css');
const mpCss = read('css/multiplayer.css');
const content = read('js/content1.js');
const career = read('js/career_achievements.js');
const challenges = read('js/challenges.js');
const lobby = read('js/multiplayer/lobby_ui.js');
const release = JSON.parse(read('multiplayer-release.json'));

for (const id of [
  'pause-hud-visibility-panel',
  'pause-objective-hud-mode-select',
  'pause-run-challenges-visibility-select',
  'pause-objective-hud-current'
]) assert.match(index, new RegExp(`id="${id}"`));

assert.match(content, /pause-objective-hud-mode-select/);
assert.match(content, /pause-run-challenges-visibility-select/);
assert.match(content, /KASetObjectiveHudMode/);
assert.match(content, /KASetRunChallengesVisible/);
assert.match(content, /ka:hud-preferences-updated/);
assert.match(hudCss, /\.ka-pause-hud-panel/);
assert.match(hudCss, /body\.ka-pvp-native-hud-isolated #pause-hud-visibility-panel/);

assert.match(career, /ka-career-showcase/);
assert.match(career, /ka-achievement-filter/);
assert.match(career, /ka-achievement-icon/);
assert.match(career, /achievement\.progressPercent/);
assert.match(challenges, /category: 'COMBAT'/);
assert.match(challenges, /rarity: 'EPIC'/);

for (const id of [
  'ka-pvp2-rank-hero',
  'ka-pvp2-rank-emblem',
  'ka-pvp2-rank-meter',
  'ka-pvp2-milestones',
  'ka-pvp2-rating-value'
]) assert.match(lobby, new RegExp(id));
assert.match(mpCss, /\.ka-vis1-rank-hero/);
assert.match(mpCss, /\.ka-vis1-pvp-milestones/);
assert.equal(pvp2RankPresentation(1000).id, 'BRONZE');
assert.equal(pvp2RankPresentation(1900).id, 'VANGUARD');

assert.equal(release.vis1?.patch, 'vis1-r1-visual-achievements-competitive-profile-hud-controls');
assert.equal(release.vis1?.pauseObjectiveControls, true);
assert.equal(release.vis1?.visualAchievementCards, true);
assert.equal(release.vis1?.workerChangeRequired, false);
assert.equal(release.hud1?.pauseMenuControls, true);

console.log('VIS.1 visual achievements, competitive profile, and pause HUD controls contract: PASS');
