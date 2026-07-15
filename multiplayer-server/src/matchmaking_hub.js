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
    if (request.method === 'GET' && url.pathname === '/matchmaking/health') {
      return json({
        ok: true,
        schema: MATCHMAKING_SCHEMA,
        patch: MATCHMAKING_PATCH,
        queued: queuedCount(this.state.tickets),
        revision: this.state.revision
      });
    }

    return json({
      ok: false,
      error: 'MATCHMAKING_ENDPOINT_NOT_FOUND'
    }, { status: 404 });
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
    const cleaned = cleanupMatchmakingTickets(this.state.tickets, { now });
    if (cleaned.changed) {
      this.state.tickets = cleaned.tickets;
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
    const active = Object.values(this.state.tickets).some((ticket) => (
      ['queued', 'matched', 'completed', 'cancelled', 'expired']
        .includes(ticket?.status)
    ));
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
