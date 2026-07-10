// js/multiplayer/build_drift.js
// M3.39-M3.40 — browser runtime for one-shot stale-client recovery.

import {
  evaluateMultiplayerBuildDriftRecovery
} from './build_drift_core.js';
import { armMultiplayerRefreshResume } from './refresh_resume.js';

const ATTEMPT_STORAGE_KEY = 'khadija:mp-build-drift-recovery-v1';
const ATTEMPT_TTL_MS = 5 * 60 * 1000;
const RELOAD_DELAY_MS = 450;

function readAttempt(signature, now) {
  if (typeof window === 'undefined') return false;
  try {
    const stored = JSON.parse(window.sessionStorage?.getItem(ATTEMPT_STORAGE_KEY) || 'null');
    return stored?.signature === signature
      && Number.isFinite(Number(stored?.at))
      && now - Number(stored.at) >= 0
      && now - Number(stored.at) <= ATTEMPT_TTL_MS;
  } catch {
    return false;
  }
}

function writeAttempt(signature, now) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify({
      signature,
      at: now
    }));
  } catch {
    // Restricted storage must not block the mismatch message.
  }
}

async function purgeStaleClientCaches() {
  if (typeof window === 'undefined') return;

  try {
    if (window.caches?.keys) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }
  } catch {
    // CacheStorage is optional.
  }

  try {
    const registrations = await window.navigator?.serviceWorker?.getRegistrations?.();
    if (Array.isArray(registrations)) {
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Service workers are optional.
  }
}

function publishSnapshot(snapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.KHADIJA_MULTIPLAYER_BUILD_DRIFT = Object.freeze({ ...snapshot });
  } catch {
    // Read-only globals must not interrupt lobby handling.
  }
}

export function handleMultiplayerBuildDrift({
  expectedProtocol,
  receivedProtocol,
  expectedBuild,
  receivedBuild
} = {}) {
  const now = Date.now();
  const hostname = typeof window === 'undefined' ? '' : window.location?.hostname || '';
  const href = typeof window === 'undefined' ? 'http://localhost/' : window.location?.href || 'http://localhost/';

  const probe = evaluateMultiplayerBuildDriftRecovery({
    expectedProtocol,
    receivedProtocol,
    expectedBuild,
    receivedBuild,
    hostname,
    href,
    refreshAttempted: false,
    now
  });
  const refreshAttempted = readAttempt(probe.drift.signature, now);
  const result = evaluateMultiplayerBuildDriftRecovery({
    expectedProtocol,
    receivedProtocol,
    expectedBuild,
    receivedBuild,
    hostname,
    href,
    refreshAttempted,
    now
  });

  const snapshot = Object.freeze({
    ...result,
    observedAt: new Date(now).toISOString()
  });
  publishSnapshot(snapshot);

  if (
    result.reloadScheduled
    && result.refreshUrl
    && typeof window !== 'undefined'
    && typeof window.location?.replace === 'function'
  ) {
    armMultiplayerRefreshResume({
      signature: result.drift.signature,
      refreshUrl: result.refreshUrl,
      now
    });
    writeAttempt(result.drift.signature, now);
    window.setTimeout(() => {
      void purgeStaleClientCaches().finally(() => {
        window.location.replace(result.refreshUrl);
      });
    }, RELOAD_DELAY_MS);
  }

  return snapshot;
}
