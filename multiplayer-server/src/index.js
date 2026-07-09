// multiplayer-server/src/index.js

import { DurableObject } from 'cloudflare:workers';

const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;
const MAX_PLAYERS = 4;
const MAX_MESSAGE_BYTES = 64 * 1024;
const RATE_LIMIT_PER_SECOND = 180;
const DISCONNECT_GRACE_MS = 45_000;
const CHECKPOINT_WRITE_INTERVAL_MS = 750;
const SERVER_PROTOCOL = 5;
const SERVER_BUILD = 'm3-tactical-awareness-r1';
const COMPATIBLE_PROTOCOLS = new Set([4, 5]);

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
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

function publicPlayer(player) {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    ready: player.ready === true,
    connected: player.connected === true,
    isHost: player.isHost === true
  };
}

function defaultRoom(roomCode) {
  return {
    roomId: makeId('room'),
    roomCode,
    sessionId: makeId('session'),
    status: 'waiting',
    hostPlayerId: null,
    settings: {
      maxPlayers: MAX_PLAYERS,
      mapId: 'grid_bunker',
      difficulty: 1,
      privacy: 'private'
    },
    players: {},
    runId: null,
    authorityEpoch: 0,
    authorityCheckpoint: null,
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

    const existing = this.room.players[playerId] || null;
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
      reconnectToken: token,
      disconnectedAt: null,
      disconnectExpiresAt: null,
      joinedAt: existing?.joinedAt || Date.now(),
      lastSeenAt: Date.now()
    };

    server.serializeAttachment({
      playerId,
      reconnectToken: token,
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
        reconnectToken: token,
        checkpoint: this.room.status === 'in-run'
          ? this.room.authorityCheckpoint
          : null,
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

    if (!existing && connected.length >= MAX_PLAYERS) {
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

    if (this.room.status === 'in-run' && !existing) {
      return 'This room is already in a run.';
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
      revision: this.room.revision
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
    if (!player || player.connected !== true) return;
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
        ),
        serverReceivedAt: Date.now()
      };

      if (this.isAuthorityCheckpointEnvelope(envelope)) {
        if (player.playerId !== this.room.hostPlayerId) {
          this.sendError(socket, 'Only the current host can publish authority snapshots.');
          return;
        }
        await this.captureAuthorityCheckpoint(envelope);
      }

      this.broadcast({
        kind: 'envelope',
        envelope
      }, { exclude: socket });
      return;
    }

    this.sendError(socket, 'Unsupported message type.');
  }

  isAuthorityCheckpointEnvelope(envelope) {
    if (!envelope || this.room?.status !== 'in-run') return false;
    if (envelope.type === 'world-snapshot') return true;
    if (envelope.type === 'economy-snapshot') return true;
    return envelope.type === 'revive-state'
      && envelope.payload?.kind === 'snapshot';
  }

  async captureAuthorityCheckpoint(envelope) {
    if (!this.room || !this.room.runId) return false;
    const checkpoint = this.room.authorityCheckpoint || {
      runId: this.room.runId,
      authorityEpoch: this.room.authorityEpoch || 0,
      updatedAt: 0,
      world: null,
      economy: null,
      revive: null
    };

    checkpoint.runId = this.room.runId;
    checkpoint.authorityEpoch = Math.max(
      0,
      Number(this.room.authorityEpoch) || 0
    );
    checkpoint.updatedAt = Date.now();

    if (envelope.type === 'world-snapshot') {
      checkpoint.world = envelope.payload;
    } else if (envelope.type === 'economy-snapshot') {
      checkpoint.economy = envelope.payload;
    } else if (envelope.type === 'revive-state') {
      checkpoint.revive = envelope.payload?.snapshot || null;
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

    if (action === 'set-ready') {
      if (this.room.status === 'in-run') return;
      player.ready = player.isHost ? true : payload.ready === true;
      await this.commit();
      this.broadcastRoomState();
      return;
    }

    if (action === 'update-settings') {
      if (!player.isHost || this.room.status === 'in-run') {
        this.sendError(socket, 'Only the host can change room settings.');
        return;
      }

      if (payload.mapId) {
        this.room.settings.mapId = String(payload.mapId).slice(0, 80);
      }
      if (payload.difficulty !== undefined) {
        this.room.settings.difficulty = Number(payload.difficulty) || 1;
      }

      await this.commit();
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
      this.room.authorityCheckpoint = {
        runId: this.room.runId,
        authorityEpoch: 0,
        updatedAt: Date.now(),
        world: null,
        economy: null,
        revive: null
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
      await this.finishRun({
        reason: String(payload.reason || 'player-death'),
        endedByPlayerId: player.playerId
      });
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
    if (!player || player.connected === false) return;

    const wasInRun = this.room.status === 'in-run';
    player.connected = false;
    player.ready = false;
    player.disconnectedAt = Date.now();
    player.disconnectExpiresAt = Date.now() + DISCONNECT_GRACE_MS;

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
    if (!originAllowed(request, env)) {
      return json({ error: 'Origin not allowed.' }, { status: 403 });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'khadijas-arena-multiplayer',
        protocol: SERVER_PROTOCOL,
        build: SERVER_BUILD
      });
    }

    if (url.pathname !== '/ws') {
      return json({
        service: 'Khadija’s Arena Multiplayer',
        endpoints: ['/health', '/ws']
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
