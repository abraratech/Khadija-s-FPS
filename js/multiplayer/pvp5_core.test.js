import assert from 'node:assert/strict';
import {
  PVP5_PATCH,
  buildPvp5Scoreboard,
  completePvp5Round,
  createPvp5State,
  recordPvp5DamageContribution,
  registerPvp5RematchVote,
  resolvePvp5Elimination,
  selectPvp5SpectatorTarget
} from './pvp5_core.js';

const state = {
  phase: 'ACTIVE',
  mapId: 'crossfire_terminal',
  pvp5: createPvp5State({ mapId: 'crossfire_terminal', now: 1 }),
  players: {
    a1: { playerId: 'a1', team: 'ALPHA', slot: 0, alive: true, assists: 0 },
    b1: { playerId: 'b1', team: 'BRAVO', slot: 0, alive: true, assists: 0 },
    a2: { playerId: 'a2', team: 'ALPHA', slot: 1, alive: true, assists: 0 },
    b2: { playerId: 'b2', team: 'BRAVO', slot: 1, alive: true, assists: 0 }
  }
};
assert.equal(state.pvp5.patch, PVP5_PATCH);
recordPvp5DamageContribution(state, { shooterId: 'a2', targetId: 'b1', damage: 15, now: 100 });
state.players.b1.alive = false;
const result = resolvePvp5Elimination(state, { killerId: 'a1', targetId: 'b1', now: 200 });
assert.deepEqual(result.assistPlayerIds, ['a2']);
assert.equal(result.spectatorTargetId, 'b2');
assert.equal(selectPvp5SpectatorTarget(state, { playerId: 'b1' }), 'b2');
completePvp5Round(state, { now: 300 });
state.phase = 'COMPLETE';
let vote;
for (const playerId of ['a1', 'b1', 'a2', 'b2']) {
  vote = registerPvp5RematchVote(state, {
    playerId, mapId: 'foundry_ring', connectedPlayerIds: ['a1','b1','a2','b2'], now: 400
  });
}
assert.equal(vote.ready, true);
assert.equal(vote.selectedMapId, 'foundry_ring');
assert.equal(buildPvp5Scoreboard(state).length, 4);
console.log('PVP.5 R1 frontend match completion core tests passed');
