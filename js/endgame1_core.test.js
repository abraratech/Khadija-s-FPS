import assert from 'node:assert/strict';
import {
  ENDGAME1_PATCH,
  ENDGAME1_STATUS,
  ENDGAME1_TIER_IDS,
  Endgame1Director,
  applyEndgame1CompletionReceipt,
  computeEndgame1Tuning,
  createDefaultEndgame1Profile,
  createEndgame1SessionState,
  mergeEndgame1Profiles,
  resolveEndgame1Tier,
  selectEndgame1Modifiers
} from './endgame1_core.js';

const now = 1_730_000_000_000;

assert.equal(resolveEndgame1Tier({ difficulty: 1.5 }), null);
assert.equal(resolveEndgame1Tier({ difficulty: 1.70 }).id, ENDGAME1_TIER_IDS.VETERAN);
assert.equal(resolveEndgame1Tier({ difficulty: 1.85 }).id, ENDGAME1_TIER_IDS.NIGHTMARE);
assert.equal(resolveEndgame1Tier({ difficulty: 2 }).id, ENDGAME1_TIER_IDS.APEX);
assert.equal(resolveEndgame1Tier({ difficulty: 2, gameMode: 'pvp-team-elimination' }), null);

const modifiersA = selectEndgame1Modifiers({ runId: 'endgame-run-1', mapId: 'grid_bunker', tierId: 'APEX' });
const modifiersB = selectEndgame1Modifiers({ runId: 'endgame-run-1', mapId: 'grid_bunker', tierId: 'APEX' });
assert.deepEqual(modifiersA, modifiersB);
assert.equal(modifiersA.length, 4);

const tuning = computeEndgame1Tuning(resolveEndgame1Tier({ difficulty: 2 }), modifiersA);
assert.equal(tuning.active, true);
assert.ok(tuning.enemyHealthScale > 1.4);
assert.ok(tuning.rewardMultiplier > 1.9);
assert.ok(tuning.maxTeamRevives <= 2);
assert.equal(tuning.allowWaveRespawn, false);

const inactive = createEndgame1SessionState({ difficulty: 1.5, gameMode: 'survival', now });
assert.equal(inactive.patch, ENDGAME1_PATCH);
assert.equal(inactive.active, false);
assert.equal(inactive.status, ENDGAME1_STATUS.INACTIVE);

const director = new Endgame1Director();
let snapshot = director.reset({
  runId: 'endgame-run-1',
  mapId: 'grid_bunker',
  difficulty: 2,
  gameMode: 'survival',
  profile: createDefaultEndgame1Profile(now),
  now
});
assert.equal(snapshot.active, true);
assert.equal(snapshot.tier.id, ENDGAME1_TIER_IDS.APEX);
assert.equal(director.consumeEvents()[0].type, 'ENDGAME1_OPERATION_ASSIGNED');
assert.equal(director.recordPlayerDowned('player-1', now + 50), true);
assert.equal(director.recordPlayerDowned('player-1', now + 60), false);
snapshot = director.update(now + 1000, {
  mission: { status: 'COMPLETE', missionId: 'mission-1' },
  replay: { masteryGrade: 'S', boss: { bossId: 'boss-1' } },
  world: { status: 'COMPLETE', presentation: { sector: { sectorId: 'BLACK-VAULT' } } }
});
assert.equal(snapshot.status, ENDGAME1_STATUS.COMPLETE);
assert.ok(snapshot.completionReceipt);
assert.equal(snapshot.completionReceipt.flawless, false);
assert.equal(director.consumeEvents().some((entry) => entry.type === 'ENDGAME1_OPERATION_COMPLETED'), true);

const base = createDefaultEndgame1Profile(now);
const applied = applyEndgame1CompletionReceipt(base, snapshot.completionReceipt, now + 1000);
assert.equal(applied.valid, true);
assert.equal(applied.applied, true);
assert.equal(applied.firstClear, true);
assert.equal(applied.profile.operationsCompleted, 1);
assert.ok(applied.profile.marks >= 7);
assert.equal(applied.profile.bestTierId, ENDGAME1_TIER_IDS.APEX);
assert.ok(applied.award.xpBonus >= 480);

const duplicate = applyEndgame1CompletionReceipt(applied.profile, snapshot.completionReceipt, now + 2000);
assert.equal(duplicate.applied, false);
assert.equal(duplicate.idempotent, true);
assert.equal(duplicate.profile.marks, applied.profile.marks);

const merged = mergeEndgame1Profiles(base, applied.profile, now + 3000);
assert.equal(merged.operationsCompleted, 1);
assert.equal(merged.bestTierId, ENDGAME1_TIER_IDS.APEX);

const restored = new Endgame1Director();
assert.equal(restored.replaceSnapshot(snapshot, now + 4000), true);
assert.equal(restored.getSnapshot().completionId, snapshot.completionId);
assert.equal(restored.getRevivePolicy().allowWaveRespawn, false);

console.log('ENDGAME.1 high-difficulty operations core tests passed');
