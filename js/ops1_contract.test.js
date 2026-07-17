import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/ops1.css', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('./ops1.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('./ops1_core.js', import.meta.url), 'utf8');
const release = JSON.parse(
  readFileSync(new URL('../multiplayer-release.json', import.meta.url), 'utf8')
);
const builder = readFileSync(
  new URL('../scripts/build_production.py', import.meta.url),
  'utf8'
);

assert.match(main, /initOps1Systems/);
assert.match(main, /from '\.\/ops1\.js'/);
assert.match(html, /id="ops1-telemetry-level"/);
assert.match(html, /id="ops1-crash-reporting"/);
assert.match(html, /id="ops1-health-refresh"/);
assert.match(html, /id="ops1-clear-local"/);
assert.match(html, /LIVE SERVICE/);
assert.doesNotMatch(html, /RELEASE CANDIDATE/);
assert.match(css, /#ops1-status/);
assert.match(runtime, /window\.addEventListener\('error'/);
assert.match(runtime, /window\.addEventListener\('unhandledrejection'/);
assert.match(runtime, /credentials: 'omit'/);
assert.match(runtime, /\/ops\/events/);
assert.match(runtime, /\/ops\/health/);
assert.match(core, /redactOpsText/);
assert.match(core, /OPS1_MAX_QUEUE = 24/);

assert.equal(release.patch, 'final2-r1-full-product-certification');
assert.equal(release.operations.patch, 'post-final6-r1-production-operations-hardening');
assert.equal(release.operations.rawIpStored, false);
assert.equal(release.operations.rawEmailStored, false);
assert.equal(release.operations.chatTranscriptCollectedByDefault, false);
assert.equal(release.operations.adminRoutesProtected, true);
assert.equal(release.operations.telemetryFailureBlocksGameplay, false);
assert.equal(release.productionHardening.voiceRuntimeRemoved, true);

assert.match(builder, /final2-r1-full-product-certification/);
assert.match(builder, /FINAL2_PRODUCTION_BUILD/);

console.log('ops1_contract tests passed');
