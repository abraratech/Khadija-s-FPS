import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function count(fragment) {
  return html.split(fragment).length - 1;
}

for (const id of [
  'menu', 'map-select', 'diff-select', 'start-btn', 'ka-coop-menu-card',
  'graphics-quality-select', 'cloud-profile-settings-row', 'pause-screen',
  'death-screen', 'mobile-ui'
]) {
  assert.equal(count(`id="${id}"`), 1, `Expected exactly one #${id}`);
}

assert.equal(count('class="ka-game-rail"'), 1, 'Responsive game rail missing');
assert.equal(count('class="ka-menu-main"'), 1, 'Menu main wrapper missing');
assert.equal(count('class="ka-map-card'), 6, 'Expected six visual map cards');
assert.equal(count('data-preview-shot='), 6, 'Expected six large map preview shots');
assert.equal(count(' data-difficulty="'), 6, 'Expected six difficulty-labelled map cards');
assert.ok(html.includes('id="ka-cross-platform-overhaul"'), 'Overhaul CSS missing');
assert.ok(html.includes('@media (max-width: 920px)'), 'Laptop/tablet breakpoint missing');
assert.ok(html.includes('@media (max-width: 720px) and (orientation: landscape)'), 'Mobile landscape breakpoint missing');
assert.ok(html.includes(':focus-visible'), 'Controller/keyboard focus treatment missing');
assert.ok(html.includes('individual points, perks, weapons, and purchases'), 'Co-op economy copy is outdated');
assert.ok(html.includes('<script src="js/main.js" type="module"></script>'), 'Main gameplay module script was not preserved');

const assets = [
  'grid_bunker.webp', 'industrial_yard.webp', 'neon_depot.webp',
  'parking_garage.webp', 'hospital_wing.webp', 'reactor_courtyard.webp'
];
for (const file of assets) {
  const filePath = path.join(root, 'assets', 'ui', 'maps', file);
  const bytes = fs.readFileSync(filePath);
  assert.ok(bytes.length > 8000, `${file} is unexpectedly small`);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${file} is not RIFF/WebP`);
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${file} is not WebP`);
  assert.ok(html.includes(`assets/ui/maps/${file}`), `${file} is not referenced by index.html`);
}

console.log('cross-platform menu and arena visual contract: PASS');
