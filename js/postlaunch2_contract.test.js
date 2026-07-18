import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const release = JSON.parse(fs.readFileSync(path.join(root, 'multiplayer-release.json'), 'utf8'));

assert.match(index, /POST-LAUNCH\.2 R1 — adaptive desktop navigation/);
assert.match(index, /overflow-y:\s*auto/);
assert.match(index, /scrollbar-gutter:\s*stable/);
assert.match(index, /@media \(min-width: 921px\) and \(max-height: 940px\)/);
assert.match(index, /@media \(min-width: 921px\) and \(max-height: 760px\)/);
assert.match(index, /activeRailButton\.scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\)/);
assert.doesNotMatch(index, /\.ka-game-rail \{ overflow: hidden; \}/);

assert.equal(release.postLaunch2.patch, 'post-launch2-r1-adaptive-menu-viewport-safety');
assert.equal(release.postLaunch2.desktopRailVerticalFallback, true);
assert.equal(release.postLaunch2.laptopHeightCompaction, true);
assert.equal(release.postLaunch2.browserZoomResilience, true);
assert.equal(release.postLaunch2.activeNavigationAutoReveal, true);
assert.equal(release.postLaunch2.mobileTopNavigationPreserved, true);
assert.equal(release.postLaunch2.workerChangeRequired, false);
assert.equal(release.postLaunch2.frontendOnly, true);

console.log('POST-LAUNCH.2 adaptive menu and viewport safety contract: PASS');
