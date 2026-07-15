// multiplayer-server/src/matchmaking_hub.js
// MATCH.1 R1 — global public matchmaking queue Durable Object.

import { DurableObject } from 'cloudflare:workers';
import {
  MATCHMAKING_GLOBAL_FALLBACK_MS,
  MATCHMAKING_MATCH_TTL_MS,
  MATCHMAKING_PATCH,
  MATCHMAKING_QUEUE_TTL_MS,
  MATCHMAKING_SCHEMA,
  chooseMatchmakingCandidate,
  cleanupMatchmakingTickets,
  makeMatchmakingRoomCode,
  matchmakingCompatibilityKey,
  normalizeMatchmakingRequest,
  normalizeMatchmakingRegion,
  publicMatchmakingTicket
} from './matchmaking_core.js';
import {
  ROOM_DIRECTORY_MAX_RESULTS,
  ROOM_DIRECTORY_PATCH,
  ROOM_DIRECTORY_SCHEMA,
  cleanupRoomDirectory,
  normalizeRoomDirectorySync,
  publicRoomDirectoryEntry,
  roomDirectoryListingVisible
} from './room_directory_core.js';

const STATE_KEY = 'matchmaking-state-v1';

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function makeSecret(prefix) {
  return `${prefix}-${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

function cleanText(value, limit = 240) {
  return String(value || '').trim().slice(0, limit);
}

function queuedCount(tickets) {
  return Object.values(tickets || {}).filter(
    (ticket) => ticket?.status === 'queued'
  ).length;
}

function activeTicketForPlayer(tickets, playerId) {
  return Object.values(tickets || {}).find((ticket) => (
    ticket?.playerId === playerId
    && ['queued', 'matched'].includes(ticket?.status)
  )) || null;
}

function ticketByCredentials(tickets, ticketId, token) {
  const ticket = tickets?.[cleanText(ticketId, 180)] || null;
  if (!ticket || !token || ticket.token !== token) return null;
  return ticket;
}

export class MatchmakingHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.state = {
      schema: MATCHMAKING_SCHEMA,
      revision: 0,
      tickets: {},
      rooms: {},
      updatedAt: Date.now()
    };

    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get(STATE_KEY);
      if (stored && typeof stored === 'object') {
        this.state = {
          schema: MATCHMAKING_SCHEMA,
          revision: Math.max(0, Number(stored.revision) || 0),
          tickets: stored.tickets && typeof stored.tickets === 'object'
            ? stored.tickets
            : {},
          rooms: stored.rooms && typeof stored.rooms === 'object'
            ? stored.rooms
            : {},
          updatedAt: Math.max(0, Number(stored.updatedAt) || Date.now())
        };
      }
      await this.cleanup(Date.now(), { persist: true });
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    await this.cleanup(now);

    if (request.method === 'POST' && url.pathname === '/matchmaking/enqueue') {
      return this.enqueue(request, now);
    }
    if (request.method === 'GET' && url.pathname === '/matchmaking/status') {
      return this.status(url, now);
    }
    if (request.method === 'DELETE' && url.pathname === '/matchmaking/cancel') {
      return this.cancel(url, now);
    }
    if (request.method === 'POST' && url.pathname === '/matchmaking/ack') {
      return this.acknowledge(request, now);
    }
    if (request.method === 'POST' && url.pathname === '/matchmaking/rooms/sync') {
      return this.syncRoomListing(request, now);
    }
    if (request.method === 'GET' && url.pathname === '/matchmaking/rooms/list') {
      return this.listRooms(request, url, now);
    }
    if (request.method === 'POST' && url.pathname === '/matchmaking/rooms/join') {
      return this.joinRoomListing(request, now);
    }
    if (request.method === 'GET' && url.pathname === '/matchmaking/health') {
      return json({
        ok: true,
        schema: MATCHMAKING_SCHEMA,
        patch: MATCHMAKING_PATCH,
        queued: queuedCount(this.state.tickets),
        openRooms: Object.values(this.state.rooms || {}).filter((listing) => roomDirectoryListingVisible(listing, { now })).length,
        roomDirectory: { schema: ROOM_DIRECTORY_SCHEMA, patch: ROOM_DIRECTORY_PATCH },
        revision: this.state.revision
      });
    }

    return json({
      ok: false,
      error: 'MATCHMAKING_ENDPOINT_NOT_FOUND'
    }, { status: 404 });
  }

  async syncRoomListing(request, now) {
    if (request.headers.get('x-ka-internal-room-directory') !== '1') {
      return json({ ok: false, error: 'DIRECTORY_SYNC_FORBIDDEN' }, { status: 403 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }
    let normalized;
    try {
      normalized = normalizeRoomDirectorySync(body, { now });
    } catch (error) {
      return json({ ok: false, error: cleanText(error?.message || error, 120) }, { status: 400 });
    }

    const existing = Object.values(this.state.rooms || {}).find(
      (listing) => listing?.roomCode === normalized.roomCode
    ) || null;

    if (normalized.listed !== true) {
      if (existing?.listingId) {
        delete this.state.rooms[existing.listingId];
        await this.commit(now);
      }
      return json({ ok: true, listed: false, roomCode: normalized.roomCode });
    }

    const listingId = existing?.listingId || makeSecret('room-listing');
    const joinToken = existing?.joinToken || makeSecret('room-join');
    this.state.rooms[listingId] = {
      ...normalized,
      listingId,
      joinToken,
      firstListedAt: existing?.firstListedAt || now
    };
    await this.commit(now);
    return json({ ok: true, listed: true, listingId, expiresAt: normalized.expiresAt });
  }

  listRooms(request, url, now) {
    const protocol = Math.max(1, Math.trunc(Number(url.searchParams.get('protocol')) || 0));
    const build = cleanText(url.searchParams.get('build'), 120);
    if (!protocol || !build) {
      return json({ ok: false, error: 'DIRECTORY_COMPATIBILITY_REQUIRED' }, { status: 400 });
    }
    const requestRegion = String(
      request.headers.get('x-ka-region') || 'ZZ'
    ).toUpperCase().slice(0, 16);
    const rooms = Object.values(this.state.rooms || {})
      .filter((listing) => (
        roomDirectoryListingVisible(listing, { now })
        && Number(listing.protocol) === protocol
        && String(listing.build) === build
      ))
      .map((listing) => publicRoomDirectoryEntry(listing, { requestRegion, now }))
      .sort((left, right) => {
        const leftStatus = left.status === 'waiting' ? 0 : 1;
        const rightStatus = right.status === 'waiting' ? 0 : 1;
        if (leftStatus !== rightStatus) return leftStatus - rightStatus;
        const leftScope = left.scope === 'regional' ? 0 : 1;
        const rightScope = right.scope === 'regional' ? 0 : 1;
        if (leftScope !== rightScope) return leftScope - rightScope;
        return Number(right.updatedAt) - Number(left.updatedAt);
      })
      .slice(0, ROOM_DIRECTORY_MAX_RESULTS);

    return json({
      ok: true,
      schema: ROOM_DIRECTORY_SCHEMA,
      patch: ROOM_DIRECTORY_PATCH,
      region: requestRegion,
      rooms,
      refreshedAt: now
    });
  }

  async joinRoomListing(request, now) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }
    const listingId = cleanText(body?.listingId, 220);
    const joinToken = cleanText(body?.joinToken, 280);
    const playerId = cleanText(body?.playerId, 160);
    const protocol = Math.max(1, Math.trunc(Number(body?.protocol) || 0));
    const build = cleanText(body?.build, 120);
    const listing = this.state.rooms?.[listingId] || null;

    if (!listing || listing.joinToken !== joinToken) {
      return json({ ok: false, error: 'ROOM_LISTING_NOT_FOUND', message: 'This public room is no longer available.' }, { status: 404 });
    }
    if (
      !roomDirectoryListingVisible(listing, { now })
      || Number(listing.protocol) !== protocol
      || String(listing.build) !== build
    ) {
      return json({ ok: false, error: 'ROOM_LISTING_INCOMPATIBLE', message: 'This public room is no longer compatible or available.' }, { status: 409 });
    }
    if (!playerId) {
      return json({ ok: false, error: 'PLAYER_ID_REQUIRED' }, { status: 400 });
    }

    const admission = await this.verifyRoomDirectoryAdmission(listing, playerId, listingId);
    if (!admission.ok) {
      if ([
        'ROOM_NOT_PUBLIC',
        'HOST_UNAVAILABLE',
        'ROOM_LOCKED',
        'LATE_JOIN_DISABLED',
        'ROOM_UNAVAILABLE',
        'ROOM_FULL'
      ].includes(admission.error)) {
        delete this.state.rooms[listingId];
        await this.commit(now);
      }
      return json({
        ok: false,
        error: admission.error || 'ROOM_UNAVAILABLE',
        message: 'This public room is no longer available. The list has been refreshed.'
      }, { status: admission.status || 409 });
    }

    listing.reservedHumans = Math.max(0, Number(admission.reservedHumans) || 0);
    listing.updatedAt = now;
    listing.expiresAt = Math.max(Number(listing.expiresAt) || 0, now + 30_000);
    await this.commit(now);
    return json({
      ok: true,
      assignment: {
        roomCode: admission.roomCode,
        joinMode: 'join',
        listingId,
        status: admission.roomStatus,
        admissionToken: admission.admissionToken,
        admissionExpiresAt: admission.admissionExpiresAt
      }
    });
  }

  async verifyRoomDirectoryAdmission(listing, playerId, listingId) {
    if (!this.env.ROOMS) {
      return { ok: false, error: 'ROOM_BINDING_UNAVAILABLE', status: 503 };
    }
    try {
      const id = this.env.ROOMS.idFromName(listing.roomCode);
      const stub = this.env.ROOMS.get(id);
      const response = await stub.fetch(new Request('https://room.internal/directory-admission', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ka-internal-room-directory': '1'
        },
        body: JSON.stringify({ playerId, listingId })
      }));
      const payload = await response.json();
      return response.ok && payload?.ok === true
        ? {
            ok: true,
            roomCode: payload.roomCode,
            roomStatus: payload.status || 'waiting',
            admissionToken: payload.admissionToken,
            admissionExpiresAt: payload.admissionExpiresAt,
            reservedHumans: payload.reservedHumans
          }
        : {
            ok: false,
            error: payload?.error || 'ROOM_UNAVAILABLE',
            status: response.status
          };
    } catch (error) {
      return {
        ok: false,
        error: 'ROOM_DIRECTORY_VERIFICATION_FAILED',
        status: 503,
        detail: cleanText(error?.message || error, 180)
      };
    }
  }

  async enqueue(request, now) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }

    let normalized;
    try {
      normalized = normalizeMatchmakingRequest(body, {
        region: request.headers.get('x-ka-region') || 'ZZ',
        now
      });
    } catch (error) {
      return json({
        ok: false,
        error: cleanText(error?.message || error, 120) || 'INVALID_REQUEST'
      }, { status: 400 });
    }

    const existing = activeTicketForPlayer(
      this.state.tickets,
      normalized.playerId
    );
    if (existing) {
      if (
        normalized.resumeToken
        && normalized.resumeToken === existing.token
        && normalized.tabId === existing.tabId
      ) {
        return json({
          ...publicMatchmakingTicket(existing, {
            now,
            queueDepth: queuedCount(this.state.tickets)
          }),
          token: existing.token,
          resumed: true
        });
      }
      return json({
        ok: false,
        error: 'PLAYER_ALREADY_QUEUED',
        message: 'This player is already searching in another tab.'
      }, { status: 409 });
    }

    const ticket = {
      ...normalized,
      ticketId: makeSecret('ticket'),
      token: makeSecret('queue'),
      compatibilityKey: matchmakingCompatibilityKey(normalized),
      status: 'queued',
      queuedAt: now,
      expiresAt: now + MATCHMAKING_QUEUE_TTL_MS,
      fallbackAt: now + MATCHMAKING_GLOBAL_FALLBACK_MS,
      assignment: null,
      reason: null,
      updatedAt: now
    };

    const candidate = chooseMatchmakingCandidate(
      Object.values(this.state.tickets),
      ticket,
      { now }
    );

    if (candidate?.ticket) {
      const result = await this.createMatch(
        candidate.ticket,
        ticket,
        candidate.scope,
        now
      );
      if (!result.ok) {
        return json(result, { status: 503 });
      }
    }

    this.state.tickets[ticket.ticketId] = ticket;
    await this.commit(now);

    const stored = this.state.tickets[ticket.ticketId];
    return json({
      ...publicMatchmakingTicket(stored, {
        now,
        queueDepth: queuedCount(this.state.tickets)
      }),
      token: stored.token,
      resumed: false
    }, { status: stored.status === 'matched' ? 201 : 202 });
  }

  async createMatch(existing, incoming, scope, now) {
    const matchId = makeSecret('match');
    const roomCode = makeMatchmakingRoomCode();
    const region = scope === 'regional'
      ? normalizeMatchmakingRegion(existing.region)
      : 'GLOBAL';
    const assignmentBase = {
      matchId,
      roomCode,
      joinMode: 'join',
      mapId: incoming.mapId,
      difficulty: incoming.difficulty,
      maxPlayers: Math.min(existing.maxPlayers, incoming.maxPlayers),
      scope,
      region
    };

    const reservation = await this.reserveRoom({
      roomCode,
      matchId,
      mapId: assignmentBase.mapId,
      difficulty: assignmentBase.difficulty,
      maxPlayers: assignmentBase.maxPlayers,
      region,
      now
    });
    if (!reservation.ok) return reservation;

    existing.status = 'matched';
    existing.matchExpiresAt = now + MATCHMAKING_MATCH_TTL_MS;
    existing.assignment = {
      ...assignmentBase,
      connectAfterMs: 0
    };
    existing.updatedAt = now;

    incoming.status = 'matched';
    incoming.matchExpiresAt = now + MATCHMAKING_MATCH_TTL_MS;
    incoming.assignment = {
      ...assignmentBase,
      connectAfterMs: 140
    };
    incoming.updatedAt = now;

    this.state.tickets[existing.ticketId] = existing;
    return { ok: true };
  }

  async reserveRoom({
    roomCode,
    matchId,
    mapId,
    difficulty,
    maxPlayers,
    region,
    now
  }) {
    if (!this.env.ROOMS) {
      return {
        ok: false,
        error: 'ROOM_BINDING_UNAVAILABLE',
        message: 'The room service is unavailable.'
      };
    }

    try {
      const id = this.env.ROOMS.idFromName(roomCode);
      const stub = this.env.ROOMS.get(id);
      const response = await stub.fetch(
        new Request('https://room.internal/matchmaking-reserve', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-ka-internal-matchmaking': '1'
          },
          body: JSON.stringify({
            roomCode,
            matchId,
            mapId,
            difficulty,
            maxPlayers,
            region,
            reservedAt: now,
            expiresAt: now + MATCHMAKING_MATCH_TTL_MS
          })
        })
      );
      if (!response.ok) {
        return {
          ok: false,
          error: 'ROOM_RESERVATION_FAILED',
          message: `Room reservation returned HTTP ${response.status}.`
        };
      }
      const payload = await response.json();
      return payload?.ok === true
        ? { ok: true }
        : {
            ok: false,
            error: payload?.error || 'ROOM_RESERVATION_FAILED',
            message: payload?.message || 'The public room could not be reserved.'
          };
    } catch (error) {
      return {
        ok: false,
        error: 'ROOM_RESERVATION_FAILED',
        message: cleanText(error?.message || error, 180)
      };
    }
  }

  status(url, now) {
    const ticket = ticketByCredentials(
      this.state.tickets,
      url.searchParams.get('ticketId'),
      url.searchParams.get('token')
    );
    if (!ticket) {
      return json({
        ok: false,
        error: 'TICKET_NOT_FOUND'
      }, { status: 404 });
    }
    return json(publicMatchmakingTicket(ticket, {
      now,
      queueDepth: queuedCount(this.state.tickets)
    }));
  }

  async cancel(url, now) {
    const ticket = ticketByCredentials(
      this.state.tickets,
      url.searchParams.get('ticketId'),
      url.searchParams.get('token')
    );
    if (!ticket) {
      return json({
        ok: false,
        error: 'TICKET_NOT_FOUND'
      }, { status: 404 });
    }

    if (ticket.status === 'matched' && ticket.assignment?.matchId) {
      Object.values(this.state.tickets).forEach((peer) => {
        if (
          peer.ticketId !== ticket.ticketId
          && peer.status === 'matched'
          && peer.assignment?.matchId === ticket.assignment.matchId
        ) {
          peer.status = 'queued';
          peer.assignment = null;
          peer.matchExpiresAt = null;
          peer.queuedAt = now;
          peer.expiresAt = now + MATCHMAKING_QUEUE_TTL_MS;
          peer.fallbackAt = now + MATCHMAKING_GLOBAL_FALLBACK_MS;
          peer.reason = 'peer-cancelled';
          peer.updatedAt = now;
        }
      });
    }

    ticket.status = 'cancelled';
    ticket.reason = 'cancelled-by-player';
    ticket.cancelledAt = now;
    ticket.updatedAt = now;
    await this.commit(now);

    return json(publicMatchmakingTicket(ticket, {
      now,
      queueDepth: queuedCount(this.state.tickets)
    }));
  }

  async acknowledge(request, now) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }

    const ticket = ticketByCredentials(
      this.state.tickets,
      body?.ticketId,
      body?.token
    );
    if (!ticket) {
      return json({
        ok: false,
        error: 'TICKET_NOT_FOUND'
      }, { status: 404 });
    }

    if (ticket.status === 'matched') {
      ticket.status = 'completed';
      ticket.completedAt = now;
      ticket.updatedAt = now;
      await this.commit(now);
    }

    return json(publicMatchmakingTicket(ticket, {
      now,
      queueDepth: queuedCount(this.state.tickets)
    }));
  }

  async cleanup(now, { persist = false } = {}) {
    const cleanedTickets = cleanupMatchmakingTickets(this.state.tickets, { now });
    const cleanedRooms = cleanupRoomDirectory(this.state.rooms, { now });
    if (cleanedTickets.changed || cleanedRooms.changed) {
      this.state.tickets = cleanedTickets.tickets;
      this.state.rooms = cleanedRooms.listings;
      await this.commit(now);
      return;
    }
    if (persist) await this.commit(now);
    await this.scheduleAlarm(now);
  }

  async commit(now = Date.now()) {
    this.state.revision = Math.max(0, Number(this.state.revision) || 0) + 1;
    this.state.updatedAt = now;
    await this.ctx.storage.put(STATE_KEY, this.state);
    await this.scheduleAlarm(now);
  }

  async scheduleAlarm(now = Date.now()) {
    const activeTickets = Object.values(this.state.tickets).some((ticket) => (
      ['queued', 'matched', 'completed', 'cancelled', 'expired']
        .includes(ticket?.status)
    ));
    const activeRooms = Object.keys(this.state.rooms || {}).length > 0;
    const active = activeTickets || activeRooms;
    if (!active) return;
    try {
      await this.ctx.storage.setAlarm(now + 15_000);
    } catch {
      // Alarm scheduling is best-effort; requests also run cleanup.
    }
  }

  async alarm() {
    await this.cleanup(Date.now(), { persist: true });
  }
}
