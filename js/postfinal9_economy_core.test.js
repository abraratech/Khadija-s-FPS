import assert from 'node:assert/strict';
import {
  POST_FINAL9_COSMETIC_CATALOG,
  POST_FINAL9_PATCH,
  applyPostFinal9EconomyReceipt,
  calculatePostFinal9EconomyAward,
  createDefaultPostFinal9Economy,
  derivePostFinal9Prestige,
  getPostFinal9EconomyPresentation,
  normalizePostFinal9Economy
} from './postfinal9_economy_core.js';

const now = Date.UTC(2026, 6, 17, 12);
const base = createDefaultPostFinal9Economy(now, 0);
assert.equal(base.patch, POST_FINAL9_PATCH);
assert.equal(base.currencies.arenaCredits, 0);
assert.equal(Object.keys(base.currencies.factionTokens).length, 4);
assert.equal(derivePostFinal9Prestige(0).level, 0);
assert.ok(derivePostFinal9Prestige(10_000_000).level > 0);

const receipt = {
  runId: 'run-economy-0001',
  endedAt: now,
  reason: 'TEAM_ELIMINATED',
  difficulty: 1.6,
  kills: 48,
  headshots: 15,
  assists: 6,
  revives: 2,
  damageDealt: 9200,
  wavesCleared: 8,
  objectivesCompleted: 3,
  factionId: 'MACHINE_COLLECTIVE',
  bossId: 'SIEGE-WALKER',
  bossDefeated: true,
  bossWeakPointHits: 8,
  bossStaggers: 2,
  replayModifierCount: 3,
  replayMasteryGrade: 'S',
  missionRiskChoice: 'OVERDRIVE',
  missionChainsCompleted: 1,
  missionStagesCompleted: 6,
  missionOptionalStagesCompleted: 1,
  contributionRole: 'LIFELINE',
  loadoutId: 'loadout-alpha',
  primaryWeaponId: 'AR',
  missionId: 'BLACK-VAULT'
};

const preview = calculatePostFinal9EconomyAward(receipt, {
  economy: base,
  completedOperations: [
    { scope: 'DAILY' },
    { scope: 'WEEKLY' }
  ],
  now
});
assert.equal(preview.valid, true);
assert.ok(preview.award.credits > 0);
assert.ok(preview.award.salvage > 0);
assert.ok(preview.award.factionTokens > 0);
assert.ok(preview.award.reputation > 0);
assert.ok(preview.award.weaponMasteryXp > 0);
assert.ok(preview.award.loadoutMasteryXp > 0);
assert.ok(preview.award.missionMasteryXp > 0);
assert.ok(POST_FINAL9_COSMETIC_CATALOG.some((entry) => entry.id === preview.award.collectionCandidate.id));

const applied = applyPostFinal9EconomyReceipt(base, receipt, {
  totalXp: 10_000_000,
  completedOperations: [{ scope: 'DAILY' }, { scope: 'WEEKLY' }],
  now
});
assert.equal(applied.valid, true);
assert.equal(applied.idempotent, false);
assert.equal(applied.economy.ledger.length, 1);
assert.equal(applied.economy.totals.receiptsApplied, 1);
assert.ok(applied.economy.currencies.arenaCredits >= applied.award.credits);
assert.ok(applied.economy.factionReputation.MACHINE_COLLECTIVE.points > 0);
assert.ok(applied.economy.weaponMastery.AR.xp > 0);
assert.ok(applied.economy.loadoutMastery['loadout-alpha'].xp > 0);
assert.ok(applied.economy.missionMastery['BLACK-VAULT'].xp > 0);
assert.ok(applied.economy.prestige.level > 0);
assert.equal(applied.newlyOwned.length, 1);

const repeated = applyPostFinal9EconomyReceipt(applied.economy, receipt, {
  totalXp: 10_000_000,
  now: now + 1000
});
assert.equal(repeated.valid, true);
assert.equal(repeated.idempotent, true);
assert.equal(repeated.economy.totals.receiptsApplied, 1);
assert.equal(repeated.economy.currencies.arenaCredits, applied.economy.currencies.arenaCredits);

let duplicateReceipt = null;
for (let index = 2; index < 500; index += 1) {
  const candidate = {
    ...receipt,
    runId: `run-economy-${String(index).padStart(4, '0')}`,
    endedAt: now + index * 1000
  };
  const candidateAward = calculatePostFinal9EconomyAward(candidate, {
    economy: applied.economy,
    now: candidate.endedAt
  });
  if (candidateAward.award.collectionCandidate.id === applied.award.collectionId) {
    duplicateReceipt = candidate;
    break;
  }
}
assert.ok(duplicateReceipt, 'expected deterministic duplicate candidate');
const duplicate = applyPostFinal9EconomyReceipt(applied.economy, duplicateReceipt, {
  totalXp: 10_000_000,
  now: duplicateReceipt.endedAt
});
assert.equal(duplicate.valid, true);
assert.equal(duplicate.award.duplicateConverted, true);
assert.equal(duplicate.award.duplicateSalvage, 12);
assert.equal(duplicate.economy.collections.duplicateConversions, 1);

const normalized = normalizePostFinal9Economy(duplicate.economy, {
  totalXp: 10_000_000,
  now: now + 10_000
});
assert.equal(normalized.patch, POST_FINAL9_PATCH);
assert.equal(normalized.ledger.length, 2);
const presentation = getPostFinal9EconomyPresentation(normalized, 10_000_000, now + 10_000);
assert.equal(presentation.patch, POST_FINAL9_PATCH);
assert.ok(presentation.ownedCollectionCount >= 1);
assert.ok(presentation.leadingFaction);
assert.ok(presentation.topWeapon);

console.log('POST-FINAL.9 economy core tests passed');
