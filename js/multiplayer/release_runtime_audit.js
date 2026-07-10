// js/multiplayer/release_runtime_audit.js
// M3.83-M3.84 — production certification/debug isolation seal.

import {
  MULTIPLAYER_RELEASE_RESTRICTED_GLOBALS,
  MULTIPLAYER_RELEASE_RESTRICTED_PANEL_IDS,
  evaluateMultiplayerReleaseRuntimeAudit
} from './release_runtime_audit_core.js';

const DEBUG_GLOBAL =
  'KHADIJA_MULTIPLAYER_RELEASE_RUNTIME_AUDIT';
const RESAMPLE_DELAYS_MS = Object.freeze([0, 750, 2500]);

let snapshot = null;
let lastFingerprint = '';

function currentLocation() {
  if (typeof window === 'undefined') {
    return { hostname: '', search: '' };
  }
  return {
    hostname: String(window.location?.hostname || ''),
    search: String(window.location?.search || '')
  };
}

function activeRestrictedGlobals(scope) {
  if (!scope) return [];
  return MULTIPLAYER_RELEASE_RESTRICTED_GLOBALS.filter((name) => {
    try {
      return scope[name] !== undefined && scope[name] !== null;
    } catch {
      return false;
    }
  });
}

function activeRestrictedPanelIds() {
  if (typeof document === 'undefined') return [];
  return MULTIPLAYER_RELEASE_RESTRICTED_PANEL_IDS.filter(
    (id) => document.getElementById(id) !== null
  );
}

function fingerprint(value) {
  return JSON.stringify({
    status: value?.status,
    environment: value?.context?.environment,
    globals: value?.activeGlobals,
    panels: value?.activePanelIds
  });
}

function publish(next) {
  snapshot = next;
  const scope = typeof window !== 'undefined' ? window : null;
  const allowed = snapshot?.context?.debugAllowed === true;

  if (scope) {
    try {
      if (allowed) {
        scope[DEBUG_GLOBAL] = snapshot;
      } else {
        delete scope[DEBUG_GLOBAL];
      }
    } catch {
      // Runtime audit publication must never interrupt startup.
    }
  }

  if (typeof document !== 'undefined') {
    try {
      document.documentElement.dataset.kaMultiplayerReleaseAudit =
        snapshot?.status === 'FAIL'
          ? 'fail'
          : allowed
            ? 'debug'
            : 'pass';
    } catch {
      // DOM diagnostics are optional.
    }
  }

  const nextFingerprint = fingerprint(snapshot);
  if (nextFingerprint !== lastFingerprint) {
    lastFingerprint = nextFingerprint;
    if (snapshot?.status === 'FAIL') {
      console.error(
        '[M3.83-M3.84] Multiplayer production runtime audit FAILED.',
        snapshot
      );
      if (
        typeof window !== 'undefined'
        && typeof window.dispatchEvent === 'function'
        && typeof CustomEvent === 'function'
      ) {
        window.dispatchEvent(new CustomEvent(
          'khadija:multiplayer-release-runtime-audit-failed',
          { detail: snapshot }
        ));
      }
    } else {
      console.info(
        `[M3.83-M3.84] Multiplayer runtime audit ${snapshot?.status}.`
      );
    }
  }

  return snapshot;
}

export function runMultiplayerReleaseRuntimeAudit() {
  const location = currentLocation();
  const scope = typeof window !== 'undefined' ? window : null;
  return publish(evaluateMultiplayerReleaseRuntimeAudit({
    hostname: location.hostname,
    search: location.search,
    activeGlobals: activeRestrictedGlobals(scope),
    activePanelIds: activeRestrictedPanelIds(),
    checkedAt: Date.now()
  }));
}

export function getMultiplayerReleaseRuntimeAuditSnapshot() {
  return snapshot;
}

runMultiplayerReleaseRuntimeAudit();

if (
  typeof window !== 'undefined'
  && typeof window.setTimeout === 'function'
) {
  RESAMPLE_DELAYS_MS.forEach((delay) => {
    window.setTimeout(
      () => runMultiplayerReleaseRuntimeAudit(),
      delay
    );
  });
}
