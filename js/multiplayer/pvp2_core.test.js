import assert from 'node:assert/strict';
import {
  PVP2_MODE,
  createPvp2CustomRoomPolicy,
  createPvp2PublicQueuePreferences,
  normalizePvp2Leaderboard,
  normalizePvp2QueueMode,
  normalizePvp2Stats,
  pvp2RankPresentation,
  pvp2StatsPresentation
} from './pvp2_core.js';

assert.equal(normalizePvp2QueueMode(PVP2_MODE), PVP2_MODE);
assert.equal(normalizePvp2QueueMode('anything-else'), 'coop');

const queue = createPvp2PublicQueuePreferences({
  mapId: 'neon_depot',
  searchPriority: 'fast',
  regionPolicy: 'auto'
});
assert.equal(queue.mode, PVP2_MODE);
assert.equal(queue.maxPlayers, 2);
assert.equal(queue.partySize, 1);
assert.equal(queue.allowBackfill, false);
assert.equal(queue.joinInProgress, false);

const stats = normalizePvp2Stats({
  playerId: 'p1', wins: 3, losses: 1, eliminations: 10, deaths: 5, rating: 1080
});
assert.equal(stats.matchesPlayed, 0);
assert.equal(stats.rating, 1080);
assert.equal(stats.eliminationDeathRatio, 2);
const presentation = pvp2StatsPresentation(stats);
assert.match(presentation.headline, /BRONZE.*1080/);
assert.equal(presentation.rank.id, 'BRONZE');
assert.equal(presentation.rank.nextLabel, 'Silver');
assert.equal(presentation.rank.ratingToNext, 20);
assert.equal(presentation.milestones[0].unlocked, true);
assert.equal(pvp2RankPresentation(1750).id, 'DIAMOND');

const board = normalizePvp2Leaderboard({
  ok: true,
  entries: [{ playerId: 'p1', rating: 1100 }]
});
assert.equal(board.entries[0].rank, 1);
assert.equal(board.entries[0].rating, 1100);

console.log('PVP.2 frontend policy core tests passed');

const custom1v1 = createPvp2CustomRoomPolicy({ teamSize: 1 });
assert.equal(custom1v1.maxPlayers, 2);
assert.equal(custom1v1.ranked, false);
assert.equal(custom1v1.allowLateJoin, false);
const custom2v2 = createPvp2CustomRoomPolicy({ teamSize: 2 });
assert.equal(custom2v2.maxPlayers, 4);
