// multiplayer-server/src/index.js

import { DurableObject } from 'cloudflare:workers';
import { LeaderboardHub } from './leaderboard_hub.js';
import { CloudProfileHub, CLOUD_PROFILE_SERVER_INFO } from './cloud_profile_hub.js'; import { buildTextChatMessage, consumeTextChatRate, sanitizeTextChatText } from './text_chat_core.js';

export { LeaderboardHub, CloudProfileHub };

const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;
const MAX_PLAYERS = 4;
const MAX_MESSAGE_BYTES = 64 * 1024;
const RATE_LIMIT_PER_SECOND = 180;
const DISCONNECT_GRACE_MS = 45_000;
const CHECKPOINT_WRITE_INTERVAL_MS = 750;
const SERVER_PROTOCOL = 6;
const SERVER_BUILD = 'm5-coop-voice-readiness-r1';
const SERVER_PATCH = 'm5-coop-voice-readiness-r1';
const CERTIFIED_FRONTEND_SHA = 'c0e1b744dbb25ec236b8a532903707da6e1571d1';
const RELEASE_STATUS = 'CERTIFIED';
const COMPATIBLE_PROTOCOLS = new Set([5, 6]);

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, authorization, x-ka-account-id, x-ka-device-id, x-ka-client-time, x-ka-operation-id');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
}

function safeName(value) {
  return String(value || 'Player')
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, 24) || 'Player';
}
function normalizeMaxPlayers(value) {
  return Math.max(2, Math.min(4, Math.floor(Number(value) || 4)));
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function messageBytes(message) {
  if (typeof message === 'string') {
    return new TextEncoder().encode(message).byteLength;
  }
  if (message instanceof ArrayBuffer) return message.byteLength;
  if (ArrayBuffer.isView(message)) return message.byteLength;
  return Number.POSITIVE_INFINITY;
}

function parseAllowedOrigins(value) {
  const text = String(value || '*').trim();
  if (!text || text === '*') return null;
  return new Set(
    text.split(',').map((origin) => origin.trim()).filter(Boolean)
  );
}

function originAllowed(request, env) {
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (!allowed) return true;
  const origin = request.headers.get('origin');
  return !origin || allowed.has(origin);
}

function corsify(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, authorization, x-ka-account-id, x-ka-device-id, x-ka-client-time, x-ka-operation-id');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function shortRequestHash(request) {
  const source = `${request.headers.get('cf-connecting-ip') || 'unknown'}|${request.headers.get('user-agent') || 'unknown'}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function proxyLeaderboardRequest(request, env) {
  if (!env.LEADERBOARDS) return json({ ok: false, error: 'LEADERBOARD_BINDING_UNAVAILABLE' }, { status: 503 });
  const sourceUrl = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set('x-ka-region', String(request.cf?.country || 'ZZ'));
  headers.set('x-ka-rate-key', await shortRequestHash(request));
  headers.delete('cf-connecting-ip');
  const internal = new Request(`https://leaderboards.internal${sourceUrl.pathname}${sourceUrl.search}`, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual'
  });
  const id = env.LEADERBOARDS.idFromName('global-v1');
  const response = await env.LEADERBOARDS.get(id).fetch(internal);
  return corsify(response);
}

async function proxyCloudProfileRequest(request, env) {
  if (!env.CLOUD_PROFILES) return json({ ok: false, error: 'CLOUD_PROFILE_BINDING_UNAVAILABLE' }, { status: 503 });
  const sourceUrl = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set('x-ka-rate-key', await shortRequestHash(request));
  headers.set('x-ka-region', String(request.cf?.country || 'ZZ'));
  const requestOrigin = String(request.headers.get('origin') || '').trim();
  headers.set('x-ka-origin', requestOrigin);
  try {
    headers.set('x-ka-rp-id', requestOrigin ? new URL(requestOrigin).hostname.toLowerCase() : '');
  } catch {
    headers.set('x-ka-rp-id', '');
  }
  headers.delete('cf-connecting-ip');
  const internal = new Request(`https://profiles.internal${sourceUrl.pathname}${sourceUrl.search}`, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual'
  });
  const id = env.CLOUD_PROFILES.idFromName('global-v1');
  const response = await env.CLOUD_PROFILES.get(id).fetch(internal);
  return corsify(response);
}

function publicPlayer(player) {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    ready: player.ready === true,
    connected: player.connected === true,
    isHost: player.isHost === true, joinedAt: Math.max(0, Number(player.joinedAt) || 0), joinedWave: Math.max(1, Math.floor(Number(player.joinedWave) || 1)), lateJoin: player.lateJoin === true, lateJoinProtectionUntil: Math.max(0, Number(player.lateJoinProtectionUntil) || 0), catchUpScore: Math.max(0, Math.floor(Number(player.catchUpScore) || 0)), connectionEpoch: Math.max(1, Math.floor(Number(player.connectionEpoch) || 1))
  };
}

function validStatsSnapshot(value) {
  return Boolean(value && Array.isArray(value.players) && value.team);
}

function validFinalSummary(value) {
  return Boolean(value && Array.isArray(value.players) && value.team);
}

function defaultRoom(roomCode) {
  return {
    roomId: makeId('room'),
    roomCode,
    sessionId: makeId('session'),
    status: 'waiting',
    hostPlayerId: null,
    settings: { maxPlayers: MAX_PLAYERS, mapId: 'grid_bunker', difficulty: 1, privacy: 'private', locked: false, allowLateJoin: true },
    players: {}, kickedPlayers: {},
    runId: null,
    authorityEpoch: 0,
    authorityCheckpoint: null,
    finalSummary: null,
    revision: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export class ArenaRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.lastCheckpointWriteAt = 0;

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ka-ping', 'ka-pong')
    );

    this.ctx.blockConcurrencyWhile(async () => {
      this.room = await this.ctx.storage.get('room') || null;
      if (this.room) {
        this.reconcileConnections();
      }
      if (this.room) {
        this.room.settings ||= {};
        this.room.settings.maxPlayers = normalizeMaxPlayers(
          this.room.settings.maxPlayers
        );
        this.room.settings.locked =
          this.room.settings.locked === true;
        this.room.settings.allowLateJoin =
          this.room.settings.allowLateJoin !== false;
        this.room.kickedPlayers ||= {};
      }
    });
  }

  reconcileConnections() {
    if (!this.room) return;
    const connected = new Set();

    this.ctx.getWebSockets().forEach((socket) => {
      try {
        const attachment = socket.deserializeAttachment();
        if (attachment?.playerId) connected.add(attachment.playerId);
      } catch {
        // Ignore malformed old attachments.
      }
    });

    Object.values(this.room.players || {}).forEach((player) => {
      player.connected = connected.has(player.playerId);
    });
  }

  async fetch(request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'Expected WebSocket upgrade.' }, { status: 426 });
    }

    const url = new URL(request.url);
    const roomCode = normalizeRoomCode(url.searchParams.get('room'));
    const playerId = String(url.searchParams.get('playerId') || '').slice(0, 160);
    const displayName = safeName(url.searchParams.get('name'));
    const mode = url.searchParams.get('mode') === 'create' ? 'create' : 'join';
    const reconnectToken = String(
      url.searchParams.get('reconnectToken') || ''
    ).slice(0, 160);

    if (!ROOM_CODE_PATTERN.test(roomCode) || !playerId) {
      return json(
        { error: 'Invalid room code or player ID.' },
        { status: 400 }
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [`player:${playerId}`]);

    const rejection = this.validateAdmission({
      roomCode,
      playerId,
      mode,
      reconnectToken
    });

    if (rejection) {
      server.serializeAttachment({
        playerId,
        rejected: true,
        connectedAt: Date.now()
      });
      server.send(JSON.stringify({
        kind: 'control',
        action: 'error',
        payload: { message: rejection }
      }));
      server.close(4001, rejection.slice(0, 120));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (
      !this.room
      || (
        this.connectedPlayers().length === 0
        && mode === 'create'
        && !this.room.players?.[playerId]
      )
    ) {
      this.room = defaultRoom(roomCode);
    }

    const existing = this.room.players[playerId] || null; const connectionEpoch = Math.max(1, Math.floor(Number(existing?.connectionEpoch) || 0) + 1);
    const isLateJoin = this.room.status === 'in-run' && !existing;
    const joinedWave = Math.max(
      1,
      Math.floor(
        Number(this.room.authorityCheckpoint?.world?.wave) || 1
      )
    );
    const catchUpScore = isLateJoin
      ? Math.max(500, Math.min(3500, 500 + (joinedWave - 1) * 250))
      : Math.max(0, Math.floor(Number(existing?.catchUpScore) || 0));
    const lateJoinProtectionUntil = isLateJoin
      ? Date.now() + 8_000
      : Math.max(
          0,
          Number(existing?.lateJoinProtectionUntil) || 0
        );
    const previousHostPlayerId = this.room.hostPlayerId || null;
    const token = existing?.reconnectToken || makeId('reconnect');
    const isFirstPlayer = this.connectedPlayers().length === 0;
    const isHost = existing?.isHost === true
      || !this.room.hostPlayerId
      || isFirstPlayer;

    if (isHost) {
      Object.values(this.room.players).forEach((player) => {
        player.isHost = false;
      });
      this.room.hostPlayerId = playerId;
      if (
        this.room.status === 'in-run'
        && previousHostPlayerId !== playerId
      ) {
        this.room.authorityEpoch = Math.max(
          0,
          Number(this.room.authorityEpoch) || 0
        ) + 1;
      }
    }

    this.closeDuplicateSocket(playerId, server);

    this.room.players[playerId] = {
      playerId,
      displayName,
      ready: isHost ? true : existing?.ready === true,
      connected: true,
      isHost,
      reconnectToken: token, connectionEpoch,
      disconnectedAt: null,
      disconnectExpiresAt: null,
      joinedAt: existing?.joinedAt || Date.now(), joinedWave: isLateJoin ? joinedWave : Math.max(1, Math.floor(Number(existing?.joinedWave) || 1)), lateJoin: isLateJoin || existing?.lateJoin === true, lateJoinProtectionUntil, catchUpScore,
      lastSeenAt: Date.now()
    };

    server.serializeAttachment({ playerId, reconnectToken: token, connectionEpoch,
      windowStartedAt: Date.now(),
      messagesInWindow: 0,
      connectedAt: Date.now()
    });

    await this.commit();

    server.send(JSON.stringify({
      kind: 'control',
      action: 'welcome',
      payload: {
        sessionId: this.room.sessionId,
        protocol: SERVER_PROTOCOL,
        build: SERVER_BUILD,
        reconnectToken: token, connectionEpoch,
        checkpoint: this.room.status === 'in-run'
          ? this.room.authorityCheckpoint
          : null, lateJoin: isLateJoin ? { playerId, joinedWave, catchUpScore, protectionUntil: lateJoinProtectionUntil, protectionMs: 8000 } : null,
        room: this.snapshot()
      }
    }));

    if (
      this.room.status === 'in-run'
      && isHost
      && previousHostPlayerId !== playerId
    ) {
      this.broadcastHostMigration({
        previousHostPlayerId,
        hostPlayerId: playerId,
        reason: 'host-reconnected-or-elected'
      });
    }
    this.broadcastRoomState();
    return new Response(null, { status: 101, webSocket: client });
  }

  validateAdmission({ roomCode, playerId, mode, reconnectToken }) {
    if (!this.room) {
      return mode === 'join' ? 'Room was not found.' : null;
    }

    const connected = this.connectedPlayers();
    const existing = this.room.players?.[playerId];

    if (mode === 'create' && connected.length > 0) {
      return 'Room code is already in use. Create another room.';
    }

    if (this.room.roomCode !== roomCode) {
      return 'Room code mismatch.';
    }

    const maxPlayers = normalizeMaxPlayers(
      this.room.settings?.maxPlayers
    );
    const kickedUntil = Number(
      this.room.kickedPlayers?.[playerId] || 0
    );
    if (!existing && kickedUntil > Date.now()) {
      return 'You were removed from this room by the host.';
    }
    if (!existing && this.room.settings?.locked === true) {
      return 'This room is locked by the host.';
    }
    if (
      !existing
      && this.room.status === 'in-run'
      && this.room.settings?.allowLateJoin === false
    ) {
      return 'Late joining is disabled for this run.';
    }
    if (!existing && connected.length >= maxPlayers) {
      return 'Room is full.';
    }

    if (existing) {
      const tokenMatches = Boolean(
        reconnectToken
        && existing.reconnectToken
        && reconnectToken === existing.reconnectToken
      );
      if (existing.connected && !tokenMatches) {
        return 'This player is already connected.';
      }
      if (!existing.connected && existing.reconnectToken && !tokenMatches) {
        return 'Reconnect token was rejected. Rejoin with a new browser session.';
      }
    }



    return null;
  }

  closeDuplicateSocket(playerId, keepSocket) {
    this.ctx.getWebSockets(`player:${playerId}`).forEach((socket) => {
      if (socket === keepSocket) return;
      try {
        socket.send(JSON.stringify({
          kind: 'control',
          action: 'error',
          payload: { message: 'Connection replaced by a reconnect.' }
        }));
        socket.close(4002, 'Reconnected elsewhere');
      } catch {
        // Ignore already-closed sockets.
      }
    });
  }

  connectedPlayers() {
    if (!this.room) return [];
    return Object.values(this.room.players || {}).filter(
      (player) => player.connected === true
    );
  }

  snapshot() {
    return {
      roomId: this.room.roomId,
      roomCode: this.room.roomCode,
      status: this.room.status,
      hostPlayerId: this.room.hostPlayerId,
      settings: { ...this.room.settings },
      players: Object.values(this.room.players).map(publicPlayer),
      runId: this.room.runId,
      authorityEpoch: Math.max(0, Number(this.room.authorityEpoch) || 0),
      revision: this.room.revision,
      finalSummary: this.room.finalSummary || null
    };
  }

  async webSocketMessage(socket, message) {
    if (!this.room || messageBytes(message) > MAX_MESSAGE_BYTES) {
      socket.close(1009, 'Message too large');
      return;
    }

    const attachment = this.readAttachment(socket);
    if (!attachment?.playerId || attachment.rejected) return;

    if (!this.consumeRateLimit(socket, attachment)) {
      socket.close(4008, 'Message rate exceeded');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(
        typeof message === 'string'
          ? message
          : new TextDecoder().decode(message)
      );
    } catch {
      this.sendError(socket, 'Malformed JSON.');
      return;
    }

    const player = this.room.players[attachment.playerId];
    if (!player || player.connected !== true) return; if (Math.max(0, Math.floor(Number(player.connectionEpoch) || 0)) > 0 && Math.max(0, Math.floor(Number(attachment.connectionEpoch) || 0)) !== Math.max(0, Math.floor(Number(player.connectionEpoch) || 0))) return;
    player.lastSeenAt = Date.now();

    if (parsed?.kind === 'control') {
      await this.handleControl(socket, player, parsed.action, parsed.payload || {});
      return;
    }

    if (parsed?.kind === 'envelope' && parsed.envelope) {
      if (!COMPATIBLE_PROTOCOLS.has(Number(parsed.envelope.protocolVersion))) {
        this.sendError(socket, 'Unsupported multiplayer protocol.');
        return;
      }

      const envelope = {
        ...parsed.envelope,
        protocolVersion: SERVER_PROTOCOL,
        sessionId: this.room.sessionId,
        runId: this.room.runId || parsed.envelope.runId || null,
        playerId: player.playerId,
        authorityEpoch: Math.max(
          0,
          Number(this.room.authorityEpoch) || 0
        ), connectionEpoch: Math.max(1, Math.floor(Number(player.connectionEpoch) || 1)), messageId: `${String(parsed.envelope.messageId || `${player.playerId}:${parsed.envelope.type}:${parsed.envelope.sequence}`)}:connection-${Math.max(1, Math.floor(Number(player.connectionEpoch) || 1))}`,
        serverReceivedAt: Date.now()
      };

      if (
        envelope.type === 'run-stats'
        && (
          envelope.payload?.kind === 'snapshot'
          || envelope.payload?.kind === 'final'
        )
        && player.playerId !== this.room.hostPlayerId
      ) {
        this.sendError(socket, 'Only the current host can publish run statistics snapshots.');
        return;
      }

      if (
        envelope.type === 'run-stats'
        && envelope.payload?.kind === 'final'
        && validFinalSummary(envelope.payload.summary)
        && this.room.status !== 'in-run'
        && !this.room.finalSummary
      ) {
        this.room.finalSummary = envelope.payload.summary;
        await this.commit();
        this.broadcastRoomState();
      }

      if (this.isAuthorityCheckpointEnvelope(envelope)) {
        if (player.playerId !== this.room.hostPlayerId) {
          this.sendError(socket, 'Only the current host can publish authority snapshots.');
          return;
        }
        await this.captureAuthorityCheckpoint(envelope);
      }
      if (this.isTeamEliminatedReviveEnvelope(envelope)) {
        await this.finishRun({
          reason: 'team-eliminated',
          endedByPlayerId: player.playerId
        });
        return;
      }
      this.broadcast({
        kind: 'envelope',
        envelope
      }, { exclude: socket });
      return;
    }

    this.sendError(socket, 'Unsupported message type.');
  }

  isTeamEliminatedReviveEnvelope(envelope) {
    if (
      envelope?.type !== 'revive-state'
      || envelope?.payload?.kind !== 'snapshot'
    ) return false;
    const players = Array.isArray(envelope.payload?.snapshot?.players)
      ? envelope.payload.snapshot.players
      : [];
    const connectedIds = new Set(
      this.connectedPlayers().map((entry) => entry.playerId)
    );
    if (!connectedIds.size) return false;
    const lifeStateByPlayerId = new Map(
      players
        .filter((entry) => connectedIds.has(entry?.playerId))
        .map((entry) => [entry.playerId, entry.lifeState])
    );
    return Array.from(connectedIds).every((playerId) => {
      const state = lifeStateByPlayerId.get(playerId);
      return state === 'DOWNED' || state === 'SPECTATING' || state === 'ELIMINATED';
    });
  }

isAuthorityCheckpointEnvelope(envelope) {
    if (!envelope || this.room?.status !== 'in-run') return false;
    if (envelope.type === 'world-snapshot') return true;
    if (envelope.type === 'economy-snapshot') return true;
    if (
      envelope.type === 'run-stats'
      && (
        envelope.payload?.kind === 'snapshot'
        || envelope.payload?.kind === 'final'
      )
    ) {
      return true;
    }
    return envelope.type === 'revive-state'
      && envelope.payload?.kind === 'snapshot';
  }

  async captureAuthorityCheckpoint(envelope) {
    if (!this.room || !this.room.runId) return false;
    const checkpoint = this.room.authorityCheckpoint || {
      runId: this.room.runId,
      authorityEpoch: this.room.authorityEpoch || 0, authorityConnectionEpoch: Math.max(1, Math.floor(Number(envelope.connectionEpoch) || 1)),
      updatedAt: 0,
      world: null,
      economy: null,
      revive: null,
      stats: null,
      finalSummary: this.room.finalSummary || null
    };

    checkpoint.runId = this.room.runId;
    checkpoint.authorityEpoch = Math.max(
      0,
      Number(this.room.authorityEpoch) || 0
    ); checkpoint.authorityConnectionEpoch = Math.max(1, Math.floor(Number(envelope.connectionEpoch) || 1));
    checkpoint.updatedAt = Date.now();

    if (envelope.type === 'world-snapshot') {
      checkpoint.world = envelope.payload;
    } else if (envelope.type === 'economy-snapshot') {
      checkpoint.economy = envelope.payload;
    } else if (envelope.type === 'revive-state') {
      checkpoint.revive = envelope.payload?.snapshot || null;
    } else if (envelope.type === 'run-stats') {
      if (
        envelope.payload?.kind === 'snapshot'
        && validStatsSnapshot(envelope.payload.snapshot)
      ) {
        checkpoint.stats = envelope.payload.snapshot;
        if (validFinalSummary(envelope.payload.snapshot.finalSummary)) {
          this.room.finalSummary = envelope.payload.snapshot.finalSummary;
          checkpoint.finalSummary = this.room.finalSummary;
        }
      } else if (
        envelope.payload?.kind === 'final'
        && validFinalSummary(envelope.payload.summary)
      ) {
        this.room.finalSummary = envelope.payload.summary;
        checkpoint.finalSummary = this.room.finalSummary;
      }
    }

    this.room.authorityCheckpoint = checkpoint;
    const now = Date.now();
    if (now - this.lastCheckpointWriteAt >= CHECKPOINT_WRITE_INTERVAL_MS) {
      this.lastCheckpointWriteAt = now;
      await this.ctx.storage.put('room', this.room);
    }
    return true;
  }

  electHost(excludePlayerId = null) {
    return this.connectedPlayers()
      .filter((entry) => entry.playerId !== excludePlayerId)
      .slice()
      .sort((a, b) => {
        const joinedDelta = (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0);
        if (joinedDelta !== 0) return joinedDelta;
        return String(a.playerId).localeCompare(String(b.playerId));
      })[0] || null;
  }

  promoteHost(replacement, previousHostPlayerId = null) {
    Object.values(this.room.players || {}).forEach((entry) => {
      entry.isHost = false;
    });
    this.room.hostPlayerId = replacement?.playerId || null;
    if (replacement) {
      replacement.isHost = true;
      replacement.ready = true;
    }
    if (
      replacement
      && this.room.status === 'in-run'
      && replacement.playerId !== previousHostPlayerId
    ) {
      this.room.authorityEpoch = Math.max(
        0,
        Number(this.room.authorityEpoch) || 0
      ) + 1;
      if (this.room.authorityCheckpoint) {
        this.room.authorityCheckpoint.authorityEpoch = this.room.authorityEpoch;
      }
    }
    return replacement;
  }

  broadcastHostMigration({
    previousHostPlayerId = null,
    hostPlayerId = this.room?.hostPlayerId || null,
    reason = 'host-disconnected'
  } = {}) {
    if (!this.room || this.room.status !== 'in-run' || !hostPlayerId) return;
    this.broadcast({
      kind: 'control',
      action: 'host-migrated',
      payload: {
        previousHostPlayerId,
        hostPlayerId,
        authorityEpoch: Math.max(0, Number(this.room.authorityEpoch) || 0),
        checkpoint: this.room.authorityCheckpoint || null,
        reason,
        room: this.snapshot(),
        serverTime: Date.now()
      }
    });
  }

  consumeRateLimit(socket, attachment) {
    const now = Date.now();
    if (now - Number(attachment.windowStartedAt || 0) >= 1000) {
      attachment.windowStartedAt = now;
      attachment.messagesInWindow = 0;
    }

    attachment.messagesInWindow = Number(attachment.messagesInWindow || 0) + 1;
    socket.serializeAttachment(attachment);
    return attachment.messagesInWindow <= RATE_LIMIT_PER_SECOND;
  }

  async finishRun({
    reason = 'ended',
    endedByPlayerId = null
  } = {}) {
    if (!this.room || this.room.status !== 'in-run') return false;

    this.room.status = 'waiting';
    this.room.runId = null;
    this.room.authorityCheckpoint = null;

    Object.values(this.room.players).forEach((entry) => {
      entry.ready = entry.isHost === true && entry.connected === true;
    });

    await this.commit();
    const room = this.snapshot();

    this.broadcast({
      kind: 'control',
      action: 'run-ended',
      payload: {
        reason: String(reason || 'ended'),
        endedByPlayerId,
        room
      }
    });
    this.broadcastRoomState();
    return true;
  }

  async handleControl(socket, player, action, payload) {
    if (action === 'ping') {
      socket.send(JSON.stringify({
        kind: 'control',
        action: 'pong',
        payload: { serverTime: Date.now() }
      }));
      return;
    }

    if (action === 'chat-message') {
  const chatText = sanitizeTextChatText(payload?.text);
  if (!chatText) {
    socket.send(JSON.stringify({ kind: 'control', action: 'chat-rejected', payload: { reason: 'invalid-text' } }));
    return;
  }
  const attachment = this.readAttachment(socket) || {};
  const rate = consumeTextChatRate(attachment, Date.now());
  socket.serializeAttachment({ ...attachment, ...rate.state });
  if (!rate.allowed) {
    socket.send(JSON.stringify({ kind: 'control', action: 'chat-rejected', payload: { reason: rate.reason, retryAfterMs: rate.retryAfterMs } }));
    return;
  }
  const message = buildTextChatMessage({
    messageId: makeId('chat'),
    playerId: player.playerId,
    displayName: player.displayName,
    text: chatText,
    roomCode: this.room.roomCode,
    runId: this.room.runId || null,
    sentAt: Date.now()
  });
  this.broadcast({ kind: 'control', action: 'chat-message', payload: { message } });
  return;
} if (action === 'set-ready') {
      if (this.room.status === 'in-run') return;
      player.ready = player.isHost ? true : payload.ready === true;
      await this.commit();
      this.broadcastRoomState();
      return;
    }

    if (action === 'update-settings') {
      if (!player.isHost) {
        this.sendError(socket, 'Only the host can change room settings.');
        return;
      }

      const connectedCount = this.connectedPlayers().length;
      if (
        payload.maxPlayers !== undefined
        && this.room.status !== 'in-run'
      ) {
        this.room.settings.maxPlayers = Math.max(
          connectedCount,
          normalizeMaxPlayers(payload.maxPlayers)
        );
      }
      if (payload.locked !== undefined) {
        this.room.settings.locked = payload.locked === true;
      }
      if (payload.allowLateJoin !== undefined) {
        this.room.settings.allowLateJoin =
          payload.allowLateJoin === true;
      }

      if (this.room.status !== 'in-run') {
        if (payload.mapId) {
          this.room.settings.mapId = String(payload.mapId).slice(0, 80);
        }
        if (payload.difficulty !== undefined) {
          this.room.settings.difficulty =
            Number(payload.difficulty) || 1;
        }
      }

      await this.commit();
      this.broadcastRoomState();
      return;
    }

    
    if (action === 'kick-player') {
      if (!player.isHost) {
        this.sendError(socket, 'Only the host can remove players.');
        return;
      }
      const targetPlayerId = String(payload.playerId || '').slice(0, 160);
      const target = this.room.players?.[targetPlayerId] || null;
      if (
        !target
        || targetPlayerId === player.playerId
        || target.isHost === true
      ) {
        this.sendError(socket, 'Choose a valid operative to remove.');
        return;
      }

      this.room.kickedPlayers ||= {};
      this.room.kickedPlayers[targetPlayerId] = Date.now() + 600_000;
      delete this.room.players[targetPlayerId];

      this.ctx.getWebSockets(`player:${targetPlayerId}`).forEach(
        (targetSocket) => {
          try {
            targetSocket.send(JSON.stringify({
              kind: 'control',
              action: 'kicked',
              payload: { message: 'Removed from room by host.' }
            }));
            targetSocket.close(4003, 'Removed by host');
          } catch {
            // Ignore already-closed sockets.
          }
        }
      );

      await this.commit();
      this.broadcastRoomState();
      return;
    }

    if (action === 'transfer-host') {
      if (!player.isHost) {
        this.sendError(socket, 'Only the host can transfer authority.');
        return;
      }
      const targetPlayerId = String(payload.playerId || '').slice(0, 160);
      const target = this.room.players?.[targetPlayerId] || null;
      if (
        !target
        || targetPlayerId === player.playerId
        || target.connected !== true
      ) {
        this.sendError(socket, 'Choose a connected operative.');
        return;
      }

      const previousHostPlayerId = player.playerId;
      this.promoteHost(target, previousHostPlayerId);
      await this.commit();

      if (this.room.status === 'in-run') {
        this.broadcastHostMigration({
          previousHostPlayerId,
          hostPlayerId: target.playerId,
          reason: 'manual-host-transfer'
        });
      }
      this.broadcastRoomState();
      return;
    }

if (action === 'start-run') {
      if (!player.isHost) {
        this.sendError(socket, 'Only the host can start the run.');
        return;
      }
      if (this.room.status === 'in-run') return;

      const connected = this.connectedPlayers();
      if (!connected.length || !connected.every((entry) => entry.ready === true)) {
        this.sendError(socket, 'Every connected player must be ready.');
        return;
      }

      this.room.status = 'in-run';
      this.room.runId = makeId('run');
      this.room.authorityEpoch = 0;
      this.room.finalSummary = null;
      this.room.authorityCheckpoint = {
        runId: this.room.runId,
        authorityEpoch: 0, authorityConnectionEpoch: Math.max(1, Math.floor(Number(player.connectionEpoch) || 1)),
        updatedAt: Date.now(),
        world: null,
        economy: null,
        revive: null,
        stats: null,
        finalSummary: null
      };
      await this.commit();

      this.broadcast({
        kind: 'control',
        action: 'start-run',
        payload: {
          roomCode: this.room.roomCode,
          runId: this.room.runId,
          mapId: this.room.settings.mapId,
          difficulty: this.room.settings.difficulty,
          authorityEpoch: this.room.authorityEpoch,
          serverTime: Date.now()
        }
      });
      this.broadcastRoomState();
      return;
    }

    if (action === 'player-death') {
      // Individual down/bleedout state is authoritative in revive snapshots.
      // Never finish the whole co-op run from a single client death notice.
      this.broadcastRoomState();
      return;
    }

    if (action === 'end-run') {
      if (!player.isHost) return;
      await this.finishRun({
        reason: String(payload.reason || 'ended'),
        endedByPlayerId: player.playerId
      });
      return;
    }

    if (action === 'leave') {
      const leavingPlayerId = player.playerId;
      const wasHost = player.isHost === true;
      const previousStatus = this.room.status;
      delete this.room.players[leavingPlayerId];
      const checkpoint = this.room.authorityCheckpoint;
      if (previousStatus === 'in-run') {
        // A voluntary leave is not a completed team run. Remove any final
        // summary that the departing authority may have published locally.
        this.room.finalSummary = null;
        if (checkpoint) checkpoint.finalSummary = null;
        if (checkpoint?.stats) checkpoint.stats.finalSummary = null;
      }
      if (checkpoint?.revive && Array.isArray(checkpoint.revive.players)) {
        checkpoint.revive.players = checkpoint.revive.players.filter(
          (entry) => entry?.playerId !== leavingPlayerId
        );
      }
      if (checkpoint?.stats && Array.isArray(checkpoint.stats.players)) {
        checkpoint.stats.players = checkpoint.stats.players.filter(
          (entry) => entry?.playerId !== leavingPlayerId
        );
      }
      if (checkpoint?.world && Array.isArray(checkpoint.world.enemies)) {
        checkpoint.world.enemies.forEach((enemy) => {
          if (enemy?.targetPlayerId === leavingPlayerId) enemy.targetPlayerId = null;
        });
      }

      let replacement = null;
      if (wasHost) {
        replacement = this.electHost(leavingPlayerId);
        this.promoteHost(replacement, leavingPlayerId);
      }

      if (!this.connectedPlayers().length) {
        this.room.status = 'waiting';
        this.room.runId = null;
        this.room.authorityCheckpoint = null;
      }

      await this.commit();

      if (wasHost && replacement && previousStatus === 'in-run') {
        this.broadcastHostMigration({
          previousHostPlayerId: leavingPlayerId,
          hostPlayerId: replacement.playerId,
          reason: 'host-left-room'
        });
      }

      this.broadcastRoomState();
      socket.send(JSON.stringify({
        kind: 'control',
        action: 'left-room',
        payload: {}
      }));
      socket.close(1000, 'Left room');
      return;
    }

    this.sendError(socket, 'Unsupported control action.');
  }

  readAttachment(socket) {
    try {
      return socket.deserializeAttachment() || null;
    } catch {
      return null;
    }
  }

  sendError(socket, message) {
    try {
      socket.send(JSON.stringify({
        kind: 'control',
        action: 'error',
        payload: { message }
      }));
    } catch {
      // Ignore closed sockets.
    }
  }

  broadcast(message, { exclude = null } = {}) {
    const encoded = JSON.stringify(message);
    this.ctx.getWebSockets().forEach((socket) => {
      if (socket === exclude) return;
      const attachment = this.readAttachment(socket);
      if (!attachment?.playerId || attachment.rejected) return;
      try {
        socket.send(encoded);
      } catch {
        // The close handler will reconcile the player.
      }
    });
  }

  broadcastRoomState() {
    if (!this.room) return;
    this.broadcast({
      kind: 'control',
      action: 'room-state',
      payload: {
        room: this.snapshot(),
        checkpoint: this.room.status === 'in-run'
          ? this.room.authorityCheckpoint
          : null
      }
    });
  }

  async webSocketClose(socket) {
    await this.markDisconnected(socket);
  }

  async webSocketError(socket) {
    await this.markDisconnected(socket);
  }

  async markDisconnected(socket) {
    if (!this.room) return;

    const attachment = this.readAttachment(socket);
    const playerId = attachment?.playerId;
    const player = this.room.players?.[playerId];
    if (!player || player.connected === false) return; if (Math.max(0, Math.floor(Number(player.connectionEpoch) || 0)) > 0 && Math.max(0, Math.floor(Number(attachment?.connectionEpoch) || 0)) !== Math.max(0, Math.floor(Number(player.connectionEpoch) || 0))) return;

    const wasInRun = this.room.status === 'in-run';
    player.connected = false;
    player.ready = false;
    player.disconnectedAt = Date.now();
    player.disconnectExpiresAt = Date.now() + DISCONNECT_GRACE_MS;
    const checkpointWorld = this.room.authorityCheckpoint?.world;
    if (Array.isArray(checkpointWorld?.enemies)) {
      checkpointWorld.enemies.forEach((enemy) => {
        if (enemy?.targetPlayerId === playerId) enemy.targetPlayerId = null;
      });
    }


    let replacement = null;
    const wasHost = player.isHost === true;
    if (wasHost) {
      player.isHost = false;
      replacement = this.electHost(playerId);
      this.promoteHost(replacement, playerId);
    }

    if (wasInRun) {
      await this.commit();
      if (replacement) {
        this.broadcastHostMigration({
          previousHostPlayerId: playerId,
          hostPlayerId: replacement.playerId,
          reason: 'host-disconnected'
        });
      }
      await this.scheduleCleanup();
      this.broadcastRoomState();
      return;
    }

    if (this.connectedPlayers().length === 0) {
      this.room.status = 'waiting';
      this.room.runId = null;
    }

    await this.commit();
    await this.scheduleCleanup();
    this.broadcastRoomState();
  }

  async scheduleCleanup() {
    if (!this.room) return;
    const expiries = Object.values(this.room.players)
      .filter((player) => player.connected === false && player.disconnectExpiresAt)
      .map((player) => player.disconnectExpiresAt);

    if (expiries.length) {
      await this.ctx.storage.setAlarm(Math.min(...expiries));
    }
  }

  async alarm() {
    if (!this.room) return;
    const now = Date.now();
    let changed = false;

    Object.entries(this.room.players).forEach(([playerId, player]) => {
      if (
        player.connected === false
        && Number(player.disconnectExpiresAt || 0) <= now
      ) {
        delete this.room.players[playerId];
        changed = true;
      }
    });

    let migrated = null;
    if (!this.room.hostPlayerId) {
      const replacement = this.electHost();
      if (replacement) {
        this.promoteHost(replacement, null);
        migrated = replacement;
        changed = true;
      }
    }

    if (this.connectedPlayers().length === 0 && Object.keys(this.room.players).length === 0) {
      this.room.status = 'waiting';
      this.room.runId = null;
      this.room.authorityCheckpoint = null;
      this.room.finalSummary = null;
      changed = true;
    }

    if (changed) {
      await this.commit();
      if (migrated && this.room.status === 'in-run') {
        this.broadcastHostMigration({
          previousHostPlayerId: null,
          hostPlayerId: migrated.playerId,
          reason: 'grace-election'
        });
      }
      this.broadcastRoomState();
    }

    await this.scheduleCleanup();
  }

  async commit() {
    if (!this.room) return;
    this.room.revision = Number(this.room.revision || 0) + 1;
    this.room.updatedAt = Date.now();
    await this.ctx.storage.put('room', this.room);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization, x-ka-account-id, x-ka-device-id, x-ka-client-time, x-ka-operation-id',
        'access-control-max-age': '86400'
      }});
    }
    if (!originAllowed(request, env)) {
      return json({ error: 'Origin not allowed.' }, { status: 403 });
    }

    const url = new URL(request.url);

    if (url.pathname === '/leaderboards' || url.pathname === '/leaderboards/challenge' || url.pathname === '/leaderboards/submit') {
      return proxyLeaderboardRequest(request, env);
    }

    if (url.pathname.startsWith('/profiles/')) {
      return proxyCloudProfileRequest(request, env);
    }

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'khadijas-arena-multiplayer',
        protocol: SERVER_PROTOCOL,
        build: SERVER_BUILD,
        patch: SERVER_PATCH,
        certifiedFrontendSha: CERTIFIED_FRONTEND_SHA,
        releaseStatus: RELEASE_STATUS,
        leaderboards: { schema: 1, patch: 'm4-online-leaderboards-r1', endpoints: ['/leaderboards', '/leaderboards/challenge', '/leaderboards/submit'] },
        cloudProfiles: { ...CLOUD_PROFILE_SERVER_INFO, endpoints: ['/profiles/register', '/profiles/profile', '/profiles/sync', '/profiles/link/create', '/profiles/link/consume', '/profiles/export', '/profiles/account', '/profiles/devices', '/profiles/devices/name', '/profiles/devices/revoke', '/profiles/devices/revoke-others', '/profiles/token/rotate', '/profiles/recovery/generate', '/profiles/recovery/consume', '/profiles/auth/passkey/register/options', '/profiles/auth/passkey/register/verify', '/profiles/auth/passkey/login/options', '/profiles/auth/passkey/login/verify', '/profiles/auth/session', '/profiles/auth/signout', '/profiles/auth/passkeys', '/profiles/auth/passkeys/name', '/profiles/auth/passkeys/revoke', '/profiles/history', '/profiles/history/restore', '/profiles/activity'] }
      });
    }

    if (url.pathname === '/release') {
      return json({
        ok: true,
        service: 'khadijas-arena-multiplayer',
        protocol: SERVER_PROTOCOL,
        build: SERVER_BUILD,
        patch: SERVER_PATCH,
        certifiedFrontendSha: CERTIFIED_FRONTEND_SHA,
        releaseStatus: RELEASE_STATUS,
        leaderboards: { schema: 1, patch: 'm4-online-leaderboards-r1', endpoints: ['/leaderboards', '/leaderboards/challenge', '/leaderboards/submit'] },
        cloudProfiles: { ...CLOUD_PROFILE_SERVER_INFO, endpoints: ['/profiles/register', '/profiles/profile', '/profiles/sync', '/profiles/link/create', '/profiles/link/consume', '/profiles/export', '/profiles/account', '/profiles/devices', '/profiles/devices/name', '/profiles/devices/revoke', '/profiles/devices/revoke-others', '/profiles/token/rotate', '/profiles/recovery/generate', '/profiles/recovery/consume', '/profiles/auth/passkey/register/options', '/profiles/auth/passkey/register/verify', '/profiles/auth/passkey/login/options', '/profiles/auth/passkey/login/verify', '/profiles/auth/session', '/profiles/auth/signout', '/profiles/auth/passkeys', '/profiles/auth/passkeys/name', '/profiles/auth/passkeys/revoke', '/profiles/history', '/profiles/history/restore', '/profiles/activity'] },
        deployedAt: new Date().toISOString()
      });
    }

    if (url.pathname !== '/ws') {
      return json({
        service: 'Khadija’s Arena Multiplayer',
        endpoints: ['/health', '/release', '/leaderboards', '/leaderboards/challenge', '/leaderboards/submit', '/profiles/register', '/profiles/profile', '/profiles/sync', '/profiles/link/create', '/profiles/link/consume', '/profiles/export', '/profiles/account', '/profiles/devices', '/profiles/devices/name', '/profiles/devices/revoke', '/profiles/devices/revoke-others', '/profiles/token/rotate', '/profiles/recovery/generate', '/profiles/recovery/consume', '/profiles/auth/passkey/register/options', '/profiles/auth/passkey/register/verify', '/profiles/auth/passkey/login/options', '/profiles/auth/passkey/login/verify', '/profiles/auth/session', '/profiles/auth/signout', '/profiles/auth/passkeys', '/profiles/auth/passkeys/name', '/profiles/auth/passkeys/revoke', '/profiles/history', '/profiles/history/restore', '/profiles/activity', '/ws']
      });
    }

    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'Expected WebSocket upgrade.' }, { status: 426 });
    }

    const roomCode = normalizeRoomCode(url.searchParams.get('room'));
    if (!ROOM_CODE_PATTERN.test(roomCode)) {
      return json({ error: 'Invalid room code.' }, { status: 400 });
    }

    const id = env.ROOMS.idFromName(roomCode);
    const stub = env.ROOMS.get(id);
    return stub.fetch(request);
  }
};
