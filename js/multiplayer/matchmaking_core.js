// js/multiplayer/matchmaking_core.js
// MATCH.3 R1 — public matchmaking request/state helpers.

import {
  MATCH3_PATCH,
  MATCH3_SCHEMA,
  normalizeMatch3SearchPreferences
} from './match3_core.js';

export const PUBLIC_MATCHMAKING_SCHEMA = MATCH3_SCHEMA;
export const PUBLIC_MATCHMAKING_PATCH = MATCH3_PATCH;
export const PUBLIC_MATCHMAKING_QUEUE_TIMEOUT_MS = 95_000;
export const PUBLIC_MATCHMAKING_POLL_MS = 1_500;
export const PUBLIC_MATCHMAKING_LOCK_TTL_MS = 10_000;
export const PUBLIC_MATCHMAKING_BOT_FILL_DELAY_MS = 25_000;
export const PUBLIC_PVP_MATCHMAKING_MODE = 'pvp-team-elimination';

function cleanText(value, fallback = '', limit = 240) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeMatchmakingHttpBase(serverUrl) {
  const raw = cleanText(serverUrl, '', 1000);
  if (!raw) throw new TypeError('MATCHMAKING_SERVER_URL_REQUIRED');
  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  const url = new URL(candidate);
  if (url.protocol === 'wss:') url.protocol = 'https:';
  if (url.protocol === 'ws:') url.protocol = 'http:';
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new TypeError('MATCHMAKING_SERVER_PROTOCOL_INVALID');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

export function matchmakingEndpoint(serverUrl, path, params = null) {
  const url = new URL(
    cleanText(path, '/', 240),
    `${normalizeMatchmakingHttpBase(serverUrl)}/`
  );
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

export function normalizeQuickMatchPreferences(value = {}) {
  const search = normalizeMatch3SearchPreferences(value);
  const partySize = Math.max(
    1,
    Math.min(2, Math.trunc(finiteNumber(value.partySize, 1)))
  );
  const mode = String(value.mode || '').trim().toLowerCase() === PUBLIC_PVP_MATCHMAKING_MODE
    ? PUBLIC_PVP_MATCHMAKING_MODE
    : 'coop';
  const pvp = mode === PUBLIC_PVP_MATCHMAKING_MODE;
  return Object.freeze({
    mode,
    mapId: cleanText(value.mapId, 'grid_bunker', 80),
    difficulty: pvp ? 1 : Math.max(
      0.25,
      Math.min(10, finiteNumber(value.difficulty, 1))
    ),
    maxPlayers: pvp ? 2 : Math.max(
      2,
      Math.min(4, Math.trunc(finiteNumber(value.maxPlayers, 2)))
    ),
    partySize: pvp ? 1 : partySize,
    partyId: pvp ? '' : cleanText(value.partyId, '', 120),
    partyTicket: pvp ? '' : cleanText(value.partyTicket, '', 240),
    searchPriority: search.searchPriority,
    regionPolicy: search.regionPolicy,
    preferredRegion: search.preferredRegion,
    globalExpansionMs: search.globalExpansionMs,
    allowBackfill: pvp ? false : search.allowBackfill,
    joinInProgress: pvp ? false : search.joinInProgress
  });
}
export function createQuickMatchRequest({
  playerId,
  displayName,
  protocol,
  build,
  tabId,
  resumeToken = '',
  preferences = {}
} = {}) {
  const normalizedPlayerId = cleanText(playerId, '', 160);
  const normalizedBuild = cleanText(build, '', 120);
  const normalizedTabId = cleanText(tabId, '', 160);
  const normalizedProtocol = Math.max(1, Math.trunc(finiteNumber(protocol, 0)));
  if (!normalizedPlayerId) throw new TypeError('PLAYER_ID_REQUIRED');
  if (!normalizedBuild) throw new TypeError('BUILD_REQUIRED');
  if (!normalizedTabId) throw new TypeError('TAB_ID_REQUIRED');
  if (!normalizedProtocol) throw new TypeError('PROTOCOL_REQUIRED');

  return Object.freeze({
    schema: PUBLIC_MATCHMAKING_SCHEMA,
    playerId: normalizedPlayerId,
    displayName: cleanText(displayName, 'Player', 24)
      .replace(/[<>]/g, '') || 'Player',
    protocol: normalizedProtocol,
    build: normalizedBuild,
    tabId: normalizedTabId,
    resumeToken: cleanText(resumeToken, '', 240),
    ...normalizeQuickMatchPreferences(preferences)
  });
}

export function normalizeMatchmakingResponse(value = {}) {
  const status = cleanText(value.status, 'error', 40).toLowerCase();
  const assignment = value.assignment && typeof value.assignment === 'object'
    ? Object.freeze({
        matchId: cleanText(value.assignment.matchId, '', 240),
        roomCode: cleanText(value.assignment.roomCode, '', 12).toUpperCase(),
        joinMode: value.assignment.joinMode === 'create' ? 'create' : 'join',
        connectAfterMs: Math.max(
          0,
          Math.trunc(finiteNumber(value.assignment.connectAfterMs, 0))
        ),
        mapId: cleanText(value.assignment.mapId, 'grid_bunker', 80),
        difficulty: finiteNumber(value.assignment.difficulty, 1),
        maxPlayers: Math.max(
          2,
          Math.min(4, Math.trunc(
            finiteNumber(value.assignment.maxPlayers, 2)
          ))
        ),
        scope: cleanText(value.assignment.scope, 'regional', 24),
        region: cleanText(value.assignment.region, 'ZZ', 16),
        admissionToken: cleanText(value.assignment.admissionToken, '', 280),
        admissionExpiresAt: Math.max(
          0,
          finiteNumber(value.assignment.admissionExpiresAt, 0)
        ),
        backfill: value.assignment.backfill === true,
        partySize: Math.max(
          1,
          Math.min(2, Math.trunc(finiteNumber(value.assignment.partySize, 1)))
        ),
        quality: cleanText(value.assignment.quality, 'compatible', 40),
        gameMode: String(value.assignment.gameMode || value.assignment.mode || 'coop').trim().toLowerCase() === PUBLIC_PVP_MATCHMAKING_MODE
          ? PUBLIC_PVP_MATCHMAKING_MODE
          : 'coop',
        publicPvp: value.assignment.publicPvp === true
      })
    : null;

  return Object.freeze({
    ok: value.ok === true,
    schema: Math.trunc(finiteNumber(value.schema, 0)),
    patch: cleanText(value.patch, '', 120),
    ticketId: cleanText(value.ticketId, '', 240),
    token: cleanText(value.token, '', 300),
    status,
    queuedAt: Math.max(0, finiteNumber(value.queuedAt, 0)),
    elapsedMs: Math.max(0, finiteNumber(value.elapsedMs, 0)),
    expiresAt: Math.max(0, finiteNumber(value.expiresAt, 0)),
    fallbackAt: Math.max(0, finiteNumber(value.fallbackAt, 0)),
    region: cleanText(value.region, 'ZZ', 16),
    queueDepth: Math.max(0, Math.trunc(finiteNumber(value.queueDepth, 0))),
    estimatedWaitMs: Math.max(0, Math.trunc(finiteNumber(value.estimatedWaitMs, 0))),
    searchScope: cleanText(value.searchScope, 'regional', 24),
    partySize: Math.max(1, Math.min(2, Math.trunc(finiteNumber(value.partySize, 1)))),
    mode: String(value.mode || assignment?.gameMode || 'coop').trim().toLowerCase() === PUBLIC_PVP_MATCHMAKING_MODE
      ? PUBLIC_PVP_MATCHMAKING_MODE
      : 'coop',
    assignment,
    reason: cleanText(value.reason, '', 120) || null,
    error: cleanText(value.error, '', 120) || null,
    message: cleanText(value.message, '', 240) || null,
    resumed: value.resumed === true
  });
}

export function matchmakingStatusPresentation(snapshot = {}, {
  now = Date.now()
} = {}) {
  const status = cleanText(snapshot.status, 'idle', 40).toLowerCase();
  const pvp = String(snapshot.mode || snapshot.assignment?.gameMode || '').toLowerCase() === PUBLIC_PVP_MATCHMAKING_MODE;
  const queuedAt = Math.max(0, finiteNumber(snapshot.queuedAt, 0));
  const fallbackAt = Math.max(0, finiteNumber(snapshot.fallbackAt, 0));
  const elapsedMs = queuedAt > 0
    ? Math.max(0, Number(now) - queuedAt)
    : Math.max(0, finiteNumber(snapshot.elapsedMs, 0));
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const fallbackSeconds = fallbackAt > 0
    ? Math.max(0, Math.ceil((fallbackAt - Number(now)) / 1000))
    : 0;

  if (status === 'searching' || status === 'queued') {
    return Object.freeze({
      tone: 'searching',
      title: pvp ? 'SEARCHING FOR PVP OPPONENT' : 'SEARCHING FOR OPERATIVES',
      detail: pvp
        ? (snapshot.searchScope === 'regional-only'
            ? 'PUBLIC 1V1 · REGIONAL-ONLY SEARCH'
            : fallbackSeconds > 0
              ? `PUBLIC 1V1 · GLOBAL IN ${fallbackSeconds}s`
              : 'PUBLIC 1V1 · REGIONAL + GLOBAL')
        : snapshot.botAvailable === true
        ? 'NO HUMAN MATCH YET · AI WINGMATE AVAILABLE'
        : snapshot.partySize > 1
          ? 'PARTY ROOM RESERVATION · KEEP PARTY TOGETHER'
          : snapshot.searchScope === 'regional-only'
            ? 'REGIONAL-ONLY SEARCH'
            : fallbackSeconds > 0
              ? `REGIONAL SEARCH · GLOBAL IN ${fallbackSeconds}s`
              : 'REGIONAL + GLOBAL SEARCH',
      elapsedText: `${elapsedSeconds}s`,
      cancellable: true,
      botAvailable: snapshot.botAvailable === true
    });
  }
  if (status === 'matched') {
    return Object.freeze({
      tone: 'matched',
      title: 'MATCH FOUND',
      detail: pvp ? 'RESERVING PUBLIC PVP ARENA…' : 'RESERVING PUBLIC ROOM…',
      elapsedText: `${elapsedSeconds}s`,
      cancellable: false
    });
  }
  if (status === 'connecting') {
    return Object.freeze({
      tone: 'connecting',
      title: 'MATCH FOUND',
      detail: 'CONNECTING TO PUBLIC ROOM…',
      elapsedText: `${elapsedSeconds}s`,
      cancellable: true
    });
  }
  if (status === 'error') {
    return Object.freeze({
      tone: 'error',
      title: 'QUICK MATCH FAILED',
      detail: cleanText(
        snapshot.message || snapshot.error,
        'TRY AGAIN OR CREATE A PRIVATE ROOM',
        240
      ).toUpperCase(),
      elapsedText: '',
      cancellable: false
    });
  }
  if (status === 'cancelled' || status === 'expired') {
    return Object.freeze({
      tone: 'neutral',
      title: status === 'expired' ? 'SEARCH EXPIRED' : 'SEARCH CANCELLED',
      detail: 'START QUICK MATCH TO SEARCH AGAIN',
      elapsedText: '',
      cancellable: false
    });
  }
  return Object.freeze({
    tone: 'neutral',
    title: 'PUBLIC QUICK MATCH',
    detail: 'MATCH BY BUILD, PROTOCOL, ARENA AND REGION',
    elapsedText: '',
    cancellable: false
  });
}
