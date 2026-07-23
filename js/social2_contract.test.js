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
assert.ok(['social2-r1-arena-id-friend-discovery', 'net1-r1-webrtc-hybrid-transport', 'gameplay2-r1-late-round-arena-mutations', 'gameplay3-r1-interactive-evolving-maps', 'gameplay4-r1-expanded-boss-encounters', 'gameplay5-r1-narrative-operations', 'gameplay6-r1-world-progression', 'gameplay7-r1-dynamic-campaign-faction-control', 'loadout2-r1-weapon-mastery-operator-specialization-melee', 'quality2-r1-consolidated-low-gpu-rendering', 'endgame1-r1-high-difficulty-operations', 'content2-r1-new-arena-enemy-expansion', 'quality2-r2-consolidated-polish-certification', 'quality3-r1-map-evolution-geometry-zero-failure'].includes(descriptor.releaseId));
assert.ok(['1.1.0-social2-r1', '1.2.0-net1-r1', '1.3.0-gameplay2-r1', '1.4.0-gameplay3-r1', '1.5.0-gameplay4-r1', '1.6.0-gameplay5-r1', '1.7.0-gameplay6-r1', '1.8.0-gameplay7-r1', '1.9.0-loadout2-r1', '1.10.0-quality2-r1', '1.11.0-endgame1-r1', '1.12.0-content2-r1', '1.13.0-quality2-r2', '1.13.1-quality3-r1'].includes(descriptor.productVersion));
console.log('SOCIAL.2 frontend discovery, party and match-action contract: PASS');
