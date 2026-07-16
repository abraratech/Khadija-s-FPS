// js/prog2_secure_progression_contract.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const progression = readFileSync(new URL('./progression.js', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('./cloud_profile.js', import.meta.url), 'utf8');
const hub = readFileSync(new URL('../multiplayer-server/src/cloud_profile_hub.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../multiplayer-server/src/index.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../multiplayer-server/package.json', import.meta.url), 'utf8'));

assert.match(progression, /ka:progression-run-finalized/);
assert.match(progression, /dispatchProgressionRunFinalized/);
assert.match(cloud, /\/profiles\/progression\/commit/);
assert.match(cloud, /applyAuthoritativeRemoteProgression/);
assert.match(cloud, /PROGRESSION_RECEIPT_QUEUE_KEY/);
assert.match(hub, /async commitProgression\(request, rateKey\)/);
assert.match(hub, /progressionProtected = auth\.meta\.accountType === 'passkey'/);
assert.match(hub, /progression: remote\.progression/);
assert.match(hub, /applyAuthoritativeProgressionReceipt/);
assert.match(worker, /\/profiles\/progression\/commit/);
assert.match(worker, /productionHardening: PRODUCTION_HARDENING/);
assert.match(worker, /progressionReceipts: 'server-validated-idempotent'/);
assert.doesNotMatch(worker, /voice-signal|voice-ice-config/);
assert.doesNotMatch(packageJson.scripts.check, /voice_(?:signal|turn)_core/);
assert.match(packageJson.scripts.check, /progression_authority_core/);

console.log('PROG.2 secure progression contract tests passed');
