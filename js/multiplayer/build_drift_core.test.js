// js/multiplayer/build_drift_core.test.js
import assert from 'node:assert/strict';
import {
  MULTIPLAYER_BUILD_DRIFT_BUILD,
  MULTIPLAYER_BUILD_DRIFT_PATCH,
  MULTIPLAYER_BUILD_DRIFT_PROTOCOL,
  buildMultiplayerCacheBustedUrl,
  classifyMultiplayerBuildDrift,
  evaluateMultiplayerBuildDriftRecovery,
  isLoopbackMultiplayerHost
} from './build_drift_core.js';

assert.equal(MULTIPLAYER_BUILD_DRIFT_PATCH, 'm3-refresh-hydration-seal-r1');
assert.equal(MULTIPLAYER_BUILD_DRIFT_PROTOCOL, 6);
assert.equal(MULTIPLAYER_BUILD_DRIFT_BUILD, 'm3-team-final-world-reconnect-r3');

assert.equal(isLoopbackMultiplayerHost('localhost'), true);
assert.equal(isLoopbackMultiplayerHost('127.0.0.1'), true);
assert.equal(isLoopbackMultiplayerHost('[::1]'), true);
assert.equal(isLoopbackMultiplayerHost('khadija-s-fps.pages.dev'), false);

const matching = classifyMultiplayerBuildDrift({});
assert.equal(matching.mismatch, false);
assert.equal(matching.kind, 'NONE');

const both = classifyMultiplayerBuildDrift({
  receivedProtocol: 5,
  receivedBuild: 'old-build'
});
assert.equal(both.mismatch, true);
assert.equal(both.kind, 'PROTOCOL_AND_BUILD');

const publicFirst = evaluateMultiplayerBuildDriftRecovery({
  receivedBuild: 'old-build',
  hostname: 'khadija-s-fps.pages.dev',
  href: 'https://khadija-s-fps.pages.dev/?room=ABC123&mpDebug=1&mpFaults=1',
  refreshAttempted: false,
  now: 123456
});
assert.equal(publicFirst.status, 'RECOVERING');
assert.equal(publicFirst.reloadScheduled, true);
assert.ok(publicFirst.refreshUrl.includes('room=ABC123'));
assert.ok(publicFirst.refreshUrl.includes('mpRefresh=123456'));
assert.equal(publicFirst.refreshUrl.includes('mpDebug'), false);
assert.equal(publicFirst.refreshUrl.includes('mpFaults'), false);

const publicRepeated = evaluateMultiplayerBuildDriftRecovery({
  receivedBuild: 'old-build',
  hostname: 'khadija-s-fps.pages.dev',
  href: 'https://khadija-s-fps.pages.dev/',
  refreshAttempted: true
});
assert.equal(publicRepeated.status, 'FAIL');
assert.equal(publicRepeated.reloadScheduled, false);

const localMismatch = evaluateMultiplayerBuildDriftRecovery({
  receivedProtocol: 5,
  hostname: 'localhost',
  href: 'http://localhost/'
});
assert.equal(localMismatch.status, 'WARN');
assert.equal(localMismatch.reloadScheduled, false);

const cleanUrl = buildMultiplayerCacheBustedUrl(
  'https://example.test/?mpRefresh=1&keep=yes',
  999
);
assert.ok(cleanUrl.includes('keep=yes'));
assert.ok(cleanUrl.includes('mpRefresh=999'));

const pass = evaluateMultiplayerBuildDriftRecovery({
  hostname: 'example.test'
});
assert.equal(pass.status, 'PASS');
assert.equal(pass.reloadScheduled, false);

console.log('build_drift_core tests passed');
