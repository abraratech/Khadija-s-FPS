// js/ai_strategy.js
// C10.5 — Evolving Counter-Strategy System
//
// A compact strategy selector layered on top of the Adaptive AI Director.
// It evaluates whether a tactic created fair pressure, rotates tactics instead
// of repeating one forever, and keeps small per-map success estimates.
//
// This is deterministic gameplay logic, not a neural network. It never raises
// the Director's global intensity cap and it cannot activate before wave 7.

const STRATEGY_STORAGE_KEY = 'ka_ai_strategy_v1';
const STRATEGY_VERSION = 1;
const STRATEGY_ACTIVATION_WAVE = 7;
const MAX_MAPS = 5;
const MAX_STRATEGY_RECORDS = 8;
const MAX_STORAGE_BYTES = 14000;
const COOLDOWN_WAVES = 2;
const MAX_CONSECUTIVE_USES = 2;
const RETIRE_MIN_ATTEMPTS = 3;
const RETIRE_SCORE_THRESHOLD = 0.28;
const RETIRE_DURATION_WAVES = 5;

const STRATEGIES = Object.freeze({
  BALANCED_PRESSURE: Object.freeze({
    id: 'BALANCED_PRESSURE',
    label: 'Balanced Pressure',
    tier: 1,
    minEvidence: 0,
    styles: ['BALANCED', 'OBSERVING'],
    modifiers: Object.freeze({
      spawnIntervalScale: 1.0,
      speedScale: 1.0,
      predictionAdd: 0.01,
      flankAdd: 0.01,
      activeCapBonus: 0,
      weights: Object.freeze({ RUNNER: 0.04, CRAWLER: 0.03 })
    })
  }),

  FORTIFICATION_BREAK: Object.freeze({
    id: 'FORTIFICATION_BREAK',
    label: 'Fortification Break',
    tier: 2,
    minEvidence: 1,
    styles: ['FORTIFIED'],
    modifiers: Object.freeze({
      spawnIntervalScale: 0.992,
      speedScale: 1.002,
      predictionAdd: 0.02,
      flankAdd: 0.045,
      activeCapBonus: 0,
      weights: Object.freeze({
        CRAWLER: 0.08,
        RUNNER: 0.06,
        RANGED: 0.11,
        SHAMBLER: -0.06
      })
    })
  }),

  ROUTE_CUT_OFF: Object.freeze({
    id: 'ROUTE_CUT_OFF',
    label: 'Route Cut-Off',
    tier: 2,
    minEvidence: 1,
    styles: ['MOBILE', 'MARKSMAN'],
    modifiers: Object.freeze({
      spawnIntervalScale: 1.0,
      speedScale: 1.004,
      predictionAdd: 0.075,
      flankAdd: 0.025,
      activeCapBonus: 0,
      weights: Object.freeze({
        RUNNER: 0.10,
        BRUTE: 0.04,
        SHAMBLER: -0.05
      })
    })
  }),

  RANGE_DENIAL: Object.freeze({
    id: 'RANGE_DENIAL',
    label: 'Range Denial',
    tier: 3,
    minEvidence: 3,
    styles: ['MARKSMAN', 'FORTIFIED'],
    modifiers: Object.freeze({
      spawnIntervalScale: 0.996,
      speedScale: 1.0,
      predictionAdd: 0.035,
      flankAdd: 0.02,
      activeCapBonus: 0,
      weights: Object.freeze({
        RANGED: 0.13,
        RUNNER: 0.07,
        CRAWLER: 0.05,
        SHAMBLER: -0.07
      })
    })
  }),

  SPACING_CONTROL: Object.freeze({
    id: 'SPACING_CONTROL',
    label: 'Spacing Control',
    tier: 2,
    minEvidence: 1,
    styles: ['BRAWLER'],
    modifiers: Object.freeze({
      spawnIntervalScale: 1.006,
      speedScale: 0.998,
      predictionAdd: 0.015,
      flankAdd: 0.015,
      activeCapBonus: 0,
      weights: Object.freeze({
        RANGED: 0.12,
        BRUTE: 0.06,
        EXPLODER: 0.04,
        SHAMBLER: -0.05
      })
    })
  }),

  ENCIRCLEMENT_PULSE: Object.freeze({
    id: 'ENCIRCLEMENT_PULSE',
    label: 'Encirclement Pulse',
    tier: 3,
    minEvidence: 4,
    styles: ['MOBILE', 'BALANCED', 'FORTIFIED'],
    modifiers: Object.freeze({
      spawnIntervalScale: 0.988,
      speedScale: 1.004,
      predictionAdd: 0.035,
      flankAdd: 0.055,
      activeCapBonus: 1,
      weights: Object.freeze({
        RUNNER: 0.08,
        CRAWLER: 0.08,
        RANGED: 0.05
      })
    })
  }),

  HEAVY_ANCHOR: Object.freeze({
    id: 'HEAVY_ANCHOR',
    label: 'Heavy Anchor',
    tier: 3,
    minEvidence: 4,
    styles: ['MOBILE', 'BRAWLER', 'BALANCED'],
    modifiers: Object.freeze({
      spawnIntervalScale: 1.008,
      speedScale: 0.999,
      predictionAdd: 0.02,
      flankAdd: 0.01,
      activeCapBonus: 0,
      weights: Object.freeze({
        BRUTE: 0.11,
        RANGED: 0.04,
        RUNNER: -0.03
      })
    })
  })
});

const MERCY_STRATEGY = Object.freeze({
  id: 'MERCY_RECOVERY',
  label: 'Mercy Recovery',
  tier: 0,
  minEvidence: 0,
  styles: ['PRESSURED'],
  modifiers: Object.freeze({
    spawnIntervalScale: 1,
    speedScale: 1,
    predictionAdd: 0,
    flankAdd: 0,
    activeCapBonus: 0,
    weights: Object.freeze({})
  })
});

const NONE_STRATEGY = Object.freeze({
  id: 'NONE',
  label: 'Observing',
  tier: 0,
  modifiers: Object.freeze({
    spawnIntervalScale: 1,
    speedScale: 1,
    predictionAdd: 0,
    flankAdd: 0,
    activeCapBonus: 0,
    weights: Object.freeze({})
  })
});

const state = {
  runActive: false,
  mapId: 'unknown',
  sessionId: 'run',
  wave: 1,
  evidence: 0,
  active: NONE_STRATEGY,
  activeSelectedWave: 0,
  previousId: 'NONE',
  consecutiveUses: 0,
  recentIds: [],
  lastUsedWave: {},
  retiredUntilWave: {},
  lastOutcome: null,
  evaluations: 0,
  rotationCount: 0,
  persistent: {},
  outcomeWindows: {}
};

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanToken(value, fallback = 'UNKNOWN', maxLength = 48) {
  const token = String(value || fallback)
    .replace(/[^A-Za-z0-9_+\- ]/g, '')
    .trim()
    .slice(0, maxLength);

  return token || fallback;
}

function hashUnit(text) {
  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 10000) / 10000;
}

function emptyDatabase() {
  return {
    version: STRATEGY_VERSION,
    updatedAt: 0,
    maps: {}
  };
}

function sanitizeStrategyStats(raw = {}) {
  return {
    attempts: Math.max(0, Math.round(finite(raw.attempts))),
    effectivenessEMA: clamp(raw.effectivenessEMA),
    fairnessEMA: clamp(raw.fairnessEMA, 0, 1),
    combinedEMA: clamp(raw.combinedEMA),
    trendEMA: clamp(raw.trendEMA, -1, 1),
    confidence: clamp(raw.confidence),
    lastUsedAt: Math.max(0, Math.round(finite(raw.lastUsedAt))),
    lastWave: Math.max(0, Math.round(finite(raw.lastWave)))
  };
}

function sanitizeDatabase(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== STRATEGY_VERSION) {
    return emptyDatabase();
  }

  const db = emptyDatabase();
  db.updatedAt = Math.max(0, Math.round(finite(raw.updatedAt)));

  const maps = Object.entries(raw.maps || {})
    .sort((a, b) => finite(b[1]?.updatedAt) - finite(a[1]?.updatedAt))
    .slice(0, MAX_MAPS);

  for (const [rawMapId, rawMap] of maps) {
    const mapId = cleanToken(rawMapId, 'unknown');
    const strategies = {};

    for (const [rawId, rawStats] of Object.entries(rawMap?.strategies || {}).slice(0, MAX_STRATEGY_RECORDS)) {
      const id = cleanToken(rawId, 'NONE');
      if (!STRATEGIES[id]) continue;
      strategies[id] = sanitizeStrategyStats(rawStats);
    }

    db.maps[mapId] = {
      mapId,
      updatedAt: Math.max(0, Math.round(finite(rawMap?.updatedAt))),
      strategies
    };
  }

  return db;
}

function readDatabase() {
  try {
    const raw = localStorage.getItem(STRATEGY_STORAGE_KEY);
    return raw ? sanitizeDatabase(JSON.parse(raw)) : emptyDatabase();
  } catch {
    return emptyDatabase();
  }
}

function trimDatabase(db) {
  const entries = Object.values(db.maps || {})
    .sort((a, b) => finite(b.updatedAt) - finite(a.updatedAt))
    .slice(0, MAX_MAPS);

  db.maps = {};

  for (const entry of entries) {
    const strategyEntries = Object.entries(entry.strategies || {})
      .sort((a, b) => finite(b[1]?.lastUsedAt) - finite(a[1]?.lastUsedAt))
      .slice(0, MAX_STRATEGY_RECORDS);

    db.maps[entry.mapId] = {
      mapId: entry.mapId,
      updatedAt: entry.updatedAt,
      strategies: Object.fromEntries(strategyEntries)
    };
  }

  let encoded = JSON.stringify(db);

  while (encoded.length > MAX_STORAGE_BYTES) {
    const candidates = Object.values(db.maps)
      .flatMap((map) => Object.entries(map.strategies || {}).map(([id, stats]) => ({ map, id, stats })))
      .sort((a, b) => finite(a.stats.lastUsedAt) - finite(b.stats.lastUsedAt));

    if (!candidates.length) break;
    const victim = candidates[0];
    delete victim.map.strategies[victim.id];
    encoded = JSON.stringify(db);
  }

  return db;
}

function writeDatabase(db) {
  const safe = trimDatabase(sanitizeDatabase(db));
  safe.updatedAt = Date.now();

  try {
    localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

function getMapRecord(db, mapId) {
  const safeMapId = cleanToken(mapId, 'unknown');

  return db.maps[safeMapId] || {
    mapId: safeMapId,
    updatedAt: 0,
    strategies: {}
  };
}

function getPersistentStats(id) {
  return sanitizeStrategyStats(state.persistent?.[id] || {});
}

function isOnCooldown(id, wave) {
  const lastWave = finite(state.lastUsedWave[id], -Infinity);
  return wave - lastWave <= COOLDOWN_WAVES;
}

function isRetired(id, wave) {
  return finite(state.retiredUntilWave[id]) > wave;
}

function getCandidateIds(style, evidence) {
  const matching = Object.values(STRATEGIES)
    .filter((strategy) => {
      if (strategy.minEvidence > evidence) return false;
      if (strategy.styles.includes(style)) return true;
      return strategy.id === 'BALANCED_PRESSURE';
    })
    .map((strategy) => strategy.id);

  if (!matching.includes('BALANCED_PRESSURE')) {
    matching.push('BALANCED_PRESSURE');
  }

  return matching;
}

function scoreCandidate(strategy, context) {
  const stats = getPersistentStats(strategy.id);
  const style = String(context.profile?.style || 'BALANCED');
  const exactStyle = strategy.styles.includes(style);
  const learnedConfidence = Math.max(clamp(stats.attempts / 5), stats.confidence || 0);

  let score = exactStyle ? 0.64 : 0.38;
  score += stats.combinedEMA * 0.26 * learnedConfidence;
  score += stats.fairnessEMA * 0.12 * learnedConfidence;
  score += clamp(stats.trendEMA, -1, 1) * 0.08 * learnedConfidence;

  if (isOnCooldown(strategy.id, context.wave)) score -= 0.33;
  if (state.recentIds.includes(strategy.id)) score -= 0.16;
  if (state.previousId === strategy.id) score -= 0.22 * state.consecutiveUses;
  if (isRetired(strategy.id, context.wave)) score -= 10;

  // Higher-tier tactics require evidence and should not dominate immediately.
  score -= Math.max(0, strategy.tier - 1) * 0.025;

  // Small deterministic tie-breaker keeps the same run reproducible.
  score += hashUnit(`${state.mapId}:${context.wave}:${strategy.id}`) * 0.035;

  return score;
}

function makeSelection(strategy, context) {
  const intensity = clamp(context.intensity, 0, 0.92);
  const raw = strategy.modifiers;

  return {
    id: strategy.id,
    label: strategy.label,
    tier: strategy.tier,
    selectedWave: context.wave,
    modifiers: {
      spawnIntervalScale: clamp(raw.spawnIntervalScale, 0.97, 1.03),
      speedScale: clamp(raw.speedScale, 0.995, 1.012),
      predictionAdd: clamp(raw.predictionAdd * (0.55 + intensity * 0.45), 0, 0.085),
      flankAdd: clamp(raw.flankAdd * (0.50 + intensity * 0.50), 0, 0.060),
      activeCapBonus: (
        intensity >= 0.70
          ? Math.max(0, Math.min(1, Math.round(raw.activeCapBonus || 0)))
          : 0
      ),
      weights: Object.fromEntries(
        Object.entries(raw.weights || {}).map(([type, delta]) => [
          type,
          clamp(delta * (0.45 + intensity * 0.55), -0.10, 0.15)
        ])
      )
    }
  };
}

function chooseStrategy(context) {
  const style = String(context.profile?.style || 'BALANCED');

  if (style === 'PRESSURED') {
    return makeSelection(MERCY_STRATEGY, context);
  }

  const evidence = Math.max(
    0,
    state.evidence,
    state.evaluations,
    ...Object.values(state.persistent || {}).map((stats) => finite(stats.attempts))
  );

  const candidates = getCandidateIds(style, evidence)
    .map((id) => STRATEGIES[id])
    .filter(Boolean)
    .map((strategy) => ({
      strategy,
      score: scoreCandidate(strategy, { ...context, profile: { ...context.profile, style } })
    }))
    .sort((a, b) => b.score - a.score);

  let selected = candidates[0]?.strategy || STRATEGIES.BALANCED_PRESSURE;

  // A strategy may be repeated once if it remains the best option, but the
  // third consecutive use is always replaced by the next legal tactic.
  if (
    selected.id === state.previousId &&
    state.consecutiveUses >= MAX_CONSECUTIVE_USES
  ) {
    selected = candidates.find((entry) => entry.strategy.id !== state.previousId)?.strategy
      || STRATEGIES.BALANCED_PRESSURE;
  }

  return makeSelection(selected, context);
}

function getFairnessScore(summary) {
  const damagePressure = clamp(summary?.damagePressure, 0, 2);
  const healthRemaining = clamp(summary?.healthRemaining);
  const closePressure = clamp(summary?.closePressureShare);

  let fairness = 1;

  if (damagePressure > 1.05) fairness -= clamp((damagePressure - 1.05) / 0.65) * 0.52;
  if (healthRemaining < 0.18) fairness -= clamp((0.18 - healthRemaining) / 0.18) * 0.40;
  if (closePressure > 0.82) fairness -= clamp((closePressure - 0.82) / 0.18) * 0.18;

  return clamp(fairness);
}

function averageMetric(entries, key, fallback = 0) {
  const values = entries
    .map((entry) => finite(entry?.[key], NaN))
    .filter(Number.isFinite);

  if (!values.length) return fallback;

  values.sort((a, b) => a - b);

  // A small trimmed mean prevents one unusually long transition-heavy wave
  // from teaching the strategy system the wrong lesson.
  if (values.length >= 3) {
    values.shift();
    values.pop();
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getEffectivenessScore(summary, history = []) {
  const baselineEntries = history.slice(-3);
  const damage = clamp((summary?.damagePressure || 0) / 0.78);
  const close = clamp(summary?.closePressureShare);
  const healthPressure = clamp(1 - (summary?.healthRemaining ?? 1));
  const unreachablePenalty = clamp((summary?.unreachableShare || 0) / 0.30);

  let clearSlowdown = 0;
  let accuracyDisruption = 0;
  let movementDisruption = 0;

  if (baselineEntries.length > 0) {
    const baselineClear = Math.max(
      1,
      averageMetric(baselineEntries, 'clearTime', finite(summary?.clearTime, 1))
    );
    const baselineAccuracy = clamp(
      averageMetric(baselineEntries, 'accuracy', summary?.accuracy || 0)
    );
    const baselineMovement = Math.max(
      0.01,
      averageMetric(baselineEntries, 'movementSpeed', summary?.movementSpeed || 0.01)
    );

    clearSlowdown = clamp(
      (finite(summary?.clearTime) / baselineClear - 1) / 0.38
    );
    accuracyDisruption = clamp(
      (baselineAccuracy - clamp(summary?.accuracy)) / 0.24
    );
    movementDisruption = clamp(
      (baselineMovement - finite(summary?.movementSpeed)) /
      Math.max(1.5, baselineMovement)
    );
  }

  // Time gained only because enemies could not reach an exploit position is
  // never counted as successful counterplay.
  clearSlowdown *= 1 - unreachablePenalty;

  return clamp(
    damage * 0.30 +
    close * 0.21 +
    healthPressure * 0.17 +
    clearSlowdown * 0.14 +
    accuracyDisruption * 0.10 +
    movementDisruption * 0.08 -
    unreachablePenalty * 0.38
  );
}

function getOutcomeWindow(id) {
  if (!state.outcomeWindows[id]) state.outcomeWindows[id] = [];
  return state.outcomeWindows[id];
}

function weightedWindowAverage(window, key, fallback = 0) {
  if (!window.length) return fallback;

  let total = 0;
  let weights = 0;

  window.forEach((entry, index) => {
    const weight = 1 + index * 0.45;
    total += finite(entry?.[key]) * weight;
    weights += weight;
  });

  return weights > 0 ? total / weights : fallback;
}

function updatePersistentOutcome(id, outcome, wave, sampleConfidence = 0.35) {
  if (!STRATEGIES[id]) return null;

  const db = readDatabase();
  const mapRecord = getMapRecord(db, state.mapId);
  const previous = sanitizeStrategyStats(mapRecord.strategies[id] || {});
  const confidence = clamp(sampleConfidence, 0.25, 1);
  const alpha = previous.attempts <= 0
    ? 0.28 + confidence * 0.16
    : 0.12 + confidence * 0.16;

  const next = {
    attempts: previous.attempts + 1,
    effectivenessEMA: clamp(
      previous.effectivenessEMA * (1 - alpha) +
      outcome.rollingEffectiveness * alpha
    ),
    fairnessEMA: clamp(
      previous.fairnessEMA * (1 - alpha) +
      outcome.rollingFairness * alpha
    ),
    combinedEMA: clamp(
      previous.combinedEMA * (1 - alpha) +
      outcome.rollingCombined * alpha
    ),
    trendEMA: clamp(
      previous.trendEMA * (1 - alpha) +
      outcome.trend * alpha,
      -1,
      1
    ),
    confidence: clamp(
      previous.confidence * 0.72 +
      confidence * 0.28
    ),
    lastUsedAt: Date.now(),
    lastWave: wave
  };

  mapRecord.strategies[id] = next;
  mapRecord.updatedAt = Date.now();
  db.maps[mapRecord.mapId] = mapRecord;
  writeDatabase(db);

  state.persistent = mapRecord.strategies;

  if (
    next.attempts >= RETIRE_MIN_ATTEMPTS &&
    next.combinedEMA < RETIRE_SCORE_THRESHOLD &&
    next.confidence >= 0.45
  ) {
    state.retiredUntilWave[id] = wave + RETIRE_DURATION_WAVES;
  }

  return next;
}

export function resetAIStrategyRun({
  mapId = 'unknown',
  sessionId = 'run'
} = {}) {
  const db = readDatabase();
  const record = getMapRecord(db, mapId);

  state.runActive = true;
  state.mapId = record.mapId;
  state.sessionId = cleanToken(sessionId, 'run');
  state.wave = 1;
  state.evidence = 0;
  state.active = NONE_STRATEGY;
  state.activeSelectedWave = 0;
  state.previousId = 'NONE';
  state.consecutiveUses = 0;
  state.recentIds = [];
  state.lastUsedWave = {};
  state.retiredUntilWave = {};
  state.lastOutcome = null;
  state.evaluations = 0;
  state.rotationCount = 0;
  state.persistent = record.strategies || {};
  state.outcomeWindows = {};
}

export function endAIStrategyRun() {
  state.runActive = false;
  state.active = NONE_STRATEGY;
  state.activeSelectedWave = 0;
}

export function beginAIStrategyWave(waveNumber) {
  state.wave = Math.max(1, Math.round(finite(waveNumber, 1)));
}

export function selectAIStrategy(context = {}) {
  const wave = Math.max(1, Math.round(finite(context.wave, state.wave)));
  state.wave = wave;
  state.evidence = Math.max(state.evidence, Math.round(finite(context.evidence)));

  if (
    !state.runActive ||
    context.active !== true ||
    wave < STRATEGY_ACTIVATION_WAVE
  ) {
    state.active = NONE_STRATEGY;
    state.activeSelectedWave = wave;
    return { ...NONE_STRATEGY, selectedWave: wave };
  }

  if (state.activeSelectedWave === wave && state.active?.id) {
    return state.active;
  }

  const next = chooseStrategy({
    ...context,
    wave
  });

  if (next.id === state.previousId) {
    state.consecutiveUses++;
  } else {
    if (state.previousId !== 'NONE') state.rotationCount++;
    state.consecutiveUses = 1;
  }

  state.previousId = next.id;
  state.active = next;
  state.activeSelectedWave = wave;

  if (STRATEGIES[next.id]) {
    state.lastUsedWave[next.id] = wave;
    state.recentIds.unshift(next.id);
    state.recentIds = state.recentIds.slice(0, 3);
  }

  return next;
}

export function evaluateAIStrategyWave({
  wave = state.wave,
  summary = null,
  history = [],
  previousSummary = null
} = {}) {
  if (!state.runActive) return null;

  const completedWave = Math.max(1, Math.round(finite(wave, state.wave)));
  const active = state.active;

  if (
    !summary ||
    !active ||
    !STRATEGIES[active.id] ||
    active.selectedWave !== completedWave
  ) {
    return null;
  }

  const baselineHistory = Array.isArray(history) && history.length
    ? history
    : (previousSummary ? [previousSummary] : []);

  const effectiveness = getEffectivenessScore(summary, baselineHistory);
  const fairness = getFairnessScore(summary);
  const rawCombined = clamp(
    effectiveness * 0.72 +
    fairness * 0.28 -
    Math.max(0, 0.42 - fairness) * 0.45
  );

  const window = getOutcomeWindow(active.id);
  const previousRolling = window.length
    ? weightedWindowAverage(window, 'combined', rawCombined)
    : rawCombined;

  window.push({
    wave: completedWave,
    effectiveness,
    fairness,
    combined: rawCombined
  });

  if (window.length > 3) window.shift();

  const rollingEffectiveness = clamp(
    weightedWindowAverage(window, 'effectiveness', effectiveness)
  );
  const rollingFairness = clamp(
    weightedWindowAverage(window, 'fairness', fairness)
  );
  const rollingCombined = clamp(
    weightedWindowAverage(window, 'combined', rawCombined)
  );
  const trend = clamp(rollingCombined - previousRolling, -1, 1);
  const sampleConfidence = clamp(window.length / 3, 0.35, 1);

  const outcome = {
    strategyId: active.id,
    strategyLabel: active.label,
    wave: completedWave,
    effectiveness,
    fairness,
    combined: rawCombined,
    rollingEffectiveness,
    rollingFairness,
    rollingCombined,
    trend,
    sampleCount: window.length,
    sampleConfidence,
    successful: rollingCombined >= 0.50 && rollingFairness >= 0.44
  };

  const persistent = updatePersistentOutcome(
    active.id,
    outcome,
    completedWave,
    sampleConfidence
  );

  outcome.attempts = persistent?.attempts || 0;
  outcome.learnedScore = persistent?.combinedEMA || rollingCombined;
  outcome.learnedConfidence = persistent?.confidence || sampleConfidence;

  state.lastOutcome = outcome;
  state.evaluations++;
  state.evidence++;

  return outcome;
}

export function getAIStrategySnapshot() {
  const active = state.active || NONE_STRATEGY;
  const stats = STRATEGIES[active.id] ? getPersistentStats(active.id) : null;

  return {
    runActive: state.runActive,
    mapId: state.mapId,
    wave: state.wave,
    activationWave: STRATEGY_ACTIVATION_WAVE,
    activeId: active.id,
    activeLabel: active.label,
    tier: active.tier || 0,
    selectedWave: active.selectedWave || state.activeSelectedWave,
    consecutiveUses: state.consecutiveUses,
    rotationCount: state.rotationCount,
    evidence: state.evidence,
    evaluations: state.evaluations,
    persistentAttempts: stats?.attempts || 0,
    learnedScore: stats?.combinedEMA || 0,
    fairnessScore: stats?.fairnessEMA || 0,
    learnedConfidence: stats?.confidence || 0,
    trendScore: stats?.trendEMA || 0,
    rollingScore: state.lastOutcome?.rollingCombined || 0,
    recentSampleCount: state.lastOutcome?.sampleCount || 0,
    lastOutcome: state.lastOutcome ? { ...state.lastOutcome } : null,
    retired: Object.entries(state.retiredUntilWave)
      .filter(([, untilWave]) => untilWave > state.wave)
      .map(([id, untilWave]) => ({ id, untilWave }))
  };
}

export function resetAIStrategyMemory() {
  try {
    localStorage.removeItem(STRATEGY_STORAGE_KEY);
  } catch {
    return false;
  }

  state.persistent = {};
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('ka-ai-memory-reset', () => {
    resetAIStrategyMemory();
  });

  window.KAGetAIStrategy = getAIStrategySnapshot;
  window.KAResetAIStrategy = resetAIStrategyMemory;
}
