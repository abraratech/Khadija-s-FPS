import assert from 'node:assert/strict';
import {
  MPNET1_PATCH,
  evaluateEmergencyResupply,
  normalizeTransactionResult,
  pruneTransactionResults
} from './mpnet1_core.js';

assert.equal(MPNET1_PATCH, 'mpnet1-r1-relay-transaction-resupply-integrity');

const eligible = evaluateEmergencyResupply({
  allAmmoEmpty: true,
  balance: 100,
  cheapestAmmoCost: 425,
  currentWave: 4,
  emergencyState: { lastWave: 3, lastGrantedAt: 50_000, grants: 1 },
  now: 60_000
});
assert.equal(eligible.ok, true);
assert.equal(eligible.state.lastWave, 4);
assert.equal(eligible.state.grants, 2);

const cooldown = evaluateEmergencyResupply({
  allAmmoEmpty: true,
  balance: 0,
  cheapestAmmoCost: 425,
  currentWave: 4,
  emergencyState: { lastWave: 4, lastGrantedAt: 55_000, grants: 2 },
  now: 60_000
});
assert.equal(cooldown.ok, false);
assert.equal(cooldown.reason, 'EMERGENCY RESUPPLY COOLDOWN');
assert.ok(cooldown.retryAfterMs > 0);

assert.equal(evaluateEmergencyResupply({
  allAmmoEmpty: false,
  balance: 0,
  cheapestAmmoCost: 425
}).ok, false);
assert.equal(evaluateEmergencyResupply({
  allAmmoEmpty: true,
  balance: 425,
  cheapestAmmoCost: 425
}).ok, false);

const transaction = normalizeTransactionResult({
  requestId: 'heal-1',
  targetPlayerId: 'ally',
  accepted: true,
  cost: 250,
  score: 750,
  grant: { type: 'health' },
  authoritativeState: { health: 100, maxHealth: 100 },
  committedAt: 100_000
}, 100_000);
assert.equal(transaction.requestId, 'heal-1');
assert.equal(transaction.authoritativeState.health, 100);

const pruned = pruneTransactionResults([
  transaction,
  { ...transaction, requestId: 'old', committedAt: 1 }
], { now: 200_000, retentionMs: 120_000 });
assert.deepEqual(pruned.map((entry) => entry.requestId), ['heal-1']);

console.log('MPNET.1 transaction and emergency resupply core tests passed');
