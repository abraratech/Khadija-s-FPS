import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); }
  get length() { return this.map.size; }
  key(index) { return Array.from(this.map.keys())[index] ?? null; }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

globalThis.sessionStorage = new MemoryStorage();
globalThis.localStorage = new MemoryStorage({
  ka_progression_v1: JSON.stringify({ version: 1, xp: 75, bestScore: 300 }),
  ka_challenges_v1: JSON.stringify({ version: 1, unlocked: {}, totalUnlocked: 0 }),
  fps_hi_score: '300',
  fps_hi_wave: '3'
});

const core = await import('./cloud_profile_core.js');

const accountId = 'cloud-0123456789abcdef0123456789abcdef';
let token = 'kat_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
let cloudRevision = 1;
let storedProfile = null;
let deleted = false;
let timeoutAfterCommit = false;
const operationResponses = new Map();
const syncOperationIds = [];
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
  return { accountId, cloudRevision, devices: devices.length, recoveryEnabled: true, historyEntries: history.length, profileChecksum: storedProfile ? core.profileChecksum(storedProfile) : '' };
}
function profileResponse(extra = {}) {
  return {
    ...extra,
    profile: storedProfile,
    profileChecksum: storedProfile ? core.profileChecksum(storedProfile) : '',
    checksumVerified: true,
    reliability: { serverTime: Date.now(), uploadComplete: true, checksumVerified: true }
  };
}

globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  const body = options.body ? JSON.parse(options.body) : {};
  if (path === '/profiles/register') {
    storedProfile = body.profile;
    devices[0].deviceId = body.deviceId;
    devices[0].name = body.deviceName;
    return json(profileResponse({ ok: true, account: account(), token, devices }), 201);
  }
  if (path === '/profiles/sync') {
    syncOperationIds.push(body.operationId);
    if (operationResponses.has(body.operationId)) {
      return json({ ...operationResponses.get(body.operationId), idempotent: true });
    }
    storedProfile = body.profile;
    cloudRevision += 1;
    history = [{ revision: cloudRevision - 1, chunks: 1, bytes: 1000, checksum: core.profileChecksum(storedProfile), createdAt: Date.now(), reason: 'before-sync', integrity: 'verified' }];
    const response = profileResponse({ ok: true, conflict: false, changed: true, account: account() });
    operationResponses.set(body.operationId, response);
    if (timeoutAfterCommit) {
      timeoutAfterCommit = false;
      throw new TypeError('simulated response loss after commit');
    }
    return json(response);
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
  if (path === '/profiles/recovery/consume') return json(profileResponse({ ok: true, token, account: account(), devices }));
  if (path === '/profiles/auth/passkeys') return json({ ok: true, account: { ...account(), accountType: 'guest', accountLabel: 'Khadija’s Arena Player', passkeys: 0, authVersion: 0 }, passkeys: [] });
  if (path === '/profiles/history' && options.method !== 'POST') return json({ ok: true, account: account(), history });
  if (path === '/profiles/history/restore') return json(profileResponse({ ok: true, restoredRevision: body.revision, account: account(), history }));
  if (path === '/profiles/activity') return json({ ok: true, account: account(), activity });
  if (path === '/profiles/account' && options.method === 'DELETE') {
    deleted = true;
    return json({ ok: true, deleted: true, tombstone: { accountId, deletedAt: Date.now(), deletionId: 'delete-test-0001', deviceId: devices[0].deviceId } });
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
assert.equal(synced.checksumVerified, true);
assert.equal(runtime.getCloudProfileDiagnostics().remote.reliability.queuedChanges, 0);
assert.equal(storedProfile.records.highScore, 900);

// Simulate a Worker commit followed by a lost response. The retry must preserve
// the operation ID, avoid a second revision increment, and clear the persisted queue.
localStorage.setItem('fps_hi_score', '1200');
timeoutAfterCommit = true;
const revisionBeforeLostResponse = cloudRevision;
const lostResponse = await runtime.syncCloudProfileRemote('lost-response', { force: true });
assert.equal(lostResponse.accepted, false);
assert.equal(lostResponse.queued, true);
const queuedAfterLoss = runtime.getCloudProfileDiagnostics().remote.queue;
assert.equal(queuedAfterLoss.length, 1);
const lostOperationId = queuedAfterLoss[0].operationId;
assert.equal(cloudRevision, revisionBeforeLostResponse + 1);
const recoveredRetry = await runtime.retryCloudSyncQueue();
assert.equal(recoveredRetry.accepted, true);
assert.equal(recoveredRetry.idempotent, true);
assert.equal(syncOperationIds.at(-1), lostOperationId);
assert.equal(cloudRevision, revisionBeforeLostResponse + 1);
assert.equal(runtime.getCloudProfileDiagnostics().remote.queue.length, 0);
assert.equal(storedProfile.records.highScore, 1200);

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
assert.equal(JSON.parse(localStorage.getItem('ka_cloud_profile_tombstone_v1')).accountId, accountId);
console.log('Cloud profile remote security runtime tests: PASS');
