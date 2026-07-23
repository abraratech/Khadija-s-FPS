import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(
  new URL(relative, import.meta.url),
  'utf8'
);

const index = read('../index.html');
const accessibility = read('./accessibility.js');
const runtime = read('./postfinal10_runtime.js');
const core = read('./postfinal10_core.js');
const main = read('./main.js');
const particles = read('./particles.js');
const tacticalPing = read('./multiplayer/tactical_ping.js');
const releaseCore = read('./multiplayer/production_release_core.js');
const releaseRuntime = read('./multiplayer/production_release.js');
const hudCss = read('../css/hud.css');
const captionCss = read('../css/postfinal2.css');
const builder = read('../scripts/build_production.py');
const workerIndex = read('../multiplayer-server/src/index.js');
const release = JSON.parse(read('../multiplayer-release.json'));

for (const id of [
  'postfinal10-runtime-status',
  'text-scale-slider',
  'text-scale-current',
  'caption-scale-slider',
  'caption-scale-current',
  'color-vision-select',
  'focus-assist-select',
  'pause-text-scale-slider',
  'pause-text-scale-current',
  'pause-color-vision-select',
  'pause-high-contrast-select'
]) {
  assert.ok(index.includes(`id="${id}"`), `Missing Version 1.0 control: ${id}`);
}

assert.match(accessibility, /normalizePostFinal10Accessibility/);
assert.match(accessibility, /--ka-text-scale/);
assert.match(accessibility, /--ka-caption-scale/);
assert.match(accessibility, /resolveAccessibleSignalColor/);
assert.match(runtime, /createPostFinal10GovernorState/);
assert.match(runtime, /ka:postfinal10-runtime/);
assert.match(runtime, /KHADIJA_POST_FINAL10_RUNTIME/);
assert.match(main, /initPostFinal10Runtime/);
assert.match(main, /recordPostFinal10Frame/);
assert.match(particles, /getPostFinal10ParticleBudgetScale/);
assert.match(tacticalPing, /resolveAccessibleSignalColor/);
assert.match(tacticalPing, /pingSymbol/);
assert.match(releaseRuntime, /maximumAttempts = 3/);
assert.match(releaseRuntime, /postFinal10RetryDelay/);
assert.match(releaseCore, /version1Certification/);
assert.match(hudCss, /body\.ka-focus-assist/);
assert.match(hudCss, /data-ka-color-vision/);
assert.match(captionCss, /--ka-caption-scale/);
assert.match(core, /POST_FINAL10_PRODUCT_VERSION = '1\.0\.0'/);

assert.equal(release.protocol, 6);
assert.equal(typeof release.productVersion, 'string');
assert.ok(release.productVersion.length > 0);
assert.equal(release.postFinal10.productVersion, '1.0.0');
assert.equal(
  release.certifiedBaselineSha,
  '5511d393d7249b5487affa3616716ccb64593e99'
);
assert.equal(
  release.postFinal10.patch,
  'post-final10-r1-version1-stabilization-accessibility-performance'
);
assert.equal(
  release.postFinal10.sourceBaselineSha,
  '56e98d32e0bf2587a592e1e45faab218bbfbfda4'
);
assert.equal(release.postFinal10.workerChangeRequired, true);
assert.equal(release.postFinal10.frontendOnly, false);
assert.equal(release.postFinal10.accessibility.colorVisionModes, 5);
assert.equal(release.postFinal10.certification.javascriptSyntaxChecks, 388);
assert.equal(release.postFinal10.certification.frontendDeterministicTests, 137);
assert.equal(release.postFinal10.certification.workerDeterministicTests, 37);
assert.equal(release.postFinal10.certification.productionRuntimeFiles, 252);
assert.match(workerIndex, /version1Certification: POST_FINAL10_SERVER_INFO/);
assert.match(builder, /POST_FINAL10_PRODUCT_VERSION/);
assert.match(builder, /"post_final10"/);
assert.match(builder, /"worker_change_required": True/);

console.log('POST-FINAL.10 combined Version 1.0 contract passed');
