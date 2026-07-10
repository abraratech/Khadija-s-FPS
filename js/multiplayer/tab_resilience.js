// js/multiplayer/tab_resilience.js
// M3.65-M3.66 — runtime single-tab ownership resilience diagnostics.

import {
  evaluateMultiplayerTabResilience
} from './tab_resilience_core.js';
import {
  syncMultiplayerTabRecoverySealResilience
} from './tab_recovery_seal.js';

const LEASE_STORAGE_KEY = 'khadija:mp-tab-lease-v1';

let leaseSnapshot = null;
let transportSnapshot = null;
let activeSnapshot = null;

function readStoredLease() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(LEASE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function currentActiveRun() {
  const leaseStatus = String(leaseSnapshot?.status || '').toUpperCase();
  return !['INACTIVE'].includes(leaseStatus)
    && Boolean(
      leaseSnapshot?.owner === true
      || leaseSnapshot?.blocking === true
      || transportSnapshot?.transportMode === 'online'
    );
}

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_TAB_RESILIENCE = activeSnapshot;
    } catch {
      // Diagnostics must never interrupt ownership enforcement.
    }
  }
  syncMultiplayerTabRecoverySealResilience(activeSnapshot);
  return activeSnapshot;
}

function evaluate(now = Date.now()) {
  const stored = readStoredLease();
  const instanceId = String(leaseSnapshot?.instanceId || '');
  const pageId = String(leaseSnapshot?.pageId || '');
  const storedOwnerMatches = Boolean(
    stored
    && String(stored.instanceId || '') === instanceId
    && String(stored.pageId || '') === pageId
  );

  return publish(evaluateMultiplayerTabResilience({
    lease: leaseSnapshot,
    transport: transportSnapshot,
    activeRun: currentActiveRun(),
    leaseStored: Boolean(stored),
    storedOwnerMatches,
    now
  }));
}

export function syncMultiplayerTabResilienceLease(
  snapshot,
  now = Date.now()
) {
  leaseSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  return evaluate(now);
}

export function syncMultiplayerTabResilienceTransport(
  snapshot,
  now = Date.now()
) {
  transportSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  return evaluate(now);
}

export function getMultiplayerTabResilienceSnapshot() {
  return activeSnapshot;
}

evaluate();
