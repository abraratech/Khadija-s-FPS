import assert from 'node:assert/strict';
import {
  OPS1_PATCH,
  enqueueOpsEvent,
  normalizeOpsEvent,
  normalizeOpsHealth,
  normalizeOpsPreferences,
  normalizeOpsQueue,
  opsFingerprint,
  redactOpsText,
  sanitizeOpsContext,
  shouldSendOpsEvent
} from './ops1_core.js';

const defaultPrefs = normalizeOpsPreferences({});
assert.equal(defaultPrefs.telemetryLevel, 'essential');
assert.equal(defaultPrefs.crashReports, true);
assert.equal(defaultPrefs.performanceMetrics, false);

const off = normalizeOpsPreferences({
  telemetryLevel: 'off',
  crashReports: true,
  performanceMetrics: true
});
assert.equal(off.crashReports, false);
assert.equal(off.performanceMetrics, false);
assert.equal(shouldSendOpsEvent(off, 'client-crash'), false);

const standard = normalizeOpsPreferences({
  telemetryLevel: 'standard',
  performanceMetrics: true
});
assert.equal(standard.performanceMetrics, true);
assert.equal(shouldSendOpsEvent(standard, 'performance'), true);
assert.equal(shouldSendOpsEvent(defaultPrefs, 'performance'), false);
assert.equal(shouldSendOpsEvent(defaultPrefs, 'client-crash'), true);

const redacted = redactOpsText(
  'Bearer abcdefghijklmnop token=supersecret cloud-0123456789abcdef0123456789abcdef user@example.com 192.168.1.9 https://example.com/path?token=bad'
);
assert.equal(redacted.includes('supersecret'), false);
assert.equal(redacted.includes('user@example.com'), false);
assert.equal(redacted.includes('192.168.1.9'), false);
assert.equal(redacted.includes('?token=bad'), false);
assert.match(redacted, /\[redacted\]/);
assert.match(redacted, /\[email\]/);
assert.match(redacted, /\[ip\]/);

const context = sanitizeOpsContext({
  route: '/profiles/sync?token=secret',
  status: 503,
  mapId: 'grid_bunker',
  accountId: 'cloud-secret',
  freeForm: 'not allowed',
  online: true
});
assert.deepEqual(Object.keys(context).sort(), ['mapId', 'online', 'route', 'status']);
assert.equal(context.status, 503);
assert.equal(context.online, true);

const now = 1_800_000_000_000;
const event = normalizeOpsEvent({
  eventId: 'event-1',
  type: 'client-crash',
  severity: 'critical',
  message: 'Failure for user@example.com',
  stack: 'Error: failure\n at https://example.com/app.js?secret=x:10:4',
  context: {
    route: '/play?token=bad',
    online: true,
    accountId: 'cloud-0123456789abcdef0123456789abcdef'
  },
  source: 'frontend',
  releasePatch: OPS1_PATCH,
  timestamp: now
}, {
  preferences: standard,
  now
});
assert.ok(event);
assert.equal(event.eventId, 'event-1');
assert.equal(event.type, 'client-crash');
assert.equal(event.message.includes('user@example.com'), false);
assert.equal(event.stack.includes('?secret=x'), false);
assert.equal('accountId' in event.context, false);
assert.equal(event.releasePatch, OPS1_PATCH);
assert.match(event.fingerprint, /^ops-[a-f0-9]{8}$/);

const fingerprintA = opsFingerprint('stable');
const fingerprintB = opsFingerprint('stable');
assert.equal(fingerprintA, fingerprintB);

const old = {
  ...event,
  eventId: 'old',
  timestamp: now - 2 * 24 * 60 * 60 * 1000
};
const queue = normalizeOpsQueue([
  old,
  event,
  { ...event, eventId: 'event-1' }
], { now });
assert.equal(queue.length, 1);
assert.equal(queue[0].eventId, 'event-1');

const appended = enqueueOpsEvent(queue, {
  ...event,
  eventId: 'event-2',
  timestamp: now + 1
}, { now: now + 1 });
assert.deepEqual(appended.map((entry) => entry.eventId), ['event-1', 'event-2']);

const health = normalizeOpsHealth({
  ok: true,
  status: 'degraded',
  patch: OPS1_PATCH,
  events: 12,
  errors: 3,
  reportsPending: 2
});
assert.equal(health.ok, true);
assert.equal(health.status, 'degraded');
assert.equal(health.events, 12);
assert.equal(health.errors, 3);
assert.equal(health.reportsPending, 2);

console.log('ops1_core tests passed');
