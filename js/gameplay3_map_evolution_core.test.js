// js/gameplay3_map_evolution_core.test.js
import assert from 'node:assert/strict';
import {
  GAMEPLAY3_PATCH,
  GAMEPLAY3_STAGE_WAVES,
  GAMEPLAY3_SUPPORTED_MAPS,
  GAMEPLAY3_TIMING,
  Gameplay3EvolutionDirector,
  getGameplay3MapProfile,
  isGameplay3SupportedMap
} from './gameplay3_map_evolution_core.js';

assert.equal(GAMEPLAY3_PATCH, 'gameplay3-r1-interactive-evolving-maps');
assert.deepEqual([...GAMEPLAY3_STAGE_WAVES], [4, 7, 10]);
assert.deepEqual(
  [...GAMEPLAY3_SUPPORTED_MAPS],
  ['grid_bunker', 'industrial_yard', 'hospital_wing', 'stormbreak_canal']
);

for (const mapId of GAMEPLAY3_SUPPORTED_MAPS) {
  assert.equal(isGameplay3SupportedMap(mapId), true);
  const profile = getGameplay3MapProfile(mapId);
  assert.equal(profile.mapId, mapId);
  assert.ok(profile.control.id);
  assert.ok(Number.isFinite(profile.routeA.x));
  assert.ok(Number.isFinite(profile.routeB.z));
  assert.ok(profile.hazard.radius >= 2);
}

const start = 1_800_000_000_000;
const first = new Gameplay3EvolutionDirector();
const second = new Gameplay3EvolutionDirector();

const a = first.reset({
  runId: 'run-alpha',
  mapId: 'grid_bunker',
  gameMode: 'survival',
  now: start
});
const b = second.reset({
  runId: 'run-alpha',
  mapId: 'grid_bunker',
  gameMode: 'survival',
  now: start
});

assert.equal(a.active, true);
assert.equal(a.seed, b.seed);
assert.equal(a.routeVariant, b.routeVariant);
assert.equal(a.stageIndex, 0);
assert.equal(a.shutterClosed, false);
assert.equal(a.hazard.phase, 'OFFLINE');

first.startWave(4, start + 1000);
let snapshot = first.getSnapshot(start + 1000);
assert.equal(snapshot.stageIndex, 1);
assert.equal(snapshot.shutterClosed, true);
assert.equal(snapshot.coverDeployed, false);
assert.equal(snapshot.hazard.enabled, false);

first.startWave(7, start + 2000);
snapshot = first.getSnapshot(start + 2000);
assert.equal(snapshot.stageIndex, 2);
assert.equal(snapshot.coverDeployed, true);
assert.equal(snapshot.hazard.enabled, true);
assert.equal(snapshot.hazard.phase, 'IDLE');

const rejected = first.interact({
  controlId: 'wrong-control',
  actorId: 'player-1',
  now: start + 3000
});
assert.equal(rejected.accepted, false);

const controlId = snapshot.control.id;
const accepted = first.interact({
  controlId,
  actorId: 'player-1',
  now: start + 3000
});
assert.equal(accepted.accepted, true);

snapshot = first.getSnapshot(start + 3000);
assert.equal(snapshot.overrideActive, true);
assert.equal(snapshot.powerOnline, true);
assert.equal(snapshot.shutterClosed, false);
assert.equal(snapshot.coverDeployed, true);
assert.equal(snapshot.control.state, 'ACTIVE');
assert.equal(snapshot.lastActorId, 'player-1');

const cooldownRejected = first.interact({
  controlId,
  actorId: 'player-1',
  now: start + 3500
});
assert.equal(cooldownRejected.accepted, false);
assert.equal(cooldownRejected.reason, 'ACTIVE');

first.update(start + 3000 + GAMEPLAY3_TIMING.controlActiveMs + 1);
snapshot = first.getSnapshot(start + 3000 + GAMEPLAY3_TIMING.controlActiveMs + 1);
assert.equal(snapshot.overrideActive, false);
assert.equal(snapshot.shutterClosed, true);
assert.equal(snapshot.control.state, 'COOLDOWN');

first.update(start + 3000 + GAMEPLAY3_TIMING.controlCooldownMs + 1);
snapshot = first.getSnapshot(start + 3000 + GAMEPLAY3_TIMING.controlCooldownMs + 1);
assert.equal(snapshot.control.state, 'READY');

const hazardWarningTime = start + 2000 + GAMEPLAY3_TIMING.hazardIdleMs + 1;
snapshot = first.getSnapshot(hazardWarningTime);
assert.equal(snapshot.hazard.phase, 'WARNING');

const hazardActiveTime = (
  start
  + 2000
  + GAMEPLAY3_TIMING.hazardIdleMs
  + GAMEPLAY3_TIMING.hazardWarningMs
  + 1
);
snapshot = first.getSnapshot(hazardActiveTime);
assert.equal(snapshot.hazard.phase, 'ACTIVE');

first.startWave(10, start + 90000);
snapshot = first.getSnapshot(start + 90000);
assert.equal(snapshot.stageIndex, 3);
assert.equal(snapshot.powerOnline, true);
const stageThreeRoute = snapshot.routeVariant;

first.startWave(11, start + 91000);
snapshot = first.getSnapshot(start + 91000);
assert.notEqual(snapshot.routeVariant, stageThreeRoute);

const restored = new Gameplay3EvolutionDirector();
assert.equal(restored.replaceSnapshot(snapshot, start + 91000), true);
assert.equal(restored.getSnapshot(start + 91000).mapId, 'grid_bunker');
assert.equal(restored.getSnapshot(start + 91000).wave, 11);
assert.equal(restored.getSnapshot(start + 91000).routeVariant, snapshot.routeVariant);

const pvp = new Gameplay3EvolutionDirector();
const pvpSnapshot = pvp.reset({
  runId: 'pvp-run',
  mapId: 'grid_bunker',
  gameMode: 'pvp-team-elimination',
  now: start
});
assert.equal(pvpSnapshot.active, false);
assert.equal(pvpSnapshot.gameMode, 'pvp');
assert.equal(pvp.interact({
  controlId: 'grid_lockdown_override',
  actorId: 'player-1',
  now: start
}).accepted, false);

const unsupported = new Gameplay3EvolutionDirector();
assert.equal(unsupported.reset({
  runId: 'unknown',
  mapId: 'reactor_courtyard',
  gameMode: 'survival',
  now: start
}).active, false);

console.log('GAMEPLAY.3 map evolution core tests passed');
