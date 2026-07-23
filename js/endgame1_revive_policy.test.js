import assert from 'node:assert/strict';
import { ENDGAME1_PATCH } from './endgame1_core.js';
import {
  MULTIPLAYER_LIFE_STATES,
  ReviveAuthority,
  normalizeEndgame1RevivePolicy
} from './multiplayer/revive_core.js';

const apexPolicy = normalizeEndgame1RevivePolicy({
  patch: ENDGAME1_PATCH,
  active: true,
  tierId: 'APEX',
  maxTeamRevives: 1,
  bleedoutScale: 0.70,
  reviveHoldScale: 1.22,
  allowWaveRespawn: false,
  checkpointPolicy: 'EXTRACTION_ONLY'
});
assert.equal(apexPolicy.active, true);
assert.equal(apexPolicy.maxTeamRevives, 1);
assert.equal(apexPolicy.allowWaveRespawn, false);

const core = new ReviveAuthority({ bleedoutMs: 30_000, reviveHoldMs: 1_000 });
core.reset({ runId: 'endgame-revive-run', wave: 1, endgame1Policy: apexPolicy });
core.ensurePlayer('reviver', { position: { x: 0, y: 0, z: 0 }, roleId: 'VANGUARD', health: 100 });
core.ensurePlayer('target-a', { position: { x: 1, y: 0, z: 0 }, health: 100, maxHealth: 100 });
core.ensurePlayer('target-b', { position: { x: 1.5, y: 0, z: 0 }, health: 100, maxHealth: 100 });
core.downPlayer('target-a', { now: 100, wave: 1 });
assert.equal(core.players.get('target-a').bleedoutEndsAt, 21_100);
assert.equal(core.players.get('target-a').reviveRequiredMs, 1_220);

let now = 100;
while (core.players.get('target-a').lifeState === MULTIPLAYER_LIFE_STATES.DOWNED && now < 4_000) {
  now += 100;
  core.setReviveHold('reviver', 'target-a', { holding: true, now, position: { x: 0, y: 0, z: 0 } });
  core.update({ now, dtMs: 100, wave: 1 });
}
assert.equal(core.players.get('target-a').lifeState, MULTIPLAYER_LIFE_STATES.ACTIVE);
assert.equal(core.getSnapshot(now).endgame1Policy.teamRevivesUsed, 1);

core.downPlayer('target-b', { now: now + 10, wave: 1 });
core.setReviveHold('reviver', 'target-b', { holding: true, now: now + 100, position: { x: 0, y: 0, z: 0 } });
core.update({ now: now + 100, dtMs: 100, wave: 1 });
assert.equal(core.players.get('target-b').reviveProgressMs, 0);
assert.equal(core.consumeEvents().some((entry) => entry.type === 'REVIVE_LIMIT_REACHED'), true);

core.players.get('target-b').lifeState = MULTIPLAYER_LIFE_STATES.SPECTATING;
core.players.get('target-b').eliminatedWave = 1;
core.update({ now: now + 1_000, dtMs: 100, wave: 2 });
assert.equal(core.players.get('target-b').lifeState, MULTIPLAYER_LIFE_STATES.SPECTATING);

const snapshot = core.getSnapshot(now + 1_000);
const restored = new ReviveAuthority();
assert.equal(restored.replaceSnapshot(snapshot), true);
assert.equal(restored.getSnapshot().endgame1Policy.teamRevivesUsed, 1);
assert.equal(restored.getSnapshot().endgame1Policy.allowWaveRespawn, false);

const standard = new ReviveAuthority({ reviveHoldMs: 1_000 });
standard.reset({ runId: 'standard-run', wave: 1 });
standard.ensurePlayer('a', { position: { x: 0, y: 0, z: 0 } });
standard.ensurePlayer('b', { position: { x: 1, y: 0, z: 0 } });
standard.downPlayer('b', { now: 0, wave: 1 });
standard.players.get('b').lifeState = MULTIPLAYER_LIFE_STATES.SPECTATING;
standard.players.get('b').eliminatedWave = 1;
standard.update({ now: 1_000, dtMs: 100, wave: 2 });
assert.equal(standard.players.get('b').lifeState, MULTIPLAYER_LIFE_STATES.ACTIVE);

console.log('ENDGAME.1 revive policy tests passed');
