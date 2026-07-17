// multiplayer-server/src/progression_authority_core.test.js
import assert from 'node:assert/strict';
import {
  PROGRESSION_AUTHORITY_PATCH,
  applyAuthoritativeProgressionReceipt,
  calculateAuthoritativeProgressionAward,
  defaultProgressionProfile,
  normalizeProgressionRunReceipt
} from './progression_authority_core.js';

const now = 1_800_000_000_000;
assert.equal(PROGRESSION_AUTHORITY_PATCH, 'prog2-r1-production-hardening-cloud-integrity');

const receipt = {
  runId: 'run-secure-0001',
  mapId: 'grid_bunker',
  mode: 'multiplayer',
  difficulty: 1.5,
  startedAt: now - 600_000,
  endedAt: now,
  durationSeconds: 600,
  reason: 'TEAM_ELIMINATED',
  score: 12500,
  wave: 8,
  wavesCleared: 7,
  kills: 42,
  headshots: 12,
  assists: 3,
  revives: 2,
  timesRevived: 1,
  damageDealt: 8400,
  damageTaken: 620,
  pointsEarned: 9300,
  pointsSpent: 5100,
  objectivesCompleted: 1,
  challengesCompleted: 2,
  weaponUpgrades: 1,
  perksPurchased: 2,
  accuracy: 36.5,
  botAssisted: true,
  factionId: 'MACHINE_COLLECTIVE',
  bossId: 'SIEGE-WALKER',
  bossDefeated: true,
  bossWeakPointHits: 6,
  bossStaggers: 2,
  replayModifierCount: 3,
  replayMasteryGrade: 'S',
  missionRiskChoice: 'OVERDRIVE',
  missionChainsCompleted: 1,
  missionStagesCompleted: 6,
  missionOptionalStagesCompleted: 1,
  contributionRole: 'LIFELINE',
  loadoutId: 'authority-loadout',
  primaryWeaponId: 'AR',
  missionId: 'BLACK-VAULT'
};

const normalized = normalizeProgressionRunReceipt(receipt, now);
assert.equal(normalized.valid, true);
assert.equal(normalized.receipt.headshots, 12);

const award = calculateAuthoritativeProgressionAward(receipt, now);
assert.equal(award.valid, true);
assert.ok(award.award.total > 0);

const applied = applyAuthoritativeProgressionReceipt(defaultProgressionProfile(now - 1), receipt, now);
assert.equal(applied.valid, true);
assert.equal(applied.profile.totalRuns, 1);
assert.equal(applied.profile.multiplayerRuns, 1);
assert.equal(applied.profile.botAssistedRuns, 1);
assert.equal(applied.profile.totalKills, 42);
assert.equal(applied.profile.totalHeadshots, 12);
assert.equal(applied.profile.totalRevives, 2);
assert.equal(applied.profile.bestWave, 8);
assert.ok(applied.profile.xp > 0);
assert.equal(applied.profile.recentRuns[0].runId, receipt.runId);
assert.ok(applied.economy.award.credits > 0);
assert.ok(applied.profile.economy.currencies.arenaCredits > 0);
assert.ok(applied.profile.economy.factionReputation.MACHINE_COLLECTIVE.points > 0);
assert.ok(applied.profile.economy.weaponMastery.AR.xp > 0);

assert.equal(normalizeProgressionRunReceipt({ ...receipt, runId: 'bad id' }, now).valid, false);
assert.equal(normalizeProgressionRunReceipt({ ...receipt, endedAt: now + 60 * 60 * 1000 }, now).valid, false);
assert.equal(normalizeProgressionRunReceipt({ ...receipt, endedAt: now - 15 * 24 * 60 * 60 * 1000 }, now).valid, false);

console.log('progression_authority_core tests passed');
