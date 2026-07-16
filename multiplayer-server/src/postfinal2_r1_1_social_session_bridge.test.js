import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const socialHub = readFileSync(new URL('./social_hub.js', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.ok(index.includes('async function authenticateSocialProxyRequest(request, env)'));
assert.ok(index.includes('const auth = await authenticateSocialProxyRequest(request, env);'));
assert.ok(index.includes('if (!auth.ok) return corsify(auth.response);'));
assert.ok(index.includes('headers.delete(INTERNAL_SOCIAL_AUTH_HEADER)'));
assert.ok(index.includes('headers.delete(INTERNAL_SOCIAL_ACCOUNT_HEADER)'));
assert.ok(index.includes('headers.delete(INTERNAL_SOCIAL_NAME_HEADER)'));
assert.ok(index.includes("headers.set(INTERNAL_SOCIAL_AUTH_HEADER, '1')"));
assert.ok(index.includes('headers.set(INTERNAL_SOCIAL_ACCOUNT_HEADER, auth.accountId)'));
assert.ok(index.includes('headers.set(INTERNAL_SOCIAL_NAME_HEADER, encodeURIComponent(auth.displayName))'));
assert.ok(index.includes('socialSessionHotfix: POST_FINAL2_R1_2_SERVER_INFO'));

assert.ok(socialHub.includes('function trustedProxyAuthentication(request)'));
assert.ok(socialHub.includes("request.headers.get(INTERNAL_SOCIAL_AUTH_HEADER) !== '1'"));
assert.ok(socialHub.includes('const trusted = trustedProxyAuthentication(request);'));
assert.ok(socialHub.includes('if (trusted) {'));
assert.ok(socialHub.includes("throw new Error('SOCIAL_AUTH_CONTEXT_INVALID')"));
assert.ok(socialHub.includes("new Request('https://profiles.internal/profiles/auth/session'"), 'Compatibility fallback must remain available');

assert.ok(wrangler.includes('"name": "CLOUD_PROFILES"'));
assert.ok(wrangler.includes('"name": "SOCIAL"'));
assert.ok(packageJson.scripts.check.includes('postfinal2_r1_1_social_session_bridge.test.js'));

console.log('POST-FINAL.2 R1.1 Social passkey session bridge baseline contract: PASS');
