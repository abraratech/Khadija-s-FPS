import assert from 'node:assert/strict';
import {
  POST_FINAL6_FRONTEND_PATCH,
  adminCan,
  cleanSearch,
  confirmationRequired
} from './moderation_admin_core.js';

assert.equal(POST_FINAL6_FRONTEND_PATCH, 'post-final6-r1-production-operations-hardening');
assert.equal(adminCan('viewer', 'read'), true);
assert.equal(adminCan('viewer', 'review'), false);
assert.equal(adminCan('moderator', 'restrict'), true);
assert.equal(adminCan('moderator', 'suspend'), false);
assert.equal(adminCan('senior-moderator', 'appeal'), true);
assert.equal(adminCan('senior-moderator', 'ban'), false);
assert.equal(adminCan('owner', 'staff'), true);
assert.equal(confirmationRequired('report', 'warning'), false);
assert.equal(confirmationRequired('report', 'ban'), true);
assert.equal(confirmationRequired('appeal', 'lift'), true);
assert.equal(cleanSearch('<target>'), 'target');
console.log('POST-FINAL.6 moderation admin frontend core tests passed');
