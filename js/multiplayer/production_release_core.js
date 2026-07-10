// js/multiplayer/production_release_core.js
// M3.79-M3.80 — deterministic certified frontend/Worker release compatibility gate.

export const MULTIPLAYER_PRODUCTION_RELEASE_PATCH = 'm3-production-release-manifest-r1';
export const MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL = 6;
export const MULTIPLAYER_PRODUCTION_RELEASE_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE =
  '3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b';
export const MULTIPLAYER_PRODUCTION_RELEASE_STATUS = 'CERTIFIED';
export const MULTIPLAYER_PRODUCTION_WORKER_URL =
  'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';

function cleanText(value, fallback = '', limit = 300) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function finding(code, message, details = {}) {
  return Object.freeze({
    code,
    message,
    details: Object.freeze({ ...details })
  });
}

export function normalizeMultiplayerReleaseEndpoint(serverUrl) {
  const raw = cleanText(
    serverUrl,
    MULTIPLAYER_PRODUCTION_WORKER_URL,
    1000
  );
  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  const url = new URL(candidate);
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new TypeError(
      'Multiplayer release endpoint must use HTTPS, HTTP, WSS, or WS.'
    );
  }

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
    workerUrl: MULTIPLAYER_PRODUCTION_WORKER_URL
  });
}

export function evaluateMultiplayerProductionRelease({
  workerManifest = null,
  frontendManifest = createMultiplayerFrontendReleaseManifest()
} = {}) {
  const errors = [];
  const warnings = [];
  const worker = workerManifest && typeof workerManifest === 'object'
    ? workerManifest
    : {};
  const frontend = frontendManifest && typeof frontendManifest === 'object'
    ? frontendManifest
    : {};

  if (worker.ok !== true) {
    errors.push(finding(
      'WORKER_RELEASE_NOT_OK',
      'The Worker release manifest did not report ok=true.'
    ));
  }
  if (cleanText(worker.service) !== 'khadijas-arena-multiplayer') {
    errors.push(finding(
      'WORKER_SERVICE_MISMATCH',
      'The release endpoint is not the Khadija’s Arena multiplayer service.',
      { received: cleanText(worker.service, 'missing') }
    ));
  }

  for (const [code, label, expected, received] of [
    [
      'PROTOCOL_MISMATCH',
      'protocol',
      finiteInteger(frontend.protocol),
      finiteInteger(worker.protocol, -1)
    ],
    [
      'BUILD_MISMATCH',
      'build',
      cleanText(frontend.build),
      cleanText(worker.build, 'missing')
    ],
    [
      'PATCH_MISMATCH',
      'patch',
      cleanText(frontend.patch),
      cleanText(worker.patch, 'missing')
    ],
    [
      'CERTIFIED_BASELINE_MISMATCH',
      'certified frontend baseline',
      cleanText(frontend.certifiedBaselineSha),
      cleanText(worker.certifiedFrontendSha, 'missing')
    ],
    [
      'RELEASE_STATUS_MISMATCH',
      'release status',
      cleanText(frontend.releaseStatus).toUpperCase(),
      cleanText(worker.releaseStatus, 'missing').toUpperCase()
    ]
  ]) {
    if (expected !== received) {
      errors.push(finding(
        code,
        `Frontend and Worker ${label} do not match.`,
        { expected, received }
      ));
    }
  }

  if (!cleanText(worker.deployedAt)) {
    warnings.push(finding(
      'WORKER_DEPLOYED_AT_MISSING',
      'The Worker release manifest does not include a deployment timestamp.'
    ));
  }

  const status = errors.length > 0
    ? 'FAIL'
    : warnings.length > 0
      ? 'WARN'
      : 'PASS';

  return Object.freeze({
    status,
    ready: errors.length === 0,
    blocking: errors.length > 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    frontend: Object.freeze({ ...frontend }),
    worker: Object.freeze({ ...worker })
  });
}
