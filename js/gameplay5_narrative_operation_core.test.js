import assert from 'node:assert/strict';
import {
  GAMEPLAY5_BRANCH,
  GAMEPLAY5_PATCH,
  GAMEPLAY5_STATUS,
  Gameplay5NarrativeDirector,
  computeGameplay5NarrativeReward,
  getGameplay5NarrativeDefinition
} from './gameplay5_narrative_operation_core.js';

const start = 1_900_000_000_000;
const mission = {
  missionId: 'BLACK-VAULT',
  status: 'ACTIVE',
  currentStageIndex: 0,
  riskChoice: 'PENDING',
  optionalStagesCompleted: 0,
  stages: [
    { index: 0, type: 'INFILTRATE', label: 'Breach the Bunker', status: 'ACTIVE' },
    { index: 1, type: 'RECOVER', label: 'Restore Security Relay', status: 'PENDING' },
    { index: 2, type: 'SECONDARY', label: 'Recover the Trapped Survivor', status: 'PENDING', optional: true },
    { index: 3, type: 'DEFEND', label: 'Hold the Vault Approach', status: 'PENDING' },
    { index: 4, type: 'HUNT', label: 'Eliminate the Vault Warden', status: 'PENDING' },
    { index: 5, type: 'EXTRACT', label: 'Exit through the North Gate', status: 'PENDING' }
  ]
};

const director = new Gameplay5NarrativeDirector();
director.reset({
  runId: 'gp5-run',
  mapId: 'grid_bunker',
  missionId: mission.missionId,
  gameMode: 'survival',
  now: start
});
assert.equal(director.state.patch, GAMEPLAY5_PATCH);
assert.equal(director.state.status, GAMEPLAY5_STATUS.ACTIVE);
assert.equal(director.state.active, true);
assert.equal(director.state.pvpExcluded, true);
assert.ok(director.state.currentTransmission?.body.includes('bunker'));
assert.equal(getGameplay5NarrativeDefinition('grid_bunker').title, 'Black Vault Directive');

director.update(start + 100, { mission });
assert.equal(director.state.currentStageIndex, 0);
assert.match(director.state.currentTransmission.title, /BREACH/);

mission.currentStageIndex = 2;
mission.stages[0].status = 'COMPLETE';
mission.stages[1].status = 'COMPLETE';
mission.stages[2].status = 'ACTIVE';
director.update(start + 200, { mission });
assert.equal(director.state.branchId, GAMEPLAY5_BRANCH.UNRESOLVED);

mission.stages[2].status = 'COMPLETE';
mission.optionalStagesCompleted = 1;
mission.currentStageIndex = 3;
mission.stages[3].status = 'ACTIVE';
director.update(start + 300, { mission });
assert.equal(director.state.branchId, GAMEPLAY5_BRANCH.ASSET_SECURED);
assert.match(director.state.consequenceText, /maintenance bypass/i);
const tuning = director.getObjectiveTuning(mission);
assert.equal(tuning.targetScale, 0.9);
assert.equal(tuning.rewardScale, 1.08);

const eventsBeforeBoss = director.consumeEvents();
assert.ok(eventsBeforeBoss.some((event) => event.type === 'GAMEPLAY5_BRANCH_RESOLVED'));

director.update(start + 400, {
  mission,
  gameplay2: { activeMutations: [{ id: 'BLACKOUT', level: 1 }] },
  gameplay3: { revision: 3 },
  gameplay4: { status: 'ACTIVE', phase: 2 }
});
const worldEvents = director.consumeEvents();
assert.ok(worldEvents.filter((event) => event.type === 'GAMEPLAY5_TRANSMISSION').length >= 3);
assert.equal(director.state.gameplay3Revision, 3);
assert.equal(director.state.bossPhase, 2);

mission.status = 'COMPLETE';
mission.currentStageIndex = 5;
mission.riskChoice = 'OVERDRIVE';
mission.stages[5].status = 'COMPLETE';
director.update(start + 500, { mission });
assert.equal(director.state.status, GAMEPLAY5_STATUS.COMPLETE);
assert.equal(director.state.outcomeId, 'DECISIVE_VICTORY');
assert.equal(director.state.outcomeGrade, 'A');
assert.ok(director.state.completionId.includes('gameplay5'));
assert.ok(computeGameplay5NarrativeReward(director.getSnapshot()) >= 400);

const restored = new Gameplay5NarrativeDirector();
restored.reset({ runId: 'gp5-run', mapId: 'grid_bunker', missionId: mission.missionId, now: start });
assert.equal(restored.replaceSnapshot(director.getSnapshot(start + 500), start + 500), true);
assert.deepEqual(restored.getSnapshot(start + 500), director.getSnapshot(start + 500));

const lostMission = structuredClone(mission);
lostMission.status = 'ACTIVE';
lostMission.currentStageIndex = 3;
lostMission.riskChoice = 'PENDING';
lostMission.optionalStagesCompleted = 0;
lostMission.stages[2].status = 'FAILED';
lostMission.stages[3].status = 'ACTIVE';
const lost = new Gameplay5NarrativeDirector();
lost.reset({ runId: 'gp5-lost', mapId: 'grid_bunker', missionId: lostMission.missionId, now: start });
lost.update(start + 100, { mission: lostMission });
assert.equal(lost.state.branchId, GAMEPLAY5_BRANCH.ASSET_LOST);
assert.equal(lost.getObjectiveTuning(lostMission).targetScale, 1.12);

const pvp = new Gameplay5NarrativeDirector();
pvp.reset({ runId: 'pvp-run', mapId: 'pvp_foundry', gameMode: 'pvp', now: start });
assert.equal(pvp.state.active, false);
assert.equal(pvp.state.status, GAMEPLAY5_STATUS.INACTIVE);
assert.equal(pvp.update(start + 100, { mission }).active, false);
assert.equal(pvp.consumeEvents().length, 0);

console.log('GAMEPLAY.5 narrative operation core tests passed');
