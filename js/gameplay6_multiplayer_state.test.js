import assert from 'node:assert/strict';
import {
  GAMEPLAY6_STATUS,
  Gameplay6WorldDirector,
  createDefaultGameplay6WorldProfile
} from './gameplay6_world_progression_core.js';

const now = 1_720_000_100_000;
const profile = createDefaultGameplay6WorldProfile(now);
const host = new Gameplay6WorldDirector();
host.reset({ runId: 'coop-world-run', mapId: 'hospital_wing', gameMode: 'survival', profile, now });
const hostSnapshot = host.update(now + 100, {
  profile,
  narrative: {
    status: 'COMPLETE',
    completionId: 'coop-world-run:white-out:complete',
    outcomeId: 'CLEAN_EXTRACTION',
    outcomeGrade: 'A-',
    branchId: 'ASSET_SECURED',
    completedAt: now + 100
  },
  gameplay2: { history: [{ id: 'BLACKOUT' }] },
  gameplay3: { revision: 3 },
  gameplay4: { status: 'DEFEATED', completionId: 'boss-white-out' }
});
assert.equal(hostSnapshot.status, GAMEPLAY6_STATUS.COMPLETE);
assert.equal(hostSnapshot.hostAuthoritative, true);

const lateJoin = new Gameplay6WorldDirector();
lateJoin.reset({ runId: 'coop-world-run', mapId: 'hospital_wing', gameMode: 'survival', profile, now });
assert.equal(lateJoin.replaceSnapshot(hostSnapshot, now + 200), true);
assert.deepEqual(lateJoin.getSnapshot(), hostSnapshot);

const reconnect = new Gameplay6WorldDirector();
reconnect.reset({ runId: 'coop-world-run', mapId: 'hospital_wing', gameMode: 'survival', profile, now });
assert.equal(reconnect.replaceSnapshot(hostSnapshot, now + 300), true);
assert.equal(reconnect.getSnapshot().contribution.receiptId, hostSnapshot.contribution.receiptId);

const migratedHost = new Gameplay6WorldDirector();
migratedHost.reset({ runId: 'coop-world-run', mapId: 'hospital_wing', gameMode: 'survival', profile, now });
assert.equal(migratedHost.replaceSnapshot(hostSnapshot, now + 400), true);
assert.equal(migratedHost.getSnapshot().status, GAMEPLAY6_STATUS.COMPLETE);

const wrongRun = new Gameplay6WorldDirector();
wrongRun.reset({ runId: 'other-run', mapId: 'hospital_wing', gameMode: 'survival', profile, now });
assert.equal(wrongRun.replaceSnapshot(hostSnapshot, now + 500), false);

const pvp = new Gameplay6WorldDirector();
const pvpSnapshot = pvp.reset({ runId: 'pvp-world', mapId: 'hospital_wing', gameMode: 'pvp-team-elimination', profile, now });
assert.equal(pvpSnapshot.active, false);
assert.equal(pvpSnapshot.pvpExcluded, true);

console.log('GAMEPLAY.6 multiplayer restoration and PvP isolation tests passed');
