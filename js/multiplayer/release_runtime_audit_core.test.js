// js/multiplayer/release_runtime_audit_core.test.js
import assert from 'node:assert/strict';
import {
  MULTIPLAYER_RELEASE_RUNTIME_AUDIT_PATCH,
  deriveMultiplayerReleaseRuntimeContext,
  evaluateMultiplayerReleaseRuntimeAudit,
  isMultiplayerReleaseLoopbackHost
} from './release_runtime_audit_core.js';

assert.equal(
  MULTIPLAYER_RELEASE_RUNTIME_AUDIT_PATCH,
  'm3-release-runtime-audit-r1'
);

assert.equal(isMultiplayerReleaseLoopbackHost('localhost'), true);
assert.equal(isMultiplayerReleaseLoopbackHost('app.localhost'), true);
assert.equal(isMultiplayerReleaseLoopbackHost('127.0.0.1'), true);
assert.equal(isMultiplayerReleaseLoopbackHost('example.com'), false);

const production = deriveMultiplayerReleaseRuntimeContext({
  hostname: 'khadija-s-fps.pages.dev',
  search: ''
});
assert.equal(production.environment, 'PRODUCTION_RESTRICTED');
assert.equal(production.debugAllowed, false);

const clean = evaluateMultiplayerReleaseRuntimeAudit({
  hostname: 'khadija-s-fps.pages.dev'
});
assert.equal(clean.status, 'PASS');
assert.equal(clean.releaseReady, true);
assert.equal(clean.blocking, false);

const leaked = evaluateMultiplayerReleaseRuntimeAudit({
  hostname: 'khadija-s-fps.pages.dev',
  activeGlobals: [
    'KHADIJA_MULTIPLAYER_FINAL_CERTIFICATION'
  ],
  activePanelIds: ['mp-final-certification']
});
assert.equal(leaked.status, 'FAIL');
assert.equal(leaked.releaseReady, false);
assert.equal(leaked.blocking, true);
assert.equal(leaked.leaks.length, 2);

const ignored = evaluateMultiplayerReleaseRuntimeAudit({
  hostname: 'khadija-s-fps.pages.dev',
  search: '?mpDebug=1'
});
assert.equal(ignored.status, 'WARN');
assert.equal(ignored.releaseReady, true);
assert.equal(ignored.context.debugAllowed, false);

const localDebug = evaluateMultiplayerReleaseRuntimeAudit({
  hostname: 'localhost',
  search: '?mpDebug=1',
  activeGlobals: [
    'KHADIJA_MULTIPLAYER_CERTIFICATION_SESSION'
  ]
});
assert.equal(localDebug.status, 'DEBUG_ALLOWED');
assert.equal(localDebug.releaseReady, true);
assert.equal(localDebug.context.debugAllowed, true);

console.log('release_runtime_audit_core tests passed');
