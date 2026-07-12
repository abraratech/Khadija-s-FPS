// js/multiplayer/m5_handshake_identity.test.js
import assert from 'node:assert/strict';
import { MULTIPLAYER_BUILD_ID, MULTIPLAYER_PROTOCOL_VERSION } from './protocol.js';
import {
  MULTIPLAYER_PRODUCTION_RELEASE_BUILD,
  MULTIPLAYER_PRODUCTION_RELEASE_PATCH,
  MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL
} from './production_release_core.js';

assert.equal(MULTIPLAYER_BUILD_ID, 'm5-coop-communication-safety-r1');
assert.equal(MULTIPLAYER_PRODUCTION_RELEASE_BUILD, MULTIPLAYER_BUILD_ID);
assert.equal(MULTIPLAYER_PRODUCTION_RELEASE_PATCH, MULTIPLAYER_BUILD_ID);
assert.equal(MULTIPLAYER_PROTOCOL_VERSION, 6);
assert.equal(MULTIPLAYER_PRODUCTION_RELEASE_PROTOCOL, MULTIPLAYER_PROTOCOL_VERSION);

console.log('M5 WebSocket handshake identity tests passed');
