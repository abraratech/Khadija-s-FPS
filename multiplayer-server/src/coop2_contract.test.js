// multiplayer-server/src/coop2_contract.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateAuthoritativeProgressionAward,
  normalizeProgressionRunReceipt
} from './progression_authority_core.js';

const indexSource = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const progressionSource = readFileSync(
  new URL('./progression_authority_core.js', import.meta.url),
  'utf8'
);

assert.ok(indexSource.includes("envelope.type === 'coop2-state'"));
assert.ok(indexSource.includes("checkpoint.coop2 = envelope.payload?.snapshot || null"));
assert.ok(indexSource.includes('Only the current host can publish COOP.2 snapshots.'));
assert.ok(progressionSource.includes('coopContractsCompleted'));
assert.ok(progressionSource.includes('receipt.coopContractsCompleted * 180'));

const now = 1_800_000_000_000;
const receipt = {
  runId: 'run-coop2-authority',
  mapId: 'grid_bunker',
  mode: 'multiplayer',
  difficulty: 1,
  startedAt: now - 300_000,
  endedAt: now,
  durationSeconds: 300,
  reason: 'TEAM_ELIMINATED',
  score: 5000,
  wave: 5,
  wavesCleared: 4,
  kills: 20,
  headshots: 5,
  assists: 2,
  revives: 1,
  timesRevived: 0,
  damageDealt: 3500,
  damageTaken: 400,
  pointsEarned: 4200,
  pointsSpent: 1800,
  objectivesCompleted: 1,
  challengesCompleted: 1,
  coopContractsCompleted: 1,
  weaponUpgrades: 0,
  perksPurchased: 1,
  accuracy: 34,
  botAssisted: false
};

const normalized = normalizeProgressionRunReceipt(receipt, now);
assert.equal(normalized.valid, true);
assert.equal(normalized.receipt.coopContractsCompleted, 1);
const award = calculateAuthoritativeProgressionAward(receipt, now);
assert.equal(award.valid, true);

const withoutContract = calculateAuthoritativeProgressionAward({
  ...receipt,
  runId: 'run-coop2-authority-no-contract',
  coopContractsCompleted: 0
}, now);
assert.equal(withoutContract.valid, true);
assert.equal(award.award.eventXp - withoutContract.award.eventXp, 180);

console.log('coop2 Worker contract tests passed');
