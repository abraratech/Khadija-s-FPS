// js/multiplayer/coop2_core.test.js
import assert from 'node:assert/strict';
import {
  COOP2_PATCH,
  COOP2_SCHEMA,
  COOP2_ROLES,
  COOP2_CONTRACTS,
  Coop2Authority,
  chooseComplementaryBotRole,
  getCoop2CohesionPolicy,
  getCoop2RevivePolicy,
  normalizeCoop2Role,
  selectCoop2Contract
} from './coop2_core.js';

assert.equal(COOP2_PATCH, 'coop2-r1-roles-shared-contracts-teamplay');
assert.equal(COOP2_SCHEMA, 1);
assert.equal(Object.keys(COOP2_ROLES).length, 4);
assert.equal(COOP2_CONTRACTS.length, 4);
assert.equal(normalizeCoop2Role('field_medic'), 'FIELD_MEDIC');
assert.equal(normalizeCoop2Role('invalid'), 'VANGUARD');
assert.equal(chooseComplementaryBotRole(['VANGUARD']), 'FIELD_MEDIC');
assert.equal(
  chooseComplementaryBotRole(['VANGUARD', 'FIELD_MEDIC', 'SUPPORT']),
  'RECON'
);
assert.ok(getCoop2RevivePolicy('FIELD_MEDIC').holdMultiplier < 1);
assert.ok(getCoop2RevivePolicy('FIELD_MEDIC').healthRatio > 0.4);
assert.equal(getCoop2CohesionPolicy(10).tier, 'FORMING');
assert.equal(getCoop2CohesionPolicy(50).tier, 'STEADY');
assert.ok(getCoop2CohesionPolicy(80).reviveProtectionBonusMs > 0);
assert.equal(
  selectCoop2Contract({ runId: 'same', mapId: 'grid_bunker' }).id,
  selectCoop2Contract({ runId: 'same', mapId: 'grid_bunker' }).id
);


const bounded = new Coop2Authority();
bounded.reset({ runId: 'bounded-run', mapId: 'grid_bunker', now: 0 });
bounded.contract = {
  ...bounded.contract,
  id: 'JOINT_SUPPRESSION',
  kind: 'KILL',
  target: 30,
  progress: 0,
  completed: false,
  contributors: {}
};
bounded.recordAction({
  actorId: 'client',
  kind: 'KILL',
  amount: 999,
  eventId: 'inflated-action',
  at: 1
});
assert.equal(bounded.getSnapshot(2).contract.progress, 1);

const authority = new Coop2Authority();
authority.reset({
  runId: 'run-coop2',
  mapId: 'grid_bunker',
  difficulty: 1,
  now: 100
});
authority.assignRole('host', 'VANGUARD', {
  displayName: 'Host',
  now: 100
});
authority.assignRole('client', 'FIELD_MEDIC', {
  displayName: 'Client',
  now: 100
});
authority.ensureComplementaryBot('bot-wingmate-r1', { now: 100 });
const initial = authority.getSnapshot(100);
assert.equal(initial.players.length, 3);
assert.equal(
  initial.players.find((entry) => entry.playerId === 'bot-wingmate-r1').isBot,
  true
);

const contractKind = initial.contract.kind;
let actionKind = contractKind;
if (contractKind === 'TEAM_OBJECTIVE') actionKind = 'OBJECTIVE';
for (let index = 0; index < initial.contract.target; index += 1) {
  authority.recordAction({
    actorId: index % 2 ? 'client' : 'host',
    kind: actionKind,
    amount: 1,
    eventId: `event-${index}`,
    at: 200 + index
  });
}
const completed = authority.getSnapshot(500);
assert.equal(completed.contract.completed, true);
assert.equal(completed.contract.progress, completed.contract.target);
assert.ok(completed.contract.completionId.includes('run-coop2'));
assert.ok(completed.cohesion > 0);
assert.equal(
  authority.recordAction({
    actorId: 'host',
    kind: actionKind,
    eventId: 'event-0',
    at: 999
  }),
  false
);
assert.equal(
  authority.consumeEvents().some((event) => event.type === 'CONTRACT_COMPLETED'),
  true
);
const cohesionBeforePostContractAction = authority.getSnapshot(500).cohesion;
assert.equal(authority.recordAction({
  actorId: 'host',
  kind: 'TACTICAL_PING',
  eventId: 'post-contract-ping',
  at: 501
}), true);
assert.ok(authority.getSnapshot(502).cohesion > cohesionBeforePostContractAction);

const restored = new Coop2Authority();
assert.equal(restored.replaceSnapshot(completed), true);
assert.deepEqual(restored.getSnapshot(600).contract, completed.contract);
assert.equal(restored.getSnapshot(600).players.length, 3);

console.log('coop2_core tests passed');
