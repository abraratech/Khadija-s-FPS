import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

assert.match(index, /const POST_FINAL10_SERVER_INFO = Object\.freeze/);
assert.match(index, /patch: 'post-final10-r1-version1-stabilization-accessibility-performance'/);
assert.match(index, /productVersion: '1\.0\.0'/);
assert.match(index, /sourceBaselineSha: '56e98d32e0bf2587a592e1e45faab218bbfbfda4'/);
assert.match(index, /certifiedFrontendBaselineSha: CERTIFIED_FRONTEND_SHA/);
assert.match(index, /colorVisionModes: 5/);
assert.match(index, /releasePreflightRetries: 3/);
assert.match(index, /finalProductCertification: 'VERSION_1_0'/);
assert.match(index, /javascriptSyntaxChecks: 388/);
assert.match(index, /frontendDeterministicTests: 137/);
assert.match(index, /workerDeterministicTests: 37/);
assert.match(index, /productionRuntimeFiles: 252/);
assert.equal((index.match(/version1Certification: POST_FINAL10_SERVER_INFO/g) || []).length, 2);
assert.equal(packageJson.version, '1.0.0');
assert.match(packageJson.scripts.check, /postfinal10_contract\.test\.js/);

console.log('POST-FINAL.10 Worker Version 1.0 contract tests passed');
