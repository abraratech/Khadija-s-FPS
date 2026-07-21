import { scaleEconomyPrice } from './economy_balance.js';
import {
  PROGRESSION_PATCH,
  PROGRESSION_VERSION,
  PROGRESSION_MAX_LEVEL,
  PROGRESSION_UNLOCK_CATALOG,
  normalizeProgressionProfile,
  deriveProgressionLevel,
  evaluateProgressionUnlocks,
  applyProgressionOperationEvent,
  calculateProgressionRunReward,
  getProgressionUnlockPresentation,
  getProgressionOperationExpiry
} from './progression_core.js';

import { applyLive1RunReceipt } from './live1_core.js';
import { getLive1ManifestSnapshot } from './live1_state.js';
import {
  POST_FINAL9_PATCH,
  applyPostFinal9EconomyReceipt,
  getPostFinal9EconomyPresentation
} from './postfinal9_economy_core.js';

import {
  GAMEPLAY6_PATCH,
  applyGameplay6Contribution,
  getGameplay6WorldPresentation
} from './gameplay6_world_progression_core.js';

// js/progression.js
// PROG.1 R1 — unified persistent progression and run perks.

const STORAGE_KEY = 'ka_progression_v1';
const BACKUP_KEY = 'ka_progression_backup_v1';
const CORRUPT_KEY = 'ka_progression_corrupt_v1';

export const PERK_DEFS = Object.freeze({
  JUGGERNOG: Object.freeze({
    id: 'JUGGERNOG', shopType: 'PERK_HEALTH', label: 'Juggernog', shortLabel: 'JUG',
    description: 'Raises maximum health to 250.', cost: 2500, tone: 'red'
  }),
  SPEED_COLA: Object.freeze({
    id: 'SPEED_COLA', shopType: 'PERK_RELOAD', label: 'Speed Cola', shortLabel: 'SPD',
    description: 'Cuts weapon reload time in half.', cost: 3000, tone: 'green'
  }),
  STAMIN_UP: Object.freeze({
    id: 'STAMIN_UP', shopType: 'PERK_STAMINA', label: 'Stamin-Up', shortLabel: 'STM',
    description: 'Improves movement and sprint speed.', cost: 2800, tone: 'yellow'
  }),
  DEADSHOT: Object.freeze({
    id: 'DEADSHOT', shopType: 'PERK_DEADSHOT', label: 'Deadshot', shortLabel: 'DSH',
    description: 'Adds 18% headshot damage.', cost: 3200, tone: 'blue'
  })
});

const SHOP_TO_PERK = Object.freeze(
  Object.values(PERK_DEFS).reduce((map, perk) => {
    map[perk.shopType] = perk.id;
    return map;
  }, {})
);

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, minimum = 0) {
  return Math.max(minimum, Math.floor(safeNumber(value, fallback)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, safeNumber(value, min)));
}

function storageGet(key) {
  try {
    return globalThis.localStorage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    globalThis.localStorage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

function backupStorage(key, raw, reason) {
  if (!raw) return;
  storageSet(key, JSON.stringify({
    reason: String(reason || 'backup').slice(0, 80),
    savedAt: Date.now(),
    raw: String(raw).slice(0, 600000)
  }));
}

function readProfile() {
  const raw = storageGet(STORAGE_KEY);
  if (!raw) return normalizeProgressionProfile({}, Date.now());
  try {
    const parsed = JSON.parse(raw);
    const previousVersion = integer(parsed?.version, 1, 1);
    const normalized = normalizeProgressionProfile(parsed, Date.now());
    if (previousVersion < PROGRESSION_VERSION) {
      backupStorage(BACKUP_KEY, raw, `migration-v${previousVersion}-to-v${PROGRESSION_VERSION}`);
      storageSet(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    backupStorage(CORRUPT_KEY, raw, 'invalid-json');
    return normalizeProgressionProfile({}, Date.now());
  }
}

let profile = readProfile();
let lastProfileSaveAt = 0;
let coop2ActionSerial = 0;

const run = {
  active: false,
  finalized: false,
  runId: null,
  mapId: 'unknown',
  mode: 'single',
  gameMode: 'survival',
  difficulty: 1,
  startedAt: 0,
  endedAt: 0,
  xpEarned: 0,
  xpBreakdown: {},
  kills: 0,
  headshots: 0,
  assists: 0,
  revives: 0,
  timesRevived: 0,
  wavesCleared: 0,
  damageDealt: 0,
  damageTaken: 0,
  pointsEarned: 0,
  pointsSpent: 0,
  objectivesCompleted: 0,
  challengesCompleted: 0,
  coopContractsCompleted: 0,
  contentOperationsCompleted: 0,
  liveSeasonPoints: 0,
  liveContractsCompleted: 0,
  liveRewardUnlockIds: [],
  liveSeasonId: '',
  liveManifestRevision: '',
  operationsCompleted: [],
  weaponUpgrades: 0,
  perksPurchased: 0,
  perks: new Set(),
  lastRecordedWave: 0,
  lastEvent: 'IDLE',
  levelUps: [],
  newlyUnlocked: [],
  finalReward: null,
  finalScore: 0,
  finalWave: 1,
  endReason: 'NONE',
  botAssisted: false,
  economyAward: null,
  economyNewlyOwned: [],
  economyReceiptFields: {}
};

function dispatchCoop2Action(kind, details = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return false;
  }
  coop2ActionSerial += 1;
  const normalizedKind = String(kind || '').toUpperCase().slice(0, 40);
  const eventId = details.eventId || [
    run.runId || 'run',
    'local',
    normalizedKind || 'ACTION',
    coop2ActionSerial
  ].join(':');
  try {
    window.dispatchEvent(new CustomEvent('ka:coop2-action', {
      detail: {
        ...details,
        kind: normalizedKind,
        eventId,
        at: Number(details.at) || Date.now()
      }
    }));
    return true;
  } catch {
    return false;
  }
}

function dispatchProgressionUpdate(reason = 'updated') {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('ka:progression-updated', {
      detail: { reason, patch: PROGRESSION_PATCH }
    }));
  } catch {
    // Older/restricted browsers can still read the snapshot directly.
  }
}


function dispatchProgressionRunFinalized(receipt) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('ka:progression-run-finalized', {
      detail: {
        patch: 'prog2-r1-production-hardening-cloud-integrity',
        receipt: { ...receipt }
      }
    }));
  } catch {
    // Local progression remains authoritative while cloud delivery retries.
  }
}

function saveProfile(force = false, reason = 'save') {
  const now = Date.now();
  if (!force && run.active && now - lastProfileSaveAt < 900) return false;
  profile.updatedAt = Math.max(integer(profile.updatedAt, 0), now);
  const saved = storageSet(STORAGE_KEY, JSON.stringify(profile));
  if (saved) {
    lastProfileSaveAt = now;
    dispatchProgressionUpdate(reason);
  }
  return saved;
}

function addBreakdown(category, amount) {
  const key = String(category || 'OTHER').toUpperCase().replace(/[^A-Z0-9_ -]/g, '').slice(0, 40) || 'OTHER';
  run.xpBreakdown[key] = integer(run.xpBreakdown[key], 0) + integer(amount, 0);
}

function evaluateUnlocks(now = Date.now()) {
  const result = evaluateProgressionUnlocks(profile, now);
  profile.unlocks = { ...result.unlocks };
  if (result.newlyUnlocked.length) {
    run.newlyUnlocked.push(...result.newlyUnlocked);
    run.lastEvent = `${result.newlyUnlocked[0].label.toUpperCase()} UNLOCKED`;
  }
  return result.newlyUnlocked;
}

function recalculateLevel() {
  const levelInfo = deriveProgressionLevel(profile.xp);
  const previous = integer(profile.level, 1, 1);
  profile.level = levelInfo.level;
  if (run.active && levelInfo.level > previous) {
    for (let value = previous + 1; value <= levelInfo.level; value += 1) {
      run.levelUps.push(value);
    }
    run.lastEvent = `LEVEL ${levelInfo.level}`;
  }
  return levelInfo;
}

function grantXP(amount, reason = 'PROGRESS', category = reason) {
  const value = integer(amount, 0);
  if (value <= 0) return 0;
  profile.xp = integer(profile.xp, 0) + value;
  if (run.active || run.finalized) {
    run.xpEarned += value;
    addBreakdown(category, value);
  }
  run.lastEvent = `${String(reason || 'PROGRESS').toUpperCase()} +${value} XP`;
  recalculateLevel();
  evaluateUnlocks();
  saveProfile(false, 'xp');
  return value;
}

function applyOperationEvent(event, now = Date.now()) {
  const result = applyProgressionOperationEvent(profile.operations, event, now);
  profile.operations = result.operations;
  if (!result.completed.length) return [];
  for (const operation of result.completed) {
    profile.operationsCompleted = integer(profile.operationsCompleted, 0) + 1;
    if (operation.scope === 'DAILY') {
      profile.dailyOperationsCompleted = integer(profile.dailyOperationsCompleted, 0) + 1;
    } else {
      profile.weeklyOperationsCompleted = integer(profile.weeklyOperationsCompleted, 0) + 1;
    }
    run.operationsCompleted.push({ ...operation });
    grantXP(operation.xp, `${operation.scope} OPERATION`, `${operation.scope} OPERATION`);
  }
  evaluateUnlocks(now);
  saveProfile(true, 'operation-completed');
  return result.completed;
}

function makeRunId() {
  const random = Math.random().toString(36).slice(2, 9);
  return `run-${Date.now().toString(36)}-${random}`;
}

export function awardProgressionXP(amount, reason = 'PROGRESS') {
  grantXP(amount, reason, reason);
  return getProgressionSnapshot();
}

export function resetProgressionRun({
  runId = '',
  mapId = 'unknown',
  difficulty = 1,
  mode = 'single',
  gameMode = 'survival'
} = {}) {
  profile = normalizeProgressionProfile(profile, Date.now());
  Object.assign(run, {
    active: true,
    finalized: false,
    runId: String(runId || '').trim().slice(0, 120) || makeRunId(),
    mapId: String(mapId || 'unknown'),
    mode: String(mode || 'single') === 'multiplayer' ? 'multiplayer' : 'single',
    gameMode: String(gameMode || 'survival').toLowerCase().includes('pvp') ? 'pvp' : 'survival',
    difficulty: clamp(difficulty, 0.5, 2),
    startedAt: Date.now(),
    endedAt: 0,
    xpEarned: 0,
    xpBreakdown: {},
    kills: 0,
    headshots: 0,
    assists: 0,
    revives: 0,
    timesRevived: 0,
    wavesCleared: 0,
    damageDealt: 0,
    damageTaken: 0,
    pointsEarned: 0,
    pointsSpent: 0,
    objectivesCompleted: 0,
    challengesCompleted: 0,
    coopContractsCompleted: 0,
    contentOperationsCompleted: 0,
    operationsCompleted: [],
    weaponUpgrades: 0,
    perksPurchased: 0,
    perks: new Set(),
    lastRecordedWave: 0,
    lastEvent: 'RUN START',
    levelUps: [],
    newlyUnlocked: [],
    finalReward: null,
    finalScore: 0,
    finalWave: 1,
    endReason: 'NONE',
    botAssisted: false,
    economyAward: null,
    economyNewlyOwned: [],
    economyReceiptFields: {}
  });
  recalculateLevel();
  saveProfile(false, 'run-start');
  return getProgressionSnapshot();
}

export function finalizeProgressionRun({
  score = 0,
  wave = 1,
  reason = 'ENDED',
  summary = null,
  mode = run.mode,
  botAssisted = false
} = {}) {
  if (!run.active || run.finalized) return getProgressionSnapshot();

  const details = summary && typeof summary === 'object' ? summary : {};
  run.kills = Math.max(run.kills, integer(details.kills, 0));
  run.headshots = Math.max(run.headshots, integer(details.headshotKills, 0));
  const authoritativeRevives = integer(details.revives, run.revives);
  const missingRevives = Math.max(0, authoritativeRevives - run.revives);
  for (let index = 0; index < missingRevives; index += 1) {
    recordProgressionRevive({ revivedSelf: false });
  }
  run.timesRevived = Math.max(run.timesRevived, integer(details.timesDowned, run.timesRevived));
  run.wavesCleared = Math.max(run.wavesCleared, Math.max(0, integer(details.highestWave, wave, 1) - 1));
  run.damageDealt = Math.max(run.damageDealt, safeNumber(details.damageDealt, 0));
  run.damageTaken = Math.max(run.damageTaken, safeNumber(details.damageTaken, 0));
  run.pointsEarned = Math.max(run.pointsEarned, integer(details.pointsEarned, 0));
  run.pointsSpent = Math.max(run.pointsSpent, integer(details.pointsSpent, 0));
  run.objectivesCompleted = Math.max(run.objectivesCompleted, integer(details.objectivesCompleted, 0));
  run.challengesCompleted = Math.max(run.challengesCompleted, integer(details.challengesCompleted, 0));
  run.coopContractsCompleted = Math.max(
    run.coopContractsCompleted,
    integer(details.coopContractsCompleted, 0)
  );
  run.contentOperationsCompleted = Math.max(
    run.contentOperationsCompleted,
    integer(details.contentOperationsCompleted, 0)
  );
  run.weaponUpgrades = Math.max(run.weaponUpgrades, integer(details.weaponUpgrades, 0));
  run.perksPurchased = Math.max(run.perksPurchased, integer(details.perksPurchased, 0));
  run.botAssisted = botAssisted === true || details.botAssisted === true;
  run.mode = String(mode || run.mode) === 'multiplayer' ? 'multiplayer' : 'single';
  run.finalScore = integer(score ?? details.finalScore, 0);
  run.finalWave = integer(wave ?? details.highestWave, 1, 1);
  run.endReason = String(reason || 'ENDED').toUpperCase().slice(0, 80);
  run.endedAt = Date.now();

  const reward = calculateProgressionRunReward({
    summary: details,
    score: run.finalScore,
    wave: run.finalWave,
    reason: run.endReason,
    difficulty: run.difficulty,
    mode: run.mode
  });
  run.finalReward = reward;
  Object.entries(reward.breakdown).forEach(([category, value]) => {
    if (value > 0) grantXP(value, category, category);
  });

  const completed = !reward.abandoned;
  profile.totalRuns += 1;
  if (completed) profile.completedRuns += 1;
  else profile.abandonedRuns += 1;
  if (run.mode === 'multiplayer') profile.multiplayerRuns += 1;
  else profile.soloRuns += 1;
  if (run.botAssisted) profile.botAssistedRuns += 1;

  profile.totalKills += run.kills;
  profile.totalHeadshots += run.headshots;
  profile.totalAssists += run.assists;
  profile.totalRevives += run.revives;
  profile.timesRevived += run.timesRevived;
  profile.totalWaves += run.wavesCleared;
  profile.totalDamageDealt += Math.round(run.damageDealt);
  profile.totalDamageTaken += Math.round(run.damageTaken);
  profile.totalPlaySeconds += Math.max(0, Math.round(
    safeNumber(details.durationSeconds, (run.endedAt - run.startedAt) / 1000)
  ));
  profile.objectivesCompleted += run.objectivesCompleted;
  profile.challengesCompleted += run.challengesCompleted;
  profile.coopContractsCompleted += run.coopContractsCompleted;
  profile.contentOperationsCompleted = integer(profile.contentOperationsCompleted, 0) + run.contentOperationsCompleted;
  profile.weaponUpgrades += run.weaponUpgrades;
  profile.perksPurchased += run.perksPurchased;
  profile.pointsEarned += run.pointsEarned;
  profile.pointsSpent += run.pointsSpent;
  profile.bestWave = Math.max(profile.bestWave, run.finalWave);
  profile.bestScore = Math.max(profile.bestScore, run.finalScore);
  profile.bestAccuracy = Math.max(profile.bestAccuracy, clamp(details.accuracy, 0, 100));
  profile.longestRunSeconds = Math.max(
    profile.longestRunSeconds,
    Math.round(safeNumber(details.durationSeconds, 0))
  );
  profile.lastRunAt = run.endedAt;

  const liveManifest = getLive1ManifestSnapshot();
  if (liveManifest?.season?.active === true) {
    const liveResult = applyLive1RunReceipt(
      profile.live1,
      {
        runId: run.runId,
        mapId: run.mapId,
        mode: run.mode,
        difficulty: run.difficulty,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        durationSeconds: Math.max(0, Math.round(
          safeNumber(details.durationSeconds, (run.endedAt - run.startedAt) / 1000)
        )),
        reason: run.endReason,
        kills: run.kills,
        wavesCleared: run.wavesCleared,
        coopContractsCompleted: run.coopContractsCompleted,
        contentOperationsCompleted: run.contentOperationsCompleted,
        liveSeasonId: liveManifest.season.id,
        liveManifestRevision: liveManifest.revision
      },
      liveManifest,
      run.endedAt
    );
    if (liveResult.valid) {
      profile.live1 = liveResult.profile;
      run.liveSeasonPoints = integer(liveResult.seasonPointsAward, 0);
      run.liveContractsCompleted = liveResult.completedStages.length;
      run.liveRewardUnlockIds = [...liveResult.rewardUnlockIds];
      run.liveSeasonId = liveManifest.season.id;
      run.liveManifestRevision = liveManifest.revision;
      if (liveResult.xpAward > 0) {
        grantXP(
          liveResult.xpAward,
          'LIVE CONTRACT',
          'LIVE OPERATIONS'
        );
      }
    }
  }

  if (completed) {
    applyOperationEvent({
      kind: 'RUN_COMPLETE',
      amount: 1,
      mode: run.mode,
      difficulty: run.difficulty
    });
  }

  const localMissionMedal = Array.isArray(details.missionMedals)
    ? details.missionMedals.find((entry) => entry?.isLocal === true)
    : null;
  run.economyReceiptFields = {
    factionId: String(details.lastReplayability?.factionId || details.factionId || '').slice(0, 80),
    bossId: String(details.lastReplayability?.bossId || '').slice(0, 100),
    bossDefeated: Boolean(details.lastReplayability?.bossId || (details.bossDefeated && details.bossDefeated !== 'NONE')),
    bossWeakPointHits: integer(details.bossWeakPointHits, 0),
    bossStaggers: integer(details.bossStaggers, 0),
    replayModifierCount: Array.isArray(details.replayModifiers) ? details.replayModifiers.length : 0,
    replayMasteryGrade: String(details.replayMasteryGrade || 'UNRANKED').slice(0, 16),
    missionRiskChoice: String(details.missionRiskChoice || 'NONE').slice(0, 24),
    missionChainsCompleted: integer(details.missionChainsCompleted, 0),
    missionStagesCompleted: integer(details.missionStagesCompleted, 0),
    missionOptionalStagesCompleted: integer(details.missionOptionalStagesCompleted, 0),
    contributionRole: String(localMissionMedal?.role || details.contributionRole || 'VANGUARD').slice(0, 32),
    loadoutId: String(details.loadoutId || 'default-loadout').slice(0, 100),
    primaryWeaponId: String(details.primaryWeaponId || 'PISTOL').slice(0, 80),
    missionId: String(details.lastMission?.missionId || details.missionId || run.mapId).slice(0, 100),
    gameplay2Patch: String(details.gameplay2Patch || '').slice(0, 100),
    mutationActiveIds: Array.isArray(details.mutationActiveIds)
      ? details.mutationActiveIds.map((entry) => String(entry || '').slice(0, 60)).slice(0, 3)
      : [],
    mutationActiveCount: integer(details.mutationActiveCount, 0),
    mutationHistoryCount: integer(details.mutationHistoryCount, 0),
    mutationPeakActiveCount: integer(details.mutationPeakActiveCount, 0),
    mutationRewardMultiplier: clamp(details.mutationRewardMultiplier, 1, 1.75),
    mutationPeakRewardMultiplier: clamp(details.mutationPeakRewardMultiplier, 1, 1.75)
  };
  const economyResult = applyPostFinal9EconomyReceipt(
    profile.economy,
    {
      runId: run.runId,
      endedAt: run.endedAt,
      reason: run.endReason,
      difficulty: run.difficulty,
      gameMode: run.gameMode,
      kills: run.kills,
      headshots: run.headshots,
      assists: run.assists,
      revives: run.revives,
      damageDealt: Math.round(run.damageDealt),
      wave: run.finalWave,
      mapId: run.mapId,
      wavesCleared: run.wavesCleared,
      objectivesCompleted: run.objectivesCompleted,
      ...run.economyReceiptFields
    },
    {
      totalXp: profile.xp,
      completedOperations: run.operationsCompleted,
      now: run.endedAt
    }
  );
  if (economyResult.valid) {
    profile.economy = economyResult.economy;
    run.economyAward = economyResult.award ? { ...economyResult.award } : null;
    run.economyNewlyOwned = (economyResult.newlyOwned || []).map((entry) => ({ ...entry }));
    if (run.economyAward) {
      run.lastEvent = `ECONOMY +${run.economyAward.credits || 0} CREDITS`;
    }
  }

  evaluateUnlocks(run.endedAt);
  recalculateLevel();

  profile.recentRuns = [
    {
      runId: run.runId,
      endedAt: run.endedAt,
      mapId: run.mapId,
      mode: run.mode,
      gameMode: run.gameMode,
      difficulty: run.difficulty,
      score: run.finalScore,
      wave: run.finalWave,
      kills: run.kills,
      headshots: run.headshots,
      revives: run.revives,
      coopContractsCompleted: run.coopContractsCompleted,
      contentOperationsCompleted: run.contentOperationsCompleted,
      liveSeasonPoints: run.liveSeasonPoints,
      liveContractsCompleted: run.liveContractsCompleted,
      xpEarned: run.xpEarned,
      reason: run.endReason,
      botAssisted: run.botAssisted
    },
    ...(Array.isArray(profile.recentRuns) ? profile.recentRuns : [])
  ].filter((entry, index, values) => (
    values.findIndex((candidate) => candidate.runId === entry.runId) === index
  )).slice(0, 12);

  run.active = false;
  run.finalized = true;
  run.lastEvent = run.endReason;
  saveProfile(true, 'run-finalized');
  dispatchProgressionRunFinalized({
    version: 1,
    runId: run.runId,
    mapId: run.mapId,
    mode: run.mode,
    gameMode: run.gameMode,
    difficulty: run.difficulty,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationSeconds: Math.max(0, Math.round(
      safeNumber(details.durationSeconds, (run.endedAt - run.startedAt) / 1000)
    )),
    reason: run.endReason,
    score: run.finalScore,
    wave: run.finalWave,
    wavesCleared: run.wavesCleared,
    kills: run.kills,
    headshots: run.headshots,
    assists: run.assists,
    revives: run.revives,
    timesRevived: run.timesRevived,
    damageDealt: Math.round(run.damageDealt),
    damageTaken: Math.round(run.damageTaken),
    pointsEarned: run.pointsEarned,
    pointsSpent: run.pointsSpent,
    objectivesCompleted: run.objectivesCompleted,
    challengesCompleted: run.challengesCompleted,
    coopContractsCompleted: run.coopContractsCompleted,
    contentOperationsCompleted: run.contentOperationsCompleted,
    liveSeasonId: run.liveSeasonId,
    liveManifestRevision: run.liveManifestRevision,
    weaponUpgrades: run.weaponUpgrades,
    perksPurchased: run.perksPurchased,
    accuracy: clamp(details.accuracy, 0, 100),
    botAssisted: run.botAssisted,
    ...run.economyReceiptFields
  });
  return getProgressionSnapshot();
}

export function recordProgressionKill({ headshot = false } = {}) {
  if (!run.active) return;
  run.kills += 1;
  grantXP(4, 'ELIMINATION', 'COMBAT');
  applyOperationEvent({ kind: 'KILL', amount: 1, difficulty: run.difficulty, mode: run.mode });
  dispatchCoop2Action('KILL', { amount: 1, headshot });
  if (headshot) {
    run.headshots += 1;
    grantXP(3, 'HEADSHOT', 'HEADSHOTS');
    applyOperationEvent({ kind: 'HEADSHOT', amount: 1, difficulty: run.difficulty, mode: run.mode });
  }
}

export function recordProgressionAssist(amount = 1) {
  if (!run.active) return;
  const value = integer(amount, 1, 1);
  run.assists += value;
  grantXP(value * 4, 'ASSIST', 'ASSISTS');
}

export function recordProgressionWaveClear(wave = 1) {
  if (!run.active) return;
  const value = integer(wave, 1, 1);
  if (value <= run.lastRecordedWave) return;
  run.lastRecordedWave = value;
  run.wavesCleared += 1;
  grantXP(28 + Math.min(72, Math.max(0, value - 1) * 3), 'WAVE CLEAR', 'WAVES');
  dispatchCoop2Action('WAVE_CLEAR', {
    amount: 1,
    wave: value,
    eventId: `${run.runId || 'run'}:wave:${value}`
  });
  applyOperationEvent({
    kind: 'WAVE',
    amount: 1,
    wave: value,
    difficulty: run.difficulty,
    mode: run.mode
  });
}

export function recordProgressionDamageDealt(amount = 0) {
  if (!run.active) return;
  const value = Math.max(0, safeNumber(amount, 0));
  run.damageDealt += value;
  applyOperationEvent({ kind: 'DAMAGE', amount: value, difficulty: run.difficulty, mode: run.mode });
}

export function recordProgressionDamageTaken(amount = 0) {
  if (!run.active) return;
  run.damageTaken += Math.max(0, safeNumber(amount, 0));
}

export function recordProgressionPointsEarned(amount = 0) {
  if (!run.active) return;
  run.pointsEarned += integer(amount, 0);
}

export function recordProgressionPurchase(cost = 0, type = 'PURCHASE') {
  if (!run.active) return;
  const value = integer(cost, 0);
  run.pointsSpent += value;
  run.lastEvent = `${String(type || 'PURCHASE').toUpperCase()} -${value} PTS`;
}

export function recordProgressionObjective() {
  if (!run.active) return;
  run.objectivesCompleted += 1;
  run.lastEvent = 'OBJECTIVE COMPLETE';
  dispatchCoop2Action('OBJECTIVE', { amount: 1 });
  applyOperationEvent({ kind: 'OBJECTIVE', amount: 1, difficulty: run.difficulty, mode: run.mode });
}

export function recordProgressionChallenge() {
  if (!run.active) return;
  run.challengesCompleted += 1;
  run.lastEvent = 'CHALLENGE COMPLETE';
  dispatchCoop2Action('CHALLENGE', { amount: 1 });
  applyOperationEvent({ kind: 'CHALLENGE', amount: 1, difficulty: run.difficulty, mode: run.mode });
}

export function recordProgressionRevive({ revivedSelf = false } = {}) {
  if (!run.active) return;
  if (revivedSelf) {
    run.timesRevived += 1;
    grantXP(15, 'BACK IN ACTION', 'TEAMWORK');
    return;
  }
  run.revives += 1;
  grantXP(65, 'REVIVE', 'TEAMWORK');
  applyOperationEvent({ kind: 'REVIVE', amount: 1, difficulty: run.difficulty, mode: run.mode });
}

export function recordProgressionCoopContract({
  contractId = 'SHARED_CONTRACT',
  completionId = '',
  xp = 180
} = {}) {
  if (!run.active && !run.finalized) return false;
  run.coopContractsCompleted += 1;
  run.challengesCompleted += 1;
  grantXP(
    Math.min(250, Math.max(0, integer(xp, 180))),
    `CO-OP CONTRACT · ${String(contractId || 'TEAM').replace(/_/g, ' ')}`,
    'CO-OP CONTRACT'
  );
  run.lastEvent = 'SHARED CONTRACT COMPLETE';
  applyOperationEvent({
    kind: 'CHALLENGE',
    amount: 1,
    difficulty: run.difficulty,
    mode: run.mode
  });
  return {
    contractId: String(contractId || 'SHARED_CONTRACT').slice(0, 80),
    completionId: String(completionId || '').slice(0, 220),
    completed: run.coopContractsCompleted
  };
}


export function recordProgressionContentOperation({
  operationId = 'ARENA_OPERATION',
  completionId = '',
  xp = 160
} = {}) {
  if (!run.active && !run.finalized) return false;
  run.contentOperationsCompleted += 1;
  run.objectivesCompleted += 1;
  grantXP(
    Math.min(220, Math.max(0, integer(xp, 160))),
    `ARENA OPERATION · ${String(operationId || 'OPERATION').replace(/_/g, ' ')}`,
    'ARENA OPERATION'
  );
  run.lastEvent = 'ARENA OPERATION COMPLETE';
  applyOperationEvent({
    kind: 'OBJECTIVE',
    amount: 1,
    difficulty: run.difficulty,
    mode: run.mode
  });
  return {
    operationId: String(operationId || 'ARENA_OPERATION').slice(0, 80),
    completionId: String(completionId || '').slice(0, 220),
    completed: run.contentOperationsCompleted
  };
}

export function recordProgressionWeaponUpgrade(tier = 1) {
  if (!run.active) return;
  run.weaponUpgrades += 1;
  grantXP(35 + Math.max(0, integer(tier, 1, 1) - 1) * 20, `WEAPON TIER ${tier}`, 'UPGRADES');
}

export function markProgressionBotAssisted(value = true) {
  if (!run.active) return;
  run.botAssisted = value === true;
}

export function getPerkIdForShop(shopType) {
  return SHOP_TO_PERK[String(shopType || '')] || null;
}

export function getPerkDefinition(perkId) {
  const perk = PERK_DEFS[String(perkId || '')] || null;
  if (!perk) return null;
  return Object.freeze({
    ...perk,
    baseCost: perk.cost,
    cost: scaleEconomyPrice(perk.cost, 'PERK')
  });
}

export function hasProgressionPerk(perkId) {
  return run.perks.has(String(perkId || ''));
}

export function purchaseProgressionPerk(perkId, playerState) {
  const perk = getPerkDefinition(perkId);
  if (!perk) return { ok: false, reason: 'UNKNOWN PERK' };
  if (hasProgressionPerk(perk.id)) return { ok: false, reason: 'ALREADY ACTIVE', perk };
  if (!playerState) return { ok: false, reason: 'NO PLAYER', perk };

  run.perks.add(perk.id);
  run.perksPurchased += 1;

  if (perk.id === 'JUGGERNOG') {
    playerState.maxHealth = 250;
    playerState.health = 250;
  } else if (perk.id === 'SPEED_COLA') {
    playerState.reloadMult = 0.5;
  } else if (perk.id === 'STAMIN_UP') {
    playerState.baseSpeed = 10.65;
    playerState.sprintSpeed = 17.0;
    playerState.adsSpeed = 4.8;
  }

  grantXP(40, perk.label.toUpperCase(), 'PERKS');
  run.lastEvent = `${perk.label.toUpperCase()} ACTIVE`;
  return { ok: true, perk };
}

export function getProgressionHeadshotScale() {
  return hasProgressionPerk('DEADSHOT') ? 1.18 : 1;
}

export function getWeaponUpgradeCost(nextTier) {
  const tier = Math.max(1, Math.min(3, Math.round(safeNumber(nextTier, 1))));
  const baseCost = tier === 1 ? 4200 : (tier === 2 ? 6500 : 9000);
  return scaleEconomyPrice(baseCost, 'WEAPON_UPGRADE');
}

export function getWeaponUpgradeTier(weapon) {
  if (!weapon) return 0;
  if (Number.isFinite(weapon.upgradeTier)) return Math.max(0, Math.min(3, Math.round(weapon.upgradeTier)));
  return weapon.isUpgraded ? 1 : 0;
}

export function getActivePerkChips() {
  return [...run.perks].map((id) => {
    const perk = PERK_DEFS[id];
    return perk ? { label: perk.label.toUpperCase(), value: perk.shortLabel, tone: perk.tone } : null;
  }).filter(Boolean);
}

export function consumeProgressionLevelUps() {
  const values = run.levelUps.slice();
  run.levelUps.length = 0;
  return values;
}

export function consumeProgressionUnlocks() {
  const values = run.newlyUnlocked.map((entry) => ({ ...entry }));
  run.newlyUnlocked.length = 0;
  return values;
}

export function equipProgressionCosmetic(unlockId) {
  const entry = PROGRESSION_UNLOCK_CATALOG.find((candidate) => candidate.id === String(unlockId || ''));
  if (!entry) return { ok: false, reason: 'UNKNOWN_UNLOCK' };
  if (!profile.unlocks?.[entry.id]) return { ok: false, reason: 'LOCKED', unlock: entry };
  const field = entry.kind.toLowerCase();
  profile.equipped = {
    ...(profile.equipped || {}),
    [field]: entry.id,
    updatedAt: Date.now()
  };
  saveProfile(true, 'cosmetic-equipped');
  return { ok: true, unlock: entry, snapshot: getProgressionSnapshot() };
}

export function recordProgressionGameplay6WorldContribution(receipt = null) {
  if (!receipt?.receiptId) {
    return Object.freeze({
      applied: false,
      idempotent: false,
      patch: GAMEPLAY6_PATCH,
      profile: profile.world6,
      unlocked: []
    });
  }
  const result = applyGameplay6Contribution(profile.world6, receipt, Date.now());
  profile.world6 = result.profile;
  if (result.applied) {
    run.lastEvent = `WORLD PROGRESS +${Math.max(0, Math.round(Number(receipt.points) || 0))}`;
    saveProfile(true, 'gameplay6-world-progress');
  }
  return Object.freeze({
    applied: result.applied === true,
    idempotent: result.idempotent === true,
    patch: GAMEPLAY6_PATCH,
    profile: result.profile,
    presentation: getGameplay6WorldPresentation(result.profile, receipt.mapId || run.mapId),
    unlocked: result.unlocked || []
  });
}

export function getProgressionSnapshot() {
  profile = normalizeProgressionProfile(profile, Date.now());
  const levelInfo = recalculateLevel();
  const unlocks = getProgressionUnlockPresentation(profile);
  return {
    patch: PROGRESSION_PATCH,
    version: PROGRESSION_VERSION,
    profile: { ...profile, ...levelInfo },
    run: {
      ...run,
      perks: [...run.perks],
      xpBreakdown: { ...run.xpBreakdown },
      durationSeconds: run.startedAt
        ? Math.max(0, ((run.endedAt || Date.now()) - run.startedAt) / 1000)
        : 0,
      levelUps: run.levelUps.slice(),
      newlyUnlocked: run.newlyUnlocked.map((entry) => ({ ...entry })),
      operationsCompleted: run.operationsCompleted.map((entry) => ({ ...entry }))
    },
    operations: profile.operations,
    operationExpiry: getProgressionOperationExpiry(Date.now()),
    unlocks,
    equipped: { ...profile.equipped },
    maxLevel: PROGRESSION_MAX_LEVEL,
    economy: getPostFinal9EconomyPresentation(profile.economy, profile.xp, Date.now()),
    economyPatch: POST_FINAL9_PATCH,
    world6: getGameplay6WorldPresentation(profile.world6, run.mapId),
    world6Patch: GAMEPLAY6_PATCH,
    perkDefinitions: Object.values(PERK_DEFS).map((perk) => ({ ...perk }))
  };
}

export function resetPersistentProgression() {
  const raw = storageGet(STORAGE_KEY);
  backupStorage(BACKUP_KEY, raw, 'manual-reset');
  profile = normalizeProgressionProfile({}, Date.now());
  saveProfile(true, 'manual-reset');
  return getProgressionSnapshot();
}

if (typeof window !== 'undefined') {
  window.KAGetProgression = getProgressionSnapshot;
}
