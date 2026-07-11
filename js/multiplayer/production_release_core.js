// js/multiplayer/production_release_core.js
// M4.43-M4.46 hotfix — deterministic frontend/Worker release, leaderboard, and cloud-profile capability gate.

export const MULTIPLAYER_PRODUCTION_RELEASE_PATCH = 'm4-cloud-guest-sync-r1';
export const MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL = 6;
export const MULTIPLAYER_PRODUCTION_RELEASE_BUILD = 'm4-cloud-guest-sync-r1';
export const MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE = '26313435ba6a4fca62671d12b110d5367333a072';
export const MULTIPLAYER_PRODUCTION_RELEASE_STATUS = 'CERTIFIED';
export const MULTIPLAYER_PRODUCTION_WORKER_URL = 'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';
export const MULTIPLAYER_PRODUCTION_LEADERBOARD_SCHEMA = 1;
export const MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH = 'm4-online-leaderboards-r1';
export const MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_SCHEMA = 1;
export const MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH = 'm4-cloud-guest-sync-r1';

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
    releaseStatus: MULTIPLAYER_PRODUCTION_RELEASE_STATUS,
    workerUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
    leaderboards: Object.freeze({ schema: MULTIPLAYER_PRODUCTION_LEADERBOARD_SCHEMA, patch: MULTIPLAYER_PRODUCTION_LEADERBOARD_PATCH }),
    cloudProfiles: Object.freeze({ schema: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_SCHEMA, patch: MULTIPLAYER_PRODUCTION_CLOUD_PROFILE_PATCH })
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
    ['RELEASE_STATUS_MISMATCH','release status',cleanText(frontend.releaseStatus).toUpperCase(),cleanText(worker.releaseStatus,'missing').toUpperCase()],
    ['LEADERBOARD_SCHEMA_MISMATCH','leaderboard schema',finiteInteger(frontend.leaderboards?.schema),finiteInteger(worker.leaderboards?.schema,-1)],
    ['LEADERBOARD_PATCH_MISMATCH','leaderboard patch',cleanText(frontend.leaderboards?.patch),cleanText(worker.leaderboards?.patch,'missing')],
    ['CLOUD_PROFILE_SCHEMA_MISMATCH','cloud profile schema',finiteInteger(frontend.cloudProfiles?.schema),finiteInteger(worker.cloudProfiles?.schema,-1)],
    ['CLOUD_PROFILE_PATCH_MISMATCH','cloud profile patch',cleanText(frontend.cloudProfiles?.patch),cleanText(worker.cloudProfiles?.patch,'missing')]
  ]) if (expected !== received) errors.push(finding(code, `Frontend and Worker ${label} do not match.`, { expected, received }));
  if (!cleanText(worker.deployedAt)) warnings.push(finding('WORKER_DEPLOYED_AT_MISSING', 'The Worker release manifest does not include a deployment timestamp.'));
  const status = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';
  return Object.freeze({ status, ready: errors.length === 0, blocking: errors.length > 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings), frontend: Object.freeze({ ...frontend }), worker: Object.freeze({ ...worker }) });
}
