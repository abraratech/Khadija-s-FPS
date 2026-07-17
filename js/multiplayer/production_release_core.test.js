// js/multiplayer/production_release_core.test.js
// M4.55-M4.58 passkey account upgrade release coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
  MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
  MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
  MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
  MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL,
  MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH,
  MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH,
  MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH,
  MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM,
  MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS,
  createMultiplayerFrontendReleaseManifest,
  evaluateMultiplayerProductionRelease,
  normalizeMultiplayerReleaseEndpoint
} from './production_release_core.js';
import {
  POST_FINAL10_PATCH,
  POST_FINAL10_PRODUCT_VERSION,
  POST_FINAL10_SOURCE_BASELINE_SHA,
  POST_FINAL10_CERTIFIED_FRONTEND_BASELINE_SHA
} from '../postfinal10_core.js';
import {
  PVP1_CERTIFIED_FRONTEND_BASELINE_SHA,
  PVP1_MODE,
  PVP1_PATCH,
  PVP1_PRODUCT_VERSION,
  PVP1_SCHEMA,
  PVP1_SOURCE_BASELINE_SHA
} from './pvp1_core.js';
import {
  PVP2_CERTIFIED_FRONTEND_BASELINE_SHA,
  PVP2_FEATURE_FLAG,
  PVP2_MODE,
  PVP2_PATCH,
  PVP2_PRODUCT_VERSION,
  PVP2_PUBLIC_MATCHMAKING_ENABLED,
  PVP2_SCHEMA,
  PVP2_SOURCE_BASELINE_SHA
} from './pvp2_core.js';

assert.equal(MULTIPLAYER_PRODUCTION_RELEASE_PATCH, 'final2-r1-full-product-certification');
assert.equal(MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL, 6);
assert.equal(normalizeMultiplayerReleaseEndpoint('wss://example.workers.dev/ws?room=ABCDEF'), 'https://example.workers.dev/release');
assert.equal(normalizeMultiplayerReleaseEndpoint('example.workers.dev'), 'https://example.workers.dev/release');
const frontend = createMultiplayerFrontendReleaseManifest();
const releaseMetadata = JSON.parse(
  fs.readFileSync(
    new URL('../../multiplayer-release.json', import.meta.url),
    'utf8'
  )
);
assert.equal(
  MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
  releaseMetadata.certifiedBaselineSha
);
assert.equal(
  frontend.certifiedBaselineSha,
  releaseMetadata.certifiedBaselineSha
);
assert.equal(frontend.build, MULTIPLAYER_PRODUCTION_RELEASE_BUILD);
assert.equal(frontend.certifiedSourceSeal, MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL);
assert.equal(frontend.leaderboards.patch, MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH);
assert.equal(frontend.cloudProfiles.patch, MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH);
assert.equal(frontend.cloudProfiles.auth.patch, MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH);
assert.equal(frontend.cloudProfiles.auth.mechanism, MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM);
assert.deepEqual([...frontend.cloudProfiles.auth.algorithms], [...MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS]);
const version1Certification = {
  schema: 1,
  patch: POST_FINAL10_PATCH,
  productVersion: POST_FINAL10_PRODUCT_VERSION,
  sourceBaselineSha: POST_FINAL10_SOURCE_BASELINE_SHA,
  certifiedFrontendBaselineSha: POST_FINAL10_CERTIFIED_FRONTEND_BASELINE_SHA,
  certification: {
    javascriptSyntaxChecks: 388,
    frontendDeterministicTests: 137,
    workerDeterministicTests: 37,
    productionRuntimeFiles: 252,
    status: 'CERTIFIED'
  }
};
assert.deepEqual(frontend.version1Certification, version1Certification);
const pvp1 = {
  schema: PVP1_SCHEMA,
  patch: PVP1_PATCH,
  productVersion: PVP1_PRODUCT_VERSION,
  sourceBaselineSha: PVP1_SOURCE_BASELINE_SHA,
  certifiedFrontendBaselineSha: PVP1_CERTIFIED_FRONTEND_BASELINE_SHA,
  featureEnabled: true,
  featureFlag: 'PVP1_ENABLED',
  mode: PVP1_MODE,
  privateRooms: true,
  publicMatchmaking: false,
  supportedTeamSizes: [1, 2],
  bestOf: 5,
  roundsToWin: 3,
  serverAuthoritativeDamage: true,
  serverDistanceValidation: true,
  friendlyFireBlocked: true,
  separateWeaponBalance: true,
  aiEnemiesDisabled: true,
  aiWingmanDisabled: true,
  reviveDisabled: true,
  coopObjectivesDisabled: true,
  coopRewardReceiptsDisabled: true,
  reconnectGraceMs: 45000,
  hostMigrationPreserved: true,
  protocolUnchanged: true,
  workerChangeRequired: true,
  frontendOnly: false
};
assert.deepEqual(frontend.pvp1, pvp1);
assert.deepEqual(frontend.pvp1, releaseMetadata.pvp1);

const pvp2 = {
  schema: PVP2_SCHEMA,
  patch: PVP2_PATCH,
  productVersion: PVP2_PRODUCT_VERSION,
  sourceBaselineSha: PVP2_SOURCE_BASELINE_SHA,
  certifiedFrontendBaselineSha: PVP2_CERTIFIED_FRONTEND_BASELINE_SHA,
  featureFlag: PVP2_FEATURE_FLAG,
  publicMatchmakingEnabled: PVP2_PUBLIC_MATCHMAKING_ENABLED,
  mode: PVP2_MODE,
  publicMatchmaking: true,
  publicTeamSize: 1,
  privatePvpPreserved: true,
  regionFirstGlobalExpansion: true,
  noBackfill: true,
  noJoinInProgress: true,
  competitiveStatistics: true,
  competitiveLeaderboards: ['global', 'regional'],
  ratingSystem: 'elo-32',
  idempotentMatchResults: true,
  spawnProtectionMs: 2000,
  roundTimeoutMs: 90000,
  serverAuthoritativeTimeoutResolution: true,
  coopIsolationPreserved: true,
  soloIsolationPreserved: true,
  protocolUnchanged: true,
  workerChangeRequired: true,
  frontendOnly: false,
  endpoints: ['/pvp2/stats', '/pvp2/leaderboard']
};
assert.deepEqual(frontend.pvp2, pvp2);
assert.deepEqual(frontend.pvp2, releaseMetadata.pvp2);

const passing = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: 'CERTIFIED',
    version1Certification,
    pvp1,
    pvp2,
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    cloudProfiles: { schema: 1, patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH, authPatch: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH, authentication: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM, authAlgorithms: [...MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS] },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(passing.status, 'PASS');
assert.equal(passing.ready, true);
const pvpFeatureDisabled = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: 'CERTIFIED',
    version1Certification,
    pvp1: { ...pvp1, featureEnabled: false },
    pvp2,
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    cloudProfiles: { schema: 1, patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH, authPatch: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH, authentication: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM, authAlgorithms: [...MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS] },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(pvpFeatureDisabled.status, 'PASS');
assert.equal(pvpFeatureDisabled.ready, true);

const pvp2PublicQueueDisabled = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: 'CERTIFIED',
    version1Certification,
    pvp1,
    pvp2: { ...pvp2, publicMatchmakingEnabled: false },
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    cloudProfiles: { schema: 1, patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH, authPatch: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH, authentication: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM, authAlgorithms: [...MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS] },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(pvp2PublicQueueDisabled.status, 'PASS');
assert.equal(pvp2PublicQueueDisabled.ready, true);
const missingLeaderboard = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: 'CERTIFIED',
    version1Certification,
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
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: 'CERTIFIED',
    version1Certification,
    pvp1,
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(missingCloudProfiles.ready, false);
assert.equal(missingCloudProfiles.errors.some((item) => item.code === 'CLOUD_PROFILE_SCHEMA_MISMATCH'), true);
const missingPasskeyAuth = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: 'CERTIFIED',
    version1Certification,
    pvp1,
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    cloudProfiles: { schema: 1, patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(missingPasskeyAuth.ready, false);
assert.equal(missingPasskeyAuth.errors.some((item) => item.code === 'CLOUD_AUTH_PATCH_MISMATCH'), true);
const missingVersion1 = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: 'CERTIFIED',
    pvp1,
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    cloudProfiles: { schema: 1, patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH, authPatch: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH, authentication: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM, authAlgorithms: [...MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS] },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(missingVersion1.ready, false);
assert.equal(missingVersion1.errors.some((item) => item.code === 'VERSION1_PATCH_MISMATCH'), true);
const uncertifiedVersion1 = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: 'CERTIFIED',
    version1Certification: {
      ...version1Certification,
      certification: { ...version1Certification.certification, status: 'PENDING' }
    },
    pvp1,
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    cloudProfiles: { schema: 1, patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH, authPatch: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH, authentication: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM, authAlgorithms: [...MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS] },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(uncertifiedVersion1.ready, false);
assert.equal(uncertifiedVersion1.errors.some((item) => item.code === 'VERSION1_CERTIFICATION_STATUS_MISMATCH'), true);
const missingPvp1 = evaluateMultiplayerProductionRelease({
  frontendManifest: frontend,
  workerManifest: {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: 6,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedFrontendSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: 'CERTIFIED',
    version1Certification,
    leaderboards: { schema: 1, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH },
    cloudProfiles: { schema: 1, patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH, authPatch: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH, authentication: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM, authAlgorithms: [...MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS] },
    deployedAt: '2026-07-10T00:00:00.000Z'
  }
});
assert.equal(missingPvp1.ready, false);
assert.equal(missingPvp1.errors.some((item) => item.code === 'PVP1_PATCH_MISMATCH'), true);
console.log('production_release_core tests passed');
