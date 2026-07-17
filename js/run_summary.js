import { getEconomyBalanceSnapshot } from './economy_balance.js';
import {
  recordProgressionDamageDealt,
  recordProgressionDamageTaken,
  recordProgressionPointsEarned
} from './progression.js';

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
  dynamicOperationsCompleted: 0,
  bonusOperationsCompleted: 0,
  objectiveRewardPoints: 0,
  objectiveContributions: {},
  topObjectiveContributor: null,
  lastDynamicOperation: null,
  missionChainsCompleted: 0,
  missionStagesCompleted: 0,
  missionOptionalStagesCompleted: 0,
  missionRewardPoints: 0,
  missionRiskChoice: 'NONE',
  missionMedals: [],
  lastMission: null,
  factionOperationsCompleted: 0,
  factionRewardPoints: 0,
  enemyFaction: 'NONE',
  bossDefeated: 'NONE',
  bossWeakPointHits: 0,
  bossStaggers: 0,
  replayModifiers: [],
  replayMasteryGrade: 'UNRANKED',
  replayMedals: [],
  noDownedMastery: false,
  lastReplayability: null,
  botAssisted: false,
  leaderboardEligible: true,
  botProfile: null,
  botActiveSeconds: 0,
  botReplacementReason: null,
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
    dynamicOperationsCompleted: 0,
    bonusOperationsCompleted: 0,
    objectiveRewardPoints: 0,
    objectiveContributions: {},
    topObjectiveContributor: null,
    lastDynamicOperation: null,
    missionChainsCompleted: 0,
    missionStagesCompleted: 0,
    missionOptionalStagesCompleted: 0,
    missionRewardPoints: 0,
    missionRiskChoice: 'NONE',
    missionMedals: [],
    lastMission: null,
    factionOperationsCompleted: 0,
    factionRewardPoints: 0,
    enemyFaction: 'NONE',
    bossDefeated: 'NONE',
    bossWeakPointHits: 0,
    bossStaggers: 0,
    replayModifiers: [],
    replayMasteryGrade: 'UNRANKED',
    replayMedals: [],
    noDownedMastery: false,
    lastReplayability: null,
    botAssisted: false,
    leaderboardEligible: true,
    botProfile: null,
    botActiveSeconds: 0,
    botReplacementReason: null,
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
  const value = Math.max(0, finite(damage));
  state.damageDealt += value;
  recordProgressionDamageDealt(value);
}

export function recordRunKill({ headshot = false } = {}) {
  if (!state.active) return;
  state.kills++;
  if (headshot) state.headshotKills++;
}

export function recordRunDamageTaken(amount = 0) {
  if (!state.active) return;
  const value = Math.max(0, finite(amount));
  state.damageTaken += value;
  recordProgressionDamageTaken(value);
}

export function recordRunPointsEarned(amount = 0) {
  if (!state.active) return;
  const value = Math.max(0, Math.round(finite(amount)));
  state.pointsEarned += value;
  recordProgressionPointsEarned(value);
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

export function recordRunDynamicOperation({
  operationId = '',
  label = 'Dynamic operation',
  optional = false,
  rewardPoints = 0,
  contributors = {},
  localPlayerId = ''
} = {}) {
  if (!state.active) return getRunSummarySnapshot();

  const normalizedId = String(operationId || '').slice(0, 180);
  if (normalizedId && state.lastDynamicOperation?.operationId === normalizedId) {
    return getRunSummarySnapshot();
  }

  state.dynamicOperationsCompleted += 1;
  state.objectivesCompleted += 1;
  if (optional === true) state.bonusOperationsCompleted += 1;
  state.objectiveRewardPoints += Math.max(0, Math.round(finite(rewardPoints)));

  const contributionMap = {};
  Object.entries(contributors || {}).forEach(([playerId, amount]) => {
    const id = String(playerId || '').slice(0, 160);
    if (!id) return;
    const value = Math.max(0, finite(amount));
    contributionMap[id] = value;
    state.objectiveContributions[id] = Math.max(
      0,
      finite(state.objectiveContributions[id]) + value
    );
  });

  const ranked = Object.entries(contributionMap)
    .sort((left, right) => right[1] - left[1]);
  state.topObjectiveContributor = ranked.length
    ? {
        playerId: ranked[0][0],
        contribution: ranked[0][1],
        isLocal: Boolean(localPlayerId && ranked[0][0] === localPlayerId)
      }
    : state.topObjectiveContributor;

  state.lastDynamicOperation = {
    operationId: normalizedId,
    label: String(label || 'Dynamic operation').slice(0, 120),
    optional: optional === true,
    rewardPoints: Math.max(0, Math.round(finite(rewardPoints))),
    localContribution: Math.max(
      0,
      finite(contributionMap[String(localPlayerId || '')])
    )
  };
  state.lastEvent = optional === true
    ? 'BONUS OPERATION COMPLETE'
    : 'DYNAMIC OPERATION COMPLETE';
  return getRunSummarySnapshot();
}

export function recordRunPostFinal7Mission({
  mission = null,
  rewardPoints = 0,
  localPlayerId = ''
} = {}) {
  if (!state.active || !mission?.completionId) return getRunSummarySnapshot();
  if (state.lastMission?.completionId === mission.completionId) {
    return getRunSummarySnapshot();
  }

  state.missionChainsCompleted += 1;
  state.missionStagesCompleted += Math.max(0, Math.round(finite(mission.completedStageCount)));
  state.missionOptionalStagesCompleted += Math.max(
    0,
    Math.round(finite(mission.optionalStagesCompleted))
  );
  state.missionRewardPoints += Math.max(0, Math.round(finite(rewardPoints)));
  state.objectiveRewardPoints += Math.max(0, Math.round(finite(rewardPoints)));
  state.missionRiskChoice = String(mission.riskChoice || 'SECURE').slice(0, 24);
  state.missionMedals = Array.isArray(mission.medals)
    ? mission.medals.map((entry) => ({
        role: String(entry?.role || '').slice(0, 32),
        label: String(entry?.label || entry?.role || 'MEDAL').slice(0, 64),
        playerId: String(entry?.playerId || '').slice(0, 160),
        score: Math.max(0, Math.round(finite(entry?.score))),
        isLocal: Boolean(localPlayerId && entry?.playerId === localPlayerId)
      })).slice(0, 8)
    : [];

  const localContribution = Math.max(
    0,
    finite(mission.totalContributions?.[String(localPlayerId || '')])
  );
  state.lastMission = {
    completionId: String(mission.completionId).slice(0, 200),
    missionId: String(mission.missionId || '').slice(0, 100),
    label: String(mission.label || 'Co-op operation').slice(0, 120),
    riskChoice: state.missionRiskChoice,
    rewardMultiplier: Math.max(1, finite(mission.rewardMultiplier, 1)),
    rewardPoints: Math.max(0, Math.round(finite(rewardPoints))),
    stagesCompleted: Math.max(0, Math.round(finite(mission.completedStageCount))),
    optionalStagesCompleted: Math.max(0, Math.round(finite(mission.optionalStagesCompleted))),
    localContribution
  };
  state.lastEvent = 'CO-OP MISSION COMPLETE';
  return getRunSummarySnapshot();
}

export function recordRunPostFinal8Replayability({
  replayability = null,
  rewardPoints = 0
} = {}) {
  if (!state.active || !replayability?.completionId) return getRunSummarySnapshot();
  if (state.lastReplayability?.completionId === replayability.completionId) {
    return getRunSummarySnapshot();
  }

  const boss = replayability.boss || {};
  state.factionOperationsCompleted += 1;
  state.factionRewardPoints += Math.max(0, Math.round(finite(rewardPoints)));
  state.objectiveRewardPoints += Math.max(0, Math.round(finite(rewardPoints)));
  state.enemyFaction = String(replayability.faction?.label || 'UNKNOWN').slice(0, 80);
  state.bossDefeated = String(boss.label || 'NONE').slice(0, 100);
  state.bossWeakPointHits += Math.max(0, Math.round(finite(boss.weakPointHits)));
  state.bossStaggers += Math.max(0, Math.round(finite(boss.staggerCount)));
  state.replayModifiers = Array.isArray(replayability.modifiers)
    ? replayability.modifiers.map((entry) => String(entry?.label || entry?.id || '').slice(0, 60)).filter(Boolean).slice(0, 4)
    : [];
  state.replayMasteryGrade = String(replayability.masteryGrade || 'UNRANKED').slice(0, 16);
  state.replayMedals = Array.isArray(replayability.medals)
    ? replayability.medals.map((entry) => ({
        id: String(entry?.id || '').slice(0, 80),
        label: String(entry?.label || entry?.id || 'MEDAL').slice(0, 80),
        score: Math.max(0, Math.round(finite(entry?.score)))
      })).slice(0, 8)
    : [];
  state.noDownedMastery = replayability.noDownedEligible === true;
  state.lastReplayability = {
    completionId: String(replayability.completionId).slice(0, 220),
    factionId: String(replayability.faction?.id || '').slice(0, 80),
    factionLabel: state.enemyFaction,
    bossId: String(boss.bossId || '').slice(0, 100),
    bossLabel: state.bossDefeated,
    weakPointHits: Math.max(0, Math.round(finite(boss.weakPointHits))),
    staggerCount: Math.max(0, Math.round(finite(boss.staggerCount))),
    modifierIds: Array.isArray(replayability.modifiers)
      ? replayability.modifiers.map((entry) => String(entry?.id || '').slice(0, 60)).slice(0, 4)
      : [],
    masteryScore: Math.max(0, Math.round(finite(replayability.masteryScore))),
    masteryGrade: state.replayMasteryGrade,
    rewardMultiplier: Math.max(1, finite(replayability.rewardMultiplier, 1)),
    rewardPoints: Math.max(0, Math.round(finite(rewardPoints))),
    noDownedEligible: state.noDownedMastery
  };
  state.lastEvent = 'FACTION MASTERY COMPLETE';
  return getRunSummarySnapshot();
}

export function recordRunWave(wave = 1) {
  if (!state.active) return;
  state.highestWave = Math.max(state.highestWave, Math.max(1, Math.round(finite(wave, 1))));
}

export function markRunBotAssisted({
  botProfile = 'bot1-intelligent-coop-fill-r1',
  activeSeconds = 0,
  replacementReason = null
} = {}) {
  state.botAssisted = true;
  state.leaderboardEligible = false;
  state.botProfile = String(botProfile || 'bot1-intelligent-coop-fill-r1')
    .slice(0, 80);
  state.botActiveSeconds = Math.max(
    state.botActiveSeconds,
    Math.max(0, finite(activeSeconds))
  );
  state.botReplacementReason = replacementReason
    ? String(replacementReason).slice(0, 80)
    : state.botReplacementReason;
  state.lastEvent = replacementReason
    ? 'AI WINGMATE REPLACED'
    : 'AI WINGMATE ACTIVE';
  return getRunSummarySnapshot();
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
