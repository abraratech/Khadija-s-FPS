// js/multiplayer/public_deployment_acceptance_core.js
// M3.85-M3.86 — deterministic public Pages deployment acceptance evaluator.

export const PUBLIC_DEPLOYMENT_ACCEPTANCE_PATCH = 'm3-public-deployment-acceptance-r1';
export const PUBLIC_DEPLOYMENT_ACCEPTANCE_BASELINE_SHA = '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250';
export const PUBLIC_DEPLOYMENT_ACCEPTANCE_PROTOCOL = 6;
export const PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD = 'm3-team-final-world-reconnect-r3';
export const PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH = 'm3-production-release-manifest-r1';
export const PUBLIC_DEPLOYMENT_ACCEPTANCE_CERTIFIED_FRONTEND_SHA = '3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b';
export const PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_STATUS = 'CERTIFIED';
export const PUBLIC_DEPLOYMENT_ACCEPTANCE_WORKER_URL = 'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';
export const PUBLIC_DEPLOYMENT_ACCEPTANCE_UI_READY_TEXT = 'CERTIFIED MULTIPLAYER SERVER READY';

export const PUBLIC_DEPLOYMENT_ACCEPTANCE_RESTRICTED_GLOBALS = Object.freeze([
  'KHADIJA_MULTIPLAYER_FINAL_CERTIFICATION',
  'KHADIJA_MULTIPLAYER_CERTIFICATION_PAIRING',
  'KHADIJA_MULTIPLAYER_CERTIFICATION_SESSION'
]);

function cleanText(value, fallback = '', limit = 500) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteInteger(value, fallback = -1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function finding(code, message, details = {}) {
  return Object.freeze({
    code,
    message,
    details: Object.freeze({ ...details })
  });
}

function normalizedOrigin(value) {
  try {
    return new URL(String(value || '')).origin;
  } catch {
    return '';
  }
}

function isLoopbackHostname(hostname) {
  const host = cleanText(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.localhost');
}

function identity(value, certifiedField = 'certifiedBaselineSha') {
  const item = value && typeof value === 'object' ? value : {};
  return Object.freeze({
    ok: item.ok === true,
    service: cleanText(item.service),
    protocol: finiteInteger(item.protocol),
    build: cleanText(item.build),
    patch: cleanText(item.patch),
    certifiedSha: cleanText(item[certifiedField]),
    releaseStatus: cleanText(item.releaseStatus).toUpperCase()
  });
}

export function normalizePublicDeploymentAcceptanceWorkerReleaseEndpoint(serverUrl) {
  const raw = cleanText(
    serverUrl,
    PUBLIC_DEPLOYMENT_ACCEPTANCE_WORKER_URL,
    1000
  );
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`;
  const url = new URL(candidate);
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new TypeError('Worker release endpoint must use HTTPS, HTTP, WSS, or WS.');
  }
  url.pathname = '/release';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function createExpectedPublicDeploymentAcceptanceManifest() {
  return Object.freeze({
    ok: true,
    service: 'khadijas-arena-public-deployment-acceptance',
    patch: PUBLIC_DEPLOYMENT_ACCEPTANCE_PATCH,
    consolidatedBaselineSha: PUBLIC_DEPLOYMENT_ACCEPTANCE_BASELINE_SHA,
    protocol: PUBLIC_DEPLOYMENT_ACCEPTANCE_PROTOCOL,
    build: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
    releasePatch: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
    certifiedFrontendSha: PUBLIC_DEPLOYMENT_ACCEPTANCE_CERTIFIED_FRONTEND_SHA,
    releaseStatus: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_STATUS,
    workerUrl: PUBLIC_DEPLOYMENT_ACCEPTANCE_WORKER_URL,
    pagePath: '/public-deployment-acceptance.html'
  });
}

export function evaluatePublicDeploymentAcceptance({
  acceptanceManifest = null,
  frontendManifest = null,
  workerManifest = null,
  pageUrl = '',
  runtimeAudit = '',
  activeRestrictedGlobals = [],
  uiStatusText = '',
  gameBuild = '',
  gamePatch = '',
  manualProof = null
} = {}) {
  const errors = [];
  const warnings = [];
  const pending = [];
  const expectedAcceptance = createExpectedPublicDeploymentAcceptanceManifest();
  const acceptance = acceptanceManifest && typeof acceptanceManifest === 'object'
    ? acceptanceManifest
    : {};
  const frontend = frontendManifest && typeof frontendManifest === 'object'
    ? frontendManifest
    : {};
  const worker = workerManifest && typeof workerManifest === 'object'
    ? workerManifest
    : {};
  const manual = manualProof && typeof manualProof === 'object'
    ? manualProof
    : {};

  for (const [field, expected, received] of [
    ['ok', true, acceptance.ok === true],
    ['service', expectedAcceptance.service, cleanText(acceptance.service)],
    ['patch', expectedAcceptance.patch, cleanText(acceptance.patch)],
    ['consolidatedBaselineSha', expectedAcceptance.consolidatedBaselineSha, cleanText(acceptance.consolidatedBaselineSha)],
    ['protocol', expectedAcceptance.protocol, finiteInteger(acceptance.protocol)],
    ['build', expectedAcceptance.build, cleanText(acceptance.build)],
    ['releasePatch', expectedAcceptance.releasePatch, cleanText(acceptance.releasePatch)],
    ['certifiedFrontendSha', expectedAcceptance.certifiedFrontendSha, cleanText(acceptance.certifiedFrontendSha)],
    ['releaseStatus', expectedAcceptance.releaseStatus, cleanText(acceptance.releaseStatus).toUpperCase()],
    ['workerUrl', normalizedOrigin(expectedAcceptance.workerUrl), normalizedOrigin(acceptance.workerUrl)],
    ['pagePath', expectedAcceptance.pagePath, cleanText(acceptance.pagePath)]
  ]) {
    if (expected !== received) {
      errors.push(finding(
        'ACCEPTANCE_MANIFEST_MISMATCH',
        `Public deployment acceptance manifest field ${field} does not match.`,
        { field, expected, received }
      ));
    }
  }

  const frontendIdentity = identity(frontend, 'certifiedBaselineSha');
  const workerIdentity = identity(worker, 'certifiedFrontendSha');
  const expectedFrontend = Object.freeze({
    ok: true,
    service: 'khadijas-arena-frontend',
    protocol: PUBLIC_DEPLOYMENT_ACCEPTANCE_PROTOCOL,
    build: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
    patch: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
    certifiedSha: PUBLIC_DEPLOYMENT_ACCEPTANCE_CERTIFIED_FRONTEND_SHA,
    releaseStatus: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_STATUS
  });
  const expectedWorker = Object.freeze({
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: PUBLIC_DEPLOYMENT_ACCEPTANCE_PROTOCOL,
    build: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
    patch: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
    certifiedSha: PUBLIC_DEPLOYMENT_ACCEPTANCE_CERTIFIED_FRONTEND_SHA,
    releaseStatus: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_STATUS
  });

  for (const [side, expected, received] of [
    ['frontend', expectedFrontend, frontendIdentity],
    ['worker', expectedWorker, workerIdentity]
  ]) {
    for (const field of Object.keys(expected)) {
      if (expected[field] !== received[field]) {
        errors.push(finding(
          `${side.toUpperCase()}_${field.toUpperCase()}_MISMATCH`,
          `Deployed ${side} ${field} does not match the certified release identity.`,
          { expected: expected[field], received: received[field] }
        ));
      }
    }
  }

  for (const field of ['protocol', 'build', 'patch', 'certifiedSha', 'releaseStatus']) {
    if (frontendIdentity[field] !== workerIdentity[field]) {
      errors.push(finding(
        `FRONTEND_WORKER_${field.toUpperCase()}_MISMATCH`,
        `Deployed frontend and Worker ${field} do not match.`,
        {
          frontend: frontendIdentity[field],
          worker: workerIdentity[field]
        }
      ));
    }
  }

  if (normalizedOrigin(frontend.workerUrl) !== normalizedOrigin(PUBLIC_DEPLOYMENT_ACCEPTANCE_WORKER_URL)) {
    errors.push(finding(
      'FRONTEND_WORKER_URL_MISMATCH',
      'The deployed frontend manifest points to an unexpected Worker origin.',
      {
        expected: normalizedOrigin(PUBLIC_DEPLOYMENT_ACCEPTANCE_WORKER_URL),
        received: normalizedOrigin(frontend.workerUrl)
      }
    ));
  }

  let parsedPage = null;
  try {
    parsedPage = new URL(cleanText(pageUrl));
  } catch {
    errors.push(finding('PUBLIC_PAGE_URL_INVALID', 'The acceptance page URL is invalid.'));
  }
  if (parsedPage) {
    if (parsedPage.protocol !== 'https:') {
      errors.push(finding(
        'PUBLIC_PAGE_NOT_HTTPS',
        'Public deployment acceptance must run from an HTTPS Pages deployment.',
        { protocol: parsedPage.protocol }
      ));
    }
    if (isLoopbackHostname(parsedPage.hostname)) {
      errors.push(finding(
        'PUBLIC_PAGE_LOOPBACK',
        'Public deployment acceptance cannot be certified from localhost.',
        { hostname: parsedPage.hostname }
      ));
    }
  }

  const audit = cleanText(runtimeAudit).toLowerCase();
  if (audit !== 'pass') {
    errors.push(finding(
      'RUNTIME_AUDIT_NOT_PASS',
      'The public game runtime audit did not report pass.',
      { received: audit || 'missing' }
    ));
  }

  const restricted = Array.from(new Set(
    Array.isArray(activeRestrictedGlobals)
      ? activeRestrictedGlobals.map((value) => cleanText(value)).filter(Boolean)
      : []
  ));
  if (restricted.length > 0) {
    errors.push(finding(
      'PUBLIC_DEBUG_GLOBALS_EXPOSED',
      'Local certification globals are exposed in the public runtime.',
      { activeRestrictedGlobals: restricted }
    ));
  }

  if (cleanText(uiStatusText).toUpperCase() !== PUBLIC_DEPLOYMENT_ACCEPTANCE_UI_READY_TEXT) {
    errors.push(finding(
      'CERTIFIED_SERVER_UI_NOT_READY',
      'The public co-op certified-server UI did not report PASS.',
      {
        expected: PUBLIC_DEPLOYMENT_ACCEPTANCE_UI_READY_TEXT,
        received: cleanText(uiStatusText, 'missing').toUpperCase()
      }
    ));
  }

  if (cleanText(gameBuild) !== PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD) {
    errors.push(finding(
      'PUBLIC_GAME_BUILD_MISMATCH',
      'The loaded public game build marker is incorrect.',
      {
        expected: PUBLIC_DEPLOYMENT_ACCEPTANCE_BUILD,
        received: cleanText(gameBuild, 'missing')
      }
    ));
  }

  if (cleanText(gamePatch) !== PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH) {
    errors.push(finding(
      'PUBLIC_GAME_PATCH_MISMATCH',
      'The loaded public game release patch marker is incorrect.',
      {
        expected: PUBLIC_DEPLOYMENT_ACCEPTANCE_RELEASE_PATCH,
        received: cleanText(gamePatch, 'missing')
      }
    ));
  }

  if (!cleanText(worker.deployedAt)) {
    warnings.push(finding(
      'WORKER_DEPLOYED_AT_MISSING',
      'The Worker release manifest does not include deployedAt.'
    ));
  }

  const manualChecks = Object.freeze({
    createJoin: manual.createJoin === true,
    shortRun: manual.shortRun === true,
    leaveRejoin: manual.leaveRejoin === true
  });
  for (const [key, passed] of Object.entries(manualChecks)) {
    if (!passed) {
      pending.push(finding(
        `MANUAL_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_PENDING`,
        `Two-client proof step ${key} is not yet confirmed.`
      ));
    }
  }

  const automatedReady = errors.length === 0;
  const ready = automatedReady && pending.length === 0;
  const status = errors.length > 0
    ? 'FAIL'
    : pending.length > 0
      ? 'PENDING'
      : 'PASS';

  return Object.freeze({
    patch: PUBLIC_DEPLOYMENT_ACCEPTANCE_PATCH,
    consolidatedBaselineSha: PUBLIC_DEPLOYMENT_ACCEPTANCE_BASELINE_SHA,
    status,
    automatedReady,
    ready,
    blocking: errors.length > 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    pending: Object.freeze(pending),
    evidence: Object.freeze({
      pageUrl: cleanText(pageUrl, '', 1000),
      acceptanceManifest: Object.freeze({ ...acceptance }),
      frontend: frontendIdentity,
      worker: workerIdentity,
      runtimeAudit: audit || 'missing',
      activeRestrictedGlobals: Object.freeze(restricted),
      uiStatusText: cleanText(uiStatusText).toUpperCase(),
      gameBuild: cleanText(gameBuild),
      gamePatch: cleanText(gamePatch),
      manualProof: manualChecks
    })
  });
}

export function createCompactPublicDeploymentDiagnostic(evaluation, {
  checkedAt = new Date().toISOString(),
  roomCode = ''
} = {}) {
  const result = evaluation && typeof evaluation === 'object' ? evaluation : {};
  const evidence = result.evidence && typeof result.evidence === 'object'
    ? result.evidence
    : {};
  const frontend = evidence.frontend || {};
  const worker = evidence.worker || {};
  const cleanRoomCode = cleanText(roomCode).toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);

  return Object.freeze({
    schema: 1,
    milestone: 'M3.85-M3.86',
    patch: PUBLIC_DEPLOYMENT_ACCEPTANCE_PATCH,
    consolidatedBaselineSha: PUBLIC_DEPLOYMENT_ACCEPTANCE_BASELINE_SHA,
    checkedAt: cleanText(checkedAt, new Date().toISOString(), 80),
    pageUrl: cleanText(evidence.pageUrl, '', 1000),
    status: cleanText(result.status, 'UNKNOWN').toUpperCase(),
    automatedReady: result.automatedReady === true,
    ready: result.ready === true,
    frontend: Object.freeze({
      protocol: frontend.protocol,
      build: frontend.build,
      patch: frontend.patch,
      certifiedSha: frontend.certifiedSha,
      releaseStatus: frontend.releaseStatus
    }),
    worker: Object.freeze({
      protocol: worker.protocol,
      build: worker.build,
      patch: worker.patch,
      certifiedSha: worker.certifiedSha,
      releaseStatus: worker.releaseStatus
    }),
    runtime: Object.freeze({
      audit: cleanText(evidence.runtimeAudit, 'missing').toLowerCase(),
      restrictedGlobals: Object.freeze([...(evidence.activeRestrictedGlobals || [])]),
      uiStatusText: cleanText(evidence.uiStatusText),
      gameBuild: cleanText(evidence.gameBuild),
      gamePatch: cleanText(evidence.gamePatch)
    }),
    twoClientProof: Object.freeze({
      ...(evidence.manualProof || {}),
      roomCode: cleanRoomCode || null
    }),
    errors: Object.freeze((result.errors || []).map((item) => item.code)),
    warnings: Object.freeze((result.warnings || []).map((item) => item.code)),
    pending: Object.freeze((result.pending || []).map((item) => item.code))
  });
}
