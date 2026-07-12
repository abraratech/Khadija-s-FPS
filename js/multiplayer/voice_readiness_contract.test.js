// js/multiplayer/voice_readiness_contract.test.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./voice_readiness.js', import.meta.url), 'utf8');
const core = await readFile(new URL('./voice_readiness_core.js', import.meta.url), 'utf8');
const joined = `${source}\n${core}`;
assert.match(source, /getUserMedia/);
assert.match(source, /enumerateDevices/);
assert.match(joined, /VOICE REQUIRES HTTPS OR LOCALHOST/);
assert.match(source, /PTT INPUT ACTIVE · NOT TRANSMITTING YET/);
assert.match(source, /No audio is recorded or sent by this screen/);
assert.match(source, /window\.KHADIJA_VOICE_READINESS/);
assert.doesNotMatch(joined, /RTCPeerConnection/);
assert.doesNotMatch(joined, /MediaRecorder/);
console.log('voice_readiness contract tests passed');
