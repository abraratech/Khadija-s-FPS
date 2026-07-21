// js/gameplay3_multiplayer_state.test.js
import assert from 'node:assert/strict';
import {
  GAMEPLAY3_PATCH,
  Gameplay3EvolutionDirector
} from './gameplay3_map_evolution_core.js';

const startedAt = 1_900_000_000_000;
const host = new Gameplay3EvolutionDirector();
host.reset({
  runId: 'coop-run-77',
  mapId: 'industrial_yard',
  gameMode: 'survival',
  now: startedAt
});
host.startWave(7, startedAt + 1000);

let hostSnapshot = host.getSnapshot(startedAt + 1500);
const interaction = host.interact({
  controlId: hostSnapshot.control.id,
  actorId: 'host-player',
  now: startedAt + 1500
});
assert.equal(interaction.accepted, true);
hostSnapshot = host.getSnapshot(startedAt + 1500);

const lateJoinClient = new Gameplay3EvolutionDirector();
assert.equal(lateJoinClient.replaceSnapshot(hostSnapshot, startedAt + 1500), true);
let clientSnapshot = lateJoinClient.getSnapshot(startedAt + 1500);

for (const field of [
  'patch',
  'mapId',
  'wave',
  'stageIndex',
  'routeVariant',
  'overrideActive',
  'powerOnline',
  'shutterClosed',
  'coverDeployed',
  'revision'
]) {
  assert.deepEqual(clientSnapshot[field], hostSnapshot[field], `late join mismatch: ${field}`);
}

assert.equal(clientSnapshot.patch, GAMEPLAY3_PATCH);
assert.equal(clientSnapshot.control.state, 'ACTIVE');
assert.equal(clientSnapshot.hazard.enabled, true);

const reconnectAt = startedAt + 8000;
hostSnapshot = host.update(reconnectAt);
const reconnectClient = new Gameplay3EvolutionDirector();
assert.equal(reconnectClient.replaceSnapshot(hostSnapshot, reconnectAt), true);
clientSnapshot = reconnectClient.getSnapshot(reconnectAt);
assert.equal(clientSnapshot.revision, hostSnapshot.revision);
assert.equal(clientSnapshot.control.state, hostSnapshot.control.state);
assert.equal(clientSnapshot.hazard.phase, hostSnapshot.hazard.phase);

const migratedHost = new Gameplay3EvolutionDirector();
assert.equal(migratedHost.replaceSnapshot(hostSnapshot, reconnectAt), true);
const beforeMigrationRevision = migratedHost.getSnapshot(reconnectAt).revision;
migratedHost.startWave(8, reconnectAt + 1000);
const migratedSnapshot = migratedHost.getSnapshot(reconnectAt + 1000);
assert.equal(migratedSnapshot.wave, 8);
assert.ok(migratedSnapshot.revision >= beforeMigrationRevision);
assert.equal(migratedSnapshot.mapId, 'industrial_yard');

migratedHost.startWave(10, reconnectAt + 2000);
const escalation = migratedHost.getSnapshot(reconnectAt + 2000);
assert.equal(escalation.stageIndex, 3);
assert.equal(escalation.overrideActive, false);
assert.equal(escalation.control.state, 'READY');

const invalid = new Gameplay3EvolutionDirector();
assert.equal(invalid.replaceSnapshot({ ...hostSnapshot, patch: 'wrong' }, reconnectAt), false);

const pvp = new Gameplay3EvolutionDirector();
const pvpSnapshot = pvp.reset({
  runId: 'pvp-run',
  mapId: 'industrial_yard',
  gameMode: 'pvp',
  now: startedAt
});
assert.equal(pvpSnapshot.active, false);
assert.equal(pvpSnapshot.profile, null);

console.log('GAMEPLAY.3 multiplayer restoration tests passed');
