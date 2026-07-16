import assert from 'node:assert/strict';
import {
  CONTENT1_OPERATION_XP,
  Content1Authority,
  createContent1State,
  getContent1OperationDefinition,
  selectContent1Encounter
} from './content1_core.js';

const operationMaps = [
  'grid_bunker',
  'industrial_yard',
  'neon_depot',
  'parking_garage',
  'hospital_wing',
  'reactor_courtyard'
];

for (const mapId of operationMaps) {
  const operation = getContent1OperationDefinition(mapId);
  assert.ok(operation.id);
  assert.ok(operation.label);
  assert.ok(operation.target > 0);
  assert.equal(operation.xp, CONTENT1_OPERATION_XP);
}

const encounter = selectContent1Encounter({
  runId: 'test-run',
  mapId: 'grid_bunker',
  wave: 6
});
assert.ok(encounter);
assert.ok(encounter.id);
assert.equal(encounter.wave, 6);

const authority = new Content1Authority(createContent1State({
  runId: 'run-a',
  mapId: 'grid_bunker',
  now: 1000
}));
for (let index = 0; index < 35; index += 1) {
  assert.equal(authority.recordAction({
    kind: 'KILL',
    amount: 1,
    actorId: 'player-a',
    eventId: `kill-${index}`,
    at: 1100 + index
  }), true);
}
let snapshot = authority.getSnapshot(2000);
assert.equal(snapshot.operation.completed, true);
assert.equal(snapshot.operation.progress, 35);
assert.equal(snapshot.operation.contributors['player-a'], 35);
assert.ok(snapshot.operation.completionId);
assert.equal(
  authority.recordAction({
    kind: 'KILL',
    amount: 1,
    actorId: 'player-a',
    eventId: 'kill-34',
    at: 2200
  }),
  false
);

const zone = new Content1Authority(createContent1State({
  runId: 'run-zone',
  mapId: 'industrial_yard',
  now: 1
}));
assert.equal(zone.recordAction({
  kind: 'ZONE_TICK',
  amount: 100,
  actorId: 'local',
  eventId: 'zone-1',
  at: 2
}), true);
assert.equal(zone.getSnapshot(3).operation.progress, 5);

const recovery = new Content1Authority(createContent1State({
  runId: 'run-med',
  mapId: 'hospital_wing',
  now: 1
}));
assert.equal(recovery.recordAction({
  kind: 'WAVE_CLEAR',
  amount: 1,
  healthRatio: 0.4,
  actorId: 'local',
  eventId: 'wave-bad',
  at: 2
}), true);
assert.equal(recovery.getSnapshot(3).operation.progress, 0);
assert.equal(recovery.recordAction({
  kind: 'WAVE_CLEAR',
  amount: 1,
  healthRatio: 0.8,
  actorId: 'local',
  eventId: 'wave-good',
  at: 4
}), true);
assert.equal(recovery.getSnapshot(5).operation.progress, 1);

const elite = new Content1Authority(createContent1State({
  runId: 'run-elite',
  mapId: 'reactor_courtyard',
  now: 1
}));
elite.startWave(6, 2);
elite.state.elite.pending = true;
assert.equal(elite.markEliteSpawned('elite-a', 3), true);
assert.equal(elite.getSnapshot(4).elite.pending, false);
assert.equal(elite.recordAction({
  kind: 'ELITE_KILL',
  amount: 1,
  enemyId: 'elite-a',
  actorId: 'local',
  eventId: 'elite-kill-a',
  at: 5
}), true);
assert.equal(elite.getSnapshot(6).operation.progress, 1);

const replacement = new Content1Authority(createContent1State({
  runId: 'run-replace',
  mapId: 'neon_depot'
}));
const replacementSnapshot = replacement.getSnapshot();
assert.equal(replacement.replaceSnapshot({
  ...replacementSnapshot,
  patch: 'wrong'
}), false);
assert.equal(replacement.replaceSnapshot(replacementSnapshot), true);

console.log('content1_core tests passed');
