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
import {
  CLOUD_SESSION_EXPIRED_MESSAGE,
  CLOUD_SESSION_RECOVERY_PATCH,
  createCloudSessionExpiryResult,
  isPermanentCloudSessionError
} from './cloud_profile_session_core.js';
import {
  CLOUD_RELIABILITY_PATCH,
  CLOUD_SYNC_LEASE_MS,
  CLOUD_SYNC_LEASE_RENEW_MS,
  acquireSyncLease,
  buildReliabilitySnapshot,
  calculateClockSkew,
  completeSyncQueue,
  createSyncQueueEntry,
  enqueueSync,
  markSyncAttempt,
  nextSyncRetryAt,
  normalizeAccountTombstone,
  normalizeSyncLease,
  normalizeSyncQueue,
  peekReadySync,
  releaseSyncLease,
  renewSyncLease,
  replaceSyncQueueEntry,
  tombstoneBlocksAccount,
  verifyProfileIntegrity
} from './cloud_profile_reliability_core.js';

const PRIMARY_KEY = 'ka_cloud_profile_v1';
const BACKUP_KEY = 'ka_cloud_profile_backup_v1';
const CORRUPT_KEY = 'ka_cloud_profile_corrupt_v1';
const REVISION_KEY = 'ka_cloud_profile_revision_v1';
const FORCE_HYDRATE_KEY = 'ka_cloud_profile_force_hydrate_v1';
const AUTO_SYNC_MS = 10000;
const REMOTE_SYNC_MS = 30000;
const REMOTE_REQUEST_TIMEOUT_MS = 12000;
const REMOTE_ACCOUNT_KEY = 'ka_cloud_profile_account_v1';
const REMOTE_ACCOUNT_HINT_KEY = 'ka_cloud_profile_account_hint_v1';
const REMOTE_TOKEN_KEY = 'ka_cloud_profile_token_v1';
const REMOTE_REVISION_KEY = 'ka_cloud_profile_remote_revision_v1';
const REMOTE_DEVICE_KEY = 'ka_cloud_profile_device_v1';
const REMOTE_PENDING_KEY = 'ka_cloud_profile_sync_pending_v1';
const REMOTE_DEVICE_NAME_KEY = 'ka_cloud_profile_device_name_v1';
const REMOTE_QUEUE_KEY = 'ka_cloud_profile_sync_queue_v1';
const REMOTE_LEASE_KEY = 'ka_cloud_profile_sync_lease_v1';
const REMOTE_CLOCK_KEY = 'ka_cloud_profile_clock_v1';
const REMOTE_TOMBSTONE_KEY = 'ka_cloud_profile_tombstone_v1';
const REMOTE_LAST_SUCCESS_KEY = 'ka_cloud_profile_last_success_v1';
const PROGRESSION_RECEIPT_QUEUE_KEY = 'ka_cloud_progression_receipts_v1';
const PROGRESSION_RECEIPT_QUEUE_LIMIT = 32;
const PROGRESSION_AUTHORITY_PATCH = 'prog2-r1-production-hardening-cloud-integrity';
const CLOUD_AUTH_PATCH = 'm4-final-player-polish-r1';

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
let remoteRetryTimer = null;
let remoteLeaseHeartbeat = null;
let remoteTabId = '';
let cloudAdvancedOpen = false;
let cloudSessionExpiredToastAt = 0;
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
  recoveryEnabled: false,
  queuedChanges: 0,
  retryAt: 0,
  leaseOwner: '',
  leaseExpiresAt: 0,
  activeSyncTab: false,
  checksumVerified: false,
  lastSuccessfulSyncAt: 0,
  serverTimeOffsetMs: 0,
  serverRoundTripMs: 0,
  clockSkewWarning: false,
  lastOperationId: '',
  tombstonedAccountId: '',
  accountType: 'guest',
  accountLabel: 'Khadija’s Arena Player',
  passkeys: [],
  authVersion: 0,
  lastAuthenticatedAt: 0,
  progressionProtected: false,
  progressionReceiptCount: 0,
  lastProgressionAt: 0,
  lastProgressionReceiptId: '',
  lastProgressionReceiptProof: '',
  webAuthnSupported: typeof PublicKeyCredential !== 'undefined' && typeof navigator !== 'undefined' && Boolean(navigator.credentials)
};

function nowMs() {
  return Date.now();
}

function dispatchCloudAuthChanged({ authenticated = false, accountId = '', accountType = 'guest', reason = '' } = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return false;
  const detail = Object.freeze({
    authenticated: authenticated === true,
    accountId: String(accountId || '').slice(0, 80),
    accountType: accountType === 'passkey' ? 'passkey' : 'guest',
    reason: String(reason || '').slice(0, 80)
  });
  try {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('ka:cloud-auth-changed', { detail })
      : Object.assign(new Event('ka:cloud-auth-changed'), { detail });
    window.dispatchEvent(event);
    return true;
  } catch {
    return false;
  }
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

export function getCloudProfileAuthContext() {
  const credentials = getRemoteCredentials();
  const profile = currentProfile || recoverOrCreateProfile();
  return Object.freeze({
    valid: credentials.valid,
    accountId: credentials.accountId,
    token: credentials.token,
    accountType: credentials.valid ? remoteState.accountType : profile.accountType,
    displayName: String(
      profile?.identity?.displayName
      || remoteState.accountLabel
      || 'Player'
    ).replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Player',
    deviceId: getOrCreateDeviceId(),
    connected: remoteState.connected === true
  });
}

function saveRemoteCredentials(account, token) {
  const accountId = String(account?.accountId || '');
  const secret = String(token || '');
  if (!/^cloud-[a-f0-9]{32}$/i.test(accountId) || secret.length < 32) {
    throw new Error('CLOUD_CREDENTIALS_INVALID');
  }
  writeRaw(REMOTE_ACCOUNT_KEY, accountId);
  writeRaw(REMOTE_ACCOUNT_HINT_KEY, accountId);
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

function getRemoteTabId() {
  if (remoteTabId) return remoteTabId;
  try {
    remoteTabId = sessionStorage.getItem('ka_cloud_profile_tab_id_v1') || '';
    if (!remoteTabId) {
      remoteTabId = `tab-${randomId().replace(/^guest-/, '').slice(0, 80)}`;
      sessionStorage.setItem('ka_cloud_profile_tab_id_v1', remoteTabId);
    }
  } catch {
    remoteTabId = `tab-${randomId().replace(/^guest-/, '').slice(0, 80)}`;
  }
  return remoteTabId;
}

function parseStoredJson(key, fallback) {
  try {
    const raw = readRaw(key, '');
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function readRemoteQueue() {
  return normalizeSyncQueue(parseStoredJson(REMOTE_QUEUE_KEY, []), { now: nowMs() });
}

function writeRemoteQueue(queue) {
  const normalized = normalizeSyncQueue(queue, { now: nowMs() });
  if (normalized.length) writeRaw(REMOTE_QUEUE_KEY, JSON.stringify(normalized));
  else removeRaw(REMOTE_QUEUE_KEY);
  remoteState.queuedChanges = normalized.length;
  remoteState.retryAt = nextSyncRetryAt(normalized, nowMs());
  remoteState.pending = normalized.length > 0;
  writeRaw(REMOTE_PENDING_KEY, normalized.length ? '1' : '0');
  return normalized;
}

function readRemoteLease() {
  return normalizeSyncLease(parseStoredJson(REMOTE_LEASE_KEY, null));
}

function writeRemoteLease(lease) {
  const normalized = normalizeSyncLease(lease);
  if (normalized.ownerId) writeRaw(REMOTE_LEASE_KEY, JSON.stringify(normalized));
  else removeRaw(REMOTE_LEASE_KEY);
  remoteState.leaseOwner = normalized.ownerId;
  remoteState.leaseExpiresAt = normalized.expiresAt;
  remoteState.activeSyncTab = normalized.ownerId === getRemoteTabId() && normalized.expiresAt > nowMs();
  return normalized;
}

function clearRemoteRetryTimer() {
  if (remoteRetryTimer) clearTimeout(remoteRetryTimer);
  remoteRetryTimer = null;
}

function scheduleRemoteQueueRetry(delayOverride = null) {
  clearRemoteRetryTimer();
  const queue = readRemoteQueue();
  if (!queue.length || !getRemoteCredentials().valid) return;
  const target = nextSyncRetryAt(queue, nowMs()) || nowMs();
  const delay = delayOverride === null
    ? Math.max(50, Math.min(5 * 60_000, target - nowMs()))
    : Math.max(50, Number(delayOverride) || 50);
  remoteRetryTimer = setTimeout(() => {
    remoteRetryTimer = null;
    void drainRemoteSyncQueue('scheduled-retry');
  }, delay);
}

function acquireRemoteLease() {
  const result = acquireSyncLease(readRemoteLease(), {
    ownerId: getRemoteTabId(),
    now: nowMs(),
    ttlMs: CLOUD_SYNC_LEASE_MS
  });
  writeRemoteLease(result.lease);
  return result;
}

function startRemoteLeaseHeartbeat() {
  if (remoteLeaseHeartbeat) clearInterval(remoteLeaseHeartbeat);
  remoteLeaseHeartbeat = setInterval(() => {
    const result = renewSyncLease(readRemoteLease(), {
      ownerId: getRemoteTabId(),
      now: nowMs(),
      ttlMs: CLOUD_SYNC_LEASE_MS
    });
    if (result.renewed) writeRemoteLease(result.lease);
  }, CLOUD_SYNC_LEASE_RENEW_MS);
}

function releaseRemoteLease() {
  if (remoteLeaseHeartbeat) clearInterval(remoteLeaseHeartbeat);
  remoteLeaseHeartbeat = null;
  writeRemoteLease(releaseSyncLease(readRemoteLease(), getRemoteTabId()));
}

function readLocalTombstone() {
  return normalizeAccountTombstone(parseStoredJson(REMOTE_TOMBSTONE_KEY, null));
}

function saveLocalTombstone(value) {
  const tombstone = normalizeAccountTombstone(value);
  if (!tombstone) return null;
  writeRaw(REMOTE_TOMBSTONE_KEY, JSON.stringify(tombstone));
  remoteState.tombstonedAccountId = tombstone.accountId;
  return tombstone;
}

function clearRemoteCredentials({ preserveQueue = false } = {}) {
  [REMOTE_ACCOUNT_KEY, REMOTE_TOKEN_KEY, REMOTE_REVISION_KEY, REMOTE_PENDING_KEY].forEach(removeRaw);
  if (!preserveQueue) removeRaw(REMOTE_QUEUE_KEY);
  releaseRemoteLease();
  remoteState = {
    connected: false,
    syncing: false,
    pending: preserveQueue && readRemoteQueue().length > 0,
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
    recoveryEnabled: false,
    queuedChanges: preserveQueue ? readRemoteQueue().length : 0,
    retryAt: preserveQueue ? nextSyncRetryAt(readRemoteQueue(), nowMs()) : 0,
    leaseOwner: '',
    leaseExpiresAt: 0,
    activeSyncTab: false,
    checksumVerified: false,
    lastSuccessfulSyncAt: Number(readRaw(REMOTE_LAST_SUCCESS_KEY, '0')) || 0,
    serverTimeOffsetMs: 0,
    serverRoundTripMs: 0,
    clockSkewWarning: false,
    lastOperationId: '',
    tombstonedAccountId: readLocalTombstone()?.accountId || '',
    accountType: 'guest',
    accountLabel: 'Khadija’s Arena Player',
    passkeys: [],
    authVersion: 0,
    lastAuthenticatedAt: 0,
    webAuthnSupported: typeof PublicKeyCredential !== 'undefined' && typeof navigator !== 'undefined' && Boolean(navigator.credentials)
  };
  remoteLastFingerprint = '';
}


function expireCloudAuthenticatedSession(error = null) {
  if (!isPermanentCloudSessionError(error)) return null;
  const credentials = getRemoteCredentials();
  const accountHint = credentials.accountId || String(readRaw(REMOTE_ACCOUNT_HINT_KEY, '') || '');
  if (accountHint) writeRaw(REMOTE_ACCOUNT_HINT_KEY, accountHint);
  clearRemoteRetryTimer();
  clearRemoteCredentials();
  remoteState.lastError = String(error?.code || error?.payload?.error || error?.message || 'CLOUD_SESSION_EXPIRED').slice(0, 120);
  remoteState.pending = false;
  remoteState.queuedChanges = 0;
  remoteState.retryAt = 0;
  remoteState.checksumVerified = false;
  statusMessage = CLOUD_SESSION_EXPIRED_MESSAGE;
  const timestamp = nowMs();
  if (timestamp - cloudSessionExpiredToastAt > 1200) {
    cloudSessionExpiredToastAt = timestamp;
    toast?.(CLOUD_SESSION_EXPIRED_MESSAGE, '#ffaa00', 2600);
  }
  refreshProfileUi();
  dispatchCloudAuthChanged({ authenticated: false, accountId: accountHint, reason: 'session-expired' });
  return createCloudSessionExpiryResult(error, { accountHint });
}

function initializeRemoteState() {
  const credentials = getRemoteCredentials();
  const tombstone = readLocalTombstone();
  if (credentials.valid && tombstoneBlocksAccount(tombstone, credentials.accountId, nowMs())) {
    clearRemoteCredentials();
    statusMessage = 'CLOUD ACCOUNT WAS DELETED · LOCAL PROFILE KEPT';
    return getRemoteCredentials();
  }
  const queue = readRemoteQueue();
  const lease = readRemoteLease();
  const clock = parseStoredJson(REMOTE_CLOCK_KEY, {});
  remoteState.connected = credentials.valid;
  remoteState.accountId = credentials.accountId;
  remoteState.cloudRevision = Math.max(0, Number(readRaw(REMOTE_REVISION_KEY, '0')) || 0);
  remoteState.pending = queue.length > 0 || readRaw(REMOTE_PENDING_KEY, '0') === '1';
  remoteState.queuedChanges = queue.length;
  remoteState.retryAt = nextSyncRetryAt(queue, nowMs());
  remoteState.leaseOwner = lease.ownerId;
  remoteState.leaseExpiresAt = lease.expiresAt;
  remoteState.activeSyncTab = lease.ownerId === getRemoteTabId() && lease.expiresAt > nowMs();
  remoteState.lastSuccessfulSyncAt = Math.max(0, Number(readRaw(REMOTE_LAST_SUCCESS_KEY, '0')) || 0);
  remoteState.serverTimeOffsetMs = Number(clock.offsetMs) || 0;
  remoteState.serverRoundTripMs = Math.max(0, Number(clock.roundTripMs) || 0);
  remoteState.clockSkewWarning = clock.warning === true;
  remoteState.tombstonedAccountId = tombstone?.accountId || '';
  getOrCreateDeviceId();
  getDeviceName();
  return credentials;
}

class CloudRemoteError extends Error {
  constructor(code, status = 0, payload = {}) {
    super(String(code || 'CLOUD_REQUEST_FAILED'));
    this.name = 'CloudRemoteError';
    this.code = String(code || 'CLOUD_REQUEST_FAILED');
    this.status = Number(status) || 0;
    this.payload = payload;
  }
}

export function getCloudProfileErrorMessage(error, context = 'request') {
  const code = String(error?.code || error?.name || error?.message || error || 'CLOUD_REQUEST_FAILED');
  const messages = {
    PROFILE_ACCOUNT_ID_INVALID: 'ENTER A VALID CLOUD ACCOUNT ID',
    PROFILE_ACCOUNT_NOT_FOUND: 'CLOUD ACCOUNT NOT FOUND',
    PROFILE_ACCOUNT_DELETED: 'THIS CLOUD ACCOUNT WAS DELETED',
    PASSKEY_ACCOUNT_NOT_ENABLED: 'NO PASSKEY IS REGISTERED FOR THIS ACCOUNT',
    PASSKEY_CREDENTIAL_NOT_FOUND: 'NO MATCHING PASSKEY WAS FOUND',
    PASSKEY_CHALLENGE_NOT_FOUND: 'THE PASSKEY REQUEST EXPIRED · TRY AGAIN',
    PASSKEY_CHALLENGE_EXPIRED: 'THE PASSKEY REQUEST EXPIRED · TRY AGAIN',
    PASSKEY_CHALLENGE_USED: 'THIS PASSKEY REQUEST WAS ALREADY USED',
    PASSKEY_ORIGIN_MISMATCH: 'PASSKEY ORIGIN CHECK FAILED',
    PASSKEY_RP_ID_MISMATCH: 'PASSKEY WEBSITE CHECK FAILED',
    PASSKEY_SIGNATURE_REJECTED: 'PASSKEY VERIFICATION FAILED',
    PASSKEY_ALGORITHM_UNSUPPORTED: 'THIS PASSKEY TYPE IS NOT SUPPORTED',
    PASSKEY_UNSUPPORTED: 'PASSKEYS ARE NOT SUPPORTED IN THIS BROWSER',
    CLOUD_ACCOUNT_NOT_CONNECTED: 'ENABLE CLOUD SAVE OR SIGN IN FIRST',
    PROFILE_TOKEN_REJECTED: CLOUD_SESSION_EXPIRED_MESSAGE,
    PROFILE_AUTH_REQUIRED: CLOUD_SESSION_EXPIRED_MESSAGE,
    CLOUD_SESSION_EXPIRED: CLOUD_SESSION_EXPIRED_MESSAGE,
    CLOUD_REQUEST_TIMEOUT: 'CLOUD REQUEST TIMED OUT · TRY AGAIN',
    PROGRESSION_RECEIPT_INVALID: 'RUN PROGRESSION RECEIPT WAS REJECTED',
    PROGRESSION_COMMIT_RATE_LIMITED: 'PROGRESSION SYNC IS BUSY · TRY AGAIN LATER',
    NotAllowedError: context === 'register' ? 'PASSKEY SETUP CANCELLED' : 'PASSKEY SIGN-IN CANCELLED',
    InvalidStateError: 'THIS PASSKEY IS ALREADY REGISTERED',
    SecurityError: 'PASSKEYS REQUIRE THE SECURE HTTPS GAME SITE'
  };
  return messages[code] || code.replace(/_/g, ' ');
}

function updateClockFromResponse(value, clientSentAt, clientReceivedAt) {
  const serverTime = Number(value?.reliability?.serverTime || value?.serverTime || 0);
  if (!serverTime) return;
  const clock = calculateClockSkew({ serverTime, clientSentAt, clientReceivedAt });
  if (!clock.valid) return;
  remoteState.serverTimeOffsetMs = clock.offsetMs;
  remoteState.serverRoundTripMs = clock.roundTripMs;
  remoteState.clockSkewWarning = clock.warning;
  writeRaw(REMOTE_CLOCK_KEY, JSON.stringify(clock));
}

async function remoteRequest(path, { method = 'GET', body = null, authenticated = true, operationId = '' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_REQUEST_TIMEOUT_MS);
  const clientSentAt = nowMs();
  try {
    const headers = {};
    if (body !== null) headers['content-type'] = 'application/json';
    headers['x-ka-device-id'] = getOrCreateDeviceId();
    headers['x-ka-client-time'] = String(clientSentAt);
    if (operationId) headers['x-ka-operation-id'] = String(operationId).slice(0, 180);
    if (authenticated) {
      const credentials = getRemoteCredentials();
      if (!credentials.valid) throw new CloudRemoteError('CLOUD_ACCOUNT_NOT_CONNECTED');
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
    updateClockFromResponse(value, clientSentAt, nowMs());
    if (!response.ok || value.ok !== true) {
      const remoteError = new CloudRemoteError(String(value.error || `HTTP_${response.status}`), response.status, value);
      if (authenticated) expireCloudAuthenticatedSession(remoteError);
      throw remoteError;
    }
    return value;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new CloudRemoteError('CLOUD_REQUEST_TIMEOUT', 0, {});
    }
    if (error instanceof TypeError) {
      throw new CloudRemoteError('CLOUD_SERVICE_UNAVAILABLE', 0, {});
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


function normalizeProgressionReceiptQueue(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const entry of value) {
    const receipt = entry?.receipt;
    const runId = String(receipt?.runId || '').slice(0, 120);
    if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(runId)) continue;
    byId.set(runId, {
      receipt: { ...receipt, runId },
      queuedAt: Math.max(0, Number(entry.queuedAt) || nowMs()),
      attempts: Math.max(0, Math.floor(Number(entry.attempts) || 0)),
      lastError: String(entry.lastError || '').slice(0, 120)
    });
  }
  return [...byId.values()]
    .sort((left, right) => left.queuedAt - right.queuedAt)
    .slice(-PROGRESSION_RECEIPT_QUEUE_LIMIT);
}

function readProgressionReceiptQueue() {
  try {
    return normalizeProgressionReceiptQueue(
      JSON.parse(readRaw(PROGRESSION_RECEIPT_QUEUE_KEY, '[]'))
    );
  } catch {
    return [];
  }
}

function writeProgressionReceiptQueue(value) {
  const normalized = normalizeProgressionReceiptQueue(value);
  writeRaw(PROGRESSION_RECEIPT_QUEUE_KEY, JSON.stringify(normalized));
  return normalized;
}

function queueProgressionReceipt(receipt) {
  const queue = readProgressionReceiptQueue();
  const runId = String(receipt?.runId || '').slice(0, 120);
  if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(runId)) return queue;
  if (queue.some((entry) => entry.receipt.runId === runId)) return queue;
  return writeProgressionReceiptQueue([
    ...queue,
    { receipt: { ...receipt, runId }, queuedAt: nowMs(), attempts: 0, lastError: '' }
  ]);
}

function applyAuthoritativeRemoteProgression(profile) {
  const validation = validateCloudProfile(profile);
  if (!validation.valid) {
    throw new Error(`REMOTE_PROFILE_INVALID:${validation.errors.join(',')}`);
  }
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  const incoming = validation.profile;
  const merged = mergeCloudProfiles(currentProfile, incoming, { now: nowMs() });
  const mergedWorld6 = JSON.parse(JSON.stringify(
    merged.progression?.world6
    || currentProfile?.progression?.world6
    || {}
  ));
  merged.progression = JSON.parse(JSON.stringify(incoming.progression || {}));
  if (mergedWorld6?.patch === 'gameplay6-r1-world-progression') {
    merged.progression.world6 = mergedWorld6;
    const progressionStorage = JSON.parse(
      merged.legacyStorage?.ka_progression_v1
      || incoming.legacyStorage?.ka_progression_v1
      || '{}'
    );
    progressionStorage.world6 = mergedWorld6;
    merged.legacyStorage.ka_progression_v1 = JSON.stringify(progressionStorage);
  }
  merged.updatedAt = Math.max(Number(merged.updatedAt || 0), nowMs());
  writeProfile(merged);
  applyProfileToLegacy(merged, { forceHydrate: true });
  currentProfile = merged;
  remoteLastFingerprint = merged.legacyFingerprint;
  return true;
}

async function drainProgressionReceiptQueue() {
  if (!getRemoteCredentials().valid) {
    return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  }
  const queue = readProgressionReceiptQueue();
  if (!queue.length) {
    return Object.freeze({ accepted: true, unchanged: true });
  }
  const entry = queue[0];
  const operationId = `progression-${entry.receipt.runId}`.slice(0, 160);
  try {
    const value = await remoteRequest('/profiles/progression/commit', {
      method: 'POST',
      operationId,
      body: { receipt: entry.receipt }
    });
    verifyRemoteProfileResponse(value);
    applyAuthoritativeRemoteProgression(value.profile);
    updateRemoteAccountState(value);
    remoteState.progressionProtected = value.progressionProtected === true;
    remoteState.lastProgressionReceiptProof = String(value.receipt?.proof || '').slice(0, 128);
    remoteState.lastProgressionReceiptId = String(value.receipt?.runId || '').slice(0, 120);
    remoteState.lastProgressionAt = Number(value.receipt?.committedAt || nowMs());
    writeProgressionReceiptQueue(queue.slice(1));
    const liveSeasonPoints = Math.max(0, Number(value.receipt?.live?.seasonPointsAward || 0));
    const economyCredits = Math.max(0, Number(value.receipt?.economy?.award?.credits || 0));
    const economySalvage = Math.max(0, Number(value.receipt?.economy?.award?.salvage || 0));
    statusMessage = value.idempotent
      ? 'PROGRESSION RECEIPT RECOVERED'
      : `PROGRESSION VERIFIED · +${Number(value.receipt?.award?.total || 0)} XP${economyCredits > 0 ? ` · +${economyCredits} CR` : ''}${economySalvage > 0 ? ` · +${economySalvage} SALVAGE` : ''}${liveSeasonPoints > 0 ? ` · +${liveSeasonPoints} SP` : ''}`;
    try {
      window.dispatchEvent(new CustomEvent('ka:postfinal9-economy-verified', {
        detail: {
          patch: value.receipt?.economy?.patch || 'post-final9-r1-economy-rewards-long-term-progression',
          idempotent: value.idempotent === true,
          economy: value.receipt?.economy || null,
          receiptId: value.receipt?.runId || ''
        }
      }));
    } catch {
      // Profile synchronization remains authoritative when events are unavailable.
    }
    refreshProfileUi();
    if (readProgressionReceiptQueue().length) queueMicrotask(() => {
      void drainProgressionReceiptQueue();
    });
    return Object.freeze({
      accepted: true,
      idempotent: value.idempotent === true,
      receipt: value.receipt || null
    });
  } catch (error) {
    const next = {
      ...entry,
      attempts: entry.attempts + 1,
      lastError: String(error?.code || error?.message || error).slice(0, 120)
    };
    writeProgressionReceiptQueue([next, ...queue.slice(1)]);
    statusMessage = `PROGRESSION PENDING · ${next.lastError}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, queued: true, reason: next.lastError });
  }
}

export function commitCloudProgressionReceipt(receipt) {
  const queue = queueProgressionReceipt(receipt);
  if (!getRemoteCredentials().valid) {
    return Promise.resolve(Object.freeze({
      accepted: false,
      queued: queue.length > 0,
      reason: 'CLOUD_NOT_CONNECTED'
    }));
  }
  return drainProgressionReceiptQueue();
}

function remoteOperationId(reason = 'sync') {
  const random = Math.random().toString(36).slice(2, 12);
  return `profile-${String(reason || 'sync').replace(/[^a-z0-9_-]/gi, '-').slice(0, 40)}-${Date.now().toString(36)}-${random}`;
}

function queueCurrentRemoteProfile(reason = 'sync') {
  if (!currentProfile || !getRemoteCredentials().valid) return readRemoteQueue();
  const existingQueue = readRemoteQueue();
  const existing = existingQueue.find((item) => item.fingerprint === currentProfile.legacyFingerprint);
  if (existing) {
    writeRemoteQueue(existingQueue);
    scheduleRemoteQueueRetry();
    return existingQueue;
  }
  const entry = createSyncQueueEntry({
    operationId: remoteOperationId(reason),
    profile: currentProfile,
    expectedCloudRevision: Math.max(0, Number(readRaw(REMOTE_REVISION_KEY, '0')) || 0),
    fingerprint: currentProfile.legacyFingerprint,
    checksum: profileChecksum(currentProfile),
    reason,
    now: nowMs()
  });
  const queue = writeRemoteQueue(enqueueSync(existingQueue, entry, { now: nowMs() }));
  statusMessage = `CLOUD CHANGE QUEUED · ${queue.length}`;
  scheduleRemoteQueueRetry(80);
  return queue;
}

function markRemotePending(error = null, entry = null) {
  const expired = expireCloudAuthenticatedSession(error);
  if (expired) return expired;
  remoteState.pending = true;
  remoteState.lastError = String(error?.code || error?.message || error || 'OFFLINE').slice(0, 120);
  writeRaw(REMOTE_PENDING_KEY, '1');
  if (entry) {
    const attempted = markSyncAttempt(entry, {
      now: nowMs(),
      error: remoteState.lastError,
      random: Math.random()
    });
    writeRemoteQueue(replaceSyncQueueEntry(readRemoteQueue(), attempted, { now: nowMs() }));
  }
  statusMessage = `CLOUD PENDING · ${remoteState.lastError}`;
  scheduleRemoteQueueRetry();
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
  if (account.accountType) remoteState.accountType = account.accountType === 'passkey' ? 'passkey' : 'guest';
  if (account.accountLabel) remoteState.accountLabel = String(account.accountLabel).slice(0, 48);
  if (Number.isFinite(Number(account.authVersion))) remoteState.authVersion = Math.max(0, Number(account.authVersion));
  if (Number.isFinite(Number(account.lastAuthenticatedAt))) remoteState.lastAuthenticatedAt = Math.max(0, Number(account.lastAuthenticatedAt));
  if (typeof account.progressionProtected === 'boolean') remoteState.progressionProtected = account.progressionProtected;
  if (Number.isFinite(Number(account.progressionReceiptCount))) remoteState.progressionReceiptCount = Math.max(0, Number(account.progressionReceiptCount));
  if (Number.isFinite(Number(account.lastProgressionAt))) remoteState.lastProgressionAt = Math.max(0, Number(account.lastProgressionAt));
  if (account.lastProgressionReceiptId) remoteState.lastProgressionReceiptId = String(account.lastProgressionReceiptId).slice(0, 120);
  if (Array.isArray(value.passkeys)) remoteState.passkeys = value.passkeys.map((entry) => ({ ...entry }));
  if (Array.isArray(value.devices)) remoteState.devices = value.devices.map((entry) => ({ ...entry }));
  if (Array.isArray(value.history)) remoteState.history = value.history.map((entry) => ({ ...entry }));
  if (Array.isArray(value.activity)) remoteState.activity = value.activity.map((entry) => ({ ...entry }));
  if (remoteState.cloudRevision >= 0) writeRaw(REMOTE_REVISION_KEY, String(remoteState.cloudRevision));
}


function verifyRemoteProfileResponse(value) {
  const expectedChecksum = String(value?.profileChecksum || value?.account?.profileChecksum || '');
  const integrity = verifyProfileIntegrity(value?.profile, expectedChecksum, profileChecksum);
  if (value?.checksumVerified !== true || !integrity.valid) {
    remoteState.checksumVerified = false;
    throw new CloudRemoteError('CLOUD_CHECKSUM_VERIFICATION_FAILED', 409, { integrity, value });
  }
  remoteState.checksumVerified = true;
  return integrity;
}


function webAuthnAvailable() {
  return typeof PublicKeyCredential !== 'undefined'
    && typeof navigator !== 'undefined'
    && Boolean(navigator.credentials);
}

function base64UrlToBytes(value) {
  const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = text + '='.repeat((4 - text.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64Url(value) {
  const bytes = value instanceof Uint8Array
    ? value
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array();
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodePasskeyCreationOptions(value = {}) {
  const options = JSON.parse(JSON.stringify(value || {}));
  options.challenge = base64UrlToBytes(options.challenge);
  if (options.user?.id) options.user.id = base64UrlToBytes(options.user.id);
  const parameters = Array.isArray(options.pubKeyCredParams) ? options.pubKeyCredParams : [];
  const algorithms = new Set(parameters.map((entry) => Number(entry?.alg)));
  if (!algorithms.has(-7)) parameters.push({ type: 'public-key', alg: -7 });
  if (!algorithms.has(-257)) parameters.push({ type: 'public-key', alg: -257 });
  options.pubKeyCredParams = parameters;
  options.excludeCredentials = Array.isArray(options.excludeCredentials)
    ? options.excludeCredentials.map((entry) => ({ ...entry, id: base64UrlToBytes(entry.id) }))
    : [];
  return options;
}

function decodePasskeyRequestOptions(value = {}) {
  const options = JSON.parse(JSON.stringify(value || {}));
  options.challenge = base64UrlToBytes(options.challenge);
  options.allowCredentials = Array.isArray(options.allowCredentials)
    ? options.allowCredentials.map((entry) => ({ ...entry, id: base64UrlToBytes(entry.id) }))
    : [];
  return options;
}

function serializePublicKeyCredential(credential) {
  if (!credential || credential.type !== 'public-key') throw new Error('PASSKEY_CREDENTIAL_INVALID');
  const response = credential.response || {};
  const value = {
    id: String(credential.id || ''),
    rawId: bytesToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || null,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: bytesToBase64Url(response.clientDataJSON)
    }
  };
  if (response.attestationObject) {
    value.response.attestationObject = bytesToBase64Url(response.attestationObject);
    value.response.transports = response.getTransports?.() || [];
  }
  if (response.authenticatorData) value.response.authenticatorData = bytesToBase64Url(response.authenticatorData);
  if (response.signature) value.response.signature = bytesToBase64Url(response.signature);
  if (response.userHandle) value.response.userHandle = bytesToBase64Url(response.userHandle);
  return value;
}

function cleanAccountLabel(value) {
  return String(value || 'Khadija’s Arena Player')
    .trim()
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 48) || 'Khadija’s Arena Player';
}

export async function upgradeCloudAccountToPasskey(name = 'Khadija’s Arena Player') {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  if (!webAuthnAvailable()) {
    statusMessage = 'PASSKEYS ARE NOT SUPPORTED IN THIS BROWSER';
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: 'PASSKEY_UNSUPPORTED' });
  }
  const label = cleanAccountLabel(name);
  statusMessage = 'PREPARING PASSKEY…';
  refreshProfileUi();
  try {
    await syncCloudProfileRemote('before-passkey-upgrade', { force: true });
    const optionsValue = await remoteRequest('/profiles/auth/passkey/register/options', {
      method: 'POST',
      body: { name: label }
    });
    const credential = await navigator.credentials.create({
      publicKey: decodePasskeyCreationOptions(optionsValue.options)
    });
    if (!credential) throw new Error('PASSKEY_CREATION_CANCELLED');
    const verified = await remoteRequest('/profiles/auth/passkey/register/verify', {
      method: 'POST',
      body: { name: label, credential: serializePublicKeyCredential(credential) }
    });
    updateRemoteAccountState(verified);
    remoteState.passkeys = Array.isArray(verified.passkeys) ? verified.passkeys.map((entry) => ({ ...entry })) : remoteState.passkeys;
    statusMessage = verified.upgraded ? 'CLOUD ACCOUNT UPGRADED TO PASSKEY' : 'PASSKEY ADDED';
    toast?.(verified.upgraded ? 'PERMANENT PASSKEY ACCOUNT READY' : 'PASSKEY ADDED', '#22ff88', 1900);
    refreshProfileUi();
    dispatchCloudAuthChanged({
      authenticated: true,
      accountId: verified.account?.accountId || getRemoteCredentials().accountId,
      accountType: 'passkey',
      reason: verified.upgraded ? 'passkey-upgraded' : 'passkey-added'
    });
    return Object.freeze({ accepted: true, upgraded: verified.upgraded === true, account: verified.account });
  } catch (error) {
    const reason = String(error?.code || error?.name || error?.message || error).slice(0, 120);
    const message = getCloudProfileErrorMessage(error, 'register');
    statusMessage = message === 'PASSKEY SETUP CANCELLED'
      ? message
      : `PASSKEY SETUP FAILED · ${message}`;
    toast?.(statusMessage, '#ffaa00', 2600);
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason, message });
  }
}

export async function signInCloudAccountWithPasskey(accountId, { reload = true } = {}) {
  if (!webAuthnAvailable()) {
    statusMessage = 'PASSKEYS ARE NOT SUPPORTED IN THIS BROWSER';
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: 'PASSKEY_UNSUPPORTED' });
  }
  const cleanAccount = String(accountId || '').trim();
  if (!/^cloud-[a-f0-9]{32}$/i.test(cleanAccount)) {
    statusMessage = 'ENTER A VALID CLOUD ACCOUNT ID';
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: 'PROFILE_ACCOUNT_ID_INVALID', message: statusMessage });
  }
  const credentials = getRemoteCredentials();
  if (
    credentials.valid
    && credentials.accountId.toLowerCase() === cleanAccount.toLowerCase()
    && remoteState.accountType !== 'passkey'
  ) {
    statusMessage = 'UPGRADE THIS GUEST ACCOUNT BEFORE SIGNING IN';
    toast?.(statusMessage, '#ffaa00', 2500);
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: 'PASSKEY_ACCOUNT_NOT_ENABLED', message: statusMessage });
  }
  statusMessage = 'WAITING FOR PASSKEY…';
  refreshProfileUi();
  try {
    const optionsValue = await remoteRequest('/profiles/auth/passkey/login/options', {
      method: 'POST',
      authenticated: false,
      body: { accountId: cleanAccount }
    });
    const credential = await navigator.credentials.get({
      publicKey: decodePasskeyRequestOptions(optionsValue.options)
    });
    if (!credential) throw new Error('PASSKEY_SIGNIN_CANCELLED');
    const verified = await remoteRequest('/profiles/auth/passkey/login/verify', {
      method: 'POST',
      authenticated: false,
      body: {
        accountId: cleanAccount,
        credential: serializePublicKeyCredential(credential),
        deviceId: getOrCreateDeviceId(),
        deviceName: getDeviceName()
      }
    });
    verifyRemoteProfileResponse(verified);
    saveRemoteCredentials(verified.account, verified.token);
    updateRemoteAccountState(verified);
    remoteState.passkeys = Array.isArray(verified.passkeys) ? verified.passkeys.map((entry) => ({ ...entry })) : [];
    replaceWithRemoteProfile(verified.profile, { forceHydrate: true });
    removeRaw(REMOTE_TOMBSTONE_KEY);
    writeRemoteQueue([]);
    remoteState.lastSuccessfulSyncAt = nowMs();
    writeRaw(REMOTE_LAST_SUCCESS_KEY, String(remoteState.lastSuccessfulSyncAt));
    statusMessage = 'PASSKEY SIGN-IN COMPLETE · RELOADING';
    toast?.('CLOUD ACCOUNT SIGNED IN', '#22ff88', 1800);
    refreshProfileUi();
    dispatchCloudAuthChanged({
      authenticated: true,
      accountId: verified.account?.accountId || cleanAccount,
      accountType: 'passkey',
      reason: 'passkey-signin'
    });
    if (reload && typeof location !== 'undefined') setTimeout(() => location.reload(), 650);
    return Object.freeze({ accepted: true, account: verified.account });
  } catch (error) {
    const reason = String(error?.code || error?.name || error?.message || error).slice(0, 120);
    const message = getCloudProfileErrorMessage(error, 'login');
    statusMessage = message === 'PASSKEY SIGN-IN CANCELLED'
      ? message
      : `PASSKEY SIGN-IN FAILED · ${message}`;
    toast?.(statusMessage, '#ffaa00', 2800);
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason, message });
  }
}

export async function refreshCloudAuthenticatedSession({ merge = true } = {}) {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  statusMessage = 'REFRESHING AUTHENTICATED SESSION…';
  refreshProfileUi();
  try {
    const value = await remoteRequest('/profiles/auth/session');
    verifyRemoteProfileResponse(value);
    updateRemoteAccountState(value);
    remoteState.passkeys = Array.isArray(value.passkeys) ? value.passkeys.map((entry) => ({ ...entry })) : remoteState.passkeys;
    if (merge) applyRemoteProfile(value.profile, { forceHydrate: false });
    statusMessage = remoteState.accountType === 'passkey' ? 'PASSKEY SESSION REFRESHED' : 'GUEST SESSION REFRESHED';
    refreshProfileUi();
    return Object.freeze({ accepted: true, account: value.account });
  } catch (error) {
    const expired = expireCloudAuthenticatedSession(error);
    if (expired) return expired;
    statusMessage = `SESSION REFRESH FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function signOutCloudAccount() {
  const credentials = getRemoteCredentials();
  if (!credentials.valid) return Object.freeze({ accepted: true, alreadySignedOut: true });
  if (remoteState.accountType !== 'passkey') {
    statusMessage = 'UPGRADE TO PASSKEY BEFORE SIGNING OUT';
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: 'PASSKEY_ACCOUNT_NOT_ENABLED' });
  }
  try {
    await remoteRequest('/profiles/auth/signout', { method: 'POST', body: {} });
  } catch {
    // Local sign-out must remain available when the Worker is unreachable.
  }
  clearRemoteCredentials();
  statusMessage = 'SIGNED OUT · LOCAL PROFILE KEPT';
  toast?.('SIGNED OUT · LOCAL SAVE KEPT', '#ffaa00', 1700);
  refreshProfileUi();
  dispatchCloudAuthChanged({ authenticated: false, accountId: credentials.accountId, reason: 'signout' });
  return Object.freeze({ accepted: true });
}

export async function refreshCloudPasskeys() {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  try {
    const value = await remoteRequest('/profiles/auth/passkeys');
    updateRemoteAccountState(value);
    remoteState.passkeys = Array.isArray(value.passkeys) ? value.passkeys.map((entry) => ({ ...entry })) : [];
    refreshProfileUi();
    return Object.freeze({ accepted: true, passkeys: remoteState.passkeys });
  } catch (error) {
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function renameCloudPasskey(credentialId, name) {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  try {
    const value = await remoteRequest('/profiles/auth/passkeys/name', {
      method: 'POST',
      body: { credentialId: String(credentialId || ''), name: cleanAccountLabel(name) }
    });
    updateRemoteAccountState(value);
    remoteState.passkeys = Array.isArray(value.passkeys) ? value.passkeys.map((entry) => ({ ...entry })) : [];
    statusMessage = 'PASSKEY NAME UPDATED';
    refreshProfileUi();
    return Object.freeze({ accepted: true });
  } catch (error) {
    statusMessage = `PASSKEY RENAME FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
}

export async function revokeCloudPasskey(credentialId) {
  if (!getRemoteCredentials().valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  try {
    const value = await remoteRequest('/profiles/auth/passkeys/revoke', {
      method: 'POST',
      body: { credentialId: String(credentialId || '') }
    });
    updateRemoteAccountState(value);
    remoteState.passkeys = Array.isArray(value.passkeys) ? value.passkeys.map((entry) => ({ ...entry })) : [];
    statusMessage = 'PASSKEY REVOKED';
    refreshProfileUi();
    return Object.freeze({ accepted: true });
  } catch (error) {
    statusMessage = `PASSKEY REVOKE FAILED · ${String(error?.message || error).slice(0, 80)}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, reason: String(error?.message || error) });
  }
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
    verifyRemoteProfileResponse(value);
    saveRemoteCredentials(value.account, value.token);
    updateRemoteAccountState(value);
    remoteLastFingerprint = currentProfile.legacyFingerprint;
    remoteState.lastSyncAt = nowMs();
    remoteState.lastSuccessfulSyncAt = nowMs();
    writeRaw(REMOTE_LAST_SUCCESS_KEY, String(remoteState.lastSuccessfulSyncAt));
    removeRaw(REMOTE_TOMBSTONE_KEY);
    writeRemoteQueue([]);
    statusMessage = 'CLOUD GUEST CONNECTED · CHECKSUM VERIFIED';
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

async function drainRemoteSyncQueue(reason = 'queue') {
  const credentials = getRemoteCredentials();
  if (!credentials.valid) return Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' });
  if (remoteSyncPromise) return remoteSyncPromise;
  let queue = readRemoteQueue();
  if (!queue.length) {
    remoteState.pending = false;
    remoteState.queuedChanges = 0;
    remoteState.retryAt = 0;
    writeRaw(REMOTE_PENDING_KEY, '0');
    refreshProfileUi();
    return Object.freeze({ accepted: true, unchanged: true, cloudRevision: remoteState.cloudRevision });
  }
  const lease = acquireRemoteLease();
  if (!lease.acquired) {
    remoteState.pending = true;
    statusMessage = 'CLOUD QUEUED · ANOTHER TAB IS SYNCING';
    const wait = Math.max(100, Math.min(CLOUD_SYNC_LEASE_MS, lease.lease.expiresAt - nowMs() + 50));
    scheduleRemoteQueueRetry(wait);
    refreshProfileUi();
    return Object.freeze({ accepted: false, queued: true, reason: 'SYNC_LEASE_HELD', leaseOwner: lease.lease.ownerId });
  }
  const entry = peekReadySync(queue, nowMs());
  if (!entry) {
    statusMessage = 'CLOUD QUEUED · WAITING TO RETRY';
    scheduleRemoteQueueRetry();
    releaseRemoteLease();
    refreshProfileUi();
    return Object.freeze({ accepted: false, queued: true, reason: 'SYNC_BACKOFF_ACTIVE', retryAt: nextSyncRetryAt(queue, nowMs()) });
  }

  remoteState.syncing = true;
  remoteState.lastOperationId = entry.operationId;
  statusMessage = `SYNCING CLOUD PROFILE · ATTEMPT ${entry.attempts + 1}`;
  startRemoteLeaseHeartbeat();
  refreshProfileUi();

  remoteSyncPromise = remoteRequest('/profiles/sync', {
    method: 'POST',
    operationId: entry.operationId,
    body: {
      operationId: entry.operationId,
      expectedCloudRevision: entry.expectedCloudRevision,
      profileChecksum: entry.checksum,
      profile: entry.profile
    }
  }).then((value) => {
    const expectedChecksum = String(value.profileChecksum || value.account?.profileChecksum || '');
    const integrity = verifyProfileIntegrity(value.profile, expectedChecksum, profileChecksum);
    if (value.checksumVerified !== true || !integrity.valid) {
      throw new CloudRemoteError('CLOUD_CHECKSUM_VERIFICATION_FAILED', 409, { integrity, value });
    }
    const remoteChangedLocal = value.progressionProtected === true
      ? applyAuthoritativeRemoteProgression(value.profile)
      : applyRemoteProfile(value.profile, { forceHydrate: false });
    remoteState.progressionProtected = value.progressionProtected === true;
    remoteState.connected = true;
    remoteState.accountId = value.account?.accountId || credentials.accountId;
    remoteState.cloudRevision = Math.max(0, Number(value.account?.cloudRevision) || 0);
    updateRemoteAccountState(value);
    remoteState.lastSyncAt = nowMs();
    remoteState.lastSuccessfulSyncAt = nowMs();
    remoteState.conflict = value.conflict === true;
    remoteState.lastError = '';
    remoteState.checksumVerified = true;
    writeRaw(REMOTE_LAST_SUCCESS_KEY, String(remoteState.lastSuccessfulSyncAt));
    writeRaw(REMOTE_REVISION_KEY, String(remoteState.cloudRevision));
    queue = writeRemoteQueue(completeSyncQueue(readRemoteQueue(), entry.operationId, { now: nowMs() }));
    remoteLastFingerprint = currentProfile.legacyFingerprint;
    statusMessage = value.conflict
      ? (remoteChangedLocal ? 'CLOUD CONFLICT MERGED · CHECKSUM VERIFIED' : 'CLOUD CONFLICT RESOLVED · CHECKSUM VERIFIED')
      : (value.idempotent || value.idempotentRecovered
        ? 'CLOUD RETRY RECOVERED · CHECKSUM VERIFIED'
        : 'CLOUD PROFILE SYNCED · CHECKSUM VERIFIED');
    refreshProfileUi();
    if (queue.length) scheduleRemoteQueueRetry(80);
    return Object.freeze({
      accepted: true,
      conflict: value.conflict === true,
      changed: value.changed === true,
      idempotent: value.idempotent === true || value.idempotentRecovered === true,
      checksumVerified: true,
      cloudRevision: remoteState.cloudRevision,
      queuedChanges: queue.length
    });
  }).catch((error) => {
    const expired = expireCloudAuthenticatedSession(error);
    if (expired) return expired;
    if (['PROFILE_ACCOUNT_DELETED', 'PROFILE_ACCOUNT_NOT_FOUND'].includes(String(error?.code || error?.message || ''))) {
      const accountId = credentials.accountId;
      const tombstone = error?.payload?.tombstone || {
        accountId,
        deletedAt: Number(error?.payload?.deletedAt) || nowMs(),
        deletionId: String(error?.payload?.deletionId || `remote-delete-${Date.now()}`),
        deviceId: getOrCreateDeviceId()
      };
      saveLocalTombstone(tombstone);
      clearRemoteCredentials();
      statusMessage = 'CLOUD ACCOUNT DELETED · STALE DEVICE BLOCKED';
      refreshProfileUi();
      return Object.freeze({ accepted: false, deleted: true, reason: String(error?.code || error?.message || error) });
    }
    remoteState.checksumVerified = false;
    markRemotePending(error, entry);
    return Object.freeze({ accepted: false, queued: true, reason: String(error?.code || error?.message || error), retryAt: remoteState.retryAt });
  }).finally(() => {
    remoteState.syncing = false;
    remoteSyncPromise = null;
    releaseRemoteLease();
    refreshProfileUi();
  });
  return remoteSyncPromise;
}

export function syncCloudProfileRemote(reason = 'manual', { force = false } = {}) {
  const credentials = getRemoteCredentials();
  if (!credentials.valid) return Promise.resolve(Object.freeze({ accepted: false, reason: 'CLOUD_NOT_CONNECTED' }));
  syncCloudProfile(`remote-${reason}`);
  const queue = readRemoteQueue();
  if (force || remoteState.pending || remoteLastFingerprint !== currentProfile.legacyFingerprint) {
    queueCurrentRemoteProfile(reason);
  }
  return drainRemoteSyncQueue(reason);
}

export async function retryCloudSyncQueue() {
  const queue = readRemoteQueue();
  if (!queue.length && getRemoteCredentials().valid && currentProfile) queueCurrentRemoteProfile('manual-retry');
  const reset = readRemoteQueue().map((entry) => ({ ...entry, nextAttemptAt: nowMs() }));
  writeRemoteQueue(reset);
  clearRemoteRetryTimer();
  return drainRemoteSyncQueue('manual-retry');
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
  const queue = readRemoteQueue();
  const lease = readRemoteLease();
  remoteState.queuedChanges = queue.length;
  remoteState.retryAt = nextSyncRetryAt(queue, nowMs());
  remoteState.leaseOwner = lease.ownerId;
  remoteState.leaseExpiresAt = lease.expiresAt;
  remoteState.activeSyncTab = lease.ownerId === getRemoteTabId() && lease.expiresAt > nowMs();
  setText('cloud-profile-queue-count', queue.length);
  setText('cloud-profile-retry-at', remoteState.retryAt ? formatTimestamp(remoteState.retryAt) : 'NOT SCHEDULED');
  setText('cloud-profile-last-success', formatTimestamp(remoteState.lastSuccessfulSyncAt));
  setText('cloud-profile-sync-tab', remoteState.activeSyncTab ? 'THIS TAB' : (lease.ownerId && lease.expiresAt > nowMs() ? `OTHER TAB · ${shortProfileId(lease.ownerId)}` : 'IDLE'));
  setText('cloud-profile-checksum-status', remoteState.checksumVerified ? 'VERIFIED' : 'NOT VERIFIED');
  const offset = Math.round(remoteState.serverTimeOffsetMs || 0);
  setText('cloud-profile-clock-status', remoteState.serverRoundTripMs ? `${offset >= 0 ? '+' : ''}${offset} ms offset · ${remoteState.serverRoundTripMs} ms RTT${remoteState.clockSkewWarning ? ' · WARNING' : ''}` : 'NOT MEASURED');
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
    verifyRemoteProfileResponse(value);
    saveRemoteCredentials(value.account, value.token);
    updateRemoteAccountState(value);
    applyRemoteProfile(value.profile, { forceHydrate: true });
    removeRaw(REMOTE_TOMBSTONE_KEY);
    writeRemoteQueue([]);
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
    const credentials = getRemoteCredentials();
    const value = await remoteRequest('/profiles/account', { method: 'DELETE' });
    saveLocalTombstone(value.tombstone || {
      accountId: credentials.accountId,
      deletedAt: Number(value.deletedAt) || nowMs(),
      deletionId: String(value.deletionId || `delete-${Date.now()}`),
      deviceId: getOrCreateDeviceId()
    });
    clearRemoteCredentials();
    removeRaw(REMOTE_ACCOUNT_HINT_KEY);
    statusMessage = 'CLOUD ACCOUNT DELETED · TOMBSTONE ACTIVE · LOCAL PROFILE KEPT';
    toast?.('CLOUD ACCOUNT DELETED · LOCAL SAVE KEPT', '#ffaa00', 2000);
    refreshProfileUi();
    return Object.freeze({ accepted: true });
  } catch (error) {
    const expired = expireCloudAuthenticatedSession(error);
    if (expired) return expired;
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
    // Sequential requests intentionally stop after the first permanent auth rejection.
    // This prevents a stale token from producing a burst of four parallel 401 responses.
    const devices = await remoteRequest('/profiles/devices');
    updateRemoteAccountState(devices);
    const history = await remoteRequest('/profiles/history');
    updateRemoteAccountState(history);
    const activity = await remoteRequest('/profiles/activity');
    updateRemoteAccountState(activity);
    const passkeys = await remoteRequest('/profiles/auth/passkeys');
    updateRemoteAccountState(passkeys);
    if (!silent) statusMessage = 'CLOUD SECURITY REFRESHED';
    refreshProfileUi();
    return Object.freeze({ accepted: true, devices: remoteState.devices, history: remoteState.history, activity: remoteState.activity });
  } catch (error) {
    const expired = expireCloudAuthenticatedSession(error);
    if (expired) return expired;
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
    verifyRemoteProfileResponse(value);
    saveRemoteCredentials(value.account, value.token);
    updateRemoteAccountState(value);
    replaceWithRemoteProfile(value.profile, { forceHydrate: true });
    removeRaw(REMOTE_TOMBSTONE_KEY);
    writeRemoteQueue([]);
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
    verifyRemoteProfileResponse(value);
    updateRemoteAccountState(value);
    replaceWithRemoteProfile(value.profile, { forceHydrate: true });
    writeRemoteQueue([]);
    remoteState.lastSyncAt = nowMs();
    remoteState.lastSuccessfulSyncAt = nowMs();
    writeRaw(REMOTE_LAST_SUCCESS_KEY, String(remoteState.lastSuccessfulSyncAt));
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
  if (getRemoteCredentials().valid) queueCurrentRemoteProfile(`local-${reason}`);
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
      option.textContent = `Cloud rev ${entry.revision} · ${entry.reason || 'snapshot'} · ${entry.integrity || 'unverified'} · ${formatTimestamp(entry.createdAt)}`;
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
  const authStatus = remoteState.accountType === 'passkey'
    ? `PASSKEY ACCOUNT · PROTECTED PROGRESSION · ${remoteState.passkeys.length} CREDENTIAL${remoteState.passkeys.length === 1 ? '' : 'S'}`
    : getRemoteCredentials().valid
      ? 'CLOUD GUEST · UPGRADE AVAILABLE'
      : 'SIGNED OUT';
  setText('cloud-profile-auth-status', authStatus);
  setText('cloud-profile-auth-support', remoteState.webAuthnSupported ? 'SUPPORTED' : 'NOT SUPPORTED');
  setText('cloud-profile-auth-last', formatTimestamp(remoteState.lastAuthenticatedAt));

  const accountLabelInput = document.getElementById('cloud-profile-auth-label-input');
  if (accountLabelInput && document.activeElement !== accountLabelInput) {
    accountLabelInput.value = remoteState.accountLabel || 'Khadija’s Arena Player';
  }
  const signInAccountInput = document.getElementById('cloud-profile-passkey-account-input');
  if (signInAccountInput && document.activeElement !== signInAccountInput) {
    const accountHint = getRemoteCredentials().accountId || String(readRaw(REMOTE_ACCOUNT_HINT_KEY, '') || '');
    if (accountHint) signInAccountInput.value = accountHint;
  }
  const upgradeButton = document.getElementById('cloud-profile-passkey-upgrade-btn');
  if (upgradeButton) upgradeButton.textContent = remoteState.accountType === 'passkey' ? 'Add Another Passkey' : 'Upgrade Guest Account to Passkey';

  const passkeySelect = document.getElementById('cloud-profile-passkey-select');
  if (passkeySelect) {
    const selected = passkeySelect.value;
    passkeySelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = remoteState.passkeys.length ? 'Select registered passkey' : 'No passkeys registered';
    passkeySelect.append(placeholder);
    remoteState.passkeys.forEach((passkey) => {
      const option = document.createElement('option');
      option.value = passkey.credentialId;
      option.textContent = `${passkey.name || 'Passkey'} · ${passkey.lastUsedAt ? `used ${formatTimestamp(passkey.lastUsedAt)}` : 'not used yet'}`;
      passkeySelect.append(option);
    });
    if ([...passkeySelect.options].some((option) => option.value === selected)) passkeySelect.value = selected;
  }

  const passkeyList = document.getElementById('cloud-profile-passkey-list');
  if (passkeyList) {
    passkeyList.textContent = remoteState.passkeys.length
      ? remoteState.passkeys.map((entry) => `${entry.name || 'Passkey'} · ${entry.transports?.join(', ') || 'platform/synced'} · ${entry.lastUsedAt ? formatTimestamp(entry.lastUsedAt) : 'never used'}`).join('\n')
      : 'No passkeys registered.';
  }
}


function setCloudAdvancedOpen(open, { focusId = '' } = {}) {
  cloudAdvancedOpen = open === true;
  document.querySelectorAll('.ka-cloud-advanced-row').forEach((row) => {
    row.hidden = !cloudAdvancedOpen;
  });
  document.querySelectorAll('.ka-cloud-advanced-control').forEach((element) => {
    element.hidden = !cloudAdvancedOpen;
  });
  const button = document.getElementById('cloud-profile-manage-btn');
  if (button) button.textContent = cloudAdvancedOpen ? 'Hide Account Management' : 'Manage Cloud Account';
  document.documentElement.dataset.kaCloudAdvanced = cloudAdvancedOpen ? 'open' : 'closed';
  if (cloudAdvancedOpen && focusId) {
    requestAnimationFrame(() => {
      const target = document.getElementById(focusId);
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      target?.focus?.({ preventScroll: true });
    });
  }
  return cloudAdvancedOpen;
}

function simpleCloudState(credentials) {
  if (remoteState.syncing) return { label: 'SYNCING…', tone: 'loading' };
  if (!credentials.valid) return { label: 'LOCAL SAVE ONLY', tone: 'local' };
  if (remoteState.pending || readRemoteQueue().length) return { label: 'NEEDS ATTENTION', tone: 'warn' };
  if (remoteState.lastError) return { label: 'OFFLINE OR UNAVAILABLE', tone: 'warn' };
  if (remoteState.checksumVerified) return { label: 'SAVED TO CLOUD', tone: 'pass' };
  return { label: 'CLOUD CONNECTED', tone: 'pass' };
}

function handleCloudAccountAction() {
  const credentials = getRemoteCredentials();
  if (!credentials.valid) {
    void registerCloudGuestAccount();
    return;
  }
  if (remoteState.accountType !== 'passkey') {
    statusMessage = 'UPGRADE THIS GUEST ACCOUNT TO USE PASSKEY SIGN-IN';
    setCloudAdvancedOpen(true, { focusId: 'cloud-profile-passkey-upgrade-btn' });
    refreshProfileUi();
    return;
  }
  setCloudAdvancedOpen(true, { focusId: 'cloud-profile-auth-row' });
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
  const simpleState = simpleCloudState(credentials);
  setText('cloud-profile-simple-state', simpleState.label);
  setText('cloud-profile-simple-last', remoteState.lastSuccessfulSyncAt ? formatTimestamp(remoteState.lastSuccessfulSyncAt) : 'Not synced yet');
  setText('cloud-profile-simple-account', credentials.valid
    ? (remoteState.accountType === 'passkey' ? 'Passkey account' : 'Guest cloud account')
    : 'Local guest profile');
  const simpleStateElement = document.getElementById('cloud-profile-simple-state');
  if (simpleStateElement) simpleStateElement.dataset.tone = simpleState.tone;
  const accountAction = document.getElementById('cloud-profile-account-action-btn');
  if (accountAction) {
    accountAction.textContent = !credentials.valid
      ? 'Enable Cloud Save'
      : remoteState.accountType === 'passkey'
        ? 'Account & Sign-In'
        : 'Upgrade Account';
    accountAction.disabled = remoteState.syncing;
  }
  const manageButton = document.getElementById('cloud-profile-manage-btn');
  if (manageButton) manageButton.disabled = remoteState.syncing;
  const enableButton = document.getElementById('cloud-profile-enable-btn');
  if (enableButton) enableButton.style.display = credentials.valid ? 'none' : '';
  ['cloud-profile-sync-btn', 'cloud-profile-link-create-btn', 'cloud-profile-server-export-btn', 'cloud-profile-delete-btn', 'cloud-profile-security-refresh-btn', 'cloud-profile-device-name-btn', 'cloud-profile-revoke-others-btn', 'cloud-profile-rotate-token-btn', 'cloud-profile-recovery-generate-btn', 'cloud-profile-history-restore-btn', 'cloud-profile-retry-queue-btn', 'cloud-profile-passkey-upgrade-btn', 'cloud-profile-auth-refresh-btn', 'cloud-profile-auth-signout-btn', 'cloud-profile-passkey-rename-btn', 'cloud-profile-passkey-revoke-btn'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.disabled = !credentials.valid || remoteState.syncing;
  });
  const passkeyUpgrade = document.getElementById('cloud-profile-passkey-upgrade-btn');
  if (passkeyUpgrade) passkeyUpgrade.disabled = !credentials.valid || remoteState.syncing || !remoteState.webAuthnSupported;
  const passkeySignIn = document.getElementById('cloud-profile-passkey-signin-btn');
  if (passkeySignIn) passkeySignIn.disabled = remoteState.syncing || !remoteState.webAuthnSupported;
  const authSignOut = document.getElementById('cloud-profile-auth-signout-btn');
  if (authSignOut) authSignOut.disabled = !credentials.valid || remoteState.syncing || remoteState.accountType !== 'passkey';
  const linkInput = document.getElementById('cloud-profile-link-input');
  const consumeButton = document.getElementById('cloud-profile-link-consume-btn');
  if (linkInput) linkInput.disabled = remoteState.syncing;
  if (consumeButton) consumeButton.disabled = remoteState.syncing;
  renderCloudSecurityUi();
  setCloudAdvancedOpen(cloudAdvancedOpen);
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

function bindProfileUi() {
  document.getElementById('cloud-profile-manage-btn')?.addEventListener('click', () => {
    setCloudAdvancedOpen(!cloudAdvancedOpen);
  });
  document.getElementById('cloud-profile-account-action-btn')?.addEventListener('click', () => {
    handleCloudAccountAction();
  });
  document.getElementById('cloud-profile-export-btn')?.addEventListener('click', () => {
    exportCloudProfile();
  });
  document.getElementById('cloud-profile-import-btn')?.addEventListener('click', () => {
    document.getElementById('cloud-profile-import-file')?.click();
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
  document.getElementById('cloud-profile-passkey-upgrade-btn')?.addEventListener('click', () => {
    const input = document.getElementById('cloud-profile-auth-label-input');
    void upgradeCloudAccountToPasskey(input?.value || remoteState.accountLabel);
  });
  document.getElementById('cloud-profile-passkey-signin-btn')?.addEventListener('click', () => {
    const input = document.getElementById('cloud-profile-passkey-account-input');
    const accountId = String(input?.value || '').trim();
    if (!accountId) {
      statusMessage = 'ENTER THE CLOUD ACCOUNT ID TO SIGN IN';
      refreshProfileUi();
      return;
    }
    void signInCloudAccountWithPasskey(accountId, { reload: true });
  });
  document.getElementById('cloud-profile-auth-refresh-btn')?.addEventListener('click', () => {
    void refreshCloudAuthenticatedSession({ merge: true });
  });
  document.getElementById('cloud-profile-auth-signout-btn')?.addEventListener('click', () => {
    if (!window.confirm('Sign out of cloud sync on this browser? The local save will remain.')) return;
    void signOutCloudAccount();
  });
  document.getElementById('cloud-profile-passkey-rename-btn')?.addEventListener('click', () => {
    const select = document.getElementById('cloud-profile-passkey-select');
    const input = document.getElementById('cloud-profile-passkey-name-input');
    if (!select?.value) return;
    void renameCloudPasskey(select.value, input?.value || 'Khadija’s Arena Passkey');
  });
  document.getElementById('cloud-profile-passkey-revoke-btn')?.addEventListener('click', () => {
    const select = document.getElementById('cloud-profile-passkey-select');
    if (!select?.value) return;
    if (!window.confirm('Revoke this passkey? Keep another passkey or an active recovery code before removing the last credential.')) return;
    void revokeCloudPasskey(select.value);
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
  document.getElementById('cloud-profile-retry-queue-btn')?.addEventListener('click', () => {
    void retryCloudSyncQueue();
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
    accountType: remoteState.connected ? remoteState.accountType : currentProfile.accountType,
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
    authentication: remoteState.connected ? (remoteState.accountType === 'passkey' ? 'passkey-session' : 'guest-token') : false,
    remote: {
      connected: remoteState.connected,
      syncing: remoteState.syncing,
      pending: remoteState.pending,
      conflict: remoteState.conflict,
      accountId: remoteState.accountId,
      accountHint: String(readRaw(REMOTE_ACCOUNT_HINT_KEY, '') || ''),
      cloudRevision: remoteState.cloudRevision,
      lastSyncAt: remoteState.lastSyncAt,
      lastError: remoteState.lastError,
      deviceId: getOrCreateDeviceId(),
      deviceName: getDeviceName(),
      devices: remoteState.devices.map((entry) => ({ ...entry })),
      history: remoteState.history.map((entry) => ({ ...entry })),
      activity: remoteState.activity.map((entry) => ({ ...entry })),
      recoveryEnabled: remoteState.recoveryEnabled,
      auth: {
        patch: CLOUD_AUTH_PATCH,
        accountType: remoteState.accountType,
        accountLabel: remoteState.accountLabel,
        authVersion: remoteState.authVersion,
        lastAuthenticatedAt: remoteState.lastAuthenticatedAt,
        webAuthnSupported: remoteState.webAuthnSupported,
        passkeys: remoteState.passkeys.map((entry) => ({ ...entry }))
      },
      reliability: buildReliabilitySnapshot({
        queue: readRemoteQueue(),
        lease: readRemoteLease(),
        now: nowMs(),
        checksumVerified: remoteState.checksumVerified,
        lastSuccessfulSyncAt: remoteState.lastSuccessfulSyncAt,
        clockOffsetMs: remoteState.serverTimeOffsetMs
      }),
      retryAt: remoteState.retryAt,
      serverRoundTripMs: remoteState.serverRoundTripMs,
      clockSkewWarning: remoteState.clockSkewWarning,
      lastOperationId: remoteState.lastOperationId,
      progressionIntegrity: {
        patch: PROGRESSION_AUTHORITY_PATCH,
        protected: remoteState.progressionProtected,
        pendingReceipts: readProgressionReceiptQueue().length,
        receiptCount: remoteState.progressionReceiptCount,
        lastCommittedAt: remoteState.lastProgressionAt,
        lastReceiptId: remoteState.lastProgressionReceiptId
      },
      tombstonedAccountId: remoteState.tombstonedAccountId,
      queue: readRemoteQueue().map((entry) => ({
        operationId: entry.operationId,
        reason: entry.reason,
        queuedAt: entry.queuedAt,
        attempts: entry.attempts,
        nextAttemptAt: entry.nextAttemptAt,
        lastError: entry.lastError,
        checksum: entry.checksum
      })),
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
    if (event.key === REMOTE_QUEUE_KEY || event.key === REMOTE_LEASE_KEY) {
      initializeRemoteState();
      refreshProfileUi();
      if (event.key === REMOTE_QUEUE_KEY && getRemoteCredentials().valid) scheduleRemoteQueueRetry(120);
    }
    if (event.key === REMOTE_TOMBSTONE_KEY) {
      initializeRemoteState();
      refreshProfileUi();
    }
  });
  window.addEventListener('online', () => {
    if (getRemoteCredentials().valid) {
      void retryCloudSyncQueue();
      void drainProgressionReceiptQueue();
    }
  });
  window.addEventListener('ka:progression-run-finalized', (event) => {
    const receipt = event?.detail?.receipt;
    if (!receipt) return;
    void commitCloudProgressionReceipt(receipt);
  });
  const stopLifecycleTimers = () => {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
    if (remoteTimer) {
      clearInterval(remoteTimer);
      remoteTimer = null;
    }
    clearRemoteRetryTimer();
    releaseRemoteLease();
  };
  const startLifecycleTimers = () => {
    if (!syncTimer) {
      syncTimer = setInterval(() => {
        if (document.visibilityState !== 'hidden') syncCloudProfile('periodic');
      }, AUTO_SYNC_MS);
    }
    if (!remoteTimer) {
      remoteTimer = setInterval(() => {
        if (document.visibilityState !== 'hidden' && getRemoteCredentials().valid) {
          void syncCloudProfileRemote('periodic');
          if (readProgressionReceiptQueue().length) void drainProgressionReceiptQueue();
        }
      }, REMOTE_SYNC_MS);
    }
  };

  window.addEventListener('pagehide', () => {
    syncCloudProfile('pagehide');
    stopLifecycleTimers();
  });
  window.addEventListener('pageshow', () => {
    startLifecycleTimers();
    if (getRemoteCredentials().valid) {
      void retryCloudSyncQueue();
      if (readProgressionReceiptQueue().length) void drainProgressionReceiptQueue();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncCloudProfile('visibility-hidden');
  });
  startLifecycleTimers();

  queueMicrotask(async () => {
    syncCloudProfile('boot-complete');
    if (getRemoteCredentials().valid) {
      if (readRemoteQueue().length) await retryCloudSyncQueue();
      else await syncCloudProfileRemote('boot', { force: true });
      if (readProgressionReceiptQueue().length) await drainProgressionReceiptQueue();
      await refreshCloudAccountSecurity({ silent: true });
    }
  });
  return getCloudProfileDiagnostics();
}

if (typeof window !== 'undefined') {
  window.KAGetCloudProfile = () => getCloudProfileSnapshot({ includeStorage: true });
  window.KAExportCloudProfile = exportCloudProfile;
  window.KAImportCloudProfileText = importCloudProfileText;
  window.KARegisterCloudGuestAccount = registerCloudGuestAccount;
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
  window.KAUpgradeCloudAccountToPasskey = upgradeCloudAccountToPasskey;
  window.KASignInCloudAccountWithPasskey = signInCloudAccountWithPasskey;
  window.KARefreshCloudAuthenticatedSession = refreshCloudAuthenticatedSession;
  window.KASignOutCloudAccount = signOutCloudAccount;
  window.KARefreshCloudPasskeys = refreshCloudPasskeys;
  window.KARenameCloudPasskey = renameCloudPasskey;
  window.KARevokeCloudPasskey = revokeCloudPasskey;
}
