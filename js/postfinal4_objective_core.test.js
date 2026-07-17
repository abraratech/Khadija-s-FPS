import assert from 'node:assert/strict';
import {
  POST_FINAL4_OPERATION_KINDS,
  POST_FINAL4_OPERATION_STATUS,
  POST_FINAL4_PATCH,
  PostFinal4ObjectiveDirector,
  createPostFinal4ObjectiveState,
  getPostFinal4MapLayout,
  pointInsidePostFinal4Anchor
} from './postfinal4_objective_core.js';

assert.equal(POST_FINAL4_PATCH, 'post-final4-r1-dynamic-operations-objective-director');
assert.equal(getPostFinal4MapLayout('hospital_wing').preferred, POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR);
assert.equal(pointInsidePostFinal4Anchor({ x: 0, z: 0 }, { x: 1, z: 1, radius: 2 }), true);

const initial = createPostFinal4ObjectiveState({
  runId: 'run-a',
  mapId: 'grid_bunker',
  difficulty: 1,
  playerCount: 2,
  now: 1000
});
assert.equal(initial.current.kind, POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE);
assert.equal(initial.current.optional, false);

const defend = new PostFinal4ObjectiveDirector(initial);
for (let index = 0; index < Math.ceil(defend.state.current.stageTarget); index += 1) {
  defend.recordAction({
    kind: 'ZONE_TICK',
    amount: 1,
    actorIds: ['host', 'ally'],
    eventId: `zone-${index}`,
    at: 1100 + index
  });
}
assert.equal(defend.state.current.status, POST_FINAL4_OPERATION_STATUS.COMPLETE);
assert.ok(defend.state.current.completionId);
assert.ok(defend.state.current.contributors.host > 0);
assert.equal(defend.recordAction({ kind: 'ZONE_TICK', eventId: 'zone-0' }), false);

const restore = new PostFinal4ObjectiveDirector(createPostFinal4ObjectiveState({
  runId: 'run-restore', mapId: 'industrial_yard', now: 1
}));
assert.equal(restore.state.current.kind, POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT);
while (restore.state.current.status === POST_FINAL4_OPERATION_STATUS.ACTIVE) {
  restore.recordAction({
    kind: 'INTERACT_TICK', amount: 1, actorId: 'host',
    eventId: `restore-${restore.state.current.stageProgress}`, at: 2
  });
}
assert.equal(restore.state.current.status, POST_FINAL4_OPERATION_STATUS.COMPLETE);

const retrieve = new PostFinal4ObjectiveDirector(createPostFinal4ObjectiveState({
  runId: 'run-retrieve', mapId: 'neon_depot', now: 1
}));
assert.equal(retrieve.state.current.kind, POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER);
for (let index = 0; index < 20 && retrieve.state.current.stage === 'PICKUP'; index += 1) {
  retrieve.recordAction({ kind: 'INTERACT_TICK', amount: 0.5, actorId: 'ally', eventId: `pick-${index}`, at: 2 + index });
}
assert.equal(retrieve.state.current.stage, 'DELIVER');
for (let index = 0; index < 20 && retrieve.state.current.status === POST_FINAL4_OPERATION_STATUS.ACTIVE; index += 1) {
  retrieve.recordAction({ kind: 'INTERACT_TICK', amount: 0.5, actorId: 'ally', eventId: `deliver-${index}`, at: 50 + index });
}
assert.equal(retrieve.state.current.status, POST_FINAL4_OPERATION_STATUS.COMPLETE);

const rescue = new PostFinal4ObjectiveDirector(createPostFinal4ObjectiveState({
  runId: 'run-rescue', mapId: 'hospital_wing', now: 1
}));
for (let index = 0; index < 20 && rescue.state.current.stage === 'REVIVE'; index += 1) {
  rescue.recordAction({ kind: 'INTERACT_TICK', amount: 0.5, actorId: 'host', eventId: `revive-${index}`, at: 3 + index });
}
assert.equal(rescue.state.current.stage, 'ESCORT');
rescue.recordAction({
  kind: 'SURVIVOR_POSITION', amount: 1, actorId: 'host',
  position: rescue.state.current.secondaryAnchor,
  eventId: 'escort-complete', at: 100
});
assert.equal(rescue.state.current.status, POST_FINAL4_OPERATION_STATUS.COMPLETE);

const priority = new PostFinal4ObjectiveDirector(createPostFinal4ObjectiveState({
  runId: 'run-priority', mapId: 'parking_garage', now: 1
}));
assert.equal(priority.state.current.kind, POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET);
assert.equal(priority.assignPriorityTarget({ enemyId: 'enemy-a', position: { x: 2, z: 3 } }, 5), true);
assert.equal(priority.recordAction({ kind: 'KILL', enemyId: 'enemy-b', actorId: 'host', eventId: 'wrong', at: 6 }), false);
assert.equal(priority.recordAction({ kind: 'KILL', enemyId: 'enemy-a', actorId: 'host', eventId: 'right', at: 7 }), true);
assert.equal(priority.state.current.status, POST_FINAL4_OPERATION_STATUS.COMPLETE);

const timeout = new PostFinal4ObjectiveDirector(createPostFinal4ObjectiveState({
  runId: 'run-timeout', mapId: 'grid_bunker', now: 1
}));
timeout.update(timeout.state.current.expiresAt + 1);
assert.equal(timeout.state.current.status, POST_FINAL4_OPERATION_STATUS.FAILED);

timeout.startWave(2, timeout.state.current.expiresAt + 2);
assert.equal(timeout.state.current.status, POST_FINAL4_OPERATION_STATUS.ACTIVE);
assert.equal(timeout.state.current.optional, true);

console.log('POST-FINAL.4 dynamic objective director core tests passed');
