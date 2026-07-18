// PVP.5 R1 — competitive match completion and stabilization core.

export const PVP5_SCHEMA = 1;
export const PVP5_PATCH = 'pvp5-r1-competitive-match-completion-stabilization';
export const PVP5_PRODUCT_VERSION = '1.1.0-pvp5';
export const PVP5_FRONTEND_BASELINE_SHA = '9c57f5ab6516ac8fef0b1e70a0e9e0bf0d53ef87';
export const PVP5_WORKER_BASELINE_SHA = 'deecf81e933d3d9bcd4e3bc5a33da8dcc8aa00b7';
export const PVP5_ASSIST_WINDOW_MS = 8_000;
export const PVP5_REMATCH_VOTE_WINDOW_MS = 45_000;
export const PVP5_COMPETITIVE_MAPS = Object.freeze([
  'crossfire_terminal',
  'foundry_ring',
  'skyline_relay'
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  return Math.floor(finite(value, fallback));
}

function cleanId(value, limit = 180) {
  return String(value || '').trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizePvp5MapId(value, fallback = PVP5_COMPETITIVE_MAPS[0]) {
  const token = String(value || '').trim().toLowerCase();
  if (PVP5_COMPETITIVE_MAPS.includes(token)) return token;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return PVP5_COMPETITIVE_MAPS.includes(normalizedFallback)
    ? normalizedFallback
    : PVP5_COMPETITIVE_MAPS[0];
}

export function createPvp5State({
  mapId = PVP5_COMPETITIVE_MAPS[0],
  matchSequence = 1,
  now = Date.now()
} = {}) {
  return {
    schema: PVP5_SCHEMA,
    patch: PVP5_PATCH,
    currentMapId: normalizePvp5MapId(mapId),
    mapPool: [...PVP5_COMPETITIVE_MAPS],
    matchSequence: Math.max(1, integer(matchSequence, 1)),
    completedRounds: 0,
    scoreboardRevision: 1,
    assistLedger: {},
    rematch: {
      open: false,
      expiresAt: 0,
      votes: {},
      selectedMapId: null,
      ready: false
    },
    updatedAt: Math.max(0, finite(now))
  };
}

export function normalizePvp5State(value = {}, { mapId } = {}) {
  const source = object(value);
  const rematch = object(source.rematch);
  const votes = {};
  Object.entries(object(rematch.votes)).forEach(([playerId, vote]) => {
    const id = cleanId(playerId);
    if (!id) return;
    votes[id] = Object.freeze({
      playerId: id,
      mapId: normalizePvp5MapId(vote?.mapId, source.currentMapId || mapId),
      votedAt: Math.max(0, finite(vote?.votedAt))
    });
  });
  return Object.freeze({
    schema: Math.max(1, integer(source.schema, PVP5_SCHEMA)),
    patch: String(source.patch || PVP5_PATCH),
    currentMapId: normalizePvp5MapId(source.currentMapId || mapId),
    mapPool: Object.freeze([...PVP5_COMPETITIVE_MAPS]),
    matchSequence: Math.max(1, integer(source.matchSequence, 1)),
    completedRounds: Math.max(0, integer(source.completedRounds)),
    scoreboardRevision: Math.max(0, integer(source.scoreboardRevision)),
    rematch: Object.freeze({
      open: rematch.open === true,
      expiresAt: Math.max(0, finite(rematch.expiresAt)),
      votes: Object.freeze(votes),
      selectedMapId: rematch.selectedMapId
        ? normalizePvp5MapId(rematch.selectedMapId, source.currentMapId || mapId)
        : null,
      ready: rematch.ready === true
    }),
    updatedAt: Math.max(0, finite(source.updatedAt))
  });
}

export function ensurePvp5State(state, { now = Date.now() } = {}) {
  if (!state || typeof state !== 'object') return null;
  if (!state.pvp5 || typeof state.pvp5 !== 'object') {
    state.pvp5 = createPvp5State({
      mapId: state.mapId,
      matchSequence: 1,
      now
    });
  }
  const pvp5 = state.pvp5;
  pvp5.schema = PVP5_SCHEMA;
  pvp5.patch = PVP5_PATCH;
  pvp5.currentMapId = normalizePvp5MapId(state.mapId || pvp5.currentMapId);
  pvp5.mapPool = [...PVP5_COMPETITIVE_MAPS];
  pvp5.matchSequence = Math.max(1, integer(pvp5.matchSequence, 1));
  pvp5.completedRounds = Math.max(0, integer(pvp5.completedRounds));
  pvp5.scoreboardRevision = Math.max(0, integer(pvp5.scoreboardRevision));
  pvp5.assistLedger = object(pvp5.assistLedger);
  pvp5.rematch = object(pvp5.rematch);
  pvp5.rematch.votes = object(pvp5.rematch.votes);
  pvp5.updatedAt = Math.max(0, finite(now));
  Object.values(object(state.players)).forEach((player) => {
    player.assists = Math.max(0, integer(player.assists));
    player.roundsPlayed = Math.max(0, integer(player.roundsPlayed));
    player.spectatingTargetId = cleanId(player.spectatingTargetId) || null;
  });
  return pvp5;
}

export function recordPvp5DamageContribution(state, {
  shooterId,
  targetId,
  damage = 0,
  now = Date.now()
} = {}) {
  const pvp5 = ensurePvp5State(state, { now });
  const shooter = cleanId(shooterId);
  const target = cleanId(targetId);
  const applied = Math.max(0, finite(damage));
  if (!pvp5 || !shooter || !target || shooter === target || applied <= 0) return false;
  const targetLedger = object(pvp5.assistLedger[target]);
  const previous = object(targetLedger[shooter]);
  targetLedger[shooter] = {
    damage: Math.max(0, finite(previous.damage)) + applied,
    lastHitAt: Math.max(0, finite(now))
  };
  pvp5.assistLedger[target] = targetLedger;
  pvp5.updatedAt = Math.max(0, finite(now));
  return true;
}

export function selectPvp5SpectatorTarget(state, {
  playerId,
  currentTargetId = '',
  direction = 1
} = {}) {
  const localId = cleanId(playerId);
  const local = state?.players?.[localId] || null;
  const candidates = Object.values(object(state?.players))
    .filter((entry) => entry?.playerId && entry.playerId !== localId && entry.alive === true)
    .sort((left, right) => {
      const leftPreferred = local && left.team === local.team ? 0 : 1;
      const rightPreferred = local && right.team === local.team ? 0 : 1;
      return leftPreferred - rightPreferred
        || String(left.team || '').localeCompare(String(right.team || ''))
        || integer(left.slot) - integer(right.slot)
        || String(left.playerId).localeCompare(String(right.playerId));
    });
  if (!candidates.length) return null;
  const currentIndex = candidates.findIndex((entry) => entry.playerId === cleanId(currentTargetId));
  const step = Number(direction) < 0 ? -1 : 1;
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + step + candidates.length) % candidates.length;
  return candidates[nextIndex].playerId;
}

export function resolvePvp5Elimination(state, {
  killerId,
  targetId,
  now = Date.now()
} = {}) {
  const pvp5 = ensurePvp5State(state, { now });
  const killer = cleanId(killerId);
  const target = cleanId(targetId);
  if (!pvp5 || !target || !state?.players?.[target]) {
    return Object.freeze({ assistPlayerIds: Object.freeze([]), spectatorTargetId: null });
  }
  const ledger = object(pvp5.assistLedger[target]);
  const timestamp = Math.max(0, finite(now));
  const assistPlayerIds = Object.entries(ledger)
    .filter(([playerId, entry]) => (
      playerId !== killer
      && state.players?.[playerId]
      && Math.max(0, finite(entry?.damage)) > 0
      && timestamp - Math.max(0, finite(entry?.lastHitAt)) <= PVP5_ASSIST_WINDOW_MS
    ))
    .map(([playerId]) => playerId);
  assistPlayerIds.forEach((playerId) => {
    state.players[playerId].assists = Math.max(0, integer(state.players[playerId].assists)) + 1;
  });
  delete pvp5.assistLedger[target];
  const spectatorTargetId = selectPvp5SpectatorTarget(state, {
    playerId: target,
    currentTargetId: '',
    direction: 1
  }) || (state.players?.[killer]?.alive === true ? killer : null);
  state.players[target].spectatingTargetId = spectatorTargetId;
  pvp5.scoreboardRevision += 1;
  pvp5.updatedAt = timestamp;
  return Object.freeze({
    assistPlayerIds: Object.freeze(assistPlayerIds),
    spectatorTargetId
  });
}

export function completePvp5Round(state, {
  now = Date.now()
} = {}) {
  const pvp5 = ensurePvp5State(state, { now });
  if (!pvp5) return null;
  pvp5.completedRounds += 1;
  pvp5.scoreboardRevision += 1;
  pvp5.assistLedger = {};
  Object.values(object(state.players)).forEach((player) => {
    player.roundsPlayed = Math.max(0, integer(player.roundsPlayed)) + 1;
  });
  return pvp5;
}

export function preparePvp5Round(state, {
  now = Date.now()
} = {}) {
  const pvp5 = ensurePvp5State(state, { now });
  if (!pvp5) return null;
  pvp5.assistLedger = {};
  pvp5.rematch = {
    open: false,
    expiresAt: 0,
    votes: {},
    selectedMapId: null,
    ready: false
  };
  Object.values(object(state.players)).forEach((player) => {
    player.spectatingTargetId = null;
  });
  pvp5.updatedAt = Math.max(0, finite(now));
  return pvp5;
}

export function openPvp5Rematch(state, {
  now = Date.now()
} = {}) {
  const pvp5 = ensurePvp5State(state, { now });
  if (!pvp5) return null;
  pvp5.rematch = {
    open: true,
    expiresAt: Math.max(0, finite(now)) + PVP5_REMATCH_VOTE_WINDOW_MS,
    votes: {},
    selectedMapId: null,
    ready: false
  };
  pvp5.updatedAt = Math.max(0, finite(now));
  return pvp5;
}

function selectVotedMap(votes, currentMapId) {
  const counts = new Map(PVP5_COMPETITIVE_MAPS.map((mapId) => [mapId, 0]));
  Object.values(object(votes)).forEach((vote) => {
    const mapId = normalizePvp5MapId(vote?.mapId, currentMapId);
    counts.set(mapId, (counts.get(mapId) || 0) + 1);
  });
  const maximum = Math.max(...counts.values());
  const tied = PVP5_COMPETITIVE_MAPS.filter((mapId) => counts.get(mapId) === maximum);
  const currentIndex = Math.max(0, PVP5_COMPETITIVE_MAPS.indexOf(normalizePvp5MapId(currentMapId)));
  for (let offset = 1; offset <= PVP5_COMPETITIVE_MAPS.length; offset += 1) {
    const candidate = PVP5_COMPETITIVE_MAPS[(currentIndex + offset) % PVP5_COMPETITIVE_MAPS.length];
    if (tied.includes(candidate)) return candidate;
  }
  return tied[0] || PVP5_COMPETITIVE_MAPS[(currentIndex + 1) % PVP5_COMPETITIVE_MAPS.length];
}

export function registerPvp5RematchVote(state, {
  playerId,
  mapId,
  connectedPlayerIds = [],
  now = Date.now()
} = {}) {
  const pvp5 = ensurePvp5State(state, { now });
  const voterId = cleanId(playerId);
  const timestamp = Math.max(0, finite(now));
  if (!pvp5 || state?.phase !== 'COMPLETE') {
    return Object.freeze({ accepted: false, reason: 'MATCH_NOT_COMPLETE', ready: false, state });
  }
  if (!voterId || !state.players?.[voterId]) {
    return Object.freeze({ accepted: false, reason: 'PLAYER_NOT_FOUND', ready: false, state });
  }
  if (pvp5.rematch?.open !== true || timestamp > Math.max(0, finite(pvp5.rematch?.expiresAt))) {
    openPvp5Rematch(state, { now: timestamp });
  }
  const selectedVote = normalizePvp5MapId(mapId, pvp5.currentMapId);
  pvp5.rematch.votes[voterId] = {
    playerId: voterId,
    mapId: selectedVote,
    votedAt: timestamp
  };
  const eligible = [...new Set(
    (Array.isArray(connectedPlayerIds) ? connectedPlayerIds : [])
      .map((entry) => cleanId(entry))
      .filter((entry) => entry && state.players?.[entry])
  )];
  const ready = eligible.length >= 2 && eligible.every((entry) => pvp5.rematch.votes[entry]);
  const selectedMapId = selectVotedMap(pvp5.rematch.votes, pvp5.currentMapId);
  pvp5.rematch.ready = ready;
  pvp5.rematch.selectedMapId = selectedMapId;
  pvp5.scoreboardRevision += 1;
  pvp5.updatedAt = timestamp;
  return Object.freeze({
    accepted: true,
    reason: ready ? 'REMATCH_READY' : 'VOTE_RECORDED',
    ready,
    selectedMapId,
    votesReceived: Object.keys(pvp5.rematch.votes).length,
    votesRequired: eligible.length,
    state
  });
}

export function buildPvp5Scoreboard(state) {
  return Object.freeze(
    Object.values(object(state?.players))
      .map((player) => Object.freeze({
        playerId: cleanId(player.playerId),
        team: String(player.team || ''),
        slot: Math.max(0, integer(player.slot)),
        alive: player.alive === true,
        eliminations: Math.max(0, integer(player.eliminations)),
        assists: Math.max(0, integer(player.assists)),
        deaths: Math.max(0, integer(player.deaths)),
        damageDealt: Math.max(0, integer(player.damageDealt)),
        headshots: Math.max(0, integer(player.headshots)),
        roundsPlayed: Math.max(0, integer(player.roundsPlayed)),
        spectatingTargetId: cleanId(player.spectatingTargetId) || null
      }))
      .sort((left, right) => (
        left.team.localeCompare(right.team)
        || right.eliminations - left.eliminations
        || right.assists - left.assists
        || left.deaths - right.deaths
        || right.damageDealt - left.damageDealt
        || left.slot - right.slot
      ))
  );
}
