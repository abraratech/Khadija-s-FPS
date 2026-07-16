import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const authority = readFileSync(new URL('./progression_authority_core.js', import.meta.url), 'utf8');
const cloudHub = readFileSync(new URL('./cloud_profile_hub.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.ok(index.includes("url.pathname === '/live/manifest'"), 'Worker manifest route missing');
assert.ok(index.includes('resolveLive1Manifest(Date.now())'), 'Worker clock authority missing');
assert.ok(index.includes('clientClockTrusted: false'), 'Worker live security identity missing');
assert.ok(index.includes('live: LIVE1_SERVER_INFO'), 'health/release live identity missing');
assert.ok(authority.includes('applyLive1RunReceipt'), 'authoritative live receipt application missing');
assert.ok(authority.includes('resolveLive1Manifest(receipt.endedAt)'), 'receipt-time schedule validation missing');
assert.ok(authority.includes('liveManifestRevision'), 'manifest revision validation field missing');
assert.ok(authority.includes('liveSeasonPoints'), 'season point receipt result missing');
assert.ok(cloudHub.includes('/profiles/progression/commit'), 'protected progression endpoint missing');
assert.ok(packageJson.scripts.check.includes('src/live1_core.test.js'), 'Worker verification omitted LIVE.1 core');

console.log('LIVE.1 Worker contract tests passed');
