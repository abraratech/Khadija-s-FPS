import assert from 'node:assert/strict';
import {
  POST_FINAL6_PATCH,
  appendInternalNote,
  createAdminSession,
  filterModerationReports,
  inviteActive,
  moderationAuditCsv,
  moderationPriority,
  normalizeAdminHandle,
  normalizeAdminInvite,
  roleAllows,
  sessionActive,
  validateDecisionConfirmation
} from './postfinal6_admin_core.js';

assert.equal(POST_FINAL6_PATCH, 'post-final6-r1-production-operations-hardening');
assert.equal(normalizeAdminHandle(' Owner @ Arena '), 'ownerarena');
assert.equal(roleAllows('viewer', 'reports.read'), true);
assert.equal(roleAllows('viewer', 'reports.review'), false);
assert.equal(roleAllows('moderator', 'reports.temporary-restriction'), true);
assert.equal(roleAllows('senior-moderator', 'appeals.decide'), true);
assert.equal(roleAllows('senior-moderator', 'reports.ban'), false);
assert.equal(roleAllows('owner', 'reports.ban'), true);

const now = Date.UTC(2026, 6, 17, 0, 0, 0);
const session = createAdminSession({
  sessionId: 'session-1',
  tokenHash: 'a'.repeat(64),
  adminId: 'admin-1',
  role: 'owner',
  now
});
assert.equal(sessionActive(session, now + 1000), true);
assert.equal(sessionActive({ ...session, revokedAt: now + 1 }, now + 1000), false);

const invite = normalizeAdminInvite({
  inviteId: 'invite-1',
  codeHash: 'b'.repeat(64),
  handle: 'mod.one',
  displayName: 'Mod One',
  role: 'moderator',
  createdByAdminId: 'owner-1',
  createdAt: now
}, now);
assert.equal(inviteActive(invite, now + 1000), true);

assert.equal(validateDecisionConfirmation({
  subjectType: 'report',
  action: 'warning',
  subjectId: 'report-1',
  confirmation: ''
}), true);
assert.equal(validateDecisionConfirmation({
  subjectType: 'report',
  action: 'ban',
  subjectId: 'report-1',
  confirmation: 'wrong'
}), false);
assert.equal(validateDecisionConfirmation({
  subjectType: 'appeal',
  action: 'lift',
  subjectId: 'appeal-1',
  confirmation: 'appeal-1'
}), true);

const reports = [
  { reportId: 'r1', status: 'pending', category: 'hate', assignedToAdminId: 'a1', targetHash: 'target-a', createdAt: now - 30 * 60 * 60 * 1000, group: { count: 3, uniqueReporters: 2 } },
  { reportId: 'r2', status: 'dismissed', category: 'spam', assignedToAdminId: '', targetHash: 'target-b', createdAt: now }
];
assert.equal(filterModerationReports(reports, { query: 'target-a' }).length, 1);
assert.equal(filterModerationReports(reports, { status: 'dismissed' }).length, 1);
assert.equal(moderationPriority(reports[0], now).priority, 'critical');

const withNote = appendInternalNote(reports[0], {
  noteId: 'note-1',
  actorHash: 'actor',
  actorAdminId: 'admin-1',
  text: '<follow up>',
  now
});
assert.equal(withNote.internalNotes.length, 1);
assert.equal(withNote.internalNotes[0].text.includes('<'), false);

const csv = moderationAuditCsv([{ auditId: 'a1', action: 'warning', note: 'hello, "world"' }]);
assert.ok(csv.includes('"hello, ""world"""'));
console.log('POST-FINAL.6 administrator operations core tests passed');
