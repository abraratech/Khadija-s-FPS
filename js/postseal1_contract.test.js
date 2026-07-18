import fs from 'node:fs';
import assert from 'node:assert/strict';

const cloud = fs.readFileSync(new URL('./cloud_profile.js', import.meta.url), 'utf8');
const camera = fs.readFileSync(new URL('./camera_presentation.js', import.meta.url), 'utf8');
const lobby = fs.readFileSync(new URL('./multiplayer/lobby_ui.js', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('./multiplayer/text_chat.js', import.meta.url), 'utf8');
const build = fs.readFileSync(new URL('../scripts/build_production.py', import.meta.url), 'utf8');
const verifier = fs.readFileSync(new URL('../scripts/verify_launch2_build.py', import.meta.url), 'utf8');
const release = JSON.parse(fs.readFileSync(new URL('../multiplayer-release.json', import.meta.url), 'utf8'));
const version = JSON.parse(fs.readFileSync(new URL('../release-version.json', import.meta.url), 'utf8'));

assert.equal(/addEventListener\(['"]unload['"]/.test(cloud), false, 'deprecated unload listener must be removed');
assert.equal(/addEventListener\(['"]beforeunload['"]/.test(cloud), false, 'beforeunload sync dependency must be removed');
assert.match(cloud, /addEventListener\(['"]pagehide['"]/);
assert.match(cloud, /addEventListener\(['"]pageshow['"]/);
assert.match(cloud, /startLifecycleTimers/);
assert.match(cloud, /stopLifecycleTimers/);

assert.match(camera, /slider\.id = `ka-camera-distance-\$\{suffix\}`/);
assert.match(camera, /slider\.name = `camera-distance-\$\{suffix\}`/);
assert.match(lobby, /textarea\.name = ['"]room-code-copy-buffer['"]/);
assert.match(chat, /this\.playerSelect\.name = ['"]text-chat-player-select['"]/);
assert.match(chat, /this\.input\.name = ['"]text-chat-message['"]/);
assert.match(chat, /this\.lobbyInput\.name = ['"]room-chat-message['"]/);

assert.match(build, /post_seal1/);
assert.match(build, /current_release/);
assert.match(verifier, /Current production release descriptor mismatch/);
assert.match(verifier, /POST-SEAL\.1 production manifest patch mismatch/);

assert.equal(version.releaseId, 'post-seal1-r1-console-lifecycle-form-hygiene');
assert.equal(version.releaseSequence, 2026071802);
assert.equal(release.postSeal1?.patch, 'post-seal1-r1-console-lifecycle-form-hygiene');
assert.equal(release.postSeal1?.workerChangeRequired, false);

console.log('POST-SEAL.1 console lifecycle and form hygiene contract: PASS');
