import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('./cloud_profile_hub.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('./social_auth_bridge_core.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.ok(index.includes("patch: 'post-final2-r1-2-social-credential-envelope'"));
assert.ok(index.includes('buildSocialCredentialEnvelope(request.headers'));
assert.ok(index.includes('body: JSON.stringify(envelope.value)'));
assert.ok(index.includes('INTERNAL_SOCIAL_PROFILE_AUTH_PATH'));
assert.ok(index.includes('authorizationHeaderNotForwardedAcrossDurableObjects: true'));
assert.ok(!index.includes("authHeaders.set(\n    'authorization'"));

assert.ok(profiles.includes("url.pathname === INTERNAL_SOCIAL_PROFILE_AUTH_PATH"));
assert.ok(profiles.includes('async internalSocialAuthSession(request, rateKey)'));
assert.ok(profiles.includes("request.headers.get(INTERNAL_SOCIAL_PROFILE_AUTH_HEADER) !== '1'"));
assert.ok(profiles.includes('normalizeSocialCredentialEnvelope(await requestJson(request))'));
assert.ok(profiles.includes('authorization: `Bearer ${payload.value.token}`'));
assert.ok(profiles.includes('const auth = await this.authenticate('));

assert.ok(core.includes("export const INTERNAL_SOCIAL_PROFILE_AUTH_PATH = '/internal/profiles/social-auth-session'"));
assert.ok(packageJson.scripts.check.includes('social_auth_bridge_core.test.js'));
assert.ok(packageJson.scripts.check.includes('postfinal2_r1_2_social_credential_bridge.test.js'));

console.log('POST-FINAL.2 R1.2 deterministic Social credential bridge contract: PASS');
