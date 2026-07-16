import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(
  new URL('./index.js', import.meta.url),
  'utf8'
);
const progressionSource = readFileSync(
  new URL('./progression_authority_core.js', import.meta.url),
  'utf8'
);

assert.ok(indexSource.includes("envelope.type === 'content1-state'"));
assert.ok(indexSource.includes(
  "Only the current host can publish CONTENT.1 snapshots."
));
assert.ok(indexSource.includes('checkpoint.content1'));
assert.ok(progressionSource.includes(
  'contentOperationsCompleted: boundedReceiptInteger'
));
assert.ok(progressionSource.includes(
  'receipt.contentOperationsCompleted * 160'
));
assert.ok(progressionSource.includes(
  'profile.contentOperationsCompleted'
));

console.log('content1 Worker contract tests passed');
