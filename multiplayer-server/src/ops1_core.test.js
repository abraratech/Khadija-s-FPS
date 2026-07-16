import assert from 'node:assert/strict';
import {
  OPS1_SERVER_PATCH,
  addEventToOpsBucket,
  applyModerationAction,
  consumeOpsRate,
  createOpsBucket,
  normalizeModerationReport,
  normalizeOpsRateState,
  normalizeOpsServerEvent,
  moderationRestrictionForAction,
  opsHourKey,
  redactOpsServerText,
  sanitizeOpsServerContext,
  summarizeOpsHealth
} from './ops1_core.js';

const now = Date.UTC(2026, 6, 16, 14, 30, 0);
assert.equal(opsHourKey(now), '2026-07-16-14');

const redacted = redactOpsServerText(
  'Bearer abcdefghijklmnop user@example.com 10.0.0.1 cloud-0123456789abcdef0123456789abcdef https://example.com/a?token=x'
);
assert.equal(redacted.includes('user@example.com'), false);
assert.equal(redacted.includes('10.0.0.1'), false);
assert.equal(redacted.includes('?token=x'), false);
assert.equal(redacted.includes('0123456789abcdef'), false);

const context = sanitizeOpsServerContext({
  routeGroup: 'profiles',
  status: 503,
  method: 'POST',
  accountId: 'forbidden',
  email: 'forbidden@example.com',
  retryable: true
});
assert.deepEqual(
  Object.keys(context).sort(),
  ['method', 'retryable', 'routeGroup', 'status']
);

const event = normalizeOpsServerEvent({
  eventId: 'event-1',
  type: 'worker-route',
  severity: 'error',
  message: 'profiles failed for user@example.com',
  context: {
    routeGroup: 'profiles',
    status: 503,
    durationBucket: 'slow',
    method: 'POST'
  },
  source: 'worker-edge',
  releasePatch: OPS1_SERVER_PATCH,
  timestamp: now
}, {
  now,
  sourceHash: 'abc123',
  region: 'pk'
});
assert.ok(event);
assert.equal(event.region, 'PK');
assert.equal(event.message.includes('@'), false);
assert.equal(event.context.status, 503);

const initial = createOpsBucket(now);
assert.equal(initial.hour, '2026-07-16-14');
assert.equal(initial.startedAt, Date.UTC(2026, 6, 16, 14));

const bucket = addEventToOpsBucket(initial, event);
assert.equal(bucket.events, 1);
assert.equal(bucket.errors, 1);
assert.equal(bucket.status5xx, 1);
assert.equal(bucket.byType['worker-route'], 1);
assert.equal(bucket.byRouteGroup.profiles, 1);
assert.equal(bucket.byRegion.PK, 1);
assert.equal(bucket.duration.slow, 1);

let rate = consumeOpsRate({}, {
  now,
  limit: 2,
  windowMs: 60_000,
  blockMs: 10_000
});
assert.equal(rate.allowed, true);
rate = consumeOpsRate(rate.state, {
  now: now + 1,
  limit: 2,
  windowMs: 60_000,
  blockMs: 10_000
});
assert.equal(rate.allowed, true);
rate = consumeOpsRate(rate.state, {
  now: now + 2,
  limit: 2,
  windowMs: 60_000,
  blockMs: 10_000
});
assert.equal(rate.allowed, false);
assert.equal(rate.reason, 'OPS_RATE_LIMITED');
assert.ok(rate.state.blockedUntil > now);

const resetRate = normalizeOpsRateState(rate.state, now + 20_000);
assert.equal(resetRate.strikes, 1);

const report = normalizeModerationReport({
  reportId: 'report-1',
  category: 'harassment',
  note: 'Contact me at user@example.com',
  context: {
    mapId: 'grid_bunker',
    mode: 'coop',
    wave: 8,
    roomRef: 'hash-room'
  },
  createdAt: now
}, {
  now,
  reporterHash: 'reporter-hash',
  targetHash: 'target-hash'
});
assert.equal(report.category, 'harassment');
assert.equal(report.note.includes('@'), false);
assert.equal(report.status, 'pending');
assert.equal(report.reporterHash, 'reporter-hash');

const action = applyModerationAction(report, {
  auditId: 'audit-1',
  action: 'warning',
  status: 'actioned',
  note: 'Reviewed'
}, {
  now: now + 1000,
  actorHash: 'admin-hash'
});
assert.equal(action.report.status, 'actioned');
assert.equal(action.report.action, 'warning');
assert.equal(action.audit.actorHash, 'admin-hash');

const restriction = moderationRestrictionForAction({
  action: 'suspension',
  note: 'Repeated abuse'
}, {
  now,
  reportId: 'report-1',
  targetHash: 'target-hash'
});
assert.equal(restriction.action, 'suspension');
assert.equal(restriction.targetHash, 'target-hash');
assert.equal(restriction.expiresAt, now + 7 * 24 * 60 * 60 * 1000);
assert.equal(
  moderationRestrictionForAction({ action: 'warning' }, { now }),
  null
);

const healthy = summarizeOpsHealth({
  buckets: [bucket],
  pendingReports: 2,
  now: now + 30_000,
  releasePatch: OPS1_SERVER_PATCH
});
assert.equal(healthy.ok, true);
assert.equal(healthy.status, 'healthy');
assert.equal(healthy.reportsPending, 2);
assert.equal(healthy.privacy.rawIpStored, false);

const degradedBucket = {
  ...bucket,
  events: 25,
  errors: 8,
  critical: 3,
  status5xx: 15
};
const degraded = summarizeOpsHealth({
  buckets: [degradedBucket],
  now: now + 30_000
});
assert.equal(degraded.status, 'degraded');

console.log('ops1 worker core tests passed');
