import assert from 'node:assert/strict';
import {
  applyPvp2MatchResult,
  createPvp2Stats,
  normalizePvp2CustomRoomMaxPlayers,
  pvp2FeatureEnabled,
  pvp2PublicCustomRoomsEnabled,
  rankPvp2Leaderboard
} from './pvp2_core.js';

assert.equal(pvp2FeatureEnabled('false'), false);
assert.equal(pvp2FeatureEnabled('true'), true);
assert.equal(createPvp2Stats({ playerId: 'a' }).rating, 1000);

const result = {
  matchId: 'match-1',
  mode: 'pvp-team-elimination',
  publicMatch: true,
  region: 'PK',
  winnerTeam: 'ALPHA',
  rounds: { ALPHA: 3, BRAVO: 1 },
  players: [
    { playerId: 'a', displayName: 'A', team: 'ALPHA', eliminations: 4, deaths: 1, damageDealt: 350, headshots: 2 },
    { playerId: 'b', displayName: 'B', team: 'BRAVO', eliminations: 1, deaths: 4, damageDealt: 120, headshots: 0 }
  ]
};

const first = applyPvp2MatchResult({ result });
assert.equal(first.applied, true);
assert.equal(first.statsByPlayer.a.wins, 1);
assert.equal(first.statsByPlayer.b.losses, 1);
assert.ok(first.statsByPlayer.a.rating > 1000);
assert.ok(first.statsByPlayer.b.rating < 1000);

const duplicate = applyPvp2MatchResult({
  statsByPlayer: first.statsByPlayer,
  resultLedger: first.resultLedger,
  result
});
assert.equal(duplicate.applied, false);
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.statsByPlayer.a.matchesPlayed, 1);

const board = rankPvp2Leaderboard(first.statsByPlayer, { scope: 'regional', region: 'PK' });
assert.equal(board.length, 2);
assert.equal(board[0].playerId, 'a');

console.log('PVP.2 competitive statistics authority tests passed');

assert.equal(normalizePvp2CustomRoomMaxPlayers(2), 2);
assert.equal(normalizePvp2CustomRoomMaxPlayers(3), 2);
assert.equal(normalizePvp2CustomRoomMaxPlayers(4), 4);
assert.equal(pvp2PublicCustomRoomsEnabled('true'), true);
assert.equal(pvp2PublicCustomRoomsEnabled('false'), false);
