// PVP.1 R1 — isolated private Team Elimination authority core.

export const PVP1_PATCH = 'pvp1-r1-isolated-team-elimination-foundation';
export const PVP1_MODE = 'pvp-team-elimination';
export const PVP1_SCHEMA = 1;
export const PVP1_BEST_OF = 5;
export const PVP1_ROUNDS_TO_WIN = 3;
export const PVP1_MAX_PLAYERS = 4;
export const PVP1_FEATURE_ENABLED = true;
export const PVP1_TEAMS = Object.freeze(['ALPHA', 'BRAVO']);

export const PVP1_WEAPON_PROFILES = Object.freeze({
  PISTOL: Object.freeze({
    damage: 24,
    headshotMultiplier: 1.65,
    minimumIntervalMs: 180,
    maximumDistance: 85,
    falloffStart: 30,
    falloffEnd: 85,
    minimumScale: 0.60
  }),
  SMG: Object.freeze({
    damage: 18,
    headshotMultiplier: 1.45,
    minimumIntervalMs: 78,
    maximumDistance: 70,
    falloffStart: 18,
    falloffEnd: 70,
    minimumScale: 0.48
  }),
  RIFLE: Object.freeze({
    damage: 27,
    headshotMultiplier: 1.55,
    minimumIntervalMs: 105,
    maximumDistance: 105,
    falloffStart: 38,
    falloffEnd: 105,
    minimumScale: 0.64
  }),
  SHOTGUN: Object.freeze({
    damage: 62,
    headshotMultiplier: 1.20,
    minimumIntervalMs: 700,
    maximumDistance: 34,
    falloffStart: 8,
    falloffEnd: 34,
    minimumScale: 0.24
  }),
  SNIPER: Object.freeze({
    damage: 88,
    headshotMultiplier: 1.35,
    minimumIntervalMs: 900,
    maximumDistance: 180,
    falloffStart: 95,
    falloffEnd: 180,
    minimumScale: 0.78
  })
});

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, minimum, maximum, fallback = minimum) {
  return Math.max(minimum, Math.min(maximum, finite(value, fallback)));
}

function cleanId(value, limit = 160) {
  return String(value || '').trim().slice(0, limit);
}

export function normalizePvp1Mode(value) {
  return String(value || '').trim().toLowerCase() === PVP1_MODE
    ? PVP1_MODE
    : 'coop';
}

export function isPvp1Mode(value) {
  return normalizePvp1Mode(value) === PVP1_MODE;
}

export function normalizePvp1WeaponFamily(value) {
  const token = String(value || '').trim().toUpperCase();
  return Object.hasOwn(PVP1_WEAPON_PROFILES, token) ? token : 'PISTOL';
}

export function assignPvp1Teams(players = []) {
  const normalized = players
    .filter((entry) => entry?.playerId && entry?.isBot !== true)
    .slice(0, PVP1_MAX_PLAYERS)
    .map((entry, index) => ({
      playerId: cleanId(entry.playerId),
      joinedAt: Math.max(0, finite(entry.joinedAt, index)),
      index
    }))
    .sort((left, right) => (
      left.joinedAt - right.joinedAt
      || left.playerId.localeCompare(right.playerId)
    ));

  const result = {};
  normalized.forEach((entry, index) => {
    const team = PVP1_TEAMS[index % 2];
    result[entry.playerId] = Object.freeze({
      team,
      slot: Math.floor(index / 2)
    });
  });
  return Object.freeze(result);
}

export function createPvp1MatchState({
  runId,
  players = [],
  now = Date.now()
} = {}) {
  const assignments = assignPvp1Teams(players);
  const playerState = {};
  Object.entries(assignments).forEach(([playerId, assignment]) => {
    playerState[playerId] = {
      playerId,
      team: assignment.team,
      slot: assignment.slot,
      health: 100,
      maxHealth: 100,
      alive: true,
      eliminations: 0,
      deaths: 0,
      damageDealt: 0,
      lastShotAt: 0,
      lastShotId: '',
      spawnSerial: 1
    };
  });

  return {
    schema: PVP1_SCHEMA,
    patch: PVP1_PATCH,
    mode: PVP1_MODE,
    runId: cleanId(runId, 200),
    phase: 'COUNTDOWN',
    round: 1,
    bestOf: PVP1_BEST_OF,
    roundsToWin: PVP1_ROUNDS_TO_WIN,
    roundStartsAt: Math.max(0, finite(now)) + 3000,
    roundEndedAt: 0,
    matchEndedAt: 0,
    winnerTeam: null,
    roundWinnerTeam: null,
    reason: 'match-start',
    teams: {
      ALPHA: { roundWins: 0 },
      BRAVO: { roundWins: 0 }
    },
    players: playerState,
    revision: 1,
    updatedAt: Math.max(0, finite(now))
  };
}

function distanceScale(profile, distance) {
  const value = clamp(distance, 0, profile.maximumDistance + 0.001, 0);
  if (value <= profile.falloffStart) return 1;
  const span = Math.max(0.001, profile.falloffEnd - profile.falloffStart);
  const t = clamp((value - profile.falloffStart) / span, 0, 1, 0);
  return 1 - (1 - profile.minimumScale) * t;
}

function livingPlayersForTeam(state, team) {
  return Object.values(state.players || {}).filter(
    (entry) => entry?.team === team && entry.alive === true
  );
}

function resetPlayersForRound(state) {
  Object.values(state.players || {}).forEach((entry) => {
    entry.health = entry.maxHealth || 100;
    entry.alive = true;
    entry.lastShotAt = 0;
    entry.lastShotId = '';
    entry.spawnSerial = Math.max(1, Math.floor(finite(entry.spawnSerial, 1))) + 1;
  });
}

export function resolvePvp1Shot({
  state,
  shooterId,
  targetId,
  weaponFamily,
  shotId,
  headshot = false,
  distance = 0,
  now = Date.now()
} = {}) {
  if (!state || state.mode !== PVP1_MODE) {
    return { accepted: false, reason: 'NOT_PVP_MATCH', state };
  }
  if (state.phase === 'COMPLETE') {
    return { accepted: false, reason: 'MATCH_COMPLETE', state };
  }

  const timestamp = Math.max(0, finite(now));
  if (timestamp < Math.max(0, finite(state.roundStartsAt))) {
    return {
      accepted: false,
      reason: 'ROUND_COUNTDOWN',
      retryAfterMs: Math.ceil(state.roundStartsAt - timestamp),
      state
    };
  }

  state.phase = 'ACTIVE';
  const shooter = state.players?.[cleanId(shooterId)];
  const target = state.players?.[cleanId(targetId)];
  if (!shooter || !target) {
    return { accepted: false, reason: 'PLAYER_NOT_FOUND', state };
  }
  if (!shooter.alive) {
    return { accepted: false, reason: 'SHOOTER_ELIMINATED', state };
  }
  if (!target.alive) {
    return { accepted: false, reason: 'TARGET_ELIMINATED', state };
  }
  if (shooter.team === target.team) {
    return { accepted: false, reason: 'FRIENDLY_FIRE_BLOCKED', state };
  }

  const cleanShotId = cleanId(shotId, 200);
  if (!cleanShotId || cleanShotId === shooter.lastShotId) {
    return { accepted: false, reason: 'DUPLICATE_SHOT', state };
  }

  const family = normalizePvp1WeaponFamily(weaponFamily);
  const profile = PVP1_WEAPON_PROFILES[family];
  const elapsed = timestamp - Math.max(0, finite(shooter.lastShotAt));
  if (shooter.lastShotAt > 0 && elapsed < profile.minimumIntervalMs) {
    return {
      accepted: false,
      reason: 'FIRE_RATE_LIMIT',
      retryAfterMs: Math.ceil(profile.minimumIntervalMs - elapsed),
      state
    };
  }

  const shotDistance = clamp(distance, 0, 1000, 0);
  if (shotDistance > profile.maximumDistance) {
    return { accepted: false, reason: 'TARGET_OUT_OF_RANGE', state };
  }

  shooter.lastShotAt = timestamp;
  shooter.lastShotId = cleanShotId;

  const scaled = profile.damage * distanceScale(profile, shotDistance);
  const damage = Math.max(
    1,
    Math.round(scaled * (headshot === true ? profile.headshotMultiplier : 1))
  );
  const appliedDamage = Math.min(target.health, damage);
  target.health = Math.max(0, target.health - damage);
  target.alive = target.health > 0;
  shooter.damageDealt += appliedDamage;

  let eliminated = false;
  let roundEnded = false;
  let matchEnded = false;
  let roundWinnerTeam = null;

  if (!target.alive) {
    eliminated = true;
    target.deaths += 1;
    shooter.eliminations += 1;
    const opponentTeam = target.team;
    if (livingPlayersForTeam(state, opponentTeam).length === 0) {
      roundEnded = true;
      roundWinnerTeam = shooter.team;
      state.roundWinnerTeam = roundWinnerTeam;
      state.teams[roundWinnerTeam].roundWins += 1;
      state.roundEndedAt = timestamp;

      if (
        state.teams[roundWinnerTeam].roundWins
        >= state.roundsToWin
      ) {
        matchEnded = true;
        state.phase = 'COMPLETE';
        state.winnerTeam = roundWinnerTeam;
        state.matchEndedAt = timestamp;
        state.reason = 'team-eliminated';
      } else {
        state.round += 1;
        state.phase = 'COUNTDOWN';
        state.roundStartsAt = timestamp + 3500;
        state.reason = 'next-round';
        resetPlayersForRound(state);
      }
    }
  }

  state.revision = Math.max(0, Math.floor(finite(state.revision))) + 1;
  state.updatedAt = timestamp;

  return {
    accepted: true,
    reason: 'APPLIED',
    state,
    event: {
      shotId: cleanShotId,
      shooterId: shooter.playerId,
      targetId: target.playerId,
      shooterTeam: shooter.team,
      targetTeam: target.team,
      weaponFamily: family,
      headshot: headshot === true,
      distance: shotDistance,
      damage: appliedDamage,
      remainingHealth: target.health,
      eliminated,
      roundEnded,
      roundWinnerTeam,
      matchEnded,
      winnerTeam: state.winnerTeam,
      round: state.round,
      teamScore: {
        ALPHA: state.teams.ALPHA.roundWins,
        BRAVO: state.teams.BRAVO.roundWins
      },
      serverTime: timestamp
    }
  };
}

export function pvp1ForfeitTeam(state, playerId, {
  now = Date.now(),
  reason = 'disconnect-expired'
} = {}) {
  if (!state || state.mode !== PVP1_MODE || state.phase === 'COMPLETE') {
    return { changed: false, state };
  }
  const player = state.players?.[cleanId(playerId)];
  if (!player) return { changed: false, state };

  const winnerTeam = player.team === 'ALPHA' ? 'BRAVO' : 'ALPHA';
  state.phase = 'COMPLETE';
  state.winnerTeam = winnerTeam;
  state.roundWinnerTeam = winnerTeam;
  state.teams[winnerTeam].roundWins = Math.max(
    state.roundsToWin,
    state.teams[winnerTeam].roundWins
  );
  state.matchEndedAt = Math.max(0, finite(now));
  state.updatedAt = state.matchEndedAt;
  state.reason = String(reason || 'forfeit').slice(0, 80);
  state.revision = Math.max(0, Math.floor(finite(state.revision))) + 1;

  return {
    changed: true,
    state,
    event: {
      matchEnded: true,
      winnerTeam,
      forfeitingPlayerId: player.playerId,
      reason: state.reason,
      serverTime: state.updatedAt
    }
  };
}
