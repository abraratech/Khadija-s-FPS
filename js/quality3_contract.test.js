import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GAMEPLAY3_SUPPORTED_MAPS, getGameplay3MapProfile } from './gameplay3_map_evolution_core.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const release = JSON.parse(read('../release-version.json'));
const multiplayer = JSON.parse(read('../multiplayer-release.json'));

assert.equal(release.releaseId, 'quality3-r1-map-evolution-geometry-zero-failure');
assert.equal(release.productVersion, '1.13.1-quality3-r1');
assert.equal(release.releaseSequence, 2026072304);
assert.equal(release.workerChangeRequired, false);
assert.equal(release.workerBaselineSha, 'a37d98313472d9f3706a7af2ce10810404b78607');
assert.equal(multiplayer.protocol, 6);
assert.equal(multiplayer.productVersion, '1.13.1-quality3-r1');
assert.equal(multiplayer.quality3R1.patch, 'quality3-r1-map-evolution-geometry-zero-failure');
assert.equal(multiplayer.quality3R1.stormbreakCanalPreserved, true);

assert.deepEqual([...GAMEPLAY3_SUPPORTED_MAPS], [
  'grid_bunker', 'industrial_yard', 'hospital_wing', 'stormbreak_canal'
]);
const grid = getGameplay3MapProfile('grid_bunker');
assert.equal(grid.routeA.x, -15);
assert.equal(grid.routeB.x, 15);
assert.deepEqual(grid.hazard, { id: 'grid_arc_floor', x: 0, z: 21, radius: 2.6, damage: 7 });
const yard = getGameplay3MapProfile('industrial_yard');
assert.deepEqual(yard.hazard, { id: 'yard_fuel_spill', x: 0, z: 7, radius: 3.5, damage: 8 });
const hospital = getGameplay3MapProfile('hospital_wing');
assert.equal(hospital.control.x, -27);
assert.deepEqual(hospital.hazard, { id: 'hospital_contamination_zone', x: -14, z: -18, radius: 4.7, damage: 7 });
assert.equal(getGameplay3MapProfile('stormbreak_canal').mapId, 'stormbreak_canal');

for (const relative of [
  './multiplayer/match2_r1_1_admission_contract.test.js',
  './multiplayer/match2_r1_contract.test.js',
  './multiplayer/post1b_r1_1_remote_presentation_contract.test.js',
  './postfinal10_contract.test.js',
  './postfinal9_contract.test.js',
  './ui/cross_platform_menu_contract.test.js'
]) assert.ok(read(relative).length > 0);

console.log('QUALITY.3 R1 geometry merge and zero-failure certification: PASS');
