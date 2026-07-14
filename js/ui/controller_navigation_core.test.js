import assert from 'node:assert/strict';
import { classifyViewport, chooseDirectionalTarget, edgePressed, normalizeAxis } from './controller_navigation_core.js';

assert.equal(normalizeAxis(0.2), 0);
assert.equal(normalizeAxis(0.8), 1);
assert.equal(normalizeAxis(-0.8), -1);
assert.equal(edgePressed([{ pressed: true }], [{ pressed: false }], 0), true);
assert.equal(edgePressed([{ pressed: true }], [{ pressed: true }], 0), false);
assert.equal(classifyViewport(1920, 1080), 'wide');
assert.equal(classifyViewport(1366, 768), 'compact');
assert.equal(classifyViewport(1280, 520), 'handheld');

const current = { left: 100, top: 100, right: 180, bottom: 140, width: 80, height: 40 };
const right = { id: 'right', rect: { left: 220, top: 102, right: 300, bottom: 142, width: 80, height: 40 } };
const down = { id: 'down', rect: { left: 102, top: 200, right: 182, bottom: 240, width: 80, height: 40 } };
const diagonal = { id: 'diagonal', rect: { left: 210, top: 240, right: 290, bottom: 280, width: 80, height: 40 } };
assert.equal(chooseDirectionalTarget(current, [down, diagonal, right], 'right')?.id, 'right');
assert.equal(chooseDirectionalTarget(current, [right, diagonal, down], 'down')?.id, 'down');
assert.equal(chooseDirectionalTarget(current, [right], 'left'), null);

console.log('controller navigation core: PASS');
