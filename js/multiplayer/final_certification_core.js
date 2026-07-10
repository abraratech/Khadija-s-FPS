// js/multiplayer/final_certification_core.js
// M3.77-M3.78 — deterministic multiplayer final certification seal.

import {
  hashMultiplayerCertificationEvidence
} from './certification_pairing_core.js';

export const MULTIPLAYER_FINAL_CERTIFICATION_PATCH = 'm3-final-certification-seal-r1';
export const MULTIPLAYER_FINAL_CERTIFICATION_PROTOCOL = 6;
export const MULTIPLAYER_FINAL_CERTIFICATION_BUILD = 'm3-team-final-world-reconnect-r3';

function cleanText(value, fallback = '', limit = 320) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function cleanStatus(value, fallback = 'UNKNOWN') {
  if (value && typeof value === 'object') {
    return cleanText(
      value.status
      || value.result?.status
      || fallback,
      fallback,
      80
    ).toUpperCase();
  }
  return cleanText(value, fallback, 80).toUpperCase();
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function finding(code, message, details = {}) {
  return Object.freeze({
    code,
    message,
    details: Object.freeze({ ...details })
  });
}

function isFailureStatus(status) {
  return [
    'FAIL',
    'FAILED',
    'INVALID',
    'VIOLATION',
    'STORAGE_BLOCKED',
    'RECOVERY_CONTRADICTION',
    'OWNERSHIP_CONTRADICTION'
  ].includes(cleanStatus(status));
}

function isPassingStatus(status) {
  return [
    'PASS',
    'SEALED',
    'READY',
    'CERTIFIED',
    'RELEASE_READY',
    'OWNER_CONNECTED'
  ].includes(cleanStatus(status));
}

function continuityOf(snapshot) {
  return cleanStatus(
    snapshot?.continuity
    || snapshot?.result?.continuity
    || 'UNKNOWN'
  );
}

function component(name, snapshot) {
  return Object.freeze({
    name,
    status: cleanStatus(snapshot),
    health: cleanStatus(snapshot?.health),
    continuity: continuityOf(snapshot),
    reason: cleanText(
      snapshot?.reason
      || snapshot?.result?.reason
      || '',
      '',
      300
    )
  });
}

export function evaluateMultiplayerFinalCertification({
  session = null,
  pairing = null,
  releaseCandidate = null,
  soak = null,
  recovery = null,
  tabRecovery = null,
  epochFence = null,
  final = true
} = {}) {
  const errors = [];
  const warnings = [];

  const sessionStatus = cleanStatus(session);
  const pairingStatus = cleanStatus(pairing);
  const releaseStatus = cleanStatus(releaseCandidate);
  const soakStatus = cleanStatus(soak);
  const recoveryStatus = cleanStatus(recovery);
  const tabStatus = cleanStatus(tabRecovery);
  const fenceStatus = cleanStatus(epochFence);
  const tabContinuity = continuityOf(tabRecovery);

  const sessionResult = session?.result || {};
  const sessionState = session?.state || {};
  const pairingResult = pairing?.result || {};
  const sessionScenarios = sessionResult.scenarioSummary || {};
  const sessionSamples = sessionResult.sampleSummary || {};

  if (sessionStatus !== 'PASS') {
    errors.push(finding(
      'SESSION_LEDGER_NOT_PASS',
      'The F7 certification session ledger must finish with PASS.',
      { status: sessionStatus }
    ));
  }
  if (sessionState.complete !== true) {
    errors.push(finding(
      'SESSION_LEDGER_NOT_FINALIZED',
      'The F7 certification session has not been finalized.'
    ));
  }
  if (finite(sessionState.sampleCount) < 60) {
    errors.push(finding(
      'SESSION_SAMPLES_INSUFFICIENT',
      'The certification ledger contains fewer than 60 automatic samples.',
      { sampleCount: finite(sessionState.sampleCount) }
    ));
  }
  if (
    finite(sessionScenarios.failed) > 0
    || (final && finite(sessionScenarios.pending) > 0)
  ) {
    errors.push(finding(
      'SESSION_SCENARIOS_INCOMPLETE',
      'All manual certification scenarios must pass.',
      {
        failed: finite(sessionScenarios.failed),
        pending: finite(sessionScenarios.pending)
      }
    ));
  }
  if (finite(sessionSamples.fail) > 0) {
    errors.push(finding(
      'SESSION_AUTOMATIC_FAILURES',
      'The session ledger contains automatic failed samples.',
      { failSamples: finite(sessionSamples.fail) }
    ));
  }

  if (pairingStatus !== 'PASS' || pairingResult.paired !== true) {
    errors.push(finding(
      'DUAL_CLIENT_PAIRING_NOT_PASS',
      'The F6 host/client evidence pairing must finish with PASS.',
      {
        status: pairingStatus,
        paired: pairingResult.paired === true
      }
    ));
  }
  if (finite(pairingResult.overlapMs) < 60000) {
    errors.push(finding(
      'PAIRING_OVERLAP_INSUFFICIENT',
      'The paired host/client evidence must overlap for at least 60 seconds.',
      { overlapMs: finite(pairingResult.overlapMs) }
    ));
  }
  if (
    Array.isArray(pairingResult.errors)
    && pairingResult.errors.length > 0
  ) {
    errors.push(finding(
      'PAIRING_FINDINGS_PRESENT',
      'The paired evidence contains blocking findings.',
      { count: pairingResult.errors.length }
    ));
  }

  for (const [code, label, status] of [
    ['RELEASE_CANDIDATE_FAILURE', 'Release candidate', releaseStatus],
    ['SOAK_FAILURE', 'Burn-in soak', soakStatus],
    ['RECOVERY_FAILURE', 'Recovery certification', recoveryStatus],
    ['TAB_RECOVERY_FAILURE', 'Tab recovery seal', tabStatus],
    ['EPOCH_FENCE_FAILURE', 'Epoch fence', fenceStatus]
  ]) {
    if (isFailureStatus(status)) {
      errors.push(finding(
        code,
        `${label} reports ${status}.`,
        { status }
      ));
    } else if (
      final
      && status !== 'UNKNOWN'
      && !isPassingStatus(status)
      && !['RUNNING', 'OBSERVING'].includes(status)
    ) {
      warnings.push(finding(
        `${code}_UNCONFIRMED`,
        `${label} has not reached a recognized sealed state.`,
        { status }
      ));
    }
  }

  if (
    ![
      'ACTIVE_OWNER',
      'RECLAIMED_OWNER',
      'PASSIVE_TAB',
      'FENCED_OWNER',
      'LEASE_RELEASED'
    ].includes(tabContinuity)
  ) {
    errors.push(finding(
      'TAB_CONTINUITY_NOT_SEALED',
      'Tab ownership continuity is not in a recognized sealed state.',
      { continuity: tabContinuity }
    ));
  }

  if (
    cleanStatus(tabRecovery?.health) === 'FAIL'
    || tabRecovery?.sealed === false
  ) {
    errors.push(finding(
      'TAB_RECOVERY_NOT_SEALED',
      'The tab recovery diagnostic is not sealed and healthy.'
    ));
  }

  if (
    cleanStatus(epochFence?.action) === 'QUIESCE'
    && tabContinuity !== 'FENCED_OWNER'
  ) {
    errors.push(finding(
      'FENCE_QUIESCE_CONTRADICTION',
      'Epoch fencing requested quiescence without a sealed fenced-owner state.'
    ));
  }

  const status = errors.length > 0
    ? 'FAIL'
    : warnings.length > 0
      ? 'WARN'
      : 'PASS';

  return Object.freeze({
    status,
    final: final === true,
    releaseReady: status === 'PASS',
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    components: Object.freeze({
      session: component('F7 Session Ledger', session),
      pairing: component('F6 Evidence Pairing', pairing),
      releaseCandidate: component('F10 Release Candidate', releaseCandidate),
      soak: component('F12 Burn-In Soak', soak),
      recovery: component('Recovery Certification', recovery),
      tabRecovery: component('Tab Recovery Seal', tabRecovery),
      epochFence: component('Epoch Fence', epochFence)
    })
  });
}

export function buildMultiplayerFinalCertificationBundle({
  verdict,
  session = null,
  pairing = null,
  releaseCandidate = null,
  soak = null,
  recovery = null,
  tabRecovery = null,
  epochFence = null,
  metadata = {}
} = {}) {
  const bundle = {
    version: 1,
    milestone: 'M3.77-M3.78',
    patch: MULTIPLAYER_FINAL_CERTIFICATION_PATCH,
    build: MULTIPLAYER_FINAL_CERTIFICATION_BUILD,
    protocol: MULTIPLAYER_FINAL_CERTIFICATION_PROTOCOL,
    exportedAt: new Date().toISOString(),
    verdict,
    evidence: {
      session,
      pairing: pairing
        ? {
            status: pairing.status,
            result: pairing.result,
            settings: pairing.settings,
            localEvidence: pairing.localEvidence,
            peerEvidence: pairing.peerEvidence
          }
        : null,
      releaseCandidate,
      soak,
      recovery,
      tabRecovery,
      epochFence
    },
    metadata: {
      tester: cleanText(metadata?.tester, '', 120),
      notes: cleanText(metadata?.notes, '', 1000)
    }
  };

  return Object.freeze({
    ...bundle,
    digest: hashMultiplayerCertificationEvidence(bundle)
  });
}
