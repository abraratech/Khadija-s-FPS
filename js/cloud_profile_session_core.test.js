// js/cloud_profile_session_core.test.js
import assert from 'node:assert/strict';
import {
  CLOUD_SESSION_EXPIRED_MESSAGE,
  CLOUD_SESSION_RECOVERY_PATCH,
  PERMANENT_CLOUD_SESSION_CODES,
  createCloudSessionExpiryResult,
  getCloudSessionErrorCode,
  isPermanentCloudSessionError
} from './cloud_profile_session_core.js';

assert.equal(CLOUD_SESSION_RECOVERY_PATCH, 'm4-expired-cloud-session-recovery-r1');
assert.equal(CLOUD_SESSION_EXPIRED_MESSAGE, 'CLOUD SESSION EXPIRED · LOCAL PROFILE KEPT');
assert.deepEqual(PERMANENT_CLOUD_SESSION_CODES, [
  'PROFILE_TOKEN_REJECTED',
  'PROFILE_AUTH_REQUIRED',
  'CLOUD_SESSION_EXPIRED'
]);
assert.equal(getCloudSessionErrorCode({ payload: { error: 'PROFILE_TOKEN_REJECTED' } }), 'PROFILE_TOKEN_REJECTED');
assert.equal(isPermanentCloudSessionError({ code: 'PROFILE_TOKEN_REJECTED', status: 401 }), true);
assert.equal(isPermanentCloudSessionError({ code: 'PROFILE_AUTH_REQUIRED', status: 401 }), true);
assert.equal(isPermanentCloudSessionError({ code: 'CLOUD_REQUEST_TIMEOUT', status: 0 }), false);
assert.equal(isPermanentCloudSessionError({ code: 'HTTP_500', status: 500 }), false);
assert.equal(isPermanentCloudSessionError({ code: 'HTTP_401', status: 401 }), true);
const result = createCloudSessionExpiryResult(
  { code: 'PROFILE_TOKEN_REJECTED', status: 401 },
  { accountHint: 'cloud-0123456789abcdef0123456789abcdef' }
);
assert.equal(result.accepted, false);
assert.equal(result.expired, true);
assert.equal(result.retryable, false);
assert.equal(result.reason, 'PROFILE_TOKEN_REJECTED');
assert.equal(result.message, CLOUD_SESSION_EXPIRED_MESSAGE);
assert.equal(result.accountHint, 'cloud-0123456789abcdef0123456789abcdef');

console.log('Cloud session recovery core tests: PASS');
