import fs from 'node:fs';
import assert from 'node:assert/strict';

const css = fs.readFileSync('css/multiplayer.css', 'utf8');

function requireFragment(fragment, label) {
  assert.ok(css.includes(fragment), `${label} missing`);
}

assert.equal(css.split('UI.5: centered, font-independent co-op modal close control').length - 1, 1,
  'UI.5 close-control patch must appear exactly once');
requireFragment('.ka-coop-card button.ka-coop-icon-btn {', 'specific close-button override');
requireFragment('display: inline-grid;', 'centering layout');
requireFragment('place-items: center;', 'two-axis centering');
requireFragment('padding: 0;', 'generic button padding reset');
requireFragment('font-size: 0;', 'font glyph suppression');
requireFragment('.ka-coop-card button.ka-coop-icon-btn::before,', 'drawn X first stroke');
requireFragment('.ka-coop-card button.ka-coop-icon-btn::after {', 'drawn X second stroke');
requireFragment('rotate(45deg)', 'positive X stroke');
requireFragment('rotate(-45deg)', 'negative X stroke');
requireFragment(':focus-visible', 'keyboard/controller focus treatment');

const genericRule = css.indexOf('.ka-coop-card button {');
const fixRule = css.indexOf('.ka-coop-card button.ka-coop-icon-btn {');
assert.ok(genericRule >= 0 && fixRule > genericRule,
  'specific close-button rule must come after the generic co-op button rule');

console.log('multiplayer modal close-control contract: PASS');
