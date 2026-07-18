import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const index = read('../index.html');
const menuCss = read('../css/menu.css');
const main = read('./main.js');
const runtime = read('./launch1.js');
const live1 = read('./live1.js');
const controls = read('./controls.js');
const versionRuntime = read('./postfinal10_runtime.js');
const builder = read('../scripts/build_production.py');
const release = JSON.parse(read('../multiplayer-release.json'));

for (const id of [
  'launch1-welcome',
  'launch1-welcome-title',
  'launch1-welcome-description',
  'launch1-replay-welcome-btn'
]) {
  assert.ok(index.includes(`id="${id}"`), `Missing LAUNCH.1 element: ${id}`);
}

assert.match(index, /role="dialog"/);
assert.match(index, /aria-modal="true"/);
assert.match(index, /data-launch1-action="solo"/);
assert.match(index, /data-launch1-action="multiplayer"/);
assert.match(index, /Replay this guide anytime from Settings/);
assert.match(main, /from '\.\/launch1\.js'/);
assert.match(main, /initLaunch1Experience\(\)/);
assert.match(runtime, /ka_launch1_welcome_seen_v1/);
assert.match(runtime, /ka:menu-screen/);
assert.match(runtime, /event\.key !== 'Tab'/);
assert.match(runtime, /event\.key === 'Escape'/);
assert.match(menuCss, /#launch1-welcome/);
assert.match(menuCss, /@media \(max-width: 760px\)/);
assert.match(menuCss, /prefers-reduced-motion/);

assert.doesNotMatch(index, /VERIFIED WORKER TIME/);
assert.doesNotMatch(index, /release checks are active/i);
assert.doesNotMatch(index, /INITIALIZING FINAL RUNTIME/);
assert.doesNotMatch(index, /<span>Build<\/span>/);
assert.doesNotMatch(live1, /WORKER TIME VERIFIED/);
assert.doesNotMatch(controls, /diagnostics or development tools/);
assert.match(live1, /ONLINE SCHEDULE READY · REWARDS PROTECTED/);
assert.match(versionRuntime, /SYSTEM READY/);
assert.doesNotMatch(versionRuntime, /node\.textContent = `VERSION/);

assert.equal(release.launch1.patch, 'launch1-r1-first-run-welcome-production-language');
assert.equal(release.launch1.sourceBaselineSha, 'aada1736cb2f404bda6e079bf175495957f19e1a');
assert.equal(release.launch1.frontendOnly, true);
assert.equal(release.launch1.workerChangeRequired, false);
assert.equal(release.launch1.gameplayAuthorityUnchanged, true);
assert.match(builder, /LAUNCH1_PATCH/);
assert.match(builder, /"launch1"/);
assert.match(builder, /"worker_change_required": False/);

console.log('LAUNCH.1 first-run welcome and production-language contract: PASS');
