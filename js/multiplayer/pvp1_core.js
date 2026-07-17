// PVP.1 R1 — isolated Team Elimination client policy core.

export const PVP1_PATCH = 'pvp1-r1-isolated-team-elimination-foundation';
export const PVP1_PRODUCT_VERSION = '1.1.0-pvp1';
export const PVP1_SOURCE_BASELINE_SHA = 'ddbdc3a4b478aa26a515e2dd8dbfc9449885c466';
export const PVP1_CERTIFIED_FRONTEND_BASELINE_SHA = '5511d393d7249b5487affa3616716ccb64593e99';
export const PVP1_MODE = 'pvp-team-elimination';
export const PVP1_SCHEMA = 1;
export const PVP1_FEATURE_ENABLED = true;
export const PVP1_TEAMS = Object.freeze(['ALPHA', 'BRAVO']);

export function normalizePvp1Mode(value) {
  return String(value || '').trim().toLowerCase() === PVP1_MODE
    ? PVP1_MODE
    : 'coop';
}

export function isPvp1Mode(value) {
  return normalizePvp1Mode(value) === PVP1_MODE;
}

export function roomUsesPvp1(room) {
  return isPvp1Mode(room?.settings?.gameMode);
}

export function normalizePvp1Team(value) {
  const token = String(value || '').trim().toUpperCase();
  return PVP1_TEAMS.includes(token) ? token : null;
}

export function opposingPvp1Team(team) {
  const normalized = normalizePvp1Team(team);
  if (!normalized) return null;
  return normalized === 'ALPHA' ? 'BRAVO' : 'ALPHA';
}

export function normalizePvp1State(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const teams = source.teams && typeof source.teams === 'object'
    ? source.teams
    : {};
  const players = source.players && typeof source.players === 'object'
    ? source.players
    : {};

  const normalizedPlayers = {};
  Object.entries(players).forEach(([playerId, entry]) => {
    const team = normalizePvp1Team(entry?.team);
    if (!playerId || !team) return;
    normalizedPlayers[playerId] = Object.freeze({
      playerId,
      team,
      slot: Math.max(0, Math.floor(Number(entry?.slot) || 0)),
      health: Math.max(0, Number(entry?.health) || 0),
      maxHealth: Math.max(1, Number(entry?.maxHealth) || 100),
      alive: entry?.alive === true,
      eliminations: Math.max(0, Math.floor(Number(entry?.eliminations) || 0)),
      deaths: Math.max(0, Math.floor(Number(entry?.deaths) || 0)),
      damageDealt: Math.max(0, Math.floor(Number(entry?.damageDealt) || 0)),
      spawnSerial: Math.max(1, Math.floor(Number(entry?.spawnSerial) || 1))
    });
  });

  return Object.freeze({
    schema: Math.max(1, Math.floor(Number(source.schema) || PVP1_SCHEMA)),
    patch: String(source.patch || PVP1_PATCH),
    mode: normalizePvp1Mode(source.mode),
    runId: String(source.runId || ''),
    phase: ['COUNTDOWN', 'ACTIVE', 'COMPLETE'].includes(source.phase)
      ? source.phase
      : 'COUNTDOWN',
    round: Math.max(1, Math.floor(Number(source.round) || 1)),
    bestOf: Math.max(1, Math.floor(Number(source.bestOf) || 5)),
    roundsToWin: Math.max(1, Math.floor(Number(source.roundsToWin) || 3)),
    roundStartsAt: Math.max(0, Number(source.roundStartsAt) || 0),
    winnerTeam: normalizePvp1Team(source.winnerTeam),
    roundWinnerTeam: normalizePvp1Team(source.roundWinnerTeam),
    teams: Object.freeze({
      ALPHA: Object.freeze({
        roundWins: Math.max(0, Math.floor(Number(teams.ALPHA?.roundWins) || 0))
      }),
      BRAVO: Object.freeze({
        roundWins: Math.max(0, Math.floor(Number(teams.BRAVO?.roundWins) || 0))
      })
    }),
    players: Object.freeze(normalizedPlayers),
    revision: Math.max(0, Math.floor(Number(source.revision) || 0)),
    updatedAt: Math.max(0, Number(source.updatedAt) || 0),
    reason: String(source.reason || '')
  });
}

export function derivePvp1Presentation(state, localPlayerId, now = Date.now()) {
  const match = normalizePvp1State(state);
  const local = match.players[String(localPlayerId || '')] || null;
  const countdownMs = match.phase === 'COUNTDOWN'
    ? Math.max(0, match.roundStartsAt - Number(now || 0))
    : 0;
  const countdownSeconds = countdownMs > 0
    ? Math.max(1, Math.ceil(countdownMs / 1000))
    : 0;

  return Object.freeze({
    mode: match.mode,
    active: match.mode === PVP1_MODE && match.phase !== 'COMPLETE',
    phase: match.phase,
    round: match.round,
    bestOf: match.bestOf,
    alphaWins: match.teams.ALPHA.roundWins,
    bravoWins: match.teams.BRAVO.roundWins,
    localTeam: local?.team || null,
    localAlive: local?.alive === true,
    localHealth: local?.health ?? 0,
    localMaxHealth: local?.maxHealth ?? 100,
    localEliminations: local?.eliminations ?? 0,
    localDeaths: local?.deaths ?? 0,
    countdownMs,
    countdownSeconds,
    inputBlocked: Boolean(
      !local
      || local.alive !== true
      || match.phase === 'COUNTDOWN'
      || match.phase === 'COMPLETE'
    ),
    winnerTeam: match.winnerTeam,
    headline: match.phase === 'COMPLETE'
      ? `${match.winnerTeam || 'MATCH'} WINS`
      : match.phase === 'COUNTDOWN'
        ? `ROUND ${match.round} · ${countdownSeconds || 1}`
        : `ROUND ${match.round} · FIGHT`
  });
}

export function pvp1PrivateRoomPolicy(gameMode) {
  const mode = normalizePvp1Mode(gameMode);
  if (mode !== PVP1_MODE) {
    return Object.freeze({
      gameMode: 'coop',
      maxPlayers: 4,
      allowLateJoin: true,
      publicListing: false,
      botsAllowed: true
    });
  }
  return Object.freeze({
    gameMode: PVP1_MODE,
    maxPlayers: 4,
    allowLateJoin: false,
    publicListing: false,
    botsAllowed: false
  });
}
