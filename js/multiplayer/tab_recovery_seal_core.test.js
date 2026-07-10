// js/multiplayer/tab_recovery_seal_core.test.js
import assert from 'node:assert/strict';
import {
  evaluateMultiplayerTabRecoverySeal,
  MULTIPLAYER_TAB_RECOVERY_SEAL_PATCH,
  MULTIPLAYER_TAB_RECOVERY_SEAL_PROTOCOL
} from './tab_recovery_seal_core.js';

assert.equal(
  MULTIPLAYER_TAB_RECOVERY_SEAL_PATCH,
  'm3-production-release-manifest-r1'
);
assert.equal(MULTIPLAYER_TAB_RECOVERY_SEAL_PROTOCOL, 6);

const activeOwner = evaluateMultiplayerTabRecoverySeal({
  lease: {
    status: 'OWNED',
    owner: true,
    blocking: false,
    action: 'RENEW'
  },
  transport: {
    status: 'OWNER_CONNECTED',
    transportMode: 'online',
    quiesced: false
  },
  resilience: {
    status: 'SEALED',
    continuity: 'ACTIVE_OWNER',
    blocking: false,
    sealed: true
  },
  epochFence: {
    status: 'SEALED',
    blocking: false,
    storedMatchesLocalOwner: true
  },
  activeRun: true,
  now: 1000
});
assert.equal(activeOwner.status, 'SEALED');
assert.equal(activeOwner.continuity, 'ACTIVE_OWNER');
assert.equal(activeOwner.blocking, false);

const reclaimedOwner = evaluateMultiplayerTabRecoverySeal({
  lease: {
    status: 'OWNED',
    owner: true,
    blocking: false,
    action: 'RECLAIM',
    reason: 'tab-lease-stale-owner-reclaimed'
  },
  transport: {
    status: 'OWNER_CONNECTED',
    transportMode: 'online',
    quiesced: false
  },
  resilience: {
    status: 'SEALED',
    continuity: 'ACTIVE_OWNER',
    blocking: false,
    sealed: true
  },
  ownerProbe: {
    status: 'STALE',
    action: 'RECLAIM'
  },
  epochFence: {
    status: 'SEALED',
    blocking: false,
    storedMatchesLocalOwner: true
  },
  activeRun: true,
  now: 1100
});
assert.equal(reclaimedOwner.status, 'SEALED');
assert.equal(reclaimedOwner.continuity, 'RECLAIMED_OWNER');

const passive = evaluateMultiplayerTabRecoverySeal({
  lease: {
    status: 'CONFLICT',
    owner: false,
    blocking: true
  },
  transport: {
    status: 'QUIESCED',
    transportMode: 'online',
    quiesced: true
  },
  resilience: {
    status: 'SEALED',
    continuity: 'PASSIVE_TAB',
    blocking: true,
    sealed: true
  },
  epochFence: {
    status: 'SEALED',
    blocking: true
  },
  activeRun: true,
  now: 1200
});
assert.equal(passive.status, 'SEALED');
assert.equal(passive.continuity, 'PASSIVE_TAB');
assert.equal(passive.blocking, true);

const fencedOwner = evaluateMultiplayerTabRecoverySeal({
  lease: {
    status: 'CONFLICT',
    owner: false,
    blocking: true
  },
  transport: {
    status: 'QUIESCED',
    transportMode: 'online',
    quiesced: true
  },
  resilience: {
    status: 'SEALED',
    continuity: 'PASSIVE_TAB',
    blocking: true,
    sealed: true
  },
  epochFence: {
    status: 'FENCED',
    action: 'QUIESCE',
    blocking: true
  },
  activeRun: true,
  now: 1300
});
assert.equal(fencedOwner.status, 'SEALED');
assert.equal(fencedOwner.continuity, 'FENCED_OWNER');

const fencedStillConnected = evaluateMultiplayerTabRecoverySeal({
  lease: {
    status: 'CONFLICT',
    owner: false,
    blocking: true
  },
  transport: {
    status: 'OWNER_CONNECTED',
    transportMode: 'online',
    quiesced: false
  },
  epochFence: {
    status: 'FENCED',
    action: 'QUIESCE',
    blocking: true
  },
  activeRun: true,
  now: 1400
});
assert.equal(fencedStillConnected.status, 'RECOVERING');
assert.equal(
  fencedStillConnected.continuity,
  'FENCED_OWNER_SHUTDOWN'
);

const released = evaluateMultiplayerTabRecoverySeal({
  lease: {
    status: 'INACTIVE',
    owner: false,
    blocking: false
  },
  transport: {
    status: 'QUIESCED',
    quiesced: true
  },
  activeRun: false,
  now: 1500
});
assert.equal(released.status, 'SEALED');
assert.equal(released.continuity, 'LEASE_RELEASED');

const passiveConnected = evaluateMultiplayerTabRecoverySeal({
  lease: {
    status: 'CONFLICT',
    owner: false,
    blocking: true
  },
  transport: {
    status: 'OWNER_CONNECTED',
    transportMode: 'online',
    quiesced: false
  },
  resilience: {
    status: 'FAILED',
    reason: 'tab-resilience-passive-tab-connected'
  },
  activeRun: true,
  now: 1600
});
assert.equal(passiveConnected.status, 'FAILED');
assert.equal(passiveConnected.health, 'FAIL');

console.log('tab_recovery_seal_core tests passed');
