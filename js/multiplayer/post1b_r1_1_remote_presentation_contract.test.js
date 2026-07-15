// js/multiplayer/post1b_r1_1_remote_presentation_contract.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const remote = readFileSync(new URL('./remote_players.js', import.meta.url), 'utf8');
const quality = readFileSync(new URL('./network_quality.js', import.meta.url), 'utf8');
const hud = readFileSync(new URL('./network_hud.js', import.meta.url), 'utf8');
const chat = readFileSync(new URL('./text_chat.js', import.meta.url), 'utf8');

for (const token of [
  'applyRemoteGait',
  'createRemoteWeaponModels',
  'remote-weapon-model-pistol',
  'remote-weapon-model-smg',
  'remote-weapon-model-rifle',
  'remote-weapon-model-shotgun',
  'remote-weapon-model-sniper',
  'remote-boot-shell'
]) {
  assert.equal(remote.includes(token), true, `Missing remote presentation token: ${token}`);
}

// POST.2A superseded the original POST.1B visual-patch marker while
// preserving and improving the same remote presentation feature set.
assert.equal(
  remote.includes('post1b-r1-1-remote-presentation')
    || remote.includes("visualPatch: 'post2a-r1-remote-locomotion-foot-geometry'"),
  true,
  'Missing current or superseded remote presentation patch marker'
);

for (const token of [
  "measurementKind: 'PEER_RELAY_RTT'",
  'warmupMs',
  'worsenHoldMs',
  'improveHoldMs',
  'rtt >= 900',
  'rtt >= 600'
]) {
  assert.equal(quality.includes(token), true, `Missing relay quality token: ${token}`);
}

assert.equal(hud.includes('CLOUD RELAY READY'), true);
assert.equal(hud.includes('not the speed between devices on the same LAN'), true);
assert.equal(chat.includes("event.code === 'KeyT'"), true);
assert.equal(chat.includes("toggleLabel.textContent = 'CHAT [T]'"), true);

console.log('POST.1B/POST.2 remote presentation contract tests: PASS');
