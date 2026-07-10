// js/multiplayer/certification_pairing_core.js
// M3.75-M3.76 — deterministic host/client certification evidence pairing.

export const MULTIPLAYER_CERTIFICATION_PAIRING_PATCH = 'm3-production-release-manifest-r1';
export const MULTIPLAYER_CERTIFICATION_PAIRING_PROTOCOL = 6;
export const MULTIPLAYER_CERTIFICATION_PAIRING_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_CERTIFICATION_PAIRING_MIN_SAMPLES = 60;
export const MULTIPLAYER_CERTIFICATION_PAIRING_MIN_OVERLAP_MS = 60000;

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanText(value, fallback = '', limit = 240) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function cleanStatus(value, fallback = 'UNKNOWN') {
  return cleanText(value, fallback, 80).toUpperCase();
}

function normalizeRole(value) {
  const role = cleanText(value, 'client', 20).toLowerCase();
  return role === 'host' ? 'host' : 'client';
}

function normalizeSessionCode(value) {
  return cleanText(value, '', 64)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '');
}

function normalizeClientId(value) {
  return cleanText(value, '', 160)
    .replace(/[^a-zA-Z0-9:_-]+/g, '');
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (key !== 'digest') {
          result[key] = canonicalize(value[key]);
        }
        return result;
      }, {});
  }
  return value;
}

export function stableMultiplayerCertificationJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function hashMultiplayerCertificationEvidence(value) {
  const text = typeof value === 'string'
    ? value
    : stableMultiplayerCertificationJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeScenarioSummary(value = null) {
  const summary = value && typeof value === 'object' ? value : {};
  return Object.freeze({
    passed: Math.max(0, Math.trunc(finite(summary.passed))),
    failed: Math.max(0, Math.trunc(finite(summary.failed))),
    pending: Math.max(0, Math.trunc(finite(summary.pending))),
    total: Math.max(0, Math.trunc(finite(summary.total)))
  });
}

function normalizeSampleSummary(value = null) {
  const summary = value && typeof value === 'object' ? value : {};
  return Object.freeze({
    pass: Math.max(0, Math.trunc(finite(summary.pass))),
    warn: Math.max(0, Math.trunc(finite(summary.warn))),
    fail: Math.max(0, Math.trunc(finite(summary.fail))),
    activeOwner: Math.max(0, Math.trunc(finite(summary.activeOwner))),
    passiveTab: Math.max(0, Math.trunc(finite(summary.passiveTab))),
    reclaimedOwner: Math.max(0, Math.trunc(finite(summary.reclaimedOwner)))
  });
}

export function createMultiplayerCertificationClientEvidence({
  sessionCode = '',
  clientId = '',
  role = 'client',
  capturedAt = Date.now(),
  certification = null,
  tabRecovery = null,
  epochFence = null,
  metadata = {}
} = {}) {
  const normalizedSessionCode = normalizeSessionCode(sessionCode);
  const normalizedClientId = normalizeClientId(clientId);
  if (!normalizedSessionCode || !normalizedClientId) return null;

  const result = certification?.result || {};
  const state = certification?.state || {};
  const evidence = {
    version: 1,
    milestone: 'M3.75-M3.76',
    patch: MULTIPLAYER_CERTIFICATION_PAIRING_PATCH,
    build: MULTIPLAYER_CERTIFICATION_PAIRING_BUILD,
    protocol: MULTIPLAYER_CERTIFICATION_PAIRING_PROTOCOL,
    sessionCode: normalizedSessionCode,
    clientId: normalizedClientId,
    role: normalizeRole(role),
    capturedAt: finite(capturedAt, Date.now()),
    approximateStartedAt:
      finite(capturedAt, Date.now()) - Math.max(0, finite(state.elapsedMs)),
    certification: Object.freeze({
      status: cleanStatus(certification?.status || result.status),
      running: state.running === true,
      paused: state.paused === true,
      complete: state.complete === true,
      elapsedMs: Math.max(0, finite(state.elapsedMs)),
      targetMs: Math.max(0, finite(state.targetMs)),
      sampleCount: Math.max(0, Math.trunc(finite(state.sampleCount))),
      scenarioSummary: normalizeScenarioSummary(result.scenarioSummary),
      sampleSummary: normalizeSampleSummary(result.sampleSummary),
      errors: Object.freeze(
        Array.isArray(result.errors)
          ? result.errors.map((entry) => Object.freeze({
              code: cleanText(entry?.code, 'UNKNOWN', 100),
              message: cleanText(entry?.message, '', 320)
            }))
          : []
      ),
      warnings: Object.freeze(
        Array.isArray(result.warnings)
          ? result.warnings.map((entry) => Object.freeze({
              code: cleanText(entry?.code, 'UNKNOWN', 100),
              message: cleanText(entry?.message, '', 320)
            }))
          : []
      )
    }),
    tabRecovery: Object.freeze({
      status: cleanStatus(tabRecovery?.status),
      health: cleanStatus(tabRecovery?.health),
      continuity: cleanStatus(tabRecovery?.continuity),
      blocking: tabRecovery?.blocking === true,
      sealed: tabRecovery?.sealed === true
    }),
    epochFence: Object.freeze({
      status: cleanStatus(epochFence?.status),
      health: cleanStatus(epochFence?.health),
      action: cleanStatus(epochFence?.action, 'NONE'),
      blocking: epochFence?.blocking === true
    }),
    metadata: Object.freeze({
      playerName: cleanText(metadata?.playerName, '', 100),
      roomCode: cleanText(metadata?.roomCode, '', 80),
      userAgent: cleanText(metadata?.userAgent, '', 260)
    })
  };

  return Object.freeze({
    ...evidence,
    digest: hashMultiplayerCertificationEvidence(evidence)
  });
}

export function validateMultiplayerCertificationClientEvidence(value) {
  if (!value || typeof value !== 'object') {
    return Object.freeze({
      valid: false,
      errors: Object.freeze(['EVIDENCE_NOT_OBJECT'])
    });
  }

  const errors = [];
  if (cleanText(value.patch) !== MULTIPLAYER_CERTIFICATION_PAIRING_PATCH) {
    errors.push('PATCH_MISMATCH');
  }
  if (cleanText(value.build) !== MULTIPLAYER_CERTIFICATION_PAIRING_BUILD) {
    errors.push('BUILD_MISMATCH');
  }
  if (finite(value.protocol, -1) !== MULTIPLAYER_CERTIFICATION_PAIRING_PROTOCOL) {
    errors.push('PROTOCOL_MISMATCH');
  }
  if (!normalizeSessionCode(value.sessionCode)) {
    errors.push('SESSION_CODE_MISSING');
  }
  if (!normalizeClientId(value.clientId)) {
    errors.push('CLIENT_ID_MISSING');
  }
  if (!['host', 'client'].includes(cleanText(value.role).toLowerCase())) {
    errors.push('ROLE_INVALID');
  }
  const expectedDigest = hashMultiplayerCertificationEvidence(value);
  if (cleanText(value.digest) !== expectedDigest) {
    errors.push('DIGEST_MISMATCH');
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    expectedDigest
  });
}

function finding(code, message, details = {}) {
  return Object.freeze({
    code,
    message,
    details: Object.freeze({ ...details })
  });
}

export function evaluateMultiplayerCertificationPairing({
  localEvidence = null,
  peerEvidence = null,
  final = false
} = {}) {
  const localValidation = validateMultiplayerCertificationClientEvidence(
    localEvidence
  );
  const peerValidation = validateMultiplayerCertificationClientEvidence(
    peerEvidence
  );
  const errors = [];
  const warnings = [];

  if (!localValidation.valid) {
    errors.push(finding(
      'LOCAL_EVIDENCE_INVALID',
      'The local certification evidence is invalid.',
      { errors: localValidation.errors }
    ));
  }
  if (!peerValidation.valid) {
    errors.push(finding(
      'PEER_EVIDENCE_INVALID',
      'The imported peer certification evidence is invalid.',
      { errors: peerValidation.errors }
    ));
  }

  let overlapMs = 0;
  if (localValidation.valid && peerValidation.valid) {
    if (localEvidence.sessionCode !== peerEvidence.sessionCode) {
      errors.push(finding(
        'SESSION_CODE_MISMATCH',
        'The host and client evidence use different session codes.'
      ));
    }
    if (localEvidence.clientId === peerEvidence.clientId) {
      errors.push(finding(
        'CLIENT_ID_COLLISION',
        'Both evidence files came from the same browser client identity.'
      ));
    }
    if (localEvidence.role === peerEvidence.role) {
      errors.push(finding(
        'ROLE_COLLISION',
        'One report must be host and the other must be client.'
      ));
    }
    if (
      localEvidence.protocol !== peerEvidence.protocol
      || localEvidence.build !== peerEvidence.build
      || localEvidence.patch !== peerEvidence.patch
    ) {
      errors.push(finding(
        'VERSION_MISMATCH',
        'The paired reports were created by incompatible game versions.'
      ));
    }

    const overlapStart = Math.max(
      finite(localEvidence.approximateStartedAt),
      finite(peerEvidence.approximateStartedAt)
    );
    const overlapEnd = Math.min(
      finite(localEvidence.capturedAt),
      finite(peerEvidence.capturedAt)
    );
    overlapMs = Math.max(0, overlapEnd - overlapStart);
    if (overlapMs < MULTIPLAYER_CERTIFICATION_PAIRING_MIN_OVERLAP_MS) {
      errors.push(finding(
        'INSUFFICIENT_TIME_OVERLAP',
        'The two reports do not prove at least one minute of simultaneous testing.',
        {
          overlapMs,
          requiredMs: MULTIPLAYER_CERTIFICATION_PAIRING_MIN_OVERLAP_MS
        }
      ));
    }

    for (const [label, report] of [
      ['local', localEvidence],
      ['peer', peerEvidence]
    ]) {
      const certification = report.certification || {};
      const scenarioSummary = certification.scenarioSummary || {};
      const sampleSummary = certification.sampleSummary || {};
      if (
        finite(certification.sampleCount) <
        MULTIPLAYER_CERTIFICATION_PAIRING_MIN_SAMPLES
      ) {
        errors.push(finding(
          'INSUFFICIENT_CLIENT_SAMPLES',
          `${label} evidence contains fewer than 60 automatic samples.`,
          {
            client: label,
            sampleCount: finite(certification.sampleCount)
          }
        ));
      }
      if (cleanStatus(certification.status) === 'FAIL') {
        errors.push(finding(
          'CLIENT_CERTIFICATION_FAILED',
          `${label} certification result is FAIL.`,
          { client: label }
        ));
      }
      if (finite(sampleSummary.fail) > 0) {
        errors.push(finding(
          'CLIENT_AUTOMATIC_FAILURES',
          `${label} evidence contains automatic failed samples.`,
          {
            client: label,
            failSamples: finite(sampleSummary.fail)
          }
        ));
      }
      if (finite(scenarioSummary.failed) > 0) {
        errors.push(finding(
          'CLIENT_SCENARIO_FAILURES',
          `${label} evidence contains failed manual scenarios.`,
          {
            client: label,
            failedScenarios: finite(scenarioSummary.failed)
          }
        ));
      }
      if (final && finite(scenarioSummary.pending) > 0) {
        errors.push(finding(
          'CLIENT_SCENARIOS_PENDING',
          `${label} evidence still has pending scenarios.`,
          {
            client: label,
            pendingScenarios: finite(scenarioSummary.pending)
          }
        ));
      } else if (finite(scenarioSummary.pending) > 0) {
        warnings.push(finding(
          'CLIENT_SCENARIOS_PENDING',
          `${label} evidence still has pending scenarios.`,
          {
            client: label,
            pendingScenarios: finite(scenarioSummary.pending)
          }
        ));
      }
      if (
        cleanStatus(report.tabRecovery?.health) === 'FAIL'
        || cleanStatus(report.tabRecovery?.status) === 'FAILED'
        || cleanStatus(report.epochFence?.status) === 'VIOLATION'
      ) {
        errors.push(finding(
          'CLIENT_RECOVERY_FAILURE',
          `${label} evidence reports a tab recovery or epoch-fence failure.`,
          { client: label }
        ));
      }
      if (
        !['ACTIVE_OWNER', 'RECLAIMED_OWNER', 'PASSIVE_TAB', 'LEASE_RELEASED']
          .includes(cleanStatus(report.tabRecovery?.continuity))
      ) {
        warnings.push(finding(
          'CLIENT_CONTINUITY_UNCONFIRMED',
          `${label} evidence does not contain a sealed continuity state.`,
          {
            client: label,
            continuity: cleanStatus(report.tabRecovery?.continuity)
          }
        ));
      }
    }
  }

  const status = errors.length > 0
    ? 'FAIL'
    : warnings.length > 0
      ? 'WARN'
      : localValidation.valid && peerValidation.valid
        ? 'PASS'
        : 'WAITING';

  return Object.freeze({
    status,
    paired: localValidation.valid && peerValidation.valid,
    final: final === true,
    overlapMs,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    localValidation,
    peerValidation,
    sessionCode: localValidation.valid
      ? localEvidence.sessionCode
      : null,
    localClientId: localValidation.valid
      ? localEvidence.clientId
      : null,
    peerClientId: peerValidation.valid
      ? peerEvidence.clientId
      : null
  });
}
