// js/multiplayer/certification_session_core.js
// M3.73-M3.74 — deterministic two-client certification session ledger.

export const MULTIPLAYER_CERTIFICATION_SESSION_PATCH = 'm3-final-certification-seal-r1';
export const MULTIPLAYER_CERTIFICATION_SESSION_PROTOCOL = 6;
export const MULTIPLAYER_CERTIFICATION_SESSION_BUILD = 'm3-team-final-world-reconnect-r3';
export const MULTIPLAYER_CERTIFICATION_SAMPLE_INTERVAL_MS = 1000;
export const MULTIPLAYER_CERTIFICATION_DEFAULT_TARGET_MS = 10 * 60 * 1000;
export const MULTIPLAYER_CERTIFICATION_MIN_TARGET_MS = 2 * 60 * 1000;
export const MULTIPLAYER_CERTIFICATION_MAX_TARGET_MS = 60 * 60 * 1000;
export const MULTIPLAYER_CERTIFICATION_MAX_EVENTS = 320;

export const MULTIPLAYER_CERTIFICATION_SCENARIOS = Object.freeze([
  Object.freeze({
    key: 'twoClientRoom',
    label: 'Two clients join the same online room'
  }),
  Object.freeze({
    key: 'sharedCombat',
    label: 'Movement, enemies, damage, deaths and targeting stay shared'
  }),
  Object.freeze({
    key: 'sharedEconomy',
    label: 'Points, wall buys, perks, doors, traps and Mystery Box stay shared'
  }),
  Object.freeze({
    key: 'downReviveSpectate',
    label: 'Downed, revive, bleed-out and spectating behave correctly'
  }),
  Object.freeze({
    key: 'reconnectRecovery',
    label: 'Forced disconnect reconnects without invincibility or lost streams'
  }),
  Object.freeze({
    key: 'hostMigration',
    label: 'Host migration preserves authority, run state and enemy simulation'
  }),
  Object.freeze({
    key: 'refreshResume',
    label: 'Refresh and mpRefresh restore the correct room and active run'
  }),
  Object.freeze({
    key: 'tabOwnershipRecovery',
    label: 'Duplicate-tab takeover, crash reclaim and epoch fencing stay correct'
  }),
  Object.freeze({
    key: 'scoreboardSummary',
    label: 'Live scoreboard and final shared run summary match on both clients'
  }),
  Object.freeze({
    key: 'cleanExitRejoin',
    label: 'Leave, team elimination, lobby return and a new join remain clean'
  })
]);

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cleanStatus(value, fallback = 'UNKNOWN') {
  const status = String(value || fallback).trim().toUpperCase();
  return status || fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function freezeObject(value = {}) {
  return Object.freeze({ ...value });
}

function createScenarioState() {
  const scenarios = {};
  MULTIPLAYER_CERTIFICATION_SCENARIOS.forEach(({ key, label }) => {
    scenarios[key] = Object.freeze({
      key,
      label,
      status: 'PENDING',
      note: '',
      updatedAt: null
    });
  });
  return Object.freeze(scenarios);
}

function normalizeScenarioStatus(value) {
  const status = cleanStatus(value, 'PENDING');
  return ['PENDING', 'PASS', 'FAIL'].includes(status)
    ? status
    : 'PENDING';
}

function event(at, severity, code, message, details = {}) {
  return Object.freeze({
    at: finite(at, Date.now()),
    severity: cleanStatus(severity, 'INFO'),
    code: cleanText(code, 'CERTIFICATION_EVENT').slice(0, 100),
    message: cleanText(message).slice(0, 320),
    details: freezeObject(details)
  });
}

function appendEvent(events, nextEvent) {
  const next = [...(Array.isArray(events) ? events : []), nextEvent];
  if (next.length > MULTIPLAYER_CERTIFICATION_MAX_EVENTS) {
    next.splice(0, next.length - MULTIPLAYER_CERTIFICATION_MAX_EVENTS);
  }
  return Object.freeze(next);
}

export function normalizeMultiplayerCertificationTargetMs(
  value,
  fallback = MULTIPLAYER_CERTIFICATION_DEFAULT_TARGET_MS
) {
  return Math.round(clamp(
    finite(value, fallback),
    MULTIPLAYER_CERTIFICATION_MIN_TARGET_MS,
    MULTIPLAYER_CERTIFICATION_MAX_TARGET_MS
  ));
}

export function createMultiplayerCertificationSession({
  targetMs = MULTIPLAYER_CERTIFICATION_DEFAULT_TARGET_MS,
  startedAt = null,
  running = false
} = {}) {
  const start = startedAt === null ? null : finite(startedAt, 0);
  return Object.freeze({
    version: 1,
    patch: MULTIPLAYER_CERTIFICATION_SESSION_PATCH,
    build: MULTIPLAYER_CERTIFICATION_SESSION_BUILD,
    protocol: MULTIPLAYER_CERTIFICATION_SESSION_PROTOCOL,
    targetMs: normalizeMultiplayerCertificationTargetMs(targetMs),
    running: running === true,
    paused: false,
    complete: false,
    startedAt: start,
    stoppedAt: null,
    lastSampleAt: start,
    elapsedMs: 0,
    sampleCount: 0,
    passSamples: 0,
    warnSamples: 0,
    failSamples: 0,
    contradictionSamples: 0,
    connectedOwnerSamples: 0,
    passiveTabSamples: 0,
    reclaimedOwnerSamples: 0,
    releaseCandidateFailures: 0,
    soakFailures: 0,
    recoveryFailures: 0,
    lastCompositeStatus: 'UNKNOWN',
    lastContinuity: 'UNKNOWN',
    scenarios: createScenarioState(),
    events: Object.freeze([])
  });
}

export function setMultiplayerCertificationRunState(
  state,
  {
    running = state?.running === true,
    paused = state?.paused === true,
    complete = state?.complete === true,
    at = Date.now(),
    reason = 'state-change'
  } = {}
) {
  const current = state || createMultiplayerCertificationSession();
  const nextRunning = running === true;
  const nextPaused = nextRunning && paused === true;
  const nextComplete = complete === true;
  const code = nextComplete
    ? 'CERTIFICATION_COMPLETED'
    : nextPaused
      ? 'CERTIFICATION_PAUSED'
      : nextRunning
        ? 'CERTIFICATION_STARTED'
        : 'CERTIFICATION_STOPPED';
  const message = nextComplete
    ? 'Certification session marked complete.'
    : nextPaused
      ? 'Certification session paused.'
      : nextRunning
        ? 'Certification session running.'
        : 'Certification session stopped.';

  return Object.freeze({
    ...current,
    running: nextRunning,
    paused: nextPaused,
    complete: nextComplete,
    stoppedAt: nextComplete || !nextRunning
      ? finite(at, Date.now())
      : null,
    events: appendEvent(
      current.events,
      event(at, nextPaused ? 'WARN' : 'INFO', code, message, { reason })
    )
  });
}

export function recordMultiplayerCertificationScenario(
  state,
  {
    key = '',
    status = 'PENDING',
    note = '',
    at = Date.now()
  } = {}
) {
  const current = state || createMultiplayerCertificationSession();
  const definition = MULTIPLAYER_CERTIFICATION_SCENARIOS.find(
    (entry) => entry.key === key
  );
  if (!definition) return current;

  const normalizedStatus = normalizeScenarioStatus(status);
  const previous = current.scenarios?.[key] || {
    key,
    label: definition.label,
    status: 'PENDING',
    note: '',
    updatedAt: null
  };
  const nextScenario = Object.freeze({
    key,
    label: definition.label,
    status: normalizedStatus,
    note: cleanText(note).slice(0, 500),
    updatedAt: finite(at, Date.now())
  });
  const scenarios = Object.freeze({
    ...current.scenarios,
    [key]: nextScenario
  });

  return Object.freeze({
    ...current,
    scenarios,
    events: appendEvent(
      current.events,
      event(
        at,
        normalizedStatus === 'FAIL'
          ? 'FAIL'
          : normalizedStatus === 'PASS'
            ? 'INFO'
            : 'WARN',
        'SCENARIO_UPDATED',
        `${definition.label}: ${previous.status} → ${normalizedStatus}.`,
        {
          key,
          from: previous.status,
          to: normalizedStatus,
          note: nextScenario.note
        }
      )
    )
  });
}

function sampleStatus(sample = {}) {
  const statuses = [
    cleanStatus(sample.releaseCandidateStatus),
    cleanStatus(sample.soakStatus),
    cleanStatus(sample.recoveryStatus),
    cleanStatus(sample.tabRecoveryStatus),
    cleanStatus(sample.epochFenceStatus)
  ];

  const continuity = cleanStatus(sample.tabRecoveryContinuity);
  const contradiction = (
    statuses.includes('FAILED')
    || statuses.includes('FAIL')
    || continuity.includes('CONTRADICTION')
    || cleanStatus(sample.tabRecoveryReason).includes('CONTRADICTION')
  );

  if (contradiction) return 'FAIL';
  if (
    statuses.includes('WARN')
    || statuses.includes('RECOVERING')
    || statuses.includes('OBSERVING')
  ) {
    return 'WARN';
  }
  return 'PASS';
}

export function recordMultiplayerCertificationSample(
  state,
  rawSample = {}
) {
  const current = state || createMultiplayerCertificationSession();
  if (!current.running || current.paused || current.complete) return current;

  const at = finite(rawSample.at, Date.now());
  const deltaMs = clamp(
    finite(
      rawSample.deltaMs,
      at - finite(current.lastSampleAt, at)
    ),
    0,
    5000
  );
  const compositeStatus = sampleStatus(rawSample);
  const continuity = cleanStatus(
    rawSample.tabRecoveryContinuity,
    'UNKNOWN'
  );
  const releaseStatus = cleanStatus(
    rawSample.releaseCandidateStatus,
    'UNKNOWN'
  );
  const soakStatus = cleanStatus(rawSample.soakStatus, 'UNKNOWN');
  const recoveryStatus = cleanStatus(
    rawSample.recoveryStatus,
    'UNKNOWN'
  );
  const contradiction = (
    compositeStatus === 'FAIL'
    && (
      continuity.includes('CONTRADICTION')
      || cleanStatus(rawSample.tabRecoveryReason).includes('CONTRADICTION')
    )
  );

  let events = current.events;
  if (compositeStatus !== current.lastCompositeStatus) {
    events = appendEvent(
      events,
      event(
        at,
        compositeStatus === 'FAIL'
          ? 'FAIL'
          : compositeStatus === 'WARN'
            ? 'WARN'
            : 'INFO',
        'COMPOSITE_HEALTH_TRANSITION',
        `Certification health changed from ${current.lastCompositeStatus} to ${compositeStatus}.`,
        {
          from: current.lastCompositeStatus,
          to: compositeStatus
        }
      )
    );
  }
  if (continuity !== current.lastContinuity) {
    events = appendEvent(
      events,
      event(
        at,
        continuity.includes('CONTRADICTION') ? 'FAIL' : 'INFO',
        'TAB_CONTINUITY_TRANSITION',
        `Tab recovery continuity changed from ${current.lastContinuity} to ${continuity}.`,
        {
          from: current.lastContinuity,
          to: continuity
        }
      )
    );
  }

  return Object.freeze({
    ...current,
    lastSampleAt: at,
    elapsedMs: current.elapsedMs + deltaMs,
    sampleCount: current.sampleCount + 1,
    passSamples: current.passSamples + (compositeStatus === 'PASS' ? 1 : 0),
    warnSamples: current.warnSamples + (compositeStatus === 'WARN' ? 1 : 0),
    failSamples: current.failSamples + (compositeStatus === 'FAIL' ? 1 : 0),
    contradictionSamples:
      current.contradictionSamples + (contradiction ? 1 : 0),
    connectedOwnerSamples:
      current.connectedOwnerSamples
      + (continuity === 'ACTIVE_OWNER' ? 1 : 0),
    passiveTabSamples:
      current.passiveTabSamples
      + (continuity === 'PASSIVE_TAB' ? 1 : 0),
    reclaimedOwnerSamples:
      current.reclaimedOwnerSamples
      + (continuity === 'RECLAIMED_OWNER' ? 1 : 0),
    releaseCandidateFailures:
      current.releaseCandidateFailures
      + (releaseStatus === 'FAIL' ? 1 : 0),
    soakFailures:
      current.soakFailures + (soakStatus === 'FAIL' ? 1 : 0),
    recoveryFailures:
      current.recoveryFailures
      + (recoveryStatus === 'FAIL' || recoveryStatus === 'FAILED' ? 1 : 0),
    lastCompositeStatus: compositeStatus,
    lastContinuity: continuity,
    events
  });
}

function issue(code, message, details = {}) {
  return Object.freeze({
    code,
    message,
    details: freezeObject(details)
  });
}

export function evaluateMultiplayerCertificationSession(
  state,
  { final = false } = {}
) {
  const current = state || createMultiplayerCertificationSession();
  const complete = current.complete
    || final
    || current.elapsedMs >= current.targetMs;
  const errors = [];
  const warnings = [];
  const scenarioValues = MULTIPLAYER_CERTIFICATION_SCENARIOS.map(
    ({ key }) => current.scenarios?.[key] || { status: 'PENDING' }
  );
  const passedScenarios = scenarioValues.filter(
    (entry) => entry.status === 'PASS'
  ).length;
  const failedScenarios = scenarioValues.filter(
    (entry) => entry.status === 'FAIL'
  ).length;
  const pendingScenarios = scenarioValues.length
    - passedScenarios
    - failedScenarios;

  if (current.contradictionSamples > 0) {
    errors.push(issue(
      'RECOVERY_CONTRADICTION',
      'A recovery contradiction was sampled during certification.',
      { count: current.contradictionSamples }
    ));
  }
  if (current.failSamples > 0) {
    errors.push(issue(
      'AUTOMATIC_HEALTH_FAILURE',
      'At least one automatic certification sample failed.',
      { count: current.failSamples }
    ));
  }
  if (current.releaseCandidateFailures > 0) {
    errors.push(issue(
      'RELEASE_CANDIDATE_FAILURE',
      'Release-candidate health reported FAIL during the session.',
      { count: current.releaseCandidateFailures }
    ));
  }
  if (current.soakFailures > 0) {
    errors.push(issue(
      'SOAK_FAILURE',
      'Burn-in soak health reported FAIL during the session.',
      { count: current.soakFailures }
    ));
  }
  if (current.recoveryFailures > 0) {
    errors.push(issue(
      'RECOVERY_FAILURE',
      'Recovery health reported FAIL during the session.',
      { count: current.recoveryFailures }
    ));
  }
  if (failedScenarios > 0) {
    errors.push(issue(
      'MANUAL_SCENARIO_FAILURE',
      `${failedScenarios} manual certification scenario(s) failed.`,
      { failedScenarios }
    ));
  }

  if (current.sampleCount === 0) {
    warnings.push(issue(
      'NO_SAMPLES',
      'No automatic certification samples have been recorded.'
    ));
  }
  if (pendingScenarios > 0) {
    warnings.push(issue(
      'SCENARIOS_PENDING',
      `${pendingScenarios} certification scenario(s) remain pending.`,
      { pendingScenarios }
    ));
  }
  if (complete && current.elapsedMs < current.targetMs) {
    warnings.push(issue(
      'TARGET_NOT_REACHED',
      'The certification session was finalized before reaching its target.',
      {
        elapsedMs: current.elapsedMs,
        targetMs: current.targetMs
      }
    ));
  }
  if (complete && current.sampleCount < 60) {
    errors.push(issue(
      'INSUFFICIENT_SAMPLES',
      'At least 60 automatic samples are required for final certification.',
      { sampleCount: current.sampleCount }
    ));
  }
  if (
    complete
    && current.connectedOwnerSamples === 0
  ) {
    errors.push(issue(
      'ACTIVE_OWNER_NOT_OBSERVED',
      'No ACTIVE_OWNER continuity sample was captured.'
    ));
  }

  let status = 'IDLE';
  if (complete) {
    status = errors.length > 0
      ? 'FAIL'
      : warnings.length > 0
        ? 'WARN'
        : 'PASS';
  } else if (errors.length > 0) {
    status = 'FAIL';
  } else if (current.paused) {
    status = 'PAUSED';
  } else if (current.running) {
    status = warnings.length > 0 ? 'WARN' : 'RUNNING';
  } else if (current.sampleCount > 0 || passedScenarios > 0) {
    status = warnings.length > 0 ? 'WARN' : 'READY';
  }

  return Object.freeze({
    status,
    complete,
    elapsedMs: current.elapsedMs,
    targetMs: current.targetMs,
    progress: clamp(
      current.elapsedMs / Math.max(1, current.targetMs),
      0,
      1
    ),
    sampleCount: current.sampleCount,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    scenarioSummary: Object.freeze({
      passed: passedScenarios,
      failed: failedScenarios,
      pending: pendingScenarios,
      total: MULTIPLAYER_CERTIFICATION_SCENARIOS.length
    }),
    sampleSummary: Object.freeze({
      pass: current.passSamples,
      warn: current.warnSamples,
      fail: current.failSamples,
      activeOwner: current.connectedOwnerSamples,
      passiveTab: current.passiveTabSamples,
      reclaimedOwner: current.reclaimedOwnerSamples
    })
  });
}

export function buildMultiplayerCertificationEvidence(
  state,
  result = evaluateMultiplayerCertificationSession(state)
) {
  const current = state || createMultiplayerCertificationSession();
  return Object.freeze({
    milestone: 'M3.73-M3.74',
    patch: MULTIPLAYER_CERTIFICATION_SESSION_PATCH,
    build: MULTIPLAYER_CERTIFICATION_SESSION_BUILD,
    protocol: MULTIPLAYER_CERTIFICATION_SESSION_PROTOCOL,
    exportedAt: new Date().toISOString(),
    result,
    session: Object.freeze({
      startedAt: current.startedAt,
      stoppedAt: current.stoppedAt,
      elapsedMs: current.elapsedMs,
      targetMs: current.targetMs,
      sampleCount: current.sampleCount
    }),
    scenarios: Object.freeze({ ...current.scenarios }),
    events: Object.freeze([...(current.events || [])])
  });
}
