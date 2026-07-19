import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const transport = readFileSync(new URL('./transport.js', import.meta.url), 'utf8');
const mesh = readFileSync(new URL('./webrtc_transport.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('./webrtc_core.js', import.meta.url), 'utf8');
const hud = readFileSync(new URL('./network_hud.js', import.meta.url), 'utf8');
const eventBus = readFileSync(new URL('./event_bus.js', import.meta.url), 'utf8');
const release = JSON.parse(readFileSync(new URL('../../multiplayer-release.json', import.meta.url), 'utf8'));
const descriptor = JSON.parse(readFileSync(new URL('../../release-version.json', import.meta.url), 'utf8'));

for (const marker of [
  "new Net1WebRtcMesh", "sendControl('net1-signal'", 'net1DeliveryKey',
  'resolveNet1EnvelopePolicy', "action === 'net1-signal'", 'remote-direct',
  'websocket-closed', 'connectionEpoch'
]) {
  assert.equal(transport.includes(marker), true, `Missing NET.1 transport marker: ${marker}`);
}
for (const marker of [
  "'ka-reliable'", "'ka-snapshot'", 'maxRetransmits: 0',
  'createDataChannel', 'getStats()', 'allPeersReady()', 'MAX_SNAPSHOT_BUFFERED_BYTES',
  'NET1_TRANSPORT_PATHS.TURN_RELAY', 'NET1_TRANSPORT_PATHS.CLOUD_RELAY'
]) {
  assert.equal(`${mesh}\n${core}`.includes(marker), true, `Missing NET.1 WebRTC marker: ${marker}`);
}
for (const label of ['DIRECT', 'TURN RELAY', 'NEGOTIATING', 'CLOUD RELAY']) {
  assert.equal(hud.includes(label), true, `Missing NET.1 HUD path: ${label}`);
}
assert.equal(eventBus.includes('TRANSPORT_PATH_CHANGED'), true);
assert.equal(release.net1.patch, 'net1-r1-webrtc-hybrid-transport');
assert.equal(release.net1.websocketDurableObjectFallback, true);
assert.equal(release.net1.criticalRelayShadow, true);
assert.equal(descriptor.releaseId, 'net1-r1-webrtc-hybrid-transport');
assert.equal(descriptor.productVersion, '1.2.0-net1-r1');
console.log('NET.1 frontend WebRTC hybrid transport contract: PASS');
