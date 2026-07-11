// multiplayer-server/src/leaderboard_hub.js
import { DurableObject } from 'cloudflare:workers';
import {
  ONLINE_LEADERBOARD_CHALLENGE_TTL_MS,
  ONLINE_LEADERBOARD_PUBLIC_LIMIT,
  compareLeaderboardEntries,
  normalizeLeaderboardDifficulty,
  normalizeLeaderboardMap,
  normalizeRegion,
  publicLeaderboardEntry,
  rankLeaderboardEntries,
  safeLeaderboardName,
  validateChallengeRequest,
  validateLeaderboardSubmission
} from './leaderboard_core.js';

const MAX_BODY_BYTES = 16 * 1024;

function responseJson(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}
async function requestJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
  return text ? JSON.parse(text) : {};
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class LeaderboardHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async consumeRateLimit(kind, key, limit, windowMs = 60_000) {
    const now = Date.now();
    const storageKey = `rate:${kind}:${String(key || 'anonymous').slice(0, 80)}`;
    const current = await this.ctx.storage.get(storageKey) || { startedAt: now, count: 0 };
    if (now - Number(current.startedAt || 0) >= windowMs) {
      current.startedAt = now;
      current.count = 0;
    }
    current.count = Number(current.count || 0) + 1;
    current.expiresAt = now + windowMs * 2;
    await this.ctx.storage.put(storageKey, current);
    return current.count <= limit;
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/leaderboards') return this.list(request, url);
      if (request.method === 'POST' && url.pathname === '/leaderboards/challenge') return this.challenge(request);
      if (request.method === 'POST' && url.pathname === '/leaderboards/submit') return this.submit(request);
      return responseJson({ ok: false, error: 'LEADERBOARD_ENDPOINT_NOT_FOUND' }, { status: 404 });
    } catch (error) {
      const code = String(error?.message || error || 'LEADERBOARD_ERROR').slice(0, 120);
      const status = code === 'REQUEST_TOO_LARGE' ? 413 : code === 'INVALID_JSON' ? 400 : 500;
      return responseJson({ ok: false, error: code }, { status });
    }
  }


  async scheduleCleanup() {
    const target = Date.now() + 6 * 60 * 60 * 1000;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || Number(current) > target) await this.ctx.storage.setAlarm(target);
  }

  async alarm() {
    const now = Date.now();
    const removals = [];
    for (const prefix of ['challenge:', 'rate:', 'submission:']) {
      const items = await this.ctx.storage.list({ prefix });
      for (const [key, value] of items) {
        const expiresAt = Number(value?.expiresAt || 0);
        if (expiresAt > 0 && expiresAt <= now) removals.push(key);
      }
    }
    if (removals.length) await this.ctx.storage.delete(removals);
    await this.scheduleCleanup();
  }

  async list(request, url) {
    const mapId = normalizeLeaderboardMap(url.searchParams.get('mapId'));
    const difficulty = normalizeLeaderboardDifficulty(url.searchParams.get('difficulty'));
    const scope = url.searchParams.get('scope') === 'region' ? 'region' : 'global';
    const region = normalizeRegion(request.headers.get('x-ka-region'));
    const limit = Math.min(ONLINE_LEADERBOARD_PUBLIC_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 10));
    if (!mapId || !difficulty) return responseJson({ ok: false, error: 'CATEGORY_INVALID' }, { status: 400 });
    const key = `entries:${mapId}:${difficulty}`;
    const ranked = rankLeaderboardEntries(await this.ctx.storage.get(key) || []);
    const selected = scope === 'region' ? ranked.filter((entry) => entry.region === region) : ranked;
    const entries = selected.slice(0, limit).map((entry, index) => publicLeaderboardEntry(entry, index + 1));
    return responseJson({
      ok: true,
      schema: 1,
      scope,
      region: scope === 'region' ? region : null,
      mapId,
      difficulty,
      entries,
      generatedAt: new Date().toISOString()
    });
  }

  async challenge(request) {
    const rateKey = request.headers.get('x-ka-rate-key') || 'anonymous';
    if (!await this.consumeRateLimit('challenge', rateKey, 12)) {
      return responseJson({ ok: false, error: 'CHALLENGE_RATE_LIMITED' }, { status: 429 });
    }
    let payload;
    try { payload = await requestJson(request); } catch { return responseJson({ ok: false, error: 'INVALID_JSON' }, { status: 400 }); }
    const validated = validateChallengeRequest(payload);
    if (!validated.valid) return responseJson({ ok: false, error: 'CHALLENGE_INVALID', details: validated.errors }, { status: 400 });
    const now = Date.now();
    const token = crypto.randomUUID();
    const challenge = {
      token,
      ...validated.value,
      region: normalizeRegion(request.headers.get('x-ka-region')),
      createdAt: now,
      expiresAt: now + ONLINE_LEADERBOARD_CHALLENGE_TTL_MS,
      used: false
    };
    await this.ctx.storage.put(`challenge:${token}`, challenge);
    await this.scheduleCleanup();
    return responseJson({
      ok: true,
      schema: 1,
      challengeToken: token,
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      region: challenge.region,
      mapId: challenge.mapId,
      difficulty: challenge.difficulty
    });
  }

  async submit(request) {
    const rateKey = request.headers.get('x-ka-rate-key') || 'anonymous';
    if (!await this.consumeRateLimit('submit', rateKey, 8)) {
      return responseJson({ ok: false, error: 'SUBMISSION_RATE_LIMITED' }, { status: 429 });
    }
    let payload;
    try { payload = await requestJson(request); } catch { return responseJson({ ok: false, error: 'INVALID_JSON' }, { status: 400 }); }
    const challengeToken = String(payload.challengeToken || '').trim().slice(0, 80);
    if (!challengeToken) return responseJson({ ok: false, error: 'CHALLENGE_REQUIRED' }, { status: 400 });
    const challengeKey = `challenge:${challengeToken}`;
    const challenge = await this.ctx.storage.get(challengeKey);
    if (!challenge) return responseJson({ ok: false, error: 'CHALLENGE_NOT_FOUND' }, { status: 404 });
    const runDigest = await sha256(`${String(payload.playerId || '')}|${String(payload.runId || '')}`);
    const submissionKey = `submission:${runDigest}`;
    const previous = await this.ctx.storage.get(submissionKey);
    if (previous && Number(previous.expiresAt || 0) > Date.now()) return responseJson({ ok: true, idempotent: true, ...previous });
    if (previous) await this.ctx.storage.delete(submissionKey);
    const validation = validateLeaderboardSubmission(challenge, payload, Date.now());
    if (!validation.valid) return responseJson({ ok: false, error: 'SUBMISSION_INVALID', details: validation.errors }, { status: 400 });
    const entry = {
      ...validation.entry,
      id: crypto.randomUUID(),
      displayName: safeLeaderboardName(payload.displayName)
    };
    const entriesKey = `entries:${entry.mapId}:${entry.difficulty}`;
    const ranked = rankLeaderboardEntries([...(await this.ctx.storage.get(entriesKey) || []), entry]);
    const globalRank = ranked.findIndex((item) => item.id === entry.id) + 1 || null;
    const regional = ranked.filter((item) => item.region === entry.region);
    const regionRank = regional.findIndex((item) => item.id === entry.id) + 1 || null;
    const result = {
      accepted: true,
      entry: publicLeaderboardEntry(entry, globalRank),
      globalRank,
      regionRank,
      region: entry.region,
      storedInTop100: globalRank !== null
    };
    challenge.used = true;
    challenge.usedAt = Date.now();
    challenge.result = result;
    await this.ctx.storage.put(entriesKey, ranked);
    await this.ctx.storage.put(challengeKey, challenge);
    await this.ctx.storage.put(submissionKey, { ...result, expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000 });
    await this.scheduleCleanup();
    return responseJson({ ok: true, idempotent: false, ...result });
  }
}
