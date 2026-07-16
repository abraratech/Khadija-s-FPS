// FINAL.2 Worker release certification contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const patch = 'final2-r1-full-product-certification';
const seal = 'dbc459802c5b38e71870ea70016f6200a523bb96148a74f29b1b594f1257b26e';

assert.match(source, new RegExp(`const SERVER_PATCH = '${patch}'`));
assert.match(source, new RegExp(`const SERVER_BUILD = 'final2-consolidated-production-r1'`));
assert.match(source, new RegExp(`const CERTIFIED_SOURCE_SEAL = '${seal}'`));
assert.match(source, /fullProductCertification: FINAL2_SERVER_INFO/);
assert.match(source, /operations: OPS1_SERVER_INFO/);
assert.match(source, /live: LIVE1_SERVER_INFO/);
assert.match(source, /content: CONTENT1_SERVER_INFO/);
assert.match(packageJson.scripts.check, /final2_contract\.test\.js/);
assert.doesNotMatch(source, /voice_signal_core|voice_turn_core/);
console.log('FINAL.2 Worker certification contract: PASS');
