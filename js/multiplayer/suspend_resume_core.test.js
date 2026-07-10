// js/multiplayer/suspend_resume_core.test.js
import assert from 'node:assert/strict';
import {
  createMultiplayerSuspendIncident,
  evaluateMultiplayerSuspendResume,
  normalizeMultiplayerSuspendIncident,
  MULTIPLAYER_SUSPEND_MIN_GAP_MS,
  MULTIPLAYER_SUSPEND_RESUME_PATCH,
  MULTIPLAYER_SUSPEND_RESUME_PROTOCOL
} from './suspend_resume_core.js';

assert.equal(
  MULTIPLAYER_SUSPEND_RESUME_PATCH,
  'm3-tab-recovery-seal-r1'
);
assert.equal(MULTIPLAYER_SUSPEND_RESUME_PROTOCOL, 6);
assert.equal(MULTIPLAYER_SUSPEND_MIN_GAP_MS, 15000);

const incident = createMultiplayerSuspendIncident({
  hiddenAt: 1000,
  createdAt: 1000,
  reason: 'visibility-hidden',
  incidentId: 'incident-55',
  ttlMs: 60000
});
assert.ok(incident);

const inactive = evaluateMultiplayerSuspendResume({
  incident,
  now: 20000,
  activeRun: false,
  online: true
});
assert.equal(inactive.status, 'INACTIVE');
assert.equal(inactive.action, 'NONE');

const shortGap = evaluateMultiplayerSuspendResume({
  incident,
  now: 5000,
  activeRun: true,
  online: true
});
assert.equal(shortGap.status, 'SHORT_GAP');
assert.equal(shortGap.blocking, false);

const longGap = evaluateMultiplayerSuspendResume({
  incident,
  now: 20000,
  activeRun: true,
  online: true
});
assert.equal(longGap.status, 'PROBE_REQUIRED');
assert.equal(longGap.action, 'PROBE_TRANSPORT');
assert.equal(longGap.blocking, true);

const waiting = evaluateMultiplayerSuspendResume({
  incident,
  now: 20000,
  activeRun: true,
  online: false
});
assert.equal(waiting.status, 'WAITING_ONLINE');
assert.equal(waiting.action, 'WAIT_ONLINE');

const persisted = evaluateMultiplayerSuspendResume({
  incident,
  now: 1200,
  activeRun: true,
  online: true,
  persisted: true
});
assert.equal(persisted.status, 'PROBE_REQUIRED');
assert.equal(persisted.reason, 'suspend-resume-page-lifecycle-probe');

const alreadyRecovering = evaluateMultiplayerSuspendResume({
  incident,
  now: 20000,
  activeRun: true,
  online: true,
  alreadyRecovering: true
});
assert.equal(alreadyRecovering.status, 'RECOVERY_ACTIVE');
assert.equal(alreadyRecovering.action, 'NONE');

assert.equal(
  normalizeMultiplayerSuspendIncident(incident, incident.expiresAt + 1),
  null
);

console.log('suspend_resume_core tests passed');
