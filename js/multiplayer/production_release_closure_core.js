// js/multiplayer/production_release_closure_core.js
// M3.91-M3.92 — deterministic production closure and operations handoff.

export const PRODUCTION_RELEASE_CLOSURE_PATCH = 'm3-production-release-closure-r1';
export const PRODUCTION_RELEASE_CLOSURE_BASELINE_SHA = '93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8';
export const PRODUCTION_RELEASE_CLOSURE_ROLLBACK_SHA = '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250';
export const PRODUCTION_RELEASE_CLOSURE_GO_LIVE_PATCH = 'm3-production-go-live-seal-r1';
export const PRODUCTION_RELEASE_CLOSURE_WATCH_PATCH = 'm3-post-go-live-watch-r1';
export const PRODUCTION_RELEASE_CLOSURE_PROTOCOL = 6;
export const PRODUCTION_RELEASE_CLOSURE_BUILD = 'm3-team-final-world-reconnect-r3';
export const PRODUCTION_RELEASE_CLOSURE_RELEASE_PATCH = 'm3-production-release-manifest-r1';
export const PRODUCTION_RELEASE_CLOSURE_CERTIFIED_SHA = '3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b';
export const PRODUCTION_RELEASE_CLOSURE_RELEASE_STATUS = 'CERTIFIED';
export const PRODUCTION_RELEASE_CLOSURE_FRONTEND_ORIGIN = 'https://khadija-s-fps.pages.dev';
export const PRODUCTION_RELEASE_CLOSURE_WORKER_ORIGIN = 'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';
export const PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID = '40175919-3d62-4986-9215-edf06eeddb98';
export const PRODUCTION_RELEASE_CLOSURE_MINIMUM_SAMPLES = 3;
export const PRODUCTION_RELEASE_CLOSURE_MINIMUM_WINDOW_MS = 40000;
export const PRODUCTION_RELEASE_CLOSURE_MAX_EVIDENCE_AGE_MS = 72 * 60 * 60 * 1000;

function cleanText(value, fallback = '', limit = 1200) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}
function finiteInteger(value, fallback = -1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function normalizedOrigin(value) { try { return new URL(String(value || '')).origin; } catch { return ''; } }
function finding(code, message, details = {}) { return Object.freeze({ code, message, details: Object.freeze({ ...details }) }); }
function isSha256(value) { return /^[a-f0-9]{64}$/.test(cleanText(value).toLowerCase()); }

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
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') throw new TypeError(`Canonical JSON contains unsupported value at ${key}.`);
      output[key] = canonicalValue(item);
    }
    return output;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}.`);
}

export function canonicalProductionReleaseClosureJson(value) { return JSON.stringify(canonicalValue(value)); }

export function createExpectedProductionReleaseClosureManifest() {
  return Object.freeze({"ok":true,"service":"khadijas-arena-production-release-closure","patch":"m3-production-release-closure-r1","postGoLiveWatchCommitSha":"93fb47ad94b5e4b04a393b0c09ae59d62ef9d1b8","rollbackFrontendSha":"9f83a7254c06995aa9a4d46e8de4e9dfa18c3250","protocol":6,"build":"m3-team-final-world-reconnect-r3","releasePatch":"m3-production-release-manifest-r1","certifiedFrontendSha":"3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b","releaseStatus":"CERTIFIED","frontendUrl":"https://khadija-s-fps.pages.dev","workerUrl":"https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev","workerVersionId":"40175919-3d62-4986-9215-edf06eeddb98","sourceAcceptancePath":"/public-deployment-acceptance.html","sourceGoLivePath":"/production-go-live.html","sourceWatchPath":"/production-release-watch.html","pagePath":"/production-release-closure.html","requiredWatchStatus":"GREEN","minimumSamples":3,"minimumWindowMs":40000});
}

function checkIdentity(errors, source, prefix) {
  const value = isObject(source) ? source : {};
  for (const [field, expected, received] of [
    ['protocol', PRODUCTION_RELEASE_CLOSURE_PROTOCOL, finiteInteger(value.protocol)],
    ['build', PRODUCTION_RELEASE_CLOSURE_BUILD, cleanText(value.build)],
    ['releasePatch', PRODUCTION_RELEASE_CLOSURE_RELEASE_PATCH, cleanText(value.releasePatch)],
    ['certifiedFrontendSha', PRODUCTION_RELEASE_CLOSURE_CERTIFIED_SHA, cleanText(value.certifiedFrontendSha)],
    ['releaseStatus', PRODUCTION_RELEASE_CLOSURE_RELEASE_STATUS, cleanText(value.releaseStatus).toUpperCase()]
  ]) {
    if (expected !== received) errors.push(finding(`${prefix}_IDENTITY_MISMATCH`, `${prefix.toLowerCase()} release identity field ${field} does not match.`, { field, expected, received }));
  }
}

export function evaluateProductionReleaseClosure({
  manifest = null,
  goLiveCertificate = null,
  goLiveDigestValid = false,
  watchEvidence = null,
  watchDigestValid = false,
  nowMs = Date.now(),
  maxEvidenceAgeMs = PRODUCTION_RELEASE_CLOSURE_MAX_EVIDENCE_AGE_MS
} = {}) {
  const errors = [];
  const warnings = [];
  const expectedManifest = createExpectedProductionReleaseClosureManifest();
  const actualManifest = isObject(manifest) ? manifest : {};
  for (const [field, expected] of Object.entries(expectedManifest)) {
    let received = actualManifest[field];
    if (field.endsWith('Url')) { received = normalizedOrigin(received); }
    const normalizedExpected = field.endsWith('Url') ? normalizedOrigin(expected) : expected;
    if (normalizedExpected !== received) errors.push(finding('CLOSURE_MANIFEST_MISMATCH', `Closure manifest field ${field} does not match.`, { field, expected: normalizedExpected, received }));
  }

  const certificate = isObject(goLiveCertificate) ? goLiveCertificate : {};
  if (goLiveDigestValid !== true || !isSha256(certificate.certificateSha256)) errors.push(finding('GO_LIVE_CERTIFICATE_DIGEST_MISMATCH', 'Go-live certificate SHA-256 seal is missing or invalid.'));
  for (const [field, expected, received] of [
    ['schema', 1, finiteInteger(certificate.schema)],
    ['milestone', 'M3.87-M3.88', cleanText(certificate.milestone)],
    ['patch', PRODUCTION_RELEASE_CLOSURE_GO_LIVE_PATCH, cleanText(certificate.patch)],
    ['decision', 'GO_LIVE_APPROVED', cleanText(certificate.decision).toUpperCase()],
    ['approvalConfirmed', true, certificate.approvalConfirmed === true],
    ['frontendOrigin', PRODUCTION_RELEASE_CLOSURE_FRONTEND_ORIGIN, normalizedOrigin(certificate.deployment?.frontendOrigin)],
    ['workerOrigin', PRODUCTION_RELEASE_CLOSURE_WORKER_ORIGIN, normalizedOrigin(certificate.deployment?.workerOrigin)],
    ['workerVersionId', PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID, cleanText(certificate.deployment?.workerVersionId)],
    ['rollbackFrontendSha', PRODUCTION_RELEASE_CLOSURE_ROLLBACK_SHA, cleanText(certificate.rollbackAuthorization?.frontendCommitSha)]
  ]) {
    if (expected !== received) errors.push(finding('GO_LIVE_CERTIFICATE_MISMATCH', `Go-live certificate field ${field} does not match.`, { field, expected, received }));
  }
  checkIdentity(errors, certificate.releaseIdentity, 'GO_LIVE');

  const evidence = isObject(watchEvidence) ? watchEvidence : {};
  if (watchDigestValid !== true || !isSha256(evidence.documentSha256)) errors.push(finding('WATCH_EVIDENCE_DIGEST_MISMATCH', 'Production-watch evidence SHA-256 seal is missing or invalid.'));
  for (const [field, expected, received] of [
    ['schema', 1, finiteInteger(evidence.schema)],
    ['milestone', 'M3.89-M3.90', cleanText(evidence.milestone)],
    ['patch', PRODUCTION_RELEASE_CLOSURE_WATCH_PATCH, cleanText(evidence.patch)],
    ['status', 'GREEN', cleanText(evidence.status).toUpperCase()],
    ['sourceGoLiveCertificateSha256', cleanText(certificate.certificateSha256).toLowerCase(), cleanText(evidence.sourceGoLiveCertificateSha256).toLowerCase()],
    ['rollbackFrontendSha', PRODUCTION_RELEASE_CLOSURE_ROLLBACK_SHA, cleanText(evidence.rollbackReference?.frontendCommitSha)],
    ['rollbackWorkerVersionId', PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID, cleanText(evidence.rollbackReference?.workerVersionId)],
    ['workerChangeRequired', false, evidence.rollbackReference?.workerChangeRequired]
  ]) {
    if (expected !== received) errors.push(finding('WATCH_EVIDENCE_MISMATCH', `Production-watch evidence field ${field} does not match.`, { field, expected, received }));
  }
  if (!cleanText(evidence.operator, '', 120)) errors.push(finding('WATCH_OPERATOR_MISSING', 'Production-watch evidence must identify its operator.'));
  checkIdentity(errors, evidence.releaseIdentity, 'WATCH');

  const createdMs = Date.parse(cleanText(evidence.createdAt));
  if (!Number.isFinite(createdMs)) errors.push(finding('WATCH_TIMESTAMP_INVALID', 'Production-watch evidence timestamp is invalid.'));
  else {
    const ageMs = Number(nowMs) - createdMs;
    if (ageMs < -5 * 60 * 1000) errors.push(finding('WATCH_TIMESTAMP_IN_FUTURE', 'Production-watch evidence timestamp is unexpectedly in the future.', { ageMs }));
    if (ageMs > Number(maxEvidenceAgeMs)) errors.push(finding('WATCH_EVIDENCE_STALE', 'Production-watch evidence is older than the permitted closure window.', { ageMs, maxEvidenceAgeMs }));
  }

  const summary = isObject(evidence.summary) ? evidence.summary : {};
  const samplesCount = finiteInteger(summary.samples);
  const passCount = finiteInteger(summary.passCount);
  const warnCount = finiteInteger(summary.warnCount);
  const failCount = finiteInteger(summary.failCount);
  const windowMs = finiteInteger(summary.windowMs);
  if (samplesCount < PRODUCTION_RELEASE_CLOSURE_MINIMUM_SAMPLES) errors.push(finding('WATCH_SAMPLE_COUNT_INSUFFICIENT', 'At least three production samples are required.', { samplesCount }));
  if (passCount !== samplesCount || warnCount !== 0 || failCount !== 0) errors.push(finding('WATCH_NOT_ALL_PASS', 'Every closure sample must pass without warnings or failures.', { samplesCount, passCount, warnCount, failCount }));
  if (summary.enoughSamples !== true || summary.enoughWindow !== true || windowMs < PRODUCTION_RELEASE_CLOSURE_MINIMUM_WINDOW_MS) errors.push(finding('WATCH_WINDOW_INSUFFICIENT', 'Production-watch evidence does not satisfy the minimum observation window.', { windowMs }));

  const samples = Array.isArray(evidence.samples) ? evidence.samples : [];
  if (samples.length !== samplesCount) errors.push(finding('WATCH_SAMPLE_ARRAY_MISMATCH', 'Sample array length does not match the evidence summary.', { samples: samples.length, summarySamples: samplesCount }));
  const sampleTimes = [];
  samples.forEach((sample, index) => {
    if (cleanText(sample?.status).toUpperCase() !== 'PASS') errors.push(finding('WATCH_SAMPLE_NOT_PASS', `Sample ${index + 1} did not pass.`));
    if ((Array.isArray(sample?.errorCodes) ? sample.errorCodes : []).length) errors.push(finding('WATCH_SAMPLE_ERRORS_PRESENT', `Sample ${index + 1} contains error codes.`));
    if ((Array.isArray(sample?.warningCodes) ? sample.warningCodes : []).length) errors.push(finding('WATCH_SAMPLE_WARNINGS_PRESENT', `Sample ${index + 1} contains warning codes.`));
    const parsed = Date.parse(cleanText(sample?.sampledAt));
    if (!Number.isFinite(parsed)) errors.push(finding('WATCH_SAMPLE_TIMESTAMP_INVALID', `Sample ${index + 1} timestamp is invalid.`));
    else sampleTimes.push(parsed);
  });
  sampleTimes.sort((a, b) => a - b);
  const observedWindowMs = sampleTimes.length >= 2 ? sampleTimes[sampleTimes.length - 1] - sampleTimes[0] : 0;
  if (observedWindowMs < PRODUCTION_RELEASE_CLOSURE_MINIMUM_WINDOW_MS || observedWindowMs !== windowMs) errors.push(finding('WATCH_SAMPLE_WINDOW_MISMATCH', 'Sample timestamps do not prove the declared observation window.', { observedWindowMs, declaredWindowMs: windowMs }));

  const ready = errors.length === 0;
  return Object.freeze({
    ready,
    status: ready ? 'PASS' : 'BLOCKED',
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    source: Object.freeze({
      goLiveCertificateSha256: cleanText(certificate.certificateSha256).toLowerCase(),
      watchEvidenceSha256: cleanText(evidence.documentSha256).toLowerCase(),
      observation: Object.freeze({ samples: samplesCount, passCount, warnCount, failCount, windowMs })
    })
  });
}

export function createProductionReleaseClosureCertificate(evaluation, goLiveCertificate, watchEvidence, {
  closedBy = '', confirmation = false, createdAt = new Date().toISOString(), notes = ''
} = {}) {
  const result = isObject(evaluation) ? evaluation : {};
  if (result.ready !== true || cleanText(result.status).toUpperCase() !== 'PASS') throw new TypeError('Production release evidence is not ready for closure.');
  const closer = cleanText(closedBy, '', 120);
  if (!closer) throw new TypeError('Release closer is required.');
  if (confirmation !== true) throw new TypeError('Explicit release closure confirmation is required.');
  const timestamp = cleanText(createdAt, '', 80);
  if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError('createdAt must be a valid timestamp.');
  return Object.freeze({
    schema: 1,
    milestone: 'M3.91-M3.92',
    patch: PRODUCTION_RELEASE_CLOSURE_PATCH,
    createdAt: timestamp,
    closedBy: closer,
    decision: 'PRODUCTION_RELEASE_CLOSED',
    status: 'CLOSED_GREEN',
    closureConfirmed: true,
    sourceGoLiveCertificateSha256: cleanText(goLiveCertificate?.certificateSha256).toLowerCase(),
    sourceWatchEvidenceSha256: cleanText(watchEvidence?.documentSha256).toLowerCase(),
    releaseIdentity: Object.freeze({
      protocol: PRODUCTION_RELEASE_CLOSURE_PROTOCOL,
      build: PRODUCTION_RELEASE_CLOSURE_BUILD,
      releasePatch: PRODUCTION_RELEASE_CLOSURE_RELEASE_PATCH,
      certifiedFrontendSha: PRODUCTION_RELEASE_CLOSURE_CERTIFIED_SHA,
      releaseStatus: PRODUCTION_RELEASE_CLOSURE_RELEASE_STATUS
    }),
    deployment: Object.freeze({
      frontendOrigin: PRODUCTION_RELEASE_CLOSURE_FRONTEND_ORIGIN,
      frontendCommitSha: PRODUCTION_RELEASE_CLOSURE_BASELINE_SHA,
      workerOrigin: PRODUCTION_RELEASE_CLOSURE_WORKER_ORIGIN,
      workerVersionId: PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID
    }),
    observation: Object.freeze({ status: 'GREEN', ...result.source?.observation }),
    rollbackAuthorization: Object.freeze({
      frontendCommitSha: PRODUCTION_RELEASE_CLOSURE_ROLLBACK_SHA,
      workerVersionId: PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID,
      retainWorkerDeployment: true
    }),
    operationsState: 'HANDOFF_READY',
    notes: cleanText(notes, '', 1200) || null
  });
}

export function createProductionOperationsHandoff(closureCertificate, {
  owner = '', confirmation = false, createdAt = new Date().toISOString(), escalationNotes = ''
} = {}) {
  const source = isObject(closureCertificate) ? closureCertificate : {};
  if (!isSha256(source.documentSha256)) throw new TypeError('A sealed production closure certificate is required.');
  for (const [field, expected, received] of [
    ['milestone', 'M3.91-M3.92', cleanText(source.milestone)],
    ['patch', PRODUCTION_RELEASE_CLOSURE_PATCH, cleanText(source.patch)],
    ['decision', 'PRODUCTION_RELEASE_CLOSED', cleanText(source.decision).toUpperCase()],
    ['status', 'CLOSED_GREEN', cleanText(source.status).toUpperCase()],
    ['closureConfirmed', true, source.closureConfirmed === true],
    ['operationsState', 'HANDOFF_READY', cleanText(source.operationsState).toUpperCase()]
  ]) {
    if (expected !== received) throw new TypeError(`Closure certificate field ${field} does not match.`);
  }
  const acceptedBy = cleanText(owner, '', 120);
  if (!acceptedBy) throw new TypeError('Operations owner is required.');
  if (confirmation !== true) throw new TypeError('Explicit operations handoff confirmation is required.');
  const timestamp = cleanText(createdAt, '', 80);
  if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError('createdAt must be a valid timestamp.');
  return Object.freeze({
    schema: 1,
    milestone: 'M3.91-M3.92',
    patch: PRODUCTION_RELEASE_CLOSURE_PATCH,
    createdAt: timestamp,
    owner: acceptedBy,
    decision: 'OPERATIONS_HANDOFF_ACCEPTED',
    sourceClosureCertificateSha256: cleanText(source.documentSha256).toLowerCase(),
    releaseIdentity: Object.freeze({ ...source.releaseIdentity }),
    activeDeployment: Object.freeze({
      frontendOrigin: PRODUCTION_RELEASE_CLOSURE_FRONTEND_ORIGIN,
      frontendCommitSha: PRODUCTION_RELEASE_CLOSURE_BASELINE_SHA,
      workerOrigin: PRODUCTION_RELEASE_CLOSURE_WORKER_ORIGIN,
      workerVersionId: PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID
    }),
    monitoring: Object.freeze({
      acceptance: '/public-deployment-acceptance.html',
      goLive: '/production-go-live.html',
      releaseWatch: '/production-release-watch.html',
      releaseClosure: '/production-release-closure.html',
      workerHealth: `${PRODUCTION_RELEASE_CLOSURE_WORKER_ORIGIN}/health`,
      workerRelease: `${PRODUCTION_RELEASE_CLOSURE_WORKER_ORIGIN}/release`
    }),
    operationalChecks: Object.freeze([
      'Confirm the Pages frontend remains on the closed release commit.',
      'Confirm Worker /health and /release remain protocol 6 and CERTIFIED.',
      'Confirm production runtime audit remains pass.',
      'Confirm restricted localhost certification globals remain absent publicly.',
      'Use the production release watch before any rollback decision.'
    ]),
    rollbackPlan: Object.freeze({
      frontendCommitSha: PRODUCTION_RELEASE_CLOSURE_ROLLBACK_SHA,
      workerVersionId: PRODUCTION_RELEASE_CLOSURE_WORKER_VERSION_ID,
      retainWorkerDeployment: true,
      instruction: 'Restore the certified frontend rollback commit through Cloudflare Pages. Do not redeploy the Worker unless Worker code or release identity changed.'
    }),
    incidentTriggers: Object.freeze([
      'Two or more failed production-watch samples.',
      'Worker release identity mismatch.',
      'Production runtime audit not pass.',
      'Restricted certification globals exposed publicly.',
      'Certified multiplayer server UI not ready.'
    ]),
    escalationNotes: cleanText(escalationNotes, '', 1200) || null
  });
}
