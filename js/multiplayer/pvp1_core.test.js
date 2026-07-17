// PVP.1 R1 client policy tests.
import assert from 'node:assert/strict';
import {
  PVP1_CERTIFIED_FRONTEND_BASELINE_SHA,
  PVP1_MODE,
  PVP1_PATCH,
  PVP1_PRODUCT_VERSION,
  PVP1_SOURCE_BASELINE_SHA,
  classifyPvp1StateUpdate,
  derivePvp1Presentation,
  isPvp1Mode,
  normalizePvp1Mode,
  normalizePvp1State,
  opposingPvp1Team,
  pvp1PrivateRoomPolicy,
  roomUsesPvp1,
  selectPvp1SpawnIndex,
  shouldPresentPvp1Summary
} from './pvp1_core.js';

assert.equal(PVP1_PATCH, 'pvp1-r1-isolated-team-elimination-foundation');
assert.equal(PVP1_PRODUCT_VERSION, '1.1.0-pvp1');
assert.equal(PVP1_SOURCE_BASELINE_SHA, 'ddbdc3a4b478aa26a515e2dd8dbfc9449885c466');
assert.equal(PVP1_CERTIFIED_FRONTEND_BASELINE_SHA, '5511d393d7249b5487affa3616716ccb64593e99');
assert.equal(normalizePvp1Mode('PVP-TEAM-ELIMINATION'), PVP1_MODE);
assert.equal(normalizePvp1Mode('coop'), 'coop');
assert.equal(isPvp1Mode(PVP1_MODE), true);
assert.equal(isPvp1Mode('coop'), false);
assert.equal(roomUsesPvp1({ settings: { gameMode: PVP1_MODE } }), true);
assert.equal(roomUsesPvp1({ settings: { gameMode: 'coop' } }), false);
assert.equal(opposingPvp1Team('ALPHA'), 'BRAVO');
assert.equal(opposingPvp1Team('BRAVO'), 'ALPHA');
assert.equal(opposingPvp1Team('unknown'), null);

assert.deepEqual(pvp1PrivateRoomPolicy('coop'), {
  gameMode: 'coop',
  maxPlayers: 4,
  allowLateJoin: true,
  publicListing: false,
  botsAllowed: true
});
assert.deepEqual(pvp1PrivateRoomPolicy(PVP1_MODE), {
  gameMode: PVP1_MODE,
  maxPlayers: 4,
  allowLateJoin: false,
  publicListing: false,
  botsAllowed: false
});

const state = normalizePvp1State({
  mode: PVP1_MODE,
  runId: 'run-pvp',
  phase: 'COUNTDOWN',
  round: 2,
  roundStartsAt: 5000,
  teams: {
    ALPHA: { roundWins: 1 },
    BRAVO: { roundWins: 0 }
  },
  players: {
    alpha: {
      playerId: 'alpha',
      team: 'ALPHA',
      health: 75,
      maxHealth: 100,
      alive: true,
      eliminations: 2,
      deaths: 1,
      damageDealt: 150,
      spawnSerial: 2
    },
    bravo: {
      playerId: 'bravo',
      team: 'BRAVO',
      health: 0,
      maxHealth: 100,
      alive: false,
      eliminations: 1,
      deaths: 2,
      damageDealt: 90,
      spawnSerial: 2
    }
  },
  revision: 8
});
assert.equal(state.mode, PVP1_MODE);
assert.equal(state.players.alpha.team, 'ALPHA');
assert.equal(state.players.bravo.alive, false);

const countdown = derivePvp1Presentation(state, 'alpha', 3500);
assert.equal(countdown.localTeam, 'ALPHA');
assert.equal(countdown.inputBlocked, true);
assert.equal(countdown.countdownSeconds, 2);
assert.equal(countdown.alphaWins, 1);

const countdownReleased = derivePvp1Presentation(state, 'alpha', 5000);
assert.equal(countdownReleased.phase, 'ACTIVE');
assert.equal(countdownReleased.inputBlocked, false);
assert.equal(countdownReleased.headline, 'ROUND 2 · FIGHT');

const spawnPoints = [
  { x: -30, z: 0 },
  { x: 30, z: 0 },
  { x: 0, z: -30 },
  { x: 0, z: 30 }
];
const alphaSpawn = selectPvp1SpawnIndex(spawnPoints, 'ALPHA', 0);
const bravoSpawn = selectPvp1SpawnIndex(spawnPoints, 'BRAVO', 0);
assert.notEqual(alphaSpawn, bravoSpawn);
assert.equal(alphaSpawn, 0);
assert.equal(bravoSpawn, 1);
assert.notEqual(
  selectPvp1SpawnIndex(spawnPoints, 'ALPHA', 1),
  selectPvp1SpawnIndex(spawnPoints, 'BRAVO', 1)
);
assert.equal(selectPvp1SpawnIndex([], 'ALPHA', 0), -1);

const active = derivePvp1Presentation({
  ...state,
  phase: 'ACTIVE'
}, 'alpha', 6000);
assert.equal(active.inputBlocked, false);
assert.equal(active.headline, 'ROUND 2 · FIGHT');

const eliminated = derivePvp1Presentation({
  ...state,
  phase: 'ACTIVE',
  players: {
    ...state.players,
    alpha: { ...state.players.alpha, alive: false, health: 0 }
  }
}, 'alpha', 6000);
assert.equal(eliminated.inputBlocked, true);

const priorCompleteState = normalizePvp1State({
  ...state,
  runId: 'run-prior',
  phase: 'COMPLETE',
  revision: 27,
  winnerTeam: 'ALPHA'
});
const freshNextState = normalizePvp1State({
  ...state,
  runId: 'run-next',
  phase: 'COUNTDOWN',
  revision: 1
});

const newRunDecision = classifyPvp1StateUpdate({
  currentState: priorCompleteState,
  incomingState: freshNextState,
  activeRunId: 'run-next'
});
assert.equal(newRunDecision.accepted, true);
assert.equal(newRunDecision.reason, 'NEW_RUN');
assert.equal(newRunDecision.runChanged, true);

const stalePriorRunDecision = classifyPvp1StateUpdate({
  currentState: freshNextState,
  incomingState: priorCompleteState,
  activeRunId: 'run-next',
  force: true
});
assert.equal(stalePriorRunDecision.accepted, false);
assert.equal(stalePriorRunDecision.reason, 'STALE_RUN');

const staleRevisionDecision = classifyPvp1StateUpdate({
  currentState: { ...freshNextState, revision: 5 },
  incomingState: { ...freshNextState, revision: 4 },
  activeRunId: 'run-next'
});
assert.equal(staleRevisionDecision.accepted, false);
assert.equal(staleRevisionDecision.reason, 'STALE_REVISION');

const forcedCurrentRunDecision = classifyPvp1StateUpdate({
  currentState: { ...freshNextState, revision: 5 },
  incomingState: { ...freshNextState, revision: 4 },
  activeRunId: 'run-next',
  force: true
});
assert.equal(forcedCurrentRunDecision.accepted, true);
assert.equal(forcedCurrentRunDecision.reason, 'CURRENT_RUN');

assert.equal(shouldPresentPvp1Summary({
  state: priorCompleteState,
  activeRunId: 'run-prior',
  lastSummaryRunId: ''
}), true);
assert.equal(shouldPresentPvp1Summary({
  state: priorCompleteState,
  activeRunId: 'run-next',
  lastSummaryRunId: ''
}), false);
assert.equal(shouldPresentPvp1Summary({
  state: priorCompleteState,
  activeRunId: 'run-prior',
  lastSummaryRunId: 'run-prior'
}), false);
assert.equal(shouldPresentPvp1Summary({
  state: priorCompleteState,
  activeRunId: '',
  lastSummaryRunId: ''
}), false);

console.log('PVP.1 client policy core tests passed');
