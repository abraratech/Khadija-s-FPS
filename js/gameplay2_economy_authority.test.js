import assert from 'node:assert/strict';
import {
  calculatePostFinal9EconomyAward,
  normalizePostFinal9ReceiptFields
} from './postfinal9_economy_core.js';
import {
  GAMEPLAY2_PATCH,
  deriveGameplay2MutationReceipt
} from './gameplay2_mutation_core.js';

const now = Date.UTC(2026, 6, 20, 12);
const base = {
  runId: 'run-gameplay2-economy-0001',
  mapId: 'parking_garage',
  gameMode: 'survival',
  wave: 21,
  wavesCleared: 20,
  endedAt: now,
  reason: 'TEAM_ELIMINATED',
  difficulty: 1.4,
  kills: 70,
  headshots: 20,
  assists: 4,
  revives: 1,
  damageDealt: 14000,
  objectivesCompleted: 3,
  factionId: 'BIOHAZARD_SWARM',
  bossId: 'MUTATION-BRUTE',
  bossDefeated: true,
  bossWeakPointHits: 4,
  bossStaggers: 1,
  replayModifierCount: 2,
  replayMasteryGrade: 'A',
  missionRiskChoice: 'SECURE',
  missionChainsCompleted: 1,
  missionStagesCompleted: 5,
  missionOptionalStagesCompleted: 1,
  contributionRole: 'VANGUARD',
  loadoutId: 'loadout-gameplay2',
  primaryWeaponId: 'AR',
  missionId: 'PARKING-GARAGE'
};

const expected = deriveGameplay2MutationReceipt({
  runId: base.runId,
  mapId: base.mapId,
  difficulty: base.difficulty,
  wave: base.wave,
  now
});
const normalized = normalizePostFinal9ReceiptFields({
  ...base,
  gameplay2Patch: GAMEPLAY2_PATCH,
  mutationRewardMultiplier: 99,
  mutationHistoryCount: 999
});
assert.equal(normalized.gameplay2Patch, GAMEPLAY2_PATCH);
assert.deepEqual(normalized.mutationActiveIds, [...expected.activeIds]);
assert.equal(normalized.mutationHistoryCount, expected.historyCount);
assert.equal(normalized.mutationRewardMultiplier, expected.rewardMultiplier);
assert.ok(normalized.mutationRewardMultiplier <= 1.75);

const withoutMutations = calculatePostFinal9EconomyAward(base, { now });
const withMutations = calculatePostFinal9EconomyAward({
  ...base,
  gameplay2Patch: GAMEPLAY2_PATCH,
  mutationRewardMultiplier: 99,
  mutationHistoryCount: 999
}, { now });
assert.equal(withMutations.valid, true);
assert.ok(withMutations.award.credits >= withoutMutations.award.credits);
assert.equal(withMutations.award.mutationRewardMultiplier, expected.rewardMultiplier);
assert.equal(withMutations.award.mutationHistoryCount, expected.historyCount);
assert.equal(
  withMutations.award.mutationBonusCredits,
  withMutations.award.baseCredits - withMutations.award.unmutatedCredits
);

const invalidPatch = normalizePostFinal9ReceiptFields({
  ...base,
  gameplay2Patch: 'spoofed-patch',
  mutationRewardMultiplier: 1.75
});
assert.equal(invalidPatch.gameplay2Patch, '');
assert.equal(invalidPatch.mutationRewardMultiplier, 1);
assert.equal(invalidPatch.mutationHistoryCount, 0);

const pvpSpoof = normalizePostFinal9ReceiptFields({
  ...base,
  gameMode: 'pvp',
  gameplay2Patch: GAMEPLAY2_PATCH,
  mutationRewardMultiplier: 1.75,
  mutationHistoryCount: 999
});
assert.equal(pvpSpoof.gameMode, 'pvp');
assert.equal(pvpSpoof.gameplay2Patch, '');
assert.equal(pvpSpoof.mutationRewardMultiplier, 1);
assert.equal(pvpSpoof.mutationHistoryCount, 0);

console.log('GAMEPLAY.2 economy authority tests passed');
