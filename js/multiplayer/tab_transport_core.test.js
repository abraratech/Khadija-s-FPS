// js/multiplayer/tab_transport_core.test.js
import assert from 'node:assert/strict';
import {
  evaluateMultiplayerTabTransport,
  MULTIPLAYER_TAB_TRANSPORT_PATCH,
  MULTIPLAYER_TAB_TRANSPORT_PROTOCOL
} from './tab_transport_core.js';

assert.equal(
  MULTIPLAYER_TAB_TRANSPORT_PATCH,
  'm3-final-certification-seal-r1'
);
assert.equal(MULTIPLAYER_TAB_TRANSPORT_PROTOCOL, 6);

const conflict = {
  status: 'CONFLICT',
  owner: false,
  blocking: true
};

const quiesce = evaluateMultiplayerTabTransport({
  lease: conflict,
  transportState: 'connected',
  transportMode: 'online',
  hasConnectionOptions: true,
  quiesced: false
});
assert.equal(quiesce.status, 'QUIESCING');
assert.equal(quiesce.action, 'QUIESCE');
assert.equal(quiesce.blocking, true);

const quiesced = evaluateMultiplayerTabTransport({
  lease: conflict,
  transportState: 'disconnected',
  transportMode: 'online',
  hasConnectionOptions: true,
  quiesced: true
});
assert.equal(quiesced.status, 'QUIESCED');
assert.equal(quiesced.action, 'NONE');
assert.equal(quiesced.health, 'PASS');

const ownerNeedsResume = evaluateMultiplayerTabTransport({
  lease: {
    status: 'OWNED',
    owner: true,
    blocking: false
  },
  transportState: 'disconnected',
  transportMode: 'online',
  hasConnectionOptions: true,
  quiesced: true
});
assert.equal(ownerNeedsResume.status, 'RESUMING');
assert.equal(ownerNeedsResume.action, 'RESUME');
assert.equal(ownerNeedsResume.blocking, true);

const ownerConnected = evaluateMultiplayerTabTransport({
  lease: {
    status: 'OWNED',
    owner: true,
    blocking: false
  },
  transportState: 'connected',
  transportMode: 'online',
  hasConnectionOptions: true,
  quiesced: false
});
assert.equal(ownerConnected.status, 'OWNER_CONNECTED');
assert.equal(ownerConnected.action, 'NONE');
assert.equal(ownerConnected.blocking, false);

const ownerLocal = evaluateMultiplayerTabTransport({
  lease: {
    status: 'OWNED',
    owner: true,
    blocking: false
  },
  transportState: 'connected',
  transportMode: 'local',
  hasConnectionOptions: false
});
assert.equal(ownerLocal.status, 'OWNER_LOCAL');
assert.equal(ownerLocal.blocking, false);

const storageFailure = evaluateMultiplayerTabTransport({
  lease: {
    status: 'STORAGE_BLOCKED',
    owner: false,
    blocking: true
  },
  transportState: 'connected',
  transportMode: 'online',
  hasConnectionOptions: true
});
assert.equal(storageFailure.action, 'QUIESCE');

const waiting = evaluateMultiplayerTabTransport({
  lease: null,
  transportState: 'connected',
  transportMode: 'online',
  hasConnectionOptions: true
});
assert.equal(waiting.status, 'WAITING');
assert.equal(waiting.blocking, true);

console.log('tab_transport_core tests passed');
