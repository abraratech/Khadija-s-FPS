// js/multiplayer/coop2_revive_policy.test.js
import assert from 'node:assert/strict';
import { ReviveAuthority } from './revive_core.js';

function runRevive(roleId) {
  const core = new ReviveAuthority();
  core.reset({ runId: `run-${roleId}`, wave: 1 });
  core.ensurePlayer('reviver', {
    roleId,
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    now: 0
  });
  core.ensurePlayer('target', {
    roleId: 'VANGUARD',
    position: { x: 1, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    now: 0
  });
  core.downPlayer('target', { now: 0, wave: 1 });
  let now = 0;
  while (core.players.get('target').lifeState === 'DOWNED' && now < 5000) {
    now += 100;
    core.setReviveHold('reviver', 'target', {
      holding: true,
      position: { x: 0, y: 0, z: 0 },
      now
    });
    core.update({ now, dtMs: 100, wave: 1 });
  }
  return {
    now,
    target: core.players.get('target'),
    events: core.consumeEvents()
  };
}

const medic = runRevive('FIELD_MEDIC');
const vanguard = runRevive('VANGUARD');

assert.ok(medic.now < vanguard.now);
assert.equal(medic.target.lifeState, 'ACTIVE');
assert.equal(vanguard.target.lifeState, 'ACTIVE');
assert.ok(medic.target.health > vanguard.target.health);
assert.ok(
  medic.target.reviveProtectionEndsAt - medic.now
  > vanguard.target.reviveProtectionEndsAt - vanguard.now
);
assert.equal(
  medic.events.some((event) => event.type === 'REVIVED'),
  true
);

// Brief interruption should preserve progress; a long interruption should reset.
const grace = new ReviveAuthority({ reviveProgressGraceMs: 650 });
grace.reset({ runId: 'run-grace', wave: 1 });
grace.ensurePlayer('a', { roleId: 'VANGUARD', position: { x: 0, y: 0, z: 0 } });
grace.ensurePlayer('b', { position: { x: 1, y: 0, z: 0 } });
grace.downPlayer('b', { now: 0 });
grace.setReviveHold('a', 'b', { position: { x: 0, y: 0, z: 0 }, now: 100 });
grace.update({ now: 100, dtMs: 100 });
const partial = grace.players.get('b').reviveProgressMs;
grace.setReviveHold('a', null, { holding: false, now: 150 });
grace.update({ now: 500, dtMs: 100 });
assert.equal(grace.players.get('b').reviveProgressMs, partial);
grace.update({ now: 900, dtMs: 100 });
assert.equal(grace.players.get('b').reviveProgressMs, 0);


// High team cohesion grants a bounded temporary revive recovery bonus.
const rally = new ReviveAuthority();
rally.setCoop2Cohesion(80);
rally.reset({ runId: 'run-rally', wave: 1 });
rally.ensurePlayer('reviver', {
  roleId: 'VANGUARD',
  position: { x: 0, y: 0, z: 0 },
  health: 100,
  now: 0
});
rally.ensurePlayer('target', {
  position: { x: 1, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  now: 0
});
rally.downPlayer('target', { now: 0 });
let rallyNow = 0;
while (rally.players.get('target').lifeState === 'DOWNED' && rallyNow < 5000) {
  rallyNow += 100;
  rally.setReviveHold('reviver', 'target', {
    holding: true,
    position: { x: 0, y: 0, z: 0 },
    now: rallyNow
  });
  rally.update({ now: rallyNow, dtMs: 100 });
}
assert.ok(
  rally.players.get('target').reviveProtectionEndsAt - rallyNow
  > vanguard.target.reviveProtectionEndsAt - vanguard.now
);
assert.equal(rally.getSnapshot(rallyNow).coop2Cohesion, 80);

console.log('COOP.2 revive policy tests passed');
