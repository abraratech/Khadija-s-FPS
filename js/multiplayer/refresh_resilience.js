// js/multiplayer/refresh_resilience.js
// M3.53-M3.54 — browser runtime for the final refresh resilience seal.

import {
  evaluateMultiplayerRefreshResilience
} from './refresh_resilience_core.js';

const RESUME_STORAGE_KEY = 'khadija:mp-refresh-room-resume-v1';
const RECOVERY_STORAGE_KEY = 'khadija:mp-refresh-recovery-v1';

let latestReadiness = null;
let latestRecovery = null;
let activeSnapshot = null;

function storageHas(key) {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.sessionStorage?.getItem(key));
  } catch {
    return false;
  }
}

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_REFRESH_RESILIENCE = activeSnapshot;
    } catch {
      // Final diagnostics must never interrupt gameplay recovery.
    }
  }
  return activeSnapshot;
}

export function syncMultiplayerRefreshResilience(
  update = {},
  now = Date.now()
) {
  if (update && typeof update === 'object') {
    if (Object.prototype.hasOwnProperty.call(update, 'readiness')) {
      latestReadiness = update.readiness || null;
    }
    if (Object.prototype.hasOwnProperty.call(update, 'recovery')) {
      latestRecovery = update.recovery || null;
    }
  }

  return publish(evaluateMultiplayerRefreshResilience({
    readiness: latestReadiness,
    recovery: latestRecovery,
    resumeIntentPresent: storageHas(RESUME_STORAGE_KEY),
    recoveryIntentPresent: storageHas(RECOVERY_STORAGE_KEY),
    now
  }));
}

export function resetMultiplayerRefreshResilience(now = Date.now()) {
  latestReadiness = null;
  latestRecovery = null;
  return syncMultiplayerRefreshResilience({}, now);
}

export function getMultiplayerRefreshResilienceSnapshot() {
  return activeSnapshot;
}
