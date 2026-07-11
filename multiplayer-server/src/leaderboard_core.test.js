import assert from 'node:assert/strict';
import {
  normalizeLeaderboardMap,
  normalizeLeaderboardDifficulty,
  normalizeLeaderboardEntry,
  rankLeaderboardEntries,
  validateChallengeRequest,
  validateLeaderboardSubmission,
  publicLeaderboardEntry
} from './leaderboard_core.js';

assert.equal(normalizeLeaderboardMap('Grid Bunker'), 'grid_bunker');
assert.equal(normalizeLeaderboardMap('reactor'), 'reactor_courtyard');
assert.equal(normalizeLeaderboardDifficulty(0.8), 'easy');
assert.equal(normalizeLeaderboardDifficulty(1.25), 'hard');
const challengeRequest = validateChallengeRequest({
  playerId: 'player-12345678', runId: 'run-12345678', mapId: 'grid_bunker', difficulty: 'normal'
});
assert.equal(challengeRequest.valid, true);
const challenge = {
  token: 'token', playerId: 'player-12345678', runId: 'run-12345678',
  mapId: 'grid_bunker', difficulty: 'normal', region: 'US', expiresAt: 2_000_000, used: false
};
const good = validateLeaderboardSubmission(challenge, {
  playerId: 'player-12345678', runId: 'run-12345678', displayName: 'Abrar',
  mapId: 'grid_bunker', difficulty: 'normal', score: 1000, wave: 4, kills: 12,
  survivalSeconds: 180, accuracy: 44.4, headshots: 3
}, 1_000_000);
assert.equal(good.valid, true);
assert.equal(good.entry.region, 'US');
assert.equal(validateLeaderboardSubmission(challenge, {
  ...good.entry, playerId: 'player-12345678', runId: 'run-12345678', headshots: 20, kills: 4
}, 1_000_000).valid, false);
assert.equal(validateLeaderboardSubmission(challenge, {
  ...good.entry, playerId: 'player-12345678', runId: 'run-12345678', score: 999_999_999
}, 1_000_000).errors.includes('STAT_LIMIT_EXCEEDED'), true);
const ranked = rankLeaderboardEntries([
  { ...good.entry, id: 'a', score: 100 },
  { ...good.entry, id: 'b', score: 200 },
  { ...good.entry, id: 'c', score: 150 }
]);
assert.deepEqual(ranked.map((entry) => entry.id), ['b', 'c', 'a']);
assert.equal(publicLeaderboardEntry(ranked[0], 1).rank, 1);
assert.equal(normalizeLeaderboardEntry({ score: -4, wave: 0 }).score, 0);
console.log('Online leaderboard Worker core tests passed');
