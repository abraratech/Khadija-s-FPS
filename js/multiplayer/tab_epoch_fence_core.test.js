// js/multiplayer/tab_epoch_fence_core.test.js
import assert from 'node:assert/strict';
import {
  evaluateMultiplayerTabEpochFence,
  evaluateMultiplayerTabLeaseWriteFence,
  MULTIPLAYER_TAB_EPOCH_FENCE_PATCH,
  MULTIPLAYER_TAB_EPOCH_FENCE_PROTOCOL
} from './tab_epoch_fence_core.js';

assert.equal(
  MULTIPLAYER_TAB_EPOCH_FENCE_PATCH,
  'm3-final-certification-seal-r1'
);
assert.equal(MULTIPLAYER_TAB_EPOCH_FENCE_PROTOCOL, 6);

const ownerA = {
  instanceId: 'instance-a',
  pageId: 'page-a',
  epoch: 4
};

const renew = evaluateMultiplayerTabLeaseWriteFence({
  currentLease: ownerA,
  nextLease: {
    ...ownerA,
    heartbeatAt: 2000
  }
});
assert.equal(renew.status, 'ALLOW');
assert.equal(renew.allowed, true);
assert.equal(renew.reason, 'tab-epoch-fence-owner-renew');

const supersede = evaluateMultiplayerTabLeaseWriteFence({
  currentLease: ownerA,
  nextLease: {
    instanceId: 'instance-b',
    pageId: 'page-b',
    epoch: 5
  }
});
assert.equal(supersede.status, 'ALLOW');
assert.equal(supersede.allowed, true);
assert.equal(
  supersede.reason,
  'tab-epoch-fence-owner-supersede'
);

const staleWrite = evaluateMultiplayerTabLeaseWriteFence({
  currentLease: {
    instanceId: 'instance-b',
    pageId: 'page-b',
    epoch: 5
  },
  nextLease: ownerA
});
assert.equal(staleWrite.status, 'FENCED');
assert.equal(staleWrite.allowed, false);
assert.equal(
  staleWrite.reason,
  'tab-epoch-fence-stale-owner-write'
);

const staleGeneration = evaluateMultiplayerTabLeaseWriteFence({
  currentLease: {
    ...ownerA,
    epoch: 6
  },
  nextLease: ownerA
});
assert.equal(staleGeneration.status, 'FENCED');
assert.equal(staleGeneration.allowed, false);

const activeOwner = evaluateMultiplayerTabEpochFence({
  lease: {
    status: 'OWNED',
    owner: true,
    blocking: false,
    instanceId: 'instance-b',
    pageId: 'page-b',
    nextLease: {
      instanceId: 'instance-b',
      pageId: 'page-b',
      epoch: 5
    }
  },
  storedLease: {
    instanceId: 'instance-b',
    pageId: 'page-b',
    epoch: 5
  },
  transport: {
    status: 'OWNER_CONNECTED',
    transportState: 'connected',
    transportMode: 'online',
    quiesced: false
  },
  now: 3000
});
assert.equal(activeOwner.status, 'SEALED');
assert.equal(activeOwner.blocking, false);

const displacedOwner = evaluateMultiplayerTabEpochFence({
  lease: {
    status: 'OWNED',
    owner: true,
    blocking: false,
    instanceId: 'instance-a',
    pageId: 'page-a',
    nextLease: ownerA
  },
  storedLease: {
    instanceId: 'instance-b',
    pageId: 'page-b',
    epoch: 5
  },
  transport: {
    status: 'OWNER_CONNECTED',
    transportState: 'connected',
    transportMode: 'online',
    quiesced: false
  },
  now: 3100
});
assert.equal(displacedOwner.status, 'FENCED');
assert.equal(displacedOwner.action, 'QUIESCE');
assert.equal(displacedOwner.blocking, true);

const passiveConnected = evaluateMultiplayerTabEpochFence({
  lease: {
    status: 'CONFLICT',
    owner: false,
    blocking: true
  },
  storedLease: {
    instanceId: 'instance-b',
    pageId: 'page-b',
    epoch: 5
  },
  transport: {
    status: 'OWNER_CONNECTED',
    transportState: 'connected',
    transportMode: 'online',
    quiesced: false
  },
  now: 3200
});
assert.equal(passiveConnected.status, 'VIOLATION');
assert.equal(passiveConnected.action, 'QUIESCE');

const passiveQuiesced = evaluateMultiplayerTabEpochFence({
  lease: {
    status: 'CONFLICT',
    owner: false,
    blocking: true
  },
  storedLease: {
    instanceId: 'instance-b',
    pageId: 'page-b',
    epoch: 5
  },
  transport: {
    status: 'QUIESCED',
    transportState: 'disconnected',
    transportMode: 'online',
    quiesced: true
  },
  now: 3300
});
assert.equal(passiveQuiesced.status, 'SEALED');
assert.equal(passiveQuiesced.blocking, true);

console.log('tab_epoch_fence_core tests passed');
