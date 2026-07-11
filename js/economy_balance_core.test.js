import assert from 'node:assert/strict';
import {
  ECONOMY_BALANCE_PATCH,
  buildEconomyBalanceExamples,
  getEconomyProfile,
  resolveEconomyTier,
  scaleEconomyPriceValue,
  scaleEconomyRewardValue
} from './economy_balance_core.js';

assert.equal(ECONOMY_BALANCE_PATCH, 'm4-easy-normal-economy-r1');
assert.equal(resolveEconomyTier(0.7), 'EASY');
assert.equal(resolveEconomyTier(1.0), 'NORMAL');
assert.equal(resolveEconomyTier(1.3), 'HARD');

assert.deepEqual(
  {
    reward: getEconomyProfile(0.7).rewardMultiplier,
    price: getEconomyProfile(0.7).priceMultiplier
  },
  { reward: 1.3, price: 0.8 }
);
assert.deepEqual(
  {
    reward: getEconomyProfile(1).rewardMultiplier,
    price: getEconomyProfile(1).priceMultiplier
  },
  { reward: 1.1, price: 0.95 }
);
assert.deepEqual(
  {
    reward: getEconomyProfile(1.3).rewardMultiplier,
    price: getEconomyProfile(1.3).priceMultiplier
  },
  { reward: 1, price: 1 }
);

assert.equal(scaleEconomyRewardValue(50, 0.7), 65);
assert.equal(scaleEconomyRewardValue(50, 1), 55);
assert.equal(scaleEconomyRewardValue(50, 1.3), 50);
assert.equal(scaleEconomyPriceValue(900, 0.7), 725);
assert.equal(scaleEconomyPriceValue(900, 1), 850);
assert.equal(scaleEconomyPriceValue(900, 1.3), 900);
assert.equal(scaleEconomyPriceValue(0, 0.7), 0);
assert.equal(scaleEconomyRewardValue(Number.NaN, 0.7), 0);

const examples = buildEconomyBalanceExamples(0.7);
assert.equal(examples.profile.tier, 'EASY');
assert.equal(examples.rewardSamples.find((entry) => entry.base === 500)?.adjusted, 650);
assert.equal(examples.priceSamples.find((entry) => entry.base === 2500)?.adjusted, 2000);

console.log('economy_balance_core.test.js: PASS');

const runtime = await import('./economy_balance.js');
runtime.configureEconomyBalance(0.7, { mapId: 'grid_bunker', mode: 'single' });
assert.equal(runtime.getEconomyBalanceSnapshot().tier, 'EASY');
assert.equal(runtime.scaleEconomyReward(100, 'TEST'), 130);
assert.equal(runtime.scaleEconomyPrice(2500, 'TEST'), 2000);
runtime.configureEconomyBalance(1.3, { mapId: 'grid_bunker', mode: 'single' });
assert.equal(runtime.scaleEconomyReward(100, 'TEST'), 100);
assert.equal(runtime.scaleEconomyPrice(2500, 'TEST'), 2500);
console.log('economy_balance runtime test: PASS');
