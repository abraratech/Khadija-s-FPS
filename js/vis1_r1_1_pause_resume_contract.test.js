import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const index = read('index.html');
const main = read('js/main.js');
const responsive = read('css/ui9-responsive.css');
const release = JSON.parse(read('multiplayer-release.json'));

assert.match(index, /id="resume-btn"/);
assert.match(main, /pauseScreen\.scrollTop = 0/);
assert.match(main, /resume-btn'\)\?\.focus\(\{ preventScroll: true \}\)/);
assert.match(responsive, /VIS\.1 R1\.1 — keep the primary Pause action visible/);
assert.match(responsive, /@media \(min-width: 921px\) and \(min-height: 561px\)/);
assert.match(responsive, /#pause-screen \{[\s\S]*?justify-content: flex-start !important/);
assert.match(responsive, /#resume-btn \{[\s\S]*?position: sticky !important/);
assert.equal(release.vis1?.pauseResumeVisibilityHotfix, 'vis1-r1-1-pause-resume-visibility');
assert.equal(release.vis1?.desktopPauseTopAligned, true);
assert.equal(release.vis1?.resumeActionSticky, true);
assert.equal(release.vis1?.pauseScrollResetOnOpen, true);

console.log('VIS.1 R1.1 Pause Resume visibility contract: PASS');
