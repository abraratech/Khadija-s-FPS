import assert from 'node:assert/strict';
import {
  GAMEPLAY5_BRANCH,
  GAMEPLAY5_STATUS,
  Gameplay5NarrativeDirector
} from './gameplay5_narrative_operation_core.js';

const now = 1_900_000_100_000;
const mission = {
  missionId: 'WHITE-OUT',
  status: 'ACTIVE',
  currentStageIndex: 3,
  riskChoice: 'PENDING',
  optionalStagesCompleted: 1,
  stages: [
    { index: 0, type: 'INFILTRATE', status: 'COMPLETE' },
    { index: 1, type: 'RECOVER', status: 'COMPLETE' },
    { index: 2, type: 'SECONDARY', status: 'COMPLETE', optional: true },
    { index: 3, type: 'DEFEND', status: 'ACTIVE' },
    { index: 4, type: 'HUNT', status: 'PENDING' },
    { index: 5, type: 'EXTRACT', status: 'PENDING' }
  ]
};

const host = new Gameplay5NarrativeDirector();
host.reset({ runId: 'coop-run', mapId: 'hospital_wing', missionId: mission.missionId, gameMode: 'survival', now });
host.update(now + 100, {
  mission,
  gameplay2: { activeMutations: [{ id: 'SUPPLY_CRISIS', level: 2 }] },
  gameplay3: { revision: 2 },
  gameplay4: { status: 'PENDING', phase: 0 }
});
const checkpoint = host.getSnapshot(now + 100);
assert.equal(checkpoint.branchId, GAMEPLAY5_BRANCH.ASSET_SECURED);
assert.equal(checkpoint.hostAuthoritative, true);
assert.equal(checkpoint.pvpExcluded, true);

const lateJoin = new Gameplay5NarrativeDirector();
lateJoin.reset({ runId: 'coop-run', mapId: 'hospital_wing', missionId: mission.missionId, now });
assert.equal(lateJoin.replaceSnapshot(checkpoint, now + 120), true);
assert.deepEqual(lateJoin.getSnapshot(now + 120), host.getSnapshot(now + 120));

const reconnect = new Gameplay5NarrativeDirector();
reconnect.reset({ runId: 'coop-run', mapId: 'hospital_wing', missionId: mission.missionId, now });
assert.equal(reconnect.replaceSnapshot(checkpoint, now + 140), true);
assert.equal(reconnect.state.currentStageIndex, 3);
assert.equal(reconnect.state.gameplay3Revision, 2);
assert.equal(reconnect.state.mutationSignature, 'SUPPLY_CRISIS:2');

mission.currentStageIndex = 4;
mission.stages[3].status = 'COMPLETE';
mission.stages[4].status = 'ACTIVE';
host.update(now + 200, { mission, gameplay4: { status: 'ACTIVE', phase: 1 } });
const migrationCheckpoint = host.getSnapshot(now + 200);
const migratedHost = new Gameplay5NarrativeDirector();
migratedHost.reset({ runId: 'coop-run', mapId: 'hospital_wing', missionId: mission.missionId, now });
assert.equal(migratedHost.replaceSnapshot(migrationCheckpoint, now + 220), true);
assert.equal(migratedHost.state.currentStageIndex, 4);
assert.equal(migratedHost.state.bossPhase, 1);
assert.equal(migratedHost.state.status, GAMEPLAY5_STATUS.ACTIVE);

const duplicateCount = migratedHost.state.transmissions.length;
migratedHost.update(now + 230, { mission, gameplay4: { status: 'ACTIVE', phase: 1 } });
assert.equal(migratedHost.state.transmissions.length, duplicateCount);

const wrongRun = new Gameplay5NarrativeDirector();
wrongRun.reset({ runId: 'other-run', mapId: 'hospital_wing', now });
assert.equal(wrongRun.replaceSnapshot(migrationCheckpoint, now + 240), false);

const pvp = new Gameplay5NarrativeDirector();
pvp.reset({ runId: 'pvp-run', mapId: 'pvp_reactor', gameMode: 'pvp-team-elimination', now });
assert.equal(pvp.state.active, false);
assert.equal(pvp.state.status, GAMEPLAY5_STATUS.INACTIVE);
assert.equal(pvp.replaceSnapshot(checkpoint, now + 250), false);

console.log('GAMEPLAY.5 multiplayer restoration and PvP isolation tests passed');
