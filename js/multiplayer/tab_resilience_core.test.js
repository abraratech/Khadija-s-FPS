// js/multiplayer/tab_resilience_core.test.js
import assert from 'node:assert/strict';
import {
  evaluateMultiplayerTabResilience,
  MULTIPLAYER_TAB_RESILIENCE_PATCH,
  MULTIPLAYER_TAB_RESILIENCE_PROTOCOL
} from './tab_resilience_core.js';

assert.equal(
  MULTIPLAYER_TAB_RESILIENCE_PATCH,
  'm3-tab-ownership-seal-r1'
);
assert.equal(MULTIPLAYER_TAB_RESILIENCE_PROTOCOL, 6);

const activeOwner = evaluateMultiplayerTabResilience({
  lease: {
    status: 'OWNED',
    health: 'PASS',
    action: 'RENEW',
    blocking: false,
    owner: true,
    instanceId: 'instance-a',
    pageId: 'page-a',
    final: true
  },
  transport: {
    status: 'OWNER_CONNECTED',
    health: 'PASS',
    action: 'NONE',
    blocking: false,
    transportState: 'connected',
    transportMode: 'online',
    quiesced: false,
    final: true
  },
  activeRun: true,
  leaseStored: true,
  storedOwnerMatches: true,
  now: 1000
});
assert.equal(activeOwner.status, 'SEALED');
assert.equal(activeOwner.health, 'PASS');
assert.equal(activeOwner.continuity, 'ACTIVE_OWNER');
assert.equal(activeOwner.blocking, false);

const passive = evaluateMultiplayerTabResilience({
  lease: {
    status: 'CONFLICT',
    health: 'WARN',
    action: 'BLOCK',
    blocking: true,
    owner: false,
    final: false
  },
  transport: {
    status: 'QUIESCED',
    health: 'PASS',
    action: 'NONE',
    blocking: true,
    transportState: 'disconnected',
    transportMode: 'online',
    quiesced: true,
    final: true
  },
  activeRun: true,
  leaseStored: true,
  storedOwnerMatches: false,
  now: 1100
});
assert.equal(passive.status, 'SEALED');
assert.equal(passive.continuity, 'PASSIVE_TAB');
assert.equal(passive.blocking, true);

const recovering = evaluateMultiplayerTabResilience({
  lease: {
    status: 'OWNED',
    health: 'PASS',
    action: 'TAKEOVER',
    blocking: false,
    owner: true,
    final: true
  },
  transport: {
    status: 'RESUMING',
    health: 'WARN',
    action: 'RESUME',
    blocking: true,
    transportState: 'disconnected',
    transportMode: 'online',
    quiesced: true,
    final: false
  },
  activeRun: true,
  leaseStored: true,
  storedOwnerMatches: true,
  now: 1200
});
assert.equal(recovering.status, 'RECOVERING');
assert.equal(recovering.continuity, 'OWNER_RECOVERY');

const released = evaluateMultiplayerTabResilience({
  lease: {
    status: 'INACTIVE',
    health: 'PASS',
    action: 'RELEASE',
    blocking: false,
    owner: false,
    final: true
  },
  transport: {
    status: 'INACTIVE',
    health: 'PASS',
    action: 'NONE',
    blocking: false,
    transportState: 'disconnected',
    transportMode: 'online',
    quiesced: true,
    final: true
  },
  activeRun: false,
  leaseStored: false,
  storedOwnerMatches: false,
  now: 1300
});
assert.equal(released.status, 'SEALED');
assert.equal(released.continuity, 'LEASE_RELEASED');
assert.equal(released.blocking, false);

const passiveConnected = evaluateMultiplayerTabResilience({
  lease: {
    status: 'CONFLICT',
    blocking: true,
    owner: false
  },
  transport: {
    status: 'OWNER_CONNECTED',
    blocking: false,
    transportState: 'connected',
    transportMode: 'online',
    quiesced: false
  },
  activeRun: true,
  leaseStored: true,
  now: 1400
});
assert.equal(passiveConnected.status, 'FAILED');
assert.equal(
  passiveConnected.reason,
  'tab-resilience-passive-tab-connected'
);

const ownerQuiesced = evaluateMultiplayerTabResilience({
  lease: {
    status: 'OWNED',
    blocking: false,
    owner: true
  },
  transport: {
    status: 'QUIESCED',
    blocking: true,
    transportState: 'disconnected',
    transportMode: 'online',
    quiesced: true
  },
  activeRun: true,
  leaseStored: true,
  storedOwnerMatches: true,
  now: 1500
});
assert.equal(ownerQuiesced.status, 'FAILED');
assert.equal(
  ownerQuiesced.continuity,
  'OWNERSHIP_CONTRADICTION'
);

const retainedLease = evaluateMultiplayerTabResilience({
  lease: {
    status: 'INACTIVE',
    blocking: false,
    owner: false
  },
  transport: {
    status: 'INACTIVE',
    blocking: false,
    transportState: 'disconnected',
    transportMode: 'online'
  },
  activeRun: false,
  leaseStored: true,
  now: 1600
});
assert.equal(retainedLease.status, 'FAILED');
assert.equal(
  retainedLease.reason,
  'tab-resilience-inactive-retained-lease'
);

console.log('tab_resilience_core tests passed');
