import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '..');
const workerCandidates = [
  path.resolve(frontend, 'multiplayer-server', 'src'),
  path.resolve(frontend, '..', 'worker', 'src')
];
const worker = workerCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(worker, 'Worker source directory is required for GAMEPLAY.2 certification.');
const read = (value) => fs.readFileSync(value, 'utf8');

const content = read(path.join(here, 'content1.js'));
const enemy = read(path.join(here, 'enemy.js'));
const map = read(path.join(here, 'map.js'));
const mapGameplay = read(path.join(here, 'map_gameplay.js'));
const main = read(path.join(here, 'main.js'));
const summary = read(path.join(here, 'run_summary.js'));
const progression = read(path.join(here, 'progression.js'));
const ui = read(path.join(here, 'ui.js'));
const index = read(path.join(frontend, 'index.html'));
const css = read(path.join(frontend, 'css', 'hud.css'));
const workerAuthority = read(path.join(worker, 'progression_authority_core.js'));
const workerEconomy = read(path.join(worker, 'postfinal9_economy_core.js'));

assert.match(content, /Gameplay2MutationDirector/);
assert.match(content, /gameplay2:\s*clone\(payload\.snapshot\.gameplay2/);
assert.match(content, /applyGameplay2MutationState/);
assert.match(content, /recordRunGameplay2Mutation/);
assert.match(content, /hadRemoteSnapshot/);
assert.match(enemy, /KAGetGameplay2EnemyTuning/);
assert.match(enemy, /specialWeightScale/);
assert.match(enemy, /powerupDropScale/);
assert.match(map, /applyGameplay2MutationLighting/);
assert.match(mapGameplay, /configureGameplay2MapMutation/);
assert.match(mapGameplay, /export function updateGameplay2MapMutation/);
assert.match(mapGameplay, /affectEnemies === true/);
assert.match(mapGameplay, /MUTATION_HAZARD/);
assert.match(main, /updateGameplay2MapMutation\(dt/);
assert.match(main, /affectEnemies:\s*sharedWorldAuthority/);
assert.match(main, /gameMode:\s*pvpRun \? 'pvp' : 'survival'/);
assert.match(summary, /mutationPeakRewardMultiplier/);
assert.match(progression, /gameplay2Patch/);
assert.match(progression, /gameMode/);
assert.match(ui, /final-arena-mutations/);
assert.match(index, /id="final-mutation-multiplier"/);
assert.match(css, /GAMEPLAY\.2 R1 — late-round arena mutation HUD/);
assert.match(workerAuthority, /normalizePostFinal9ReceiptFields/);
assert.match(workerAuthority, /const gameMode/);
assert.match(workerEconomy, /deriveGameplay2MutationReceipt/);
assert.match(workerEconomy, /gameMode !== 'pvp'/);
assert.match(workerEconomy, /mutationBonusCredits/);

console.log('GAMEPLAY.2 source contract tests passed');
