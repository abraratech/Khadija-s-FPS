import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  POST_FINAL9_PATCH,
  applyPostFinal9EconomyReceipt,
  createDefaultPostFinal9Economy
} from './postfinal9_economy_core.js';

const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const hub = fs.readFileSync(new URL('./cloud_profile_hub.js', import.meta.url), 'utf8');
const authority = fs.readFileSync(new URL('./progression_authority_core.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(index, /economyRewardsProgression: POST_FINAL9_SERVER_INFO/);
assert.match(index, /sourceBaselineSha: 'bde3ff8d8fa5f29948c82ec4fa20959685e92846'/);
assert.match(index, /certifiedFrontendBaselineSha: CERTIFIED_FRONTEND_SHA/);
assert.match(index, /protocolUnchanged: true/);
assert.match(index, /workerChangeRequired: true/);
assert.match(hub, /economyAuthorityPatch: POST_FINAL9_PATCH/);
assert.match(hub, /economyProtection: 'server-authoritative-idempotent-ledger'/);
assert.match(hub, /economy: result\.economy/);
assert.match(authority, /normalizePostFinal9ReceiptFields/);
assert.match(authority, /applyPostFinal9EconomyReceipt/);
assert.match(packageJson.scripts.check, /postfinal9_economy_core\.test\.js/);
assert.match(packageJson.scripts.check, /postfinal9_contract\.test\.js/);

const receipt = {
  runId: 'run-worker-contract-0001',
  endedAt: Date.UTC(2026, 6, 17),
  reason: 'TEAM_ELIMINATED',
  difficulty: 1.5,
  kills: 20,
  headshots: 8,
  assists: 4,
  revives: 2,
  damageDealt: 5000,
  wavesCleared: 6,
  objectivesCompleted: 2,
  factionId: 'VANGUARD_CORPS',
  bossId: 'VANGUARD-JUGGERNAUT',
  bossDefeated: true,
  bossWeakPointHits: 4,
  bossStaggers: 1,
  replayModifierCount: 2,
  replayMasteryGrade: 'A',
  missionRiskChoice: 'SECURE',
  missionChainsCompleted: 1,
  missionStagesCompleted: 6,
  missionOptionalStagesCompleted: 1,
  loadoutId: 'contract-loadout',
  primaryWeaponId: 'SMG',
  missionId: 'BLACK-VAULT'
};
const result = applyPostFinal9EconomyReceipt(
  createDefaultPostFinal9Economy(receipt.endedAt, 0),
  receipt,
  { totalXp: 50000, now: receipt.endedAt }
);
assert.equal(result.valid, true);
assert.equal(result.economy.patch, POST_FINAL9_PATCH);
assert.ok(result.award.credits > 0);
assert.ok(result.economy.currencies.arenaCredits > 0);

console.log('POST-FINAL.9 Worker contract tests passed');
