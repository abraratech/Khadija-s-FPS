import assert from 'node:assert/strict';
import {
  CONTENT2_ARENA_ID,
  CONTENT2_ENEMY_TYPES,
  applyContent2SpawnMix,
  getContent2IncomingDamageScale,
  getContent2MaxActive,
  getContent2ProjectileProfile,
  getContent2SpawnWeights,
  isContent2EnemyType
} from './content2_core.js';

assert.equal(CONTENT2_ARENA_ID, 'stormbreak_canal');
assert.equal(isContent2EnemyType(CONTENT2_ENEMY_TYPES.WARDEN), true);
assert.equal(isContent2EnemyType('SHAMBLER'), false);
assert.equal(getContent2IncomingDamageScale('WARDEN'), 0.62);
assert.equal(getContent2IncomingDamageScale('WARDEN', { headshot: true }), 1);
assert.equal(getContent2IncomingDamageScale('STALKER'), 1);
assert.deepEqual(getContent2ProjectileProfile('SAPPER'), {
  damage: 22,
  splashDamage: 10,
  splashRadius: 2.8,
  color: 0xff9d2e,
  sourceType: 'SAPPER'
});
assert.equal(getContent2MaxActive('WARDEN', 5), 1);
assert.equal(getContent2MaxActive('WARDEN', 12), 2);
assert.equal(getContent2MaxActive('STALKER', 14), 3);

const early = getContent2SpawnWeights({ mapId: CONTENT2_ARENA_ID, wave: 3 });
assert.equal(early.WARDEN, 0);
assert.equal(early.STALKER, 0);
assert.equal(early.SAPPER, 0);

const stormbreak = getContent2SpawnWeights({ mapId: CONTENT2_ARENA_ID, wave: 8 });
const bunker = getContent2SpawnWeights({ mapId: 'grid_bunker', wave: 8 });
assert.ok(stormbreak.WARDEN > bunker.WARDEN);
assert.ok(stormbreak.STALKER > bunker.STALKER);
assert.ok(stormbreak.SAPPER > bunker.SAPPER);

const types = {
  SHAMBLER: { name: 'SHAMBLER' },
  WARDEN: { name: 'WARDEN' },
  STALKER: { name: 'STALKER' },
  SAPPER: { name: 'SAPPER' }
};
const mix = applyContent2SpawnMix([[types.SHAMBLER, 1]], {
  mapId: CONTENT2_ARENA_ID,
  wave: 8,
  enemyTypes: types
});
assert.deepEqual(mix.map(([config]) => config.name), ['SHAMBLER', 'WARDEN', 'STALKER', 'SAPPER']);
assert.ok(mix[0][1] < 1);

console.log('CONTENT.2 arena and enemy expansion core tests passed');
