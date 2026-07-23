import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const map = read('js/map.js');
const particles = read('js/particles.js');
const zombie = read('js/actors/procedural_zombie.js');
const helpers = read('js/maps/map_helpers.js');
const main = read('js/main.js');
const index = read('index.html');
const build = read('scripts/build_production.py');
const verifier = read('scripts/verify_launch2_build.py');
const updateDelivery = read('js/update_delivery_core.js');
const release = JSON.parse(read('release-version.json'));
const multiplayerRelease = JSON.parse(read('multiplayer-release.json'));

assert.equal(multiplayerRelease.releaseLabel, 'ENDGAME.1 R1 - High-Difficulty Operations');
assert.equal(release.releaseId, 'endgame1-r1-high-difficulty-operations');
assert.equal(release.productVersion, '1.11.0-endgame1-r1');
assert.equal(release.releaseSequence, 2026072301);
assert.equal(release.sourceBaselineSha, 'b99543d4f233d8d5284f48ae0c6df0d4a528a362');
assert.equal(release.workerChangeRequired, true);
assert.equal(release.workerBaselineSha, '2a038bef08f3d27a71159ac6ef597139acfc58b1');
assert.equal(release.baselineWorkerVersionId, '4f384856-891f-4563-b148-148c2f90cd98');

assert.match(map, /antialias:\s*QUALITY2_STARTUP_ANTIALIAS/);
assert.doesNotMatch(map, /antialias:\s*true,\s*\n\s*powerPreference/);
assert.match(map, /WEBGL_debug_renderer_info/);
assert.match(map, /softwareRenderingLikely/);
assert.match(map, /restartRequired/);
assert.match(map, /window\.KAQuality2Benchmark/);
assert.match(map, /pixelRatioCap:\s*1\.35/);
assert.match(map, /pixelRatioCap:\s*1\.75/);
assert.match(map, /bloomStrengthScale:\s*1\.0/);
assert.match(map, /bloomStrengthScale:\s*1\.12/);

assert.match(zombie, /new THREE\.MeshLambertMaterial/);
assert.match(zombie, /applyProceduralZombieQualityTier/);
assert.match(zombie, /quality2DetailTier/);
assert.match(zombie, /shouldQuality2ShowZombiePart/);
assert.match(zombie, /quality2-low-gpu-zombie-tier-r1/);

assert.match(helpers, /createQuality2MapMaterial/);
assert.match(helpers, /new THREE\.MeshLambertMaterial/);
assert.match(helpers, /quality2MaterialTier/);

assert.match(particles, /QUALITY2_LOW_PARTICLE_LIMITS/);
assert.match(particles, /activePoolLimits/);
assert.match(particles, /getParticlePerformanceSnapshot/);
assert.match(particles, /makeQuality2ParticleLitMaterial/);
assert.match(particles, /poolLimit\('blood'\)/);
assert.match(particles, /poolLimit\('shells'\)/);

for (const id of [
  'perf-quality',
  'perf-aa',
  'perf-zombie-tier',
  'perf-particle-tier',
  'perf-renderer'
]) {
  assert.match(index, new RegExp(`id=["']${id}["']`));
}
assert.match(main, /SOFTWARE WEBGL DETECTED/);
assert.match(main, /RELOAD TO APPLY FULL LOW-GPU RENDERER TIER/);
assert.match(main, /getParticlePerformanceSnapshot/);
assert.match(main, /getGraphicsPerformanceSnapshot/);

assert.equal(multiplayerRelease.quality2.mediumHighUnchanged, true);
assert.equal(multiplayerRelease.quality2.enemyPopulationUnchanged, true);
assert.equal(multiplayerRelease.quality2.staticGeometryMergingDeferred, true);
assert.equal(multiplayerRelease.quality2.workerChangeRequired, false);
assert.match(build, /QUALITY2_PATCH = 'quality2-r1-consolidated-low-gpu-rendering'/);
assert.match(build, /"quality2": \{/);
assert.match(verifier, /QUALITY\.2 production manifest patch mismatch/);
assert.match(updateDelivery, /endgame1-r1-high-difficulty-operations/);

console.log('QUALITY.2 consolidated Low-GPU source integration contract passed');
