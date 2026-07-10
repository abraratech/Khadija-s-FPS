// js/multiplayer/tab_owner_probe_core.test.js
import assert from 'node:assert/strict';
import {
  createMultiplayerTabOwnerProbe,
  evaluateMultiplayerTabOwnerProbe,
  isMultiplayerTabOwnerProbeAckValid,
  MULTIPLAYER_TAB_OWNER_PROBE_PATCH,
  MULTIPLAYER_TAB_OWNER_PROBE_PROTOCOL,
  MULTIPLAYER_TAB_OWNER_PROBE_TIMEOUT_MS
} from './tab_owner_probe_core.js';

assert.equal(
  MULTIPLAYER_TAB_OWNER_PROBE_PATCH,
  'm3-final-certification-seal-r1'
);
assert.equal(MULTIPLAYER_TAB_OWNER_PROBE_PROTOCOL, 6);
assert.equal(MULTIPLAYER_TAB_OWNER_PROBE_TIMEOUT_MS, 650);

const lease = {
  instanceId: 'owner-instance',
  pageId: 'owner-page',
  epoch: 4
};

const probe = createMultiplayerTabOwnerProbe({
  probeId: 'probe-67',
  lease,
  challengerInstanceId: 'challenger-instance',
  challengerPageId: 'challenger-page',
  startedAt: 1000,
  timeoutMs: 650
});
assert.ok(probe);
assert.equal(probe.deadlineAt, 1650);

const probing = evaluateMultiplayerTabOwnerProbe({
  probe,
  currentLease: lease,
  now: 1200
});
assert.equal(probing.status, 'PROBING');
assert.equal(probing.action, 'WAIT');
assert.equal(probing.final, false);

const ack = {
  probeId: 'probe-67',
  ownerInstanceId: 'owner-instance',
  ownerPageId: 'owner-page',
  ownerEpoch: 4
};
assert.equal(
  isMultiplayerTabOwnerProbeAckValid({ probe, ack }),
  true
);

const alive = evaluateMultiplayerTabOwnerProbe({
  probe,
  currentLease: lease,
  ack,
  now: 1300
});
assert.equal(alive.status, 'ALIVE');
assert.equal(alive.action, 'BLOCK');
assert.equal(alive.health, 'PASS');

const stale = evaluateMultiplayerTabOwnerProbe({
  probe,
  currentLease: lease,
  now: 1651
});
assert.equal(stale.status, 'STALE');
assert.equal(stale.action, 'RECLAIM');

const changed = evaluateMultiplayerTabOwnerProbe({
  probe,
  currentLease: {
    instanceId: 'new-owner',
    pageId: 'new-page',
    epoch: 5
  },
  now: 1400
});
assert.equal(changed.status, 'LEASE_CHANGED');
assert.equal(changed.action, 'REEVALUATE');

const badAck = {
  ...ack,
  ownerEpoch: 3
};
assert.equal(
  isMultiplayerTabOwnerProbeAckValid({ probe, ack: badAck }),
  false
);

assert.equal(
  createMultiplayerTabOwnerProbe({
    probeId: '',
    lease,
    challengerInstanceId: 'challenger',
    challengerPageId: 'page'
  }),
  null
);

console.log('tab_owner_probe_core tests passed');
