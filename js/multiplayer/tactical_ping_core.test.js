// js/multiplayer/tactical_ping_core.test.js

import assert from 'node:assert/strict';
import {
  TacticalPingStore,
  TACTICAL_PING_TYPES,
  validateTacticalPingPayload
} from './tactical_ping_core.js';

function ping(id, owner = 'player-a', type = TACTICAL_PING_TYPES.MOVE, createdAt = 0) {
  return {
    pingId: id,
    type,
    ownerPlayerId: owner,
    ownerName: '<Khadija>\u0000Alpha',
    position: { x: 1, y: 2, z: 3 },
    createdAt
  };
}

{
  const result = validateTacticalPingPayload(ping('norm-1'), { now: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.ping.type, TACTICAL_PING_TYPES.MOVE);
  assert.equal(result.ping.label, 'MOVE HERE');
  assert.equal(result.ping.ownerName, 'KhadijaAlpha');
  assert.deepEqual(result.ping.position, { x: 1, y: 2, z: 3 });
}

{
  const store = new TacticalPingStore();
  assert.equal(store.addPing(ping('expire-1', 'player-a', TACTICAL_PING_TYPES.ENEMY, 0), { now: 0 }).accepted, true);
  assert.equal(store.getActive(5999).length, 1);
  assert.equal(store.getActive(6001).length, 0);
}

{
  const store = new TacticalPingStore({ maxActivePerPlayer: 3 });
  for (let index = 0; index < 4; index += 1) {
    const result = store.addPing(ping(`cap-${index}`, 'player-a', TACTICAL_PING_TYPES.MOVE, index), {
      now: index,
      local: true,
      skipRateLimit: true
    });
    assert.equal(result.accepted, true);
  }
  const activeIds = store.getActive(4).map((entry) => entry.pingId);
  assert.deepEqual(activeIds, ['cap-1', 'cap-2', 'cap-3']);
}

{
  let now = 1000;
  const store = new TacticalPingStore({
    now: () => now,
    maxActivePerPlayer: 10,
    cooldownMs: 800,
    spamWindowMs: 4000,
    spamLimit: 3
  });
  assert.equal(store.addPing(ping('rate-1', 'player-a', TACTICAL_PING_TYPES.MOVE, now), { local: true }).accepted, true);
  now += 799;
  const cooldown = store.addPing(ping('rate-2', 'player-a', TACTICAL_PING_TYPES.MOVE, now), { local: true });
  assert.equal(cooldown.accepted, false);
  assert.equal(cooldown.reason, 'cooldown');
  now += 1;
  assert.equal(store.addPing(ping('rate-2', 'player-a', TACTICAL_PING_TYPES.MOVE, now), { local: true }).accepted, true);
  now += 800;
  assert.equal(store.addPing(ping('rate-3', 'player-a', TACTICAL_PING_TYPES.MOVE, now), { local: true }).accepted, true);
  now += 800;
  const spam = store.addPing(ping('rate-4', 'player-a', TACTICAL_PING_TYPES.MOVE, now), { local: true });
  assert.equal(spam.accepted, false);
  assert.equal(spam.reason, 'spam');
}

{
  assert.equal(validateTacticalPingPayload({
    pingId: 'bad-type',
    type: 'INVALID',
    ownerPlayerId: 'player-a',
    position: { x: 0, y: 0, z: 0 }
  }).ok, false);
  assert.equal(validateTacticalPingPayload({
    pingId: 'bad-pos',
    type: 'ENEMY',
    ownerPlayerId: 'player-a',
    position: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 }
  }).ok, false);
  assert.equal(validateTacticalPingPayload({
    pingId: 'bad-owner',
    type: 'MOVE',
    position: { x: 0, y: 0, z: 0 }
  }).ok, false);
}

{
  const store = new TacticalPingStore();
  assert.equal(store.addPing(ping('dupe-1'), { now: 0 }).accepted, true);
  const duplicate = store.addPing(ping('dupe-1'), { now: 1 });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, 'duplicate');
  store.prune(8000);
  const expiredDuplicate = store.addPing(ping('dupe-1'), { now: 8001 });
  assert.equal(expiredDuplicate.accepted, false);
  assert.equal(expiredDuplicate.reason, 'duplicate');
}

{
  const store = new TacticalPingStore({ maxActivePerPlayer: 3 });
  store.addPing(ping('mig-1', 'player-a', TACTICAL_PING_TYPES.ENEMY, 0), { now: 0 });
  store.addPing(ping('mig-2', 'player-a', TACTICAL_PING_TYPES.MOVE, 100), { now: 100 });
  store.addPing(ping('mig-other', 'player-b', TACTICAL_PING_TYPES.MOVE, 100), { now: 100 });
  const payloads = store.getRebroadcastPayloads('player-a', 200);
  assert.deepEqual(payloads.map((entry) => entry.pingId), ['mig-1', 'mig-2']);
  assert.equal(payloads.every((entry) => entry.rebroadcast === true), true);
  assert.equal(store.getRebroadcastPayloads('player-a', 8000).length, 0);
}

console.log('tactical_ping_core tests passed');
