import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/social.css', import.meta.url), 'utf8');
const social = readFileSync(new URL('./social.js', import.meta.url), 'utf8');
const coop = readFileSync(new URL('./multiplayer/coop_scoreboard.js', import.meta.url), 'utf8');
const pvp = readFileSync(new URL('./multiplayer/pvp1.js', import.meta.url), 'utf8');
const release = JSON.parse(readFileSync(new URL('../multiplayer-release.json', import.meta.url), 'utf8'));
const descriptor = JSON.parse(readFileSync(new URL('../release-version.json', import.meta.url), 'utf8'));

for (const marker of [
  'SOCIAL HUB', 'social-profile-name', 'social-arena-qr', 'social-search-result',
  'social-outgoing-list', 'social-notifications-list', 'SEARCH ARENA ID'
]) {
  assert.equal(index.includes(marker), true, `Missing SOCIAL.2 UI marker: ${marker}`);
}
for (const marker of [
  '/social/players/find', 'buildArenaShareUrl', 'renderQrCanvas',
  'ka:social-add-player', 'requestFriendByRoomPlayerId', 'handleArenaDeepLink'
]) {
  assert.equal(social.includes(marker), true, `Missing SOCIAL.2 runtime marker: ${marker}`);
}
assert.equal(coop.includes('ka-scoreboard-social-add'), true);
assert.equal(pvp.includes('ka-pvp-social-add'), true);
assert.equal(css.includes('ka-social-profile-panel'), true);
assert.equal(release.social.patch, 'social2-r1-arena-id-friend-discovery');
assert.equal(release.social2.exactArenaIdSearch, true);
assert.ok(['social2-r1-arena-id-friend-discovery', 'net1-r1-webrtc-hybrid-transport', 'gameplay2-r1-late-round-arena-mutations', 'gameplay3-r1-interactive-evolving-maps'].includes(descriptor.releaseId));
assert.ok(['1.1.0-social2-r1', '1.2.0-net1-r1', '1.3.0-gameplay2-r1', '1.4.0-gameplay3-r1'].includes(descriptor.productVersion));
console.log('SOCIAL.2 frontend discovery, party and match-action contract: PASS');
