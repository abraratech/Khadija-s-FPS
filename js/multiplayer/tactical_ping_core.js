// js/multiplayer/tactical_ping_core.js

export const TACTICAL_PING_TYPES = Object.freeze({
  ENEMY: 'ENEMY',
  MOVE: 'MOVE',
  NEED_HELP: 'NEED_HELP',
  NEED_AMMO: 'NEED_AMMO',
  REVIVE_ME: 'REVIVE_ME',
  BUY_OPEN: 'BUY_OPEN',
  FOLLOW_ME: 'FOLLOW_ME'
});

export const TACTICAL_PING_LIFETIMES_MS = Object.freeze({
  [TACTICAL_PING_TYPES.ENEMY]: 6000,
  [TACTICAL_PING_TYPES.MOVE]: 7500,
  [TACTICAL_PING_TYPES.NEED_HELP]: 8500,
  [TACTICAL_PING_TYPES.NEED_AMMO]: 8000,
  [TACTICAL_PING_TYPES.REVIVE_ME]: 9000,
  [TACTICAL_PING_TYPES.BUY_OPEN]: 8500,
  [TACTICAL_PING_TYPES.FOLLOW_ME]: 8000
});

export const TACTICAL_PING_COLORS = Object.freeze({
  [TACTICAL_PING_TYPES.ENEMY]: '#ff4a36',
  [TACTICAL_PING_TYPES.MOVE]: '#34d8ff',
  [TACTICAL_PING_TYPES.NEED_HELP]: '#ffb347',
  [TACTICAL_PING_TYPES.NEED_AMMO]: '#ffe45c',
  [TACTICAL_PING_TYPES.REVIVE_ME]: '#ff5c8a',
  [TACTICAL_PING_TYPES.BUY_OPEN]: '#b38cff',
  [TACTICAL_PING_TYPES.FOLLOW_ME]: '#6dff9f'
});

export const TACTICAL_PING_LABELS = Object.freeze({
  [TACTICAL_PING_TYPES.ENEMY]: 'ENEMY HERE',
  [TACTICAL_PING_TYPES.MOVE]: 'MOVE HERE',
  [TACTICAL_PING_TYPES.NEED_HELP]: 'NEED HELP',
  [TACTICAL_PING_TYPES.NEED_AMMO]: 'NEED AMMO',
  [TACTICAL_PING_TYPES.REVIVE_ME]: 'REVIVE ME',
  [TACTICAL_PING_TYPES.BUY_OPEN]: 'BUY / OPEN THIS',
  [TACTICAL_PING_TYPES.FOLLOW_ME]: 'FOLLOW ME'
});

const MAX_TEXT_LENGTH = 24;
const MAX_ID_LENGTH = 160;
const MAX_POSITION_ABS = 10000;
const DEFAULT_MAX_ACTIVE_PER_PLAYER = 3;
const DEFAULT_COOLDOWN_MS = 800;
const DEFAULT_SPAM_WINDOW_MS = 4000;
const DEFAULT_SPAM_LIMIT = 5;
const DEFAULT_SEEN_TTL_MS = 60000;

function nowMs() {
  return (
    typeof performance !== 'undefined'
    && typeof performance.now === 'function'
  ) ? performance.now() : Date.now();
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanControlText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

export function sanitizePingText(value, fallback = 'Player') {
  const cleaned = cleanControlText(value).slice(0, MAX_TEXT_LENGTH);
  return cleaned || fallback;
}

export function sanitizePingId(value) {
  const cleaned = cleanControlText(value)
    .replace(/[^a-zA-Z0-9:_-]/g, '')
    .slice(0, MAX_ID_LENGTH);
  return cleaned || null;
}

export function tacticalPingLifetime(type) {
  return TACTICAL_PING_LIFETIMES_MS[type] || TACTICAL_PING_LIFETIMES_MS.MOVE;
}

export function validatePingPosition(position) {
  const x = finiteNumber(position?.x);
  const y = finiteNumber(position?.y);
  const z = finiteNumber(position?.z);

  if (x === null || y === null || z === null) {
    return { ok: false, position: null, error: 'position must contain finite x/y/z.' };
  }

  if (
    Math.abs(x) > MAX_POSITION_ABS
    || Math.abs(y) > MAX_POSITION_ABS
    || Math.abs(z) > MAX_POSITION_ABS
  ) {
    return { ok: false, position: null, error: 'position is outside the playable bounds.' };
  }

  return { ok: true, position: { x, y, z }, error: null };
}

export function normalizePingType(value) {
  const type = String(value || '').trim().toUpperCase().replace(/[-\s/]+/g, '_');
  const aliases = {
    ENEMY: TACTICAL_PING_TYPES.ENEMY,
    ENEMY_HERE: TACTICAL_PING_TYPES.ENEMY,
    MOVE: TACTICAL_PING_TYPES.MOVE,
    MOVE_HERE: TACTICAL_PING_TYPES.MOVE,
    WORLD: TACTICAL_PING_TYPES.MOVE,
    NEED_HELP: TACTICAL_PING_TYPES.NEED_HELP,
    HELP: TACTICAL_PING_TYPES.NEED_HELP,
    NEED_AMMO: TACTICAL_PING_TYPES.NEED_AMMO,
    AMMO: TACTICAL_PING_TYPES.NEED_AMMO,
    REVIVE_ME: TACTICAL_PING_TYPES.REVIVE_ME,
    REVIVE: TACTICAL_PING_TYPES.REVIVE_ME,
    BUY_OPEN: TACTICAL_PING_TYPES.BUY_OPEN,
    BUY_OPEN_THIS: TACTICAL_PING_TYPES.BUY_OPEN,
    BUY_THIS: TACTICAL_PING_TYPES.BUY_OPEN,
    OPEN_THIS: TACTICAL_PING_TYPES.BUY_OPEN,
    FOLLOW_ME: TACTICAL_PING_TYPES.FOLLOW_ME,
    FOLLOW: TACTICAL_PING_TYPES.FOLLOW_ME
  };
  return aliases[type] || null;
}

export function validateTacticalPingPayload(candidate, {
  now = nowMs(),
  ownerPlayerId = candidate?.ownerPlayerId,
  ownerName = candidate?.ownerName
} = {}) {
  const errors = [];

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, errors: ['ping payload must be an object.'], ping: null };
  }

  const pingId = sanitizePingId(candidate.pingId);
  if (!pingId) errors.push('pingId is required.');

  const type = normalizePingType(candidate.type);
  if (!type) errors.push('type must be a supported tactical quick-message type.');

  const normalizedOwnerId = sanitizePingId(ownerPlayerId || candidate.ownerPlayerId);
  if (!normalizedOwnerId) errors.push('ownerPlayerId is required.');

  const positionResult = validatePingPosition(candidate.position);
  if (!positionResult.ok) errors.push(positionResult.error);

  if (errors.length > 0) {
    return { ok: false, errors, ping: null };
  }

  const createdAt = Math.max(0, finiteNumber(candidate.createdAt) ?? now);
  const lifetimeMultiplier = Math.max(
    0.75,
    Math.min(1.5, finiteNumber(candidate.lifetimeMultiplier) ?? 1)
  );
  const lifetimeMs = Math.round(tacticalPingLifetime(type) * lifetimeMultiplier);

  return {
    ok: true,
    errors: [],
    ping: Object.freeze({
      pingId,
      type,
      label: TACTICAL_PING_LABELS[type],
      ownerPlayerId: normalizedOwnerId,
      ownerName: sanitizePingText(ownerName || candidate.ownerName, 'Player'),
      position: positionResult.position,
      targetId: sanitizePingId(candidate.targetId) || null,
      color: TACTICAL_PING_COLORS[type],
      createdAt,
      expiresAt: createdAt + lifetimeMs,
      lifetimeMs,
      lifetimeMultiplier
    })
  };
}

function copyPing(ping) {
  return {
    ...ping,
    position: { ...ping.position }
  };
}

export class TacticalPingStore {
  constructor({
    maxActivePerPlayer = DEFAULT_MAX_ACTIVE_PER_PLAYER,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    spamWindowMs = DEFAULT_SPAM_WINDOW_MS,
    spamLimit = DEFAULT_SPAM_LIMIT,
    seenTtlMs = DEFAULT_SEEN_TTL_MS,
    now = nowMs
  } = {}) {
    this.maxActivePerPlayer = Math.max(1, Math.floor(Number(maxActivePerPlayer) || DEFAULT_MAX_ACTIVE_PER_PLAYER));
    this.cooldownMs = Math.max(0, Number(cooldownMs) || DEFAULT_COOLDOWN_MS);
    this.spamWindowMs = Math.max(1000, Number(spamWindowMs) || DEFAULT_SPAM_WINDOW_MS);
    this.spamLimit = Math.max(1, Math.floor(Number(spamLimit) || DEFAULT_SPAM_LIMIT));
    this.seenTtlMs = Math.max(1000, Number(seenTtlMs) || DEFAULT_SEEN_TTL_MS);
    this.now = typeof now === 'function' ? now : nowMs;
    this.active = new Map();
    this.seen = new Map();
    this.localAttempts = new Map();
  }

  prune(now = this.now()) {
    const expired = [];
    this.active.forEach((ping, pingId) => {
      if (Number(ping.expiresAt) <= now) expired.push(pingId);
    });
    expired.forEach((pingId) => this.active.delete(pingId));

    this.seen.forEach((seenAt, pingId) => {
      if (now - seenAt > this.seenTtlMs) this.seen.delete(pingId);
    });

    this.localAttempts.forEach((attempts, ownerId) => {
      const retained = attempts.filter((stamp) => now - stamp <= this.spamWindowMs);
      if (retained.length) this.localAttempts.set(ownerId, retained);
      else this.localAttempts.delete(ownerId);
    });

    return expired.length;
  }

  getActive(now = this.now()) {
    this.prune(now);
    return Array.from(this.active.values(), copyPing);
  }

  getActiveForOwner(ownerPlayerId, now = this.now()) {
    const ownerId = sanitizePingId(ownerPlayerId);
    if (!ownerId) return [];
    return this.getActive(now).filter((ping) => ping.ownerPlayerId === ownerId);
  }

  canCreateLocal(ownerPlayerId, now = this.now()) {
    const ownerId = sanitizePingId(ownerPlayerId);
    if (!ownerId) return { ok: false, reason: 'invalid-owner' };

    this.prune(now);
    const attempts = this.localAttempts.get(ownerId) || [];
    const recent = attempts.filter((stamp) => now - stamp <= this.spamWindowMs);
    const lastAttempt = recent.length ? recent[recent.length - 1] : -Infinity;

    if (now - lastAttempt < this.cooldownMs) {
      return { ok: false, reason: 'cooldown' };
    }

    if (recent.length >= this.spamLimit) {
      return { ok: false, reason: 'spam' };
    }

    return { ok: true, reason: 'ok' };
  }

  recordLocalAttempt(ownerPlayerId, now = this.now()) {
    const ownerId = sanitizePingId(ownerPlayerId);
    if (!ownerId) return;
    const attempts = (this.localAttempts.get(ownerId) || [])
      .filter((stamp) => now - stamp <= this.spamWindowMs);
    attempts.push(now);
    this.localAttempts.set(ownerId, attempts);
  }

  enforceOwnerLimit(ownerPlayerId) {
    const ownerId = sanitizePingId(ownerPlayerId);
    if (!ownerId) return;

    const ownerPings = Array.from(this.active.values())
      .filter((ping) => ping.ownerPlayerId === ownerId)
      .sort((a, b) => a.createdAt - b.createdAt);

    while (ownerPings.length > this.maxActivePerPlayer) {
      const removed = ownerPings.shift();
      if (removed) this.active.delete(removed.pingId);
    }
  }

  addPing(candidate, {
    now = this.now(),
    local = false,
    skipRateLimit = false,
    ownerPlayerId = candidate?.ownerPlayerId,
    ownerName = candidate?.ownerName
  } = {}) {
    this.prune(now);

    const validation = validateTacticalPingPayload(candidate, {
      now,
      ownerPlayerId,
      ownerName
    });

    if (!validation.ok) {
      return { accepted: false, reason: 'invalid', errors: validation.errors, ping: null };
    }

    const ping = validation.ping;
    if (this.active.has(ping.pingId) || this.seen.has(ping.pingId)) {
      return {
        accepted: false,
        reason: 'duplicate',
        errors: [],
        ping: this.active.get(ping.pingId) || ping
      };
    }

    if (local && !skipRateLimit) {
      const gate = this.canCreateLocal(ping.ownerPlayerId, now);
      if (!gate.ok) {
        return { accepted: false, reason: gate.reason, errors: [], ping: null };
      }
      this.recordLocalAttempt(ping.ownerPlayerId, now);
    }

    this.active.set(ping.pingId, ping);
    this.seen.set(ping.pingId, now);
    this.enforceOwnerLimit(ping.ownerPlayerId);

    return { accepted: true, reason: 'accepted', errors: [], ping };
  }

  removePing(pingId) {
    const normalized = sanitizePingId(pingId);
    if (!normalized) return false;
    return this.active.delete(normalized);
  }

  getRebroadcastPayloads(ownerPlayerId, now = this.now()) {
    return this.getActiveForOwner(ownerPlayerId, now).map((ping) => ({
      ...copyPing(ping),
      rebroadcast: true
    }));
  }

  reset() {
    this.active.clear();
    this.seen.clear();
    this.localAttempts.clear();
  }

  getSnapshot(now = this.now()) {
    this.prune(now);
    return {
      activePings: this.getActive(now),
      seenCount: this.seen.size,
      spamWindows: Array.from(this.localAttempts.entries(), ([playerId, attempts]) => ({
        playerId,
        count: attempts.length
      }))
    };
  }
}
