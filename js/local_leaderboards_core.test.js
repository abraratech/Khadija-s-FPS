import assert from 'node:assert/strict';
import {
  LOCAL_LEADERBOARD_LIMIT,
  LOCAL_LEADERBOARD_STORAGE_KEY,
  addLocalLeaderboardEntry,
  clearLocalLeaderboards,
  compareLocalLeaderboardEntries,
  getLocalLeaderboardEntries,
  loadLocalLeaderboardStore,
  normalizeLocalLeaderboardDifficulty,
  normalizeLocalLeaderboardEntry,
  normalizeLocalLeaderboardMap,
  normalizeLocalLeaderboardStore,
  saveLocalLeaderboardStore
} from './local_leaderboards_core.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    read(key) { return values.get(key); }
  };
}

assert.equal(normalizeLocalLeaderboardMap('The Grid Bunker'), 'grid_bunker');
assert.equal(normalizeLocalLeaderboardMap('reactor courtyard'), 'reactor_courtyard');
assert.equal(normalizeLocalLeaderboardDifficulty(0.75), 'easy');
assert.equal(normalizeLocalLeaderboardDifficulty(1), 'normal');
assert.equal(normalizeLocalLeaderboardDifficulty(1.3), 'hard');

const base = normalizeLocalLeaderboardEntry({
  id: 'run-a', mapId: 'neon depot', difficulty: 'hard', score: 1200,
  wave: 6, kills: 31, survivalSeconds: 222.34, accuracy: 47.28, headshots: 9,
  createdAt: '2026-07-10T20:00:00.000Z'
});
assert.equal(base.mapId, 'neon_depot');
assert.equal(base.survivalSeconds, 222.3);
assert.equal(base.accuracy, 47.3);

let store = normalizeLocalLeaderboardStore();
let result = addLocalLeaderboardEntry(store, base);
store = result.store;
assert.equal(result.rank, 1);
result = addLocalLeaderboardEntry(store, { ...base, id: 'run-b', score: 1800 });
store = result.store;
assert.equal(result.rank, 1);
assert.deepEqual(getLocalLeaderboardEntries(store, { mapId: 'neon_depot', difficulty: 'hard' }).map((entry) => entry.id), ['run-b', 'run-a']);

for (let index = 0; index < LOCAL_LEADERBOARD_LIMIT + 5; index++) {
  store = addLocalLeaderboardEntry(store, {
    id: `grid-${index}`, mapId: 'grid_bunker', difficulty: 'normal', score: index * 100,
    wave: index + 1, createdAt: new Date(1700000000000 + index * 1000).toISOString()
  }).store;
}
assert.equal(getLocalLeaderboardEntries(store).length, LOCAL_LEADERBOARD_LIMIT);
assert.equal(getLocalLeaderboardEntries(store)[0].score, 1400);

const tied = [
  normalizeLocalLeaderboardEntry({ id: 'older', score: 100, wave: 2, createdAt: '2026-01-01T00:00:00Z' }),
  normalizeLocalLeaderboardEntry({ id: 'newer', score: 100, wave: 2, createdAt: '2026-01-02T00:00:00Z' })
].sort(compareLocalLeaderboardEntries);
assert.equal(tied[0].id, 'older');

const storage = memoryStorage();
saveLocalLeaderboardStore(store, storage);
assert.ok(storage.read(LOCAL_LEADERBOARD_STORAGE_KEY));
assert.equal(loadLocalLeaderboardStore(storage).entries.length, store.entries.length);
assert.equal(clearLocalLeaderboards(storage).entries.length, 0);
assert.equal(storage.read(LOCAL_LEADERBOARD_STORAGE_KEY), undefined);
console.log('Local leaderboard core tests passed');
