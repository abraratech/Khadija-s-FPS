import { DurableObject } from 'cloudflare:workers';
import {
  CLOUD_PROFILE_PATCH,
  CLOUD_PROFILE_SCHEMA,
  CLOUD_PROFILE_VERSION,
  createCloudProfileExport,
  mergeCloudProfiles,
  profileChecksum,
  validateCloudProfile
} from './cloud_profile_core.js';
import {
  CLOUD_ACTIVITY_LIMIT,
  CLOUD_DEVICE_LIMIT,
  CLOUD_HISTORY_LIMIT,
  CLOUD_SECURITY_PATCH,
  appendActivity,
  cleanDeviceId,
  cleanDeviceName,
  cleanRecoveryCode,
  formatRecoveryCode,
  normalizeActivity,
  normalizeDevices,
  normalizeHistory,
  normalizeRegion,
  publicDevices,
  publicHistory,
  renameDevice,
  revokeDevice,
  revokeOtherDevices,
  touchDevice,
  upsertDevice
} from './cloud_profile_security_core.js';
import {
  CLOUD_ACTIVITY_RETENTION_MS,
  CLOUD_RELIABILITY_PATCH,
  CLOUD_TOMBSTONE_RETENTION_MS,
  createAccountTombstone,
  pruneCloudActivity,
  verifyHistoryIntegrity,
  verifyProfileIntegrity
} from './cloud_profile_reliability_core.js';
import {
  CLOUD_AUTH_CHALLENGE_TTL_MS,
  CLOUD_AUTH_PATCH,
  CLOUD_PASSKEY_LIMIT,
  cleanPasskeyLabel,
  createPasskeyAuthenticationOptions,
  createPasskeyRegistrationOptions,
  createRandomChallenge,
  normalizePasskeys,
  publicPasskeys,
  readPasskeyChallenge,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration
} from './cloud_profile_auth_core.js';
import {
  PROGRESSION_AUTHORITY_PATCH,
  applyAuthoritativeProgressionReceipt
} from './progression_authority_core.js';

const MAX_BODY_BYTES = 2_800_000;
const MAX_PROFILE_BYTES = 2_600_000;
const PROFILE_CHUNK_BYTES = 72_000;
const LINK_TTL_MS = 10 * 60 * 1000;
const OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const RECOVERY_CODE_LENGTH = 16;
const INCOMPLETE_UPLOAD_TTL_MS = 60 * 60 * 1000;
const MAX_CLOCK_SKEW_CAPTURE_MS = 7 * 24 * 60 * 60 * 1000;
const PROGRESSION_RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROGRESSION_RECEIPT_RATE_LIMIT = 24;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function responseJson(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function requestJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  if (!bytes.byteLength) return {};
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error('INVALID_JSON');
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function randomToken(prefix = 'kat') {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

function cleanAccountId(value) {
  const text = String(value || '').trim().slice(0, 120);
  return /^cloud-[a-f0-9]{32}$/i.test(text) ? text : '';
}

function cleanOperationId(value) {
  const text = String(value || '').trim().slice(0, 160);
  return /^[a-zA-Z0-9:_-]{8,160}$/.test(text) ? text : '';
}

function cleanLinkCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
}

function randomCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

function createLinkCode() {
  return randomCode(8);
}

function createRecoveryCode() {
  return randomCode(RECOVERY_CODE_LENGTH);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function profileChunkKey(accountId, index) {
  return `profile:${accountId}:${String(index).padStart(3, '0')}`;
}

function profileGenerationChunkKey(accountId, generation, index) {
  return `profilev2:${accountId}:${generation}:${String(index).padStart(3, '0')}`;
}

function uploadManifestKey(accountId, generation) {
  return `upload:${accountId}:${generation}`;
}

function tombstoneKey(accountId) {
  return `tombstone:${accountId}`;
}

function historyChunkKey(accountId, revision, index) {
  return `history:${accountId}:${String(revision).padStart(10, '0')}:${String(index).padStart(3, '0')}`;
}

function accountKey(accountId) {
  return `account:${accountId}`;
}

function ensureMeta(meta) {
  const output = { ...(meta || {}) };
  output.devices = normalizeDevices(output.devices);
  output.tokenHashes = Array.isArray(output.tokenHashes)
    ? output.tokenHashes.map((entry) => String(entry || '').toLowerCase()).filter((entry) => /^[a-f0-9]{64}$/.test(entry)).slice(-CLOUD_DEVICE_LIMIT)
    : [];
  output.history = normalizeHistory(output.history);
  output.activity = pruneCloudActivity(normalizeActivity(output.activity), {
    now: Date.now(),
    retentionMs: CLOUD_ACTIVITY_RETENTION_MS,
    limit: CLOUD_ACTIVITY_LIMIT
  });
  output.recoveryHash = String(output.recoveryHash || '').toLowerCase();
  output.recoveryCreatedAt = Math.max(0, Number(output.recoveryCreatedAt) || 0);
  output.recoveryGeneration = Math.max(0, Math.floor(Number(output.recoveryGeneration) || 0));
  output.profileGeneration = String(output.profileGeneration || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  output.profileChecksum = String(output.profileChecksum || '').toLowerCase();
  output.checksumVerifiedAt = Math.max(0, Number(output.checksumVerifiedAt) || 0);
  output.lastOperationId = String(output.lastOperationId || '').slice(0, 180);
  output.lastOperationDigest = String(output.lastOperationDigest || '').toLowerCase().slice(0, 128);
  output.lastOperationResult = output.lastOperationResult && typeof output.lastOperationResult === 'object'
    ? { ...output.lastOperationResult }
    : null;
  output.deletedAt = Math.max(0, Number(output.deletedAt) || 0);
  output.deletionId = String(output.deletionId || '').slice(0, 120);
  output.accountType = output.accountType === 'passkey' ? 'passkey' : 'guest';
  output.accountLabel = cleanPasskeyLabel(output.accountLabel, 'Khadija’s Arena Player');
  output.passkeys = normalizePasskeys(output.passkeys);
  output.authVersion = Math.max(0, Math.floor(Number(output.authVersion) || 0));
  output.lastAuthenticatedAt = Math.max(0, Number(output.lastAuthenticatedAt) || 0);
  output.progressionReceiptCount = Math.max(0, Math.floor(Number(output.progressionReceiptCount) || 0));
  output.lastProgressionAt = Math.max(0, Number(output.lastProgressionAt) || 0);
  output.lastProgressionReceiptId = String(output.lastProgressionReceiptId || '').slice(0, 120);
  output.lastProgressionReceiptProof = String(output.lastProgressionReceiptProof || '').slice(0, 128);
  return output;
}

function syncLegacyTokenHashes(meta) {
  meta.tokenHashes = normalizeDevices(meta.devices).map((entry) => entry.tokenHash).slice(-CLOUD_DEVICE_LIMIT);
  return meta;
}

function publicAccount(meta) {
  const safe = ensureMeta(meta);
  return {
    accountId: safe.accountId,
    cloudRevision: Number(safe.cloudRevision || 0),
    createdAt: Number(safe.createdAt || 0),
    updatedAt: Number(safe.updatedAt || 0),
    devices: safe.devices.length || safe.tokenHashes.length,
    profileChecksum: String(safe.profileChecksum || ''),
    checksumVerified: Boolean(safe.profileChecksum && safe.checksumVerifiedAt),
    checksumVerifiedAt: Number(safe.checksumVerifiedAt || 0),
    recoveryEnabled: /^[a-f0-9]{64}$/.test(safe.recoveryHash),
    historyEntries: safe.history.length,
    tombstoned: safe.deletedAt > 0,
    accountType: safe.accountType,
    accountLabel: safe.accountLabel,
    passkeys: safe.passkeys.length,
    authVersion: safe.authVersion,
    lastAuthenticatedAt: safe.lastAuthenticatedAt,
    progressionProtected: safe.accountType === 'passkey',
    progressionAuthorityPatch: PROGRESSION_AUTHORITY_PATCH,
    progressionReceiptCount: safe.progressionReceiptCount,
    lastProgressionAt: safe.lastProgressionAt,
    lastProgressionReceiptId: safe.lastProgressionReceiptId
  };
}

function activityContext(request, deviceId = '') {
  return {
    deviceId: cleanDeviceId(deviceId || request.headers.get('x-ka-device-id')),
    region: normalizeRegion(request.headers.get('x-ka-region'))
  };
}

function reliabilityForRequest(request, extra = {}) {
  const serverTime = Date.now();
  const clientTime = Number(request.headers.get('x-ka-client-time') || 0);
  const rawSkew = clientTime > 0 ? serverTime - clientTime : 0;
  const clockSkewMs = Math.max(-MAX_CLOCK_SKEW_CAPTURE_MS, Math.min(MAX_CLOCK_SKEW_CAPTURE_MS, rawSkew));
  return {
    patch: CLOUD_RELIABILITY_PATCH,
    serverTime,
    clientTime: clientTime > 0 ? clientTime : null,
    clockSkewMs,
    clockSkewWarning: clientTime > 0 && Math.abs(rawSkew) > 5 * 60 * 1000,
    uploadComplete: extra.uploadComplete !== false,
    checksumVerified: extra.checksumVerified === true,
    idempotentRecovered: extra.idempotentRecovered === true
  };
}


function passkeyRequestContext(request) {
  const origin = String(request.headers.get('x-ka-origin') || '').trim().slice(0, 500);
  const rpId = String(request.headers.get('x-ka-rp-id') || '').trim().toLowerCase().slice(0, 253);
  if (!origin || !rpId) throw new Error('PASSKEY_ORIGIN_REQUIRED');
  let parsed;
  try { parsed = new URL(origin); } catch { throw new Error('PASSKEY_ORIGIN_INVALID'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('PASSKEY_ORIGIN_INVALID');
  if (parsed.hostname.toLowerCase() !== rpId) throw new Error('PASSKEY_RP_ID_INVALID');
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(rpId)) {
    throw new Error('PASSKEY_SECURE_CONTEXT_REQUIRED');
  }
  return { origin: parsed.origin, rpId };
}

function authChallengeKey(challenge) {
  return `authchallenge:${String(challenge || '').slice(0, 160)}`;
}

export class CloudProfileHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async consumeRateLimit(kind, key, limit, windowMs = 60_000) {
    const now = Date.now();
    const storageKey = `rate:${kind}:${String(key || 'anonymous').slice(0, 96)}`;
    const current = await this.ctx.storage.get(storageKey) || { startedAt: now, count: 0 };
    if (now - Number(current.startedAt || 0) >= windowMs) {
      current.startedAt = now;
      current.count = 0;
    }
    current.count = Number(current.count || 0) + 1;
    current.expiresAt = now + windowMs * 2;
    await this.ctx.storage.put(storageKey, current);
    await this.scheduleCleanup();
    return current.count <= limit;
  }

  async scheduleCleanup() {
    const target = Date.now() + 6 * 60 * 60 * 1000;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || Number(current) > target) await this.ctx.storage.setAlarm(target);
  }

  async alarm() {
    const now = Date.now();
    const removals = [];
    for (const prefix of ['rate:', 'link:', 'op:', 'authchallenge:']) {
      const items = await this.ctx.storage.list({ prefix });
      for (const [key, value] of items) {
        if (Number(value?.expiresAt || 0) > 0 && Number(value.expiresAt) <= now) removals.push(key);
      }
    }
    const uploads = await this.ctx.storage.list({ prefix: 'upload:' });
    for (const [key, value] of uploads) {
      if (Number(value?.expiresAt || 0) <= 0 || Number(value.expiresAt) > now) continue;
      const accountId = cleanAccountId(value?.accountId);
      const generation = String(value?.generation || '');
      const meta = accountId ? ensureMeta(await this.ctx.storage.get(accountKey(accountId))) : null;
      if (accountId && generation && (!meta || meta.profileGeneration !== generation)) {
        for (let index = 0; index < Number(value?.chunks || 0); index += 1) {
          removals.push(profileGenerationChunkKey(accountId, generation, index));
        }
      }
      removals.push(key);
    }
    if (removals.length) await this.ctx.storage.delete(Array.from(new Set(removals)));

    const accounts = await this.ctx.storage.list({ prefix: 'account:' });
    const updates = {};
    for (const [key, raw] of accounts) {
      const meta = ensureMeta(raw);
      if (!meta.accountId || meta.deletedAt) continue;
      const pruned = pruneCloudActivity(meta.activity, {
        now,
        retentionMs: CLOUD_ACTIVITY_RETENTION_MS,
        limit: CLOUD_ACTIVITY_LIMIT
      });
      if (JSON.stringify(pruned) !== JSON.stringify(meta.activity)) {
        meta.activity = pruned;
        updates[key] = meta;
      }
    }
    if (Object.keys(updates).length) await this.ctx.storage.put(updates);
    await this.scheduleCleanup();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const rateKey = request.headers.get('x-ka-rate-key') || 'anonymous';
    try {
      if (request.method === 'POST' && url.pathname === '/profiles/register') return this.register(request, rateKey);
      if (request.method === 'GET' && url.pathname === '/profiles/profile') return this.getProfile(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/sync') return this.sync(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/progression/commit') return this.commitProgression(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/link/create') return this.createLink(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/link/consume') return this.consumeLink(request, rateKey);
      if (request.method === 'GET' && url.pathname === '/profiles/export') return this.exportProfile(request, rateKey);
      if (request.method === 'DELETE' && url.pathname === '/profiles/account') return this.deleteAccount(request, rateKey);
      if (request.method === 'GET' && url.pathname === '/profiles/devices') return this.listDevices(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/devices/name') return this.nameDevice(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/devices/revoke') return this.revokeOneDevice(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/devices/revoke-others') return this.revokeAllOtherDevices(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/token/rotate') return this.rotateToken(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/recovery/generate') return this.generateRecovery(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/recovery/consume') return this.consumeRecovery(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/auth/passkey/register/options') return this.passkeyRegisterOptions(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/auth/passkey/register/verify') return this.passkeyRegisterVerify(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/auth/passkey/login/options') return this.passkeyLoginOptions(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/auth/passkey/login/verify') return this.passkeyLoginVerify(request, rateKey);
      if (request.method === 'GET' && url.pathname === '/profiles/auth/session') return this.authSession(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/auth/signout') return this.authSignOut(request, rateKey);
      if (request.method === 'GET' && url.pathname === '/profiles/auth/passkeys') return this.listPasskeys(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/auth/passkeys/name') return this.namePasskey(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/auth/passkeys/revoke') return this.revokePasskey(request, rateKey);
      if (request.method === 'GET' && url.pathname === '/profiles/history') return this.listHistory(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/history/restore') return this.restoreHistory(request, rateKey);
      if (request.method === 'GET' && url.pathname === '/profiles/activity') return this.listActivity(request, rateKey);
      return responseJson({ ok: false, error: 'PROFILE_ENDPOINT_NOT_FOUND' }, { status: 404 });
    } catch (error) {
      const code = String(error?.message || error || 'PROFILE_ERROR').slice(0, 160);
      const status = code === 'REQUEST_TOO_LARGE' || code === 'PROFILE_TOO_LARGE'
        ? 413
        : code === 'INVALID_JSON' || code.startsWith('PASSKEY_')
          ? 400
          : 500;
      return responseJson({ ok: false, error: code }, { status });
    }
  }

  async authenticate(request) {
    const accountId = cleanAccountId(request.headers.get('x-ka-account-id'));
    const authHeader = String(request.headers.get('authorization') || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!accountId || token.length < 32) return { ok: false, response: responseJson({ ok: false, error: 'PROFILE_AUTH_REQUIRED' }, { status: 401 }) };
    let meta = ensureMeta(await this.ctx.storage.get(accountKey(accountId)));
    if (!meta.accountId) return { ok: false, response: responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND', reliability: reliabilityForRequest(request) }, { status: 404 }) };
    if (meta.deletedAt) {
      const tombstone = await this.ctx.storage.get(tombstoneKey(accountId)) || {
        accountId,
        deletedAt: meta.deletedAt,
        deletionId: meta.deletionId,
        deviceId: ''
      };
      return {
        ok: false,
        response: responseJson({
          ok: false,
          error: 'PROFILE_ACCOUNT_DELETED',
          deletedAt: meta.deletedAt,
          deletionId: meta.deletionId,
          tombstone,
          reliability: reliabilityForRequest(request)
        }, { status: 410 })
      };
    }
    const tokenHash = await sha256(token);
    const requestDeviceId = cleanDeviceId(request.headers.get('x-ka-device-id')) || `device-legacy-${tokenHash.slice(0, 16)}`;
    const region = normalizeRegion(request.headers.get('x-ka-region'));
    let device = meta.devices.find((entry) => entry.tokenHash === tokenHash) || null;
    if (!device && meta.tokenHashes.includes(tokenHash)) {
      meta.devices = upsertDevice(meta.devices, {
        deviceId: requestDeviceId,
        tokenHash,
        name: 'Migrated Device',
        region,
        now: Date.now()
      });
      device = meta.devices.find((entry) => entry.tokenHash === tokenHash) || null;
    }
    if (!device) return { ok: false, response: responseJson({ ok: false, error: 'PROFILE_TOKEN_REJECTED' }, { status: 401 }) };
    const touched = touchDevice(meta.devices, tokenHash, {
      deviceId: requestDeviceId,
      region,
      now: Date.now()
    });
    meta.devices = touched.devices;
    device = touched.device;
    syncLegacyTokenHashes(meta);
    meta.updatedAt = Date.now();
    await this.ctx.storage.put(accountKey(accountId), meta);
    return { ok: true, accountId, meta, tokenHash, device, region };
  }

  addActivity(meta, auth, kind, detail = '') {
    const context = auth || {};
    meta.activity = appendActivity(meta.activity, {
      id: `activity-${crypto.randomUUID()}`,
      kind,
      at: Date.now(),
      deviceId: context.device?.deviceId || context.deviceId || '',
      region: context.region || 'ZZ',
      detail
    });
    return meta.activity;
  }

  async encodeProfile(profile) {
    const validated = validateCloudProfile(profile);
    if (!validated.valid) throw new Error(`PROFILE_INVALID:${validated.errors.join(',')}`);
    const normalized = validated.profile;
    const bytes = encoder.encode(JSON.stringify(normalized));
    if (bytes.byteLength > MAX_PROFILE_BYTES) throw new Error('PROFILE_TOO_LARGE');
    const chunks = [];
    for (let offset = 0; offset < bytes.byteLength; offset += PROFILE_CHUNK_BYTES) {
      chunks.push(bytesToBase64(bytes.subarray(offset, offset + PROFILE_CHUNK_BYTES)));
    }
    return { normalized, bytes, chunks };
  }

  async saveProfile(meta, profile) {
    const encoded = await this.encodeProfile(profile);
    const checksum = profileChecksum(encoded.normalized);
    const generation = `g-${crypto.randomUUID().replace(/-/g, '')}`;
    const manifestKey = uploadManifestKey(meta.accountId, generation);
    const keys = encoded.chunks.map((_, index) => profileGenerationChunkKey(meta.accountId, generation, index));
    const manifest = {
      accountId: meta.accountId,
      generation,
      chunks: encoded.chunks.length,
      bytes: encoded.bytes.byteLength,
      checksum,
      status: 'writing',
      createdAt: Date.now(),
      expiresAt: Date.now() + INCOMPLETE_UPLOAD_TTL_MS
    };
    await this.ctx.storage.put(manifestKey, manifest);
    const writes = {};
    encoded.chunks.forEach((chunk, index) => { writes[keys[index]] = chunk; });
    if (Object.keys(writes).length) await this.ctx.storage.put(writes);

    const verified = await this.decodeChunks(keys, {
      expectedChecksum: checksum,
      expectedBytes: encoded.bytes.byteLength
    });
    manifest.status = 'verified';
    manifest.verifiedAt = Date.now();
    await this.ctx.storage.put(manifestKey, manifest);

    const previousGeneration = String(meta.profileGeneration || '');
    const previousCount = Math.max(0, Number(meta.profileChunks || 0));
    meta.profileGeneration = generation;
    meta.profileChunks = encoded.chunks.length;
    meta.profileBytes = encoded.bytes.byteLength;
    meta.profileChecksum = checksum;
    meta.checksumVerifiedAt = Date.now();
    meta.updatedAt = Date.now();
    syncLegacyTokenHashes(meta);
    await this.ctx.storage.put(accountKey(meta.accountId), meta);

    manifest.status = 'committed';
    manifest.committedAt = Date.now();
    await this.ctx.storage.put(manifestKey, manifest);
    const stale = [];
    if (previousGeneration && previousGeneration !== generation) {
      for (let index = 0; index < previousCount; index += 1) stale.push(profileGenerationChunkKey(meta.accountId, previousGeneration, index));
    } else if (!previousGeneration) {
      for (let index = 0; index < previousCount; index += 1) stale.push(profileChunkKey(meta.accountId, index));
    }
    if (stale.length) await this.ctx.storage.delete(stale);
    await this.ctx.storage.delete(manifestKey);
    return verified;
  }

  async decodeChunks(keys, { expectedChecksum = '', expectedBytes = 0 } = {}) {
    const stored = await this.ctx.storage.get(keys);
    const pieces = [];
    let total = 0;
    for (const key of keys) {
      const value = stored.get(key);
      if (typeof value !== 'string') throw new Error('PROFILE_UPLOAD_INCOMPLETE');
      const bytes = base64ToBytes(value);
      pieces.push(bytes);
      total += bytes.byteLength;
    }
    if (total > MAX_PROFILE_BYTES) throw new Error('PROFILE_TOO_LARGE');
    if (expectedBytes > 0 && total !== Number(expectedBytes)) throw new Error('PROFILE_BYTE_LENGTH_MISMATCH');
    const all = new Uint8Array(total);
    let offset = 0;
    for (const piece of pieces) { all.set(piece, offset); offset += piece.byteLength; }
    const validated = validateCloudProfile(JSON.parse(decoder.decode(all)));
    if (!validated.valid) throw new Error(`PROFILE_STORED_INVALID:${validated.errors.join(',')}`);
    if (expectedChecksum) {
      const integrity = verifyProfileIntegrity(validated.profile, expectedChecksum, profileChecksum);
      if (!integrity.valid) throw new Error('PROFILE_CHECKSUM_MISMATCH');
    }
    return validated.profile;
  }

  async loadProfile(meta) {
    const count = Math.max(0, Number(meta?.profileChunks || 0));
    if (!count) throw new Error('PROFILE_DATA_MISSING');
    const generation = String(meta?.profileGeneration || '');
    const keys = Array.from({ length: count }, (_, index) => generation
      ? profileGenerationChunkKey(meta.accountId, generation, index)
      : profileChunkKey(meta.accountId, index));
    return this.decodeChunks(keys, {
      expectedChecksum: String(meta?.profileChecksum || ''),
      expectedBytes: Math.max(0, Number(meta?.profileBytes || 0))
    });
  }

  async saveHistory(meta, profile, revision, reason = 'snapshot') {
    const safeRevision = Math.max(1, Math.floor(Number(revision) || 0));
    meta.history = normalizeHistory(meta.history);
    if (meta.history.some((entry) => entry.revision === safeRevision)) return false;
    const encoded = await this.encodeProfile(profile);
    const writes = {};
    encoded.chunks.forEach((chunk, index) => { writes[historyChunkKey(meta.accountId, safeRevision, index)] = chunk; });
    if (Object.keys(writes).length) await this.ctx.storage.put(writes);
    const historyKeys = Array.from({ length: encoded.chunks.length }, (_, index) => historyChunkKey(meta.accountId, safeRevision, index));
    await this.decodeChunks(historyKeys, {
      expectedChecksum: profileChecksum(encoded.normalized),
      expectedBytes: encoded.bytes.byteLength
    });
    const combined = [{
      revision: safeRevision,
      chunks: encoded.chunks.length,
      bytes: encoded.bytes.byteLength,
      checksum: profileChecksum(encoded.normalized),
      createdAt: Date.now(),
      reason: String(reason || 'snapshot').slice(0, 100)
    }, ...meta.history];
    const kept = normalizeHistory(combined);
    const keptRevisions = new Set(kept.map((entry) => entry.revision));
    const stale = combined.filter((entry) => !keptRevisions.has(entry.revision));
    const deleteKeys = [];
    for (const entry of stale) {
      for (let index = 0; index < Number(entry.chunks || 0); index += 1) {
        deleteKeys.push(historyChunkKey(meta.accountId, entry.revision, index));
      }
    }
    if (deleteKeys.length) await this.ctx.storage.delete(deleteKeys);
    meta.history = kept;
    await this.ctx.storage.put(accountKey(meta.accountId), meta);
    return true;
  }

  async loadHistoryProfile(meta, revision) {
    const safeRevision = Math.max(1, Math.floor(Number(revision) || 0));
    const entry = normalizeHistory(meta.history).find((candidate) => candidate.revision === safeRevision);
    if (!entry) throw new Error('PROFILE_HISTORY_NOT_FOUND');
    const keys = Array.from({ length: entry.chunks }, (_, index) => historyChunkKey(meta.accountId, safeRevision, index));
    const profile = await this.decodeChunks(keys, {
      expectedChecksum: entry.checksum,
      expectedBytes: entry.bytes
    });
    const integrity = verifyHistoryIntegrity(profile, entry, profileChecksum);
    if (!integrity.valid) throw new Error('PROFILE_HISTORY_INTEGRITY_FAILED');
    return profile;
  }

  async register(request, rateKey) {
    if (!await this.consumeRateLimit('register', rateKey, 3, 60 * 60 * 1000)) {
      return responseJson({ ok: false, error: 'PROFILE_REGISTER_RATE_LIMITED' }, { status: 429 });
    }
    const payload = await requestJson(request);
    const validated = validateCloudProfile(payload.profile);
    if (!validated.valid) return responseJson({ ok: false, error: 'PROFILE_INVALID', details: validated.errors }, { status: 400 });
    const accountId = `cloud-${crypto.randomUUID().replace(/-/g, '')}`;
    const token = randomToken();
    const tokenHash = await sha256(token);
    const now = Date.now();
    const deviceId = cleanDeviceId(payload.deviceId || request.headers.get('x-ka-device-id')) || `device-${crypto.randomUUID().replace(/-/g, '')}`;
    const region = normalizeRegion(request.headers.get('x-ka-region'));
    const meta = ensureMeta({
      accountId,
      tokenHashes: [],
      devices: upsertDevice([], { deviceId, tokenHash, name: payload.deviceName, region, now }),
      cloudRevision: 1,
      profileGeneration: '',
      profileChunks: 0,
      profileBytes: 0,
      profileChecksum: '',
      checksumVerifiedAt: 0,
      createdAt: now,
      updatedAt: now,
      lastSyncAt: now,
      deletedAt: 0,
      history: [],
      activity: [],
      recoveryHash: '',
      recoveryCreatedAt: 0,
      recoveryGeneration: 0,
      accountType: 'guest',
      accountLabel: 'Khadija’s Arena Player',
      passkeys: [],
      authVersion: 0,
      lastAuthenticatedAt: 0
    });
    this.addActivity(meta, { device: meta.devices[0], region }, 'ACCOUNT_CREATED', 'Cloud guest account created');
    const profile = await this.saveProfile(meta, validated.profile);
    return responseJson({
      ok: true,
      schema: 1,
      patch: CLOUD_AUTH_PATCH,
  reliabilityPatch: CLOUD_RELIABILITY_PATCH,
  securityPatch: CLOUD_SECURITY_PATCH,
      account: publicAccount(meta),
      token,
      devices: publicDevices(meta.devices, deviceId),
      profile,
      profileChecksum: meta.profileChecksum,
      checksumVerified: true,
      reliability: reliabilityForRequest(request, { uploadComplete: true, checksumVerified: true })
    }, { status: 201 });
  }

  async getProfile(request, rateKey) {
    if (!await this.consumeRateLimit('get', rateKey, 60)) return responseJson({ ok: false, error: 'PROFILE_GET_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const profile = await this.loadProfile(auth.meta);
    return responseJson({ ok: true, schema: 1, account: publicAccount(auth.meta), profile, profileChecksum: auth.meta.profileChecksum, checksumVerified: true, reliability: reliabilityForRequest(request, { checksumVerified: true }) });
  }

  async sync(request, rateKey) {
    if (!await this.consumeRateLimit('sync', rateKey, 24)) return responseJson({ ok: false, error: 'PROFILE_SYNC_RATE_LIMITED', reliability: reliabilityForRequest(request) }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const payload = await requestJson(request);
    const operationId = cleanOperationId(payload.operationId || request.headers.get('x-ka-operation-id'));
    if (!operationId) return responseJson({ ok: false, error: 'PROFILE_OPERATION_ID_INVALID', reliability: reliabilityForRequest(request) }, { status: 400 });
    const operationKey = `op:${await sha256(`${auth.accountId}|${operationId}`)}`;
    const previous = await this.ctx.storage.get(operationKey);
    if (previous?.response && Number(previous.expiresAt || 0) > Date.now()) {
      return responseJson({
        ...previous.response,
        idempotent: true,
        reliability: reliabilityForRequest(request, { checksumVerified: true, idempotentRecovered: true })
      });
    }
    const validated = validateCloudProfile(payload.profile);
    if (!validated.valid) return responseJson({ ok: false, error: 'PROFILE_INVALID', details: validated.errors, reliability: reliabilityForRequest(request) }, { status: 400 });
    const incomingDigest = profileChecksum(validated.profile);
    if (payload.profileChecksum) {
      const incomingIntegrity = verifyProfileIntegrity(validated.profile, payload.profileChecksum, profileChecksum);
      if (!incomingIntegrity.valid) {
        return responseJson({ ok: false, error: 'PROFILE_CLIENT_CHECKSUM_MISMATCH', integrity: incomingIntegrity, reliability: reliabilityForRequest(request) }, { status: 409 });
      }
    }

    if (
      auth.meta.lastOperationId === operationId
      && auth.meta.lastOperationDigest === incomingDigest
      && auth.meta.lastOperationResult
    ) {
      const profile = await this.loadProfile(auth.meta);
      const response = {
        ok: true,
        schema: 1,
        ...auth.meta.lastOperationResult,
        account: publicAccount(auth.meta),
        profile,
        profileChecksum: auth.meta.profileChecksum,
        checksumVerified: true,
        idempotentRecovered: true,
        reliability: reliabilityForRequest(request, { checksumVerified: true, idempotentRecovered: true })
      };
      await this.ctx.storage.put(operationKey, { response, expiresAt: Date.now() + OPERATION_TTL_MS });
      await this.scheduleCleanup();
      return responseJson(response);
    }

    const remote = await this.loadProfile(auth.meta);
    const expected = Math.max(0, Math.floor(Number(payload.expectedCloudRevision) || 0));
    const conflict = expected !== Number(auth.meta.cloudRevision || 0);
    const progressionProtected = auth.meta.accountType === 'passkey';
    const incomingProfile = progressionProtected
      ? { ...validated.profile, progression: remote.progression }
      : validated.profile;
    const protectedDigest = profileChecksum(incomingProfile);
    let profile = remote;
    const changed = remote.legacyFingerprint !== incomingProfile.legacyFingerprint
      || profileChecksum(remote) !== protectedDigest;
    if (changed) {
      await this.saveHistory(auth.meta, remote, auth.meta.cloudRevision, conflict ? 'before-conflict-merge' : 'before-sync');
      profile = mergeCloudProfiles(remote, incomingProfile, { now: Date.now() });
      auth.meta.cloudRevision = Number(auth.meta.cloudRevision || 0) + 1;
      auth.meta.lastSyncAt = Date.now();
      this.addActivity(auth.meta, auth, conflict ? 'SYNC_CONFLICT' : 'SYNC', conflict ? 'Conflicting revisions merged' : 'Profile synchronized');
      profile = await this.saveProfile(auth.meta, profile);
    } else if (conflict) {
      this.addActivity(auth.meta, auth, 'SYNC_CONFLICT_RESOLVED', 'Revision mismatch resolved without profile changes');
    }

    const operationResult = {
      conflict,
      changed,
      progressionProtected,
      cloudRevision: Number(auth.meta.cloudRevision || 0)
    };
    auth.meta.lastOperationId = operationId;
    auth.meta.lastOperationDigest = incomingDigest;
    auth.meta.lastOperationResult = operationResult;
    auth.meta.updatedAt = Date.now();
    await this.ctx.storage.put(accountKey(auth.meta.accountId), auth.meta);

    const response = {
      ok: true,
      schema: 1,
      conflict,
      changed,
      progressionProtected,
      account: publicAccount(auth.meta),
      profile,
      profileChecksum: auth.meta.profileChecksum,
      checksumVerified: true,
      reliability: reliabilityForRequest(request, { uploadComplete: true, checksumVerified: true })
    };
    await this.ctx.storage.put(operationKey, { response, expiresAt: Date.now() + OPERATION_TTL_MS });
    await this.scheduleCleanup();
    return responseJson(response);
  }

  async commitProgression(request, rateKey) {
    if (!await this.consumeRateLimit('progression-commit', rateKey, PROGRESSION_RECEIPT_RATE_LIMIT)) {
      return responseJson({
        ok: false,
        error: 'PROGRESSION_COMMIT_RATE_LIMITED',
        authorityPatch: PROGRESSION_AUTHORITY_PATCH,
        reliability: reliabilityForRequest(request)
      }, { status: 429 });
    }

    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const payload = await requestJson(request);
    const result = applyAuthoritativeProgressionReceipt(
      (await this.loadProfile(auth.meta)).progression,
      payload.receipt,
      Date.now()
    );
    if (!result.valid) {
      return responseJson({
        ok: false,
        error: 'PROGRESSION_RECEIPT_INVALID',
        details: result.errors,
        authorityPatch: PROGRESSION_AUTHORITY_PATCH,
        reliability: reliabilityForRequest(request)
      }, { status: 400 });
    }

    const receiptId = result.receipt.runId;
    const receiptKey = `progression:${await sha256(`${auth.accountId}|${receiptId}`)}`;
    const previous = await this.ctx.storage.get(receiptKey);
    if (previous?.response && Number(previous.expiresAt || 0) > Date.now()) {
      return responseJson({
        ...previous.response,
        idempotent: true,
        reliability: reliabilityForRequest(request, {
          checksumVerified: true,
          idempotentRecovered: true
        })
      });
    }

    const remote = await this.loadProfile(auth.meta);
    await this.saveHistory(
      auth.meta,
      remote,
      auth.meta.cloudRevision,
      'before-progression-commit'
    );
    const profile = {
      ...remote,
      progression: result.profile,
      updatedAt: Date.now(),
      revision: Math.max(1, Number(remote.revision || 1) + 1)
    };
    auth.meta.cloudRevision = Number(auth.meta.cloudRevision || 0) + 1;
    auth.meta.progressionReceiptCount = Number(auth.meta.progressionReceiptCount || 0) + 1;
    auth.meta.lastProgressionAt = Date.now();
    auth.meta.lastProgressionReceiptId = receiptId;
    const proofSource = `${auth.accountId}|${receiptId}|${auth.meta.cloudRevision}|${profileChecksum(result.profile)}|${auth.meta.lastProgressionAt}`;
    auth.meta.lastProgressionReceiptProof = await sha256(proofSource);
    auth.meta.updatedAt = Date.now();
    this.addActivity(
      auth.meta,
      auth,
      'PROGRESSION_COMMIT',
      `${receiptId} · +${result.award.total} XP`
    );

    const savedProfile = await this.saveProfile(auth.meta, profile);
    await this.ctx.storage.put(accountKey(auth.meta.accountId), auth.meta);

    const response = {
      ok: true,
      schema: 1,
      authorityPatch: PROGRESSION_AUTHORITY_PATCH,
      progressionProtected: auth.meta.accountType === 'passkey',
      account: publicAccount(auth.meta),
      profile: savedProfile,
      profileChecksum: auth.meta.profileChecksum,
      checksumVerified: true,
      receipt: {
        runId: receiptId,
        proof: auth.meta.lastProgressionReceiptProof,
        proofMode: 'server-sha256',
        committedAt: auth.meta.lastProgressionAt,
        cloudRevision: auth.meta.cloudRevision,
        award: result.award,
        completedOperations: result.completedOperations,
        newlyUnlocked: result.newlyUnlocked,
        live: result.live
      },
      reliability: reliabilityForRequest(request, {
        uploadComplete: true,
        checksumVerified: true
      })
    };
    await this.ctx.storage.put(receiptKey, {
      response,
      expiresAt: Date.now() + PROGRESSION_RECEIPT_TTL_MS
    });
    await this.scheduleCleanup();
    return responseJson(response);
  }

  async createLink(request, rateKey) {
    if (!await this.consumeRateLimit('link-create', rateKey, 6, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_LINK_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    let code = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = createLinkCode();
      if (!await this.ctx.storage.get(`link:${candidate}`)) { code = candidate; break; }
    }
    if (!code) throw new Error('PROFILE_LINK_CODE_UNAVAILABLE');
    const expiresAt = Date.now() + LINK_TTL_MS;
    await this.ctx.storage.put(`link:${code}`, { accountId: auth.accountId, expiresAt, createdAt: Date.now() });
    this.addActivity(auth.meta, auth, 'LINK_CODE_CREATED', 'One-time device link code created');
    await this.ctx.storage.put(accountKey(auth.meta.accountId), auth.meta);
    await this.scheduleCleanup();
    return responseJson({ ok: true, code, expiresAt: new Date(expiresAt).toISOString() });
  }

  async consumeLink(request, rateKey) {
    if (!await this.consumeRateLimit('link-consume', rateKey, 12)) return responseJson({ ok: false, error: 'PROFILE_LINK_CONSUME_RATE_LIMITED' }, { status: 429 });
    const payload = await requestJson(request);
    const code = cleanLinkCode(payload.code);
    if (code.length !== 8) return responseJson({ ok: false, error: 'PROFILE_LINK_CODE_INVALID' }, { status: 400 });
    const key = `link:${code}`;
    const link = await this.ctx.storage.get(key);
    if (!link || Number(link.expiresAt || 0) <= Date.now()) {
      if (link) await this.ctx.storage.delete(key);
      return responseJson({ ok: false, error: 'PROFILE_LINK_CODE_EXPIRED' }, { status: 404 });
    }
    const meta = ensureMeta(await this.ctx.storage.get(accountKey(link.accountId)));
    if (!meta.accountId) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND', reliability: reliabilityForRequest(request) }, { status: 404 });
    if (meta.deletedAt) {
      return responseJson({
        ok: false,
        error: 'PROFILE_ACCOUNT_DELETED',
        tombstone: await this.ctx.storage.get(tombstoneKey(link.accountId)),
        reliability: reliabilityForRequest(request)
      }, { status: 410 });
    }
    const token = randomToken();
    const tokenHash = await sha256(token);
    const now = Date.now();
    const deviceId = cleanDeviceId(payload.deviceId || request.headers.get('x-ka-device-id')) || `device-${crypto.randomUUID().replace(/-/g, '')}`;
    const region = normalizeRegion(request.headers.get('x-ka-region'));
    meta.devices = upsertDevice(meta.devices, { deviceId, tokenHash, name: payload.deviceName, region, now });
    syncLegacyTokenHashes(meta);
    this.addActivity(meta, { device: meta.devices.find((entry) => entry.deviceId === deviceId), region }, 'DEVICE_LINKED', 'Device linked with one-time code');
    meta.updatedAt = now;
    await this.ctx.storage.put(accountKey(meta.accountId), meta);
    await this.ctx.storage.delete(key);
    const profile = await this.loadProfile(meta);
    return responseJson({ ok: true, account: publicAccount(meta), token, devices: publicDevices(meta.devices, deviceId), profile, profileChecksum: meta.profileChecksum, checksumVerified: true, reliability: reliabilityForRequest(request, { checksumVerified: true }) });
  }

  async exportProfile(request, rateKey) {
    if (!await this.consumeRateLimit('export', rateKey, 12, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_EXPORT_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const profile = await this.loadProfile(auth.meta);
    this.addActivity(auth.meta, auth, 'EXPORT', 'Cloud profile backup exported');
    await this.ctx.storage.put(accountKey(auth.meta.accountId), auth.meta);
    return responseJson({ ok: true, account: publicAccount(auth.meta), export: createCloudProfileExport(profile), profileChecksum: auth.meta.profileChecksum, checksumVerified: true, reliability: reliabilityForRequest(request, { checksumVerified: true }) });
  }

  async listDevices(request, rateKey) {
    if (!await this.consumeRateLimit('devices-list', rateKey, 60)) return responseJson({ ok: false, error: 'PROFILE_DEVICES_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    return responseJson({ ok: true, account: publicAccount(auth.meta), devices: publicDevices(auth.meta.devices, auth.device?.deviceId) });
  }

  async nameDevice(request, rateKey) {
    if (!await this.consumeRateLimit('device-name', rateKey, 20)) return responseJson({ ok: false, error: 'PROFILE_DEVICE_NAME_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const payload = await requestJson(request);
    const deviceId = cleanDeviceId(payload.deviceId) || auth.device?.deviceId;
    const result = renameDevice(auth.meta.devices, deviceId, cleanDeviceName(payload.name));
    if (!result.changed) return responseJson({ ok: false, error: 'PROFILE_DEVICE_NOT_FOUND' }, { status: 404 });
    auth.meta.devices = result.devices;
    syncLegacyTokenHashes(auth.meta);
    this.addActivity(auth.meta, auth, 'DEVICE_RENAMED', `Device renamed to ${cleanDeviceName(payload.name)}`);
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    return responseJson({ ok: true, account: publicAccount(auth.meta), devices: publicDevices(auth.meta.devices, auth.device?.deviceId) });
  }

  async revokeOneDevice(request, rateKey) {
    if (!await this.consumeRateLimit('device-revoke', rateKey, 12, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_DEVICE_REVOKE_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const payload = await requestJson(request);
    const deviceId = cleanDeviceId(payload.deviceId);
    if (!deviceId) return responseJson({ ok: false, error: 'PROFILE_DEVICE_ID_INVALID' }, { status: 400 });
    if (normalizeDevices(auth.meta.devices).length <= 1) return responseJson({ ok: false, error: 'PROFILE_LAST_DEVICE_REQUIRED' }, { status: 409 });
    const result = revokeDevice(auth.meta.devices, deviceId);
    if (!result.changed) return responseJson({ ok: false, error: 'PROFILE_DEVICE_NOT_FOUND' }, { status: 404 });
    const currentRevoked = deviceId === auth.device?.deviceId;
    auth.meta.devices = result.devices;
    syncLegacyTokenHashes(auth.meta);
    this.addActivity(auth.meta, auth, 'DEVICE_REVOKED', `Revoked device ${deviceId}`);
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    return responseJson({ ok: true, currentRevoked, account: publicAccount(auth.meta), devices: publicDevices(auth.meta.devices, currentRevoked ? '' : auth.device?.deviceId) });
  }

  async revokeAllOtherDevices(request, rateKey) {
    if (!await this.consumeRateLimit('device-revoke-others', rateKey, 8, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_DEVICE_REVOKE_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const result = revokeOtherDevices(auth.meta.devices, auth.device?.deviceId);
    auth.meta.devices = result.devices;
    syncLegacyTokenHashes(auth.meta);
    if (result.changed) this.addActivity(auth.meta, auth, 'OTHER_DEVICES_REVOKED', 'All other linked devices were revoked');
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    return responseJson({ ok: true, changed: result.changed, account: publicAccount(auth.meta), devices: publicDevices(auth.meta.devices, auth.device?.deviceId) });
  }

  async rotateToken(request, rateKey) {
    if (!await this.consumeRateLimit('token-rotate', rateKey, 6, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_TOKEN_ROTATE_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const token = randomToken();
    const tokenHash = await sha256(token);
    const current = auth.device;
    auth.meta.devices = upsertDevice(auth.meta.devices.filter((entry) => entry.deviceId !== current.deviceId), {
      deviceId: current.deviceId,
      tokenHash,
      name: current.name,
      region: auth.region,
      now: Date.now()
    });
    syncLegacyTokenHashes(auth.meta);
    this.addActivity(auth.meta, { ...auth, device: auth.meta.devices.find((entry) => entry.deviceId === current.deviceId) }, 'TOKEN_ROTATED', 'Current device token rotated');
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    return responseJson({ ok: true, token, account: publicAccount(auth.meta), devices: publicDevices(auth.meta.devices, current.deviceId) });
  }

  async generateRecovery(request, rateKey) {
    if (!await this.consumeRateLimit('recovery-generate', rateKey, 4, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_RECOVERY_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const code = createRecoveryCode();
    auth.meta.recoveryHash = await sha256(code);
    auth.meta.recoveryCreatedAt = Date.now();
    auth.meta.recoveryGeneration = Number(auth.meta.recoveryGeneration || 0) + 1;
    this.addActivity(auth.meta, auth, 'RECOVERY_CODE_GENERATED', 'Account recovery code generated; previous code invalidated');
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    return responseJson({
      ok: true,
      account: publicAccount(auth.meta),
      recoveryCode: formatRecoveryCode(code),
      generatedAt: new Date(auth.meta.recoveryCreatedAt).toISOString()
    });
  }

  async consumeRecovery(request, rateKey) {
    const payload = await requestJson(request);
    const accountId = cleanAccountId(payload.accountId);
    if (!accountId) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_ID_INVALID' }, { status: 400 });
    if (!await this.consumeRateLimit('recovery-consume', `${rateKey}:${accountId}`, 6, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_RECOVERY_RATE_LIMITED' }, { status: 429 });
    const code = cleanRecoveryCode(payload.recoveryCode);
    if (code.length !== RECOVERY_CODE_LENGTH) return responseJson({ ok: false, error: 'PROFILE_RECOVERY_CODE_INVALID' }, { status: 400 });
    const meta = ensureMeta(await this.ctx.storage.get(accountKey(accountId)));
    if (!meta.accountId) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND', reliability: reliabilityForRequest(request) }, { status: 404 });
    if (meta.deletedAt) {
      return responseJson({
        ok: false,
        error: 'PROFILE_ACCOUNT_DELETED',
        tombstone: await this.ctx.storage.get(tombstoneKey(accountId)),
        reliability: reliabilityForRequest(request)
      }, { status: 410 });
    }
    if (!/^[a-f0-9]{64}$/.test(meta.recoveryHash) || await sha256(code) !== meta.recoveryHash) {
      return responseJson({ ok: false, error: 'PROFILE_RECOVERY_CODE_REJECTED' }, { status: 401 });
    }
    const token = randomToken();
    const tokenHash = await sha256(token);
    const now = Date.now();
    const deviceId = cleanDeviceId(payload.deviceId || request.headers.get('x-ka-device-id')) || `device-${crypto.randomUUID().replace(/-/g, '')}`;
    const region = normalizeRegion(request.headers.get('x-ka-region'));
    meta.devices = upsertDevice(meta.devices, { deviceId, tokenHash, name: payload.deviceName || 'Recovered Device', region, now });
    meta.recoveryHash = '';
    meta.recoveryCreatedAt = 0;
    syncLegacyTokenHashes(meta);
    const device = meta.devices.find((entry) => entry.deviceId === deviceId);
    this.addActivity(meta, { device, region }, 'ACCOUNT_RECOVERED', 'One-time recovery code consumed');
    await this.ctx.storage.put(accountKey(meta.accountId), meta);
    const profile = await this.loadProfile(meta);
    return responseJson({ ok: true, token, account: publicAccount(meta), devices: publicDevices(meta.devices, deviceId), profile, profileChecksum: meta.profileChecksum, checksumVerified: true, reliability: reliabilityForRequest(request, { checksumVerified: true }) });
  }

  async passkeyRegisterOptions(request, rateKey) {
    if (!await this.consumeRateLimit('passkey-register-options', rateKey, 8, 60 * 60 * 1000)) {
      return responseJson({ ok: false, error: 'PASSKEY_REGISTER_RATE_LIMITED' }, { status: 429 });
    }
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    if (normalizePasskeys(auth.meta.passkeys).length >= CLOUD_PASSKEY_LIMIT) {
      return responseJson({ ok: false, error: 'PASSKEY_LIMIT_REACHED' }, { status: 409 });
    }
    const payload = await requestJson(request);
    const context = passkeyRequestContext(request);
    const challenge = createRandomChallenge();
    const now = Date.now();
    const record = {
      purpose: 'register',
      challenge,
      accountId: auth.accountId,
      origin: context.origin,
      rpId: context.rpId,
      name: cleanPasskeyLabel(payload.name || auth.meta.accountLabel),
      createdAt: now,
      expiresAt: now + CLOUD_AUTH_CHALLENGE_TTL_MS
    };
    await this.ctx.storage.put(authChallengeKey(challenge), record);
    await this.scheduleCleanup();
    return responseJson({
      ok: true,
      patch: CLOUD_AUTH_PATCH,
      options: createPasskeyRegistrationOptions({
        accountId: auth.accountId,
        accountLabel: record.name,
        challenge,
        rpId: context.rpId,
        passkeys: auth.meta.passkeys
      }),
      expiresAt: new Date(record.expiresAt).toISOString()
    });
  }

  async passkeyRegisterVerify(request, rateKey) {
    if (!await this.consumeRateLimit('passkey-register-verify', rateKey, 8, 60 * 60 * 1000)) {
      return responseJson({ ok: false, error: 'PASSKEY_REGISTER_RATE_LIMITED' }, { status: 429 });
    }
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const payload = await requestJson(request);
    let challenge;
    try { challenge = readPasskeyChallenge(payload.credential); }
    catch (error) { return responseJson({ ok: false, error: String(error?.message || error) }, { status: 400 }); }
    const key = authChallengeKey(challenge);
    const record = await this.ctx.storage.get(key);
    if (!record || record.purpose !== 'register' || record.accountId !== auth.accountId) {
      return responseJson({ ok: false, error: 'PASSKEY_CHALLENGE_NOT_FOUND' }, { status: 404 });
    }
    if (Number(record.expiresAt || 0) <= Date.now()) {
      await this.ctx.storage.delete(key);
      return responseJson({ ok: false, error: 'PASSKEY_CHALLENGE_EXPIRED' }, { status: 410 });
    }
    let credential;
    try {
      credential = await verifyPasskeyRegistration({
        response: payload.credential,
        challenge,
        origin: record.origin,
        rpId: record.rpId,
        name: payload.name || record.name,
        now: Date.now()
      });
    } catch (error) {
      return responseJson({ ok: false, error: String(error?.message || error) }, { status: 400 });
    }
    const passkeys = normalizePasskeys(auth.meta.passkeys);
    if (passkeys.some((entry) => entry.credentialId === credential.credentialId)) {
      await this.ctx.storage.delete(key);
      return responseJson({ ok: false, error: 'PASSKEY_ALREADY_REGISTERED' }, { status: 409 });
    }
    const firstUpgrade = auth.meta.accountType !== 'passkey';
    auth.meta.passkeys = normalizePasskeys([...passkeys, credential]);
    auth.meta.accountType = 'passkey';
    auth.meta.accountLabel = cleanPasskeyLabel(payload.name || record.name);
    auth.meta.authVersion = Number(auth.meta.authVersion || 0) + 1;
    auth.meta.lastAuthenticatedAt = Date.now();
    this.addActivity(
      auth.meta,
      auth,
      firstUpgrade ? 'ACCOUNT_UPGRADED_TO_PASSKEY' : 'PASSKEY_REGISTERED',
      firstUpgrade ? 'Guest cloud account upgraded to passkey authentication' : 'Additional passkey registered'
    );
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    await this.ctx.storage.delete(key);
    return responseJson({
      ok: true,
      patch: CLOUD_AUTH_PATCH,
      upgraded: firstUpgrade,
      account: publicAccount(auth.meta),
      passkeys: publicPasskeys(auth.meta.passkeys)
    });
  }

  async passkeyLoginOptions(request, rateKey) {
    if (!await this.consumeRateLimit('passkey-login-options', rateKey, 12, 60 * 60 * 1000)) {
      return responseJson({ ok: false, error: 'PASSKEY_LOGIN_RATE_LIMITED' }, { status: 429 });
    }
    const payload = await requestJson(request);
    const accountId = cleanAccountId(payload.accountId);
    if (!accountId) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_ID_INVALID' }, { status: 400 });
    const meta = ensureMeta(await this.ctx.storage.get(accountKey(accountId)));
    if (!meta.accountId) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND' }, { status: 404 });
    if (meta.deletedAt) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_DELETED' }, { status: 410 });
    const passkeys = normalizePasskeys(meta.passkeys);
    if (meta.accountType !== 'passkey' || !passkeys.length) {
      return responseJson({ ok: false, error: 'PASSKEY_ACCOUNT_NOT_ENABLED' }, { status: 409 });
    }
    const context = passkeyRequestContext(request);
    const challenge = createRandomChallenge();
    const now = Date.now();
    const record = {
      purpose: 'login',
      challenge,
      accountId,
      origin: context.origin,
      rpId: context.rpId,
      createdAt: now,
      expiresAt: now + CLOUD_AUTH_CHALLENGE_TTL_MS
    };
    await this.ctx.storage.put(authChallengeKey(challenge), record);
    await this.scheduleCleanup();
    return responseJson({
      ok: true,
      patch: CLOUD_AUTH_PATCH,
      account: publicAccount(meta),
      options: createPasskeyAuthenticationOptions({ challenge, rpId: context.rpId, passkeys }),
      expiresAt: new Date(record.expiresAt).toISOString()
    });
  }

  async passkeyLoginVerify(request, rateKey) {
    if (!await this.consumeRateLimit('passkey-login-verify', rateKey, 12, 60 * 60 * 1000)) {
      return responseJson({ ok: false, error: 'PASSKEY_LOGIN_RATE_LIMITED' }, { status: 429 });
    }
    const payload = await requestJson(request);
    const accountId = cleanAccountId(payload.accountId);
    if (!accountId) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_ID_INVALID' }, { status: 400 });
    let challenge;
    try { challenge = readPasskeyChallenge(payload.credential); }
    catch (error) { return responseJson({ ok: false, error: String(error?.message || error) }, { status: 400 }); }
    const key = authChallengeKey(challenge);
    const record = await this.ctx.storage.get(key);
    if (!record || record.purpose !== 'login' || record.accountId !== accountId) {
      return responseJson({ ok: false, error: 'PASSKEY_CHALLENGE_NOT_FOUND' }, { status: 404 });
    }
    if (Number(record.expiresAt || 0) <= Date.now()) {
      await this.ctx.storage.delete(key);
      return responseJson({ ok: false, error: 'PASSKEY_CHALLENGE_EXPIRED' }, { status: 410 });
    }
    const meta = ensureMeta(await this.ctx.storage.get(accountKey(accountId)));
    if (!meta.accountId) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND' }, { status: 404 });
    if (meta.deletedAt) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_DELETED' }, { status: 410 });
    const credentialId = String(payload.credential?.id || payload.credential?.rawId || '');
    const passkeys = normalizePasskeys(meta.passkeys);
    const credential = passkeys.find((entry) => entry.credentialId === credentialId);
    if (!credential) return responseJson({ ok: false, error: 'PASSKEY_CREDENTIAL_NOT_FOUND' }, { status: 404 });
    let verified;
    try {
      verified = await verifyPasskeyAuthentication({
        response: payload.credential,
        credential,
        challenge,
        origin: record.origin,
        rpId: record.rpId,
        accountId,
        now: Date.now()
      });
    } catch (error) {
      return responseJson({ ok: false, error: String(error?.message || error) }, { status: 401 });
    }
    meta.passkeys = passkeys.map((entry) => entry.credentialId === credentialId ? verified : entry);
    meta.accountType = 'passkey';
    meta.authVersion = Math.max(1, Number(meta.authVersion || 0));
    meta.lastAuthenticatedAt = Date.now();
    const token = randomToken();
    const tokenHash = await sha256(token);
    const now = Date.now();
    const region = normalizeRegion(request.headers.get('x-ka-region'));
    const deviceId = cleanDeviceId(payload.deviceId || request.headers.get('x-ka-device-id')) || `device-${crypto.randomUUID().replace(/-/g, '')}`;
    meta.devices = upsertDevice(meta.devices, {
      deviceId,
      tokenHash,
      name: payload.deviceName || 'Passkey Device',
      region,
      now
    });
    syncLegacyTokenHashes(meta);
    const device = meta.devices.find((entry) => entry.deviceId === deviceId);
    this.addActivity(meta, { device, region }, 'PASSKEY_SIGNED_IN', 'Cloud account signed in with a passkey');
    await this.ctx.storage.put(accountKey(accountId), meta);
    await this.ctx.storage.delete(key);
    const profile = await this.loadProfile(meta);
    return responseJson({
      ok: true,
      patch: CLOUD_AUTH_PATCH,
      token,
      account: publicAccount(meta),
      devices: publicDevices(meta.devices, deviceId),
      passkeys: publicPasskeys(meta.passkeys),
      profile,
      profileChecksum: meta.profileChecksum,
      checksumVerified: true,
      reliability: reliabilityForRequest(request, { checksumVerified: true })
    });
  }

  async authSession(request, rateKey) {
    if (!await this.consumeRateLimit('auth-session', rateKey, 60)) {
      return responseJson({ ok: false, error: 'PASSKEY_SESSION_RATE_LIMITED' }, { status: 429 });
    }
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    auth.meta.lastAuthenticatedAt = Date.now();
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    const profile = await this.loadProfile(auth.meta);
    return responseJson({
      ok: true,
      patch: CLOUD_AUTH_PATCH,
      account: publicAccount(auth.meta),
      devices: publicDevices(auth.meta.devices, auth.device?.deviceId),
      passkeys: publicPasskeys(auth.meta.passkeys),
      profile,
      profileChecksum: auth.meta.profileChecksum,
      checksumVerified: true,
      reliability: reliabilityForRequest(request, { checksumVerified: true })
    });
  }

  async authSignOut(request, rateKey) {
    if (!await this.consumeRateLimit('auth-signout', rateKey, 30)) {
      return responseJson({ ok: false, error: 'PASSKEY_SIGNOUT_RATE_LIMITED' }, { status: 429 });
    }
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    if (auth.meta.accountType !== 'passkey' || !normalizePasskeys(auth.meta.passkeys).length) {
      return responseJson({ ok: false, error: 'PASSKEY_ACCOUNT_NOT_ENABLED' }, { status: 409 });
    }
    this.addActivity(auth.meta, auth, 'PASSKEY_SIGNED_OUT', 'Current device session revoked during sign-out');
    auth.meta.devices = normalizeDevices(auth.meta.devices).filter((entry) => entry.tokenHash !== auth.tokenHash);
    syncLegacyTokenHashes(auth.meta);
    auth.meta.updatedAt = Date.now();
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    return responseJson({ ok: true, signedOut: true, account: publicAccount(auth.meta) });
  }

  async listPasskeys(request, rateKey) {
    if (!await this.consumeRateLimit('passkey-list', rateKey, 60)) return responseJson({ ok: false, error: 'PASSKEY_LIST_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    return responseJson({ ok: true, account: publicAccount(auth.meta), passkeys: publicPasskeys(auth.meta.passkeys) });
  }

  async namePasskey(request, rateKey) {
    if (!await this.consumeRateLimit('passkey-name', rateKey, 20, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PASSKEY_NAME_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const payload = await requestJson(request);
    const credentialId = String(payload.credentialId || '').slice(0, 1024);
    const name = cleanPasskeyLabel(payload.name);
    let changed = false;
    auth.meta.passkeys = normalizePasskeys(auth.meta.passkeys).map((entry) => {
      if (entry.credentialId !== credentialId) return entry;
      changed = true;
      return { ...entry, name };
    });
    if (!changed) return responseJson({ ok: false, error: 'PASSKEY_CREDENTIAL_NOT_FOUND' }, { status: 404 });
    this.addActivity(auth.meta, auth, 'PASSKEY_RENAMED', `Passkey renamed to ${name}`);
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    return responseJson({ ok: true, account: publicAccount(auth.meta), passkeys: publicPasskeys(auth.meta.passkeys) });
  }

  async revokePasskey(request, rateKey) {
    if (!await this.consumeRateLimit('passkey-revoke', rateKey, 12, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PASSKEY_REVOKE_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const payload = await requestJson(request);
    const credentialId = String(payload.credentialId || '').slice(0, 1024);
    const passkeys = normalizePasskeys(auth.meta.passkeys);
    if (!passkeys.some((entry) => entry.credentialId === credentialId)) {
      return responseJson({ ok: false, error: 'PASSKEY_CREDENTIAL_NOT_FOUND' }, { status: 404 });
    }
    if (passkeys.length <= 1 && !/^[a-f0-9]{64}$/.test(auth.meta.recoveryHash)) {
      return responseJson({ ok: false, error: 'PASSKEY_LAST_CREDENTIAL_REQUIRES_RECOVERY' }, { status: 409 });
    }
    auth.meta.passkeys = passkeys.filter((entry) => entry.credentialId !== credentialId);
    if (!auth.meta.passkeys.length) auth.meta.accountType = 'guest';
    auth.meta.authVersion = Number(auth.meta.authVersion || 0) + 1;
    this.addActivity(auth.meta, auth, 'PASSKEY_REVOKED', 'Passkey credential revoked');
    await this.ctx.storage.put(accountKey(auth.accountId), auth.meta);
    return responseJson({ ok: true, account: publicAccount(auth.meta), passkeys: publicPasskeys(auth.meta.passkeys) });
  }

  async listHistory(request, rateKey) {
    if (!await this.consumeRateLimit('history-list', rateKey, 60)) return responseJson({ ok: false, error: 'PROFILE_HISTORY_RATE_LIMITED', reliability: reliabilityForRequest(request) }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const history = [];
    for (const entry of publicHistory(auth.meta.history)) {
      try {
        const profile = await this.loadHistoryProfile(auth.meta, entry.revision);
        const integrity = verifyHistoryIntegrity(profile, entry, profileChecksum);
        history.push({ ...entry, integrity: integrity.valid ? 'verified' : 'failed' });
      } catch (error) {
        history.push({ ...entry, integrity: 'failed', integrityError: String(error?.message || error).slice(0, 100) });
      }
    }
    return responseJson({ ok: true, account: publicAccount(auth.meta), history, reliability: reliabilityForRequest(request, { checksumVerified: history.every((entry) => entry.integrity === 'verified') }) });
  }

  async restoreHistory(request, rateKey) {
    if (!await this.consumeRateLimit('history-restore', rateKey, 6, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_HISTORY_RESTORE_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const payload = await requestJson(request);
    const revision = Math.max(1, Math.floor(Number(payload.revision) || 0));
    const selected = await this.loadHistoryProfile(auth.meta, revision);
    const current = await this.loadProfile(auth.meta);
    await this.saveHistory(auth.meta, current, auth.meta.cloudRevision, 'before-history-restore');
    auth.meta.cloudRevision = Number(auth.meta.cloudRevision || 0) + 1;
    auth.meta.lastSyncAt = Date.now();
    this.addActivity(auth.meta, auth, 'HISTORY_RESTORED', `Restored cloud revision ${revision}`);
    const profile = await this.saveProfile(auth.meta, selected);
    return responseJson({ ok: true, restoredRevision: revision, account: publicAccount(auth.meta), profile, history: publicHistory(auth.meta.history), profileChecksum: auth.meta.profileChecksum, checksumVerified: true, reliability: reliabilityForRequest(request, { checksumVerified: true }) });
  }

  async listActivity(request, rateKey) {
    if (!await this.consumeRateLimit('activity-list', rateKey, 60)) return responseJson({ ok: false, error: 'PROFILE_ACTIVITY_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    return responseJson({ ok: true, account: publicAccount(auth.meta), activity: pruneCloudActivity(auth.meta.activity, { now: Date.now(), retentionMs: CLOUD_ACTIVITY_RETENTION_MS, limit: CLOUD_ACTIVITY_LIMIT }), reliability: reliabilityForRequest(request) });
  }

  async deleteAccount(request, rateKey) {
    if (!await this.consumeRateLimit('delete', rateKey, 3, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_DELETE_RATE_LIMITED', reliability: reliabilityForRequest(request) }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const deletionId = `delete-${crypto.randomUUID().replace(/-/g, '')}`;
    const tombstone = createAccountTombstone({
      accountId: auth.accountId,
      deletedAt: Date.now(),
      deletionId,
      deviceId: auth.device?.deviceId || ''
    });
    const keys = [];
    const generation = String(auth.meta.profileGeneration || '');
    for (let index = 0; index < Number(auth.meta.profileChunks || 0); index += 1) {
      keys.push(generation
        ? profileGenerationChunkKey(auth.accountId, generation, index)
        : profileChunkKey(auth.accountId, index));
    }
    for (const entry of normalizeHistory(auth.meta.history)) {
      for (let index = 0; index < entry.chunks; index += 1) keys.push(historyChunkKey(auth.accountId, entry.revision, index));
    }
    const links = await this.ctx.storage.list({ prefix: 'link:' });
    for (const [key, value] of links) if (value?.accountId === auth.accountId) keys.push(key);
    const uploads = await this.ctx.storage.list({ prefix: `upload:${auth.accountId}:` });
    for (const [key, value] of uploads) {
      keys.push(key);
      for (let index = 0; index < Number(value?.chunks || 0); index += 1) {
        keys.push(profileGenerationChunkKey(auth.accountId, String(value?.generation || ''), index));
      }
    }
    if (keys.length) await this.ctx.storage.delete(keys);
    const deletedMeta = ensureMeta({
      accountId: auth.accountId,
      createdAt: auth.meta.createdAt,
      updatedAt: tombstone.deletedAt,
      deletedAt: tombstone.deletedAt,
      deletionId,
      devices: [],
      tokenHashes: [],
      history: [],
      activity: [],
      profileChunks: 0,
      profileBytes: 0,
      profileChecksum: '',
      profileGeneration: ''
    });
    await this.ctx.storage.put({
      [accountKey(auth.accountId)]: deletedMeta,
      [tombstoneKey(auth.accountId)]: tombstone
    });
    return responseJson({
      ok: true,
      deleted: true,
      accountId: auth.accountId,
      deletedAt: tombstone.deletedAt,
      deletionId,
      tombstone,
      reliability: reliabilityForRequest(request)
    });
  }
}

export const CLOUD_PROFILE_SERVER_INFO = Object.freeze({
  schema: CLOUD_PROFILE_VERSION,
  profileSchema: CLOUD_PROFILE_SCHEMA,
  profilePatch: CLOUD_PROFILE_PATCH,
  patch: CLOUD_AUTH_PATCH,
  reliabilityPatch: CLOUD_RELIABILITY_PATCH,
  securityPatch: CLOUD_SECURITY_PATCH,
  linkTtlMs: LINK_TTL_MS,
  maxProfileBytes: MAX_PROFILE_BYTES,
  deviceLimit: CLOUD_DEVICE_LIMIT,
  historyLimit: CLOUD_HISTORY_LIMIT,
  activityLimit: CLOUD_ACTIVITY_LIMIT,
  recoveryCodeLength: RECOVERY_CODE_LENGTH,
  incompleteUploadTtlMs: INCOMPLETE_UPLOAD_TTL_MS,
  activityRetentionMs: CLOUD_ACTIVITY_RETENTION_MS,
  tombstoneRetentionMs: CLOUD_TOMBSTONE_RETENTION_MS,
  authPatch: CLOUD_AUTH_PATCH,
  passkeyLimit: CLOUD_PASSKEY_LIMIT,
  authChallengeTtlMs: CLOUD_AUTH_CHALLENGE_TTL_MS,
  authentication: 'passkey',
  authAlgorithms: Object.freeze(['ES256', 'RS256']),
  progressionAuthorityPatch: PROGRESSION_AUTHORITY_PATCH,
  progressionCommitRateLimit: PROGRESSION_RECEIPT_RATE_LIMIT,
  progressionProtection: 'passkey-canonical-receipts'
});
