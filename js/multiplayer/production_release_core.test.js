// js/multiplayer/production_release_core.test.js
// M4.47-M4.50 cloud account security release coverage.
import assert from 'node:assert/strict';
import {
  MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
  MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
  MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
  MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL,
  MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH,
  MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH,
  createMultiplayerFrontendReleaseManifest,
  evaluateMultiplayerProductionRelease,
  normalizeMultiplayerReleaseEndpoint
} from './production_release_core.js';

assert.equal(MULTIPLAYER_PRODUCTION_RELEASE_PATCH, 'm4-cloud-sync-reliability-r1');
assert.equal(MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL, 6);
assert.equal(normalizeMultiplayerReleaseEndpoint('wss://example.workers.dev/ws?room=ABCDEF'), 'https://example.workers.dev/release');
assert.equal(normalizeMultiplayerReleaseEndpoint('example.workers.dev'), 'https://example.workers.dev/release');
const frontend = createMultiplayerFrontendReleaseManifest();
assert.equal(frontend.build, MULTIPLAYER_PRODUCTION_RELEASE_BUILD);
assert.equal(frontend.leaderboards.patch, MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH);
assert.equal(frontend.cloudProfiles.patch, MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH);
const passing = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    releaseStatus: 'CERTIFIED',
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    cloudProfiles: { schema: 1, patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(passing.status, 'PASS');
assert.equal(passing.ready, true);
const missingLeaderboard = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    releaseStatus: 'CERTIFIED',
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(missingLeaderboard.ready, false);
assert.equal(missingLeaderboard.errors.some((item) => item.code === 'LEADERBOARD_SCHEMA_MISMATCH'), true);
const missingCloudProfiles = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    releaseStatus: 'CERTIFIED',
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(missingCloudProfiles.ready, false);
assert.equal(missingCloudProfiles.errors.some((item) => item.code === 'CLOUD_PROFILE_SCHEMA_MISMATCH'), true);
console.log('production_release_core tests passed');
