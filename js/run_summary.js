import { getEconomyBalanceSnapshot } from './economy_balance.js';

// js/run_summary.js
// C11 — Per-run combat/economy telemetry and final summary.

const state = {
  active: false,
  finalized: false,
  mapId: 'unknown',
  difficulty: 1,
  startedAt: 0,
  endedAt: 0,
  endReason: 'NONE',
  highestWave: 1,
  finalScore: 0,
  shots: 0,
  hits: 0,
  headshotHits: 0,
  kills: 0,
  headshotKills: 0,
  damageDealt: 0,
  damageTaken: 0,
  pointsEarned: 0,
  pointsSpent: 0,
  economyBalance: null,
  perksPurchased: 0,
  weaponUpgrades: 0,
  objectivesCompleted: 0,
  challengesCompleted: 0,
  lastEvent: 'IDLE'
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function durationSeconds() {
  if (!state.startedAt) return 0;
  const end = state.endedAt || Date.now();
  return Math.max(0, (end - state.startedAt) / 1000);
}

export function resetRunSummary({ mapId = 'unknown', difficulty = 1 } = {}) {
  Object.assign(state, {
    active: true,
    finalized: false,
    mapId: String(mapId || 'unknown'),
    difficulty: Math.max(0.5, Math.min(2, finite(difficulty, 1))),
    startedAt: Date.now(),
    endedAt: 0,
    endReason: 'NONE',
    highestWave: 1,
    finalScore: 0,
    shots: 0,
    hits: 0,
    headshotHits: 0,
    kills: 0,
    headshotKills: 0,
    damageDealt: 0,
    damageTaken: 0,
    pointsEarned: 0,
    pointsSpent: 0,
    economyBalance: getEconomyBalanceSnapshot(),
    perksPurchased: 0,
    weaponUpgrades: 0,
    objectivesCompleted: 0,
    challengesCompleted: 0,
    lastEvent: 'RUN START'
  });
  return getRunSummarySnapshot();
}

export function finalizeRunSummary({ score = 0, wave = 1, reason = 'ENDED' } = {}) {
  if (state.finalized) return getRunSummarySnapshot();
  state.active = false;
  state.finalized = true;
  state.endedAt = Date.now();
  state.finalScore = Math.max(0, Math.round(finite(score)));
  state.highestWave = Math.max(state.highestWave, Math.max(1, Math.round(finite(wave, 1))));
  state.endReason = String(reason || 'ENDED');
  state.lastEvent = state.endReason;
  return getRunSummarySnapshot();
}

export function recordRunShot() {
  if (!state.active) return;
  state.shots++;
}

export function recordRunHit({ headshot = false } = {}) {
  if (!state.active) return;
  state.hits++;
  if (headshot) state.headshotHits++;
}

export function recordRunDamageDealt(damage = 0) {
  if (!state.active) return;
  state.damageDealt += Math.max(0, finite(damage));
}

export function recordRunKill({ headshot = false } = {}) {
  if (!state.active) return;
  state.kills++;
  if (headshot) state.headshotKills++;
}

export function recordRunDamageTaken(amount = 0) {
  if (!state.active) return;
  state.damageTaken += Math.max(0, finite(amount));
}

export function recordRunPointsEarned(amount = 0) {
  if (!state.active) return;
  state.pointsEarned += Math.max(0, Math.round(finite(amount)));
}

export function recordRunPointsSpent(amount = 0) {
  if (!state.active) return;
  state.pointsSpent += Math.max(0, Math.round(finite(amount)));
}

export function recordRunPerk() {
  if (!state.active) return;
  state.perksPurchased++;
}

export function recordRunWeaponUpgrade() {
  if (!state.active) return;
  state.weaponUpgrades++;
}

export function recordRunObjective() {
  if (!state.active) return;
  state.objectivesCompleted++;
}

export function recordRunChallenge() {
  if (!state.active) return;
  state.challengesCompleted++;
}

export function recordRunWave(wave = 1) {
  if (!state.active) return;
  state.highestWave = Math.max(state.highestWave, Math.max(1, Math.round(finite(wave, 1))));
}

export function getRunSummarySnapshot() {
  const accuracy = state.shots > 0 ? (state.hits / state.shots) * 100 : 0;
  return {
    ...state,
    durationSeconds: durationSeconds(),
    accuracy,
    netPoints: state.pointsEarned - state.pointsSpent
  };
}

if (typeof window !== 'undefined') {
  window.KAGetRunSummary = getRunSummarySnapshot;
}
