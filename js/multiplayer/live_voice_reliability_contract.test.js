// js/multiplayer/live_voice_reliability_contract.test.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./live_voice_reliability.js', import.meta.url), 'utf8');
const core = await readFile(new URL('./live_voice_reliability_core.js', import.meta.url), 'utf8');
const live = await readFile(new URL('./live_voice.js', import.meta.url), 'utf8');
const readiness = await readFile(new URL('./voice_readiness_core.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const joined = `${source}\n${core}\n${live}\n${readiness}\n${main}`;

assert.match(main, /live_voice_reliability\.js/);
assert.match(source, /restartIce/);
assert.match(source, /getStats/);
assert.match(source, /schedulePeerRepair/);
assert.match(source, /removePeer/);
assert.match(source, /ensurePeer/);
assert.match(source, /VOICE RECOVERY/);
assert.match(source, /DIRECT VOICE CONNECTION BLOCKED · TURN MAY BE REQUIRED/);
assert.match(source, /window\.KHADIJA_VOICE_RELIABILITY/);
assert.match(live, /KHADIJA_VOICE_RELIABILITY\?\.schedulePeerRepair/);
assert.match(core, /VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS = 4/);
assert.match(core, /VOICE_DISCONNECT_GRACE_MS = 4000/);
assert.match(joined, /KeyT|HOLD T/);
assert.doesNotMatch(source, /KeyV|MediaRecorder/);
console.log('live_voice_reliability contract tests passed');
