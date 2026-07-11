import assert from 'node:assert/strict';
import {
  CLOUD_RELIABILITY_PATCH,
  acquireSyncLease,
  calculateClockSkew,
  completeSyncQueue,
  computeSyncRetryDelay,
  createAccountTombstone,
  createSyncQueueEntry,
  enqueueSync,
  markSyncAttempt,
  normalizeSyncQueue,
  peekReadySync,
  pruneCloudActivity,
  renewSyncLease,
  tombstoneBlocksAccount,
  verifyHistoryIntegrity,
  verifyProfileIntegrity
} from './cloud_profile_reliability_core.js';
import { createGuestCloudProfile, mergeCloudProfiles, profileChecksum } from './cloud_profile_core.js';

assert.equal(CLOUD_RELIABILITY_PATCH, 'm4-cloud-sync-reliability-r1');
const baseProfile = createGuestCloudProfile({
  profileId: 'guest-reliability-a',
  legacyStorage: { fps_hi_score: '100', fps_hi_wave: '2' },
  now: 1000,
  createdAt: 500,
  revision: 1
});
const entry = createSyncQueueEntry({
  operationId: 'operation-reliability-0001',
  profile: baseProfile,
  expectedCloudRevision: 4,
  fingerprint: baseProfile.legacyFingerprint,
  checksum: profileChecksum(baseProfile),
  now: 2000
});
let queue = enqueueSync([], entry, { now: 2000 });
assert.equal(queue.length, 1);
assert.equal(peekReadySync(queue, 2000).operationId, entry.operationId);
const attempted = markSyncAttempt(queue[0], { now: 2100, error: 'TIMEOUT', random: 0.5 });
assert.equal(attempted.attempts, 1);
assert.equal(attempted.nextAttemptAt, 4100);
assert.equal(computeSyncRetryDelay(20, 1), 300000);
queue = normalizeSyncQueue([attempted], { now: 2100 });
assert.equal(peekReadySync(queue, 4099), null);
assert.equal(completeSyncQueue(queue, entry.operationId).length, 0);

const firstLease = acquireSyncLease(null, { ownerId: 'tab-a', now: 1000, ttlMs: 15000 });
assert.equal(firstLease.acquired, true);
assert.equal(acquireSyncLease(firstLease.lease, { ownerId: 'tab-b', now: 2000 }).acquired, false);
const renewed = renewSyncLease(firstLease.lease, { ownerId: 'tab-a', now: 3000, ttlMs: 15000 });
assert.equal(renewed.renewed, true);
assert.equal(acquireSyncLease(renewed.lease, { ownerId: 'tab-b', now: 19001 }).acquired, true);

const skew = calculateClockSkew({ serverTime: 5000, clientSentAt: 3900, clientReceivedAt: 4100 });
assert.equal(skew.valid, true);
assert.equal(skew.offsetMs, 1000);
assert.equal(skew.roundTripMs, 200);

const integrity = verifyProfileIntegrity(baseProfile, profileChecksum(baseProfile), profileChecksum);
assert.equal(integrity.valid, true);
assert.equal(verifyHistoryIntegrity(baseProfile, { revision: 1, checksum: profileChecksum(baseProfile) }, profileChecksum).valid, true);

const tombstone = createAccountTombstone({
  accountId: 'cloud-1234567890abcdef1234567890abcdef',
  deletedAt: 1000,
  deletionId: 'delete-00000001',
  deviceId: 'device-a'
});
assert.equal(tombstoneBlocksAccount(tombstone, tombstone.accountId, 2000), true);
assert.equal(tombstoneBlocksAccount(tombstone, tombstone.accountId, tombstone.retainUntil + 1), false);

const activity = pruneCloudActivity([
  { id: 'new', at: 10000 },
  { id: 'old', at: 100 }
], { now: 11000, retentionMs: 5000, limit: 10 });
assert.deepEqual(activity.map((item) => item.id), ['new']);

// Two-device convergence: both devices make distinct durable changes, then merge in either order.
const deviceA = createGuestCloudProfile({
  profileId: 'guest-device-a',
  legacyStorage: {
    fps_hi_score: '800',
    fps_hi_wave: '4',
    ka_progression_v1: JSON.stringify({ version: 1, xp: 500, totalRuns: 2 })
  },
  now: 3000,
  createdAt: 500,
  revision: 3
});
const deviceB = createGuestCloudProfile({
  profileId: 'guest-device-b',
  legacyStorage: {
    fps_hi_score: '600',
    fps_hi_wave: '9',
    ka_progression_v1: JSON.stringify({ version: 1, xp: 300, totalRuns: 7 })
  },
  now: 3500,
  createdAt: 600,
  revision: 5
});
const mergedAB = mergeCloudProfiles(deviceA, deviceB, { now: 4000 });
const mergedBA = mergeCloudProfiles(deviceB, deviceA, { now: 4000 });
assert.equal(profileChecksum(mergedAB), profileChecksum(mergedBA));
assert.equal(mergedAB.records.highScore, 800);
assert.equal(mergedAB.records.highWave, 9);
assert.equal(mergedAB.progression.xp, 500);
assert.equal(mergedAB.progression.totalRuns, 7);

console.log('Cloud profile reliability and two-device convergence tests: PASS');
