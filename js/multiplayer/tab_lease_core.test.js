// js/multiplayer/tab_lease_core.test.js
import assert from 'node:assert/strict';
import {
  createMultiplayerTabLease,
  evaluateMultiplayerTabLease,
  normalizeMultiplayerTabLease,
  MULTIPLAYER_TAB_LEASE_PATCH,
  MULTIPLAYER_TAB_LEASE_PROTOCOL,
  MULTIPLAYER_TAB_LEASE_TTL_MS
} from './tab_lease_core.js';

assert.equal(MULTIPLAYER_TAB_LEASE_PATCH, 'm3-tab-ownership-seal-r1');
assert.equal(MULTIPLAYER_TAB_LEASE_PROTOCOL, 6);
assert.equal(MULTIPLAYER_TAB_LEASE_TTL_MS, 6500);

const lease = createMultiplayerTabLease({
  instanceId: 'instance-a',
  pageId: 'page-a',
  epoch: 2,
  acquiredAt: 1000,
  heartbeatAt: 1000,
  ttlMs: 6500
});
assert.ok(lease);
assert.equal(lease.expiresAt, 7500);

const inactive = evaluateMultiplayerTabLease({
  lease,
  instanceId: 'instance-a',
  pageId: 'page-a',
  now: 1200,
  activeRun: false
});
assert.equal(inactive.status, 'INACTIVE');
assert.equal(inactive.action, 'RELEASE');
assert.equal(inactive.blocking, false);

const owner = evaluateMultiplayerTabLease({
  lease,
  instanceId: 'instance-a',
  pageId: 'page-a',
  now: 2000,
  activeRun: true
});
assert.equal(owner.status, 'OWNED');
assert.equal(owner.action, 'RENEW');
assert.equal(owner.owner, true);
assert.equal(owner.blocking, false);
assert.equal(owner.nextLease.heartbeatAt, 2000);

const conflict = evaluateMultiplayerTabLease({
  lease,
  instanceId: 'instance-b',
  pageId: 'page-b',
  now: 2200,
  activeRun: true
});
assert.equal(conflict.status, 'CONFLICT');
assert.equal(conflict.action, 'BLOCK');
assert.equal(conflict.blocking, true);
assert.equal(conflict.owner, false);

const duplicateInstance = evaluateMultiplayerTabLease({
  lease,
  instanceId: 'instance-a',
  pageId: 'page-copy',
  now: 2300,
  activeRun: true
});
assert.equal(duplicateInstance.status, 'CONFLICT');
assert.equal(
  duplicateInstance.reason,
  'tab-lease-duplicate-instance'
);

const reloadHandoff = evaluateMultiplayerTabLease({
  lease,
  instanceId: 'instance-a',
  pageId: 'page-reload',
  now: 2400,
  activeRun: true,
  allowSameInstanceHandoff: true
});
assert.equal(reloadHandoff.status, 'OWNED');
assert.equal(reloadHandoff.action, 'HANDOFF');
assert.equal(reloadHandoff.nextLease.epoch, 3);
assert.equal(reloadHandoff.blocking, false);

const takeover = evaluateMultiplayerTabLease({
  lease,
  instanceId: 'instance-b',
  pageId: 'page-b',
  now: 2500,
  activeRun: true,
  forceTakeover: true
});
assert.equal(takeover.status, 'OWNED');
assert.equal(takeover.action, 'TAKEOVER');
assert.equal(takeover.nextLease.epoch, 3);
assert.equal(takeover.blocking, false);

const expired = evaluateMultiplayerTabLease({
  lease,
  instanceId: 'instance-b',
  pageId: 'page-b',
  now: 7600,
  activeRun: true
});
assert.equal(expired.status, 'OWNED');
assert.equal(expired.action, 'ACQUIRE');
assert.equal(expired.reason, 'tab-lease-expired-owner-replaced');

assert.equal(
  normalizeMultiplayerTabLease({
    ...lease,
    instanceId: ''
  }),
  null
);
assert.equal(
  createMultiplayerTabLease({
    instanceId: '',
    pageId: 'page-a'
  }),
  null
);

console.log('tab_lease_core tests passed');
