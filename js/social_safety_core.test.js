import assert from 'node:assert/strict';
import {
  POST_FINAL5_PATCH,
  normalizeSocialSafety,
  restrictionLabel,
  safetyAppealStatusLabel,
  safetyReportStatusLabel
} from './social_safety_core.js';

assert.equal(POST_FINAL5_PATCH, 'post-final5-r1-moderation-player-safety-operations');
const now = 2_000_000;
const value = normalizeSocialSafety({
  available: true,
  retryingReports: 2,
  reports: [
    { reportId: 'report-1', category: 'cheating', status: 'actioned', createdAt: 4 },
    { reportId: 'report-2', category: 'spam', status: 'received', createdAt: 8 }
  ],
  appeals: [{ appealId: 'appeal-1', status: 'lifted', createdAt: 9 }],
  restriction: {
    active: true,
    action: 'temporary-restriction',
    expiresAt: now + 7_200_000,
    reportId: 'report-3'
  }
}, now);
assert.equal(value.reports[0].reportId, 'report-2');
assert.equal(value.reports[1].status, 'received');
assert.equal(value.appeals[0].status, 'lifted');
assert.equal(value.restriction.active, true);
assert.equal(value.retryingReports, 2);
assert.equal(safetyReportStatusLabel('review-complete'), 'REVIEW COMPLETE');
assert.equal(safetyAppealStatusLabel('reduced'), 'RESTRICTION REDUCED');
assert.match(restrictionLabel(value.restriction, now), /2H REMAINING/);
assert.equal(normalizeSocialSafety({ restriction: { active: true, expiresAt: now - 1 } }, now).restriction.active, false);
console.log('POST-FINAL.5 social safety core tests passed');
