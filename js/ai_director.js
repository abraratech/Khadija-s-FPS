// js/ai_director.js
import {
  resetAISquadRun,
  endAISquadRun,
  beginAISquadWave,
  updateAISquad,
  getAISquadSnapshot
} from './ai_squad.js';
import {
  resetAINavigationRun,
  endAINavigationRun,
  beginAINavigationWave,
  updateAINavigationDebug,
  getAINavigationSnapshot
} from './ai_navigation.js';
import {
  getAIMemoryPrior,
  commitAIMemoryRun
} from './ai_memory.js';
import {
  resetAIStrategyRun,
  endAIStrategyRun,
  beginAIStrategyWave,
  selectAIStrategy,
  evaluateAIStrategyWave,
  getAIStrategySnapshot
} from './ai_strategy.js';
import {
  resetAIExploitRun,
  endAIExploitRun,
  beginAIExploitWave,
  updateAIExploit,
  getAIExploitSnapshot
} from './ai_exploit.js';
import {
  resetAIAttackRun,
  endAIAttackRun,
  beginAIAttackWave,
  getAIAttackSnapshot
} from './ai_attacks.js';
import {
  resetAIArchetypeRun,
  endAIArchetypeRun,
  beginAIArchetypeWave,
  getAIArchetypeSnapshot
} from './ai_archetypes.js';
import {
  resetAIFormationRun,
  endAIFormationRun,
  beginAIFormationWave,
  getAIFormationSnapshot
} from './ai_formation.js';

// C10.1 — Adaptive AI Director Foundation
//
// This is a lightweight, deterministic gameplay director—not a neural network.
// It observes the current run, summarizes completed waves, and applies gradual,
// capped adaptations from wave 7 onward.

const DIRECTOR_ACTIVATION_WAVE = 7;
const DIRECTOR_MAX_INTENSITY = 0.92;
const DIRECTOR_DEBUG_KEY = 'ka_ai_director_debug';

const DEFAULT_TUNING = Object.freeze({
  active: false,
  intensity: 0,
  response: 'OBSERVING',
  spawnIntervalScale: 1,
  activeCapBonus: 0,
  speedScale: 1,
  predictionSeconds: 0,
  flankChance: 0,
  flankDistance: 0,
  strategyId: 'NONE',
  strategyLabel: 'OBSERVING',
  strategyTier: 0,
  rangedElevationResponse: 0,
  exploitState: 'CLEAR',
  weightMultipliers: Object.freeze({
    SHAMBLER: 1,
    CRAWLER: 1,
    RUNNER: 1,
    BRUTE: 1,
    EXPLODER: 1,
    RANGED: 1,
    GOLIATH: 1
  })
});

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function makeWaveTelemetry(wave = 1) {
  return {
    wave,
    elapsed: 0,
    engagementTime: 0,
    stationaryTime: 0,
    sprintTime: 0,
    adsTime: 0,
    closePressureTime: 0,
    distanceMoved: 0,
    shots: 0,
    successfulShots: 0,
    headshotHits: 0,
    kills: 0,
    hitDistanceTotal: 0,
    damageTaken: 0,
    damageByType: {},
    shotsByWeapon: {},
    lastPlayerX: null,
    lastPlayerZ: null,
    pressureSampleTimer: 0,
    stationaryCandidateTime: 0,
    stationaryGraceT: 0,
    pauseProtectedTime: 0,
    lastUpdateAt: 0,
    unreachableTime: 0,
    validElevatedTime: 0
  };
}

const state = {
  runActive: false,
  mapId: 'unknown',
  difficulty: 1,
  currentWave: 1,
  history: [],
  wave: makeWaveTelemetry(1),
  profile: {
    style: 'OBSERVING',
    preferredRange: 'UNKNOWN',
    campingScore: 0,
    movementScore: 0,
    accuracy: 0,
    headshotRate: 0,
    averageHitDistance: 0,
    damagePressure: 0,
    confidence: 0,
    preferredWeapon: 'UNKNOWN',
    dangerEnemy: 'UNKNOWN'
  },
  tuning: { ...DEFAULT_TUNING, weightMultipliers: { ...DEFAULT_TUNING.weightMultipliers } },
  lastResponse: 'OBSERVING',
  debugEnabled: readDebugSetting(),
  debugPanel: null,
  debugRefreshT: 0,
  sessionId: 'run',
  completedWaves: 0,
  runStartedAt: 0,
  memoryPrior: getAIMemoryPrior('unknown'),
  memoryBlend: 0,
  memoryCommitted: false,
  memoryLastSavedAt: 0
};

function readDebugSetting() {
  try {
    localStorage.removeItem(DIRECTOR_DEBUG_KEY);
  } catch {
    // Ignore restricted/private storage failures.
  }
  return false;
}

function saveDebugSetting() {
  try {
    localStorage.removeItem(DIRECTOR_DEBUG_KEY);
  } catch {
    // Ignore restricted/private storage failures.
  }
}

function getWeaponFamily(weapon) {
  return String(weapon?.key || weapon?.weaponFamily || 'UNKNOWN').replace('_UPG', '');
}

function getLargestKey(record = {}) {
  let bestKey = 'UNKNOWN';
  let bestValue = -Infinity;

  for (const [key, value] of Object.entries(record)) {
    const n = Number(value) || 0;
    if (n > bestValue) {
      bestValue = n;
      bestKey = key;
    }
  }

  return bestKey;
}

function summarizeWave(waveTelemetry, health = 100, maxHealth = 100) {
  const engagement = Math.max(0.001, waveTelemetry.engagementTime);
  const shots = Math.max(0, waveTelemetry.shots);
  const successfulShots = Math.max(0, waveTelemetry.successfulShots);
  const maxHp = Math.max(1, Number(maxHealth) || 100);

  return {
    wave: waveTelemetry.wave,
    clearTime: waveTelemetry.elapsed,
    campingScore: clamp(waveTelemetry.stationaryTime / engagement),
    movementSpeed: waveTelemetry.distanceMoved / engagement,
    sprintShare: clamp(waveTelemetry.sprintTime / engagement),
    adsShare: clamp(waveTelemetry.adsTime / engagement),
    closePressureShare: clamp(waveTelemetry.closePressureTime / engagement),
    unreachableShare: clamp(waveTelemetry.unreachableTime / engagement),
    validElevatedShare: clamp(waveTelemetry.validElevatedTime / engagement),
    pauseProtectedShare: clamp(waveTelemetry.pauseProtectedTime / engagement),
    accuracy: shots > 0 ? clamp(successfulShots / shots) : 0,
    headshotRate: successfulShots > 0 ? clamp(waveTelemetry.headshotHits / successfulShots) : 0,
    averageHitDistance: successfulShots > 0
      ? waveTelemetry.hitDistanceTotal / successfulShots
      : 0,
    damagePressure: clamp(waveTelemetry.damageTaken / maxHp, 0, 2),
    healthRemaining: clamp((Number(health) || 0) / maxHp),
    preferredWeapon: getLargestKey(waveTelemetry.shotsByWeapon),
    dangerEnemy: getLargestKey(waveTelemetry.damageByType),
    shots,
    kills: waveTelemetry.kills
  };
}

function weightedMetric(history, key, fallback = 0) {
  if (!history.length) return fallback;

  let total = 0;
  let weightTotal = 0;

  history.slice(-5).forEach((entry, index, arr) => {
    const weight = 1 + index / Math.max(1, arr.length - 1);
    const value = Number(entry[key]);

    if (Number.isFinite(value)) {
      total += value * weight;
      weightTotal += weight;
    }
  });

  return weightTotal > 0 ? total / weightTotal : fallback;
}

function weightedMode(history, key, fallback = 'UNKNOWN') {
  const scores = {};

  history.slice(-5).forEach((entry, index, arr) => {
    const value = String(entry[key] || fallback);
    const weight = 1 + index / Math.max(1, arr.length - 1);
    scores[value] = (scores[value] || 0) + weight;
  });

  return getLargestKey(scores) || fallback;
}

function classifyProfile() {
  const history = state.history;
  const currentCampingScore = weightedMetric(history, 'campingScore');
  const currentMovementSpeed = weightedMetric(history, 'movementSpeed');
  const currentMovementScore = clamp(currentMovementSpeed / 6);
  const currentSprintShare = weightedMetric(history, 'sprintShare');
  const currentAccuracy = weightedMetric(history, 'accuracy');
  const currentHeadshotRate = weightedMetric(history, 'headshotRate');
  const currentAverageHitDistance = weightedMetric(history, 'averageHitDistance');
  const currentDamagePressure = weightedMetric(history, 'damagePressure');
  const currentClosePressureShare = weightedMetric(history, 'closePressureShare');

  const totalShots = history.reduce((sum, wave) => sum + (wave.shots || 0), 0);
  const currentConfidence = clamp(
    (history.length / 4) * 0.55 +
    (Math.min(100, totalShots) / 100) * 0.45
  );

  const memory = state.memoryPrior;
  const prior = memory?.profile || {};
  const historyFade = clamp(1 - Math.max(0, history.length - 1) * 0.11, 0.38, 1);

  // Persistent memory is a prior, not a replacement for current evidence.
  // It begins at no more than 34%, fades as this run produces data, and is
  // weakened further whenever the current player is under real pressure.
  const pressureProtection = (
    currentDamagePressure >= 0.58 ||
    currentClosePressureShare >= 0.52
  ) ? 0.45 : 1;

  const memoryBlend = memory?.available
    ? clamp(memory.influence * historyFade * pressureProtection, 0, 0.34)
    : 0;

  state.memoryBlend = memoryBlend;

  const blend = (currentValue, priorValue, min = 0, max = 1) => {
    const current = Number(currentValue);
    const remembered = Number(priorValue);

    if (!Number.isFinite(remembered)) {
      return clamp(current, min, max);
    }

    return clamp(
      current * (1 - memoryBlend) + remembered * memoryBlend,
      min,
      max
    );
  };

  const campingScore = blend(currentCampingScore, prior.campingScore);
  const movementScore = blend(currentMovementScore, prior.movementScore);
  const accuracy = blend(currentAccuracy, prior.accuracy);
  const headshotRate = blend(currentHeadshotRate, prior.headshotRate);
  const averageHitDistance = blend(
    currentAverageHitDistance,
    prior.averageHitDistance,
    0,
    120
  );

  // Remembered struggle may make the Director more merciful. Remembered skill
  // may not conceal current-run struggle.
  const blendedDamagePressure = blend(
    currentDamagePressure,
    prior.damagePressure,
    0,
    2
  );
  const damagePressure = Math.max(currentDamagePressure, blendedDamagePressure);

  let preferredRange = 'MID';
  if (averageHitDistance > 18) preferredRange = 'LONG';
  else if (averageHitDistance > 0 && averageHitDistance < 8) preferredRange = 'CLOSE';

  let style = 'BALANCED';

  // Current danger always has priority over remembered tendencies.
  if (currentDamagePressure >= 0.72 || currentClosePressureShare >= 0.62) {
    style = 'PRESSURED';
  } else if (damagePressure >= 0.78) {
    style = 'PRESSURED';
  } else if (campingScore >= 0.48) {
    style = 'FORTIFIED';
  } else if (movementScore >= 0.70 || currentSprintShare >= 0.26) {
    style = 'MOBILE';
  } else if (preferredRange === 'LONG' && (accuracy >= 0.34 || headshotRate >= 0.28)) {
    style = 'MARKSMAN';
  } else if (preferredRange === 'CLOSE') {
    style = 'BRAWLER';
  } else if (
    memoryBlend >= 0.22 &&
    history.length <= 2 &&
    prior.style &&
    prior.style !== 'PRESSURED'
  ) {
    // Only use a remembered categorical label while current evidence is thin.
    style = prior.style;
  }

  const currentPreferredWeapon = weightedMode(history, 'preferredWeapon');
  const currentDangerEnemy = weightedMode(history, 'dangerEnemy');

  state.profile = {
    style,
    preferredRange,
    campingScore,
    movementScore,
    accuracy,
    headshotRate,
    averageHitDistance,
    damagePressure,
    confidence: clamp(
      currentConfidence +
      memoryBlend * (Number(prior.confidence) || 0) * 0.18
    ),
    preferredWeapon: (
      currentPreferredWeapon === 'UNKNOWN' && memoryBlend > 0
        ? prior.preferredWeapon
        : currentPreferredWeapon
    ) || 'UNKNOWN',
    dangerEnemy: (
      currentDangerEnemy === 'UNKNOWN' && memoryBlend > 0
        ? prior.dangerEnemy
        : currentDangerEnemy
    ) || 'UNKNOWN'
  };

  return state.profile;
}

function makeWeightMultipliers() {
  return {
    SHAMBLER: 1,
    CRAWLER: 1,
    RUNNER: 1,
    BRUTE: 1,
    EXPLODER: 1,
    RANGED: 1,
    GOLIATH: 1
  };
}

function buildTuning(nextWave) {
  const profile = state.profile;
  const active = nextWave >= DIRECTOR_ACTIVATION_WAVE && state.history.length >= 2;

  if (!active) {
    selectAIStrategy({
      active: false,
      wave: nextWave,
      evidence: state.history.length,
      profile: state.profile,
      intensity: 0
    });

    state.tuning = {
      ...DEFAULT_TUNING,
      response: nextWave >= DIRECTOR_ACTIVATION_WAVE - 1 ? 'FINALIZING PROFILE' : 'OBSERVING',
      weightMultipliers: makeWeightMultipliers()
    };
    return state.tuning;
  }

  // C10.2: the previous 78% value was an intentional hard ceiling.
  // Extend late-wave adaptation gradually to 92% while keeping all individual
  // speed, spawn, cap, and squad effects independently bounded.
  const waveRamp = clamp(
    (nextWave - DIRECTOR_ACTIVATION_WAVE + 1) / 12,
    0.14,
    DIRECTOR_MAX_INTENSITY
  );
  let intensity = waveRamp * (0.45 + profile.confidence * 0.55);
  const weights = makeWeightMultipliers();

  let response = 'MIXED PRESSURE';
  let predictionSeconds = 0.12 + intensity * 0.24;
  let flankChance = 0.06 + intensity * 0.13;
  let activeCapBonus = intensity >= 0.72 ? 2 : (intensity >= 0.42 ? 1 : 0);
  let spawnIntervalScale = 1 - intensity * 0.060;
  let speedScale = 1 + intensity * 0.045;

  if (profile.style === 'FORTIFIED') {
    response = 'FLANK + RANGED PRESSURE';
    weights.RUNNER += 0.34 * intensity;
    weights.CRAWLER += 0.22 * intensity;
    weights.RANGED += 0.38 * intensity;
    weights.SHAMBLER -= 0.22 * intensity;
    flankChance += 0.11 * intensity;
  } else if (profile.style === 'MARKSMAN') {
    response = 'RUNNER INTERCEPT';
    weights.RUNNER += 0.42 * intensity;
    weights.CRAWLER += 0.20 * intensity;
    weights.BRUTE += 0.10 * intensity;
    weights.SHAMBLER -= 0.18 * intensity;
    predictionSeconds += 0.16 * intensity;
  } else if (profile.style === 'BRAWLER') {
    response = 'SPITTER SPACING';
    weights.RANGED += 0.42 * intensity;
    weights.EXPLODER += 0.14 * intensity;
    weights.BRUTE += 0.12 * intensity;
    weights.SHAMBLER -= 0.16 * intensity;
    flankChance += 0.05 * intensity;
  } else if (profile.style === 'MOBILE') {
    response = 'PREDICTIVE INTERCEPT';
    weights.RUNNER += 0.20 * intensity;
    weights.RANGED += 0.18 * intensity;
    weights.BRUTE += 0.15 * intensity;
    weights.SHAMBLER -= 0.14 * intensity;
    predictionSeconds += 0.22 * intensity;
    flankChance += 0.08 * intensity;
  } else if (profile.style === 'PRESSURED') {
    // Mercy behavior: the director still learns but temporarily avoids hard counters.
    response = 'MERCY WINDOW';
    intensity *= 0.32;
    activeCapBonus = 0;
    spawnIntervalScale = 1.05;
    speedScale = 0.99;
    predictionSeconds = 0.08;
    flankChance = 0.03;
    weights.RUNNER = 0.92;
    weights.EXPLODER = 0.88;
    weights.RANGED = 0.92;
    weights.SHAMBLER = 1.12;
  } else {
    weights.RUNNER += 0.10 * intensity;
    weights.CRAWLER += 0.08 * intensity;
    weights.RANGED += 0.08 * intensity;
  }

  // If this map historically caused repeated navigation recovery, reduce
  // specialist flank pressure rather than repeatedly assigning unreliable roles.
  const rememberedNavigationReliability = state.memoryPrior?.navigation?.reliability ?? 1;
  const navigationCaution = clamp(1 - rememberedNavigationReliability, 0, 0.55);

  flankChance *= 1 - navigationCaution * 0.34;
  predictionSeconds *= 1 - navigationCaution * 0.16;

  // C10.9 finalization: previous-wave congestion gently reduces tactical
  // complexity instead of increasing speed or spawn pressure into a traffic jam.
  const formationSnapshot = getAIFormationSnapshot();
  const congestionCaution = clamp(formationSnapshot.congestionPressure, 0, 0.70);
  flankChance *= 1 - congestionCaution * 0.28;
  predictionSeconds *= 1 - congestionCaution * 0.12;
  if (congestionCaution >= 0.52) {
    activeCapBonus = Math.max(0, activeCapBonus - 1);
  }

  const selectedStrategy = selectAIStrategy({
    active: true,
    mapId: state.mapId,
    wave: nextWave,
    evidence: state.history.length + (state.memoryPrior?.runs || 0),
    profile,
    intensity,
    baseResponse: response
  });
  const strategyModifiers = selectedStrategy?.modifiers || {};

  spawnIntervalScale *= Number(strategyModifiers.spawnIntervalScale) || 1;
  speedScale *= Number(strategyModifiers.speedScale) || 1;
  predictionSeconds += Number(strategyModifiers.predictionAdd) || 0;
  flankChance += Number(strategyModifiers.flankAdd) || 0;
  activeCapBonus += Number(strategyModifiers.activeCapBonus) || 0;

  for (const [enemyType, delta] of Object.entries(strategyModifiers.weights || {})) {
    if (!Object.prototype.hasOwnProperty.call(weights, enemyType)) continue;
    weights[enemyType] += Number(delta) || 0;
  }

  state.tuning = {
    active: true,
    intensity: clamp(intensity, 0, DIRECTOR_MAX_INTENSITY),
    response,
    spawnIntervalScale: clamp(spawnIntervalScale, 0.92, 1.06),
    activeCapBonus: Math.max(0, Math.min(2, activeCapBonus)),
    speedScale: clamp(speedScale, 0.99, 1.065),
    predictionSeconds: clamp(predictionSeconds, 0, 0.58),
    flankChance: clamp(flankChance, 0, 0.28),
    flankDistance: 1.6 + clamp(intensity) * 2.2,
    strategyId: selectedStrategy?.id || 'NONE',
    strategyLabel: selectedStrategy?.label || 'OBSERVING',
    strategyTier: selectedStrategy?.tier || 0,
    rangedElevationResponse: getAIExploitSnapshot().rangedPriority,
    exploitState: getAIExploitSnapshot().state,
    weightMultipliers: weights
  };

  return state.tuning;
}

function removeDirectorDebugSurface() {
  state.debugEnabled = false;

  if (state.debugPanel?.remove) {
    state.debugPanel.remove();
  }
  state.debugPanel = null;

  if (typeof document !== 'undefined') {
    document.getElementById('ai-director-debug')?.remove();
  }

  saveDebugSetting();
}

function renderDebugPanel() {
  // Public playable-demo build: keep Director behavior active while ensuring
  // its internal monitoring UI can never be created or restored from storage.
  removeDirectorDebugSurface();
}

function persistDirectorMemory(finalized = false) {
  if (!state.runActive || state.completedWaves < 2) return null;
  if (state.memoryCommitted && finalized) return null;

  const navigation = getAINavigationSnapshot();
  const result = commitAIMemoryRun({
    sessionId: state.sessionId,
    mapId: state.mapId,
    difficulty: state.difficulty,
    completedWaves: state.completedWaves,
    profile: state.profile,
    navigation,
    finalized
  });

  if (result?.saved) {
    state.memoryLastSavedAt = Date.now();
  }

  if (finalized) {
    state.memoryCommitted = true;
  }

  return result;
}

export function resetAIDirectorRun({ mapId = 'unknown', difficulty = 1 } = {}) {
  state.runActive = true;
  state.mapId = String(mapId || 'unknown');
  state.difficulty = Number(difficulty) || 1;
  state.currentWave = 1;
  state.sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  state.completedWaves = 0;
  state.runStartedAt = Date.now();
  state.memoryPrior = getAIMemoryPrior(state.mapId);
  state.memoryBlend = 0;
  state.memoryCommitted = false;
  state.memoryLastSavedAt = 0;
  state.history = [];
  state.wave = makeWaveTelemetry(1);
  state.profile = {
    style: 'OBSERVING',
    preferredRange: 'UNKNOWN',
    campingScore: 0,
    movementScore: 0,
    accuracy: 0,
    headshotRate: 0,
    averageHitDistance: 0,
    damagePressure: 0,
    confidence: 0,
    preferredWeapon: 'UNKNOWN',
    dangerEnemy: 'UNKNOWN'
  };
  state.tuning = { ...DEFAULT_TUNING, weightMultipliers: makeWeightMultipliers() };
  state.lastResponse = 'OBSERVING';
  state.debugRefreshT = 0;
  resetAISquadRun({ mapId: state.mapId });
  resetAINavigationRun({ mapId: state.mapId });
  resetAIStrategyRun({
    mapId: state.mapId,
    sessionId: state.sessionId
  });
  resetAIExploitRun({ mapId: state.mapId });
  resetAIAttackRun();
  resetAIArchetypeRun({ mapId: state.mapId });
  resetAIFormationRun({ mapId: state.mapId });
  renderDebugPanel(true);
}

export function endAIDirectorRun() {
  persistDirectorMemory(true);
  state.runActive = false;
  state.tuning = { ...DEFAULT_TUNING, weightMultipliers: makeWeightMultipliers() };
  endAISquadRun();
  endAINavigationRun();
  endAIStrategyRun();
  endAIExploitRun();
  endAIAttackRun();
  endAIArchetypeRun();
  endAIFormationRun();
  renderDebugPanel(true);
}

export function beginAIDirectorWave(waveNumber) {
  state.currentWave = Math.max(1, Number(waveNumber) || 1);
  state.wave = makeWaveTelemetry(state.currentWave);
  beginAISquadWave(state.currentWave);
  beginAINavigationWave(state.currentWave);
  beginAIStrategyWave(state.currentWave);
  beginAIExploitWave(state.currentWave);
  beginAIAttackWave(state.currentWave);
  beginAIArchetypeWave(state.currentWave);
  beginAIFormationWave(state.currentWave);
  renderDebugPanel(true);
}

export function updateAIDirector(dt, context = {}) {
  if (!state.runActive) return;

  const safeDt = clamp(dt, 0, 0.05);
  const wave = state.wave;
  const player = context.player;
  const now = typeof performance !== 'undefined'
    ? performance.now()
    : Date.now();

  if (wave.lastUpdateAt > 0) {
    const realGap = (now - wave.lastUpdateAt) * 0.001;

    // Pointer-lock pauses, tab switches, and temporary browser stalls must not
    // be learned as deliberate camping when play resumes.
    if (realGap > 0.22) {
      wave.stationaryGraceT = Math.max(wave.stationaryGraceT, 1.25);
      wave.stationaryCandidateTime = 0;
    }
  }

  wave.lastUpdateAt = now;
  wave.stationaryGraceT = Math.max(0, wave.stationaryGraceT - safeDt);
  wave.elapsed += safeDt;

  if (!player?.alive) {
    renderDebugPanel();
    return;
  }

  const enemies = Array.isArray(context.enemies) ? context.enemies : [];
  const enemyCount = enemies.reduce(
    (count, enemy) => count + (
      enemy?.alive && enemy.dyingT < 0 ? 1 : 0
    ),
    0
  );

  const exploit = updateAIExploit(safeDt, {
    player,
    enemies
  });

  // Live response values do not alter the Director's global intensity cap.
  state.tuning.rangedElevationResponse = exploit.rangedPriority;
  state.tuning.exploitState = exploit.state;

  if (exploit.state === 'UNREACHABLE') {
    wave.unreachableTime += safeDt;
  }

  if (exploit.state === 'VALID ELEVATED') {
    wave.validElevatedTime += safeDt;
  }

  const x = Number(player.pos?.x);
  const z = Number(player.pos?.z);

  if (Number.isFinite(x) && Number.isFinite(z)) {
    if (Number.isFinite(wave.lastPlayerX) && Number.isFinite(wave.lastPlayerZ)) {
      const distance = Math.hypot(x - wave.lastPlayerX, z - wave.lastPlayerZ);
      wave.distanceMoved += Math.min(distance, 2.5);

      if (enemyCount > 0) {
        wave.engagementTime += safeDt;

        const movementSpeed = safeDt > 0 ? distance / safeDt : 0;
        const temporaryAction = Boolean(
          context.activeWeapon?.reloading ||
          !player.onGround ||
          wave.stationaryGraceT > 0
        );

        if (temporaryAction) {
          wave.pauseProtectedTime += safeDt;
          wave.stationaryCandidateTime = Math.max(
            0,
            wave.stationaryCandidateTime - safeDt * 2
          );
        } else if (movementSpeed < 0.85) {
          wave.stationaryCandidateTime += safeDt;

          // Short tactical pauses for aiming, checking a lane, or interacting
          // do not count. Sustained stationary play still contributes.
          const holdThreshold = exploit.currentState === 'UNREACHABLE'
            ? 0.85
            : 1.45;

          if (wave.stationaryCandidateTime >= holdThreshold) {
            wave.stationaryTime += safeDt;
          }
        } else if (movementSpeed >= 1.15) {
          wave.stationaryCandidateTime = 0;
        } else {
          wave.stationaryCandidateTime = Math.max(
            0,
            wave.stationaryCandidateTime - safeDt * 0.7
          );
        }

        if (player.isSprinting) wave.sprintTime += safeDt;
        if (player.isADS) wave.adsTime += safeDt;
      }
    }

    wave.lastPlayerX = x;
    wave.lastPlayerZ = z;
  }

  wave.pressureSampleTimer -= safeDt;

  if (wave.pressureSampleTimer <= 0 && enemies.length > 0) {
    wave.pressureSampleTimer = 0.20;

    let nearest = Infinity;

    for (const enemy of enemies) {
      if (!enemy?.alive || enemy.dyingT >= 0) continue;

      const distance = Math.hypot(
        (enemy.mesh?.position?.x || 0) - (player.pos?.x || 0),
        (enemy.mesh?.position?.z || 0) - (player.pos?.z || 0)
      );

      if (distance < nearest) nearest = distance;
    }

    if (nearest < 4.2) {
      wave.closePressureTime += 0.20;
    }
  }

  updateAISquad(safeDt, {
    player,
    enemies,
    wave: state.currentWave,
    tuning: state.tuning
  });

  updateAINavigationDebug(enemies);

  state.debugRefreshT -= safeDt;
  if (state.debugRefreshT <= 0) {
    state.debugRefreshT = 0.25;
    renderDebugPanel();
  }
}

export function recordDirectorShot({ weaponFamily = 'UNKNOWN' } = {}) {
  if (!state.runActive) return;

  const family = String(weaponFamily || 'UNKNOWN');
  state.wave.shots++;
  state.wave.shotsByWeapon[family] = (state.wave.shotsByWeapon[family] || 0) + 1;
}

export function recordDirectorHit({ distance = 0, headshot = false } = {}) {
  if (!state.runActive) return;

  state.wave.successfulShots++;
  state.wave.hitDistanceTotal += Math.max(0, Number(distance) || 0);
  if (headshot) state.wave.headshotHits++;
}

export function recordDirectorKill({ enemyType = 'UNKNOWN' } = {}) {
  if (!state.runActive) return;

  state.wave.kills++;
  // Enemy-type kill data is intentionally retained for future C10.2 squad logic.
  state.wave.lastKilledType = String(enemyType || 'UNKNOWN');
}

export function recordDirectorDamage({ amount = 0, enemyType = 'UNKNOWN' } = {}) {
  if (!state.runActive) return;

  const damage = Math.max(0, Number(amount) || 0);
  const type = String(enemyType || 'UNKNOWN');

  state.wave.damageTaken += damage;
  state.wave.damageByType[type] = (state.wave.damageByType[type] || 0) + damage;
}

export function completeAIDirectorWave(waveNumber, playerState = {}) {
  if (!state.runActive) return null;

  const completedWave = Math.max(1, Number(waveNumber) || state.currentWave);
  state.wave.wave = completedWave;

  const summary = summarizeWave(
    state.wave,
    playerState.health,
    playerState.maxHealth
  );

  state.history.push(summary);
  if (state.history.length > 8) state.history.shift();

  state.completedWaves = Math.max(state.completedWaves, completedWave);

  const previousSummary = state.history.length > 1
    ? state.history[state.history.length - 2]
    : null;
  const strategyOutcome = evaluateAIStrategyWave({
    wave: completedWave,
    summary,
    history: state.history.slice(0, -1),
    previousSummary
  });

  classifyProfile();

  const nextWave = completedWave + 1;
  const previousResponse = state.lastResponse;
  buildTuning(nextWave);
  state.lastResponse = state.tuning.response;

  // One small localStorage checkpoint per completed wave. The same session ID
  // is updated in place, so this does not create duplicate learned runs.
  persistDirectorMemory(false);

  let announcement = '';

  if (nextWave === DIRECTOR_ACTIVATION_WAVE && state.tuning.active) {
    announcement = `AI DIRECTOR ONLINE · ${state.tuning.response}`;
  } else if (
    state.tuning.active &&
    state.tuning.response !== previousResponse &&
    nextWave % 2 === 1
  ) {
    announcement = `DIRECTOR ADAPTS · ${state.tuning.response}`;
  } else if (
    state.tuning.active &&
    strategyOutcome &&
    strategyOutcome.successful &&
    nextWave % 3 === 0
  ) {
    announcement = `TACTIC EVOLVES · ${state.tuning.strategyLabel}`;
  }

  renderDebugPanel(true);

  return {
    summary,
    profile: { ...state.profile },
    tuning: getAIDirectorTuning(),
    strategyOutcome,
    announcement
  };
}

export function adaptEnemySpawnMix(baseMix = []) {
  const tuning = state.tuning;

  if (!tuning.active) {
    return baseMix.map(([config, weight]) => [config, weight]);
  }

  return baseMix.map(([config, weight]) => {
    const baseWeight = Math.max(0, Number(weight) || 0);
    if (baseWeight <= 0) return [config, 0];

    const typeName = String(config?.name || 'SHAMBLER');
    let multiplier = Math.max(
      0.55,
      Number(tuning.weightMultipliers[typeName]) || 1
    );

    if (
      typeName === 'RANGED' &&
      tuning.rangedElevationResponse > 0
    ) {
      multiplier *= 1 + Math.min(
        0.35,
        tuning.rangedElevationResponse * 0.35
      );
    }

    return [config, baseWeight * multiplier];
  });
}

export function assignEnemyDirectorRole(enemyType = 'SHAMBLER') {
  const tuning = state.tuning;
  const type = String(enemyType || 'SHAMBLER');

  if (!tuning.active || type === 'GOLIATH' || type === 'BRUTE' || type === 'RANGED') {
    return 'DIRECT';
  }

  const roll = Math.random();

  if (roll < tuning.flankChance) {
    return Math.random() < 0.5 ? 'FLANK_LEFT' : 'FLANK_RIGHT';
  }

  if (roll < tuning.flankChance + tuning.intensity * 0.48) {
    return 'INTERCEPT';
  }

  return 'DIRECT';
}

export function getDirectorPursuitTarget(enemy, playerState, outTarget) {
  const out = outTarget || { x: 0, z: 0 };
  const playerX = Number(playerState?.pos?.x) || 0;
  const playerZ = Number(playerState?.pos?.z) || 0;

  out.x = playerX;
  out.z = playerZ;

  const tuning = state.tuning;
  const role = String(enemy?.directorRole || 'DIRECT');

  if (!tuning.active || role === 'DIRECT') {
    return out;
  }

  const velX = Number(playerState?.vel?.x) || 0;
  const velZ = Number(playerState?.vel?.z) || 0;
  const speed = Math.hypot(velX, velZ);

  if (speed > 0.25) {
    const predictionScale = role === 'INTERCEPT' ? 1 : 0.76;
    out.x += velX * tuning.predictionSeconds * predictionScale;
    out.z += velZ * tuning.predictionSeconds * predictionScale;
  }

  if (role === 'FLANK_LEFT' || role === 'FLANK_RIGHT') {
    const dx = playerX - (Number(enemy?.mesh?.position?.x) || 0);
    const dz = playerZ - (Number(enemy?.mesh?.position?.z) || 0);
    const length = Math.max(0.001, Math.hypot(dx, dz));
    const sign = role === 'FLANK_LEFT' ? 1 : -1;

    out.x += (-dz / length) * tuning.flankDistance * sign;
    out.z += (dx / length) * tuning.flankDistance * sign;
  }

  return out;
}

export function getAIDirectorTuning() {
  return {
    ...state.tuning,
    weightMultipliers: { ...state.tuning.weightMultipliers }
  };
}

export function getAIDirectorSnapshot() {
  return {
    runActive: state.runActive,
    mapId: state.mapId,
    difficulty: state.difficulty,
    currentWave: state.currentWave,
    activationWave: DIRECTOR_ACTIVATION_WAVE,
    profile: { ...state.profile },
    tuning: getAIDirectorTuning(),
    completedWaves: state.completedWaves,
    strategy: getAIStrategySnapshot(),
    exploit: getAIExploitSnapshot(),
    attacks: getAIAttackSnapshot(),
    archetypes: getAIArchetypeSnapshot(),
    formation: getAIFormationSnapshot(),
    memory: {
      available: Boolean(state.memoryPrior?.available),
      source: state.memoryPrior?.source || 'none',
      runs: state.memoryPrior?.runs || 0,
      influence: state.memoryPrior?.influence || 0,
      currentBlend: state.memoryBlend,
      navigationReliability: state.memoryPrior?.navigation?.reliability ?? 1,
      lastSavedAt: state.memoryLastSavedAt
    }
  };
}

export function getAIFinalDiagnostics() {
  return {
    version: 'C10.9_FINAL',
    generatedAt: new Date().toISOString(),
    fairnessLimits: {
      directorActivationWave: DIRECTOR_ACTIVATION_WAVE,
      directorMaxIntensity: DIRECTOR_MAX_INTENSITY,
      activeCapBonusMax: 2,
      speedScaleMax: 1.065
    },
    director: getAIDirectorSnapshot(),
    squad: getAISquadSnapshot(),
    navigation: getAINavigationSnapshot(),
    strategy: getAIStrategySnapshot(),
    exploit: getAIExploitSnapshot(),
    attacks: getAIAttackSnapshot(),
    archetypes: getAIArchetypeSnapshot(),
    formation: getAIFormationSnapshot()
  };
}

export function setAIDirectorDebugEnabled() {
  removeDirectorDebugSurface();
  return false;
}

export function bindAIDirectorDebugHotkey() {
  // Compatibility no-op for older imports. No F7 listener is bound.
  if (typeof window !== 'undefined') {
    window.__KA_AI_DIRECTOR_DEBUG_BOUND__ = true;
  }
  removeDirectorDebugSurface();
}

if (typeof window !== 'undefined') {
  removeDirectorDebugSurface();

  window.addEventListener('ka-ai-memory-reset', () => {
    if (state.runActive) return;
    state.memoryPrior = getAIMemoryPrior(state.mapId);
    state.memoryBlend = 0;
    removeDirectorDebugSurface();
  });

  try {
    delete window.KASetAIDirectorDebug;
  } catch {
    window.KASetAIDirectorDebug = undefined;
  }

  // Read-only diagnostics remain available for support without exposing a UI.
  window.KAGetAIDirector = getAIDirectorSnapshot;
  window.KAGetAIFinalDiagnostics = getAIFinalDiagnostics;
  window.KAExportAIDiagnostics = () => JSON.stringify(getAIFinalDiagnostics(), null, 2);
}
