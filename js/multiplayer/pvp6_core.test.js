import assert from 'node:assert/strict';
import {
  PVP6_BASELINE_WORKER_VERSION_ID,
  PVP6_CERTIFICATION_MATRIX,
  PVP6_CERTIFICATION_STATUS,
  PVP6_FRONTEND_BASELINE_SHA,
  PVP6_LIVE_CERTIFICATION_STATUS,
  PVP6_OPERATIONAL_FEATURE_FLAGS,
  PVP6_PATCH,
  PVP6_PRODUCT_VERSION,
  PVP6_RELEASE_SEQUENCE,
  PVP6_SCHEMA,
  PVP6_WORKER_BASELINE_SHA,
  createPvp6SealDescriptor,
  evaluatePvp6SealPair,
  normalizePvp6VersionMetadata
} from './pvp6_core.js';

assert.equal(PVP6_SCHEMA, 1);
assert.equal(PVP6_PATCH, 'pvp6-r1-final-pvp-certification-candidate');
assert.equal(PVP6_PRODUCT_VERSION, '1.1.0-pvp6-rc1');
assert.equal(PVP6_RELEASE_SEQUENCE, 2026071808);
assert.equal(PVP6_CERTIFICATION_STATUS, 'STATIC_CERTIFIED_LIVE_PENDING');
assert.equal(PVP6_LIVE_CERTIFICATION_STATUS, 'PENDING');
assert.match(PVP6_FRONTEND_BASELINE_SHA, /^[0-9a-f]{40}$/);
assert.match(PVP6_WORKER_BASELINE_SHA, /^[0-9a-f]{40}$/);
assert.match(PVP6_BASELINE_WORKER_VERSION_ID, /^[0-9a-f-]{36}$/);
assert.deepEqual([...PVP6_OPERATIONAL_FEATURE_FLAGS], [
  'PVP1_ENABLED',
  'PVP2_PUBLIC_MATCHMAKING_ENABLED',
  'PVP2_PUBLIC_CUSTOM_ROOMS_ENABLED'
]);
assert.equal(PVP6_CERTIFICATION_MATRIX.length, 12);

const descriptor = createPvp6SealDescriptor();
assert.equal(descriptor.productionSealCandidate, true);
assert.equal(descriptor.finalProductionSeal, false);
assert.equal(descriptor.deadPvpFlagsFound, 0);
assert.equal(descriptor.realTwoClientCertificationRequired, true);

const metadata = normalizePvp6VersionMetadata({ id: 'abc', tag: 'pvp6', timestamp: '2026-07-18T00:00:00Z' });
assert.deepEqual(metadata, {
  versionId: 'abc',
  versionTag: 'pvp6',
  versionTimestamp: '2026-07-18T00:00:00Z'
});

const passing = evaluatePvp6SealPair({
  frontendSeal: descriptor,
  workerInfo: {
    ...descriptor,
    deployment: { id: '11111111-2222-3333-4444-555555555555', tag: 'pvp6' }
  }
});
assert.equal(passing.ready, true);
assert.equal(passing.status, 'PASS');
assert.equal(passing.deployment.versionId, '11111111-2222-3333-4444-555555555555');

const missingMetadata = evaluatePvp6SealPair({ frontendSeal: descriptor, workerInfo: descriptor });
assert.equal(missingMetadata.ready, false);
assert.ok(missingMetadata.errors.includes('WORKER_VERSION_METADATA_MISSING'));

const mismatched = evaluatePvp6SealPair({
  frontendSeal: { ...descriptor, workerBaselineSha: '0'.repeat(40) },
  workerInfo: { ...descriptor, deployment: { id: 'x' } }
});
assert.equal(mismatched.ready, false);
assert.ok(mismatched.errors.includes('FRONTEND_WORKER_BASELINE_MISMATCH'));

console.log('PVP.6 final certification seal core tests passed');
