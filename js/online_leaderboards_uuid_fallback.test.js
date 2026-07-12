// js/online_leaderboards_uuid_fallback.test.js
import assert from 'node:assert/strict';
import { createOnlineLeaderboardPlayerToken } from './online_leaderboards.js';

const uuidToken = createOnlineLeaderboardPlayerToken({
  cryptoObject: { randomUUID: () => '12345678-1234-4abc-9def-1234567890ab' }
});
assert.equal(uuidToken, '12345678-1234-4abc-9def-1234567890ab');

const bytes = Uint8Array.from({ length: 16 }, (_, index) => index);
const randomValuesToken = createOnlineLeaderboardPlayerToken({
  cryptoObject: {
    getRandomValues(target) {
      target.set(bytes);
      return target;
    }
  }
});
assert.equal(randomValuesToken, '000102030405060708090a0b0c0d0e0f');

const samples = [0.1, 0.2, 0.3, 0.4];
const compatibilityToken = createOnlineLeaderboardPlayerToken({
  cryptoObject: {},
  random: () => samples.shift() ?? 0.5,
  now: () => 1_700_000_000_000
});
assert.match(compatibilityToken, /^compat-[a-z0-9]+-[a-z0-9]+$/);
assert.ok(compatibilityToken.length >= 8);
assert.ok(compatibilityToken.length <= 96);

const throwingToken = createOnlineLeaderboardPlayerToken({
  cryptoObject: {
    randomUUID() {
      throw new Error('unavailable');
    },
    getRandomValues() {
      throw new Error('unavailable');
    }
  },
  random: () => 0.5,
  now: () => 123
});
assert.match(throwingToken, /^compat-/);

console.log('online leaderboard UUID compatibility fallback tests passed');
