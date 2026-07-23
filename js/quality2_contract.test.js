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

assert.equal(multiplayerRelease.releaseLabel, 'QUALITY.3 R1 - Map Evolution Geometry and Zero-Failure Certification');
assert.equal(release.releaseId, 'quality3-r1-map-evolution-geometry-zero-failure');
assert.equal(release.productVersion, '1.13.1-quality3-r1');
assert.equal(release.releaseSequence, 2026072304);
assert.equal(release.sourceBaselineSha, '0a1533493e3e3a5d86db698be3972510ef41c5b1');
assert.equal(release.workerChangeRequired, false);
assert.equal(release.workerBaselineSha, 'a37d98313472d9f3706a7af2ce10810404b78607');
assert.equal(release.baselineWorkerVersionId, '6243d37c-191f-4a06-b6a7-b2e60c2a768a');

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
assert.match(updateDelivery, /quality3-r1-map-evolution-geometry-zero-failure/);

console.log('QUALITY.2 consolidated Low-GPU source integration contract passed');
