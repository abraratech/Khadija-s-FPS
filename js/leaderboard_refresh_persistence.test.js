import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

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

const localFirst = await import('./local_leaderboards.js?refresh-persistence-local-first');
localFirst.beginLocalLeaderboardRun();
const localResult = localFirst.submitLocalLeaderboardRun({
  mapId: 'reactor_courtyard',
  difficulty: 'hard',
  score: 88888,
  wave: 12,
  kills: 144,
  mode: 'single'
});
assert.equal(localResult.accepted, true);
assert.match(localStorage.getItem('ka_local_leaderboard_last_submission_v1') || '', /reactor_courtyard/);

const localReloaded = await import('./local_leaderboards.js?refresh-persistence-local-reloaded');
const restoredLocal = localReloaded.getLocalLeaderboardSnapshot().lastSubmission;
assert.equal(restoredLocal?.accepted, true);
assert.equal(restoredLocal?.restored, true);
assert.equal(restoredLocal?.category?.mapId, 'reactor_courtyard');
assert.equal(restoredLocal?.category?.difficulty, 'hard');
assert.match(restoredLocal?.message || '', /^LOCAL SCORE SAVED · Reactor Courtyard · Hard/);

const requests = [];
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  requests.push(parsed.pathname);
  if (parsed.pathname === '/leaderboards/challenge') {
    return new Response(JSON.stringify({
      ok: true,
      challengeToken: 'challenge-refresh-12345678',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      region: 'US'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (parsed.pathname === '/leaderboards/submit') {
    return new Response(JSON.stringify({ ok: true, globalRank: 7, regionRank: 3 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  throw new Error(`Unexpected route ${parsed.pathname}`);
};

const onlineFirst = await import('./online_leaderboards.js?refresh-persistence-online-first');
await onlineFirst.beginOnlineLeaderboardRun({ mapId: 'reactor_courtyard', difficulty: 'hard', mode: 'single' });
const accepted = await onlineFirst.submitOnlineLeaderboardRun({
  mapId: 'reactor_courtyard', difficulty: 'hard', score: 88888, wave: 12, kills: 144, mode: 'single'
});
assert.equal(accepted.accepted, true);
assert.match(localStorage.getItem('ka_online_leaderboard_last_submission_v1') || '', /ONLINE SCORE ACCEPTED/);

const onlineReloaded = await import('./online_leaderboards.js?refresh-persistence-online-reloaded');
const restoredOnline = onlineReloaded.getOnlineLeaderboardSnapshot().lastSubmission;
assert.equal(restoredOnline?.accepted, true);
assert.equal(restoredOnline?.restored, true);
assert.equal(restoredOnline?.globalRank, 7);
assert.equal(restoredOnline?.regionRank, 3);
assert.equal(restoredOnline?.message, 'ONLINE SCORE ACCEPTED · GLOBAL #7 · REGION #3');

// Queue path must also survive a reload.
globalThis.fetch = async () => { throw new Error('NETWORK_OFFLINE'); };
const onlineQueue = await import('./online_leaderboards.js?refresh-persistence-online-queue');
await onlineQueue.beginOnlineLeaderboardRun({ mapId: 'hospital_wing', difficulty: 'normal', mode: 'single' });
const queued = await onlineQueue.submitOnlineLeaderboardRun({
  mapId: 'hospital_wing', difficulty: 'normal', score: 500, wave: 2, kills: 8, mode: 'single'
});
assert.equal(queued.accepted, false);
assert.equal(queued.queued, true);
assert.match(localStorage.getItem('ka_online_leaderboard_last_submission_v1') || '', /ONLINE SCORE QUEUED/);
const onlineQueueReloaded = await import('./online_leaderboards.js?refresh-persistence-online-queue-reloaded');
const restoredQueue = onlineQueueReloaded.getOnlineLeaderboardSnapshot().lastSubmission;
assert.equal(restoredQueue?.queued, true);
assert.equal(restoredQueue?.restored, true);
assert.match(restoredQueue?.message || '', /^ONLINE SCORE QUEUED/);

for (const file of ['local_leaderboards.js', 'online_leaderboards.js', 'career_achievements.js']) {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  assert.match(source, /class: 'ka-link-btn ka-player-data-open'/, `${file} menu button must use the game UI class`);
  assert.match(source, /style: 'width:100%;text-align:center;'/, `${file} menu button must fill the menu column`);
}

assert.equal(requests.filter((path) => path === '/leaderboards/challenge').length, 1);
assert.equal(requests.filter((path) => path === '/leaderboards/submit').length, 1);
console.log('Leaderboard refresh persistence and menu styling tests: PASS');
