import assert from 'node:assert/strict';
import {
  POST_FINAL5_SERVER_PATCH,
  applyModerationAppealAction,
  moderationReportGroup,
  moderationReporterHistory,
  normalizeModerationAppeal,
  normalizeModerationReport
} from './ops1_core.js';

assert.equal(POST_FINAL5_SERVER_PATCH, 'post-final5-r1-moderation-player-safety-operations');
const now = Date.UTC(2026, 6, 16, 21, 0, 0);
const reports = [
  normalizeModerationReport({ reportId: 'r1', category: 'cheating', status: 'dismissed', createdAt: now - 3000 }, { now, reporterHash: 'same-reporter', targetHash: 'target-a' }),
  normalizeModerationReport({ reportId: 'r2', category: 'cheating', status: 'dismissed', createdAt: now - 2000 }, { now, reporterHash: 'same-reporter', targetHash: 'target-a' }),
  normalizeModerationReport({ reportId: 'r3', category: 'cheating', status: 'dismissed', createdAt: now - 1000 }, { now, reporterHash: 'same-reporter', targetHash: 'target-a' }),
  normalizeModerationReport({ reportId: 'r4', category: 'cheating', status: 'pending', createdAt: now }, { now, reporterHash: 'other-reporter', targetHash: 'target-a' })
];
const history = moderationReporterHistory(reports, 'same-reporter');
assert.equal(history.total, 3);
assert.equal(history.dismissed, 3);
assert.equal(history.automaticPenalty, false);
const group = moderationReportGroup(reports, reports[3]);
assert.equal(group.count, 4);
assert.equal(group.uniqueReporters, 2);
assert.equal(group.coordinatedSignal, true);

const appeal = normalizeModerationAppeal({
  appealId: 'appeal-1',
  reportId: 'r4',
  note: '<please> review',
  createdAt: now
}, { now, targetHash: 'target-a' });
assert.equal(appeal.status, 'pending');
assert.equal(appeal.note.includes('<'), false);
const decision = applyModerationAppealAction(appeal, {
  action: 'reduce',
  note: 'Reduced after review'
}, { now: now + 1000, actorHash: 'admin-hash' });
assert.equal(decision.appeal.status, 'reduced');
assert.equal(decision.audit.subjectType, 'appeal');
assert.equal(decision.audit.actorHash, 'admin-hash');
console.log('POST-FINAL.5 moderation core tests passed');
