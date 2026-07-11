import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

globalThis.localStorage = new MemoryStorage();

const local = await import('./local_leaderboards.js');
local.beginLocalLeaderboardRun();
const localResult = local.submitLocalLeaderboardRun({
  mapId: 'reactor_courtyard',
  difficulty: 1.5,
  score: 12345,
  wave: 9,
  kills: 88,
  summary: {
    finalScore: 12345,
    highestWave: 9,
    kills: 88,
    durationSeconds: 612,
    accuracy: 42.3,
    headshotKills: 17
  },
  mode: 'single'
});
assert.equal(localResult.accepted, true);
assert.equal(localResult.entry.mapId, 'reactor_courtyard');
assert.equal(localResult.entry.difficulty, 'hard');
assert.equal(localResult.entry.survivalSeconds, 612);
assert.equal(localResult.entry.headshots, 17);
assert.equal(local.getLocalLeaderboardSnapshot().entries.length, 1);
assert.equal(JSON.parse(localStorage.getItem('ka_local_leaderboard_last_category_v1')).difficulty, 'hard');

const requests = [];
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  const body = options.body ? JSON.parse(options.body) : {};
  requests.push({ path: parsed.pathname, body });
  if (parsed.pathname === '/leaderboards/challenge') {
    return new Response(JSON.stringify({
      ok: true,
      challengeToken: 'challenge-12345678',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      region: 'US'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (parsed.pathname === '/leaderboards/submit') {
    return new Response(JSON.stringify({
      ok: true,
      globalRank: 4,
      regionRank: 2,
      id: 'entry-1'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected route ${parsed.pathname}`);
};

const online = await import('./online_leaderboards.js');
await online.beginOnlineLeaderboardRun({
  mapId: 'reactor_courtyard',
  difficulty: 1.5,
  mode: 'single'
});
const onlineResult = await online.submitOnlineLeaderboardRun({
  mapId: 'reactor_courtyard',
  difficulty: 1.5,
  score: 12345,
  wave: 9,
  kills: 88,
  summary: {
    finalScore: 12345,
    highestWave: 9,
    kills: 88,
    durationSeconds: 612,
    accuracy: 42.3,
    headshotKills: 17
  },
  mode: 'single'
});
assert.equal(onlineResult.accepted, true);
assert.equal(onlineResult.globalRank, 4);
assert.equal(requests.filter((entry) => entry.path === '/leaderboards/challenge').length, 1);
assert.equal(requests.filter((entry) => entry.path === '/leaderboards/submit').length, 1);
const submitted = requests.find((entry) => entry.path === '/leaderboards/submit').body;
assert.equal(submitted.mapId, 'reactor_courtyard');
assert.equal(submitted.difficulty, 'hard');
assert.equal(submitted.score, 12345);
assert.equal(submitted.survivalSeconds, 612);
assert.equal(submitted.headshots, 17);
assert.equal(online.getOnlineLeaderboardSnapshot().lastSubmission.accepted, true);

console.log('Local and online leaderboard submission runtime tests: PASS');
