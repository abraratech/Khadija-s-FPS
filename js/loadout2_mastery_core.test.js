import assert from 'node:assert/strict';
import {
  LOADOUT2_PATCH,
  LOADOUT2_SCHEMA,
  LOADOUT2_WEAPON_FAMILIES,
  LOADOUT2_SPECIALIZATIONS,
  createDefaultLoadout2MasteryProfile,
  normalizeLoadout2MasteryProfile,
  applyLoadout2MasteryReceipt,
  mergeLoadout2MasteryProfiles,
  getLoadout2CombatTuning,
  setLoadout2Specialization
} from './loadout2_mastery_core.js';

const NOW = 1784743200000;
const profile = createDefaultLoadout2MasteryProfile(NOW);
assert.equal(profile.patch, LOADOUT2_PATCH);
assert.equal(profile.schema, LOADOUT2_SCHEMA);
assert.deepEqual(Object.keys(profile.families), LOADOUT2_WEAPON_FAMILIES);
assert.equal(profile.selectedSpecializationId, 'FIELD_OPERATIVE');
assert.equal(LOADOUT2_SPECIALIZATIONS.length, 5);

const receipt = {
  receiptId: 'loadout2:test:one',
  runId: 'test-one',
  gameMode: 'survival',
  specializationId: 'VANGUARD',
  specializationPoints: 90,
  families: {
    MELEE: { xp: 620, strikes: 16, hits: 11, kills: 4, damage: 820, bossKills: 1 },
    RIFLE: { xp: 320, shots: 80, hits: 42, kills: 8, damage: 3400 }
  },
  createdAt: NOW + 1
};
const applied = applyLoadout2MasteryReceipt(profile, receipt, NOW + 2);
assert.equal(applied.applied, true);
assert.equal(applied.idempotent, false);
assert.equal(applied.profile.families.MELEE.level >= 4, true);
assert.equal(applied.profile.families.MELEE.unlocks.includes('EDGE_BALANCE'), true);
assert.equal(applied.profile.families.RIFLE.unlocks.includes('QUICK_GRIP'), true);
assert.equal(applied.profile.selectedSpecializationId, 'VANGUARD');
assert.equal(applied.profile.receipts.length, 1);

const duplicate = applyLoadout2MasteryReceipt(applied.profile, receipt, NOW + 3);
assert.equal(duplicate.applied, false);
assert.equal(duplicate.idempotent, true);
assert.equal(duplicate.profile.totalMasteryXp, applied.profile.totalMasteryXp);

const pvp = applyLoadout2MasteryReceipt(applied.profile, {
  ...receipt,
  receiptId: 'loadout2:test:pvp',
  gameMode: 'pvp'
}, NOW + 4);
assert.equal(pvp.applied, false);
assert.equal(pvp.pvpExcluded, true);
assert.equal(pvp.profile.totalMasteryXp, applied.profile.totalMasteryXp);

const specialization = setLoadout2Specialization(applied.profile, 'MARKSMAN', NOW + 5);
assert.equal(specialization.changed, true);
assert.equal(specialization.profile.selectedSpecializationId, 'MARKSMAN');
assert.equal(specialization.profile.respecCount, 1);

const pveTuning = getLoadout2CombatTuning(applied.profile, 'MELEE', {
  specializationId: 'VANGUARD',
  gameMode: 'survival'
});
assert.equal(pveTuning.meleeEnabled, true);
assert.equal(pveTuning.meleeDamageScale > 1, true);
assert.equal(pveTuning.meleeCooldownScale < 1, true);
const pvpTuning = getLoadout2CombatTuning(applied.profile, 'MELEE', {
  specializationId: 'VANGUARD',
  gameMode: 'pvp'
});
assert.equal(pvpTuning.pvpExcluded, true);
assert.equal(pvpTuning.meleeEnabled, false);
assert.equal(pvpTuning.damageScale, 1);
assert.equal(pvpTuning.masteryScale, 0);

const remote = normalizeLoadout2MasteryProfile({
  ...profile,
  updatedAt: NOW + 20,
  selectedSpecializationId: 'SUPPORT',
  families: {
    ...profile.families,
    SNIPER: { ...profile.families.SNIPER, xp: 900, kills: 12, updatedAt: NOW + 20 }
  },
  receipts: [{ receiptId: 'remote-receipt', runId: 'remote', totalXp: 900, appliedAt: NOW + 20 }]
}, NOW + 20);
const merged = mergeLoadout2MasteryProfiles(applied.profile, remote, NOW + 30);
assert.equal(merged.families.MELEE.xp, applied.profile.families.MELEE.xp);
assert.equal(merged.families.SNIPER.xp, 900);
assert.equal(merged.receipts.some((entry) => entry.receiptId === receipt.receiptId), true);
assert.equal(merged.receipts.some((entry) => entry.receiptId === 'remote-receipt'), true);
assert.equal(merged.selectedSpecializationId, 'SUPPORT');

console.log('LOADOUT.2 mastery and specialization core tests passed');
