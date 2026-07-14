// js/multiplayer/live_voice_contract.test.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./live_voice.js', import.meta.url), 'utf8');
const core = await readFile(new URL('./live_voice_core.js', import.meta.url), 'utf8');
const readiness = await readFile(new URL('./voice_readiness.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../../multiplayer-server/src/index.js', import.meta.url), 'utf8');
const workerCore = await readFile(new URL('../../multiplayer-server/src/voice_signal_core.js', import.meta.url), 'utf8');
const joined = `${source}\n${core}\n${readiness}\n${worker}\n${workerCore}`;

assert.doesNotMatch(main, /import ['"]\.\/multiplayer\/live_voice\.js['"]/);
assert.match(source, /RTCPeerConnection/);
assert.match(source, /getUserMedia/);
assert.match(source, /addTrack/);
assert.match(source, /localTrack\.enabled/);
assert.match(source, /sendControl\(LIVE_VOICE_SIGNAL_ACTION/);
assert.match(source, /audio\.autoplay = true/);
assert.match(source, /audio\.playsInline = true/);
assert.match(source, /shouldSilenceVoice|mutedVoicePlayerIds|muteAllVoice/);
assert.match(core, /stun:stun\.cloudflare\.com:3478/);
assert.match(joined, /KeyT|HOLD T/);
assert.doesNotMatch(joined, /KeyV|HOLD V/);
assert.match(worker, /action === 'voice-signal'/);
assert.match(worker, /targetSockets/);
assert.match(workerCore, /targetPlayerId/);
assert.doesNotMatch(joined, /MediaRecorder/);
assert.doesNotMatch(worker, /MediaStream|MediaRecorder|audioChunk|audioData/);
assert.match(source, /serverReceivesAudio: false/);
console.log('live_voice contract tests passed');
