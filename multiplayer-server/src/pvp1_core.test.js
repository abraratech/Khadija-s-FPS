// PVP.1 R1 server authority core tests.
import assert from 'node:assert/strict';
import {
  PVP1_MODE,
  PVP1_PATCH,
  assignPvp1Teams,
  createPvp1MatchState,
  normalizePvp1Mode,
  pvp1ForfeitTeam,
  resolvePvp1Shot
} from './pvp1_core.js';

assert.equal(PVP1_PATCH, 'pvp1-r1-isolated-team-elimination-foundation');
assert.equal(normalizePvp1Mode(PVP1_MODE), PVP1_MODE);
assert.equal(normalizePvp1Mode('anything-else'), 'coop');

const players = [
  { playerId: 'p3', joinedAt: 30 },
  { playerId: 'p1', joinedAt: 10 },
  { playerId: 'p4', joinedAt: 40 },
  { playerId: 'p2', joinedAt: 20 },
  { playerId: 'ignored', joinedAt: 50 }
];
const teams = assignPvp1Teams(players);
assert.deepEqual(teams.p1, { team: 'ALPHA', slot: 0 });
assert.deepEqual(teams.p2, { team: 'BRAVO', slot: 0 });
assert.deepEqual(teams.p3, { team: 'ALPHA', slot: 1 });
assert.deepEqual(teams.p4, { team: 'BRAVO', slot: 1 });
assert.equal(teams.ignored, undefined);

let state = createPvp1MatchState({
  runId: 'run-pvp',
  players: [
    { playerId: 'alpha', joinedAt: 1 },
    { playerId: 'bravo', joinedAt: 2 }
  ],
  now: 1000
});
assert.equal(state.mode, PVP1_MODE);
assert.equal(state.phase, 'COUNTDOWN');
assert.equal(state.players.alpha.team, 'ALPHA');
assert.equal(state.players.bravo.team, 'BRAVO');

let result = resolvePvp1Shot({
  state,
  shooterId: 'alpha',
  targetId: 'bravo',
  weaponFamily: 'SNIPER',
  shotId: 'early',
  headshot: true,
  distance: 20,
  now: 2000
});
assert.equal(result.accepted, false);
assert.equal(result.reason, 'ROUND_COUNTDOWN');

result = resolvePvp1Shot({
  state,
  shooterId: 'alpha',
  targetId: 'alpha',
  weaponFamily: 'RIFLE',
  shotId: 'friendly',
  distance: 10,
  now: 4000
});
assert.equal(result.accepted, false);
assert.equal(result.reason, 'FRIENDLY_FIRE_BLOCKED');

for (let win = 0; win < 3; win += 1) {
  const at = state.roundStartsAt + 1;
  result = resolvePvp1Shot({
    state,
    shooterId: 'alpha',
    targetId: 'bravo',
    weaponFamily: 'SNIPER',
    shotId: `kill-${win}`,
    headshot: true,
    distance: 20,
    now: at
  });
  assert.equal(result.accepted, true);
  assert.equal(result.event.eliminated, true);
  state = result.state;
}
assert.equal(state.phase, 'COMPLETE');
assert.equal(state.winnerTeam, 'ALPHA');
assert.equal(state.teams.ALPHA.roundWins, 3);
assert.equal(result.event.matchEnded, true);

const duplicate = resolvePvp1Shot({
  state,
  shooterId: 'alpha',
  targetId: 'bravo',
  weaponFamily: 'PISTOL',
  shotId: 'kill-2',
  distance: 5,
  now: state.updatedAt + 500
});
assert.equal(duplicate.accepted, false);
assert.equal(duplicate.reason, 'MATCH_COMPLETE');

const forfeitState = createPvp1MatchState({
  runId: 'run-forfeit',
  players: [
    { playerId: 'alpha', joinedAt: 1 },
    { playerId: 'bravo', joinedAt: 2 }
  ],
  now: 0
});
const forfeit = pvp1ForfeitTeam(forfeitState, 'alpha', {
  now: 9000,
  reason: 'disconnect-expired'
});
assert.equal(forfeit.changed, true);
assert.equal(forfeit.state.phase, 'COMPLETE');
assert.equal(forfeit.state.winnerTeam, 'BRAVO');
assert.equal(forfeit.event.forfeitingPlayerId, 'alpha');

console.log('PVP.1 server authority core tests passed');
