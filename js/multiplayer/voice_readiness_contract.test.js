// js/multiplayer/voice_readiness_contract.test.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./voice_readiness.js', import.meta.url), 'utf8');
const core = await readFile(new URL('./voice_readiness_core.js', import.meta.url), 'utf8');
const networkHud = await readFile(new URL('./network_hud.js', import.meta.url), 'utf8');
const joined = `${source}\n${core}`;
assert.match(source, /getUserMedia/);
assert.match(source, /enumerateDevices/);
assert.match(joined, /VOICE REQUIRES HTTPS OR LOCALHOST/);
assert.match(source, /PTT TRANSMITTING · RELEASE T TO MUTE/);
assert.match(joined, /KeyT/);
assert.match(source, /HOLD T/);
assert.doesNotMatch(joined, /KeyV|HOLD V/);
assert.match(networkHud, /top:'132px'/);
assert.doesNotMatch(networkHud, /top:'72px'/);
assert.match(source, /Audio is never recorded by the game server/);
assert.match(source, /window\.KHADIJA_VOICE_READINESS/);
assert.doesNotMatch(joined, /RTCPeerConnection/);
assert.doesNotMatch(joined, /MediaRecorder/);
console.log('voice_readiness contract tests passed');
