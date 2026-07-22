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
  gameplay4BossProfile: 'NONE',
  gameplay4BossInterrupts: 0,
  gameplay4VulnerabilityHits: 0,
  gameplay4RewardPoints: 0,
  lastGameplay4Encounter: null,
  gameplay5NarrativeOperationsCompleted: 0,
  gameplay5NarrativeRewardPoints: 0,
  gameplay5NarrativeBranch: 'NONE',
  gameplay5NarrativeOutcome: 'NONE',
  gameplay5NarrativeGrade: 'UNRANKED',
  lastGameplay5Narrative: null,
  gameplay6WorldContributions: 0,
  gameplay6WorldPoints: 0,
  gameplay6WorldSector: 'NONE',
  gameplay6WorldTier: 0,
  gameplay6WorldMilestones: [],
  lastGameplay6World: null,
  gameplay7CampaignContributions: 0,
  gameplay7CampaignPoints: 0,
  gameplay7CampaignSector: 'NONE',
  gameplay7CampaignControl: 'NONE',
  gameplay7CampaignFaction: 'NONE',
  gameplay7ControlShifts: [],
  lastGameplay7Campaign: null,
  loadout2MasteryXp: 0,
  loadout2SpecializationId: 'FIELD_OPERATIVE',
  loadout2Families: {},
  loadout2Unlocks: [],
  loadout2ReceiptId: '',
  loadout2PvpExcluded: false,
  lastLoadout2Mastery: null,
  gameplay2Patch: '',
  mutationActiveIds: [],
  mutationActiveLabels: [],
  mutationActiveCount: 0,
  mutationHistoryCount: 0,
  mutationPeakActiveCount: 0,
  mutationRewardMultiplier: 1,
  mutationPeakRewardMultiplier: 1,
  mutationHistory: [],
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
    gameplay4BossProfile: 'NONE',
    gameplay4BossInterrupts: 0,
    gameplay4VulnerabilityHits: 0,
    gameplay4RewardPoints: 0,
    lastGameplay4Encounter: null,
    gameplay5NarrativeOperationsCompleted: 0,
    gameplay5NarrativeRewardPoints: 0,
    gameplay5NarrativeBranch: 'NONE',
    gameplay5NarrativeOutcome: 'NONE',
    gameplay5NarrativeGrade: 'UNRANKED',
    lastGameplay5Narrative: null,
    gameplay6WorldContributions: 0,
    gameplay6WorldPoints: 0,
    gameplay6WorldSector: 'NONE',
    gameplay6WorldTier: 0,
    gameplay6WorldMilestones: [],
    lastGameplay6World: null,
    gameplay7CampaignContributions: 0,
    gameplay7CampaignPoints: 0,
    gameplay7CampaignSector: 'NONE',
    gameplay7CampaignControl: 'NONE',
    gameplay7CampaignFaction: 'NONE',
    gameplay7ControlShifts: [],
    lastGameplay7Campaign: null,
    loadout2MasteryXp: 0,
    loadout2SpecializationId: 'FIELD_OPERATIVE',
    loadout2Families: {},
    loadout2Unlocks: [],
    loadout2ReceiptId: '',
    loadout2PvpExcluded: false,
    lastLoadout2Mastery: null,
    gameplay2Patch: '',
    mutationActiveIds: [],
    mutationActiveLabels: [],
    mutationActiveCount: 0,
    mutationHistoryCount: 0,
    mutationPeakActiveCount: 0,
    mutationRewardMultiplier: 1,
    mutationPeakRewardMultiplier: 1,
    mutationHistory: [],
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
  try {
    globalThis.KARecordLoadout2Objective?.(globalThis.KAGetActiveWeaponFamily?.() || 'PISTOL', 1);
  } catch {
    // LOADOUT.2 is optional during isolated run-summary tests.
  }
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

export function recordRunGameplay4BossEncounter({
  encounter = null,
  rewardPoints = 0
} = {}) {
  if (!state.active || !encounter?.completionId) return getRunSummarySnapshot();
  if (state.lastGameplay4Encounter?.completionId === encounter.completionId) {
    return getRunSummarySnapshot();
  }
  const points = Math.max(0, Math.round(finite(rewardPoints)));
  state.gameplay4BossProfile = String(encounter.profileLabel || encounter.profileId || 'BOSS').slice(0, 100);
  state.gameplay4BossInterrupts += Math.max(0, Math.round(finite(encounter.interruptCount)));
  state.gameplay4VulnerabilityHits += Math.max(0, Math.round(finite(encounter.vulnerabilityHits)));
  state.gameplay4RewardPoints += points;
  state.objectiveRewardPoints += points;
  state.lastGameplay4Encounter = {
    completionId: String(encounter.completionId).slice(0, 220),
    bossId: String(encounter.bossId || '').slice(0, 100),
    bossLabel: String(encounter.bossLabel || 'BOSS').slice(0, 120),
    profileId: String(encounter.profileId || '').slice(0, 60),
    profileLabel: state.gameplay4BossProfile,
    phaseTransitions: Math.max(0, Math.round(finite(encounter.phaseTransitions))),
    interruptCount: Math.max(0, Math.round(finite(encounter.interruptCount))),
    vulnerabilityHits: Math.max(0, Math.round(finite(encounter.vulnerabilityHits))),
    rewardPoints: points
  };
  state.lastEvent = 'EXPANDED BOSS ENCOUNTER COMPLETE';
  return getRunSummarySnapshot();
}

export function recordRunGameplay5NarrativeOutcome({
  narrative = null,
  rewardPoints = 0
} = {}) {
  if (!state.active || !narrative?.completionId) return getRunSummarySnapshot();
  if (state.lastGameplay5Narrative?.completionId === narrative.completionId) {
    return getRunSummarySnapshot();
  }
  const points = Math.max(0, Math.round(finite(rewardPoints)));
  state.gameplay5NarrativeOperationsCompleted += 1;
  state.gameplay5NarrativeRewardPoints += points;
  state.objectiveRewardPoints += points;
  state.gameplay5NarrativeBranch = String(narrative.branchLabel || narrative.branchId || 'UNRESOLVED').slice(0, 80);
  state.gameplay5NarrativeOutcome = String(narrative.outcomeLabel || narrative.outcomeId || 'MISSION RESOLVED').slice(0, 100);
  state.gameplay5NarrativeGrade = String(narrative.outcomeGrade || 'UNRANKED').slice(0, 12);
  state.lastGameplay5Narrative = {
    completionId: String(narrative.completionId).slice(0, 240),
    operationId: String(narrative.operationId || '').slice(0, 120),
    title: String(narrative.title || 'Narrative operation').slice(0, 140),
    branchId: String(narrative.branchId || 'UNRESOLVED').slice(0, 40),
    branchLabel: state.gameplay5NarrativeBranch,
    outcomeId: String(narrative.outcomeId || '').slice(0, 60),
    outcomeLabel: state.gameplay5NarrativeOutcome,
    outcomeGrade: state.gameplay5NarrativeGrade,
    transmissions: Math.max(0, Math.round(finite(narrative.transmissions?.length))),
    rewardPoints: points
  };
  state.lastEvent = 'NARRATIVE OPERATION COMPLETE';
  return getRunSummarySnapshot();
}

export function recordRunGameplay6WorldContribution({
  world = null,
  applied = false,
  unlocked = []
} = {}) {
  const contribution = world?.contribution;
  if (!state.active || !world?.completionId || !contribution?.receiptId) {
    return getRunSummarySnapshot();
  }
  if (state.lastGameplay6World?.completionId === world.completionId) {
    return getRunSummarySnapshot();
  }
  state.gameplay6WorldContributions += applied === true ? 1 : 0;
  state.gameplay6WorldPoints += applied === true
    ? Math.max(0, Math.round(finite(contribution.points)))
    : 0;
  state.gameplay6WorldSector = String(
    world.presentation?.sector?.label
    || contribution.sectorLabel
    || contribution.sectorId
    || 'UNKNOWN SECTOR'
  ).slice(0, 120);
  state.gameplay6WorldTier = Math.max(
    state.gameplay6WorldTier,
    Math.max(0, Math.round(finite(world.presentation?.sector?.tier, 0)))
  );
  const milestoneIds = (Array.isArray(unlocked) ? unlocked : [])
    .map((entry) => String(entry?.id || entry?.label || '').slice(0, 120))
    .filter(Boolean);
  state.gameplay6WorldMilestones = Array.from(new Set([
    ...state.gameplay6WorldMilestones,
    ...milestoneIds
  ])).slice(0, 24);
  state.lastGameplay6World = {
    completionId: String(world.completionId).slice(0, 240),
    receiptId: String(contribution.receiptId).slice(0, 240),
    mapId: String(contribution.mapId || world.mapId || '').slice(0, 80),
    sectorId: String(contribution.sectorId || '').slice(0, 100),
    sectorLabel: state.gameplay6WorldSector,
    region: String(contribution.region || '').slice(0, 100),
    points: Math.max(0, Math.round(finite(contribution.points))),
    applied: applied === true,
    sectorTier: state.gameplay6WorldTier,
    worldTier: Math.max(0, Math.round(finite(world.presentation?.worldTier, 0))),
    milestoneIds
  };
  state.lastEvent = applied === true
    ? 'WORLD PROGRESSION ADVANCED'
    : 'WORLD PROGRESSION RESTORED';
  return getRunSummarySnapshot();
}

export function recordRunGameplay7CampaignContribution({
  campaign = null,
  applied = false,
  controlShift = null
} = {}) {
  const contribution = campaign?.contribution;
  if (!state.active || !campaign?.completionId || !contribution?.receiptId) {
    return getRunSummarySnapshot();
  }
  if (state.lastGameplay7Campaign?.completionId === campaign.completionId) {
    return getRunSummarySnapshot();
  }
  state.gameplay7CampaignContributions += applied === true ? 1 : 0;
  state.gameplay7CampaignPoints += applied === true
    ? Math.max(0, Math.round(finite(contribution.campaignPoints)))
    : 0;
  state.gameplay7CampaignSector = String(
    campaign.presentation?.sector?.label
    || contribution.sectorLabel
    || contribution.sectorId
    || 'UNKNOWN SECTOR'
  ).slice(0, 120);
  state.gameplay7CampaignControl = String(
    controlShift?.nextControlState
    || contribution.projectedControlState
    || campaign.presentation?.sector?.controlState
    || 'CONTESTED'
  ).slice(0, 24);
  state.gameplay7CampaignFaction = String(
    contribution.factionId
    || campaign.presentation?.sector?.dominantFactionId
    || 'UNKNOWN'
  ).slice(0, 80);
  if (controlShift) {
    state.gameplay7ControlShifts = Array.from(new Set([
      ...state.gameplay7ControlShifts,
      String(controlShift.label || `${controlShift.previousControlState || ''}->${controlShift.nextControlState || ''}`).slice(0, 140)
    ])).slice(0, 24);
  }
  state.lastGameplay7Campaign = {
    completionId: String(campaign.completionId).slice(0, 260),
    receiptId: String(contribution.receiptId).slice(0, 260),
    mapId: String(contribution.mapId || campaign.mapId || '').slice(0, 80),
    sectorId: String(contribution.sectorId || '').slice(0, 100),
    sectorLabel: state.gameplay7CampaignSector,
    factionId: state.gameplay7CampaignFaction,
    campaignPoints: Math.max(0, Math.round(finite(contribution.campaignPoints))),
    playerInfluence: Math.max(0, Math.round(finite(contribution.playerInfluence))),
    enemyInfluence: Math.max(0, Math.round(finite(contribution.enemyInfluence))),
    previousControlState: String(contribution.previousControlState || 'CONTESTED').slice(0, 24),
    projectedControlState: String(contribution.projectedControlState || 'CONTESTED').slice(0, 24),
    applied: applied === true,
    controlShift: controlShift ? { ...controlShift } : null
  };
  state.lastEvent = applied === true
    ? 'CAMPAIGN CONTROL ADVANCED'
    : 'CAMPAIGN CONTROL RESTORED';
  return getRunSummarySnapshot();
}

export function recordRunLoadout2Mastery({
  applied = false,
  idempotent = false,
  pvpExcluded = false,
  receipt = null,
  result = null,
  reason = 'ENDED',
  snapshot = null
} = {}) {
  if (!state.active && !state.finalized) return getRunSummarySnapshot();
  const runtime = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const families = runtime.families && typeof runtime.families === 'object'
    ? runtime.families
    : {};
  state.loadout2MasteryXp = applied === true
    ? Math.max(0, Math.round(finite(result?.totalXp, runtime.totalXp)))
    : 0;
  state.loadout2SpecializationId = String(
    runtime.selectedSpecializationId
    || receipt?.specializationId
    || 'FIELD_OPERATIVE'
  ).slice(0, 48);
  state.loadout2Families = JSON.parse(JSON.stringify(families));
  state.loadout2Unlocks = Array.isArray(result?.unlocked)
    ? result.unlocked.map((entry) => ({ ...entry }))
    : [];
  state.loadout2ReceiptId = String(receipt?.receiptId || runtime.receiptId || '').slice(0, 240);
  state.loadout2PvpExcluded = pvpExcluded === true;
  state.lastLoadout2Mastery = {
    applied: applied === true,
    idempotent: idempotent === true,
    pvpExcluded: pvpExcluded === true,
    totalXp: state.loadout2MasteryXp,
    specializationId: state.loadout2SpecializationId,
    receiptId: state.loadout2ReceiptId,
    reason: String(reason || 'ENDED').slice(0, 80)
  };
  state.lastEvent = pvpExcluded
    ? 'LOADOUT.2 PVP ISOLATED'
    : (applied ? `WEAPON MASTERY +${state.loadout2MasteryXp}` : state.lastEvent);
  return getRunSummarySnapshot();
}

export function recordRunGameplay2Mutation({ snapshot = null, event = null } = {}) {
  if (!state.active || !snapshot || !event?.eventId) return getRunSummarySnapshot();
  const eventId = String(event.eventId || '').slice(0, 220);
  if (!eventId || state.mutationHistory.some((entry) => entry.eventId === eventId)) {
    return getRunSummarySnapshot();
  }
  const active = Array.isArray(snapshot.activeMutations) ? snapshot.activeMutations : [];
  state.gameplay2Patch = String(snapshot.patch || '').slice(0, 100);
  state.mutationActiveIds = active.map((entry) => String(entry?.id || '').slice(0, 60)).filter(Boolean).slice(0, 3);
  state.mutationActiveLabels = active.map((entry) => {
    const label = String(entry?.label || entry?.id || 'MUTATION').slice(0, 80);
    const level = Math.max(1, Math.floor(finite(entry?.level, 1)));
    return level > 1 ? `${label} L${level}` : label;
  }).slice(0, 3);
  state.mutationActiveCount = state.mutationActiveIds.length;
  state.mutationHistoryCount = Math.max(
    state.mutationHistoryCount,
    Math.max(0, Math.floor(finite(snapshot.history?.length, 0)))
  );
  state.mutationPeakActiveCount = Math.max(
    state.mutationPeakActiveCount,
    state.mutationActiveCount,
    Math.max(0, Math.floor(finite(snapshot.peakActiveCount, 0)))
  );
  state.mutationRewardMultiplier = Math.max(1, Math.min(1.75, finite(snapshot.rewardMultiplier, 1)));
  state.mutationPeakRewardMultiplier = Math.max(
    state.mutationPeakRewardMultiplier,
    Math.max(1, Math.min(1.75, finite(snapshot.peakRewardMultiplier, state.mutationRewardMultiplier)))
  );
  state.mutationHistory.push({
    eventId,
    type: String(event.type || 'ACTIVATED').slice(0, 24),
    wave: Math.max(1, Math.floor(finite(event.wave, 1))),
    mutationId: String(event.mutation?.id || '').slice(0, 60),
    mutationLabel: String(event.mutation?.label || event.mutation?.id || 'MUTATION').slice(0, 80),
    level: Math.max(1, Math.floor(finite(event.mutation?.level, 1)))
  });
  state.mutationHistory = state.mutationHistory.slice(-24);
  state.lastEvent = `ARENA MUTATION ${String(event.type || 'ACTIVE').toUpperCase()}`;
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
