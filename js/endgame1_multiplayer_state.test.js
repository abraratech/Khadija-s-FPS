import assert from 'node:assert/strict';
import {
  ENDGAME1_STATUS,
  Endgame1Director,
  createDefaultEndgame1Profile
} from './endgame1_core.js';

const now = 1_750_000_000_000;
const profile = createDefaultEndgame1Profile(now);
const host = new Endgame1Director();
host.reset({
  runId: 'endgame-coop-run',
  mapId: 'hospital_wing',
  difficulty: 1.85,
  gameMode: 'survival',
  profile,
  now
});
host.recordPlayerDowned('player-2', now + 50);
const hostSnapshot = host.update(now + 100, {
  profile,
  mission: { status: 'COMPLETE', missionId: 'operation-endgame-1' },
  replay: { masteryGrade: 'A', boss: { bossId: 'boss-endgame-1' } },
  world: { status: 'COMPLETE', presentation: { sector: { sectorId: 'HOSPITAL' } } }
});
assert.equal(hostSnapshot.status, ENDGAME1_STATUS.COMPLETE);
assert.equal(hostSnapshot.hostAuthoritative, true);
assert.equal(hostSnapshot.protocolUnchanged, true);
assert.equal(hostSnapshot.progressionProtected, true);
assert.equal(hostSnapshot.tier.id, 'NIGHTMARE');
assert.equal(hostSnapshot.noDowned, false);

for (const label of ['lateJoin', 'reconnect', 'migratedHost']) {
  const client = new Endgame1Director();
  client.reset({
    runId: 'endgame-coop-run',
    mapId: 'hospital_wing',
    difficulty: 1.85,
    gameMode: 'survival',
    profile,
    now
  });
  assert.equal(client.replaceSnapshot(hostSnapshot, now + 200), true, label);
  assert.deepEqual(client.getSnapshot(hostSnapshot.serverTime), hostSnapshot, label);
  assert.equal(client.getRevivePolicy().maxTeamRevives, hostSnapshot.tuning.maxTeamRevives, label);
}

const wrongRun = new Endgame1Director();
wrongRun.reset({ runId: 'wrong-run', mapId: 'hospital_wing', difficulty: 1.85, gameMode: 'survival', profile, now });
assert.equal(wrongRun.replaceSnapshot(hostSnapshot, now + 300), false);

const pvp = new Endgame1Director();
const pvpSnapshot = pvp.reset({
  runId: 'endgame-pvp-run',
  mapId: 'hospital_wing',
  difficulty: 2,
  gameMode: 'pvp-team-elimination',
  profile,
  now
});
assert.equal(pvpSnapshot.active, false);
assert.equal(pvpSnapshot.status, ENDGAME1_STATUS.INACTIVE);
assert.equal(pvpSnapshot.pvpExcluded, true);
assert.equal(pvp.getRevivePolicy().active, false);

console.log('ENDGAME.1 multiplayer restoration and PvP isolation tests passed');
