import {
  ECONOMY_BALANCE_PATCH,
  buildEconomyBalanceExamples,
  getEconomyProfile,
  scaleEconomyPriceValue,
  scaleEconomyRewardValue
} from './economy_balance_core.js';

let activeDifficulty = 1;
let activeContext = Object.freeze({ mapId: 'unknown', mode: 'single' });
let configuredAt = 0;

export function configureEconomyBalance(difficulty = 1, context = {}) {
  const profile = getEconomyProfile(difficulty);
  activeDifficulty = profile.difficulty;
  activeContext = Object.freeze({
    mapId: String(context?.mapId || 'unknown'),
    mode: String(context?.mode || 'single')
  });
  configuredAt = Date.now();
  publishEconomyBalance();
  return getEconomyBalanceSnapshot();
}

export function scaleEconomyReward(baseValue, source = 'GENERAL') {
  void source;
  return scaleEconomyRewardValue(baseValue, activeDifficulty);
}

export function scaleEconomyPrice(baseValue, category = 'GENERAL') {
  void category;
  return scaleEconomyPriceValue(baseValue, activeDifficulty);
}

export function getEconomyBalanceSnapshot() {
  const profile = getEconomyProfile(activeDifficulty);
  const examples = buildEconomyBalanceExamples(activeDifficulty);
  return Object.freeze({
    patch: ECONOMY_BALANCE_PATCH,
    configured: configuredAt > 0,
    configuredAt,
    context: activeContext,
    ...profile,
    rewardSamples: examples.rewardSamples,
    priceSamples: examples.priceSamples
  });
}

function publishEconomyBalance() {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.dataset.kaEconomyBalance = ECONOMY_BALANCE_PATCH;
    root.dataset.kaEconomyTier = getEconomyProfile(activeDifficulty).tier;
  }
}

if (typeof window !== 'undefined') {
  window.KAGetEconomyBalance = getEconomyBalanceSnapshot;
}
