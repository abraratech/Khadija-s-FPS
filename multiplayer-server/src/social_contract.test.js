import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const hub = readFileSync(new URL('./social_hub.js', import.meta.url), 'utf8');
const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const token of [
  "url.pathname.startsWith('/social/')",
  'proxySocialRequest',
  'SOCIAL1_SERVER_INFO',
  'socialTicket',
  'socialAccountId',
  'Blocked-player admission denied'
]) {
  assert.equal(index.includes(token), true, `Missing Worker social token: ${token}`);
}
for (const endpoint of [
  '/social/bootstrap',
  '/social/identity/ticket',
  '/social/friends/request',
  '/social/party/create',
  '/social/party/matchmaking-ticket',
  '/social/blocks/add',
  '/social/reports/create'
]) {
  assert.equal(hub.includes(endpoint), true, `Missing SocialHub endpoint: ${endpoint}`);
}
assert.equal(hub.includes('/internal/social/tickets/consume'), true);
assert.equal(hub.includes('/internal/social/party/matchmaking/consume'), true);
assert.equal(hub.includes('PASSKEY_SOCIAL_REQUIRED'), true);
assert.equal(
  wrangler.durable_objects.bindings.some((entry) => entry.name === 'SOCIAL' && entry.class_name === 'SocialHub'),
  true
);
assert.equal(
  wrangler.migrations.some((entry) => entry.tag === 'v5' && entry.new_sqlite_classes.includes('SocialHub')),
  true
);
assert.equal(packageJson.scripts.check.includes('social_core.test.js'), true);
assert.equal(packageJson.scripts.check.includes('social_contract.test.js'), true);
assert.equal(packageJson.scripts.check.includes('match3_core.test.js'), true);

console.log('SOCIAL.1 Worker integration contract tests: PASS');
