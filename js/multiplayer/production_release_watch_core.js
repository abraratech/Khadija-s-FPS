// js/multiplayer/production_release_watch_core.js
// M3.89-M3.90 — deterministic post-go-live observation and rollback readiness.

export const PRODUCTION_RELEASE_WATCH_PATCH = 'm3-post-go-live-watch-r1';
export const PRODUCTION_RELEASE_WATCH_BASELINE_SHA = '148c5813dc01363a28906c47605e19b0b636d798';
export const PRODUCTION_RELEASE_WATCH_ROLLBACK_SHA = '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250';
export const PRODUCTION_RELEASE_WATCH_GO_LIVE_PATCH = 'm3-production-go-live-seal-r1';
export const PRODUCTION_RELEASE_WATCH_PROTOCOL = 6;
export const PRODUCTION_RELEASE_WATCH_BUILD = 'm3-team-final-world-reconnect-r3';
export const PRODUCTION_RELEASE_WATCH_RELEASE_PATCH = 'm3-production-release-manifest-r1';
export const PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA = '3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b';
export const PRODUCTION_RELEASE_WATCH_RELEASE_STATUS = 'CERTIFIED';
export const PRODUCTION_RELEASE_WATCH_FRONTEND_ORIGIN = 'https://khadija-s-fps.pages.dev';
export const PRODUCTION_RELEASE_WATCH_WORKER_ORIGIN = 'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';
export const PRODUCTION_RELEASE_WATCH_WORKER_VERSION_ID = '40175919-3d62-4986-9215-edf06eeddb98';
export const PRODUCTION_RELEASE_WATCH_UI_READY_TEXT = 'CERTIFIED MULTIPLAYER SERVER READY';
export const PRODUCTION_RELEASE_WATCH_MINIMUM_SAMPLES = 3;
export const PRODUCTION_RELEASE_WATCH_MINIMUM_WINDOW_MS = 40000;
export const PRODUCTION_RELEASE_WATCH_SAMPLE_INTERVAL_MS = 20000;
export const PRODUCTION_RELEASE_WATCH_MAX_CERTIFICATE_AGE_MS = 48 * 60 * 60 * 1000;
export const PRODUCTION_RELEASE_WATCH_RESTRICTED_GLOBALS = Object.freeze([
  'KHADIJA_MULTIPLAYER_FINAL_CERTIFICATION',
  'KHADIJA_MULTIPLAYER_CERTIFICATION_PAIRING',
  'KHADIJA_MULTIPLAYER_CERTIFICATION_SESSION'
]);

function cleanText(value, fallback = '', limit = 1200) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteInteger(value, fallback = -1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function finiteNumber(value, fallback = Number.NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizedOrigin(value) {
  try { return new URL(String(value || '')).origin; } catch { return ''; }
}

function finding(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function identity(source, certifiedField = 'certifiedFrontendSha') {
  const value = isObject(source) ? source : {};
  return Object.freeze({
    ok: value.ok === true,
    service: cleanText(value.service),
    protocol: finiteInteger(value.protocol),
    build: cleanText(value.build),
    patch: cleanText(value.patch),
    certifiedSha: cleanText(value[certifiedField]),
    releaseStatus: cleanText(value.releaseStatus).toUpperCase()
  });
}

function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON cannot contain non-finite numbers.');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isObject(value)) {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
        throw new TypeError(`Canonical JSON contains unsupported value at ${key}.`);
      }
      output[key] = canonicalValue(item);
    }
    return output;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}.`);
}

export function canonicalProductionReleaseWatchJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function createExpectedProductionReleaseWatchManifest() {
  return Object.freeze({
    ok: true,
    service: 'khadijas-arena-production-release-watch',
    patch: PRODUCTION_RELEASE_WATCH_PATCH,
    goLiveSealCommitSha: PRODUCTION_RELEASE_WATCH_BASELINE_SHA,
    rollbackFrontendSha: PRODUCTION_RELEASE_WATCH_ROLLBACK_SHA,
    protocol: PRODUCTION_RELEASE_WATCH_PROTOCOL,
    build: PRODUCTION_RELEASE_WATCH_BUILD,
    releasePatch: PRODUCTION_RELEASE_WATCH_RELEASE_PATCH,
    certifiedFrontendSha: PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA,
    releaseStatus: PRODUCTION_RELEASE_WATCH_RELEASE_STATUS,
    frontendUrl: PRODUCTION_RELEASE_WATCH_FRONTEND_ORIGIN,
    workerUrl: PRODUCTION_RELEASE_WATCH_WORKER_ORIGIN,
    workerVersionId: PRODUCTION_RELEASE_WATCH_WORKER_VERSION_ID,
    sourceGoLivePath: '/production-go-live.html',
    sourceAcceptancePath: '/public-deployment-acceptance.html',
    pagePath: '/production-release-watch.html',
    minimumSamples: PRODUCTION_RELEASE_WATCH_MINIMUM_SAMPLES,
    minimumWindowMs: PRODUCTION_RELEASE_WATCH_MINIMUM_WINDOW_MS,
    sampleIntervalMs: PRODUCTION_RELEASE_WATCH_SAMPLE_INTERVAL_MS
  });
}

export function evaluateProductionGoLiveCertificate({
  manifest = null,
  certificate = null,
  certificateDigestValid = false,
  nowMs = Date.now(),
  maxCertificateAgeMs = PRODUCTION_RELEASE_WATCH_MAX_CERTIFICATE_AGE_MS
} = {}) {
  const errors = [];
  const warnings = [];
  const expectedManifest = createExpectedProductionReleaseWatchManifest();
  const actualManifest = isObject(manifest) ? manifest : {};
  const source = isObject(certificate) ? certificate : {};

  for (const [field, expected, received] of [
    ['ok', true, actualManifest.ok === true],
    ['service', expectedManifest.service, cleanText(actualManifest.service)],
    ['patch', expectedManifest.patch, cleanText(actualManifest.patch)],
    ['goLiveSealCommitSha', expectedManifest.goLiveSealCommitSha, cleanText(actualManifest.goLiveSealCommitSha)],
    ['rollbackFrontendSha', expectedManifest.rollbackFrontendSha, cleanText(actualManifest.rollbackFrontendSha)],
    ['protocol', expectedManifest.protocol, finiteInteger(actualManifest.protocol)],
    ['build', expectedManifest.build, cleanText(actualManifest.build)],
    ['releasePatch', expectedManifest.releasePatch, cleanText(actualManifest.releasePatch)],
    ['certifiedFrontendSha', expectedManifest.certifiedFrontendSha, cleanText(actualManifest.certifiedFrontendSha)],
    ['releaseStatus', expectedManifest.releaseStatus, cleanText(actualManifest.releaseStatus).toUpperCase()],
    ['frontendUrl', normalizedOrigin(expectedManifest.frontendUrl), normalizedOrigin(actualManifest.frontendUrl)],
    ['workerUrl', normalizedOrigin(expectedManifest.workerUrl), normalizedOrigin(actualManifest.workerUrl)],
    ['workerVersionId', expectedManifest.workerVersionId, cleanText(actualManifest.workerVersionId)],
    ['sourceGoLivePath', expectedManifest.sourceGoLivePath, cleanText(actualManifest.sourceGoLivePath)],
    ['pagePath', expectedManifest.pagePath, cleanText(actualManifest.pagePath)],
    ['minimumSamples', expectedManifest.minimumSamples, finiteInteger(actualManifest.minimumSamples)],
    ['minimumWindowMs', expectedManifest.minimumWindowMs, finiteInteger(actualManifest.minimumWindowMs)],
    ['sampleIntervalMs', expectedManifest.sampleIntervalMs, finiteInteger(actualManifest.sampleIntervalMs)]
  ]) {
    if (expected !== received) {
      errors.push(finding('WATCH_MANIFEST_MISMATCH', `Watch manifest field ${field} does not match.`, { field, expected, received }));
    }
  }

  const required = [
    ['schema', 1, finiteInteger(source.schema)],
    ['milestone', 'M3.87-M3.88', cleanText(source.milestone)],
    ['patch', PRODUCTION_RELEASE_WATCH_GO_LIVE_PATCH, cleanText(source.patch)],
    ['decision', 'GO_LIVE_APPROVED', cleanText(source.decision).toUpperCase()],
    ['approvalConfirmed', true, source.approvalConfirmed === true],
    ['protocol', PRODUCTION_RELEASE_WATCH_PROTOCOL, finiteInteger(source.releaseIdentity?.protocol)],
    ['build', PRODUCTION_RELEASE_WATCH_BUILD, cleanText(source.releaseIdentity?.build)],
    ['releasePatch', PRODUCTION_RELEASE_WATCH_RELEASE_PATCH, cleanText(source.releaseIdentity?.releasePatch)],
    ['certifiedFrontendSha', PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA, cleanText(source.releaseIdentity?.certifiedFrontendSha)],
    ['releaseStatus', PRODUCTION_RELEASE_WATCH_RELEASE_STATUS, cleanText(source.releaseIdentity?.releaseStatus).toUpperCase()],
    ['frontendOrigin', PRODUCTION_RELEASE_WATCH_FRONTEND_ORIGIN, normalizedOrigin(source.deployment?.frontendOrigin)],
    ['frontendCommitSha', '69761f9adc2c2a1143840f246093779da2cb2d6a', cleanText(source.deployment?.frontendCommitSha)],
    ['workerOrigin', PRODUCTION_RELEASE_WATCH_WORKER_ORIGIN, normalizedOrigin(source.deployment?.workerOrigin)],
    ['workerVersionId', PRODUCTION_RELEASE_WATCH_WORKER_VERSION_ID, cleanText(source.deployment?.workerVersionId)],
    ['rollbackFrontendSha', PRODUCTION_RELEASE_WATCH_ROLLBACK_SHA, cleanText(source.rollbackAuthorization?.frontendCommitSha)]
  ];
  for (const [field, expected, received] of required) {
    if (expected !== received) {
      errors.push(finding('GO_LIVE_CERTIFICATE_MISMATCH', `Go-live certificate field ${field} does not match.`, { field, expected, received }));
    }
  }

  if (!cleanText(source.approvedBy, '', 120)) {
    errors.push(finding('GO_LIVE_APPROVER_MISSING', 'The go-live certificate does not identify its approver.'));
  }
  if (!/^[a-f0-9]{64}$/.test(cleanText(source.sourceDiagnosticSha256).toLowerCase())) {
    errors.push(finding('GO_LIVE_SOURCE_DIGEST_INVALID', 'The go-live source diagnostic digest is invalid.'));
  }
  if (!/^[a-f0-9]{64}$/.test(cleanText(source.certificateSha256).toLowerCase())) {
    errors.push(finding('GO_LIVE_CERTIFICATE_DIGEST_INVALID', 'The go-live certificate digest is invalid.'));
  }
  if (certificateDigestValid !== true) {
    errors.push(finding('GO_LIVE_CERTIFICATE_DIGEST_MISMATCH', 'The go-live certificate SHA-256 seal did not verify.'));
  }

  const createdAt = cleanText(source.createdAt, '', 80);
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    errors.push(finding('GO_LIVE_CREATED_AT_INVALID', 'The go-live certificate createdAt timestamp is invalid.'));
  } else {
    const ageMs = Number(nowMs) - createdAtMs;
    if (ageMs < -10 * 60 * 1000) {
      errors.push(finding('GO_LIVE_CERTIFICATE_FROM_FUTURE', 'The go-live certificate timestamp is too far in the future.', { createdAt }));
    } else if (ageMs > Number(maxCertificateAgeMs)) {
      warnings.push(finding('GO_LIVE_CERTIFICATE_OLDER_THAN_WATCH_WINDOW', 'The go-live certificate is older than 48 hours.', { createdAt }));
    }
  }

  return Object.freeze({
    status: errors.length ? 'BLOCKED' : warnings.length ? 'WARN' : 'PASS',
    ready: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    certificate: Object.freeze({
      createdAt,
      approvedBy: cleanText(source.approvedBy, '', 120),
      roomCode: cleanText(source.sourceEvidence?.roomCode).toUpperCase(),
      certificateSha256: cleanText(source.certificateSha256).toLowerCase()
    })
  });
}

export function evaluateProductionReleaseWatchSample({
  sampledAt = new Date().toISOString(),
  pageUrl = '',
  frontendManifest = null,
  workerHealth = null,
  workerRelease = null,
  runtimeAudit = '',
  activeRestrictedGlobals = [],
  uiStatusText = '',
  gameBuild = '',
  gamePatch = '',
  responseTimesMs = {}
} = {}) {
  const errors = [];
  const warnings = [];
  const frontend = identity(frontendManifest, 'certifiedBaselineSha');
  const worker = identity(workerRelease, 'certifiedFrontendSha');
  const health = isObject(workerHealth) ? workerHealth : {};
  const expectedFrontend = {
    ok: true,
    service: 'khadijas-arena-frontend',
    protocol: PRODUCTION_RELEASE_WATCH_PROTOCOL,
    build: PRODUCTION_RELEASE_WATCH_BUILD,
    patch: PRODUCTION_RELEASE_WATCH_RELEASE_PATCH,
    certifiedSha: PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA,
    releaseStatus: PRODUCTION_RELEASE_WATCH_RELEASE_STATUS
  };
  const expectedWorker = {
    ok: true,
    service: 'khadijas-arena-multiplayer',
    protocol: PRODUCTION_RELEASE_WATCH_PROTOCOL,
    build: PRODUCTION_RELEASE_WATCH_BUILD,
    patch: PRODUCTION_RELEASE_WATCH_RELEASE_PATCH,
    certifiedSha: PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA,
    releaseStatus: PRODUCTION_RELEASE_WATCH_RELEASE_STATUS
  };

  for (const [side, expected, received] of [['frontend', expectedFrontend, frontend], ['worker', expectedWorker, worker]]) {
    for (const field of Object.keys(expected)) {
      if (expected[field] !== received[field]) {
        errors.push(finding(`${side.toUpperCase()}_${field.toUpperCase()}_MISMATCH`, `${side} ${field} does not match the certified release.`, { expected: expected[field], received: received[field] }));
      }
    }
  }

  if (health.ok !== true) errors.push(finding('WORKER_HEALTH_NOT_OK', 'Worker /health did not report ok=true.'));
  if (finiteInteger(health.protocol) !== PRODUCTION_RELEASE_WATCH_PROTOCOL) errors.push(finding('WORKER_HEALTH_PROTOCOL_MISMATCH', 'Worker /health protocol does not match.'));
  if (cleanText(health.build) !== PRODUCTION_RELEASE_WATCH_BUILD) errors.push(finding('WORKER_HEALTH_BUILD_MISMATCH', 'Worker /health build does not match.'));

  if (cleanText(runtimeAudit).toLowerCase() !== 'pass') errors.push(finding('RUNTIME_AUDIT_NOT_PASS', 'Production runtime audit did not report pass.', { received: cleanText(runtimeAudit).toLowerCase() || 'missing' }));
  const globals = Array.isArray(activeRestrictedGlobals) ? [...new Set(activeRestrictedGlobals.map(cleanText).filter(Boolean))] : [];
  if (globals.length) errors.push(finding('RUNTIME_DEBUG_GLOBALS_EXPOSED', 'Restricted localhost certification globals are exposed publicly.', { globals }));
  if (cleanText(uiStatusText).toUpperCase() !== PRODUCTION_RELEASE_WATCH_UI_READY_TEXT) errors.push(finding('CERTIFIED_SERVER_UI_NOT_READY', 'Certified-server UI did not report ready.', { received: cleanText(uiStatusText) }));
  if (cleanText(gameBuild) !== PRODUCTION_RELEASE_WATCH_BUILD) errors.push(finding('RUNTIME_BUILD_MISMATCH', 'Runtime build does not match the certified build.'));
  if (cleanText(gamePatch) !== PRODUCTION_RELEASE_WATCH_RELEASE_PATCH) errors.push(finding('RUNTIME_PATCH_MISMATCH', 'Runtime patch does not match the certified release patch.'));

  let parsedPage = null;
  try { parsedPage = new URL(cleanText(pageUrl)); } catch {}
  if (!parsedPage || parsedPage.protocol !== 'https:' || parsedPage.hostname === 'localhost' || parsedPage.hostname === '127.0.0.1') {
    errors.push(finding('WATCH_PAGE_NOT_PUBLIC_HTTPS', 'Observation must run from the public HTTPS Pages deployment.'));
  }

  const timings = {};
  for (const key of ['frontend', 'workerHealth', 'workerRelease', 'runtime']) {
    const value = finiteNumber(responseTimesMs?.[key]);
    timings[key] = Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
    if (Number.isFinite(value) && value > 5000) warnings.push(finding('SLOW_LIVE_CHECK', `${key} check exceeded 5 seconds.`, { key, responseTimeMs: Math.round(value) }));
  }

  const timestampMs = Date.parse(cleanText(sampledAt));
  if (!Number.isFinite(timestampMs)) errors.push(finding('SAMPLE_TIMESTAMP_INVALID', 'Sample timestamp is invalid.'));

  return Object.freeze({
    sampledAt: Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : '',
    status: errors.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS',
    critical: errors.length > 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    timings: Object.freeze(timings),
    identity: Object.freeze({ frontend, worker })
  });
}

export function evaluateProductionReleaseWatchWindow({
  certificateEvaluation = null,
  samples = [],
  minimumSamples = PRODUCTION_RELEASE_WATCH_MINIMUM_SAMPLES,
  minimumWindowMs = PRODUCTION_RELEASE_WATCH_MINIMUM_WINDOW_MS
} = {}) {
  const errors = [];
  const warnings = [];
  const sourceCertificate = isObject(certificateEvaluation) ? certificateEvaluation : {};
  const normalizedSamples = Array.isArray(samples) ? samples.filter(isObject) : [];

  if (sourceCertificate.ready !== true) errors.push(finding('GO_LIVE_CERTIFICATE_BLOCKED', 'A valid sealed go-live certificate is required before observation.'));
  const passCount = normalizedSamples.filter((sample) => sample.status === 'PASS').length;
  const warnCount = normalizedSamples.filter((sample) => sample.status === 'WARN').length;
  const failCount = normalizedSamples.filter((sample) => sample.status === 'FAIL').length;

  const times = normalizedSamples.map((sample) => Date.parse(cleanText(sample.sampledAt))).filter(Number.isFinite).sort((a, b) => a - b);
  const windowMs = times.length >= 2 ? times[times.length - 1] - times[0] : 0;
  const enoughSamples = normalizedSamples.length >= finiteInteger(minimumSamples, PRODUCTION_RELEASE_WATCH_MINIMUM_SAMPLES);
  const enoughWindow = windowMs >= finiteInteger(minimumWindowMs, PRODUCTION_RELEASE_WATCH_MINIMUM_WINDOW_MS);

  if (failCount >= 2) {
    errors.push(finding('CONFIRMED_PRODUCTION_FAILURE', 'Two or more live samples failed; emergency rollback review is authorized.', { failCount }));
  } else if (failCount === 1) {
    warnings.push(finding('TRANSIENT_PRODUCTION_FAILURE', 'One live sample failed; collect another sample before rollback.', { failCount }));
  }
  if (warnCount) warnings.push(finding('PRODUCTION_WARNINGS_OBSERVED', 'One or more live samples completed with warnings.', { warnCount }));

  let status = 'COLLECTING';
  if (sourceCertificate.ready !== true) status = 'BLOCKED';
  else if (failCount >= 2) status = 'ROLLBACK_AUTHORIZED';
  else if (failCount === 1 || warnCount > 0) status = 'DEGRADED';
  else if (enoughSamples && enoughWindow) status = 'GREEN';

  return Object.freeze({
    status,
    ready: status === 'GREEN',
    rollbackAuthorized: status === 'ROLLBACK_AUTHORIZED',
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    summary: Object.freeze({
      samples: normalizedSamples.length,
      passCount,
      warnCount,
      failCount,
      windowMs,
      enoughSamples,
      enoughWindow
    })
  });
}

export function createProductionReleaseWatchEvidence(windowEvaluation, samples, certificate, {
  createdAt = new Date().toISOString(),
  operator = '',
  notes = ''
} = {}) {
  const result = isObject(windowEvaluation) ? windowEvaluation : {};
  if (!['GREEN', 'DEGRADED', 'ROLLBACK_AUTHORIZED'].includes(cleanText(result.status).toUpperCase())) {
    throw new TypeError('Observation window is not complete enough to export evidence.');
  }
  const name = cleanText(operator, '', 120);
  if (!name) throw new TypeError('Observation operator is required.');
  const timestamp = cleanText(createdAt, '', 80);
  if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError('createdAt must be a valid timestamp.');

  return Object.freeze({
    schema: 1,
    milestone: 'M3.89-M3.90',
    patch: PRODUCTION_RELEASE_WATCH_PATCH,
    createdAt: timestamp,
    operator: name,
    status: cleanText(result.status).toUpperCase(),
    releaseIdentity: Object.freeze({
      protocol: PRODUCTION_RELEASE_WATCH_PROTOCOL,
      build: PRODUCTION_RELEASE_WATCH_BUILD,
      releasePatch: PRODUCTION_RELEASE_WATCH_RELEASE_PATCH,
      certifiedFrontendSha: PRODUCTION_RELEASE_WATCH_CERTIFIED_SHA,
      releaseStatus: PRODUCTION_RELEASE_WATCH_RELEASE_STATUS
    }),
    sourceGoLiveCertificateSha256: cleanText(certificate?.certificateSha256).toLowerCase(),
    summary: Object.freeze({ ...result.summary }),
    samples: Object.freeze((Array.isArray(samples) ? samples : []).map((sample) => Object.freeze({
      sampledAt: cleanText(sample.sampledAt),
      status: cleanText(sample.status).toUpperCase(),
      errorCodes: Object.freeze((Array.isArray(sample.errors) ? sample.errors : []).map((item) => cleanText(item.code)).filter(Boolean)),
      warningCodes: Object.freeze((Array.isArray(sample.warnings) ? sample.warnings : []).map((item) => cleanText(item.code)).filter(Boolean)),
      timings: Object.freeze({ ...(isObject(sample.timings) ? sample.timings : {}) })
    }))),
    rollbackReference: Object.freeze({
      frontendCommitSha: PRODUCTION_RELEASE_WATCH_ROLLBACK_SHA,
      workerVersionId: PRODUCTION_RELEASE_WATCH_WORKER_VERSION_ID,
      workerChangeRequired: false
    }),
    notes: cleanText(notes, '', 1200) || null
  });
}

export function createProductionRollbackDecision(windowEvaluation, certificate, {
  approvedBy = '',
  confirmation = false,
  rehearsalOnly = true,
  createdAt = new Date().toISOString(),
  reason = ''
} = {}) {
  const result = isObject(windowEvaluation) ? windowEvaluation : {};
  const approver = cleanText(approvedBy, '', 120);
  if (!approver) throw new TypeError('Rollback approver is required.');
  if (confirmation !== true) throw new TypeError('Explicit rollback decision confirmation is required.');
  const timestamp = cleanText(createdAt, '', 80);
  if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError('createdAt must be a valid timestamp.');
  const liveAuthorized = result.rollbackAuthorized === true && cleanText(result.status).toUpperCase() === 'ROLLBACK_AUTHORIZED';
  if (rehearsalOnly !== true && !liveAuthorized) {
    throw new TypeError('A live rollback packet requires two or more failed production samples.');
  }

  return Object.freeze({
    schema: 1,
    milestone: 'M3.89-M3.90',
    patch: PRODUCTION_RELEASE_WATCH_PATCH,
    createdAt: timestamp,
    approvedBy: approver,
    mode: rehearsalOnly === true ? 'DRILL_ONLY_DO_NOT_EXECUTE' : 'EMERGENCY_ROLLBACK_AUTHORIZED',
    sourceStatus: cleanText(result.status).toUpperCase(),
    sourceGoLiveCertificateSha256: cleanText(certificate?.certificateSha256).toLowerCase(),
    rollback: Object.freeze({
      frontendCommitSha: PRODUCTION_RELEASE_WATCH_ROLLBACK_SHA,
      workerVersionId: PRODUCTION_RELEASE_WATCH_WORKER_VERSION_ID,
      retainWorkerDeployment: true,
      instruction: 'Restore the certified frontend rollback commit through Cloudflare Pages. Do not redeploy the Worker unless Worker code or release identity changed.'
    }),
    verification: Object.freeze([
      'Confirm Pages deployment reports success.',
      'Confirm /multiplayer-release.json matches the rollback release identity.',
      'Confirm Worker /health and /release remain protocol 6 and certified.',
      'Confirm production runtime audit reports pass.',
      'Confirm restricted certification globals remain absent.',
      'Run a two-client create, join, leave, and rejoin smoke test.'
    ]),
    reason: cleanText(reason, '', 1200) || null
  });
}
