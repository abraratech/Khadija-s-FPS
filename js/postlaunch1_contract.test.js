import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MultiplayerLobbyUI } from './multiplayer/lobby_ui.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const lobby = read('js/multiplayer/lobby_ui.js');
const css = read('css/multiplayer.css');
const release = JSON.parse(read('multiplayer-release.json'));

assert.match(lobby, /POST-LAUNCH\.1 R1/);
assert.match(lobby, /MPUI\.2 R1\.1 room isolation/);
assert.match(lobby, /copyTextWithFallback/);
assert.match(lobby, /document\.execCommand\?\.\('copy'\)/);
assert.doesNotMatch(lobby, /window\.prompt\('Copy room code:'/);
assert.match(lobby, /runActionOnce\(/);
assert.match(lobby, /this\.actionLocks = new Map\(\)/);
assert.match(lobby, /quick-match-coop/);
assert.match(lobby, /quick-match-pvp/);
assert.match(lobby, /create-public-coop/);
assert.match(lobby, /create-public-pvp/);
assert.match(lobby, /start-room-run/);
assert.match(lobby, /join-listing-/);
assert.match(lobby, /aria-busy/);
assert.match(lobby, /window\.addEventListener\('offline'/);
assert.match(lobby, /window\.addEventListener\('online'/);
assert.match(lobby, /OFFLINE · ONLINE PLAY WILL RESUME AUTOMATICALLY/);
assert.match(lobby, /CONNECTION RESTORED · REFRESHING ONLINE PLAY/);
assert.match(lobby, /network-recovery-refresh/);
assert.match(lobby, /releaseUi\.blockActions \|\| this\.networkOffline/);

assert.match(css, /ka-action-pending/);
assert.match(css, /ka-postlaunch1-action-spin/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /#ka-coop-code:focus/);

const classes = new Set();
const attributes = new Map();
const fakeButton = {
  classList: {
    add(value) { classes.add(value); },
    remove(value) { classes.delete(value); }
  },
  setAttribute(key, value) { attributes.set(key, value); },
  removeAttribute(key) { attributes.delete(key); }
};
const ui = new MultiplayerLobbyUI();
let invocationCount = 0;
assert.equal(ui.runActionOnce('guard-test', () => { invocationCount += 1; }, { button: fakeButton, cooldownMs: 250 }), true);
assert.equal(ui.runActionOnce('guard-test', () => { invocationCount += 1; }, { button: fakeButton, cooldownMs: 250 }), false);
assert.equal(invocationCount, 1);
assert.equal(classes.has('ka-action-pending'), true);
assert.equal(attributes.get('aria-busy'), 'true');
await new Promise((resolve) => setTimeout(resolve, 310));
assert.equal(ui.runActionOnce('guard-test', () => { invocationCount += 1; }, { cooldownMs: 250 }), true);
assert.equal(invocationCount, 2);

assert.equal(release.postLaunch1?.patch, 'post-launch1-r1-live-interaction-safety-recovery');
assert.equal(release.postLaunch1?.sourceBaselineSha, 'f46b9e4d7da3f3b814ae2cc01443d51f2ca49c51');
for (const key of [
  'multiplayerActionDeduplication',
  'rapidSubmitProtection',
  'offlineActionGating',
  'automaticReconnectRefresh',
  'promptFreeRoomCodeCopy',
  'clipboardFallbackSelection',
  'reducedMotionSafeBusyState',
  'gameplayAuthorityUnchanged',
  'frontendOnly'
]) {
  assert.equal(release.postLaunch1?.[key], true, `Missing true metadata: ${key}`);
}
assert.equal(release.postLaunch1?.workerChangeRequired, false);

console.log('POST-LAUNCH.1 live interaction safety and recovery contract: PASS');
