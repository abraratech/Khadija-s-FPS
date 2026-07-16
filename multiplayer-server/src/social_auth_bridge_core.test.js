import assert from 'node:assert/strict';
import {
  INTERNAL_SOCIAL_PROFILE_AUTH_HEADER,
  INTERNAL_SOCIAL_PROFILE_AUTH_PATH,
  buildSocialCredentialEnvelope,
  normalizeSocialCredentialEnvelope
} from './social_auth_bridge_core.js';

const headers = new Headers({
  authorization: `Bearer ${'a'.repeat(64)}`,
  'x-ka-account-id': `cloud-${'b'.repeat(32)}`,
  'x-ka-device-id': 'device-browser-12345678',
  'x-ka-client-time': '1784230000000',
  origin: 'http://localhost'
});
const built = buildSocialCredentialEnvelope(headers, { region: 'PK', rpId: 'localhost' });
assert.equal(built.ok, true);
assert.equal(built.value.accountId, `cloud-${'b'.repeat(32)}`);
assert.equal(built.value.token, 'a'.repeat(64));
assert.equal(built.value.deviceId, 'device-browser-12345678');
assert.equal(built.value.region, 'PK');
assert.equal(built.value.rpId, 'localhost');

const normalized = normalizeSocialCredentialEnvelope(built.value);
assert.equal(normalized.ok, true);
assert.deepEqual(normalized.value, built.value);

assert.equal(buildSocialCredentialEnvelope(new Headers()).ok, false);
assert.equal(normalizeSocialCredentialEnvelope({ accountId: 'cloud-bad', token: 'short' }).ok, false);
assert.equal(INTERNAL_SOCIAL_PROFILE_AUTH_HEADER, 'x-ka-internal-social-profile-auth');
assert.equal(INTERNAL_SOCIAL_PROFILE_AUTH_PATH, '/internal/profiles/social-auth-session');

console.log('POST-FINAL.2 R1.2 Social credential envelope core tests: PASS');
