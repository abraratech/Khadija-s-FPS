import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../index.html');
const css = read('../css/menu.css');
const runtime = read('./update_delivery.js');
const core = read('./update_delivery_core.js');
const build = read('../scripts/build_production.py');
const verifier = read('../scripts/verify_launch2_build.py');
const headers = read('../_headers');
const release = JSON.parse(read('../release-version.json'));
const multiplayerRelease = JSON.parse(read('../multiplayer-release.json'));

assert.match(index, /js\/update_delivery\.js/);
assert.match(css, /#ka-update-ready|\.ka-update-ready/);
assert.match(runtime, /release-version\.json/);
assert.match(runtime, /cache:\s*'no-store'/);
assert.match(runtime, /shouldDeferUpdate\(getSafetyState\(\)\)/);
assert.match(runtime, /ka-coop-room-view/);
assert.match(runtime, /ka-matchmaking-status/);
assert.match(runtime, /BroadcastChannel/);
assert.match(runtime, /ka_release/);
assert.match(core, /NEWER_SEQUENCE/);
assert.match(core, /REMOTE_OLDER/);
assert.match(build, /release-version\.json/);
assert.match(build, /"_headers"/);
assert.match(verifier, /release-version\.json/);
assert.match(verifier, /Cache-Control/);
assert.match(headers, /\/index\.html[\s\S]*no-cache, no-store, must-revalidate/);
assert.equal(release.schema, 1);
assert.ok(release.releaseSequence >= 2026071801);
assert.match(core, new RegExp(release.releaseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(core, new RegExp(`releaseSequence:\\s*${release.releaseSequence}`));
assert.equal(multiplayerRelease.postLaunch4.patch, 'post-launch4-r1-update-delivery-cache-safety');
assert.equal(multiplayerRelease.postLaunch4.workerChangeRequired, false);

console.log('POST-LAUNCH.4 update delivery, cache safety, and deferred refresh contract: PASS');
