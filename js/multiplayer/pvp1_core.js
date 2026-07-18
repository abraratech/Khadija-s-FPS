// PVP.1 R1 — isolated Team Elimination client policy core.

import {
  PVP3_R2_ARMOR_CAP,
  PVP3_R2_PATCH,
  PVP_ACTIVE_RULES_PATCH,
  isSupportedPvpRulesPatch,
  normalizePvp3MapId,
  normalizePvp3PickupState,
  normalizePvp3WeaponList
} from './pvp3_rules_core.js';

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
      headshots: Math.max(0, Math.floor(Number(entry?.headshots) || 0)),
      armor: Math.max(0, Number(entry?.armor) || 0),
      maxArmor: Math.max(1, Number(entry?.maxArmor) || PVP3_R2_ARMOR_CAP),
      unlockedWeapons: normalizePvp3WeaponList(entry?.unlockedWeapons),
      ammoSerial: Math.max(0, Math.floor(Number(entry?.ammoSerial) || 0)),
      pickupSerial: Math.max(0, Math.floor(Number(entry?.pickupSerial) || 0)),
      spawnProtectedUntil: Math.max(0, Number(entry?.spawnProtectedUntil) || 0),
      spawnSerial: Math.max(1, Math.floor(Number(entry?.spawnSerial) || 1))
    });
  });

  return Object.freeze({
    schema: Math.max(1, Math.floor(Number(source.schema) || PVP1_SCHEMA)),
    patch: String(source.patch || PVP1_PATCH),
    mode: normalizePvp1Mode(source.mode),
    runId: String(source.runId || ''),
    mapId: normalizePvp3MapId(source.mapId),
    rulesPatch: isSupportedPvpRulesPatch(source.rulesPatch)
      ? String(source.rulesPatch)
      : PVP_ACTIVE_RULES_PATCH,
    phase: ['COUNTDOWN', 'ACTIVE', 'COMPLETE'].includes(source.phase)
      ? source.phase
      : 'COUNTDOWN',
    round: Math.max(1, Math.floor(Number(source.round) || 1)),
    bestOf: Math.max(1, Math.floor(Number(source.bestOf) || 5)),
    roundsToWin: Math.max(1, Math.floor(Number(source.roundsToWin) || 3)),
    roundStartsAt: Math.max(0, Number(source.roundStartsAt) || 0),
    roundEndsAt: Math.max(0, Number(source.roundEndsAt) || 0),
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
    pickups: normalizePvp3PickupState(source.pickups),
    revision: Math.max(0, Math.floor(Number(source.revision) || 0)),
    updatedAt: Math.max(0, Number(source.updatedAt) || 0),
    reason: String(source.reason || '')
  });
}

export function classifyPvp1StateUpdate({
  currentState = null,
  incomingState = null,
  activeRunId = '',
  force = false
} = {}) {
  const incoming = normalizePvp1State(incomingState || {});
  const current = currentState ? normalizePvp1State(currentState) : null;
  const expectedRunId = String(activeRunId || '').trim();

  if (!incoming.runId) {
    return Object.freeze({
      accepted: false,
      reason: 'MISSING_RUN_ID',
      runChanged: false,
      incoming
    });
  }

  if (expectedRunId && incoming.runId !== expectedRunId) {
    return Object.freeze({
      accepted: false,
      reason: 'STALE_RUN',
      runChanged: current?.runId !== incoming.runId,
      incoming
    });
  }

  const runChanged = !current || current.runId !== incoming.runId;
  if (
    force !== true
    && !runChanged
    && incoming.revision < current.revision
  ) {
    return Object.freeze({
      accepted: false,
      reason: 'STALE_REVISION',
      runChanged: false,
      incoming
    });
  }

  return Object.freeze({
    accepted: true,
    reason: runChanged ? 'NEW_RUN' : 'CURRENT_RUN',
    runChanged,
    incoming
  });
}

export function shouldPresentPvp1Summary({
  state = null,
  activeRunId = '',
  lastSummaryRunId = ''
} = {}) {
  const match = normalizePvp1State(state || {});
  const expectedRunId = String(activeRunId || '').trim();
  return Boolean(
    match.phase === 'COMPLETE'
    && expectedRunId
    && match.runId === expectedRunId
    && match.runId !== String(lastSummaryRunId || '')
  );
}

export function derivePvp1Presentation(state, localPlayerId, now = Date.now()) {
  const match = normalizePvp1State(state);
  const local = match.players[String(localPlayerId || '')] || null;
  const timestamp = Number(now || 0);
  const countdownMs = match.phase === 'COUNTDOWN'
    ? Math.max(0, match.roundStartsAt - timestamp)
    : 0;
  const countdownSeconds = countdownMs > 0
    ? Math.max(1, Math.ceil(countdownMs / 1000))
    : 0;
  // The Worker keeps COUNTDOWN until the first authoritative shot. Locally,
  // movement and firing must unlock when the published start time is reached.
  const effectivePhase = (
    match.phase === 'COUNTDOWN'
    && match.roundStartsAt > 0
    && timestamp >= match.roundStartsAt
  ) ? 'ACTIVE' : match.phase;
  const roundRemainingMs = effectivePhase === 'ACTIVE'
    ? Math.max(0, match.roundEndsAt - timestamp)
    : 0;
  const roundRemainingSeconds = Math.max(0, Math.ceil(roundRemainingMs / 1000));

  return Object.freeze({
    mode: match.mode,
    active: match.mode === PVP1_MODE && effectivePhase !== 'COMPLETE',
    phase: effectivePhase,
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
    localHeadshots: local?.headshots ?? 0,
    localArmor: local?.armor ?? 0,
    localMaxArmor: local?.maxArmor ?? PVP3_R2_ARMOR_CAP,
    localWeapons: local?.unlockedWeapons || Object.freeze(['PISTOL']),
    localAmmoSerial: local?.ammoSerial ?? 0,
    localPickupSerial: local?.pickupSerial ?? 0,
    pickups: match.pickups,
    rulesPatch: match.rulesPatch,
    spawnProtected: Boolean(local && Number(now || 0) < local.spawnProtectedUntil),
    countdownMs,
    roundRemainingMs,
    roundRemainingSeconds,
    countdownSeconds,
    inputBlocked: Boolean(
      !local
      || local.alive !== true
      || effectivePhase === 'COUNTDOWN'
      || effectivePhase === 'COMPLETE'
    ),
    winnerTeam: match.winnerTeam,
    headline: effectivePhase === 'COMPLETE'
      ? `${match.winnerTeam || 'MATCH'} WINS`
      : effectivePhase === 'COUNTDOWN'
        ? `ROUND ${match.round} · ${countdownSeconds || 1}`
        : `ROUND ${match.round} · FIGHT`
  });
}

export function selectPvp1SpawnIndex(points = [], team = 'ALPHA', slot = 0) {
  const normalized = (Array.isArray(points) ? points : [])
    .map((point, index) => ({
      index,
      x: Number(point?.x),
      z: Number(point?.z)
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  if (normalized.length === 0) return -1;
  if (normalized.length === 1) return normalized[0].index;

  let anchorA = normalized[0];
  let anchorB = normalized[1];
  let maximumDistanceSquared = -1;
  for (let left = 0; left < normalized.length - 1; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      const dx = normalized[right].x - normalized[left].x;
      const dz = normalized[right].z - normalized[left].z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared > maximumDistanceSquared) {
        maximumDistanceSquared = distanceSquared;
        anchorA = normalized[left];
        anchorB = normalized[right];
      }
    }
  }

  const axisX = anchorB.x - anchorA.x;
  const axisZ = anchorB.z - anchorA.z;
  const ordered = [...normalized].sort((left, right) => {
    const leftProjection = (left.x - anchorA.x) * axisX + (left.z - anchorA.z) * axisZ;
    const rightProjection = (right.x - anchorA.x) * axisX + (right.z - anchorA.z) * axisZ;
    return leftProjection - rightProjection || left.index - right.index;
  });
  const normalizedTeam = normalizePvp1Team(team) || 'ALPHA';
  const side = normalizedTeam === 'BRAVO' ? [...ordered].reverse() : ordered;
  const sideCapacity = Math.max(1, Math.ceil(side.length / 2));
  const cleanSlot = Math.max(0, Math.floor(Number(slot) || 0));
  return side[cleanSlot % sideCapacity]?.index ?? side[0].index;
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
