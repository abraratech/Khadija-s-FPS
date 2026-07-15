// BOT.1 R2.8.1 — deterministic host authority pinning across reconnects.

function cleanId(value) {
  return String(value || '').trim().slice(0, 160);
}

function normalizedPlayers(players = {}) {
  return Object.values(players || {}).filter((entry) => entry?.playerId);
}

export function resolvePinnedHostPlayerId({
  currentHostPlayerId = null,
  joiningPlayerId = null,
  players = {}
} = {}) {
  const current = cleanId(currentHostPlayerId);
  const joining = cleanId(joiningPlayerId);
  const entries = normalizedPlayers(players);

  // A retained player record is the authoritative host lease even while that
  // browser is reconnecting. Another socket may not steal it by arriving first.
  if (current && entries.some((entry) => cleanId(entry.playerId) === current)) {
    return current;
  }

  const connected = entries
    .filter((entry) => entry.connected === true)
    .slice()
    .sort((a, b) => {
      const joinedDelta = (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0);
      if (joinedDelta !== 0) return joinedDelta;
      return cleanId(a.playerId).localeCompare(cleanId(b.playerId));
    });

  if (connected[0]?.playerId) return cleanId(connected[0].playerId);
  return joining || null;
}

export function hostFlagsForPlayers(players = {}, hostPlayerId = null) {
  const host = cleanId(hostPlayerId);
  const result = {};
  normalizedPlayers(players).forEach((entry) => {
    const id = cleanId(entry.playerId);
    if (id) result[id] = Boolean(host && id === host);
  });
  return Object.freeze(result);
}

export function shouldRetainHostDuringDisconnect({
  roomStatus = 'waiting',
  wasHost = false
} = {}) {
  return wasHost === true && String(roomStatus || '') === 'in-run';
}

export function expiredHostRequiresElection({
  hostPlayerId = null,
  expiredPlayerIds = []
} = {}) {
  const host = cleanId(hostPlayerId);
  if (!host) return false;
  return expiredPlayerIds.some((playerId) => cleanId(playerId) === host);
}
