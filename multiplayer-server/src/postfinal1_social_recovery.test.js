import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hub = readFileSync(new URL('./social_hub.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const method of [
  'bootstrap', 'createIdentityTicket', 'updatePresence', 'updatePrivacy',
  'friendRequest', 'friendRespond', 'friendRemove', 'blockAdd',
  'blockRemove', 'reportCreate', 'partyCreate', 'partyInvite',
  'partyRespond', 'partyLeave', 'partyKick', 'partyTransfer',
  'createPartyMatchmakingTicket'
]) {
  assert.ok(hub.includes(`return await this.${method}(request);`), `Missing awaited SocialHub route: ${method}`);
}
assert.ok(hub.includes("code.includes('AUTH') || code === 'PASSKEY_SOCIAL_REQUIRED' ? 401"));
assert.ok(index.includes("patch: 'post-final1-r1-mobile-clarity-social-recovery'"));
assert.ok(index.includes('postFinalHotfix: POST_FINAL1_SERVER_INFO'));
assert.ok(packageJson.scripts.check.includes('postfinal1_social_recovery.test.js'));
console.log('POST-FINAL.1 SocialHub recovery contract: PASS');
