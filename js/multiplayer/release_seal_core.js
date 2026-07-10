// js/multiplayer/release_seal_core.js
// M3.37-M3.38 — deterministic multiplayer release-seal and deployment-acceptance evaluation.

export const MULTIPLAYER_RELEASE_SEAL_PATCH = 'm3-production-release-manifest-r1';
export const MULTIPLAYER_RELEASE_SEAL_PROTOCOL = 6;
export const MULTIPLAYER_RELEASE_SEAL_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_RELEASE_SEAL_VERSION = 1;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanStatus(value, fallback = 'UNKNOWN') {
  const status = String(value || fallback).trim().toUpperCase();
  return status || fallback;
}

function issue(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function check(id, status, label, details = {}) {
  return Object.freeze({
    id,
    status: cleanStatus(status),
    label,
    details: Object.freeze({ ...details })
  });
}

function statusOf(snapshot, fallback = 'MISSING') {
  return cleanStatus(snapshot?.status || snapshot?.result?.status || snapshot?.state, fallback);
}

function guardGate(snapshot = {}) {
  return snapshot?.gate && typeof snapshot.gate === 'object' ? snapshot.gate : null;
}

function normalizedChecklist(checklist = {}) {
  const source = checklist && typeof checklist === 'object' ? checklist : {};
  const keys = Object.keys(source).sort();
  const completed = keys.filter((key) => source[key] === true);
  return Object.freeze({
    total: keys.length,
    completed: completed.length,
    complete: keys.length > 0 && completed.length === keys.length,
    keys: Object.freeze(keys),
    completedKeys: Object.freeze(completed)
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).sort().forEach((key) => {
      const next = value[key];
      if (next !== undefined) result[key] = stableValue(next);
    });
    return result;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return value ?? null;
}

export function stableMultiplayerReleaseSealStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function hashMultiplayerReleaseSealValue(value) {
  const text = typeof value === 'string' ? value : stableMultiplayerReleaseSealStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').toUpperCase();
}

export function summarizeMultiplayerReleaseSealEvidence({
  protocolVersion = MULTIPLAYER_RELEASE_SEAL_PROTOCOL,
  build = MULTIPLAYER_RELEASE_SEAL_BUILD,
  patch = MULTIPLAYER_RELEASE_SEAL_PATCH,
  releaseGuard = null,
  recoveryCertification = null,
  releaseCandidate = null,
  launchObserver = null,
  soakCertification = null
} = {}) {
  const guard = releaseGuard || {};
  const gate = guardGate(guard);
  const candidate = releaseCandidate || {};
  const observer = launchObserver || {};
  const soak = soakCertification || {};
  const soakResult = soak.result || {};
  const soakState = soak.state || {};
  const checklist = normalizedChecklist(candidate.checklist || candidate.result?.checklist || {});
  const policy = guard.policy || {};
  const legacySignals = Array.isArray(policy.legacySignals)
    ? policy.legacySignals.filter(Boolean).map(String).sort()
    : [];

  return Object.freeze({
    version: MULTIPLAYER_RELEASE_SEAL_VERSION,
    identity: Object.freeze({
      protocol: finite(protocolVersion),
      build: String(build || ''),
      patch: String(patch || '')
    }),
    statuses: Object.freeze({
      releaseGuard: cleanStatus(gate?.status, 'MISSING'),
      recoveryCertification: statusOf(recoveryCertification),
      releaseCandidate: statusOf(candidate),
      launchObserver: statusOf(observer),
      soakCertification: statusOf(soak)
    }),
    debugPolicy: Object.freeze({
      allowed: policy.allowed === true,
      loopback: policy.loopback === true,
      explicitRequested: policy.explicitRequested === true,
      legacySignals: Object.freeze(legacySignals)
    }),
    releaseCandidate: Object.freeze({
      checklistComplete: checklist.complete,
      completedManualChecks: checklist.completed,
      totalManualChecks: checklist.total
    }),
    soak: Object.freeze({
      complete: soakState.complete === true || soakResult.complete === true,
      running: soakState.running === true,
      paused: soakState.paused === true,
      elapsedMs: Math.max(0, finite(soakState.elapsedMs, soakResult.elapsedMs)),
      targetMs: Math.max(0, finite(soakState.targetMs, soakResult.targetMs)),
      sampleCount: Math.max(0, Math.floor(finite(soakState.sampleCount, soakResult.sampleCount))),
      metrics: Object.freeze({
        maxDisconnectMs: Math.max(0, finite(soakResult.metrics?.maxDisconnectMs)),
        maxRecoveryMs: Math.max(0, finite(soakResult.metrics?.maxRecoveryMs)),
        maxLaunchFailStreakMs: Math.max(0, finite(soakResult.metrics?.maxLaunchFailStreakMs)),
        maxRttMs: Math.max(0, finite(soakResult.metrics?.maxRttMs)),
        maxJitterMs: Math.max(0, finite(soakResult.metrics?.maxJitterMs)),
        maxLossPct: Math.max(0, finite(soakResult.metrics?.maxLossPct)),
        authorityEpochRegressions: Math.max(0, Math.floor(finite(soakResult.metrics?.authorityEpochRegressions))),
        faultSamples: Math.max(0, Math.floor(finite(soakResult.metrics?.faultSamples)))
      })
    })
  });
}

export function buildMultiplayerReleaseSealFingerprint(summary) {
  const normalized = stableMultiplayerReleaseSealStringify(summary);
  return `KA-MP-${hashMultiplayerReleaseSealValue(normalized)}`;
}

export function evaluateMultiplayerReleaseSeal({
  expectedProtocol = MULTIPLAYER_RELEASE_SEAL_PROTOCOL,
  protocolVersion = expectedProtocol,
  expectedBuild = MULTIPLAYER_RELEASE_SEAL_BUILD,
  build = expectedBuild,
  expectedPatch = MULTIPLAYER_RELEASE_SEAL_PATCH,
  patch = expectedPatch,
  releaseGuard = null,
  recoveryCertification = null,
  releaseCandidate = null,
  launchObserver = null,
  soakCertification = null
} = {}) {
  const errors = [];
  const warnings = [];
  const passes = [];
  const checks = [];
  const summary = summarizeMultiplayerReleaseSealEvidence({
    protocolVersion,
    build,
    patch,
    releaseGuard,
    recoveryCertification,
    releaseCandidate,
    launchObserver,
    soakCertification
  });

  if (Number(protocolVersion) !== Number(expectedProtocol)) {
    errors.push(issue('PROTOCOL_MISMATCH', `Expected protocol ${expectedProtocol}, received ${protocolVersion}.`));
    checks.push(check('identity-protocol', 'FAIL', 'Frontend protocol identity'));
  } else {
    passes.push(issue('PROTOCOL_MATCH', `Protocol ${expectedProtocol} matches the release seal.`));
    checks.push(check('identity-protocol', 'PASS', 'Frontend protocol identity'));
  }

  if (String(build || '') !== String(expectedBuild || '')) {
    errors.push(issue('BUILD_MISMATCH', `Expected build ${expectedBuild}, received ${build || 'missing'}.`));
    checks.push(check('identity-build', 'FAIL', 'Frontend build identity'));
  } else {
    passes.push(issue('BUILD_MATCH', `Build ${expectedBuild} matches the release seal.`));
    checks.push(check('identity-build', 'PASS', 'Frontend build identity'));
  }

  if (String(patch || '') !== String(expectedPatch || '')) {
    errors.push(issue('PATCH_MISMATCH', `Expected patch ${expectedPatch}, received ${patch || 'missing'}.`));
    checks.push(check('identity-patch', 'FAIL', 'Frontend patch identity'));
  } else {
    passes.push(issue('PATCH_MATCH', `Patch ${expectedPatch} matches the release seal.`));
    checks.push(check('identity-patch', 'PASS', 'Frontend patch identity'));
  }

  const guard = releaseGuard || {};
  const gate = guardGate(guard);
  const gateErrors = Array.isArray(gate?.errors) ? gate.errors.filter(Boolean) : [];
  if (!gate) {
    errors.push(issue('RELEASE_GUARD_MISSING', 'The public-release guard has not published a gate result.'));
    checks.push(check('release-guard', 'FAIL', 'Public release guard'));
  } else if (cleanStatus(gate.status) === 'FAIL' || gateErrors.length > 0) {
    errors.push(issue('RELEASE_GUARD_FAILED', 'The public-release guard reports a blocking failure.', {
      gateStatus: cleanStatus(gate.status),
      errors: gateErrors.map(String)
    }));
    checks.push(check('release-guard', 'FAIL', 'Public release guard'));
  } else {
    passes.push(issue('RELEASE_GUARD_READY', 'The public-release guard has no blocking failure.'));
    checks.push(check('release-guard', 'PASS', 'Public release guard', { gateStatus: cleanStatus(gate.status) }));
  }

  const policy = summary.debugPolicy;
  if (!policy.allowed || !policy.loopback || !policy.explicitRequested) {
    errors.push(issue('DEBUG_POLICY_INVALID', 'Release sealing is allowed only through explicit loopback debug mode.', policy));
    checks.push(check('debug-policy', 'FAIL', 'Explicit loopback-only debug policy'));
  } else if (policy.legacySignals.length > 0) {
    errors.push(issue('LEGACY_DEBUG_SIGNAL', 'Legacy debug activation signals remain present.', {
      legacySignals: [...policy.legacySignals]
    }));
    checks.push(check('debug-policy', 'FAIL', 'Explicit loopback-only debug policy'));
  } else {
    passes.push(issue('DEBUG_POLICY_SAFE', 'Release sealing is running through explicit loopback-only debug mode.'));
    checks.push(check('debug-policy', 'PASS', 'Explicit loopback-only debug policy'));
  }

  const requiredStatuses = [
    ['recovery-certification', 'Recovery certification', summary.statuses.recoveryCertification],
    ['release-candidate', 'Release-candidate acceptance', summary.statuses.releaseCandidate],
    ['launch-observer', 'Launch-session observer', summary.statuses.launchObserver],
    ['soak-certification', 'Burn-in soak certification', summary.statuses.soakCertification]
  ];
  requiredStatuses.forEach(([id, label, status]) => {
    if (status === 'PASS') {
      passes.push(issue(`${String(id).replaceAll('-', '_').toUpperCase()}_PASS`, `${label} reports PASS.`));
      checks.push(check(id, 'PASS', label));
    } else if (status === 'FAIL') {
      errors.push(issue(`${String(id).replaceAll('-', '_').toUpperCase()}_FAIL`, `${label} reports FAIL.`));
      checks.push(check(id, 'FAIL', label));
    } else {
      warnings.push(issue(`${String(id).replaceAll('-', '_').toUpperCase()}_PENDING`, `${label} is ${status}.`));
      checks.push(check(id, 'WARN', label, { status }));
    }
  });

  if (!summary.releaseCandidate.checklistComplete) {
    warnings.push(issue('MANUAL_ACCEPTANCE_INCOMPLETE', 'The F10 manual two-client and deployment checklist is incomplete.', {
      completed: summary.releaseCandidate.completedManualChecks,
      total: summary.releaseCandidate.totalManualChecks
    }));
    checks.push(check('manual-acceptance', 'WARN', 'Manual two-client and deployment acceptance', {
      completed: summary.releaseCandidate.completedManualChecks,
      total: summary.releaseCandidate.totalManualChecks
    }));
  } else {
    passes.push(issue('MANUAL_ACCEPTANCE_COMPLETE', 'The F10 manual two-client and deployment checklist is complete.'));
    checks.push(check('manual-acceptance', 'PASS', 'Manual two-client and deployment acceptance', {
      completed: summary.releaseCandidate.completedManualChecks,
      total: summary.releaseCandidate.totalManualChecks
    }));
  }

  if (!summary.soak.complete || summary.soak.running || summary.soak.paused) {
    warnings.push(issue('SOAK_NOT_FINAL', 'The F12 soak must be completed and finalized before sealing.', {
      complete: summary.soak.complete,
      running: summary.soak.running,
      paused: summary.soak.paused
    }));
    checks.push(check('soak-finalization', 'WARN', 'Completed and finalized burn-in soak'));
  } else if (summary.soak.sampleCount <= 0) {
    errors.push(issue('SOAK_EVIDENCE_EMPTY', 'The finalized soak contains no samples.'));
    checks.push(check('soak-finalization', 'FAIL', 'Completed and finalized burn-in soak'));
  } else {
    passes.push(issue('SOAK_FINALIZED', 'The F12 soak is complete and contains certification samples.'));
    checks.push(check('soak-finalization', 'PASS', 'Completed and finalized burn-in soak', {
      sampleCount: summary.soak.sampleCount,
      elapsedMs: summary.soak.elapsedMs,
      targetMs: summary.soak.targetMs
    }));
  }

  const status = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';
  const fingerprint = status === 'PASS' ? buildMultiplayerReleaseSealFingerprint(summary) : null;

  return Object.freeze({
    status,
    sealed: status === 'PASS',
    fingerprint,
    summary,
    checks: Object.freeze(checks),
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    passes: Object.freeze(passes)
  });
}

export function buildMultiplayerReleaseSealReport(evidence = {}, result = evaluateMultiplayerReleaseSeal(evidence), {
  createdAt = new Date().toISOString()
} = {}) {
  return Object.freeze({
    milestone: 'M3.37-M3.38',
    version: MULTIPLAYER_RELEASE_SEAL_VERSION,
    patch: MULTIPLAYER_RELEASE_SEAL_PATCH,
    build: MULTIPLAYER_RELEASE_SEAL_BUILD,
    protocol: MULTIPLAYER_RELEASE_SEAL_PROTOCOL,
    createdAt: String(createdAt),
    status: result.status,
    sealed: result.sealed,
    fingerprint: result.fingerprint,
    checks: result.checks,
    errors: result.errors,
    warnings: result.warnings,
    summary: result.summary
  });
}
