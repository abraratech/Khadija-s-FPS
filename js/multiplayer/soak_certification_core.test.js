import assert from 'node:assert/strict';
import {
  MULTIPLAYER_SOAK_MAX_EVENTS,
  createMultiplayerSoakState,
  recordMultiplayerSoakSample,
  evaluateMultiplayerSoakCertification,
  buildMultiplayerSoakIncidentReplay,
  setMultiplayerSoakRunState
} from './soak_certification_core.js';

function healthySample(at, overrides = {}) {
  return {
    at,
    deltaMs: 1000,
    launchStatus: 'PASS',
    releaseCandidateStatus: 'PASS',
    recoveryCertificationStatus: 'PASS',
    transportState: 'connected',
    playerCount: 2,
    runActive: true,
    faultActive: false,
    queuedPackets: 0,
    authorityEpochRegressed: false,
    disconnectedForMs: 0,
    recoveringForMs: 0,
    rttMs: 45,
    jitterMs: 8,
    lossPct: 0.5,
    ...overrides
  };
}

function runSamples(count, overrideFactory = () => ({})) {
  let state = createMultiplayerSoakState({ targetMs: count * 1000, startedAt: 0, running: true });
  for (let index = 1; index <= count; index += 1) {
    state = recordMultiplayerSoakSample(state, healthySample(index * 1000, overrideFactory(index)));
  }
  state = setMultiplayerSoakRunState(state, { running: false, complete: true, at: count * 1000, reason: 'test-complete' });
  return state;
}

{
  const state = runSamples(30);
  const result = evaluateMultiplayerSoakCertification(state, { final: true });
  assert.equal(result.status, 'PASS');
  assert.equal(result.complete, true);
  assert.equal(result.sampleCount, 30);
}

{
  const state = runSamples(30, () => ({ jitterMs: 140, lossPct: 12 }));
  const result = evaluateMultiplayerSoakCertification(state, { final: true });
  assert.equal(result.status, 'WARN');
  assert.ok(result.warnings.some((entry) => entry.code === 'JITTER_HIGH'));
  assert.ok(result.warnings.some((entry) => entry.code === 'PACKET_LOSS_HIGH'));
}

{
  const state = runSamples(30, (index) => index === 12 ? { authorityEpochRegressed: true } : {});
  const result = evaluateMultiplayerSoakCertification(state, { final: true });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.errors.some((entry) => entry.code === 'AUTHORITY_EPOCH_REGRESSION'));
}

{
  const state = runSamples(30, (index) => index === 15 ? { disconnectedForMs: 13000, transportState: 'disconnected' } : {});
  const result = evaluateMultiplayerSoakCertification(state, { final: true });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.errors.some((entry) => entry.code === 'DISCONNECT_STALLED'));
}

{
  let state = createMultiplayerSoakState({ targetMs: 120000, startedAt: 0, running: true });
  for (let index = 1; index <= 30; index += 1) state = recordMultiplayerSoakSample(state, healthySample(index * 1000));
  state = setMultiplayerSoakRunState(state, { running: false, complete: true, at: 30000, reason: 'manual-finalize' });
  const result = evaluateMultiplayerSoakCertification(state, { final: true });
  assert.notEqual(result.status, 'PASS');
  assert.ok(result.warnings.some((entry) => entry.code === 'TARGET_NOT_REACHED'));
}

{
  let state = createMultiplayerSoakState({ targetMs: 30000, startedAt: 0, running: true });
  for (let index = 1; index <= MULTIPLAYER_SOAK_MAX_EVENTS + 40; index += 1) {
    state = recordMultiplayerSoakSample(state, healthySample(index * 1000, {
      launchStatus: index % 2 === 0 ? 'PASS' : 'WARN',
      transportState: index % 2 === 0 ? 'connected' : 'reconnecting'
    }));
  }
  assert.ok(state.events.length <= MULTIPLAYER_SOAK_MAX_EVENTS);
  const replay = buildMultiplayerSoakIncidentReplay(state);
  assert.equal(replay.events.length, state.events.length);
  assert.equal(replay.sampleCount, MULTIPLAYER_SOAK_MAX_EVENTS + 40);
}

console.log('M3.35-M3.36 soak certification core tests passed.');
