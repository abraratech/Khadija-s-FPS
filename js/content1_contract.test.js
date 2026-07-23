import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const release = JSON.parse(readFileSync('multiplayer-release.json', 'utf8'));
const main = readFileSync('js/main.js', 'utf8');
const enemy = readFileSync('js/enemy.js', 'utf8');
const foundation = readFileSync('js/multiplayer/foundation.js', 'utf8');
const protocol = readFileSync('js/multiplayer/protocol.js', 'utf8');
const runtime = readFileSync('js/multiplayer/runtime.js', 'utf8');
const contentRuntime = readFileSync('js/content1.js', 'utf8');
const contentCore = readFileSync('js/content1_core.js', 'utf8');
const progression = readFileSync('js/progression.js', 'utf8');
const progressionCore = readFileSync('js/progression_core.js', 'utf8');
const server = readFileSync('multiplayer-server/src/index.js', 'utf8');
const serverProgression = readFileSync(
  'multiplayer-server/src/progression_authority_core.js',
  'utf8'
);
const builder = readFileSync('scripts/build_production.py', 'utf8');
const hud = readFileSync('css/hud.css', 'utf8');

assert.equal(
  release.patch,
  'final2-r1-full-product-certification'
);
assert.equal(
  release.content?.patch,
  'content1-r1-objective-operations-encounter-variety'
);
assert.equal(release.content?.schema, 1);
assert.equal(release.content?.arenaCount, 7);
assert.equal(release.content?.survivalModePreserved, true);
assert.equal(release.content?.crawlerScalePreserved, true);

for (const token of [
  'BUNKER_LOCKDOWN',
  'YARD_RECOVERY',
  'NEON_BLACKOUT',
  'GARAGE_HOLD',
  'TRIAGE_RECOVERY',
  'REACTOR_PURGE',
  'ELITE_HUNT',
  'CONTENT1_MAX_ACTION_AMOUNT'
]) {
  assert.ok(contentCore.includes(token), token);
}

for (const token of [
  'KAGetContent1EncounterDirective',
  'KAContent1EnemySpawned',
  'KAContent1EnemyKilled',
  'recordProgressionContentOperation',
  'handleHostMigration'
]) {
  assert.ok(contentRuntime.includes(token), token);
}

for (const token of [
  'applyContent1SpawnPressure',
  'KAContent1WaveStarted',
  'KAContent1WaveCleared',
  'isContent1Elite'
]) {
  assert.ok(enemy.includes(token), token);
}

assert.ok(foundation.includes('Content1Manager'));
assert.ok(foundation.includes('content1Manager?.publishSnapshot?.(true)'));
assert.ok(protocol.includes("CONTENT1_STATE: 'content1-state'"));
assert.ok(runtime.includes('REMOTE_CONTENT1_STATE_RECEIVED'));
assert.ok(runtime.includes('sendContent1State(payload)'));
assert.ok(server.includes("envelope.type === 'content1-state'"));
assert.ok(server.includes('checkpoint.content1'));
assert.ok(progression.includes('recordProgressionContentOperation'));
assert.ok(progression.includes('contentOperationsCompleted'));
assert.ok(progressionCore.includes('contentOperationsCompleted'));
assert.ok(serverProgression.includes('contentOperationsCompleted * 160'));
assert.ok(builder.includes(
  'final2-r1-full-product-certification'
));
assert.ok(hud.includes('.ka-content1-hud'));
assert.equal(main.includes('CO-OP ALPHA'), false);

console.log('content1 contract tests passed');
