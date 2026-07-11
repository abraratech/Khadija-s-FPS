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
  ka_progression_v1: JSON.stringify({ version: 1, xp: 75, bestScore: 300 }),
  ka_challenges_v1: JSON.stringify({ version: 1, unlocked: {}, totalUnlocked: 0 }),
  fps_hi_score: '300',
  fps_hi_wave: '3'
});

let cloudRevision = 1;
let storedProfile = null;
let deleted = false;
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  const body = options.body ? JSON.parse(options.body) : {};
  if (path === '/profiles/register') {
    storedProfile = body.profile;
    return new Response(JSON.stringify({
      ok: true,
      account: { accountId: 'cloud-0123456789abcdef0123456789abcdef', cloudRevision },
      token: 'kat_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      profile: storedProfile
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/profiles/sync') {
    storedProfile = body.profile;
    cloudRevision += 1;
    return new Response(JSON.stringify({
      ok: true,
      conflict: false,
      changed: true,
      account: { accountId: 'cloud-0123456789abcdef0123456789abcdef', cloudRevision },
      profile: storedProfile
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/profiles/link/create') {
    return new Response(JSON.stringify({ ok: true, code: 'ABCD2345', expiresAt: new Date(Date.now() + 600000).toISOString() }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/profiles/account' && options.method === 'DELETE') {
    deleted = true;
    return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: false, error: 'UNEXPECTED_TEST_ROUTE' }), { status: 404, headers: { 'content-type': 'application/json' } });
};

const runtime = await import('./cloud_profile.js');
const registered = await runtime.registerCloudGuestAccount();
assert.equal(registered.accepted, true);
assert.equal(localStorage.getItem('ka_cloud_profile_account_v1'), 'cloud-0123456789abcdef0123456789abcdef');
assert.equal(runtime.getCloudProfileDiagnostics().remote.connected, true);

localStorage.setItem('fps_hi_score', '900');
const synced = await runtime.syncCloudProfileRemote('remote-test', { force: true });
assert.equal(synced.accepted, true);
assert.equal(runtime.getCloudProfileDiagnostics().remote.cloudRevision, 2);
assert.equal(storedProfile.records.highScore, 900);

const link = await runtime.createCloudDeviceLink();
assert.equal(link.accepted, true);
assert.equal(link.code, 'ABCD2345');

const removed = await runtime.deleteCloudGuestAccount();
assert.equal(removed.accepted, true);
assert.equal(deleted, true);
assert.equal(localStorage.getItem('ka_cloud_profile_token_v1'), null);
console.log('Cloud profile remote runtime tests: PASS');
