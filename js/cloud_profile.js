import {
  CLOUD_PROFILE_PATCH,
  CLOUD_PROFILE_SCHEMA,
  CLOUD_PROFILE_VERSION,
  createCloudProfileExport,
  createGuestCloudProfile,
  getCloudProfileMergePolicy,
  isGameOwnedStorageKey,
  mergeCloudProfiles,
  parseCloudProfileImport,
  profileChecksum,
  sanitizeLegacyStorage,
  validateCloudProfile
} from './cloud_profile_core.js';
import { ONLINE_LEADERBOARD_WORKER_URL } from './online_leaderboards_core.js';

const PRIMARY_KEY = 'ka_cloud_profile_v1';
const BACKUP_KEY = 'ka_cloud_profile_backup_v1';
const CORRUPT_KEY = 'ka_cloud_profile_corrupt_v1';
const REVISION_KEY = 'ka_cloud_profile_revision_v1';
const FORCE_HYDRATE_KEY = 'ka_cloud_profile_force_hydrate_v1';
const AUTO_SYNC_MS = 10000;
const REMOTE_SYNC_MS = 30000;
const REMOTE_REQUEST_TIMEOUT_MS = 12000;
const REMOTE_ACCOUNT_KEY = 'ka_cloud_profile_account_v1';
const REMOTE_TOKEN_KEY = 'ka_cloud_profile_token_v1';
const REMOTE_REVISION_KEY = 'ka_cloud_profile_remote_revision_v1';
const REMOTE_DEVICE_KEY = 'ka_cloud_profile_device_v1';
const REMOTE_PENDING_KEY = 'ka_cloud_profile_sync_pending_v1';
const REMOTE_DEVICE_NAME_KEY = 'ka_cloud_profile_device_name_v1';

let currentProfile = null;
let initialized = false;
let syncTimer = null;
let scheduledSync = null;
let applyingProfile = false;
let statusMessage = 'LOCAL GUEST PROFILE';
let toast = null;
let remoteTimer = null;
let remoteSyncPromise = null;
let remoteLastFingerprint = '';
let remoteState = {
  connected: false,
  syncing: false,
  pending: false,
  conflict: false,
  accountId: '',
  cloudRevision: 0,
  lastSyncAt: 0,
  lastError: '',
  linkCode: '',
  linkExpiresAt: 0,
  devices: [],
  history: [],
  activity: [],
  recoveryCode: '',
  recoveryEnabled: false
};

function nowMs() {
  return Date.now();
}

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return `guest-${globalThis.crypto.randomUUID()}`;
  } catch {
    // Fall through to a timestamp/random guest identity.
  }
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readRaw(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeRaw(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore restricted storage failures.
  }
}

function getOrCreateDeviceId() {
  let value = readRaw(REMOTE_DEVICE_KEY, '');
  if (/^device-[a-zA-Z0-9_-]{8,120}$/.test(value)) return value;
  const suffix = randomId().replace(/^guest-/, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  value = `device-${suffix}`;
  writeRaw(REMOTE_DEVICE_KEY, value);
  return value;
}

function getDeviceName() {
  const fallback = typeof navigator !== 'undefined'
    ? `${/mobile/i.test(navigator.userAgent || '') ? 'Mobile' : 'Browser'} Device`
    : 'Browser Device';
  const stored = String(readRaw(REMOTE_DEVICE_NAME_KEY, '') || '').trim()
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 40);
  if (stored) return stored;
  writeRaw(REMOTE_DEVICE_NAME_KEY, fallback);
  return fallback;
}

function saveDeviceName(name) {
  const clean = String(name || '').trim()
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 40) || 'Browser Device';
  writeRaw(REMOTE_DEVICE_NAME_KEY, clean);
  return clean;
}

function getRemoteCredentials() {
  const accountId = readRaw(REMOTE_ACCOUNT_KEY, '');
  const token = readRaw(REMOTE_TOKEN_KEY, '');
  const valid = /^cloud-[a-f0-9]{32}$/i.test(accountId) && token.length >= 32;
  return { valid, accountId: valid ? accountId : '', token: valid ? token : '' };
}

function saveRemoteCredentials(account, token) {
  const accountId = String(account?.accountId || '');
  const secret = String(token || '');
  if (!/^cloud-[a-f0-9]{32}$/i.test(accountId) || secret.length < 32) {
    throw new Error('CLOUD_CREDENTIALS_INVALID');
  }
  writeRaw(REMOTE_ACCOUNT_KEY, accountId);
  writeRaw(REMOTE_TOKEN_KEY, secret);
  writeRaw(REMOTE_REVISION_KEY, String(Math.max(0, Number(account?.cloudRevision) || 0)));
  writeRaw(REMOTE_PENDING_KEY, '0');
  remoteState.connected = true;
  remoteState.accountId = accountId;
  remoteState.cloudRevision = Math.max(0, Number(account?.cloudRevision) || 0);
  remoteState.pending = false;
  remoteState.lastError = '';
  getOrCreateDeviceId();
}

function clearRemoteCredentials() {
  [REMOTE_ACCOUNT_KEY, REMOTE_TOKEN_KEY, REMOTE_REVISION_KEY, REMOTE_PENDING_KEY].forEach(removeRaw);
  remoteState = {
    connected: false,
    syncing: false,
    pending: false,
    conflict: false,
    accountId: '',
    cloudRevision: 0,
    lastSyncAt: 0,
    lastError: '',
    linkCode: '',
    linkExpiresAt: 0,
    devices: [],
    history: [],
    activity: [],
    recoveryCode: '',
    recoveryEnabled: false
  };
  remoteLastFingerprint = '';
}

function initializeRemoteState() {
  const credentials = getRemoteCredentials();
  remoteState.connected = credentials.valid;
  remoteState.accountId = credentials.accountId;
  remoteState.cloudRevision = Math.max(0, Number(readRaw(REMOTE_REVISION_KEY, '0')) || 0);
  remoteState.pending = readRaw(REMOTE_PENDING_KEY, '0') === '1';
  getOrCreateDeviceId();
  getDeviceName();
  return credentials;
}

async function remoteRequest(path, { method = 'GET', body = null, authenticated = true } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_REQUEST_TIMEOUT_MS);
  try {
    const headers = {};
    if (body !== null) headers['content-type'] = 'application/json';
    headers['x-ka-device-id'] = getOrCreateDeviceId();
    if (authenticated) {
      const credentials = getRemoteCredentials();
      if (!credentials.valid) throw new Error('CLOUD_ACCOUNT_NOT_CONNECTED');
      headers.authorization = `Bearer ${credentials.token}`;
      headers['x-ka-account-id'] = credentials.accountId;
    }
    const response = await fetch(`${ONLINE_LEADERBOARD_WORKER_URL}${path}`, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok || value.ok !== true) throw new Error(String(value.error || `HTTP_${response.status}`));
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

function remoteOperationId(reason = 'sync') {
  const random = Math.random().toString(36).slice(2, 12);
  return `profile-${String(reason || 'sync').replace(/[^a-z0-9_-]/gi, '-').slice(0, 40)}-${Date.now().toString(36)}-${random}`;
}

function markRemotePending(error = null) {
  remoteState.pending = true;
  remoteState.lastError = String(error?.message || error || 'OFFLINE').slice(0, 120);
  writeRaw(REMOTE_PENDING_KEY, '1');
  statusMessage = `CLOUD PENDING · ${remoteState.lastError}`;
  refreshProfileUi();
}

function applyRemoteProfile(profile, { forceHydrate = false } = {}) {
  const validation = validateCloudProfile(profile);
  if (!validation.valid) throw new Error(`REMOTE_PROFILE_INVALID:${validation.errors.join(',')}`);
  const incoming = validation.profile;
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  if (incoming.legacyFingerprint === currentProfile.legacyFingerprint) return false;
  const merged = mergeCloudProfiles(currentProfile, incoming, { now: nowMs() });
  writeProfile(merged);
  applyProfileToLegacy(merged, { forceHydrate });
  return true;
}

function replaceWithRemoteProfile(profile, { forceHydrate = true } = {}) {
  const validation = validateCloudProfile(profile);
  if (!validation.valid) throw new Error(`REMOTE_PROFILE_INVALID:${validation.errors.join(',')}`);
  const incoming = validation.profile;
  writeProfile(incoming);
  applyProfileToLegacy(incoming, { forceHydrate });
  currentProfile = incoming;
  remoteLastFingerprint = incoming.legacyFingerprint;
  return true;
}

function updateRemoteAccountState(value = {}) {
  const account = value.account || {};
  if (account.accountId) remoteState.accountId = String(account.accountId);
  if (Number.isFinite(Number(account.cloudRevision))) remoteState.cloudRevision = Math.max(0, Number(account.cloudRevision));
  if (typeof account.recoveryEnabled === 'boolean') remoteState.recoveryEnabled = account.recoveryEnabled;
  if (Array.isArray(value.devices)) remoteState.devices = value.devices.map((entry) => ({ ...entry }));
  if (Array.isArray(value.history)) remoteState.history = value.history.map((entry) => ({ ...entry }));
  if (Array.isArray(value.activity)) remoteState.activity = value.activity.map((entry) => ({ ...entry }));
  if (remoteState.cloudRevision >= 0) writeRaw(REMOTE_REVISION_KEY, String(remoteState.cloudRevision));
}

export async function registerCloudGuestAccount() {
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  if (getRemoteCredentials().valid) return syncCloudProfileRemote('already-connected', { force: true });
  syncCloudProfile('before-cloud-register');
  remoteState.syncing = true;
  statusMessage = 'CREATING CLOUD GUEST ACCOUNT…';
  refreshProfileUi();
  try {
    const value = await remoteRequest('/profiles/register', {
      method: 'POST',
      authenticated: false,
      body: { profile: currentProfile, deviceId: getOrCreateDeviceId(), deviceName: getDeviceName() }
    });
    saveRemoteCredentials(value.account, value.token);
    updateRemoteAccountState(value);
    remoteLastFingerprint = currentProfile.legacyFingerprint;
    remoteState.lastSyncAt = nowMs();
    statusMessage = 'CLOUD GUEST CONNECTED';
    toast?.('CLOUD PROFILE ENABLED', '#22ff88', 1800);
    refreshProfileUi();
    return Object.freeze({ accepted: true, account: value.account });
  } catch (error) {
    markRemotePending(error);
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  } finally {
    remoteState.syncing = false;
    refreshProfileUi();
  }
}

export function syncCloudProfileRemote(reason = 'manual', { force = false } = {}) {
  const credentials = getRemoteCredentials();
  if (!credentials.valid) return Promise.resolve(Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' }));
  if (remoteSyncPromise) return remoteSyncPromise;
  syncCloudProfile(`remote-${reason}`);
  if (!force && !remoteState.pending && remoteLastFingerprint === currentProfile.legacyFingerprint) {
    return Promise.resolve(Object.freeze({ accepted: true, unchanged: true, cloudRevision: remoteState.cloudRevision }));
  }
  remoteState.syncing = true;
  statusMessage = 'SYNCING CLOUD PROFILE…';
  refreshProfileUi();
  remoteSyncPromise = remoteRequest('/profiles/sync', {
    method: 'POST',
    body: {
      operationId: remoteOperationId(reason),
      expectedCloudRevision: Math.max(0, Number(readRaw(REMOTE_REVISION_KEY, '0')) || 0),
      profile: currentProfile
    }
  }).then((value) => {
    const remoteChangedLocal = applyRemoteProfile(value.profile, { forceHydrate: false });
    remoteState.connected = true;
    remoteState.accountId = value.account?.accountId || credentials.accountId;
    remoteState.cloudRevision = Math.max(0, Number(value.account?.cloudRevision) || 0);
    updateRemoteAccountState(value);
    remoteState.lastSyncAt = nowMs();
    remoteState.pending = false;
    remoteState.conflict = value.conflict === true;
    remoteState.lastError = '';
    writeRaw(REMOTE_REVISION_KEY, String(remoteState.cloudRevision));
    writeRaw(REMOTE_PENDING_KEY, '0');
    remoteLastFingerprint = currentProfile.legacyFingerprint;
    statusMessage = value.conflict
      ? (remoteChangedLocal ? 'CLOUD CONFLICT MERGED' : 'CLOUD CONFLICT RESOLVED')
      : 'CLOUD PROFILE SYNCED';
    refreshProfileUi();
    return Object.freeze({ accepted: true, conflict: value.conflict === true, changed: value.changed === true, cloudRevision: remoteState.cloudRevision });
  }).catch((error) => {
    markRemotePending(error);
    return Object.freeze({ accepted: false, queued: true, reason: String(error?.message || error) });
  }).finally(() => {
    remoteState.syncing = false;
    remoteSyncPromise = null;
    refreshProfileUi();
  });
  return remoteSyncPromise;
}

export async function createCloudDeviceLink() {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  statusMessage = 'CREATING DEVICE LINK…';
  refreshProfileUi();
  try {
    await syncCloudProfileRemote('before-device-link', { force: true });
    const value = await remoteRequest('/profiles/link/create', { method: 'POST', body: {} });
    remoteState.linkCode = String(value.code || '');
    remoteState.linkExpiresAt = Date.parse(value.expiresAt) || 0;
    statusMessage = `DEVICE LINK CODE ${remoteState.linkCode}`;
    setText('cloud-profile-link-code', remoteState.linkCode || '—');
    try { await navigator.clipboard.writeText(remoteState.linkCode); } catch { /* code remains visible */ }
    refreshProfileUi();
    return Object.freeze({ accepted: true, code: remoteState.linkCode, expiresAt: remoteState.linkExpiresAt });
  } catch (error) {
    statusMessage = `LINK FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function consumeCloudDeviceLink(code, { reload = true } = {}) {
  const cleanCode = String(code || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
  if (cleanCode.length !== 8) return Object.freeze({ accepted: false, reason: 'LINK_CODE_INVALID' });
  statusMessage = 'LINKING THIS DEVICE…';
  refreshProfileUi();
  try {
    const value = await remoteRequest('/profiles/link/consume', {
      method: 'POST',
      authenticated: false,
      body: { code: cleanCode, deviceId: getOrCreateDeviceId(), deviceName: getDeviceName() }
    });
    saveRemoteCredentials(value.account, value.token);
    updateRemoteAccountState(value);
    applyRemoteProfile(value.profile, { forceHydrate: true });
    remoteLastFingerprint = currentProfile.legacyFingerprint;
    statusMessage = 'DEVICE LINKED · RELOADING';
    toast?.('CLOUD PROFILE LINKED', '#22ff88', 1700);
    refreshProfileUi();
    if (reload && typeof location !== 'undefined') setTimeout(() => location.reload(), 650);
    return Object.freeze({ accepted: true, account: value.account });
  } catch (error) {
    statusMessage = `LINK REJECTED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function exportCloudProfileFromServer() {
  try {
    const value = await remoteRequest('/profiles/export');
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`khadijas-arena-cloud-profile-${date}.json`, value.export);
    statusMessage = 'CLOUD BACKUP EXPORTED';
    refreshProfileUi();
    return Object.freeze({ accepted: true });
  } catch (error) {
    statusMessage = `CLOUD EXPORT FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function deleteCloudGuestAccount() {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  try {
    await remoteRequest('/profiles/account', { method: 'DELETE' });
    clearRemoteCredentials();
    statusMessage = 'CLOUD ACCOUNT DELETED · LOCAL PROFILE KEPT';
    toast?.('CLOUD ACCOUNT DELETED · LOCAL SAVE KEPT', '#ffaa00', 2000);
    refreshProfileUi();
    return Object.freeze({ accepted: true });
  } catch (error) {
    statusMessage = `DELETE FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function refreshCloudAccountSecurity({ silent = false } = {}) {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  if (!silent) {
    statusMessage = 'REFRESHING CLOUD SECURITY…';
    refreshProfileUi();
  }
  try {
    const [devices, history, activity] = await Promise.all([
      remoteRequest('/profiles/devices'),
      remoteRequest('/profiles/history'),
      remoteRequest('/profiles/activity')
    ]);
    updateRemoteAccountState(devices);
    updateRemoteAccountState(history);
    updateRemoteAccountState(activity);
    if (!silent) statusMessage = 'CLOUD SECURITY REFRESHED';
    refreshProfileUi();
    return Object.freeze({ accepted: true, devices: remoteState.devices, history: remoteState.history, activity: remoteState.activity });
  } catch (error) {
    if (!silent) statusMessage = `SECURITY REFRESH FAILED · ${String(error?.message || error).slice(0, 80)}`;
    remoteState.lastError = String(error?.message || error).slice(0, 120);
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function renameCloudDevice(name, deviceId = getOrCreateDeviceId()) {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  const cleanName = saveDeviceName(name);
  try {
    const value = await remoteRequest('/profiles/devices/name', {
      method: 'POST',
      body: { deviceId, name: cleanName }
    });
    updateRemoteAccountState(value);
    statusMessage = 'DEVICE NAME UPDATED';
    refreshProfileUi();
    return Object.freeze({ accepted: true, devices: remoteState.devices });
  } catch (error) {
    statusMessage = `DEVICE NAME FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function revokeCloudDevice(deviceId) {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  try {
    const value = await remoteRequest('/profiles/devices/revoke', {
      method: 'POST',
      body: { deviceId: String(deviceId || '') }
    });
    updateRemoteAccountState(value);
    if (value.currentRevoked === true || String(deviceId) === getOrCreateDeviceId()) {
      clearRemoteCredentials();
      statusMessage = 'THIS DEVICE WAS REVOKED · LOCAL PROFILE KEPT';
    } else {
      statusMessage = 'DEVICE REVOKED';
    }
    refreshProfileUi();
    return Object.freeze({ accepted: true, currentRevoked: value.currentRevoked === true });
  } catch (error) {
    statusMessage = `DEVICE REVOKE FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function revokeOtherCloudDevices() {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  try {
    const value = await remoteRequest('/profiles/devices/revoke-others', { method: 'POST', body: {} });
    updateRemoteAccountState(value);
    statusMessage = value.changed ? 'OTHER DEVICES REVOKED' : 'NO OTHER DEVICES LINKED';
    refreshProfileUi();
    return Object.freeze({ accepted: true, changed: value.changed === true });
  } catch (error) {
    statusMessage = `REVOKE OTHERS FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function rotateCloudDeviceToken() {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  try {
    const value = await remoteRequest('/profiles/token/rotate', { method: 'POST', body: {} });
    if (!value.token) throw new Error('PROFILE_ROTATED_TOKEN_MISSING');
    saveRemoteCredentials(value.account, value.token);
    updateRemoteAccountState(value);
    statusMessage = 'DEVICE TOKEN ROTATED';
    toast?.('CLOUD DEVICE TOKEN ROTATED', '#22ff88', 1600);
    refreshProfileUi();
    return Object.freeze({ accepted: true });
  } catch (error) {
    statusMessage = `TOKEN ROTATION FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function generateCloudRecoveryCode() {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  try {
    const value = await remoteRequest('/profiles/recovery/generate', { method: 'POST', body: {} });
    remoteState.recoveryCode = String(value.recoveryCode || '');
    updateRemoteAccountState(value);
    remoteState.recoveryEnabled = true;
    statusMessage = 'RECOVERY CODE GENERATED · SAVE IT NOW';
    setText('cloud-profile-recovery-code', remoteState.recoveryCode || '—');
    try { await navigator.clipboard.writeText(remoteState.recoveryCode); } catch { /* code remains visible */ }
    refreshProfileUi();
    return Object.freeze({ accepted: true, recoveryCode: remoteState.recoveryCode });
  } catch (error) {
    statusMessage = `RECOVERY CODE FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function recoverCloudGuestAccount(accountId, recoveryCode, { reload = true } = {}) {
  const cleanAccount = String(accountId || '').trim();
  const cleanCode = String(recoveryCode || '').trim().toUpperCase();
  if (!/^cloud-[a-f0-9]{32}$/i.test(cleanAccount)) return Object.freeze({ accepted: false, reason: 'PROFILE_ACCOUNT_ID_INVALID' });
  if (cleanCode.replace(/[^A-Z2-9]/g, '').length !== 16) return Object.freeze({ accepted: false, reason: 'PROFILE_RECOVERY_CODE_INVALID' });
  statusMessage = 'RECOVERING CLOUD ACCOUNT…';
  refreshProfileUi();
  try {
    const value = await remoteRequest('/profiles/recovery/consume', {
      method: 'POST',
      authenticated: false,
      body: {
        accountId: cleanAccount,
        recoveryCode: cleanCode,
        deviceId: getOrCreateDeviceId(),
        deviceName: getDeviceName()
      }
    });
    saveRemoteCredentials(value.account, value.token);
    updateRemoteAccountState(value);
    replaceWithRemoteProfile(value.profile, { forceHydrate: true });
    remoteState.recoveryCode = '';
    remoteState.recoveryEnabled = false;
    statusMessage = 'ACCOUNT RECOVERED · RELOADING';
    toast?.('CLOUD ACCOUNT RECOVERED', '#22ff88', 1800);
    refreshProfileUi();
    if (reload && typeof location !== 'undefined') setTimeout(() => location.reload(), 650);
    return Object.freeze({ accepted: true, account: value.account });
  } catch (error) {
    statusMessage = `RECOVERY REJECTED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function restoreCloudProfileRevision(revision, { reload = true } = {}) {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  const selected = Math.max(1, Math.floor(Number(revision) || 0));
  if (!selected) return Object.freeze({ accepted: false, reason: 'PROFILE_HISTORY_REVISION_INVALID' });
  statusMessage = `RESTORING CLOUD REVISION ${selected}…`;
  refreshProfileUi();
  try {
    const value = await remoteRequest('/profiles/history/restore', {
      method: 'POST',
      body: { revision: selected }
    });
    updateRemoteAccountState(value);
    replaceWithRemoteProfile(value.profile, { forceHydrate: true });
    remoteState.lastSyncAt = nowMs();
    statusMessage = `CLOUD REVISION ${selected} RESTORED · RELOADING`;
    toast?.(`CLOUD REVISION ${selected} RESTORED`, '#ffaa00', 1800);
    refreshProfileUi();
    if (reload && typeof location !== 'undefined') setTimeout(() => location.reload(), 650);
    return Object.freeze({ accepted: true, restoredRevision: selected });
  } catch (error) {
    statusMessage = `RESTORE FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

function parseRawProfile(raw) {
  if (typeof raw !== 'string' || !raw) return { valid: false, errors: ['PROFILE_MISSING'], profile: null };
  try {
    return validateCloudProfile(JSON.parse(raw));
  } catch {
    return { valid: false, errors: ['PROFILE_JSON_INVALID'], profile: null };
  }
}

function captureLegacyStorage() {
  const values = {};
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!isGameOwnedStorageKey(key)) continue;
      const value = localStorage.getItem(key);
      if (typeof value === 'string') values[key] = value;
    }
  } catch {
    // A partial capture is still preferable to failing profile initialization.
  }
  return sanitizeLegacyStorage(values);
}

function migrationSources(storage) {
  const sources = [];
  if (storage.ka_progression_v1) sources.push('progression');
  if (storage.ka_challenges_v1) sources.push('achievements');
  if (storage.fps_hi_score || storage.fps_hi_wave) sources.push('records');
  if (Object.keys(storage).some((key) => key.includes('leaderboard'))) sources.push('leaderboards');
  if (Object.keys(storage).some((key) => /accessibility|preference|binding|controller|volume|graphics|selected_|mobile_/i.test(key))) sources.push('settings');
  return sources.length ? sources : ['fresh-guest'];
}

function quarantineCorruptProfile(raw, errors = []) {
  if (!raw) return;
  const payload = {
    capturedAt: nowMs(),
    errors: Array.isArray(errors) ? errors.slice(0, 12) : [String(errors)],
    raw: String(raw).slice(0, 700000)
  };
  writeRaw(CORRUPT_KEY, JSON.stringify(payload));
}

function writeProfile(profile, { backup = true } = {}) {
  const validation = validateCloudProfile(profile);
  if (!validation.valid) throw new TypeError(`Cloud profile validation failed: ${validation.errors.join(', ')}`);
  const normalized = validation.profile;

  if (backup) {
    const previousRaw = readRaw(PRIMARY_KEY, '');
    const previous = parseRawProfile(previousRaw);
    if (previous.valid && previous.profile.profileId === normalized.profileId) {
      writeRaw(BACKUP_KEY, JSON.stringify(previous.profile));
    }
  }

  if (!writeRaw(PRIMARY_KEY, JSON.stringify(normalized))) {
    throw new Error('PROFILE_STORAGE_WRITE_FAILED');
  }
  writeRaw(REVISION_KEY, String(normalized.revision));
  currentProfile = normalized;
  refreshProfileUi();
  return currentProfile;
}

function recoverOrCreateProfile() {
  const primaryRaw = readRaw(PRIMARY_KEY, '');
  const primary = parseRawProfile(primaryRaw);
  if (primary.valid) return primary.profile;

  if (primaryRaw) quarantineCorruptProfile(primaryRaw, primary.errors);

  const backupRaw = readRaw(BACKUP_KEY, '');
  const backup = parseRawProfile(backupRaw);
  if (backup.valid) {
    const recovered = createGuestCloudProfile({
      profileId: backup.profile.profileId,
      legacyStorage: backup.profile.legacyStorage,
      createdAt: backup.profile.createdAt,
      now: nowMs(),
      revision: backup.profile.revision + 1,
      metadata: {
        ...backup.profile.metadata,
        lastSyncAt: nowMs(),
        lastSyncReason: 'backup-recovery',
        corruptionRecoveries: Number(backup.profile.metadata?.corruptionRecoveries || 0) + 1,
        migrationSources: [...(backup.profile.metadata?.migrationSources || []), 'backup-recovery']
      }
    });
    statusMessage = 'RECOVERED FROM BACKUP';
    return writeProfile(recovered, { backup: false });
  }

  const legacyStorage = captureLegacyStorage();
  const now = nowMs();
  const created = createGuestCloudProfile({
    profileId: randomId(),
    legacyStorage,
    now,
    createdAt: now,
    revision: 1,
    metadata: {
      migratedAt: now,
      lastSyncAt: now,
      lastSyncReason: 'initial-migration',
      migrationSources: migrationSources(legacyStorage),
      corruptionRecoveries: primaryRaw ? 1 : 0
    }
  });
  statusMessage = Object.keys(legacyStorage).length ? 'LEGACY SAVE MIGRATED' : 'NEW GUEST PROFILE';
  return writeProfile(created, { backup: false });
}

function applyProfileToLegacy(profile, { forceHydrate = false } = {}) {
  const validation = validateCloudProfile(profile);
  if (!validation.valid) throw new TypeError(`Cannot apply invalid profile: ${validation.errors.join(', ')}`);
  applyingProfile = true;
  try {
    for (const [key, value] of Object.entries(validation.profile.legacyStorage)) {
      writeRaw(key, value);
    }
    writeRaw(REVISION_KEY, String(validation.profile.revision));
    if (forceHydrate) writeRaw(FORCE_HYDRATE_KEY, '1');
  } finally {
    applyingProfile = false;
  }
  return validation.profile;
}

export function syncCloudProfile(reason = 'manual') {
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  if (applyingProfile) return getCloudProfileDiagnostics();
  const storage = captureLegacyStorage();
  const fingerprint = profileChecksum(storage);
  if (fingerprint === currentProfile.legacyFingerprint) {
    refreshProfileUi();
    return getCloudProfileDiagnostics();
  }

  const now = nowMs();
  const next = createGuestCloudProfile({
    profileId: currentProfile.profileId,
    legacyStorage: storage,
    createdAt: currentProfile.createdAt,
    now,
    revision: currentProfile.revision + 1,
    metadata: {
      ...currentProfile.metadata,
      lastSyncAt: now,
      lastSyncReason: String(reason || 'manual').slice(0, 80)
    }
  });
  writeProfile(next);
  statusMessage = 'PROFILE SAVED';
  refreshProfileUi();
  return getCloudProfileDiagnostics();
}

function scheduleProfileSync(reason = 'ui-change', delay = 80) {
  if (scheduledSync) clearTimeout(scheduledSync);
  scheduledSync = setTimeout(() => {
    scheduledSync = null;
    syncCloudProfile(reason);
    if (getRemoteCredentials().valid) void syncCloudProfileRemote(reason);
  }, Math.max(0, Number(delay) || 0));
}

function formatTimestamp(value) {
  const timestamp = Number(value) || 0;
  if (!timestamp) return 'NOT YET';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return String(timestamp);
  }
}

function shortProfileId(profileId) {
  const value = String(profileId || 'guest');
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-7)}` : value;
}

function setText(id, value) {
  if (typeof document === 'undefined') return;
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function renderCloudSecurityUi() {
  if (typeof document === 'undefined') return;
  const currentDeviceId = getOrCreateDeviceId();
  const nameInput = document.getElementById('cloud-profile-device-name-input');
  if (nameInput && document.activeElement !== nameInput) nameInput.value = getDeviceName();
  setText('cloud-profile-recovery-code', remoteState.recoveryCode || (remoteState.recoveryEnabled ? 'ACTIVE · HIDDEN' : 'NOT GENERATED'));

  const deviceList = document.getElementById('cloud-profile-device-list');
  if (deviceList) {
    deviceList.replaceChildren();
    if (!remoteState.devices.length) {
      const empty = document.createElement('small');
      empty.textContent = getRemoteCredentials().valid ? 'Select Refresh Security to load linked devices.' : 'Connect cloud sync to manage devices.';
      empty.style.color = '#8aa';
      deviceList.append(empty);
    } else {
      remoteState.devices.forEach((device) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;padding:7px;border:1px solid rgba(255,255,255,.10);border-radius:8px;';
        const label = document.createElement('small');
        const used = device.lastUsedAt ? formatTimestamp(device.lastUsedAt) : 'unknown';
        label.textContent = `${device.current ? 'THIS DEVICE · ' : ''}${device.name || 'Browser Device'} · ${device.region || 'ZZ'} · ${used}`;
        label.style.color = device.current ? '#22ff88' : '#b6c0c8';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ka-link-btn';
        button.textContent = device.current ? 'Revoke This Device' : 'Revoke';
        button.style.cssText = 'padding:7px 9px;text-align:center;border-color:rgba(255,70,70,.42);color:#ffaaaa;';
        button.disabled = remoteState.syncing || remoteState.devices.length <= 1;
        button.addEventListener('click', () => {
          const warning = device.current
            ? 'Revoke this browser? Cloud sync will disconnect here, but the local save remains.'
            : `Revoke ${device.name || 'this device'}?`;
          if (window.confirm(warning)) void revokeCloudDevice(device.deviceId);
        });
        row.append(label, button);
        deviceList.append(row);
      });
    }
  }

  const historySelect = document.getElementById('cloud-profile-history-select');
  if (historySelect) {
    const selected = historySelect.value;
    historySelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = remoteState.history.length ? 'Select cloud revision' : 'No stored revisions yet';
    historySelect.append(placeholder);
    remoteState.history.forEach((entry) => {
      const option = document.createElement('option');
      option.value = String(entry.revision);
      option.textContent = `Cloud rev ${entry.revision} · ${entry.reason || 'snapshot'} · ${formatTimestamp(entry.createdAt)}`;
      historySelect.append(option);
    });
    if ([...historySelect.options].some((option) => option.value === selected)) historySelect.value = selected;
  }

  const activityList = document.getElementById('cloud-profile-activity-list');
  if (activityList) {
    activityList.textContent = remoteState.activity.length
      ? remoteState.activity.slice(0, 12).map((entry) => `${formatTimestamp(entry.at)} · ${entry.kind} · ${entry.region || 'ZZ'}${entry.detail ? ` · ${entry.detail}` : ''}`).join('\n')
      : 'No cloud security activity loaded.';
  }

  setText('cloud-profile-current-device-id', currentDeviceId);
}

function refreshProfileUi() {
  if (!currentProfile || typeof document === 'undefined') return;
  const credentials = getRemoteCredentials();
  const remoteSuffix = credentials.valid
    ? ` · CLOUD REV ${Math.max(0, remoteState.cloudRevision)}`
    : ' · LOCAL ONLY';
  setText('cloud-profile-status', `${statusMessage}${remoteSuffix}`);
  setText('cloud-profile-id', shortProfileId(currentProfile.profileId));
  setText('cloud-profile-revision', `LOCAL REV ${currentProfile.revision}`);
  setText('cloud-profile-updated', formatTimestamp(currentProfile.updatedAt));
  setText('cloud-profile-account-id', credentials.valid ? shortProfileId(credentials.accountId) : 'NOT CONNECTED');
  setText('cloud-profile-cloud-revision', credentials.valid ? `CLOUD REV ${remoteState.cloudRevision}` : 'CLOUD OFF');
  setText('cloud-profile-link-code', remoteState.linkCode || '—');
  const enableButton = document.getElementById('cloud-profile-enable-btn');
  if (enableButton) enableButton.style.display = credentials.valid ? 'none' : '';
  ['cloud-profile-sync-btn', 'cloud-profile-link-create-btn', 'cloud-profile-server-export-btn', 'cloud-profile-delete-btn', 'cloud-profile-security-refresh-btn', 'cloud-profile-device-name-btn', 'cloud-profile-revoke-others-btn', 'cloud-profile-rotate-token-btn', 'cloud-profile-recovery-generate-btn', 'cloud-profile-history-restore-btn'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.disabled = !credentials.valid || remoteState.syncing;
  });
  const linkInput = document.getElementById('cloud-profile-link-input');
  const consumeButton = document.getElementById('cloud-profile-link-consume-btn');
  if (linkInput) linkInput.disabled = remoteState.syncing;
  if (consumeButton) consumeButton.disabled = remoteState.syncing;
  renderCloudSecurityUi();
  document.documentElement.dataset.kaCloudProfile = credentials.valid ? 'cloud-connected' : 'local-ready';
  document.documentElement.dataset.kaCloudProfileRevision = String(currentProfile.revision);
  document.documentElement.dataset.kaCloudProfileRemote = credentials.valid ? (remoteState.pending ? 'pending' : 'connected') : 'off';
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCloudProfile() {
  syncCloudProfile('manual-export');
  const envelope = createCloudProfileExport(currentProfile);
  const date = new Date(envelope.exportedAt).toISOString().slice(0, 10);
  downloadJson(`khadijas-arena-profile-${date}.json`, envelope);
  statusMessage = 'BACKUP EXPORTED';
  refreshProfileUi();
  return envelope;
}

export function importCloudProfileText(text, { merge = true, reload = false } = {}) {
  const imported = parseCloudProfileImport(text);
  if (!imported.valid) {
    statusMessage = `IMPORT REJECTED: ${imported.errors[0] || 'INVALID PROFILE'}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, errors: imported.errors });
  }

  syncCloudProfile('before-import');
  const next = merge
    ? mergeCloudProfiles(currentProfile, imported.profile, { now: nowMs() })
    : imported.profile;
  writeProfile(next);
  applyProfileToLegacy(next, { forceHydrate: true });
  statusMessage = merge ? 'BACKUP MERGED · RELOAD REQUIRED' : 'BACKUP RESTORED · RELOAD REQUIRED';
  refreshProfileUi();
  toast?.('PROFILE BACKUP APPLIED · RELOADING', '#22ff88', 1600);

  if (reload && typeof location !== 'undefined') {
    setTimeout(() => location.reload(), 500);
  }
  return Object.freeze({ accepted: true, merged: merge, profile: getCloudProfileDiagnostics() });
}

async function copyDiagnostics() {
  const text = JSON.stringify(getCloudProfileDiagnostics(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    statusMessage = 'DIAGNOSTICS COPIED';
  } catch {
    statusMessage = 'COPY BLOCKED · USE KAGETCLOUDPROFILEDIAGNOSTICS()';
  }
  refreshProfileUi();
}

function bindProfileUi() {
  document.getElementById('cloud-profile-export-btn')?.addEventListener('click', () => {
    exportCloudProfile();
  });
  document.getElementById('cloud-profile-import-btn')?.addEventListener('click', () => {
    document.getElementById('cloud-profile-import-file')?.click();
  });
  document.getElementById('cloud-profile-copy-btn')?.addEventListener('click', () => {
    void copyDiagnostics();
  });
  document.getElementById('cloud-profile-enable-btn')?.addEventListener('click', () => {
    void registerCloudGuestAccount();
  });
  document.getElementById('cloud-profile-sync-btn')?.addEventListener('click', () => {
    void syncCloudProfileRemote('manual-button', { force: true });
  });
  document.getElementById('cloud-profile-link-create-btn')?.addEventListener('click', () => {
    void createCloudDeviceLink();
  });
  document.getElementById('cloud-profile-link-consume-btn')?.addEventListener('click', () => {
    const input = document.getElementById('cloud-profile-link-input');
    void consumeCloudDeviceLink(input?.value || '', { reload: true });
  });
  document.getElementById('cloud-profile-server-export-btn')?.addEventListener('click', () => {
    void exportCloudProfileFromServer();
  });
  document.getElementById('cloud-profile-delete-btn')?.addEventListener('click', () => {
    if (!window.confirm('Delete the cloud guest account? The local browser profile will be kept.')) return;
    void deleteCloudGuestAccount();
  });
  document.getElementById('cloud-profile-security-refresh-btn')?.addEventListener('click', () => {
    void refreshCloudAccountSecurity();
  });
  document.getElementById('cloud-profile-device-name-btn')?.addEventListener('click', () => {
    const input = document.getElementById('cloud-profile-device-name-input');
    void renameCloudDevice(input?.value || getDeviceName());
  });
  document.getElementById('cloud-profile-revoke-others-btn')?.addEventListener('click', () => {
    if (!window.confirm('Revoke every other linked device? Those devices will keep local saves but lose cloud access.')) return;
    void revokeOtherCloudDevices();
  });
  document.getElementById('cloud-profile-rotate-token-btn')?.addEventListener('click', () => {
    if (!window.confirm('Rotate this device token? The current token will stop working immediately.')) return;
    void rotateCloudDeviceToken();
  });
  document.getElementById('cloud-profile-recovery-generate-btn')?.addEventListener('click', () => {
    if (!window.confirm('Generate a new one-time recovery code? Any previous recovery code will stop working.')) return;
    void generateCloudRecoveryCode();
  });
  document.getElementById('cloud-profile-recovery-consume-btn')?.addEventListener('click', () => {
    const account = document.getElementById('cloud-profile-recovery-account-input');
    const code = document.getElementById('cloud-profile-recovery-input');
    void recoverCloudGuestAccount(account?.value || '', code?.value || '', { reload: true });
  });
  document.getElementById('cloud-profile-history-restore-btn')?.addEventListener('click', () => {
    const select = document.getElementById('cloud-profile-history-select');
    const revision = Number(select?.value || 0);
    if (!revision) return;
    if (!window.confirm(`Restore cloud revision ${revision}? Current cloud state will be retained in version history.`)) return;
    void restoreCloudProfileRevision(revision, { reload: true });
  });
  document.getElementById('cloud-profile-import-file')?.addEventListener('change', async (event) => {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      if (file.size > 3000000) throw new Error('BACKUP_FILE_TOO_LARGE');
      const text = await file.text();
      const confirmed = window.confirm('Merge this backup into the current guest profile? The game will reload after the merge.');
      if (confirmed) importCloudProfileText(text, { merge: true, reload: true });
    } catch (error) {
      statusMessage = `IMPORT FAILED: ${String(error?.message || error).slice(0, 80)}`;
      refreshProfileUi();
    } finally {
      input.value = '';
    }
  });
}

export function getCloudProfileSnapshot({ includeStorage = true } = {}) {
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  const clone = JSON.parse(JSON.stringify(currentProfile));
  if (!includeStorage) delete clone.legacyStorage;
  return clone;
}

export function getCloudProfileDiagnostics() {
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  const storage = currentProfile.legacyStorage || {};
  const storageBytes = Object.entries(storage).reduce((sum, [key, value]) => sum + key.length + String(value).length, 0);
  return Object.freeze({
    patch: CLOUD_PROFILE_PATCH,
    schema: CLOUD_PROFILE_SCHEMA,
    version: CLOUD_PROFILE_VERSION,
    accountType: currentProfile.accountType,
    profileId: currentProfile.profileId,
    revision: currentProfile.revision,
    createdAt: currentProfile.createdAt,
    updatedAt: currentProfile.updatedAt,
    legacyFingerprint: currentProfile.legacyFingerprint,
    storageEntries: Object.keys(storage).length,
    storageBytes,
    progression: currentProfile.progression,
    achievementsUnlocked: currentProfile.achievements?.totalUnlocked || 0,
    records: currentProfile.records,
    identity: currentProfile.identity,
    pendingSubmissions: currentProfile.pendingSubmissions?.length || 0,
    metadata: currentProfile.metadata,
    mergePolicy: getCloudProfileMergePolicy(),
    status: statusMessage,
    remoteSync: remoteState.connected,
    authentication: remoteState.connected ? 'guest-token' : false,
    remote: {
      connected: remoteState.connected,
      syncing: remoteState.syncing,
      pending: remoteState.pending,
      conflict: remoteState.conflict,
      accountId: remoteState.accountId,
      cloudRevision: remoteState.cloudRevision,
      lastSyncAt: remoteState.lastSyncAt,
      lastError: remoteState.lastError,
      deviceId: getOrCreateDeviceId(),
      deviceName: getDeviceName(),
      devices: remoteState.devices.map((entry) => ({ ...entry })),
      history: remoteState.history.map((entry) => ({ ...entry })),
      activity: remoteState.activity.map((entry) => ({ ...entry })),
      recoveryEnabled: remoteState.recoveryEnabled,
      linkCodeActive: Boolean(remoteState.linkCode && remoteState.linkExpiresAt > nowMs())
    }
  });
}

export function initCloudProfile({ showToast = null } = {}) {
  if (typeof showToast === 'function') toast = showToast;
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  initializeRemoteState();
  if (initialized) {
    refreshProfileUi();
    return getCloudProfileDiagnostics();
  }
  initialized = true;
  bindProfileUi();
  refreshProfileUi();

  document.addEventListener('input', () => scheduleProfileSync('settings-input'), true);
  document.addEventListener('change', () => scheduleProfileSync('settings-change'), true);
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-menu-screen="settings"], #keybind-modal, #pause-screen, #ka-local-leaderboards-dialog, #ka-online-leaderboards-dialog')) {
      scheduleProfileSync('profile-ui-action', 180);
    }
  }, true);
  window.addEventListener('ka:player-preferences-change', () => scheduleProfileSync('player-preferences'));
  window.addEventListener('storage', (event) => {
    if (isGameOwnedStorageKey(event.key)) scheduleProfileSync('cross-tab-storage', 20);
  });
  window.addEventListener('pagehide', () => syncCloudProfile('pagehide'));
  window.addEventListener('beforeunload', () => syncCloudProfile('beforeunload'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncCloudProfile('visibility-hidden');
  });

  syncTimer = setInterval(() => {
    if (document.visibilityState !== 'hidden') syncCloudProfile('periodic');
  }, AUTO_SYNC_MS);
  remoteTimer = setInterval(() => {
    if (document.visibilityState !== 'hidden' && getRemoteCredentials().valid) {
      void syncCloudProfileRemote('periodic');
    }
  }, REMOTE_SYNC_MS);
  window.addEventListener('unload', () => {
    if (syncTimer) clearInterval(syncTimer);
    if (remoteTimer) clearInterval(remoteTimer);
  }, { once: true });

  queueMicrotask(async () => {
    syncCloudProfile('boot-complete');
    if (getRemoteCredentials().valid) {
      await syncCloudProfileRemote('boot', { force: true });
      await refreshCloudAccountSecurity({ silent: true });
    }
  });
  return getCloudProfileDiagnostics();
}

if (typeof window !== 'undefined') {
  window.KAGetCloudProfile = () => getCloudProfileSnapshot({ includeStorage: true });
  window.KAGetCloudProfileDiagnostics = getCloudProfileDiagnostics;
  window.KASyncCloudProfile = syncCloudProfile;
  window.KAExportCloudProfile = exportCloudProfile;
  window.KAImportCloudProfileText = importCloudProfileText;
  window.KAValidateCloudProfile = validateCloudProfile;
  window.KAMergeCloudProfiles = mergeCloudProfiles;
  window.KAGetCloudProfileMergePolicy = getCloudProfileMergePolicy;
  window.KARegisterCloudGuestAccount = registerCloudGuestAccount;
  window.KASyncCloudProfileRemote = syncCloudProfileRemote;
  window.KACreateCloudDeviceLink = createCloudDeviceLink;
  window.KAConsumeCloudDeviceLink = consumeCloudDeviceLink;
  window.KAExportCloudProfileFromServer = exportCloudProfileFromServer;
  window.KADeleteCloudGuestAccount = deleteCloudGuestAccount;
  window.KARefreshCloudAccountSecurity = refreshCloudAccountSecurity;
  window.KARenameCloudDevice = renameCloudDevice;
  window.KARevokeCloudDevice = revokeCloudDevice;
  window.KARevokeOtherCloudDevices = revokeOtherCloudDevices;
  window.KARotateCloudDeviceToken = rotateCloudDeviceToken;
  window.KAGenerateCloudRecoveryCode = generateCloudRecoveryCode;
  window.KARecoverCloudGuestAccount = recoverCloudGuestAccount;
  window.KARestoreCloudProfileRevision = restoreCloudProfileRevision;
}
