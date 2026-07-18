import assert from 'node:assert/strict';
import { MultiplayerEconomyManager } from './economy.js';

function eventBus() {
  return { on: () => () => {}, emit: () => {} };
}

const hostSentResults = [];
const hostRuntime = {
  localPlayerId: 'host',
  authorityEpoch: 0,
  room: {
    hostPlayerId: 'host',
    getSnapshot: () => ({
      status: 'in-run',
      players: [
        { playerId: 'host', lateJoin: false },
        { playerId: 'ally', lateJoin: false }
      ]
    })
  },
  sampleRemotePlayer: () => ({
    state: {
      position: { x: 0, y: 0, z: 0 },
      health: 25,
      maxHealth: 100,
      allAmmoEmpty: false,
      cheapestAmmoCost: 425,
      currentWave: 2
    }
  }),
  sendEconomyResult: (result) => { hostSentResults.push(result); return true; },
  sendEconomySnapshot: () => true
};
const host = new MultiplayerEconomyManager({
  eventBus: eventBus(),
  runtime: hostRuntime,
  session: { mode: 'host', run: { active: true, runId: 'run-1' } },
  player: { score: 1000, kills: 0 },
  adapter: {
    prepareMultiplayerWorld: () => {},
    getLocalPurchaseState: () => ({ position: { x: 0, y: 0, z: 0 } }),
    validateMultiplayerInteraction: (request) => request.kind === 'health'
      ? { ok: true, cost: 250, grant: { type: 'health' } }
      : { ok: false },
    commitMultiplayerInteraction: (_request, validation) => ({
      ok: true,
      grant: validation.grant
    }),
    commitAuthorityResourceGrant: () => ({
      ok: true,
      state: { health: 100, maxHealth: 100, lifeState: 'ACTIVE' }
    }),
    buildMultiplayerWorldState: () => ({})
  }
});
host.beginRun();
host.initializeWorld();
host.ensureAccount('ally').score = 1000;
const requestEnvelope = {
  playerId: 'ally',
  runId: 'run-1',
  payload: {
    requestId: 'heal-transaction-1',
    kind: 'health',
    actor: { position: { x: 0, y: 0, z: 0 }, health: 25, maxHealth: 100 }
  }
};
host.processAuthorityRequest(requestEnvelope);
assert.equal(host.ensureAccount('ally').score, 750);
assert.equal(hostSentResults.length, 1);
assert.equal(hostSentResults[0].authoritativeState.health, 100);
assert.equal(host.getTransactionSnapshot().length, 1);

host.processAuthorityRequest(requestEnvelope);
assert.equal(host.ensureAccount('ally').score, 750, 'duplicate request must not charge twice');
assert.equal(hostSentResults.length, 2, 'duplicate request must replay cached result');

let applied = 0;
const ackPayloads = [];
const clientPlayer = { score: 0, kills: 0 };
const client = new MultiplayerEconomyManager({
  eventBus: eventBus(),
  runtime: {
    localPlayerId: 'ally',
    authorityEpoch: 0,
    room: { hostPlayerId: 'host', getSnapshot: () => ({ players: [] }) },
    sendEconomyRequest: (payload) => { ackPayloads.push(payload); return true; },
    sendStateResyncRequest: () => true
  },
  session: { mode: 'client', hostPlayerId: 'host', run: { active: true, runId: 'run-1' } },
  player: clientPlayer,
  adapter: {
    prepareMultiplayerWorld: () => {},
    applyLocalEconomyState: () => {},
    applyMultiplayerInteractionResult: () => { applied += 1; },
    applyMultiplayerWorldState: () => {},
    applyMultiplayerProfile: () => {}
  }
});
client.beginRun();
client.initializeWorld();
const snapshot = {
  version: 2,
  players: [{ playerId: 'ally', score: 750, kills: 0, profile: {} }],
  transactionResults: [hostSentResults[0]],
  world: {}
};
client.handleRemoteSnapshot({ playerId: 'host', runId: 'run-1', payload: snapshot });
client.handleRemoteSnapshot({ playerId: 'host', runId: 'run-1', payload: snapshot });
assert.equal(clientPlayer.score, 750);
assert.equal(applied, 1, 'transaction grant must be idempotent across snapshot replay');
assert.ok(ackPayloads.some((entry) => entry.kind === 'transaction-ack'));


const failingResults = [];
const failingHost = new MultiplayerEconomyManager({
  eventBus: eventBus(),
  runtime: {
    ...hostRuntime,
    sendEconomyResult: (result) => { failingResults.push(result); return true; }
  },
  session: { mode: 'host', run: { active: true, runId: 'run-fail' } },
  player: { score: 1000, kills: 0 },
  adapter: {
    prepareMultiplayerWorld: () => {},
    getLocalPurchaseState: () => ({ position: { x: 0, y: 0, z: 0 } }),
    validateMultiplayerInteraction: () => ({
      ok: true,
      cost: 250,
      grant: { type: 'health' }
    }),
    commitMultiplayerInteraction: (_request, validation) => ({
      ok: true,
      grant: validation.grant
    }),
    commitAuthorityResourceGrant: () => ({
      ok: false,
      reason: 'HEALTH AUTHORITY UNAVAILABLE'
    }),
    buildMultiplayerWorldState: () => ({})
  }
});
failingHost.beginRun();
failingHost.initializeWorld();
failingHost.ensureAccount('ally').score = 1000;
failingHost.processAuthorityRequest({
  playerId: 'ally',
  runId: 'run-fail',
  payload: {
    requestId: 'heal-transaction-fail',
    kind: 'health',
    actor: { position: { x: 0, y: 0, z: 0 }, health: 25, maxHealth: 100 }
  }
});
assert.equal(
  failingHost.ensureAccount('ally').score,
  1000,
  'failed health authority commit must not deduct points'
);
assert.equal(failingResults.at(-1)?.accepted, false);

console.log('MPNET.1 economy transaction reconciliation tests passed');
