import assert from 'node:assert/strict';
import {
  PVP3_R2_ARMOR_CAP,
  PVP3_R2_PATCH,
  createPvp3PickupState,
  getPvp3PickupDefinitions,
  normalizePvp3PickupState,
  normalizePvp3WeaponList,
  pvp3FlatDistance,
  pvp3PickupAvailable,
  pvp3PickupLabel
} from './pvp3_rules_core.js';
import { normalizePvp1State, derivePvp1Presentation } from './pvp1_core.js';

assert.equal(PVP3_R2_PATCH, 'pvp3-r2-dedicated-rules-neutral-pickups');
assert.equal(PVP3_R2_ARMOR_CAP, 35);
assert.equal(getPvp3PickupDefinitions('grid_bunker').length, 4);
assert.equal(getPvp3PickupDefinitions('reactor_courtyard').some((entry) => entry.weaponFamily === 'SNIPER'), true);
assert.deepEqual(normalizePvp3WeaponList(['RIFLE', 'RIFLE']), ['PISTOL', 'RIFLE']);

const pickups = createPvp3PickupState('grid_bunker', { availableAt: 5000, round: 2 });
assert.equal(pickups.length, 4);
assert.equal(pvp3PickupAvailable(pickups[0], 4999), false);
assert.equal(pvp3PickupAvailable(pickups[0], 5000), true);
assert.equal(pvp3FlatDistance({ x: pickups[0].x, z: pickups[0].z }, pickups[0]), 0);
assert.match(pvp3PickupLabel(pickups[0]), /DROP/);
assert.equal(normalizePvp3PickupState(pickups)[0].round, 2);

const state = normalizePvp1State({
  runId: 'pvp3-r2-run',
  mapId: 'grid_bunker',
  rulesPatch: PVP3_R2_PATCH,
  phase: 'ACTIVE',
  round: 1,
  roundStartsAt: 1000,
  roundEndsAt: 90000,
  pickups,
  teams: { ALPHA: { roundWins: 0 }, BRAVO: { roundWins: 0 } },
  players: {
    local: {
      team: 'ALPHA',
      slot: 0,
      health: 100,
      maxHealth: 100,
      alive: true,
      armor: 35,
      maxArmor: 35,
      unlockedWeapons: ['PISTOL', 'RIFLE'],
      ammoSerial: 2,
      pickupSerial: 3,
      spawnSerial: 1
    }
  }
});
assert.equal(state.rulesPatch, PVP3_R2_PATCH);
assert.equal(state.pickups.length, 4);
assert.equal(state.players.local.armor, 35);
assert.deepEqual(state.players.local.unlockedWeapons, ['PISTOL', 'RIFLE']);
const presentation = derivePvp1Presentation(state, 'local', 2000);
assert.equal(presentation.localArmor, 35);
assert.deepEqual(presentation.localWeapons, ['PISTOL', 'RIFLE']);
assert.equal(presentation.pickups.length, 4);

console.log('PVP.3 R2 frontend dedicated rules and neutral pickup core tests passed');
