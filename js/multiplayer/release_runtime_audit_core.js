// js/multiplayer/release_runtime_audit_core.js
// M3.83-M3.84 — deterministic production debug-isolation audit.

export const MULTIPLAYER_RELEASE_RUNTIME_AUDIT_PATCH =
  'm3-release-runtime-audit-r1';

export const MULTIPLAYER_RELEASE_RESTRICTED_GLOBALS = Object.freeze([
  'KHADIJA_MULTIPLAYER_FINAL_CERTIFICATION',
  'KHADIJA_MULTIPLAYER_CERTIFICATION_PAIRING',
  'KHADIJA_MULTIPLAYER_CERTIFICATION_SESSION'
]);

export const MULTIPLAYER_RELEASE_RESTRICTED_PANEL_IDS = Object.freeze([
  'mp-final-certification',
  'mp-certification-pairing',
  'mp-certification-session'
]);

function cleanText(value, fallback = '', limit = 500) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

export function isMultiplayerReleaseLoopbackHost(hostname) {
  const normalized = cleanText(hostname).toLowerCase();
  return (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

export function deriveMultiplayerReleaseRuntimeContext({
  hostname = '',
  search = ''
} = {}) {
  const normalizedHostname = cleanText(hostname).toLowerCase();
  const loopback = isMultiplayerReleaseLoopbackHost(normalizedHostname);
  const debugRequested = new URLSearchParams(
    cleanText(search, '', 4000)
  ).get('mpDebug') === '1';
  const debugAllowed = loopback && debugRequested;

  return Object.freeze({
    hostname: normalizedHostname,
    loopback,
    debugRequested,
    debugAllowed,
    environment: debugAllowed
      ? 'LOCAL_DEBUG'
      : loopback
        ? 'LOCAL_RESTRICTED'
        : 'PRODUCTION_RESTRICTED'
  });
}

export function evaluateMultiplayerReleaseRuntimeAudit({
  hostname = '',
  search = '',
  activeGlobals = [],
  activePanelIds = [],
  checkedAt = Date.now()
} = {}) {
  const context = deriveMultiplayerReleaseRuntimeContext({
    hostname,
    search
  });
  const globals = Object.freeze(
    [...new Set(
      (Array.isArray(activeGlobals) ? activeGlobals : [])
        .map((value) => cleanText(value))
        .filter(Boolean)
    )].sort()
  );
  const panels = Object.freeze(
    [...new Set(
      (Array.isArray(activePanelIds) ? activePanelIds : [])
        .map((value) => cleanText(value))
        .filter(Boolean)
    )].sort()
  );

  const leaks = Object.freeze([
    ...globals.map((name) => Object.freeze({
      kind: 'GLOBAL',
      name
    })),
    ...panels.map((name) => Object.freeze({
      kind: 'PANEL',
      name
    }))
  ]);

  let status = 'PASS';
  let releaseReady = true;
  let blocking = false;
  const findings = [];

  if (context.debugAllowed) {
    status = 'DEBUG_ALLOWED';
    findings.push(Object.freeze({
      code: 'LOCAL_DEBUG_ALLOWED',
      severity: 'INFO',
      message:
        'Localhost mpDebug=1 is active; certification tools are permitted.'
    }));
  } else if (leaks.length > 0) {
    status = 'FAIL';
    releaseReady = false;
    blocking = true;
    findings.push(Object.freeze({
      code: 'RESTRICTED_DEBUG_RUNTIME_LEAK',
      severity: 'ERROR',
      message:
        'Localhost-only certification runtime leaked into a restricted build.',
      details: Object.freeze({
        globals,
        panels
      })
    }));
  } else if (context.debugRequested) {
    status = 'WARN';
    findings.push(Object.freeze({
      code: 'PRODUCTION_DEBUG_QUERY_IGNORED',
      severity: 'WARN',
      message:
        'mpDebug=1 was requested outside loopback and remained disabled.'
    }));
  }

  return Object.freeze({
    milestone: 'M3.83-M3.84',
    patch: MULTIPLAYER_RELEASE_RUNTIME_AUDIT_PATCH,
    status,
    releaseReady,
    blocking,
    checkedAt: Math.max(0, Number(checkedAt) || 0),
    context,
    activeGlobals: globals,
    activePanelIds: panels,
    leaks,
    findings: Object.freeze(findings)
  });
}
