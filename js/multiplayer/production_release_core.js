// js/multiplayer/production_release_core.js
// M4.55-M4.58 — deterministic frontend/Worker release, cloud-profile, and passkey-authentication capability gate.

import {
  POST_FINAL10_PATCH,
  POST_FINAL10_PRODUCT_VERSION,
  POST_FINAL10_SOURCE_BASELINE_SHA,
  POST_FINAL10_CERTIFIED_FRONTEND_BASELINE_SHA
} from '../postfinal10_core.js';
import {
  PVP1_CERTIFIED_FRONTEND_BASELINE_SHA,
  PVP1_FEATURE_ENABLED,
  PVP1_MODE,
  PVP1_PATCH,
  PVP1_PRODUCT_VERSION,
  PVP1_SCHEMA,
  PVP1_SOURCE_BASELINE_SHA
} from './pvp1_core.js';

export const MULTIPLAYER_PRODUCTION_RELEASE_PATCH = 'final2-r1-full-product-certification';
export const MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL = 6;
export const MULTIPLAYER_PRODUCTION_RELEASE_BUILD = 'final2-consolidated-production-r1';
export const MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE = '5511d393d7249b5487affa3616716ccb64593e99';
export const MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL = 'dbc459802c5b38e71870ea70016f6200a523bb96148a74f29b1b594f1257b26e';
export const MULTIPLAYER_PRODUCTION_RELEASE_STATUS = 'CERTIFIED';
export const MULTIPLAYER_PRODUCTION_WORKER_URL = 'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';
export const MULTIPLAYER_PRODUCTION_LEADERBOARD_SCHEMA = 1;
export const MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH = 'm4-online-leaderboards-r1';
export const MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_SCHEMA = 1;
export const MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH = 'm4-final-player-polish-r1';
export const MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH = 'm4-final-player-polish-r1';
export const MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM = 'passkey';
export const MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS = Object.freeze(['ES256', 'RS256']);

function cleanText(value, fallback = '', limit = 300) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}
function finiteInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}
function finding(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}
export function normalizeMultiplayerReleaseEndpoint(serverUrl) {
  const raw = cleanText(serverUrl, MULTIPLAYER_PRODUCTION_WORKER_URL, 1000);
  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  const url = new URL(candidate);
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (!['https:', 'http:'].includes(url.protocol)) throw new TypeError('Multiplayer release endpoint must use HTTPS, HTTP, WSS, or WS.');
  url.pathname = '/release';
  url.search = '';
  url.hash = '';
  return url.toString();
}
export function createMultiplayerFrontendReleaseManifest() {
  return Object.freeze({
    ok: true,
    service: 'khadijas-arena-frontend',
    protocol: MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL,
    build: MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
    patch: MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
    certifiedBaselineSha: MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE,
    certifiedSourceSeal: MULTIPLAYER_PRODUCTION_CERTIFIED_SOURCE_SEAL,
    releaseStatus: MULTIPLAYER_PRODUCTION_RELEASE_STATUS,
    workerUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
    leaderboards: Object.freeze({ schema: MULTIPLAYER_PRODUCTION_LEADERBOARD_SCHEMA, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH }),
    cloudProfiles: Object.freeze({
      schema: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_SCHEMA,
      patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH,
      auth: Object.freeze({
        patch: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_PATCH,
        mechanism: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_MECHANISM,
        algorithms: MULTIPLAYER_PRODUCTION_CLOUD_AUTH_ALGORITHMS
      })
    }),
    version1Certification: Object.freeze({
      schema: 1,
      patch: POST_FINAL10_PATCH,
      productVersion: POST_FINAL10_PRODUCT_VERSION,
      sourceBaselineSha: POST_FINAL10_SOURCE_BASELINE_SHA,
      certifiedFrontendBaselineSha: POST_FINAL10_CERTIFIED_FRONTEND_BASELINE_SHA,
      certification: Object.freeze({
        javascriptSyntaxChecks: 388,
        frontendDeterministicTests: 137,
        workerDeterministicTests: 37,
        productionRuntimeFiles: 252,
        status: 'CERTIFIED'
      })
    }),
    pvp1: Object.freeze({
      schema: PVP1_SCHEMA,
      patch: PVP1_PATCH,
      productVersion: PVP1_PRODUCT_VERSION,
      sourceBaselineSha: PVP1_SOURCE_BASELINE_SHA,
      certifiedFrontendBaselineSha: PVP1_CERTIFIED_FRONTEND_BASELINE_SHA,
      featureEnabled: PVP1_FEATURE_ENABLED,
      featureFlag: 'PVP1_ENABLED',
      mode: PVP1_MODE,
      privateRooms: true,
      publicMatchmaking: false,
      supportedTeamSizes: Object.freeze([1, 2]),
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
    })
  });
}
export function evaluateMultiplayerProductionRelease({ workerManifest = null, frontendManifest = createMultiplayerFrontendReleaseManifest() } = {}) {
  const errors = [];
  const warnings = [];
  const worker = workerManifest && typeof workerManifest === 'object' ? workerManifest : {};
  const frontend = frontendManifest && typeof frontendManifest === 'object' ? frontendManifest : {};
  if (worker.ok !== true) errors.push(finding('WORKER_RELEASE_NOT_OK', 'The Worker release manifest did not report ok=true.'));
  if (cleanText(worker.service) !== 'khadijas-arena-multiplayer') errors.push(finding('WORKER_SERVICE_MISMATCH', 'The release endpoint is not the Khadija’s Arena multiplayer service.', { received: cleanText(worker.service, 'missing') }));
  for (const [code, label, expected, received] of [
    ['PROTOCOL_MISMATCH','protocol',finiteInteger(frontend.protocol),finiteInteger(worker.protocol,-1)],
    ['BUILD_MISMATCH','build',cleanText(frontend.build),cleanText(worker.build,'missing')],
    ['PATCH_MISMATCH','patch',cleanText(frontend.patch),cleanText(worker.patch,'missing')],
    ['CERTIFIED_BASELINE_MISMATCH','certified frontend baseline',cleanText(frontend.certifiedBaselineSha),cleanText(worker.certifiedFrontendSha,'missing')],
    ['CERTIFIED_SOURCE_SEAL_MISMATCH','certified source seal',cleanText(frontend.certifiedSourceSeal),cleanText(worker.certifiedSourceSeal,'missing')],
    ['RELEASE_STATUS_MISMATCH','release status',cleanText(frontend.releaseStatus).toUpperCase(),cleanText(worker.releaseStatus,'missing').toUpperCase()],
    ['LEADERBOARD_SCHEMA_MISMATCH','leaderboard schema',finiteInteger(frontend.leaderboards?.schema),finiteInteger(worker.leaderboards?.schema,-1)],
    ['LEADERBOARD_PATCH_MISMATCH','leaderboard patch',cleanText(frontend.leaderboards?.patch),cleanText(worker.leaderboards?.patch,'missing')],
    ['CLOUD_PROFILE_SCHEMA_MISMATCH','cloud profile schema',finiteInteger(frontend.cloudProfiles?.schema),finiteInteger(worker.cloudProfiles?.schema,-1)],
    ['CLOUD_PROFILE_PATCH_MISMATCH','cloud profile patch',cleanText(frontend.cloudProfiles?.patch),cleanText(worker.cloudProfiles?.patch,'missing')],
    ['CLOUD_AUTH_PATCH_MISMATCH','cloud authentication patch',cleanText(frontend.cloudProfiles?.auth?.patch),cleanText(worker.cloudProfiles?.authPatch,'missing')],
    ['CLOUD_AUTH_MECHANISM_MISMATCH','cloud authentication mechanism',cleanText(frontend.cloudProfiles?.auth?.mechanism),cleanText(worker.cloudProfiles?.authentication,'missing')],
    ['CLOUD_AUTH_ALGORITHMS_MISMATCH','cloud authentication algorithms',
      [...(frontend.cloudProfiles?.auth?.algorithms || [])].map((entry) => cleanText(entry)).sort().join(','),
      [...(worker.cloudProfiles?.authAlgorithms || [])].map((entry) => cleanText(entry)).sort().join(',')],
    ['VERSION1_PATCH_MISMATCH','Version 1.0 certification patch',cleanText(frontend.version1Certification?.patch),cleanText(worker.version1Certification?.patch,'missing')],
    ['VERSION1_PRODUCT_VERSION_MISMATCH','Version 1.0 product version',cleanText(frontend.version1Certification?.productVersion),cleanText(worker.version1Certification?.productVersion,'missing')],
    ['VERSION1_SOURCE_BASELINE_MISMATCH','Version 1.0 source baseline',cleanText(frontend.version1Certification?.sourceBaselineSha),cleanText(worker.version1Certification?.sourceBaselineSha,'missing')],
    ['VERSION1_CERTIFIED_FRONTEND_BASELINE_MISMATCH','Version 1.0 certified frontend baseline',cleanText(frontend.version1Certification?.certifiedFrontendBaselineSha),cleanText(worker.version1Certification?.certifiedFrontendBaselineSha,'missing')],
    ['VERSION1_CERTIFICATION_STATUS_MISMATCH','Version 1.0 certification status',cleanText(frontend.version1Certification?.certification?.status).toUpperCase(),cleanText(worker.version1Certification?.certification?.status,'missing').toUpperCase()],
    ['VERSION1_JAVASCRIPT_CHECK_COUNT_MISMATCH','Version 1.0 JavaScript syntax-check count',finiteInteger(frontend.version1Certification?.certification?.javascriptSyntaxChecks),finiteInteger(worker.version1Certification?.certification?.javascriptSyntaxChecks,-1)],
    ['VERSION1_FRONTEND_TEST_COUNT_MISMATCH','Version 1.0 frontend deterministic-test count',finiteInteger(frontend.version1Certification?.certification?.frontendDeterministicTests),finiteInteger(worker.version1Certification?.certification?.frontendDeterministicTests,-1)],
    ['VERSION1_WORKER_TEST_COUNT_MISMATCH','Version 1.0 Worker deterministic-test count',finiteInteger(frontend.version1Certification?.certification?.workerDeterministicTests),finiteInteger(worker.version1Certification?.certification?.workerDeterministicTests,-1)],
    ['VERSION1_RUNTIME_FILE_COUNT_MISMATCH','Version 1.0 production runtime-file count',finiteInteger(frontend.version1Certification?.certification?.productionRuntimeFiles),finiteInteger(worker.version1Certification?.certification?.productionRuntimeFiles,-1)],
    ['PVP1_SCHEMA_MISMATCH','PvP schema',finiteInteger(frontend.pvp1?.schema),finiteInteger(worker.pvp1?.schema,-1)],
    ['PVP1_PATCH_MISMATCH','PvP patch',cleanText(frontend.pvp1?.patch),cleanText(worker.pvp1?.patch,'missing')],
    ['PVP1_PRODUCT_VERSION_MISMATCH','PvP product version',cleanText(frontend.pvp1?.productVersion),cleanText(worker.pvp1?.productVersion,'missing')],
    ['PVP1_SOURCE_BASELINE_MISMATCH','PvP source baseline',cleanText(frontend.pvp1?.sourceBaselineSha),cleanText(worker.pvp1?.sourceBaselineSha,'missing')],
    ['PVP1_CERTIFIED_FRONTEND_BASELINE_MISMATCH','PvP certified frontend baseline',cleanText(frontend.pvp1?.certifiedFrontendBaselineSha),cleanText(worker.pvp1?.certifiedFrontendBaselineSha,'missing')],
    ['PVP1_MODE_MISMATCH','PvP room mode',cleanText(frontend.pvp1?.mode),cleanText(worker.pvp1?.mode,'missing')],
    ['PVP1_PRIVATE_ROOM_POLICY_MISMATCH','PvP private-room policy',frontend.pvp1?.privateRooms === true,worker.pvp1?.privateRooms === true],
    ['PVP1_PUBLIC_MATCHMAKING_POLICY_MISMATCH','PvP public-matchmaking policy',frontend.pvp1?.publicMatchmaking === true,worker.pvp1?.publicMatchmaking === true],
    ['PVP1_SERVER_DAMAGE_POLICY_MISMATCH','PvP server-authoritative damage policy',frontend.pvp1?.serverAuthoritativeDamage === true,worker.pvp1?.serverAuthoritativeDamage === true],
    ['PVP1_FRIENDLY_FIRE_POLICY_MISMATCH','PvP friendly-fire policy',frontend.pvp1?.friendlyFireBlocked === true,worker.pvp1?.friendlyFireBlocked === true]
  ]) if (expected !== received) errors.push(finding(code, `Frontend and Worker ${label} do not match.`, { expected, received }));
  if (!cleanText(worker.deployedAt)) warnings.push(finding('WORKER_DEPLOYED_AT_MISSING', 'The Worker release manifest does not include a deployment timestamp.'));
  const status = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';
  return Object.freeze({ status, ready: errors.length === 0, blocking: errors.length > 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings), frontend: Object.freeze({ ...frontend }), worker: Object.freeze({ ...worker }) });
}
