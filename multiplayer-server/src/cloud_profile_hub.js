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

const MAX_BODY_BYTES = 2_800_000;
const MAX_PROFILE_BYTES = 2_600_000;
const PROFILE_CHUNK_BYTES = 72_000;
const LINK_TTL_MS = 10 * 60 * 1000;
const OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const RECOVERY_CODE_LENGTH = 16;
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
  output.activity = normalizeActivity(output.activity);
  output.recoveryHash = String(output.recoveryHash || '').toLowerCase();
  output.recoveryCreatedAt = Math.max(0, Number(output.recoveryCreatedAt) || 0);
  output.recoveryGeneration = Math.max(0, Math.floor(Number(output.recoveryGeneration) || 0));
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
    recoveryEnabled: /^[a-f0-9]{64}$/.test(safe.recoveryHash),
    historyEntries: safe.history.length
  };
}

function activityContext(request, deviceId = '') {
  return {
    deviceId: cleanDeviceId(deviceId || request.headers.get('x-ka-device-id')),
    region: normalizeRegion(request.headers.get('x-ka-region'))
  };
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
    for (const prefix of ['rate:', 'link:', 'op:']) {
      const items = await this.ctx.storage.list({ prefix });
      for (const [key, value] of items) {
        if (Number(value?.expiresAt || 0) > 0 && Number(value.expiresAt) <= now) removals.push(key);
      }
    }
    if (removals.length) await this.ctx.storage.delete(removals);
    await this.scheduleCleanup();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const rateKey = request.headers.get('x-ka-rate-key') || 'anonymous';
    try {
      if (request.method === 'POST' && url.pathname === '/profiles/register') return this.register(request, rateKey);
      if (request.method === 'GET' && url.pathname === '/profiles/profile') return this.getProfile(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/sync') return this.sync(request, rateKey);
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
      if (request.method === 'GET' && url.pathname === '/profiles/history') return this.listHistory(request, rateKey);
      if (request.method === 'POST' && url.pathname === '/profiles/history/restore') return this.restoreHistory(request, rateKey);
      if (request.method === 'GET' && url.pathname === '/profiles/activity') return this.listActivity(request, rateKey);
      return responseJson({ ok: false, error: 'PROFILE_ENDPOINT_NOT_FOUND' }, { status: 404 });
    } catch (error) {
      const code = String(error?.message || error || 'PROFILE_ERROR').slice(0, 160);
      const status = code === 'REQUEST_TOO_LARGE' || code === 'PROFILE_TOO_LARGE'
        ? 413
        : code === 'INVALID_JSON'
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
    if (!meta.accountId || meta.deletedAt) return { ok: false, response: responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND' }, { status: 404 }) };
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
    const previousCount = Math.max(0, Number(meta.profileChunks || 0));
    const writes = {};
    encoded.chunks.forEach((chunk, index) => { writes[profileChunkKey(meta.accountId, index)] = chunk; });
    if (Object.keys(writes).length) await this.ctx.storage.put(writes);
    if (previousCount > encoded.chunks.length) {
      const stale = [];
      for (let index = encoded.chunks.length; index < previousCount; index += 1) stale.push(profileChunkKey(meta.accountId, index));
      if (stale.length) await this.ctx.storage.delete(stale);
    }
    meta.profileChunks = encoded.chunks.length;
    meta.profileBytes = encoded.bytes.byteLength;
    meta.profileChecksum = profileChecksum(encoded.normalized);
    meta.updatedAt = Date.now();
    syncLegacyTokenHashes(meta);
    await this.ctx.storage.put(accountKey(meta.accountId), meta);
    return encoded.normalized;
  }

  async decodeChunks(keys) {
    const stored = await this.ctx.storage.get(keys);
    const pieces = [];
    let total = 0;
    for (const key of keys) {
      const value = stored.get(key);
      if (typeof value !== 'string') throw new Error('PROFILE_CHUNK_MISSING');
      const bytes = base64ToBytes(value);
      pieces.push(bytes);
      total += bytes.byteLength;
    }
    if (total > MAX_PROFILE_BYTES) throw new Error('PROFILE_TOO_LARGE');
    const all = new Uint8Array(total);
    let offset = 0;
    for (const piece of pieces) { all.set(piece, offset); offset += piece.byteLength; }
    const validated = validateCloudProfile(JSON.parse(decoder.decode(all)));
    if (!validated.valid) throw new Error(`PROFILE_STORED_INVALID:${validated.errors.join(',')}`);
    return validated.profile;
  }

  async loadProfile(meta) {
    const count = Math.max(0, Number(meta?.profileChunks || 0));
    if (!count) throw new Error('PROFILE_DATA_MISSING');
    const keys = Array.from({ length: count }, (_, index) => profileChunkKey(meta.accountId, index));
    return this.decodeChunks(keys);
  }

  async saveHistory(meta, profile, revision, reason = 'snapshot') {
    const safeRevision = Math.max(1, Math.floor(Number(revision) || 0));
    meta.history = normalizeHistory(meta.history);
    if (meta.history.some((entry) => entry.revision === safeRevision)) return false;
    const encoded = await this.encodeProfile(profile);
    const writes = {};
    encoded.chunks.forEach((chunk, index) => { writes[historyChunkKey(meta.accountId, safeRevision, index)] = chunk; });
    if (Object.keys(writes).length) await this.ctx.storage.put(writes);
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
    return this.decodeChunks(keys);
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
      profileChunks: 0,
      profileBytes: 0,
      profileChecksum: '',
      createdAt: now,
      updatedAt: now,
      lastSyncAt: now,
      deletedAt: 0,
      history: [],
      activity: [],
      recoveryHash: '',
      recoveryCreatedAt: 0,
      recoveryGeneration: 0
    });
    this.addActivity(meta, { device: meta.devices[0], region }, 'ACCOUNT_CREATED', 'Cloud guest account created');
    const profile = await this.saveProfile(meta, validated.profile);
    return responseJson({
      ok: true,
      schema: 1,
      patch: CLOUD_SECURITY_PATCH,
      account: publicAccount(meta),
      token,
      devices: publicDevices(meta.devices, deviceId),
      profile
    }, { status: 201 });
  }

  async getProfile(request, rateKey) {
    if (!await this.consumeRateLimit('get', rateKey, 60)) return responseJson({ ok: false, error: 'PROFILE_GET_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const profile = await this.loadProfile(auth.meta);
    return responseJson({ ok: true, schema: 1, account: publicAccount(auth.meta), profile });
  }

  async sync(request, rateKey) {
    if (!await this.consumeRateLimit('sync', rateKey, 24)) return responseJson({ ok: false, error: 'PROFILE_SYNC_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const payload = await requestJson(request);
    const operationId = cleanOperationId(payload.operationId);
    if (!operationId) return responseJson({ ok: false, error: 'PROFILE_OPERATION_ID_INVALID' }, { status: 400 });
    const operationKey = `op:${await sha256(`${auth.accountId}|${operationId}`)}`;
    const previous = await this.ctx.storage.get(operationKey);
    if (previous?.response && Number(previous.expiresAt || 0) > Date.now()) {
      return responseJson({ ...previous.response, idempotent: true });
    }
    const validated = validateCloudProfile(payload.profile);
    if (!validated.valid) return responseJson({ ok: false, error: 'PROFILE_INVALID', details: validated.errors }, { status: 400 });
    const remote = await this.loadProfile(auth.meta);
    const expected = Math.max(0, Math.floor(Number(payload.expectedCloudRevision) || 0));
    const conflict = expected !== Number(auth.meta.cloudRevision || 0);
    let profile = remote;
    const changed = remote.legacyFingerprint !== validated.profile.legacyFingerprint
      || profileChecksum(remote) !== profileChecksum(validated.profile);
    if (changed) {
      await this.saveHistory(auth.meta, remote, auth.meta.cloudRevision, conflict ? 'before-conflict-merge' : 'before-sync');
      profile = mergeCloudProfiles(remote, validated.profile, { now: Date.now() });
      auth.meta.cloudRevision = Number(auth.meta.cloudRevision || 0) + 1;
      auth.meta.lastSyncAt = Date.now();
      this.addActivity(auth.meta, auth, conflict ? 'SYNC_CONFLICT' : 'SYNC', conflict ? 'Conflicting revisions merged' : 'Profile synchronized');
      profile = await this.saveProfile(auth.meta, profile);
    } else if (conflict) {
      this.addActivity(auth.meta, auth, 'SYNC_CONFLICT_RESOLVED', 'Revision mismatch resolved without profile changes');
      await this.ctx.storage.put(accountKey(auth.meta.accountId), auth.meta);
    }
    const response = {
      ok: true,
      schema: 1,
      conflict,
      changed,
      account: publicAccount(auth.meta),
      profile
    };
    await this.ctx.storage.put(operationKey, { response, expiresAt: Date.now() + OPERATION_TTL_MS });
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
    if (!meta.accountId || meta.deletedAt) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND' }, { status: 404 });
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
    return responseJson({ ok: true, account: publicAccount(meta), token, devices: publicDevices(meta.devices, deviceId), profile });
  }

  async exportProfile(request, rateKey) {
    if (!await this.consumeRateLimit('export', rateKey, 12, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_EXPORT_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const profile = await this.loadProfile(auth.meta);
    this.addActivity(auth.meta, auth, 'EXPORT', 'Cloud profile backup exported');
    await this.ctx.storage.put(accountKey(auth.meta.accountId), auth.meta);
    return responseJson({ ok: true, account: publicAccount(auth.meta), export: createCloudProfileExport(profile) });
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
    if (!meta.accountId || meta.deletedAt) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND' }, { status: 404 });
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
    return responseJson({ ok: true, token, account: publicAccount(meta), devices: publicDevices(meta.devices, deviceId), profile });
  }

  async listHistory(request, rateKey) {
    if (!await this.consumeRateLimit('history-list', rateKey, 60)) return responseJson({ ok: false, error: 'PROFILE_HISTORY_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    return responseJson({ ok: true, account: publicAccount(auth.meta), history: publicHistory(auth.meta.history) });
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
    return responseJson({ ok: true, restoredRevision: revision, account: publicAccount(auth.meta), profile, history: publicHistory(auth.meta.history) });
  }

  async listActivity(request, rateKey) {
    if (!await this.consumeRateLimit('activity-list', rateKey, 60)) return responseJson({ ok: false, error: 'PROFILE_ACTIVITY_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    return responseJson({ ok: true, account: publicAccount(auth.meta), activity: normalizeActivity(auth.meta.activity) });
  }

  async deleteAccount(request, rateKey) {
    if (!await this.consumeRateLimit('delete', rateKey, 3, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_DELETE_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const keys = [accountKey(auth.accountId)];
    for (let index = 0; index < Number(auth.meta.profileChunks || 0); index += 1) keys.push(profileChunkKey(auth.accountId, index));
    for (const entry of normalizeHistory(auth.meta.history)) {
      for (let index = 0; index < entry.chunks; index += 1) keys.push(historyChunkKey(auth.accountId, entry.revision, index));
    }
    const links = await this.ctx.storage.list({ prefix: 'link:' });
    for (const [key, value] of links) if (value?.accountId === auth.accountId) keys.push(key);
    await this.ctx.storage.delete(keys);
    return responseJson({ ok: true, deleted: true, accountId: auth.accountId });
  }
}

export const CLOUD_PROFILE_SERVER_INFO = Object.freeze({
  schema: CLOUD_PROFILE_VERSION,
  profileSchema: CLOUD_PROFILE_SCHEMA,
  profilePatch: CLOUD_PROFILE_PATCH,
  patch: CLOUD_SECURITY_PATCH,
  linkTtlMs: LINK_TTL_MS,
  maxProfileBytes: MAX_PROFILE_BYTES,
  deviceLimit: CLOUD_DEVICE_LIMIT,
  historyLimit: CLOUD_HISTORY_LIMIT,
  activityLimit: CLOUD_ACTIVITY_LIMIT,
  recoveryCodeLength: RECOVERY_CODE_LENGTH
});
