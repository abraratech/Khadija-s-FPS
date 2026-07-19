import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const social = readFileSync(new URL('./social.js', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('./social_bridge.js', import.meta.url), 'utf8');
const transport = readFileSync(new URL('./multiplayer/transport.js', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('./multiplayer/foundation.js', import.meta.url), 'utf8');
const room = readFileSync(new URL('./multiplayer/room.js', import.meta.url), 'utf8');
const chat = readFileSync(new URL('./multiplayer/text_chat.js', import.meta.url), 'utf8');
const release = JSON.parse(readFileSync(new URL('../multiplayer-release.json', import.meta.url), 'utf8'));

for (const token of [
  'data-menu-screen="social"',
  'social-friend-code',
  'social-party-state',
  'social-recent-list',
  'social-blocked-list',
  'social-report-target',
  'social-privacy-presence'
]) {
  assert.equal(index.includes(token), true, `Missing SOCIAL.1 UI token: ${token}`);
}
assert.equal(main.includes("initSocialSystems"), true);
assert.equal(social.includes('/social/identity/ticket'), true);
assert.equal(social.includes('/social/friends/request'), true);
assert.equal(social.includes('/social/party/create'), true);
assert.equal(social.includes('/social/party/matchmaking-ticket'), true);
assert.equal(social.includes('/social/blocks/add'), true);
assert.equal(social.includes('/social/reports/create'), true);
assert.equal(bridge.includes('setSocialRuntimeProvider'), true);
assert.equal(bridge.includes('getSocialPartyMatchmakingTicket'), true);
assert.equal(transport.includes("url.searchParams.set('socialTicket'"), true);
assert.equal(foundation.includes('joinMultiplayerSocialRoom'), true);
assert.equal(room.includes('socialId:'), true);
assert.equal(chat.includes('isSocialPlayerBlocked'), true);
assert.equal(release.social?.patch, 'social2-r1-arena-id-friend-discovery');
assert.equal(release.social?.voiceChat, false);
assert.equal(release.social?.textChat, true);

console.log('SOCIAL.1 compatibility contract tests: PASS');
