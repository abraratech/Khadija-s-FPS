import assert from 'node:assert/strict';
import {
  POST_FINAL7_MISSION_STATUS,
  POST_FINAL7_PATCH,
  POST_FINAL7_RISK_CHOICES,
  POST_FINAL7_STAGE_TYPES,
  PostFinal7MissionDirector,
  computePostFinal7Reward,
  getPostFinal7MissionDefinition
} from './postfinal7_operation_core.js';

const definition = getPostFinal7MissionDefinition('grid_bunker');
assert.equal(definition.stages.length, 6);
assert.deepEqual(
  definition.stages.map((stage) => stage.type),
  ['INFILTRATE', 'RECOVER', 'SECONDARY', 'DEFEND', 'HUNT', 'EXTRACT']
);

const director = new PostFinal7MissionDirector();
director.reset({
  runId: 'mission-test',
  mapId: 'grid_bunker',
  difficulty: 1.5,
  playerCount: 2,
  now: 1000
});
assert.equal(director.state.patch, POST_FINAL7_PATCH);
assert.equal(director.state.status, POST_FINAL7_MISSION_STATUS.ACTIVE);
assert.equal(director.currentStage().type, POST_FINAL7_STAGE_TYPES.INFILTRATE);

function completeCurrent(sequence, contributors = { alpha: 3, bravo: 2 }) {
  const stage = director.currentStage();
  const operation = {
    operationId: `operation-${sequence}`,
    status: 'COMPLETE',
    contributors
  };
  director.bindOperation(operation, 1000 + sequence);
  return director.observeOperation(operation, 2000 + sequence);
}

for (let index = 0; index < 4; index += 1) {
  const transition = completeCurrent(index + 1);
  assert.equal(transition.accepted, true);
  assert.equal(transition.advance, true);
}

assert.equal(director.currentStage().type, POST_FINAL7_STAGE_TYPES.HUNT);
const hunt = completeCurrent(5, { alpha: 6, bravo: 2 });
assert.equal(hunt.decision, true);
assert.equal(director.state.status, POST_FINAL7_MISSION_STATUS.DECISION);
assert.equal(director.state.bossDefeated, true);
assert.equal(
  director.chooseRisk(POST_FINAL7_RISK_CHOICES.OVERDRIVE, 'alpha', 9000),
  true
);
assert.equal(director.state.status, POST_FINAL7_MISSION_STATUS.ACTIVE);
assert.equal(director.state.riskChoice, POST_FINAL7_RISK_CHOICES.OVERDRIVE);
assert.equal(director.currentStage().type, POST_FINAL7_STAGE_TYPES.EXTRACT);

const extraction = completeCurrent(6, { alpha: 8, bravo: 8 });
assert.equal(extraction.complete, true);
assert.equal(director.state.status, POST_FINAL7_MISSION_STATUS.COMPLETE);
assert.equal(director.state.extractionCompleted, true);
assert.ok(director.state.completionId);
assert.ok(director.state.medals.some((entry) => entry.role === 'MVP'));
assert.ok(director.state.medals.some((entry) => entry.role === 'GUARDIAN'));

const snapshot = director.getSnapshot(12000);
const restored = new PostFinal7MissionDirector({ runId: 'mission-test', mapId: 'grid_bunker' });
assert.equal(restored.replaceSnapshot(snapshot, 12000), true);
assert.equal(restored.state.completionId, director.state.completionId);
assert.equal(restored.state.riskChoice, POST_FINAL7_RISK_CHOICES.OVERDRIVE);

const secure = computePostFinal7Reward({
  basePoints: 350,
  difficulty: 1,
  playerCount: 1,
  riskChoice: POST_FINAL7_RISK_CHOICES.SECURE,
  optionalStagesCompleted: 1
});
const overdrive = computePostFinal7Reward({
  basePoints: 350,
  difficulty: 1,
  playerCount: 1,
  riskChoice: POST_FINAL7_RISK_CHOICES.OVERDRIVE,
  optionalStagesCompleted: 1
});
assert.ok(overdrive > secure);

const auto = new PostFinal7MissionDirector({
  ...snapshot,
  status: POST_FINAL7_MISSION_STATUS.DECISION,
  currentStageIndex: 5,
  riskChoice: POST_FINAL7_RISK_CHOICES.PENDING,
  riskDecisionDeadline: 15000,
  completionId: null,
  completedAt: 0
});
auto.update(15001);
assert.equal(auto.state.riskChoice, POST_FINAL7_RISK_CHOICES.SECURE);
assert.equal(auto.state.status, POST_FINAL7_MISSION_STATUS.ACTIVE);

console.log('POST-FINAL.7 operation-chain core tests passed');
