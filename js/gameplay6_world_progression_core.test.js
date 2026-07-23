import assert from 'node:assert/strict';
import {
  GAMEPLAY6_PATCH,
  GAMEPLAY6_STATUS,
  Gameplay6WorldDirector,
  applyGameplay6Contribution,
  computeGameplay6Contribution,
  createDefaultGameplay6WorldProfile,
  getGameplay6WorldPresentation,
  normalizeGameplay6WorldProfile
} from './gameplay6_world_progression_core.js';

const now = 1_720_000_000_000;
const base = createDefaultGameplay6WorldProfile(now);
assert.equal(base.patch, GAMEPLAY6_PATCH);
assert.equal(base.points, 0);
assert.equal(Object.keys(base.sectors).length, 7);
assert.equal(base.sectors.stormbreak_canal.sectorId, 'STORMBREAK');
assert.equal(base.sectors.grid_bunker.tier, 1);

const contribution = computeGameplay6Contribution({
  runId: 'run-world-1',
  mapId: 'grid_bunker',
  gameMode: 'survival',
  narrative: {
    status: 'COMPLETE',
    completionId: 'run-world-1:black-vault:gameplay5:DECISIVE_VICTORY',
    outcomeId: 'DECISIVE_VICTORY',
    outcomeGrade: 'A',
    branchId: 'ASSET_SECURED',
    completedAt: now + 100
  },
  gameplay2: { history: [{ id: 'm1' }, { id: 'm2' }] },
  gameplay3: { revision: 2 },
  gameplay4: { status: 'DEFEATED', completionId: 'boss-complete' },
  now: now + 100
});
assert.ok(contribution);
assert.equal(contribution.mapId, 'grid_bunker');
assert.equal(contribution.decisive, true);
assert.equal(contribution.secured, true);
assert.equal(contribution.bossVictory, true);
assert.ok(contribution.points >= 180);

const applied = applyGameplay6Contribution(base, contribution, now + 100);
assert.equal(applied.applied, true);
assert.equal(applied.profile.operationsCompleted, 1);
assert.equal(applied.profile.points, contribution.points);
assert.equal(applied.profile.sectors.grid_bunker.points, contribution.points);
assert.equal(applied.profile.sectors.grid_bunker.decisiveVictories, 1);
assert.equal(applied.profile.sectors.grid_bunker.bossVictories, 1);

const duplicate = applyGameplay6Contribution(applied.profile, contribution, now + 200);
assert.equal(duplicate.applied, false);
assert.equal(duplicate.idempotent, true);
assert.equal(duplicate.profile.points, applied.profile.points);

let profile = applied.profile;
for (let index = 2; index <= 6; index += 1) {
  const next = {
    ...contribution,
    receiptId: `run-world-${index}:gameplay6`,
    runId: `run-world-${index}`,
    completedAt: now + index * 100,
    points: 220
  };
  profile = applyGameplay6Contribution(profile, next, next.completedAt).profile;
}
assert.ok(profile.tier >= 2);
assert.ok(profile.sectors.grid_bunker.tier >= 3);
assert.ok(Object.keys(profile.milestones).length >= 2);

const normalized = normalizeGameplay6WorldProfile({
  ...profile,
  points: -5,
  sectors: { ...profile.sectors, grid_bunker: { ...profile.sectors.grid_bunker, bestGradeRank: 99 } }
}, now + 1000);
assert.equal(normalized.points, 0);
assert.equal(normalized.sectors.grid_bunker.bestGradeRank, 4);

const presentation = getGameplay6WorldPresentation(profile, 'grid_bunker');
assert.equal(presentation.sector.sectorId, 'BLACK-VAULT');
assert.ok(presentation.worldOperationsCompleted >= 6);

const director = new Gameplay6WorldDirector();
director.reset({ runId: 'session-1', mapId: 'grid_bunker', gameMode: 'survival', profile, now });
let snapshot = director.update(now + 10, {
  profile,
  narrative: { status: 'ACTIVE' }
});
assert.equal(snapshot.status, GAMEPLAY6_STATUS.ACTIVE);

snapshot = director.update(now + 20, {
  profile,
  narrative: {
    status: 'COMPLETE',
    completionId: 'session-1:narrative',
    outcomeId: 'CLEAN_EXTRACTION',
    outcomeGrade: 'A-',
    branchId: 'ASSET_SECURED',
    completedAt: now + 20
  },
  gameplay2: { history: [] },
  gameplay3: { revision: 1 },
  gameplay4: { status: 'DEFEATED' }
});
assert.equal(snapshot.status, GAMEPLAY6_STATUS.COMPLETE);
assert.ok(snapshot.contribution?.receiptId);
assert.equal(director.consumeEvents().some((entry) => entry.type === 'GAMEPLAY6_CONTRIBUTION_READY'), true);

const restored = new Gameplay6WorldDirector();
restored.reset({ runId: 'session-1', mapId: 'grid_bunker', gameMode: 'survival', profile, now });
assert.equal(restored.replaceSnapshot(snapshot, now + 30), true);
assert.equal(restored.getSnapshot().completionId, snapshot.completionId);

const pvp = new Gameplay6WorldDirector();
const pvpSnapshot = pvp.reset({ runId: 'pvp-1', mapId: 'grid_bunker', gameMode: 'pvp-team-elimination', profile, now });
assert.equal(pvpSnapshot.active, false);
assert.equal(pvpSnapshot.status, GAMEPLAY6_STATUS.INACTIVE);
assert.equal(computeGameplay6Contribution({
  runId: 'pvp-1',
  mapId: 'grid_bunker',
  gameMode: 'pvp-team-elimination',
  narrative: { status: 'COMPLETE', completionId: 'x' }
}), null);

console.log('GAMEPLAY.6 world progression core tests passed');
