// js/coop2_contract.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = {
  protocol: readFileSync(new URL('./multiplayer/protocol.js', import.meta.url), 'utf8'),
  runtime: readFileSync(new URL('./multiplayer/runtime.js', import.meta.url), 'utf8'),
  foundation: readFileSync(new URL('./multiplayer/foundation.js', import.meta.url), 'utf8'),
  revive: readFileSync(new URL('./multiplayer/revive_core.js', import.meta.url), 'utf8'),
  lobby: readFileSync(new URL('./multiplayer/lobby_ui.js', import.meta.url), 'utf8'),
  progression: readFileSync(new URL('./progression.js', import.meta.url), 'utf8'),
  css: readFileSync(new URL('../css/multiplayer.css', import.meta.url), 'utf8'),
  release: JSON.parse(readFileSync(new URL('../multiplayer-release.json', import.meta.url), 'utf8'))
};

assert.ok(files.protocol.includes("COOP2_STATE: 'coop2-state'"));
assert.ok(files.runtime.includes('REMOTE_COOP2_STATE_RECEIVED'));
assert.ok(files.runtime.includes('sendCoop2State(payload)'));
assert.ok(files.foundation.includes('new MultiplayerCoop2Manager'));
assert.ok(files.foundation.includes('coop2Manager?.publishSnapshot'));
assert.ok(files.foundation.includes('getMultiplayerCoop2Snapshot'));
assert.ok(files.foundation.includes('getPingLifetimeMultiplier'));
assert.ok(files.revive.includes('reviveProtectionEndsAt'));
assert.ok(files.revive.includes("case 'FIELD_MEDIC'"));
assert.ok(files.lobby.includes('id="ka-coop2-role"'));
assert.ok(files.lobby.includes('ka:coop2-role-selected'));
assert.ok(files.progression.includes('recordProgressionCoopContract'));
assert.ok(files.progression.includes("dispatchCoop2Action('WAVE_CLEAR'"));
assert.ok(files.css.includes('#ka-coop2-hud'));
assert.equal(files.release.patch, 'final2-r1-full-product-certification');
assert.equal(files.release.cooperative.patch, 'coop2-r1-roles-shared-contracts-teamplay');
assert.equal(files.release.cooperative.roles.length, 4);
assert.equal(files.release.cooperative.sharedContracts, true);
assert.equal(files.release.cooperative.clientActionAmountBoundedToOne, true);
assert.equal(files.release.cooperative.cohesionTiers.rallyAt, 75);
assert.equal(files.release.cooperative.voiceChat, false);
assert.equal(files.release.cooperative.textChat, true);

console.log('COOP.2 integration contract tests passed');
