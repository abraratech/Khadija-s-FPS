import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lobby = readFileSync(new URL('./lobby.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./lobby_ui.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('./matchmaking.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('./matchmaking_core.js', import.meta.url), 'utf8');
const match3Core = readFileSync(new URL('./match3_core.js', import.meta.url), 'utf8');
const directory = readFileSync(new URL('./room_directory.js', import.meta.url), 'utf8');
const social = readFileSync(new URL('../social.js', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../social_bridge.js', import.meta.url), 'utf8');
const workerHub = readFileSync(new URL('../../multiplayer-server/src/matchmaking_hub.js', import.meta.url), 'utf8');
const socialHub = readFileSync(new URL('../../multiplayer-server/src/social_hub.js', import.meta.url), 'utf8');
const release = JSON.parse(readFileSync(new URL('../../multiplayer-release.json', import.meta.url), 'utf8'));

for (const token of [
  'ka-match3-search-priority',
  'ka-match3-region-policy',
  'ka-room-filter-status',
  'ka-room-filter-scope',
  'ka-room-filter-bot',
  'ka-room-filter-in-progress'
]) {
  assert.equal(ui.includes(token), true, `Missing MATCH.3 UI token: ${token}`);
}

for (const token of [
  'getSocialMatchmakingPartyContext',
  'getSocialPartyMatchmakingTicket',
  'PARTY_TOO_LARGE_FOR_CURRENT_COOP',
  'partyTicket',
  'allowBackfill',
  'joinInProgress'
]) {
  assert.equal(lobby.includes(token) || bridge.includes(token) || core.includes(token) || match3Core.includes(token), true, `Missing MATCH.3 client token: ${token}`);
}

assert.equal(client.includes('estimatedWaitMs'), true);
assert.equal(directory.includes('requiredSlots'), true);
assert.equal(social.includes('/social/party/matchmaking-ticket'), true);
assert.equal(socialHub.includes('/internal/social/party/matchmaking/consume'), true);
assert.equal(workerHub.includes('tryBackfill'), true);
assert.equal(workerHub.includes('createPartyMatch'), true);
assert.equal(workerHub.includes('PARTY_OPEN_ROOM_RESERVATION_UNSUPPORTED'), true);

assert.equal(release.matchmaking?.schema, 2);
assert.equal(release.matchmaking?.patch, 'match3-r1-party-quality-room-discovery');
assert.equal(release.matchmaking?.partySplitAllowed, false);
assert.equal(release.matchmaking?.gameplayHumanLimit, 2);
assert.equal(release.matchmaking?.smartBackfill, true);
assert.equal(
  release.social?.endpoints?.includes('/social/party/matchmaking-ticket'),
  true
);

console.log('MATCH.3 frontend/Worker integration contract tests: PASS');
