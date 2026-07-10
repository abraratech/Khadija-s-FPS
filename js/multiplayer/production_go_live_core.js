// js/multiplayer/production_go_live_core.js
// M3.87-M3.88 — deterministic go-live evidence validation and certificate creation.

export const PRODUCTION_GO_LIVE_PATCH = 'm3-production-go-live-seal-r1';
export const PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA = '69761f9adc2c2a1143840f246093779da2cb2d6a';
export const PRODUCTION_GO_LIVE_ROLLBACK_FRONTEND_SHA = '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250';
export const PRODUCTION_GO_LIVE_ACCEPTANCE_PATCH = 'm3-public-deployment-acceptance-r1';
export const PRODUCTION_GO_LIVE_ACCEPTANCE_BASELINE_SHA = '9f83a7254c06995aa9a4d46e8de4e9dfa18c3250';
export const PRODUCTION_GO_LIVE_PROTOCOL = 6;
export const PRODUCTION_GO_LIVE_BUILD = 'm3-team-final-world-reconnect-r3';
export const PRODUCTION_GO_LIVE_RELEASE_PATCH = 'm3-production-release-manifest-r1';
export const PRODUCTION_GO_LIVE_CERTIFIED_FRONTEND_SHA = '3d57aab9b75e6b1e04ceeedd5afd5957f3ae361b';
export const PRODUCTION_GO_LIVE_RELEASE_STATUS = 'CERTIFIED';
export const PRODUCTION_GO_LIVE_FRONTEND_ORIGIN = 'https://khadija-s-fps.pages.dev';
export const PRODUCTION_GO_LIVE_WORKER_ORIGIN = 'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev';
export const PRODUCTION_GO_LIVE_WORKER_VERSION_ID = '40175919-3d62-4986-9215-edf06eeddb98';
export const PRODUCTION_GO_LIVE_UI_READY_TEXT = 'CERTIFIED MULTIPLAYER SERVER READY';
export const PRODUCTION_GO_LIVE_MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

function cleanText(value, fallback = '', limit = 1000) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteInteger(value, fallback = -1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function exactArray(value) {
  return Array.isArray(value) ? value.map((item) => cleanText(item)).filter(Boolean) : [];
}

function compareField(errors, code, label, expected, received) {
  if (expected !== received) {
    errors.push(finding(code, `${label} does not match the certified go-live identity.`, {
      expected,
      received
    }));
  }
}

function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
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

export function canonicalProductionGoLiveJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function createExpectedProductionGoLiveManifest() {
  return Object.freeze({
    ok: true,
    service: 'khadijas-arena-production-go-live-seal',
    patch: PRODUCTION_GO_LIVE_PATCH,
    acceptanceCommitSha: PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA,
    rollbackFrontendSha: PRODUCTION_GO_LIVE_ROLLBACK_FRONTEND_SHA,
    protocol: PRODUCTION_GO_LIVE_PROTOCOL,
    build: PRODUCTION_GO_LIVE_BUILD,
    releasePatch: PRODUCTION_GO_LIVE_RELEASE_PATCH,
    certifiedFrontendSha: PRODUCTION_GO_LIVE_CERTIFIED_FRONTEND_SHA,
    releaseStatus: PRODUCTION_GO_LIVE_RELEASE_STATUS,
    frontendUrl: PRODUCTION_GO_LIVE_FRONTEND_ORIGIN,
    workerUrl: PRODUCTION_GO_LIVE_WORKER_ORIGIN,
    workerVersionId: PRODUCTION_GO_LIVE_WORKER_VERSION_ID,
    sourceAcceptancePath: '/public-deployment-acceptance.html',
    pagePath: '/production-go-live.html'
  });
}

export function evaluateProductionGoLiveEvidence({
  manifest = null,
  diagnostic = null,
  nowMs = Date.now(),
  maxEvidenceAgeMs = PRODUCTION_GO_LIVE_MAX_EVIDENCE_AGE_MS
} = {}) {
  const errors = [];
  const warnings = [];
  const expectedManifest = createExpectedProductionGoLiveManifest();
  const actualManifest = isObject(manifest) ? manifest : {};
  const evidence = isObject(diagnostic) ? diagnostic : {};

  for (const [field, expected, received] of [
    ['ok', true, actualManifest.ok === true],
    ['service', expectedManifest.service, cleanText(actualManifest.service)],
    ['patch', expectedManifest.patch, cleanText(actualManifest.patch)],
    ['acceptanceCommitSha', expectedManifest.acceptanceCommitSha, cleanText(actualManifest.acceptanceCommitSha)],
    ['rollbackFrontendSha', expectedManifest.rollbackFrontendSha, cleanText(actualManifest.rollbackFrontendSha)],
    ['protocol', expectedManifest.protocol, finiteInteger(actualManifest.protocol)],
    ['build', expectedManifest.build, cleanText(actualManifest.build)],
    ['releasePatch', expectedManifest.releasePatch, cleanText(actualManifest.releasePatch)],
    ['certifiedFrontendSha', expectedManifest.certifiedFrontendSha, cleanText(actualManifest.certifiedFrontendSha)],
    ['releaseStatus', expectedManifest.releaseStatus, cleanText(actualManifest.releaseStatus).toUpperCase()],
    ['frontendUrl', normalizedOrigin(expectedManifest.frontendUrl), normalizedOrigin(actualManifest.frontendUrl)],
    ['workerUrl', normalizedOrigin(expectedManifest.workerUrl), normalizedOrigin(actualManifest.workerUrl)],
    ['workerVersionId', expectedManifest.workerVersionId, cleanText(actualManifest.workerVersionId)],
    ['sourceAcceptancePath', expectedManifest.sourceAcceptancePath, cleanText(actualManifest.sourceAcceptancePath)],
    ['pagePath', expectedManifest.pagePath, cleanText(actualManifest.pagePath)]
  ]) {
    if (expected !== received) {
      errors.push(finding(
        'GO_LIVE_MANIFEST_MISMATCH',
        `Production go-live manifest field ${field} does not match.`,
        { field, expected, received }
      ));
    }
  }

  compareField(errors, 'SOURCE_SCHEMA_MISMATCH', 'Acceptance diagnostic schema', 1, finiteInteger(evidence.schema));
  compareField(errors, 'SOURCE_MILESTONE_MISMATCH', 'Acceptance diagnostic milestone', 'M3.85-M3.86', cleanText(evidence.milestone));
  compareField(errors, 'SOURCE_PATCH_MISMATCH', 'Acceptance diagnostic patch', PRODUCTION_GO_LIVE_ACCEPTANCE_PATCH, cleanText(evidence.patch));
  compareField(errors, 'SOURCE_BASELINE_SHA_MISMATCH', 'Acceptance diagnostic baseline SHA', PRODUCTION_GO_LIVE_ACCEPTANCE_BASELINE_SHA, cleanText(evidence.consolidatedBaselineSha));
  compareField(errors, 'SOURCE_STATUS_NOT_PASS', 'Acceptance diagnostic status', 'PASS', cleanText(evidence.status).toUpperCase());
  compareField(errors, 'SOURCE_AUTOMATED_NOT_READY', 'Acceptance automated readiness', true, evidence.automatedReady === true);
  compareField(errors, 'SOURCE_NOT_READY', 'Acceptance final readiness', true, evidence.ready === true);

  let checkedAtMs = Number.NaN;
  const checkedAt = cleanText(evidence.checkedAt, '', 80);
  if (checkedAt) checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedAtMs)) {
    errors.push(finding('SOURCE_CHECKED_AT_INVALID', 'Acceptance diagnostic checkedAt is missing or invalid.'));
  } else {
    const ageMs = Number(nowMs) - checkedAtMs;
    if (ageMs < -10 * 60 * 1000) {
      errors.push(finding('SOURCE_EVIDENCE_FROM_FUTURE', 'Acceptance evidence timestamp is too far in the future.', { checkedAt }));
    } else if (ageMs > Number(maxEvidenceAgeMs)) {
      errors.push(finding('SOURCE_EVIDENCE_STALE', 'Acceptance evidence is older than the 24-hour go-live window.', {
        checkedAt,
        ageHours: Math.round(ageMs / 360000) / 10
      }));
    }
  }

  let page = null;
  try {
    page = new URL(cleanText(evidence.pageUrl));
  } catch {
    errors.push(finding('SOURCE_PAGE_URL_INVALID', 'Acceptance diagnostic pageUrl is invalid.'));
  }
  if (page) {
    if (page.origin !== PRODUCTION_GO_LIVE_FRONTEND_ORIGIN) {
      errors.push(finding('SOURCE_PAGE_ORIGIN_MISMATCH', 'Acceptance proof did not run on the production Pages origin.', {
        expected: PRODUCTION_GO_LIVE_FRONTEND_ORIGIN,
        received: page.origin
      }));
    }
    if (page.pathname !== '/public-deployment-acceptance.html') {
      errors.push(finding('SOURCE_PAGE_PATH_MISMATCH', 'Acceptance proof did not run from the certified acceptance page.', {
        received: page.pathname
      }));
    }
    if (page.searchParams.get('mpDebug') === '1') {
      errors.push(finding('SOURCE_DEBUG_MODE_ACTIVE', 'Acceptance proof cannot be approved with mpDebug=1.'));
    }
  }

  const expectedIdentity = {
    protocol: PRODUCTION_GO_LIVE_PROTOCOL,
    build: PRODUCTION_GO_LIVE_BUILD,
    patch: PRODUCTION_GO_LIVE_RELEASE_PATCH,
    certifiedSha: PRODUCTION_GO_LIVE_CERTIFIED_FRONTEND_SHA,
    releaseStatus: PRODUCTION_GO_LIVE_RELEASE_STATUS
  };
  const frontend = isObject(evidence.frontend) ? evidence.frontend : {};
  const worker = isObject(evidence.worker) ? evidence.worker : {};
  for (const [side, identity] of [['frontend', frontend], ['worker', worker]]) {
    compareField(errors, `${side.toUpperCase()}_PROTOCOL_MISMATCH`, `${side} protocol`, expectedIdentity.protocol, finiteInteger(identity.protocol));
    compareField(errors, `${side.toUpperCase()}_BUILD_MISMATCH`, `${side} build`, expectedIdentity.build, cleanText(identity.build));
    compareField(errors, `${side.toUpperCase()}_PATCH_MISMATCH`, `${side} patch`, expectedIdentity.patch, cleanText(identity.patch));
    compareField(errors, `${side.toUpperCase()}_SHA_MISMATCH`, `${side} certified SHA`, expectedIdentity.certifiedSha, cleanText(identity.certifiedSha));
    compareField(errors, `${side.toUpperCase()}_STATUS_MISMATCH`, `${side} release status`, expectedIdentity.releaseStatus, cleanText(identity.releaseStatus).toUpperCase());
  }

  const runtime = isObject(evidence.runtime) ? evidence.runtime : {};
  compareField(errors, 'RUNTIME_AUDIT_NOT_PASS', 'Runtime audit', 'pass', cleanText(runtime.audit).toLowerCase());
  compareField(errors, 'RUNTIME_UI_NOT_READY', 'Certified-server UI', PRODUCTION_GO_LIVE_UI_READY_TEXT, cleanText(runtime.uiStatusText).toUpperCase());
  compareField(errors, 'RUNTIME_BUILD_MISMATCH', 'Runtime build', PRODUCTION_GO_LIVE_BUILD, cleanText(runtime.gameBuild));
  compareField(errors, 'RUNTIME_PATCH_MISMATCH', 'Runtime patch', PRODUCTION_GO_LIVE_RELEASE_PATCH, cleanText(runtime.gamePatch));
  const exposedGlobals = exactArray(runtime.restrictedGlobals);
  if (exposedGlobals.length > 0) {
    errors.push(finding('RUNTIME_DEBUG_GLOBALS_EXPOSED', 'Restricted certification globals are present in production.', {
      globals: exposedGlobals
    }));
  }

  const proof = isObject(evidence.twoClientProof) ? evidence.twoClientProof : {};
  for (const key of ['createJoin', 'shortRun', 'leaveRejoin']) {
    if (proof[key] !== true) {
      errors.push(finding(`TWO_CLIENT_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_MISSING`, `Two-client proof ${key} is not confirmed.`));
    }
  }
  const roomCode = cleanText(proof.roomCode).toUpperCase();
  if (!/^[A-Z2-9]{4,6}$/.test(roomCode)) {
    errors.push(finding('TWO_CLIENT_ROOM_CODE_INVALID', 'A 4-6 character room code is required for the release proof.'));
  }

  const sourceErrors = exactArray(evidence.errors);
  const sourcePending = exactArray(evidence.pending);
  if (sourceErrors.length > 0) {
    errors.push(finding('SOURCE_ERRORS_PRESENT', 'Acceptance diagnostic contains blocking errors.', { errors: sourceErrors }));
  }
  if (sourcePending.length > 0) {
    errors.push(finding('SOURCE_PENDING_PRESENT', 'Acceptance diagnostic contains pending proof steps.', { pending: sourcePending }));
  }
  for (const code of exactArray(evidence.warnings)) {
    warnings.push(finding('SOURCE_WARNING', `Acceptance diagnostic warning: ${code}`, { code }));
  }

  const ready = errors.length === 0;
  return Object.freeze({
    patch: PRODUCTION_GO_LIVE_PATCH,
    status: ready ? 'APPROVED' : 'BLOCKED',
    ready,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    evidence: Object.freeze({
      checkedAt,
      pageUrl: cleanText(evidence.pageUrl),
      roomCode,
      sourceWarnings: Object.freeze(exactArray(evidence.warnings)),
      releaseIdentity: Object.freeze({ ...expectedIdentity })
    })
  });
}

export function createProductionGoLiveCertificate(evaluation, diagnostic, {
  approvedBy = '',
  approvalConfirmed = false,
  createdAt = new Date().toISOString(),
  sourceDiagnosticSha256 = '',
  notes = ''
} = {}) {
  const result = isObject(evaluation) ? evaluation : {};
  const source = isObject(diagnostic) ? diagnostic : {};
  if (result.ready !== true || result.status !== 'APPROVED') {
    throw new TypeError('A blocked acceptance diagnostic cannot produce a go-live certificate.');
  }
  const approver = cleanText(approvedBy, '', 120);
  if (!approver) throw new TypeError('Release approver is required.');
  if (approvalConfirmed !== true) throw new TypeError('Explicit release approval is required.');
  const digest = cleanText(sourceDiagnosticSha256).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new TypeError('sourceDiagnosticSha256 must be a 64-character SHA-256 digest.');
  }
  const created = cleanText(createdAt, '', 80);
  if (!Number.isFinite(Date.parse(created))) throw new TypeError('createdAt must be a valid timestamp.');

  return Object.freeze({
    schema: 1,
    milestone: 'M3.87-M3.88',
    patch: PRODUCTION_GO_LIVE_PATCH,
    decision: 'GO_LIVE_APPROVED',
    createdAt: created,
    approvedBy: approver,
    approvalConfirmed: true,
    sourceDiagnosticSha256: digest,
    sourceEvidence: Object.freeze({
      milestone: cleanText(source.milestone),
      patch: cleanText(source.patch),
      checkedAt: cleanText(source.checkedAt),
      pageUrl: cleanText(source.pageUrl),
      roomCode: cleanText(source.twoClientProof?.roomCode).toUpperCase(),
      warnings: Object.freeze(exactArray(source.warnings))
    }),
    releaseIdentity: Object.freeze({
      protocol: PRODUCTION_GO_LIVE_PROTOCOL,
      build: PRODUCTION_GO_LIVE_BUILD,
      releasePatch: PRODUCTION_GO_LIVE_RELEASE_PATCH,
      certifiedFrontendSha: PRODUCTION_GO_LIVE_CERTIFIED_FRONTEND_SHA,
      releaseStatus: PRODUCTION_GO_LIVE_RELEASE_STATUS
    }),
    deployment: Object.freeze({
      frontendOrigin: PRODUCTION_GO_LIVE_FRONTEND_ORIGIN,
      frontendCommitSha: PRODUCTION_GO_LIVE_ACCEPTANCE_COMMIT_SHA,
      workerOrigin: PRODUCTION_GO_LIVE_WORKER_ORIGIN,
      workerVersionId: PRODUCTION_GO_LIVE_WORKER_VERSION_ID
    }),
    rollbackAuthorization: Object.freeze({
      frontendCommitSha: PRODUCTION_GO_LIVE_ROLLBACK_FRONTEND_SHA,
      workerVersionId: PRODUCTION_GO_LIVE_WORKER_VERSION_ID,
      instruction: 'Restore the certified frontend rollback commit; retain the Worker version unless Worker code or release identity changed.'
    }),
    notes: cleanText(notes, '', 1000) || null
  });
}
