// js/multiplayer/coop_audio_core.js
// POST-FINAL.2 R1 — deterministic co-op alert priority, cooldown and de-duplication.

export const COOP_AUDIO_PATCH = 'post-final2-r1-coop-audio-awareness';
export const COOP_AUDIO_SCHEMA = 1;

export const COOP_AUDIO_KINDS = Object.freeze({
  ALLY_DOWN: 'ALLY_DOWN',
  ALLY_DOWN_REMINDER: 'ALLY_DOWN_REMINDER',
  ALLY_REVIVED: 'ALLY_REVIVED',
  ENEMY_MARK: 'ENEMY_MARK',
  MOVE_MARK: 'MOVE_MARK',
  NEED_HELP: 'NEED_HELP',
  NEED_AMMO: 'NEED_AMMO',
  FOLLOW_ME: 'FOLLOW_ME',
  BUY_OPEN: 'BUY_OPEN'
});

export const COOP_AUDIO_POLICY = Object.freeze({
  [COOP_AUDIO_KINDS.ALLY_DOWN]: Object.freeze({
    priority: 100,
    cooldownMs: 1200,
    actorCooldownMs: 2500,
    lockMs: 720,
    captionMs: 3000
  }),
  [COOP_AUDIO_KINDS.ALLY_DOWN_REMINDER]: Object.freeze({
    priority: 84,
    cooldownMs: 6500,
    actorCooldownMs: 6500,
    lockMs: 520,
    captionMs: 2400
  }),
  [COOP_AUDIO_KINDS.NEED_HELP]: Object.freeze({
    priority: 82,
    cooldownMs: 2400,
    actorCooldownMs: 3600,
    lockMs: 480,
    captionMs: 2600
  }),
  [COOP_AUDIO_KINDS.ENEMY_MARK]: Object.freeze({
    priority: 64,
    cooldownMs: 900,
    actorCooldownMs: 2200,
    lockMs: 300,
    captionMs: 2100
  }),
  [COOP_AUDIO_KINDS.ALLY_REVIVED]: Object.freeze({
    priority: 58,
    cooldownMs: 900,
    actorCooldownMs: 1800,
    lockMs: 260,
    captionMs: 1900
  }),
  [COOP_AUDIO_KINDS.MOVE_MARK]: Object.freeze({
    priority: 46,
    cooldownMs: 800,
    actorCooldownMs: 1700,
    lockMs: 240,
    captionMs: 1900
  }),
  [COOP_AUDIO_KINDS.NEED_AMMO]: Object.freeze({
    priority: 44,
    cooldownMs: 1400,
    actorCooldownMs: 2800,
    lockMs: 240,
    captionMs: 2100
  }),
  [COOP_AUDIO_KINDS.FOLLOW_ME]: Object.freeze({
    priority: 40,
    cooldownMs: 1400,
    actorCooldownMs: 2600,
    lockMs: 220,
    captionMs: 1900
  }),
  [COOP_AUDIO_KINDS.BUY_OPEN]: Object.freeze({
    priority: 36,
    cooldownMs: 1400,
    actorCooldownMs: 2600,
    lockMs: 220,
    captionMs: 1900
  })
});

export const COOP_AUDIO_DOWN_REMINDER_MS = 8000;
export const COOP_AUDIO_EVENT_TTL_MS = 30_000;
export const COOP_AUDIO_MAX_SEEN_EVENTS = 160;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clean(value, fallback = '', max = 160) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

export function normalizeCoopAudioKind(value) {
  const key = clean(value).toUpperCase();
  return Object.values(COOP_AUDIO_KINDS).includes(key) ? key : null;
}

export function getCoopAudioPolicy(kind) {
  const normalized = normalizeCoopAudioKind(kind);
  return normalized ? COOP_AUDIO_POLICY[normalized] : null;
}

export function tacticalPingTypeToAudioKind(value) {
  switch (clean(value).toUpperCase()) {
    case 'ENEMY':
      return COOP_AUDIO_KINDS.ENEMY_MARK;
    case 'MOVE':
    case 'DEFEND':
      return COOP_AUDIO_KINDS.MOVE_MARK;
    case 'NEED_HELP':
    case 'REVIVE':
    case 'REVIVE_ME':
      return COOP_AUDIO_KINDS.NEED_HELP;
    case 'NEED_AMMO':
      return COOP_AUDIO_KINDS.NEED_AMMO;
    case 'FOLLOW_ME':
    case 'REGROUP':
      return COOP_AUDIO_KINDS.FOLLOW_ME;
    case 'BUY_OPEN':
    case 'INTERACT':
      return COOP_AUDIO_KINDS.BUY_OPEN;
    default:
      return null;
  }
}

export function buildCoopAudioCaption({
  kind,
  actorName = 'ALLY',
  distanceMeters = null
} = {}) {
  const normalized = normalizeCoopAudioKind(kind);
  const name = clean(actorName, 'ALLY', 28).toUpperCase();
  const distance = Number.isFinite(Number(distanceMeters))
    ? ` · ${Math.max(0, Math.round(Number(distanceMeters)))}M`
    : '';

  switch (normalized) {
    case COOP_AUDIO_KINDS.ALLY_DOWN:
      return `${name} DOWN · REVIVE NEEDED${distance}`;
    case COOP_AUDIO_KINDS.ALLY_DOWN_REMINDER:
      return `${name} STILL DOWN${distance}`;
    case COOP_AUDIO_KINDS.ALLY_REVIVED:
      return `${name} REVIVED`;
    case COOP_AUDIO_KINDS.ENEMY_MARK:
      return `${name} MARKED AN ENEMY${distance}`;
    case COOP_AUDIO_KINDS.MOVE_MARK:
      return `${name} MARKED A ROUTE${distance}`;
    case COOP_AUDIO_KINDS.NEED_HELP:
      return `${name} NEEDS HELP${distance}`;
    case COOP_AUDIO_KINDS.NEED_AMMO:
      return `${name} NEEDS AMMO${distance}`;
    case COOP_AUDIO_KINDS.FOLLOW_ME:
      return `${name} SAYS FOLLOW ME${distance}`;
    case COOP_AUDIO_KINDS.BUY_OPEN:
      return `${name} MARKED AN INTERACTION${distance}`;
    default:
      return '';
  }
}

export class CoopAudioArbiter {
  constructor({
    eventTtlMs = COOP_AUDIO_EVENT_TTL_MS,
    maxSeenEvents = COOP_AUDIO_MAX_SEEN_EVENTS
  } = {}) {
    this.eventTtlMs = Math.max(1000, finite(eventTtlMs, COOP_AUDIO_EVENT_TTL_MS));
    this.maxSeenEvents = Math.max(24, Math.floor(finite(
      maxSeenEvents,
      COOP_AUDIO_MAX_SEEN_EVENTS
    )));
    this.seenEvents = new Map();
    this.lastByKind = new Map();
    this.lastByActorKind = new Map();
    this.lockUntil = 0;
    this.lockPriority = 0;
    this.accepted = 0;
    this.rejected = 0;
  }

  reset() {
    this.seenEvents.clear();
    this.lastByKind.clear();
    this.lastByActorKind.clear();
    this.lockUntil = 0;
    this.lockPriority = 0;
    this.accepted = 0;
    this.rejected = 0;
  }

  prune(now = 0) {
    const threshold = finite(now) - this.eventTtlMs;
    for (const [eventId, seenAt] of this.seenEvents) {
      if (seenAt < threshold) this.seenEvents.delete(eventId);
    }
    while (this.seenEvents.size > this.maxSeenEvents) {
      const first = this.seenEvents.keys().next().value;
      if (!first) break;
      this.seenEvents.delete(first);
    }
  }

  accept({
    kind,
    actorId = '',
    eventId = '',
    now = 0,
    priority = null,
    force = false
  } = {}) {
    const normalized = normalizeCoopAudioKind(kind);
    const policy = getCoopAudioPolicy(normalized);
    if (!policy) {
      this.rejected += 1;
      return { accepted: false, reason: 'invalid-kind' };
    }

    const timestamp = finite(now);
    const cleanActor = clean(actorId, 'team', 80);
    const cleanEvent = clean(eventId, '', 180);
    const hasExplicitPriority = priority !== null
      && priority !== undefined
      && Number.isFinite(Number(priority));
    const resolvedPriority = hasExplicitPriority
      ? Number(priority)
      : policy.priority;

    this.prune(timestamp);

    if (cleanEvent && this.seenEvents.has(cleanEvent)) {
      this.rejected += 1;
      return { accepted: false, reason: 'duplicate' };
    }

    if (
      force !== true
      && timestamp < this.lockUntil
      && resolvedPriority < this.lockPriority
    ) {
      this.rejected += 1;
      return { accepted: false, reason: 'priority-lock' };
    }

    const lastKind = this.lastByKind.get(normalized) ?? -Infinity;
    if (force !== true && timestamp - lastKind < policy.cooldownMs) {
      this.rejected += 1;
      return { accepted: false, reason: 'kind-cooldown' };
    }

    const actorKey = `${cleanActor}:${normalized}`;
    const lastActor = this.lastByActorKind.get(actorKey) ?? -Infinity;
    if (force !== true && timestamp - lastActor < policy.actorCooldownMs) {
      this.rejected += 1;
      return { accepted: false, reason: 'actor-cooldown' };
    }

    if (cleanEvent) this.seenEvents.set(cleanEvent, timestamp);
    this.lastByKind.set(normalized, timestamp);
    this.lastByActorKind.set(actorKey, timestamp);
    this.lockUntil = timestamp + policy.lockMs;
    this.lockPriority = resolvedPriority;
    this.accepted += 1;

    return {
      accepted: true,
      kind: normalized,
      priority: resolvedPriority,
      policy
    };
  }

  getSnapshot() {
    return {
      schema: COOP_AUDIO_SCHEMA,
      patch: COOP_AUDIO_PATCH,
      seenEvents: this.seenEvents.size,
      lockUntil: this.lockUntil,
      lockPriority: this.lockPriority,
      accepted: this.accepted,
      rejected: this.rejected
    };
  }
}
