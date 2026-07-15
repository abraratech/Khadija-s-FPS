// js/multiplayer/host_continuity_core.js
// MATCH.2 R1.2 — deterministic host handoff when the authority tab is hidden.

export const HOST_VISIBILITY_HANDOFF_DELAY_MS = 0;
export const HOST_VISIBILITY_HANDOFF_COOLDOWN_MS = 2500;

function cleanId(value) {
  return String(value || '').trim().slice(0, 160);
}

export function chooseHostVisibilityHandoffTarget(
  players = [],
  localPlayerId = null
) {
  const localId = cleanId(localPlayerId);
  return (Array.isArray(players) ? players : [])
    .filter((entry) => (
      cleanId(entry?.playerId)
      && cleanId(entry?.playerId) !== localId
      && entry?.connected !== false
      && entry?.isBot !== true
    ))
    .slice()
    .sort((a, b) => {
      const joinedDelta = (Number(a?.joinedAt) || 0) - (Number(b?.joinedAt) || 0);
      if (joinedDelta !== 0) return joinedDelta;
      return cleanId(a?.playerId).localeCompare(cleanId(b?.playerId));
    })[0] || null;
}

export function shouldScheduleHostVisibilityHandoff({
  visibilityState = 'visible',
  runActive = false,
  sessionMode = 'local',
  roomStatus = 'waiting',
  localPlayerId = null,
  hostPlayerId = null,
  targetPlayerId = null,
  now = 0,
  lastRequestedAt = -Infinity,
  cooldownMs = HOST_VISIBILITY_HANDOFF_COOLDOWN_MS
} = {}) {
  if (String(visibilityState) !== 'hidden') return false;
  if (runActive !== true || String(roomStatus) !== 'in-run') return false;
  if (String(sessionMode) !== 'host') return false;
  if (!cleanId(localPlayerId) || cleanId(localPlayerId) !== cleanId(hostPlayerId)) return false;
  if (!cleanId(targetPlayerId) || cleanId(targetPlayerId) === cleanId(localPlayerId)) return false;
  return Number(now) - Number(lastRequestedAt) >= Math.max(0, Number(cooldownMs) || 0);
}
