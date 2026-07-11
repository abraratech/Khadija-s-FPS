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

const accountId = 'cloud-0123456789abcdef0123456789abcdef';
let token = 'kat_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
let cloudRevision = 1;
let storedProfile = null;
let deleted = false;
let devices = [{
  deviceId: 'device-test-primary-12345678',
  name: 'Browser Device',
  region: 'US',
  createdAt: 1000,
  lastUsedAt: 2000,
  current: true
}];
let history = [{ revision: 1, chunks: 1, bytes: 1000, checksum: 'abc', createdAt: 1000, reason: 'before-sync' }];
let activity = [{ id: 'a1', kind: 'ACCOUNT_CREATED', at: 1000, deviceId: devices[0].deviceId, region: 'US', detail: 'created' }];

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}
function account() {
  return { accountId, cloudRevision, devices: devices.length, recoveryEnabled: true, historyEntries: history.length };
}

globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  const body = options.body ? JSON.parse(options.body) : {};
  if (path === '/profiles/register') {
    storedProfile = body.profile;
    devices[0].deviceId = body.deviceId;
    devices[0].name = body.deviceName;
    return json({ ok: true, account: account(), token, devices, profile: storedProfile }, 201);
  }
  if (path === '/profiles/sync') {
    storedProfile = body.profile;
    cloudRevision += 1;
    history = [{ revision: cloudRevision - 1, chunks: 1, bytes: 1000, checksum: 'def', createdAt: Date.now(), reason: 'before-sync' }];
    return json({ ok: true, conflict: false, changed: true, account: account(), profile: storedProfile });
  }
  if (path === '/profiles/link/create') return json({ ok: true, code: 'ABCD2345', expiresAt: new Date(Date.now() + 600000).toISOString() });
  if (path === '/profiles/devices' && options.method !== 'POST') return json({ ok: true, account: account(), devices });
  if (path === '/profiles/devices/name') {
    devices = devices.map((entry) => entry.deviceId === body.deviceId ? { ...entry, name: body.name } : entry);
    return json({ ok: true, account: account(), devices });
  }
  if (path === '/profiles/devices/revoke-others') return json({ ok: true, changed: false, account: account(), devices });
  if (path === '/profiles/token/rotate') {
    token = 'kat_rotated_0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    return json({ ok: true, token, account: account(), devices });
  }
  if (path === '/profiles/recovery/generate') return json({ ok: true, account: account(), recoveryCode: 'ABCD-EFGH-JKLM-NPQR', generatedAt: new Date().toISOString() });
  if (path === '/profiles/recovery/consume') return json({ ok: true, token, account: account(), devices, profile: storedProfile });
  if (path === '/profiles/history' && options.method !== 'POST') return json({ ok: true, account: account(), history });
  if (path === '/profiles/history/restore') return json({ ok: true, restoredRevision: body.revision, account: account(), profile: storedProfile, history });
  if (path === '/profiles/activity') return json({ ok: true, account: account(), activity });
  if (path === '/profiles/account' && options.method === 'DELETE') {
    deleted = true;
    return json({ ok: true, deleted: true });
  }
  return json({ ok: false, error: 'UNEXPECTED_TEST_ROUTE' }, 404);
};

const runtime = await import('./cloud_profile.js');
const registered = await runtime.registerCloudGuestAccount();
assert.equal(registered.accepted, true);
assert.equal(localStorage.getItem('ka_cloud_profile_account_v1'), accountId);
assert.equal(runtime.getCloudProfileDiagnostics().remote.connected, true);

localStorage.setItem('fps_hi_score', '900');
const synced = await runtime.syncCloudProfileRemote('remote-test', { force: true });
assert.equal(synced.accepted, true);
assert.equal(runtime.getCloudProfileDiagnostics().remote.cloudRevision, 2);
assert.equal(storedProfile.records.highScore, 900);

const security = await runtime.refreshCloudAccountSecurity();
assert.equal(security.accepted, true);
assert.equal(security.devices.length, 1);
const renamed = await runtime.renameCloudDevice('Main Desktop', devices[0].deviceId);
assert.equal(renamed.accepted, true);
assert.equal(runtime.getCloudProfileDiagnostics().remote.devices[0].name, 'Main Desktop');
const rotated = await runtime.rotateCloudDeviceToken();
assert.equal(rotated.accepted, true);
assert.equal(localStorage.getItem('ka_cloud_profile_token_v1'), token);
const recovery = await runtime.generateCloudRecoveryCode();
assert.equal(recovery.accepted, true);
assert.equal(recovery.recoveryCode, 'ABCD-EFGH-JKLM-NPQR');
const restored = await runtime.restoreCloudProfileRevision(1, { reload: false });
assert.equal(restored.accepted, true);
const recovered = await runtime.recoverCloudGuestAccount(accountId, 'ABCD-EFGH-JKLM-NPQR', { reload: false });
assert.equal(recovered.accepted, true);
const link = await runtime.createCloudDeviceLink();
assert.equal(link.accepted, true);
assert.equal(link.code, 'ABCD2345');

const removed = await runtime.deleteCloudGuestAccount();
assert.equal(removed.accepted, true);
assert.equal(deleted, true);
assert.equal(localStorage.getItem('ka_cloud_profile_token_v1'), null);
console.log('Cloud profile remote security runtime tests: PASS');
