// js/multiplayer/tab_recovery_seal.js
// M3.71-M3.72 — runtime ownership recovery final-seal diagnostics.

import {
  evaluateMultiplayerTabRecoverySeal
} from './tab_recovery_seal_core.js';

let leaseSnapshot = null;
let transportSnapshot = null;
let resilienceSnapshot = null;
let ownerProbeSnapshot = null;
let epochFenceSnapshot = null;
let activeSnapshot = null;

function currentActiveRun() {
  const leaseStatus = String(leaseSnapshot?.status || '').toUpperCase();
  return (
    leaseStatus !== 'INACTIVE'
    && Boolean(
      leaseSnapshot?.owner === true
      || leaseSnapshot?.blocking === true
      || transportSnapshot?.transportMode === 'online'
    )
  );
}

function publish(snapshot) {
  activeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  if (typeof window !== 'undefined') {
    try {
      window.KHADIJA_MULTIPLAYER_TAB_RECOVERY_SEAL = activeSnapshot;
    } catch {
      // Diagnostics must never interrupt ownership recovery.
    }
  }
  return activeSnapshot;
}

function evaluate(now = Date.now()) {
  return publish(evaluateMultiplayerTabRecoverySeal({
    lease: leaseSnapshot,
    transport: transportSnapshot,
    resilience: resilienceSnapshot,
    ownerProbe: ownerProbeSnapshot,
    epochFence: epochFenceSnapshot,
    activeRun: currentActiveRun(),
    now
  }));
}

export function syncMultiplayerTabRecoverySealLease(
  snapshot,
  now = Date.now()
) {
  leaseSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  return evaluate(now);
}

export function syncMultiplayerTabRecoverySealTransport(
  snapshot,
  now = Date.now()
) {
  transportSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  return evaluate(now);
}

export function syncMultiplayerTabRecoverySealResilience(
  snapshot,
  now = Date.now()
) {
  resilienceSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  return evaluate(now);
}

export function syncMultiplayerTabRecoverySealProbe(
  snapshot,
  now = Date.now()
) {
  ownerProbeSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  return evaluate(now);
}

export function syncMultiplayerTabRecoverySealFence(
  snapshot,
  now = Date.now()
) {
  epochFenceSnapshot = snapshot ? Object.freeze({ ...snapshot }) : null;
  return evaluate(now);
}

export function getMultiplayerTabRecoverySealSnapshot() {
  return activeSnapshot;
}

evaluate();
