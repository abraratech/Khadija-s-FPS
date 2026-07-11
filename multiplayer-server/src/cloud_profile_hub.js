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

const MAX_BODY_BYTES = 2_800_000;
const MAX_PROFILE_BYTES = 2_600_000;
const PROFILE_CHUNK_BYTES = 72_000;
const LINK_TTL_MS = 10 * 60 * 1000;
const OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_LIMIT = 8;
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

function createLinkCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
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

function accountKey(accountId) {
  return `account:${accountId}`;
}

function publicAccount(meta) {
  return {
    accountId: meta.accountId,
    cloudRevision: Number(meta.cloudRevision || 0),
    createdAt: Number(meta.createdAt || 0),
    updatedAt: Number(meta.updatedAt || 0),
    devices: Array.isArray(meta.tokenHashes) ? meta.tokenHashes.length : 0,
    profileChecksum: String(meta.profileChecksum || '')
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
      return responseJson({ ok: false, error: 'PROFILE_ENDPOINT_NOT_FOUND' }, { status: 404 });
    } catch (error) {
      const code = String(error?.message || error || 'PROFILE_ERROR').slice(0, 120);
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
    const auth = String(request.headers.get('authorization') || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!accountId || token.length < 32) return { ok: false, response: responseJson({ ok: false, error: 'PROFILE_AUTH_REQUIRED' }, { status: 401 }) };
    const meta = await this.ctx.storage.get(accountKey(accountId));
    if (!meta || meta.deletedAt) return { ok: false, response: responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND' }, { status: 404 }) };
    const tokenHash = await sha256(token);
    if (!Array.isArray(meta.tokenHashes) || !meta.tokenHashes.includes(tokenHash)) {
      return { ok: false, response: responseJson({ ok: false, error: 'PROFILE_TOKEN_REJECTED' }, { status: 401 }) };
    }
    return { ok: true, accountId, meta, tokenHash };
  }

  async saveProfile(meta, profile) {
    const validated = validateCloudProfile(profile);
    if (!validated.valid) throw new Error(`PROFILE_INVALID:${validated.errors.join(',')}`);
    const normalized = validated.profile;
    const bytes = encoder.encode(JSON.stringify(normalized));
    if (bytes.byteLength > MAX_PROFILE_BYTES) throw new Error('PROFILE_TOO_LARGE');
    const chunks = [];
    for (let offset = 0; offset < bytes.byteLength; offset += PROFILE_CHUNK_BYTES) {
      chunks.push(bytesToBase64(bytes.subarray(offset, offset + PROFILE_CHUNK_BYTES)));
    }
    const previousCount = Math.max(0, Number(meta.profileChunks || 0));
    const writes = {};
    chunks.forEach((chunk, index) => { writes[profileChunkKey(meta.accountId, index)] = chunk; });
    if (Object.keys(writes).length) await this.ctx.storage.put(writes);
    if (previousCount > chunks.length) {
      const stale = [];
      for (let index = chunks.length; index < previousCount; index += 1) stale.push(profileChunkKey(meta.accountId, index));
      if (stale.length) await this.ctx.storage.delete(stale);
    }
    meta.profileChunks = chunks.length;
    meta.profileBytes = bytes.byteLength;
    meta.profileChecksum = profileChecksum(normalized);
    meta.updatedAt = Date.now();
    await this.ctx.storage.put(accountKey(meta.accountId), meta);
    return normalized;
  }

  async loadProfile(meta) {
    const count = Math.max(0, Number(meta?.profileChunks || 0));
    if (!count) throw new Error('PROFILE_DATA_MISSING');
    const keys = Array.from({ length: count }, (_, index) => profileChunkKey(meta.accountId, index));
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

  async register(request, rateKey) {
    if (!await this.consumeRateLimit('register', rateKey, 3, 60 * 60 * 1000)) {
      return responseJson({ ok: false, error: 'PROFILE_REGISTER_RATE_LIMITED' }, { status: 429 });
    }
    const payload = await requestJson(request);
    const validated = validateCloudProfile(payload.profile);
    if (!validated.valid) return responseJson({ ok: false, error: 'PROFILE_INVALID', details: validated.errors }, { status: 400 });
    const accountId = `cloud-${crypto.randomUUID().replace(/-/g, '')}`;
    const token = randomToken();
    const now = Date.now();
    const meta = {
      accountId,
      tokenHashes: [await sha256(token)],
      cloudRevision: 1,
      profileChunks: 0,
      profileBytes: 0,
      profileChecksum: '',
      createdAt: now,
      updatedAt: now,
      lastSyncAt: now,
      deletedAt: 0
    };
    const profile = await this.saveProfile(meta, validated.profile);
    return responseJson({
      ok: true,
      schema: 1,
      patch: 'm4-cloud-guest-sync-r1',
      account: publicAccount(meta),
      token,
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
    let changed = remote.legacyFingerprint !== validated.profile.legacyFingerprint
      || profileChecksum(remote) !== profileChecksum(validated.profile);
    if (changed) {
      profile = mergeCloudProfiles(remote, validated.profile, { now: Date.now() });
      auth.meta.cloudRevision = Number(auth.meta.cloudRevision || 0) + 1;
      auth.meta.lastSyncAt = Date.now();
      profile = await this.saveProfile(auth.meta, profile);
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
    const meta = await this.ctx.storage.get(accountKey(link.accountId));
    if (!meta || meta.deletedAt) return responseJson({ ok: false, error: 'PROFILE_ACCOUNT_NOT_FOUND' }, { status: 404 });
    const token = randomToken();
    const tokenHash = await sha256(token);
    meta.tokenHashes = Array.from(new Set([...(meta.tokenHashes || []), tokenHash])).slice(-TOKEN_LIMIT);
    meta.updatedAt = Date.now();
    await this.ctx.storage.put(accountKey(meta.accountId), meta);
    await this.ctx.storage.delete(key);
    const profile = await this.loadProfile(meta);
    return responseJson({ ok: true, account: publicAccount(meta), token, profile });
  }

  async exportProfile(request, rateKey) {
    if (!await this.consumeRateLimit('export', rateKey, 12, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_EXPORT_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const profile = await this.loadProfile(auth.meta);
    return responseJson({ ok: true, account: publicAccount(auth.meta), export: createCloudProfileExport(profile) });
  }

  async deleteAccount(request, rateKey) {
    if (!await this.consumeRateLimit('delete', rateKey, 3, 60 * 60 * 1000)) return responseJson({ ok: false, error: 'PROFILE_DELETE_RATE_LIMITED' }, { status: 429 });
    const auth = await this.authenticate(request);
    if (!auth.ok) return auth.response;
    const keys = [accountKey(auth.accountId)];
    for (let index = 0; index < Number(auth.meta.profileChunks || 0); index += 1) keys.push(profileChunkKey(auth.accountId, index));
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
  patch: 'm4-cloud-guest-sync-r1',
  linkTtlMs: LINK_TTL_MS,
  maxProfileBytes: MAX_PROFILE_BYTES
});
