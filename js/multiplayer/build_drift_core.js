// js/multiplayer/build_drift_core.js
// M3.39-M3.40 — deterministic stale-client and deployment-drift recovery policy.

export const MULTIPLAYER_BUILD_DRIFT_PATCH = 'm3-refresh-room-resume-r1';
export const MULTIPLAYER_BUILD_DRIFT_PROTOCOL = 6;
export const MULTIPLAYER_BUILD_DRIFT_BUILD = 'm3-team-final-world-reconnect-r3';

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).trim();
  return text || String(fallback || '');
}

function finiteInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function isLoopbackMultiplayerHost(hostname = '') {
  const host = cleanText(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.localhost');
}

export function classifyMultiplayerBuildDrift({
  expectedProtocol = MULTIPLAYER_BUILD_DRIFT_PROTOCOL,
  receivedProtocol = expectedProtocol,
  expectedBuild = MULTIPLAYER_BUILD_DRIFT_BUILD,
  receivedBuild = expectedBuild
} = {}) {
  const protocolExpected = finiteInteger(expectedProtocol);
  const protocolReceived = finiteInteger(receivedProtocol, -1);
  const buildExpected = cleanText(expectedBuild);
  const buildReceived = cleanText(receivedBuild, 'missing');
  const protocolMismatch = protocolReceived !== protocolExpected;
  const buildMismatch = buildReceived !== buildExpected;

  let kind = 'NONE';
  if (protocolMismatch && buildMismatch) kind = 'PROTOCOL_AND_BUILD';
  else if (protocolMismatch) kind = 'PROTOCOL';
  else if (buildMismatch) kind = 'BUILD';

  return Object.freeze({
    mismatch: protocolMismatch || buildMismatch,
    kind,
    expectedProtocol: protocolExpected,
    receivedProtocol: protocolReceived,
    expectedBuild: buildExpected,
    receivedBuild: buildReceived,
    signature: [
      protocolExpected,
      protocolReceived,
      buildExpected,
      buildReceived
    ].join('|')
  });
}

export function buildMultiplayerCacheBustedUrl(href, now = Date.now()) {
  const fallback = 'http://localhost/';
  const url = new URL(cleanText(href, fallback), fallback);
  url.searchParams.delete('mpDebug');
  url.searchParams.delete('mpFaults');
  url.searchParams.delete('mpRefresh');
  url.searchParams.set('mpRefresh', String(Math.max(0, finiteInteger(now))));
  return url.toString();
}

export function evaluateMultiplayerBuildDriftRecovery({
  expectedProtocol = MULTIPLAYER_BUILD_DRIFT_PROTOCOL,
  receivedProtocol = expectedProtocol,
  expectedBuild = MULTIPLAYER_BUILD_DRIFT_BUILD,
  receivedBuild = expectedBuild,
  hostname = '',
  href = 'http://localhost/',
  refreshAttempted = false,
  now = Date.now()
} = {}) {
  const drift = classifyMultiplayerBuildDrift({
    expectedProtocol,
    receivedProtocol,
    expectedBuild,
    receivedBuild
  });

  if (!drift.mismatch) {
    return Object.freeze({
      status: 'PASS',
      reloadScheduled: false,
      refreshUrl: null,
      message: 'MULTIPLAYER BUILD IDENTITY MATCHES',
      drift
    });
  }

  const loopback = isLoopbackMultiplayerHost(hostname);
  if (loopback) {
    return Object.freeze({
      status: 'WARN',
      reloadScheduled: false,
      refreshUrl: null,
      message: `LOCAL WORKER MISMATCH · EXPECTED ${drift.expectedBuild} / PROTOCOL ${drift.expectedProtocol}`,
      drift
    });
  }

  if (!refreshAttempted) {
    return Object.freeze({
      status: 'RECOVERING',
      reloadScheduled: true,
      refreshUrl: buildMultiplayerCacheBustedUrl(href, now),
      message: 'GAME UPDATE DETECTED · REFRESHING CLIENT CACHE',
      drift
    });
  }

  return Object.freeze({
    status: 'FAIL',
    reloadScheduled: false,
    refreshUrl: null,
    message: `UPDATE REQUIRED · FRONTEND AND WORKER STILL DIFFER · EXPECTED ${drift.expectedBuild} / PROTOCOL ${drift.expectedProtocol}`,
    drift
  });
}
