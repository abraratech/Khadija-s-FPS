import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/ui9-responsive.css', 'utf8');
const runtime = fs.readFileSync('js/ui/cross_platform_input.js', 'utf8');
const core = fs.readFileSync('js/ui/controller_navigation_core.js', 'utf8');

assert.equal(index.split('css/ui9-responsive.css').length - 1, 1, 'UI.9 stylesheet must be linked exactly once');
assert.equal(index.split('js/ui/cross_platform_input.js').length - 1, 1, 'UI.9 runtime must be loaded exactly once');
assert.match(css, /UI\.9 — responsive HUD/);
assert.match(css, /#multiplayer-network-hud/);
assert.match(css, /#btn-mobile-pause/);
assert.match(css, /data-ka-input="gamepad"/);
assert.match(css, /data-ka-tv="true"/);
assert.match(css, /safe-area-inset-top/);
assert.match(css, /@media \(max-height: 470px\)/);
assert.match(runtime, /navigator\.getGamepads/);
assert.match(runtime, /gamepadconnected/);
assert.match(runtime, /chooseDirectionalTarget/);
assert.match(runtime, /data-next-screen/);
assert.match(runtime, /window\.KA_UI9_REPORT/);
assert.match(runtime, /CONTROLLER ACTIVE/);
assert.match(core, /classifyViewport/);
assert.match(core, /normalizeAxis/);
assert.doesNotMatch(runtime, /location\.reload/);
assert.doesNotMatch(runtime, /fetch\(/);

console.log('UI.9 responsive HUD and controller/TV contract: PASS');
