// multiplayer-server/src/matchmaking_hub.js
// MATCH.3 R1 — party-aware quality matchmaking and room discovery Durable Object.

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
  PVP2_MODE,
  PVP2_PATCH,
  PVP2_SCHEMA,
  applyPvp2MatchResult,
  pvp2FeatureEnabled,
  publicPvp2Stats,
  rankPvp2Leaderboard
} from './pvp2_core.js';
import {
  ROOM_DIRECTORY_MAX_RESULTS,
  ROOM_DIRECTORY_PATCH,
  ROOM_DIRECTORY_SCHEMA,
  cleanupRoomDirectory,
  filterAndSortPublicRoomDirectory,
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
      pvp2Stats: {},
      pvp2Results: {},
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
          pvp2Stats: stored.pvp2Stats && typeof stored.pvp2Stats === 'object'
            ? stored.pvp2Stats
            : {},
          pvp2Results: stored.pvp2Results && typeof stored.pvp2Results === 'object'
            ? stored.pvp2Results
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
    if (request.method === 'POST' && url.pathname === '/matchmaking/rooms/find') {
      return this.findRoomListing(request, now);
    }
    if (request.method === 'GET' && url.pathname === '/pvp2/stats') {
      return this.pvp2Stats(url, now);
    }
    if (request.method === 'GET' && url.pathname === '/pvp2/leaderboard') {
      return this.pvp2Leaderboard(url, request, now);
    }
    if (request.method === 'POST' && url.pathname === '/pvp2/result') {
      return this.pvp2Result(request, now);
    }
    if (request.method === 'GET' && url.pathname === '/matchmaking/health') {
      return json({
        ok: true,
        schema: MATCHMAKING_SCHEMA,
        patch: MATCHMAKING_PATCH,
        queued: queuedCount(this.state.tickets),
        pvpQueued: Object.values(this.state.tickets || {}).filter((ticket) => ticket?.status === 'queued' && ticket?.mode === PVP2_MODE).length,
        pvp2: {
          schema: PVP2_SCHEMA,
          patch: PVP2_PATCH,
          publicMatchmakingEnabled: pvp2FeatureEnabled(this.env.PVP2_PUBLIC_MATCHMAKING_ENABLED),
          competitivePlayers: Object.keys(this.state.pvp2Stats || {}).length
        },
        pvp3: {
          schema: 1,
          patch: 'pvp3-r1-public-room-discovery-matchmaking-repair',
          difficultyFreePvpDiscovery: true,
          atomicOpenRoomFind: true,
          ratedQuickMatchSeparatedFromUnrankedRooms: true,
          endpoints: ['/matchmaking/rooms/list', '/matchmaking/rooms/find', '/matchmaking/rooms/join']
        },
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
    const filters = {
      gameMode: url.searchParams.get('gameMode') || 'any',
      mapId: url.searchParams.get('mapId') || '',
      difficulty: url.searchParams.get('difficulty') || '',
      status: url.searchParams.get('status') || 'any',
      regionScope: url.searchParams.get('regionScope') || 'any',
      bot: url.searchParams.get('bot') || 'any',
      joinInProgress: url.searchParams.get('joinInProgress') !== '0',
      requiredSlots: Math.max(
        1,
        Math.min(2, Math.trunc(Number(url.searchParams.get('requiredSlots')) || 1))
      ),
      searchPriority: url.searchParams.get('searchPriority') || 'balanced'
    };
    const rooms = filterAndSortPublicRoomDirectory(
      Object.values(this.state.rooms || {})
        .filter((listing) => (
          roomDirectoryListingVisible(listing, { now })
          && Number(listing.protocol) === protocol
          && String(listing.build) === build
        ))
        .map((listing) => publicRoomDirectoryEntry(listing, { requestRegion, now })),
      filters,
      { now }
    );

    return json({
      ok: true,
      schema: ROOM_DIRECTORY_SCHEMA,
      patch: ROOM_DIRECTORY_PATCH,
      region: requestRegion,
      filters,
      rooms,
      refreshedAt: now
    });
  }

  async findRoomListing(request, now) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }
    const playerId = cleanText(body?.playerId, 160);
    const protocol = Math.max(1, Math.trunc(Number(body?.protocol) || 0));
    const build = cleanText(body?.build, 120);
    const partySize = Math.max(1, Math.min(2, Math.trunc(Number(body?.partySize) || 1)));
    const gameMode = String(body?.gameMode || '').trim().toLowerCase() === PVP2_MODE
      ? PVP2_MODE
      : 'coop';
    if (!playerId || !protocol || !build) {
      return json({ ok: false, error: 'DIRECTORY_COMPATIBILITY_REQUIRED' }, { status: 400 });
    }
    if (partySize > 1) {
      return json({
        ok: false,
        error: 'PARTY_OPEN_ROOM_RESERVATION_UNSUPPORTED',
        message: 'Open Room discovery currently supports one joining player.'
      }, { status: 409 });
    }
    const requestRegion = String(request.headers.get('x-ka-region') || 'ZZ')
      .toUpperCase().slice(0, 16);
    const filters = {
      gameMode,
      mapId: cleanText(body?.mapId, 80),
      difficulty: gameMode === PVP2_MODE ? null : (body?.difficulty ?? null),
      status: gameMode === PVP2_MODE ? 'waiting' : 'any',
      regionScope: 'any',
      bot: gameMode === PVP2_MODE ? 'without-bot' : 'any',
      joinInProgress: gameMode !== PVP2_MODE,
      requiredSlots: 1,
      searchPriority: ['quality', 'balanced', 'fast'].includes(body?.searchPriority)
        ? body.searchPriority
        : 'balanced'
    };
    const candidates = filterAndSortPublicRoomDirectory(
      Object.values(this.state.rooms || {})
        .filter((listing) => (
          roomDirectoryListingVisible(listing, { now })
          && Number(listing.protocol) === protocol
          && String(listing.build) === build
        ))
        .map((listing) => publicRoomDirectoryEntry(listing, { requestRegion, now })),
      filters,
      { now }
    );
    for (const entry of candidates) {
      const listing = this.state.rooms?.[entry.listingId] || null;
      if (!listing) continue;
      const admission = await this.verifyRoomDirectoryAdmission(
        listing,
        playerId,
        entry.listingId
      );
      if (!admission.ok) {
        if (['ROOM_NOT_PUBLIC','HOST_UNAVAILABLE','ROOM_LOCKED','LATE_JOIN_DISABLED','ROOM_UNAVAILABLE','ROOM_FULL'].includes(admission.error)) {
          delete this.state.rooms[entry.listingId];
        }
        continue;
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
          listingId: entry.listingId,
          status: admission.roomStatus,
          admissionToken: admission.admissionToken,
          admissionExpiresAt: admission.admissionExpiresAt,
          gameMode,
          ranked: false,
          partySize: 1,
          quality: entry.quality || (entry.scope === 'regional' ? 'excellent' : 'compatible')
        }
      });
    }
    if (candidates.length) await this.commit(now);
    return json({
      ok: false,
      error: 'NO_OPEN_ROOM_AVAILABLE',
      message: gameMode === PVP2_MODE
        ? 'No open unranked PvP room is available. Create one or use Rated Quick Match.'
        : 'No compatible open Co-Op room is available.'
    }, { status: 404 });
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
    const partySize = Math.max(1, Math.min(2, Math.trunc(Number(body?.partySize) || 1)));
    const listing = this.state.rooms?.[listingId] || null;
    if (partySize > 1) {
      return json({
        ok: false,
        error: 'PARTY_OPEN_ROOM_RESERVATION_UNSUPPORTED',
        message: 'Use Party Quick Match or create a party room to keep the party together.'
      }, { status: 409 });
    }

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
        admissionExpiresAt: admission.admissionExpiresAt,
        gameMode: listing.gameMode === 'pvp-team-elimination'
          ? 'pvp-team-elimination'
          : 'coop',
        ranked: listing.ranked === true,
        partySize: 1,
        quality: listing.region === String(request.headers.get('x-ka-region') || 'ZZ').toUpperCase().slice(0, 16)
          ? 'excellent'
          : 'compatible'
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

  async resolvePartyClaim(normalized) {
    if (!normalized?.partyTicket) {
      return {
        partyId: '',
        partySize: 1,
        leaderSocialId: '',
        memberSocialIds: []
      };
    }
    if (!this.env.SOCIAL) {
      throw new Error('PARTY_SOCIAL_BINDING_UNAVAILABLE');
    }
    const id = this.env.SOCIAL.idFromName('global-v1');
    const response = await this.env.SOCIAL.get(id).fetch(
      new Request('https://social.internal/internal/social/party/matchmaking/consume', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ka-internal-matchmaking-social': '1'
        },
        body: JSON.stringify({
          ticket: normalized.partyTicket,
          playerId: normalized.playerId,
          tabId: normalized.tabId,
          protocol: normalized.protocol,
          build: normalized.build
        })
      })
    );
    const value = await response.json().catch(() => ({}));
    if (!response.ok || value.ok !== true) {
      throw new Error(String(value.error || 'PARTY_TICKET_REJECTED'));
    }
    const claim = value.claim || {};
    const partySize = Math.max(1, Math.min(2, Math.trunc(Number(claim.memberCount) || 1)));
    if (!claim.partyId || partySize < 1) {
      throw new Error('PARTY_TICKET_INCOMPLETE');
    }
    return {
      partyId: String(claim.partyId).slice(0, 120),
      partySize,
      leaderSocialId: String(claim.leaderSocialId || '').slice(0, 48),
      memberSocialIds: Array.isArray(claim.memberSocialIds)
        ? claim.memberSocialIds.map((entry) => String(entry || '').slice(0, 48)).filter(Boolean).slice(0, 2)
        : []
    };
  }

  async tryBackfill(ticket, now) {
    if (
      ticket.partySize !== 1
      || ticket.allowBackfill !== true
    ) return false;

    const candidates = filterAndSortPublicRoomDirectory(
      Object.values(this.state.rooms || {})
        .filter((listing) => (
          roomDirectoryListingVisible(listing, { now })
          && Number(listing.protocol) === Number(ticket.protocol)
          && String(listing.build) === String(ticket.build)
        ))
        .map((listing) => publicRoomDirectoryEntry(listing, {
          requestRegion: ticket.region,
          now
        })),
      {
        gameMode: ticket.mode === 'pvp-team-elimination'
          ? 'pvp-team-elimination'
          : 'coop',
        mapId: ticket.mapId,
        difficulty: ticket.difficulty,
        status: ticket.joinInProgress === true ? 'any' : 'waiting',
        regionScope: ticket.regionPolicy === 'regional-only'
          ? 'regional'
          : 'any',
        bot: 'any',
        joinInProgress: ticket.joinInProgress === true,
        requiredSlots: 1,
        searchPriority: ticket.searchPriority
      },
      { now }
    );

    for (const entry of candidates) {
      const listing = this.state.rooms?.[entry.listingId] || null;
      if (!listing) continue;
      const admission = await this.verifyRoomDirectoryAdmission(
        listing,
        ticket.playerId,
        entry.listingId
      );
      if (!admission.ok) {
        if (['ROOM_NOT_PUBLIC', 'HOST_UNAVAILABLE', 'ROOM_LOCKED', 'LATE_JOIN_DISABLED', 'ROOM_UNAVAILABLE', 'ROOM_FULL'].includes(admission.error)) {
          delete this.state.rooms[entry.listingId];
        }
        continue;
      }
      listing.reservedHumans = Math.max(0, Number(admission.reservedHumans) || 0);
      listing.updatedAt = now;
      listing.expiresAt = Math.max(Number(listing.expiresAt) || 0, now + 30_000);
      ticket.status = 'matched';
      ticket.matchExpiresAt = now + MATCHMAKING_MATCH_TTL_MS;
      ticket.assignment = {
        matchId: makeSecret('backfill'),
        roomCode: admission.roomCode,
        joinMode: 'join',
        connectAfterMs: 0,
        mapId: listing.mapId,
        difficulty: listing.difficulty,
        maxPlayers: listing.maxPlayers,
        scope: entry.scope,
        region: listing.region || ticket.region,
        admissionToken: admission.admissionToken,
        admissionExpiresAt: admission.admissionExpiresAt,
        backfill: true,
        partySize: 1,
        quality: entry.quality || 'compatible'
      };
      ticket.updatedAt = now;
      return true;
    }
    return false;
  }

  async createPartyMatch(ticket, now) {
    const matchId = makeSecret('party-match');
    const roomCode = makeMatchmakingRoomCode();
    const region = ticket.regionPolicy === 'global'
      ? 'GLOBAL'
      : normalizeMatchmakingRegion(ticket.region);
    const reservation = await this.reserveRoom({
      roomCode,
      matchId,
      mapId: ticket.mapId,
      difficulty: ticket.difficulty,
      maxPlayers: 2,
      region,
      now
    });
    if (!reservation.ok) return reservation;
    ticket.status = 'matched';
    ticket.matchExpiresAt = now + MATCHMAKING_MATCH_TTL_MS;
    ticket.assignment = {
      matchId,
      roomCode,
      joinMode: 'join',
      connectAfterMs: 0,
      mapId: ticket.mapId,
      difficulty: ticket.difficulty,
      maxPlayers: 2,
      scope: ticket.regionPolicy === 'global' ? 'global' : 'party',
      region,
      backfill: false,
      partySize: ticket.partySize,
      quality: 'party-ready'
    };
    ticket.updatedAt = now;
    return { ok: true };
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

    if (
      normalized.mode === PVP2_MODE
      && !pvp2FeatureEnabled(this.env.PVP2_PUBLIC_MATCHMAKING_ENABLED)
    ) {
      return json({
        ok: false,
        error: 'PVP2_PUBLIC_MATCHMAKING_DISABLED',
        message: 'Public PvP matchmaking is temporarily disabled. Private PvP, Solo, and Co-Op remain available.'
      }, { status: 503 });
    }

    try {
      const partyClaim = normalized.mode === PVP2_MODE
        ? { partyId: '', partySize: 1, leaderSocialId: '', memberSocialIds: [] }
        : await this.resolvePartyClaim(normalized);
      normalized = Object.freeze({
        ...normalized,
        partyId: partyClaim.partyId,
        partySize: partyClaim.partySize,
        leaderSocialId: partyClaim.leaderSocialId,
        memberSocialIds: partyClaim.memberSocialIds
      });
    } catch (error) {
      return json({
        ok: false,
        error: cleanText(error?.message || error, 120) || 'PARTY_TICKET_REJECTED',
        message: 'The party changed or its matchmaking ticket expired.'
      }, { status: 409 });
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
      fallbackAt: normalized.regionPolicy === 'regional-only'
        ? 0
        : normalized.regionPolicy === 'global'
          ? now
          : now + normalized.globalExpansionMs,
      assignment: null,
      reason: null,
      updatedAt: now
    };

    if (ticket.partySize > 1) {
      const result = await this.createPartyMatch(ticket, now);
      if (!result.ok) return json(result, { status: 503 });
    } else {
      const backfilled = ticket.mode === PVP2_MODE
        ? false
        : await this.tryBackfill(ticket, now);
      if (!backfilled) {
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
            now,
            candidate.qualityScore
          );
          if (!result.ok) return json(result, { status: 503 });
        }
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

  async createMatch(existing, incoming, scope, now, qualityScore = 0) {
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
      region,
      backfill: false,
      partySize: 1,
      quality: scope === 'regional'
        ? qualityScore >= 100 ? 'excellent' : 'good'
        : 'expanded',
      gameMode: incoming.mode === PVP2_MODE ? PVP2_MODE : 'coop',
      publicPvp: incoming.mode === PVP2_MODE
    };

    const reservation = await this.reserveRoom({
      roomCode,
      matchId,
      mapId: assignmentBase.mapId,
      difficulty: assignmentBase.difficulty,
      maxPlayers: assignmentBase.maxPlayers,
      region,
      gameMode: assignmentBase.gameMode,
      publicPvp: assignmentBase.publicPvp,
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
    gameMode = 'coop',
    publicPvp = false,
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
            gameMode,
            publicPvp: publicPvp === true,
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
          peer.fallbackAt = peer.regionPolicy === 'regional-only'
            ? 0
            : peer.regionPolicy === 'global'
              ? now
              : now + Math.max(
                  0,
                  Number(peer.globalExpansionMs) || MATCHMAKING_GLOBAL_FALLBACK_MS
                );
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

  pvp2Stats(url, now) {
    const playerId = cleanText(url.searchParams.get('playerId'), 160);
    if (!playerId) return json({ ok: false, error: 'PLAYER_ID_REQUIRED' }, { status: 400 });
    const stats = this.state.pvp2Stats?.[playerId] || {
      playerId,
      displayName: 'Player',
      region: 'ZZ',
      rating: 1000,
      bestRating: 1000,
      updatedAt: now
    };
    return json({ ok: true, schema: PVP2_SCHEMA, patch: PVP2_PATCH, stats: publicPvp2Stats(stats) });
  }

  pvp2Leaderboard(url, request, now) {
    const scope = url.searchParams.get('scope') === 'regional' ? 'regional' : 'global';
    const region = String(
      url.searchParams.get('region')
      || request.headers.get('x-ka-region')
      || 'ZZ'
    ).toUpperCase().slice(0, 16);
    const limit = Math.max(1, Math.min(100, Math.trunc(Number(url.searchParams.get('limit')) || 50)));
    return json({
      ok: true,
      schema: PVP2_SCHEMA,
      patch: PVP2_PATCH,
      scope,
      region,
      entries: rankPvp2Leaderboard(this.state.pvp2Stats, { scope, region, limit }),
      refreshedAt: now
    });
  }

  async pvp2Result(request, now) {
    if (request.headers.get('x-ka-internal-pvp2-result') !== '1') {
      return json({ ok: false, error: 'PVP2_RESULT_FORBIDDEN' }, { status: 403 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
    }
    try {
      const applied = applyPvp2MatchResult({
        statsByPlayer: this.state.pvp2Stats,
        resultLedger: this.state.pvp2Results,
        result: body,
        now
      });
      this.state.pvp2Stats = applied.statsByPlayer;
      this.state.pvp2Results = applied.resultLedger;
      if (applied.applied) await this.commit(now);
      return json({
        ok: true,
        schema: PVP2_SCHEMA,
        patch: PVP2_PATCH,
        applied: applied.applied,
        duplicate: applied.duplicate,
        result: applied.result
      });
    } catch (error) {
      return json({ ok: false, error: cleanText(error?.message || error, 120) }, { status: 400 });
    }
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
