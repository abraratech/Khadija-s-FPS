// js/multiplayer/room_controls_core.js
export const ROOM_PLAYER_LIMITS = Object.freeze({
  MIN: 2,
  MAX: 4,
  DEFAULT: 4
});

function finiteInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export function normalizeRoomPlayerLimit(value) {
  return Math.max(
    ROOM_PLAYER_LIMITS.MIN,
    Math.min(
      ROOM_PLAYER_LIMITS.MAX,
      finiteInteger(value, ROOM_PLAYER_LIMITS.DEFAULT)
    )
  );
}

export function normalizeRoomControlSettings(
  candidate = {},
  { connectedCount = 0, status = 'waiting' } = {}
) {
  const minimum = Math.max(
    ROOM_PLAYER_LIMITS.MIN,
    Math.min(ROOM_PLAYER_LIMITS.MAX, finiteInteger(connectedCount, 0))
  );
  const requested = normalizeRoomPlayerLimit(candidate.maxPlayers);
  const maxPlayers = status === 'in-run'
    ? Math.max(minimum, requested)
    : Math.max(minimum, requested);

  return Object.freeze({
    maxPlayers,
    locked: candidate.locked === true,
    allowLateJoin: candidate.allowLateJoin !== false
  });
}

export function getAdmissionRejection({
  existing = false,
  connectedCount = 0,
  status = 'waiting',
  settings = {},
  kickedUntil = 0,
  now = Date.now()
} = {}) {
  if (existing) return null;
  if (Number(kickedUntil) > Number(now)) {
    return 'You were removed from this room by the host.';
  }

  const normalized = normalizeRoomControlSettings(settings, {
    connectedCount,
    status
  });

  if (normalized.locked) return 'This room is locked by the host.';
  if (status === 'in-run' && !normalized.allowLateJoin) {
    return 'Late joining is disabled for this run.';
  }
  if (connectedCount >= normalized.maxPlayers) {
    return 'Room is full.';
  }
  return null;
}

export function canHostManagePlayer({
  actorPlayerId,
  hostPlayerId,
  targetPlayerId,
  targetConnected = false
} = {}) {
  const actor = String(actorPlayerId || '');
  const host = String(hostPlayerId || '');
  const target = String(targetPlayerId || '');

  if (!actor || actor !== host) {
    return { ok: false, reason: 'Only the host can manage players.' };
  }
  if (!target) {
    return { ok: false, reason: 'Choose a valid player.' };
  }
  if (target === actor) {
    return { ok: false, reason: 'The host cannot target themselves.' };
  }
  if (!targetConnected) {
    return { ok: false, reason: 'That player is not connected.' };
  }
  return { ok: true, reason: null };
}
