// js/multiplayer/suspend_resilience.js
// M3.59-M3.60 — runtime suspension recovery resilience diagnostics.

import {
  evaluateMultiplayerSuspendResilience
} from './suspend_resilience_core.js';

const INCIDENT_STORAGE_KEY = 'khadija:mp-suspend-resume-v1';

let guardSnapshot = null;
let probeSnapshot = null;
let activeSnapshot = null;

function hasRefreshHandoff() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location?.search || '').has('mpRefresh');
  } catch {
    return false;
  }
}

function hasStoredIncident() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.sessionStorage?.getItem(INCIDENT_STORAGE_KEY));
  } catch {
    return false;
  }
}

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_SUSPEND_RESILIENCE = activeSnapshot;
    } catch {
      // Diagnostics must never interrupt lifecycle recovery.
    }
  }
  return activeSnapshot;
}

function evaluate(now = Date.now()) {
  return publish(evaluateMultiplayerSuspendResilience({
    guard: guardSnapshot,
    probe: probeSnapshot,
    handoffActive: hasRefreshHandoff(),
    incidentStored: hasStoredIncident(),
    now
  }));
}

export function syncMultiplayerSuspendResilienceGuard(
  snapshot,
  now = Date.now()
) {
  guardSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  return evaluate(now);
}

export function syncMultiplayerSuspendResilienceProbe(
  snapshot,
  now = Date.now()
) {
  probeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  return evaluate(now);
}

export function getMultiplayerSuspendResilienceSnapshot() {
  return activeSnapshot;
}

evaluate();
