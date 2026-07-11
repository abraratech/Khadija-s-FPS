// js/cloud_profile_session_runtime.test.js
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return Array.from(this.map.keys())[index] ?? null; }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

globalThis.localStorage = new MemoryStorage({
  ka_progression_v1: JSON.stringify({ version: 1, xp: 725, bestScore: 1000629 }),
  ka_challenges_v1: JSON.stringify({ version: 1, unlocked: { FIRST_RUN: 100 }, totalUnlocked: 1 }),
  fps_hi_score: '1000629',
  fps_hi_wave: '19',
  ka_accessibility_v1: JSON.stringify({ hudScale: 125 }),
  ka_local_leaderboards_v1: JSON.stringify({ Industrial_Yard: { Easy: [{ score: 1000629 }] } }),
  ka_local_leaderboard_last_submission_v1: JSON.stringify({ accepted: true, rank: 1, category: { mapId: 'industrial_yard', difficulty: 'easy' }, message: 'LOCAL SCORE SAVED · Industrial Yard · Easy · #1' }),
  ka_online_leaderboard_last_submission_v1: JSON.stringify({ accepted: true, queued: false, globalRank: 1, regionRank: 1, category: { mapId: 'industrial_yard', difficulty: 'easy', scope: 'global' }, message: 'ONLINE SCORE ACCEPTED · GLOBAL #1 · REGION #1' })
});
globalThis.sessionStorage = new MemoryStorage();

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return {
    ok: false,
    status: 401,
    async json() {
      return { ok: false, error: 'PROFILE_TOKEN_REJECTED' };
    }
  };
};

const runtime = await import('./cloud_profile.js?expired-session-runtime');
const before = runtime.syncCloudProfile('expired-session-before');
const beforeSerialized = localStorage.getItem('ka_cloud_profile_v1');
const accountId = 'cloud-0123456789abcdef0123456789abcdef';
localStorage.setItem('ka_cloud_profile_account_v1', accountId);
localStorage.setItem('ka_cloud_profile_token_v1', 'token-abcdefghijklmnopqrstuvwxyz-0123456789');
localStorage.setItem('ka_cloud_profile_remote_revision_v1', '7');
localStorage.setItem('ka_cloud_profile_sync_pending_v1', '1');

const result = await runtime.syncCloudProfileRemote('force-expired-session', { force: true });
assert.equal(result.accepted, false);
assert.equal(result.expired, true);
assert.equal(result.retryable, false);
assert.equal(result.reason, 'PROFILE_TOKEN_REJECTED');
assert.equal(fetchCalls, 1);

assert.equal(localStorage.getItem('ka_cloud_profile_account_v1'), null);
assert.equal(localStorage.getItem('ka_cloud_profile_token_v1'), null);
assert.equal(localStorage.getItem('ka_cloud_profile_remote_revision_v1'), null);
assert.equal(localStorage.getItem('ka_cloud_profile_sync_pending_v1'), null);
assert.equal(localStorage.getItem('ka_cloud_profile_sync_queue_v1'), null);
assert.equal(localStorage.getItem('ka_cloud_profile_account_hint_v1'), accountId);

assert.equal(localStorage.getItem('ka_cloud_profile_v1'), beforeSerialized);
assert.equal(localStorage.getItem('fps_hi_score'), '1000629');
assert.equal(localStorage.getItem('fps_hi_wave'), '19');
assert.equal(JSON.parse(localStorage.getItem('ka_progression_v1')).xp, 725);
assert.equal(JSON.parse(localStorage.getItem('ka_accessibility_v1')).hudScale, 125);
assert.match(localStorage.getItem('ka_local_leaderboard_last_submission_v1'), /LOCAL SCORE SAVED/);
assert.match(localStorage.getItem('ka_online_leaderboard_last_submission_v1'), /ONLINE SCORE ACCEPTED/);
assert.equal(runtime.getCloudProfileSnapshot().profileId, before.profileId);
assert.equal(runtime.getCloudProfileSnapshot().records.highScore, 1000629);

const second = await runtime.syncCloudProfileRemote('must-not-retry', { force: true });
assert.equal(second.accepted, false);
assert.equal(second.reason, 'CLOUD_NOT_CONNECTED');
assert.equal(fetchCalls, 1);

const deleteAfterExpiry = await runtime.deleteCloudGuestAccount();
assert.equal(deleteAfterExpiry.accepted, false);
assert.equal(deleteAfterExpiry.reason, 'CLOUD_NOT_CONNECTED');
assert.equal(fetchCalls, 1);

// Settings security refresh must fail fast instead of launching four parallel 401 requests.
globalThis.localStorage = new MemoryStorage({
  fps_hi_score: '1000629',
  fps_hi_wave: '19',
  ka_progression_v1: JSON.stringify({ version: 1, xp: 725, bestScore: 1000629 })
});
globalThis.sessionStorage = new MemoryStorage();
fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return {
    ok: false,
    status: 401,
    async json() { return { ok: false, error: 'PROFILE_AUTH_REQUIRED' }; }
  };
};
const securityRuntime = await import('./cloud_profile.js?expired-security-runtime');
securityRuntime.syncCloudProfile('security-expiry-before');
localStorage.setItem('ka_cloud_profile_account_v1', accountId);
localStorage.setItem('ka_cloud_profile_token_v1', 'token-abcdefghijklmnopqrstuvwxyz-0123456789');
const securityResult = await securityRuntime.refreshCloudAccountSecurity({ silent: true });
assert.equal(securityResult.expired, true);
assert.equal(securityResult.reason, 'PROFILE_AUTH_REQUIRED');
assert.equal(fetchCalls, 1);
assert.equal(localStorage.getItem('ka_cloud_profile_account_v1'), null);
assert.equal(localStorage.getItem('ka_cloud_profile_token_v1'), null);
assert.equal(localStorage.getItem('fps_hi_score'), '1000629');
assert.equal(localStorage.getItem('ka_cloud_profile_account_hint_v1'), accountId);

// Delete Account must convert the same 401 into session expiry without deleting local data.
globalThis.localStorage = new MemoryStorage({
  fps_hi_score: '1000629',
  fps_hi_wave: '19',
  ka_progression_v1: JSON.stringify({ version: 1, xp: 725, bestScore: 1000629 })
});
globalThis.sessionStorage = new MemoryStorage();
fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return {
    ok: false,
    status: 401,
    async json() { return { ok: false, error: 'PROFILE_TOKEN_REJECTED' }; }
  };
};
const deleteRuntime = await import('./cloud_profile.js?expired-delete-runtime');
deleteRuntime.syncCloudProfile('delete-expiry-before');
localStorage.setItem('ka_cloud_profile_account_v1', accountId);
localStorage.setItem('ka_cloud_profile_token_v1', 'token-abcdefghijklmnopqrstuvwxyz-0123456789');
const deleteResult = await deleteRuntime.deleteCloudGuestAccount();
assert.equal(deleteResult.expired, true);
assert.equal(deleteResult.reason, 'PROFILE_TOKEN_REJECTED');
assert.equal(fetchCalls, 1);
assert.equal(localStorage.getItem('ka_cloud_profile_account_v1'), null);
assert.equal(localStorage.getItem('ka_cloud_profile_token_v1'), null);
assert.equal(localStorage.getItem('fps_hi_score'), '1000629');
assert.equal(localStorage.getItem('ka_cloud_profile_account_hint_v1'), accountId);

console.log('Cloud session expiry runtime tests: PASS');
