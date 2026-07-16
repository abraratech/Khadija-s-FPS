// multiplayer-server/src/matchmaking_core.js
// MATCH.3 R1 — deterministic party matchmaking, region policy and pairing.

import {
  MATCH3_SERVER_PATCH,
  MATCH3_SERVER_SCHEMA,
  chooseMatch3Candidate,
  estimatedMatch3WaitMs,
  match3TicketsCapacityCompatible,
  normalizeMatch3ServerPreferences
} from './match3_core.js';

export const MATCHMAKING_SCHEMA = MATCH3_SERVER_SCHEMA;
export const MATCHMAKING_PATCH = MATCH3_SERVER_PATCH;
export const MATCHMAKING_QUEUE_TTL_MS = 90_000;
export const MATCHMAKING_MATCH_TTL_MS = 180_000;
export const MATCHMAKING_GLOBAL_FALLBACK_MS = 12_000;
export const MATCHMAKING_MAX_PLAYERS = 4;

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function cleanText(value, fallback = '', limit = 160) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeMatchmakingRegion(value) {
  const region = cleanText(value, 'ZZ', 12).toUpperCase();
  return /^[A-Z0-9_-]{2,12}$/.test(region) ? region : 'ZZ';
}

export function normalizeMatchmakingRequest(value = {}, {
  region = 'ZZ',
  now = Date.now()
} = {}) {
  const playerId = cleanText(value.playerId, '', 160);
  const displayName = cleanText(value.displayName, 'Player', 24)
    .replace(/[<>]/g, '') || 'Player';
  const protocol = Math.max(1, finiteInteger(value.protocol, 0));
  const build = cleanText(value.build, '', 120);
  const mode = cleanText(value.mode, 'coop', 40).toLowerCase();
  const mapId = cleanText(value.mapId, 'grid_bunker', 80);
  const difficulty = Math.max(0.25, Math.min(10, finiteNumber(value.difficulty, 1)));
  const maxPlayers = Math.max(
    2,
    Math.min(MATCHMAKING_MAX_PLAYERS, finiteInteger(value.maxPlayers, 2))
  );
  const tabId = cleanText(value.tabId, '', 160);
  const resumeToken = cleanText(value.resumeToken, '', 240);
  const search = normalizeMatch3ServerPreferences(value);
  const partySize = Math.max(1, Math.min(2, finiteInteger(value.partySize, 1)));
  const partyId = cleanText(value.partyId, '', 120);
  const partyTicket = cleanText(value.partyTicket, '', 240);

  if (!playerId) throw new TypeError('PLAYER_ID_REQUIRED');
  if (!protocol) throw new TypeError('PROTOCOL_REQUIRED');
  if (!build) throw new TypeError('BUILD_REQUIRED');
  if (mode !== 'coop') throw new TypeError('UNSUPPORTED_MODE');
  if (!tabId) throw new TypeError('TAB_ID_REQUIRED');

  return Object.freeze({
    schema: MATCHMAKING_SCHEMA,
    playerId,
    displayName,
    protocol,
    build,
    mode,
    mapId,
    difficulty,
    maxPlayers,
    region: normalizeMatchmakingRegion(region),
    tabId,
    resumeToken,
    partySize,
    partyId,
    partyTicket,
    searchPriority: search.searchPriority,
    regionPolicy: search.regionPolicy,
    preferredRegion: search.preferredRegion,
    globalExpansionMs: search.globalExpansionMs,
    allowBackfill: search.allowBackfill,
    joinInProgress: search.joinInProgress,
    requestedAt: Math.max(0, finiteInteger(now, Date.now()))
  });
}

export function matchmakingCompatibilityKey(ticket = {}) {
  return [
    finiteInteger(ticket.protocol, 0),
    cleanText(ticket.build, '', 120),
    cleanText(ticket.mode, 'coop', 40).toLowerCase(),
    cleanText(ticket.mapId, 'grid_bunker', 80),
    finiteNumber(ticket.difficulty, 1).toFixed(3),
    Math.max(2, Math.min(
      MATCHMAKING_MAX_PLAYERS,
      finiteInteger(ticket.maxPlayers, 2)
    ))
  ].join('|');
}

export function matchmakingTicketsCompatible(a, b) {
  if (!a || !b) return false;
  if (a.playerId === b.playerId) return false;
  if (!match3TicketsCapacityCompatible(a, b)) return false;
  return matchmakingCompatibilityKey(a) === matchmakingCompatibilityKey(b);
}

export function chooseMatchmakingCandidate(
  queuedTickets,
  incoming,
  {
    now = Date.now()
  } = {}
) {
  return chooseMatch3Candidate(queuedTickets, incoming, {
    now,
    compatibility: matchmakingTicketsCompatible
  });
}
export function makeMatchmakingRoomCode(randomBytes = null) {
  const bytes = randomBytes instanceof Uint8Array
    ? randomBytes
    : crypto.getRandomValues(new Uint8Array(6));
  if (bytes.length < 6) throw new TypeError('ROOM_RANDOM_BYTES_TOO_SHORT');
  return Array.from(
    bytes.slice(0, 6),
    (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]
  ).join('');
}

export function publicMatchmakingTicket(ticket, {
  now = Date.now(),
  queueDepth = 0
} = {}) {
  if (!ticket) return null;
  const assignment = ticket.assignment
    ? Object.freeze({
        matchId: ticket.assignment.matchId,
        roomCode: ticket.assignment.roomCode,
        joinMode: ticket.assignment.joinMode || 'join',
        connectAfterMs: Math.max(
          0,
          finiteInteger(ticket.assignment.connectAfterMs, 0)
        ),
        mapId: ticket.assignment.mapId || ticket.mapId || 'grid_bunker',
        difficulty: finiteNumber(
          ticket.assignment.difficulty,
          ticket.difficulty || 1
        ),
        maxPlayers: Math.max(
          2,
          finiteInteger(
            ticket.assignment.maxPlayers,
            ticket.maxPlayers || 2
          )
        ),
        scope: ticket.assignment.scope || 'regional',
        region: ticket.assignment.region
          || normalizeMatchmakingRegion(ticket.region),
        admissionToken: cleanText(ticket.assignment.admissionToken, '', 280),
        admissionExpiresAt: Math.max(
          0,
          finiteInteger(ticket.assignment.admissionExpiresAt, 0)
        ),
        backfill: ticket.assignment.backfill === true,
        partySize: Math.max(1, Math.min(2, finiteInteger(
          ticket.assignment.partySize,
          ticket.partySize || 1
        ))),
        quality: cleanText(ticket.assignment.quality, 'compatible', 40)
      })
    : null;

  return Object.freeze({
    ok: true,
    schema: MATCHMAKING_SCHEMA,
    patch: MATCHMAKING_PATCH,
    ticketId: ticket.ticketId,
    status: ticket.status,
    queuedAt: Math.max(0, finiteInteger(ticket.queuedAt, 0)),
    elapsedMs: Math.max(0, Number(now) - Number(ticket.queuedAt || now)),
    expiresAt: Math.max(0, finiteInteger(ticket.expiresAt, 0)),
    fallbackAt: Math.max(0, finiteInteger(ticket.fallbackAt, 0)),
    region: normalizeMatchmakingRegion(ticket.region),
    queueDepth: Math.max(0, finiteInteger(queueDepth, 0)),
    estimatedWaitMs: estimatedMatch3WaitMs({
      queueDepth,
      searchPriority: ticket.searchPriority,
      partySize: ticket.partySize
    }),
    searchScope: ticket.regionPolicy || 'auto',
    partySize: Math.max(1, Math.min(2, finiteInteger(ticket.partySize, 1))),
    assignment,
    reason: cleanText(ticket.reason, '', 120) || null
  });
}

export function cleanupMatchmakingTickets(tickets, {
  now = Date.now()
} = {}) {
  const next = {};
  let changed = false;
  Object.entries(tickets && typeof tickets === 'object' ? tickets : {})
    .forEach(([ticketId, ticket]) => {
      const status = String(ticket?.status || 'queued');
      const queuedExpiry = Number(ticket?.expiresAt || 0);
      const matchedExpiry = Number(ticket?.matchExpiresAt || 0);
      const terminalAt = Number(
        ticket?.completedAt
        || ticket?.cancelledAt
        || ticket?.expiredAt
        || 0
      );

      if (
        status === 'queued'
        && queuedExpiry > 0
        && now >= queuedExpiry
      ) {
        next[ticketId] = {
          ...ticket,
          status: 'expired',
          reason: 'queue-timeout',
          expiredAt: now
        };
        changed = true;
        return;
      }

      if (
        status === 'matched'
        && matchedExpiry > 0
        && now >= matchedExpiry
      ) {
        next[ticketId] = {
          ...ticket,
          status: 'expired',
          reason: 'match-timeout',
          expiredAt: now
        };
        changed = true;
        return;
      }

      if (
        ['completed', 'cancelled', 'expired'].includes(status)
        && terminalAt > 0
        && now - terminalAt >= 30_000
      ) {
        changed = true;
        return;
      }

      next[ticketId] = ticket;
    });

  return Object.freeze({ tickets: next, changed });
}
