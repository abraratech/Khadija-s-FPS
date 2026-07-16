import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('js/main.js', 'utf8');
const runtime = readFileSync('js/live1.js', 'utf8');
const state = readFileSync('js/live1_state.js', 'utf8');
const progression = readFileSync('js/progression.js', 'utf8');
const progressionCore = readFileSync('js/progression_core.js', 'utf8');
const cloudProfile = readFileSync('js/cloud_profile.js', 'utf8');
const contentCore = readFileSync('js/content1_core.js', 'utf8');
const contentRuntime = readFileSync('js/content1.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const css = readFileSync('css/live1.css', 'utf8');
const release = JSON.parse(readFileSync('multiplayer-release.json', 'utf8'));
const builder = readFileSync('scripts/build_production.py', 'utf8');

assert.ok(main.includes("from './live1.js'"), 'main runtime must initialize LIVE.1');
assert.ok(main.includes('beginLive1Run({'), 'run start must freeze the live context');
assert.ok(main.includes('endLive1Run();'), 'run end must clear LIVE.1 runtime state');
assert.ok(runtime.includes('/live/manifest'), 'runtime must use the Worker live manifest');
assert.ok(runtime.includes('OFFLINE CACHED SCHEDULE'), 'offline schedule presentation missing');
assert.ok(state.includes('serverOffsetMs'), 'Worker time offset state missing');
assert.ok(progression.includes('applyLive1RunReceipt'), 'local protected-receipt mirror missing');
assert.ok(progression.includes('liveManifestRevision'), 'live receipt revision missing');
assert.ok(cloudProfile.includes('seasonPointsAward'), 'verified live season points status missing');
assert.ok(progressionCore.includes('TITLE_SEASONED_OPERATOR'), 'season reward catalog missing');
assert.ok(progressionCore.includes("requirement.type === 'LIVE_POINTS'"), 'season reward requirement missing');
assert.ok(contentCore.includes('featuredEncounterId'), 'CONTENT.1 live encounter integration missing');
assert.ok(contentRuntime.includes('getLive1RunDirective'), 'CONTENT.1 run directive integration missing');
assert.ok(html.includes('id="live1-screen"'), 'LIVE COMMAND menu screen missing');
assert.ok(html.includes('css/live1.css'), 'LIVE.1 stylesheet missing');
assert.ok(css.includes('.ka-live1-contract-grid'), 'season contract presentation missing');
assert.equal(release.patch, 'final2-r1-full-product-certification');
assert.equal(release.live.clientClockTrusted, false);
assert.equal(release.live.automaticProtectedClaims, true);
assert.ok(builder.includes('FINAL2_PRODUCTION_BUILD'), 'LIVE.1 production output missing');

console.log('LIVE.1 frontend contract tests passed');
