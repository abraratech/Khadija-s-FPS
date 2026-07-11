export const ECONOMY_BALANCE_PATCH = 'm4-easy-normal-economy-r1';

export const ECONOMY_DIFFICULTY_TIERS = Object.freeze({
  EASY: 'EASY',
  NORMAL: 'NORMAL',
  HARD: 'HARD'
});

const PROFILE_TABLE = Object.freeze({
  EASY: Object.freeze({
    tier: ECONOMY_DIFFICULTY_TIERS.EASY,
    label: 'Easy',
    rewardMultiplier: 1.30,
    priceMultiplier: 0.80
  }),
  NORMAL: Object.freeze({
    tier: ECONOMY_DIFFICULTY_TIERS.NORMAL,
    label: 'Normal',
    rewardMultiplier: 1.10,
    priceMultiplier: 0.95
  }),
  HARD: Object.freeze({
    tier: ECONOMY_DIFFICULTY_TIERS.HARD,
    label: 'Hard',
    rewardMultiplier: 1.00,
    priceMultiplier: 1.00
  })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeEconomyDifficulty(value = 1) {
  return Math.max(0.5, Math.min(2, finite(value, 1)));
}

export function resolveEconomyTier(difficulty = 1) {
  const normalized = normalizeEconomyDifficulty(difficulty);
  if (normalized <= 0.85) return ECONOMY_DIFFICULTY_TIERS.EASY;
  if (normalized <= 1.15) return ECONOMY_DIFFICULTY_TIERS.NORMAL;
  return ECONOMY_DIFFICULTY_TIERS.HARD;
}

export function getEconomyProfile(difficulty = 1) {
  const normalizedDifficulty = normalizeEconomyDifficulty(difficulty);
  const tier = resolveEconomyTier(normalizedDifficulty);
  const profile = PROFILE_TABLE[tier];
  return Object.freeze({
    patch: ECONOMY_BALANCE_PATCH,
    difficulty: normalizedDifficulty,
    tier: profile.tier,
    label: profile.label,
    rewardMultiplier: profile.rewardMultiplier,
    priceMultiplier: profile.priceMultiplier
  });
}

export function scaleEconomyRewardValue(baseValue, difficulty = 1) {
  const base = Math.max(0, finite(baseValue, 0));
  if (base <= 0) return 0;
  const profile = getEconomyProfile(difficulty);
  return Math.max(1, Math.round(base * profile.rewardMultiplier));
}

export function scaleEconomyPriceValue(baseValue, difficulty = 1) {
  const base = Math.max(0, finite(baseValue, 0));
  if (base <= 0) return 0;
  const profile = getEconomyProfile(difficulty);
  const scaled = base * profile.priceMultiplier;
  if (base < 100) return Math.max(1, Math.round(scaled));
  return Math.max(25, Math.round(scaled / 25) * 25);
}

export function buildEconomyBalanceExamples(difficulty = 1) {
  const profile = getEconomyProfile(difficulty);
  const rewardSamples = [10, 50, 100, 500].map((base) => Object.freeze({
    base,
    adjusted: scaleEconomyRewardValue(base, profile.difficulty)
  }));
  const priceSamples = [400, 900, 2500, 4200].map((base) => Object.freeze({
    base,
    adjusted: scaleEconomyPriceValue(base, profile.difficulty)
  }));
  return Object.freeze({
    profile,
    rewardSamples: Object.freeze(rewardSamples),
    priceSamples: Object.freeze(priceSamples)
  });
}
