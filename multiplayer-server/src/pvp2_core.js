// PVP.2 R1 — public PvP competitive statistics and rating authority.

export const PVP2_PATCH = 'pvp2-r2-public-custom-pvp-rooms';
export const PVP2_PRODUCT_VERSION = '1.1.0-pvp2';
export const PVP2_SCHEMA = 1;
export const PVP2_MODE = 'pvp-team-elimination';
export const PVP2_INITIAL_RATING = 1000;
export const PVP2_MINIMUM_RATING = 100;
export const PVP2_RATING_K = 32;
export const PVP2_LEDGER_LIMIT = 2000;
export const PVP2_LEADERBOARD_LIMIT = 100;
export const PVP2_PUBLIC_CUSTOM_ROOMS_ENABLED = true;
export const PVP2_CUSTOM_ROOM_FEATURE_FLAG = 'PVP2_PUBLIC_CUSTOM_ROOMS_ENABLED';
export const PVP2_CUSTOM_ROOM_TEAM_SIZES = Object.freeze([1, 2]);

export function normalizePvp2CustomRoomMaxPlayers(value) {
  return Number(value) >= 4 ? 4 : 2;
}

export function pvp2PublicCustomRoomsEnabled(value, fallback = true) {
  return pvp2FeatureEnabled(value, fallback);
}

function cleanText(value, fallback = '', limit = 160) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  return Math.trunc(finite(value, fallback));
}

function clamp(value, minimum, maximum, fallback = minimum) {
  return Math.max(minimum, Math.min(maximum, finite(value, fallback)));
}

export function pvp2FeatureEnabled(value, fallback = true) {
  const token = String(value ?? (fallback ? 'true' : 'false')).trim().toLowerCase();
  return !['0', 'false', 'off', 'disabled'].includes(token);
}

export function createPvp2Stats(player = {}, now = Date.now()) {
  return {
    schema: PVP2_SCHEMA,
    patch: PVP2_PATCH,
    playerId: cleanText(player.playerId),
    displayName: cleanText(player.displayName, 'Player', 24),
    region: cleanText(player.region, 'ZZ', 16).toUpperCase(),
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    roundWins: 0,
    roundLosses: 0,
    eliminations: 0,
    deaths: 0,
    damageDealt: 0,
    headshots: 0,
    rating: PVP2_INITIAL_RATING,
    bestRating: PVP2_INITIAL_RATING,
    winStreak: 0,
    bestWinStreak: 0,
    updatedAt: Math.max(0, finite(now))
  };
}

export function normalizePvp2Stats(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const base = createPvp2Stats(source, now);
  return {
    ...base,
    matchesPlayed: Math.max(0, integer(source.matchesPlayed)),
    wins: Math.max(0, integer(source.wins)),
    losses: Math.max(0, integer(source.losses)),
    roundWins: Math.max(0, integer(source.roundWins)),
    roundLosses: Math.max(0, integer(source.roundLosses)),
    eliminations: Math.max(0, integer(source.eliminations)),
    deaths: Math.max(0, integer(source.deaths)),
    damageDealt: Math.max(0, integer(source.damageDealt)),
    headshots: Math.max(0, integer(source.headshots)),
    rating: Math.max(PVP2_MINIMUM_RATING, integer(source.rating, PVP2_INITIAL_RATING)),
    bestRating: Math.max(PVP2_MINIMUM_RATING, integer(source.bestRating, source.rating || PVP2_INITIAL_RATING)),
    winStreak: Math.max(0, integer(source.winStreak)),
    bestWinStreak: Math.max(0, integer(source.bestWinStreak)),
    updatedAt: Math.max(0, finite(source.updatedAt, now))
  };
}

function expectedScore(rating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

function averageRating(statsByPlayer, players, team) {
  const members = players.filter((entry) => entry.team === team);
  if (!members.length) return PVP2_INITIAL_RATING;
  return members.reduce((sum, entry) => {
    const stats = normalizePvp2Stats(statsByPlayer[entry.playerId] || entry);
    return sum + stats.rating;
  }, 0) / members.length;
}

export function normalizePvp2MatchResult(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const players = Array.isArray(source.players) ? source.players : [];
  const normalizedPlayers = players
    .map((entry) => ({
      playerId: cleanText(entry?.playerId),
      displayName: cleanText(entry?.displayName, 'Player', 24),
      team: ['ALPHA', 'BRAVO'].includes(String(entry?.team || '').toUpperCase())
        ? String(entry.team).toUpperCase()
        : '',
      eliminations: Math.max(0, integer(entry?.eliminations)),
      deaths: Math.max(0, integer(entry?.deaths)),
      damageDealt: Math.max(0, integer(entry?.damageDealt)),
      headshots: Math.max(0, integer(entry?.headshots))
    }))
    .filter((entry) => entry.playerId && entry.team)
    .slice(0, 4);

  const result = {
    schema: PVP2_SCHEMA,
    patch: PVP2_PATCH,
    matchId: cleanText(source.matchId || source.runId, '', 220),
    mode: String(source.mode || PVP2_MODE).trim().toLowerCase(),
    publicMatch: source.publicMatch === true,
    region: cleanText(source.region, 'ZZ', 16).toUpperCase(),
    winnerTeam: ['ALPHA', 'BRAVO'].includes(String(source.winnerTeam || '').toUpperCase())
      ? String(source.winnerTeam).toUpperCase()
      : '',
    reason: cleanText(source.reason, 'complete', 100),
    rounds: {
      ALPHA: Math.max(0, integer(source.rounds?.ALPHA)),
      BRAVO: Math.max(0, integer(source.rounds?.BRAVO))
    },
    players: normalizedPlayers,
    endedAt: Math.max(0, finite(source.endedAt, Date.now()))
  };

  if (!result.matchId) throw new TypeError('PVP2_MATCH_ID_REQUIRED');
  if (result.mode !== PVP2_MODE) throw new TypeError('PVP2_MODE_REQUIRED');
  if (!result.publicMatch) throw new TypeError('PVP2_PUBLIC_MATCH_REQUIRED');
  if (!result.winnerTeam) throw new TypeError('PVP2_WINNER_REQUIRED');
  if (result.players.length < 2) throw new TypeError('PVP2_PLAYERS_REQUIRED');
  if (!result.players.some((entry) => entry.team !== result.winnerTeam)) {
    throw new TypeError('PVP2_OPPOSING_TEAM_REQUIRED');
  }
  return result;
}

export function applyPvp2MatchResult({
  statsByPlayer = {},
  resultLedger = {},
  result,
  now = Date.now()
} = {}) {
  const normalized = normalizePvp2MatchResult(result);
  if (resultLedger[normalized.matchId]) {
    return {
      applied: false,
      duplicate: true,
      statsByPlayer,
      resultLedger,
      result: resultLedger[normalized.matchId]
    };
  }

  const nextStats = { ...statsByPlayer };
  const alphaRating = averageRating(nextStats, normalized.players, 'ALPHA');
  const bravoRating = averageRating(nextStats, normalized.players, 'BRAVO');
  const ratingDeltas = {};

  normalized.players.forEach((player) => {
    const current = normalizePvp2Stats(nextStats[player.playerId] || player, now);
    const won = player.team === normalized.winnerTeam;
    const opponentRating = player.team === 'ALPHA' ? bravoRating : alphaRating;
    const expected = expectedScore(current.rating, opponentRating);
    const delta = Math.round(PVP2_RATING_K * ((won ? 1 : 0) - expected));
    const rating = Math.max(PVP2_MINIMUM_RATING, current.rating + delta);
    const roundWins = player.team === 'ALPHA'
      ? normalized.rounds.ALPHA
      : normalized.rounds.BRAVO;
    const roundLosses = player.team === 'ALPHA'
      ? normalized.rounds.BRAVO
      : normalized.rounds.ALPHA;
    const winStreak = won ? current.winStreak + 1 : 0;

    nextStats[player.playerId] = {
      ...current,
      displayName: player.displayName || current.displayName,
      region: normalized.region || current.region,
      matchesPlayed: current.matchesPlayed + 1,
      wins: current.wins + (won ? 1 : 0),
      losses: current.losses + (won ? 0 : 1),
      roundWins: current.roundWins + roundWins,
      roundLosses: current.roundLosses + roundLosses,
      eliminations: current.eliminations + player.eliminations,
      deaths: current.deaths + player.deaths,
      damageDealt: current.damageDealt + player.damageDealt,
      headshots: current.headshots + player.headshots,
      rating,
      bestRating: Math.max(current.bestRating, rating),
      winStreak,
      bestWinStreak: Math.max(current.bestWinStreak, winStreak),
      updatedAt: Math.max(0, finite(now))
    };
    ratingDeltas[player.playerId] = delta;
  });

  const ledgerEntry = {
    matchId: normalized.matchId,
    winnerTeam: normalized.winnerTeam,
    region: normalized.region,
    playerIds: normalized.players.map((entry) => entry.playerId),
    ratingDeltas,
    appliedAt: Math.max(0, finite(now))
  };
  const nextLedger = { ...resultLedger, [normalized.matchId]: ledgerEntry };
  const keys = Object.keys(nextLedger).sort((left, right) => (
    finite(nextLedger[left]?.appliedAt) - finite(nextLedger[right]?.appliedAt)
  ));
  while (keys.length > PVP2_LEDGER_LIMIT) {
    delete nextLedger[keys.shift()];
  }

  return {
    applied: true,
    duplicate: false,
    statsByPlayer: nextStats,
    resultLedger: nextLedger,
    result: ledgerEntry
  };
}

export function publicPvp2Stats(value = {}) {
  const stats = normalizePvp2Stats(value);
  return {
    ...stats,
    winRate: stats.matchesPlayed > 0 ? stats.wins / stats.matchesPlayed : 0,
    eliminationDeathRatio: stats.deaths > 0
      ? stats.eliminations / stats.deaths
      : stats.eliminations
  };
}

export function rankPvp2Leaderboard(statsByPlayer = {}, {
  scope = 'global',
  region = 'ZZ',
  limit = 50
} = {}) {
  const normalizedRegion = cleanText(region, 'ZZ', 16).toUpperCase();
  const selected = Object.values(statsByPlayer || {})
    .map(publicPvp2Stats)
    .filter((entry) => entry.matchesPlayed > 0)
    .filter((entry) => scope !== 'regional' || entry.region === normalizedRegion)
    .sort((left, right) => (
      right.rating - left.rating
      || right.wins - left.wins
      || right.eliminations - left.eliminations
      || left.losses - right.losses
      || right.updatedAt - left.updatedAt
      || left.playerId.localeCompare(right.playerId)
    ));
  return selected.slice(0, clamp(integer(limit, 50), 1, PVP2_LEADERBOARD_LIMIT, 50))
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}
