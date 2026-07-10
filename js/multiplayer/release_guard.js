// js/multiplayer/release_guard.js
// M3.29-M3.30 — runtime public-release guard for multiplayer debug/fault surfaces.

import {
  MULTIPLAYER_RELEASE_GUARD_BUILD,
  MULTIPLAYER_RELEASE_GUARD_PATCH,
  MULTIPLAYER_RELEASE_GUARD_PROTOCOL,
  evaluateMultiplayerReleaseGate,
  resolveMultiplayerDebugPolicy
} from './release_guard_core.js';
import {
  MULTIPLAYER_BUILD_ID,
  MULTIPLAYER_PROTOCOL_VERSION
} from './protocol.js';

const ENFORCE_INTERVAL_MS = 1000;
const IDENTITY_GRACE_MS = 1500;
const DEBUG_PANEL_IDS = Object.freeze([
  'mp-recovery-diagnostics',
  'mp-recovery-certification'
]);

function readStoredDebugFlag() {
  try {
    return window.localStorage?.getItem('khadija:mp-debug') === '1';
  } catch {
    return false;
  }
}

function environmentPolicy() {
  if (typeof window === 'undefined') return resolveMultiplayerDebugPolicy();
  return resolveMultiplayerDebugPolicy({
    hostname: window.location?.hostname || '',
    search: window.location?.search || '',
    globalDebug: window.KHADIJA_MULTIPLAYER_DEBUG === true,
    storedDebug: readStoredDebugFlag()
  });
}

function cleanFaultConfig() {
  return {
    enabled: false,
    outboundLatencyMs: 0,
    inboundLatencyMs: 0,
    jitterMs: 0,
    lossPercent: 0,
    duplicatePercent: 0,
    seed: 1337
  };
}

function declaredIdentity(now, initializedAt) {
  const withinGrace = now - initializedAt < IDENTITY_GRACE_MS;
  if (typeof window === 'undefined') {
    return {
      build: MULTIPLAYER_BUILD_ID,
      patch: MULTIPLAYER_RELEASE_GUARD_PATCH
    };
  }
  return {
    build: typeof window.KHADIJA_MULTIPLAYER_BUILD === 'string'
      ? window.KHADIJA_MULTIPLAYER_BUILD
      : withinGrace ? MULTIPLAYER_BUILD_ID : '',
    patch: typeof window.KHADIJA_MULTIPLAYER_PATCH === 'string'
      ? window.KHADIJA_MULTIPLAYER_PATCH
      : withinGrace ? MULTIPLAYER_RELEASE_GUARD_PATCH : ''
  };
}

export class MultiplayerReleaseGuard {
  constructor({
    runtime,
    session,
    transport,
    diagnostics,
    certification
  } = {}) {
    this.runtime = runtime;
    this.session = session;
    this.transport = transport;
    this.diagnostics = diagnostics;
    this.certification = certification;
    this.initialized = false;
    this.initializedAt = 0;
    this.lastEnforcedAt = -Infinity;
    this.policy = environmentPolicy();
    this.gate = null;
  }

  initialize(now = 0) {
    if (this.initialized) return this.getSnapshot();
    this.initialized = true;
    this.initializedAt = now;
    this.policy = environmentPolicy();
    if (!this.policy.allowed) this.enforcePublicMode('initialize');
    this.lastEnforcedAt = now;
    this.evaluate(now);
    return this.getSnapshot();
  }

  sanitizeBrowserSignals() {
    if (typeof window === 'undefined') return;
    try { window.localStorage?.removeItem('khadija:mp-debug'); } catch { /* Ignore storage failures. */ }
    try { window.KHADIJA_MULTIPLAYER_DEBUG = false; } catch { /* Ignore read-only globals. */ }

    try {
      const url = new URL(window.location.href);
      const hadForbiddenQuery = url.searchParams.has('mpFaults')
        || (url.searchParams.has('mpDebug') && !this.policy.allowed);
      url.searchParams.delete('mpFaults');
      if (!this.policy.allowed) url.searchParams.delete('mpDebug');
      if (hadForbiddenQuery) {
        window.history?.replaceState?.(
          window.history.state,
          '',
          `${url.pathname}${url.search}${url.hash}`
        );
      }
    } catch {
      // URL sanitization is best effort and must never interrupt gameplay.
    }
  }

  removeDebugPanels() {
    if (typeof document === 'undefined') return;
    DEBUG_PANEL_IDS.forEach((id) => document.getElementById(id)?.remove?.());
  }

  enforcePublicMode(reason = 'periodic') {
    if (this.policy.allowed) return false;
    this.sanitizeBrowserSignals();
    this.certification?.abort?.(`release-guard-${reason}`);
    this.certification?.toggle?.(false);
    this.diagnostics?.toggle?.(false);
    this.runtime?.configureFaultSimulation?.(cleanFaultConfig());
    this.runtime?.faultSimulator?.flush?.(`release-guard-${reason}`);
    this.removeDebugPanels();
    return true;
  }

  publishGateStatus() {
    if (typeof window === 'undefined') return;
    try {
      window.KHADIJA_MULTIPLAYER_RELEASE_GATE = this.gate?.status || 'UNKNOWN';
    } catch {
      // The release status is informational and must never interrupt gameplay.
    }
  }

  evaluate(now = 0) {
    const identity = declaredIdentity(now, this.initializedAt);
    const runtimeSnapshot = this.runtime?.getSnapshot?.() || {};
    this.gate = evaluateMultiplayerReleaseGate({
      expectedProtocol: MULTIPLAYER_RELEASE_GUARD_PROTOCOL,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      expectedBuild: MULTIPLAYER_RELEASE_GUARD_BUILD,
      build: identity.build,
      expectedPatch: MULTIPLAYER_RELEASE_GUARD_PATCH,
      patch: identity.patch,
      debugPolicy: this.policy,
      faultSimulation: this.runtime?.getFaultSimulationSnapshot?.() || null,
      recoveryDiagnostics: this.diagnostics?.getSnapshot?.() || null,
      recoveryCertification: this.certification?.getSnapshot?.() || null,
      transportState: this.transport?.getState?.() || 'disconnected',
      reconciliation: this.runtime?.getReconciliationSnapshot?.(Date.now())
        || runtimeSnapshot.reconciliation
        || null,
      runActive: this.session?.run?.active === true
    });
    this.publishGateStatus();
    return this.gate;
  }

  update(now = 0) {
    if (!this.initialized) return null;
    if (now - this.lastEnforcedAt < ENFORCE_INTERVAL_MS) return this.gate;
    this.lastEnforcedAt = now;
    this.policy = environmentPolicy();
    if (!this.policy.allowed) this.enforcePublicMode('periodic');
    return this.evaluate(now);
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      policy: {
        ...this.policy,
        legacySignals: [...(this.policy?.legacySignals || [])]
      },
      gate: this.gate ? {
        ...this.gate,
        errors: [...this.gate.errors],
        warnings: [...this.gate.warnings],
        details: {
          ...this.gate.details,
          awaitingStreams: [...(this.gate.details?.awaitingStreams || [])],
          debugPolicy: {
            ...(this.gate.details?.debugPolicy || {}),
            legacySignals: [...(this.gate.details?.debugPolicy?.legacySignals || [])]
          }
        }
      } : null
    };
  }
}
