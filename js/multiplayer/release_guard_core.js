// js/multiplayer/release_guard_core.js
// M3.29-M3.30 — deterministic multiplayer public-release policy and gate evaluation.

export const MULTIPLAYER_RELEASE_GUARD_PATCH = 'm3-refresh-run-proof-r1';
export const MULTIPLAYER_RELEASE_GUARD_PROTOCOL = 6;
export const MULTIPLAYER_RELEASE_GUARD_BUILD = 'm3-team-final-world-reconnect-r3';

function cleanHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '');
}

export function isLoopbackHostname(hostname = '') {
  const host = cleanHostname(hostname);
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function queryValue(search, key) {
  try {
    return new URLSearchParams(String(search || '')).get(key);
  } catch {
    return null;
  }
}

export function resolveMultiplayerDebugPolicy({
  hostname = '',
  search = '',
  globalDebug = false,
  storedDebug = false
} = {}) {
  const loopback = isLoopbackHostname(hostname);
  const explicitRequested = queryValue(search, 'mpDebug') === '1';
  const legacySignals = [];

  if (queryValue(search, 'mpFaults') === '1') legacySignals.push('mpFaults-query');
  if (globalDebug === true) legacySignals.push('global-flag');
  if (storedDebug === true) legacySignals.push('local-storage');

  const requested = explicitRequested || legacySignals.length > 0;
  const allowed = loopback && explicitRequested;
  let reason = 'public-mode';

  if (allowed) reason = 'loopback-explicit-debug';
  else if (explicitRequested && !loopback) reason = 'non-loopback-debug-blocked';
  else if (legacySignals.length > 0) reason = 'legacy-debug-signals-blocked';

  return Object.freeze({
    allowed,
    requested,
    explicitRequested,
    loopback,
    legacySignals: Object.freeze([...legacySignals]),
    reason
  });
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizedAwaitingStreams(reconciliation = {}) {
  const streams = reconciliation?.awaitingStreams;
  return Array.isArray(streams) ? streams.filter(Boolean).map(String) : [];
}

export function evaluateMultiplayerReleaseGate({
  expectedProtocol = MULTIPLAYER_RELEASE_GUARD_PROTOCOL,
  protocolVersion = expectedProtocol,
  expectedBuild = MULTIPLAYER_RELEASE_GUARD_BUILD,
  build = expectedBuild,
  expectedPatch = MULTIPLAYER_RELEASE_GUARD_PATCH,
  patch = expectedPatch,
  debugPolicy = resolveMultiplayerDebugPolicy(),
  faultSimulation = null,
  recoveryDiagnostics = null,
  recoveryCertification = null,
  transportState = 'disconnected',
  reconciliation = null,
  runActive = false
} = {}) {
  const errors = [];
  const warnings = [];
  const fault = faultSimulation || {};
  const diagnostics = recoveryDiagnostics || {};
  const certification = recoveryCertification || {};
  const recon = reconciliation || {};
  const policy = debugPolicy && typeof debugPolicy === 'object'
    ? debugPolicy
    : resolveMultiplayerDebugPolicy();
  const legacySignals = Array.isArray(policy.legacySignals)
    ? policy.legacySignals.filter(Boolean).map(String)
    : [];
  const awaitingStreams = normalizedAwaitingStreams(recon);
  const queuedPackets = numberOrZero(fault.queuedPackets);
  const faultActive = fault.active === true || fault.config?.enabled === true;

  if (Number(protocolVersion) !== Number(expectedProtocol)) {
    errors.push(`Protocol mismatch: expected ${expectedProtocol}, received ${protocolVersion}.`);
  }
  if (String(build || '') !== String(expectedBuild || '')) {
    errors.push(`Frontend build mismatch: expected ${expectedBuild}, received ${build || 'missing'}.`);
  }
  if (String(patch || '') !== String(expectedPatch || '')) {
    errors.push(`Frontend patch mismatch: expected ${expectedPatch}, received ${patch || 'missing'}.`);
  }

  if (policy.allowed === true) {
    warnings.push('Loopback debug mode is intentionally enabled; this is not a public-release session.');
  } else {
    if (faultActive) errors.push('Fault simulation is active in public mode.');
    if (queuedPackets > 0) errors.push(`Fault simulator still has ${queuedPackets} queued packet(s) in public mode.`);
    if (diagnostics.debugAllowed === true || diagnostics.visible === true) {
      errors.push('Recovery diagnostics are exposed in public mode.');
    }
    if (
      certification.debugAllowed === true
      || certification.visible === true
      || certification.running === true
    ) {
      errors.push('Recovery certification is exposed or running in public mode.');
    }
  }

  if (policy.requested === true && policy.allowed !== true) {
    warnings.push(`Blocked multiplayer debug request (${policy.reason || 'public-mode'}).`);
  }
  if (legacySignals.length > 0) {
    warnings.push(`Ignored legacy debug signal(s): ${legacySignals.join(', ')}.`);
  }

  if (runActive && transportState !== 'connected') {
    warnings.push(`Active run transport state is ${transportState || 'unknown'}.`);
  }
  if (runActive && String(recon.status || '').toUpperCase() === 'RECOVERING') {
    warnings.push('Active run reconciliation is still recovering.');
  }
  if (runActive && awaitingStreams.length > 0) {
    warnings.push(`Awaiting authoritative stream(s): ${awaitingStreams.join(', ')}.`);
  }

  const status = errors.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS';

  return Object.freeze({
    status,
    publicMode: policy.allowed !== true,
    checkedAt: Date.now(),
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    details: Object.freeze({
      protocolVersion: Number(protocolVersion),
      build: String(build || ''),
      patch: String(patch || ''),
      transportState: String(transportState || ''),
      runActive: runActive === true,
      reconciliationStatus: String(recon.status || ''),
      awaitingStreams: Object.freeze(awaitingStreams),
      faultActive,
      queuedPackets,
      debugPolicy: Object.freeze({
        ...policy,
        legacySignals: Object.freeze([...legacySignals])
      })
    })
  });
}
