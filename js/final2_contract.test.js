// FINAL.2 full product certification contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = JSON.parse(fs.readFileSync(path.join(root, 'multiplayer-release.json'), 'utf8'));
const workerIndex = fs.readFileSync(path.join(root, 'multiplayer-server/src/index.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'scripts/build_production.py'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const patch = 'final2-r1-full-product-certification';
const seal = 'dbc459802c5b38e71870ea70016f6200a523bb96148a74f29b1b594f1257b26e';

assert.equal(release.patch, patch);
assert.equal(release.build, 'final2-consolidated-production-r1');
assert.equal(release.certifiedSourceSeal, seal);
assert.equal(release.fullProductCertification?.status, 'CERTIFIED');
assert.equal(release.fullProductCertification?.sourceSeal, seal);
assert.equal(release.fullProductCertification?.deterministicTests, 140);
assert.equal(release.fullProductCertification?.javascriptSyntaxChecks, 339);
assert.equal(release.fullProductCertification?.productionRuntimeFiles, 236);
assert.equal(release.fullProductCertification?.mapHeroChecks, 6);
assert.equal(release.fullProductCertification?.voiceRuntimeRemoved, true);
assert.equal(release.fullProductCertification?.secretsExcludedFromPages, true);
assert.match(workerIndex, new RegExp(`const SERVER_PATCH = '${patch}'`));
assert.match(workerIndex, new RegExp(`const CERTIFIED_SOURCE_SEAL = '${seal}'`));
assert.match(builder, new RegExp(`PATCH = \"${patch}\"`));
assert.match(builder, new RegExp(`SOURCE_SEAL = \"${seal}\"`));
assert.doesNotMatch(html, /microphone|getUserMedia|live_voice/i);
for (const forbidden of ['map_preview.html','weapon_preview.html','procedural_zombie_preview.html']) {
  assert.equal(fs.existsSync(path.join(root, forbidden)), false);
}
for (const required of ['grid_bunker','industrial_yard','neon_depot','parking_garage','hospital_wing','reactor_courtyard']) {
  const hero = path.join(root, `assets/ui/maps/${required}.webp`);
  assert.equal(fs.existsSync(hero), true, `missing map hero: ${required}`);
  assert.ok(fs.statSync(hero).size > 1000, `map hero too small: ${required}`);
}
console.log('FINAL.2 frontend certification contract: PASS');
