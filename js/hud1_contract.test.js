import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const index = read('index.html');
const content = read('js/content1.js');
const css = read('css/hud.css');
const release = JSON.parse(read('multiplayer-release.json'));

assert.match(index, /id="objective-hud-mode-select"/);
assert.match(index, /<option value="hidden">Hidden<\/option>/);
assert.match(index, /id="run-challenges-visibility-select"/);
assert.match(index, /Progress and rewards continue while hidden/);

assert.match(content, /RUN_CHALLENGES_HUD_KEY/);
assert.match(content, /OBJECTIVE_HUD_MODES = Object\.freeze\(\['full', 'compact', 'hidden'\]\)/);
assert.match(content, /cycleObjectiveHudMode\(\)/);
assert.match(content, /ka-objective-hud-toggle/);
assert.match(content, /ka-objective-hud-critical/);
assert.match(content, /localStorage\.setItem\(OBJECTIVE_HUD_KEY, mode\)/);
assert.match(content, /localStorage\.setItem\(RUN_CHALLENGES_HUD_KEY/);

assert.match(css, /body\.ka-objective-hud-hidden #objective-panel/);
assert.match(css, /body\.ka-run-challenges-hidden \.challenge-panel-wrap/);
assert.match(css, /\.ka-postfinal4-hud\.ka-objective-hud-hidden:not\(\.ka-objective-hud-critical\)/);
assert.match(css, /\.ka-objective-hud-toggle/);

assert.equal(release.hud1?.patch, 'hud1-r1-configurable-objective-display');
assert.deepEqual(release.hud1?.objectivePanelModes, ['full', 'compact', 'hidden']);
assert.equal(release.hud1?.criticalDecisionOverride, true);
assert.equal(release.hud1?.workerChangeRequired, false);

console.log('HUD.1 configurable objective display contract tests passed');
