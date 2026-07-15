// multiplayer-server/src/bot_team_elimination_core.js
// BOT.1 R2.3 — Worker parity for virtual-operative team elimination.

export const BOT1_VIRTUAL_PLAYER_ID = 'bot-wingmate-r1';

const TERMINAL_LIFE_STATES = new Set([
  'SPECTATING',
  'ELIMINATED'
]);

function normalizedId(value) {
  return String(value || '').trim();
}

/**
 * Return true only when every authoritative participant has fully reached a
 * terminal life state. DOWNED is recoverable and must never end the run.
 *
 * Real participants are taken from connectedPlayerIds. Known virtual players
 * are admitted only when the host snapshot explicitly reports them connected.
 */
export function isAuthoritativeTeamEliminated({
  snapshotPlayers = [],
  connectedPlayerIds = [],
  virtualPlayerIds = [BOT1_VIRTUAL_PLAYER_ID]
} = {}) {
  const players = Array.isArray(snapshotPlayers) ? snapshotPlayers : [];
  const realIds = new Set(
    (Array.isArray(connectedPlayerIds) ? connectedPlayerIds : [])
      .map(normalizedId)
      .filter(Boolean)
  );
  if (!realIds.size) return false;

  const allowedVirtualIds = new Set(
    (Array.isArray(virtualPlayerIds) ? virtualPlayerIds : [])
      .map(normalizedId)
      .filter(Boolean)
  );
  const stateById = new Map();
  const participantIds = new Set(realIds);

  for (const entry of players) {
    const playerId = normalizedId(entry?.playerId);
    if (!playerId) continue;

    const isRealParticipant = realIds.has(playerId);
    const isConnectedVirtualParticipant = (
      allowedVirtualIds.has(playerId)
      && entry?.connected !== false
    );
    if (!isRealParticipant && !isConnectedVirtualParticipant) continue;

    if (isConnectedVirtualParticipant) participantIds.add(playerId);
    stateById.set(playerId, String(entry?.lifeState || '').toUpperCase());
  }

  return Array.from(participantIds).every((playerId) => (
    TERMINAL_LIFE_STATES.has(stateById.get(playerId))
  ));
}
