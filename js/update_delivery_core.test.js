import assert from 'node:assert/strict';
import {
  CURRENT_RELEASE,
  compareReleaseDescriptors,
  createRefreshUrl,
  normalizeReleaseDescriptor,
  shouldDeferUpdate
} from './update_delivery_core.js';

const same = compareReleaseDescriptors(CURRENT_RELEASE, CURRENT_RELEASE);
assert.equal(same.updateAvailable, false);
assert.equal(same.reason, 'CURRENT');

const newer = compareReleaseDescriptors(CURRENT_RELEASE, {
  schema: 1,
  releaseId: 'post-launch5-r1',
  releaseSequence: CURRENT_RELEASE.releaseSequence + 1,
  productVersion: CURRENT_RELEASE.productVersion
});
assert.equal(newer.updateAvailable, true);
assert.equal(newer.reason, 'NEWER_SEQUENCE');

const older = compareReleaseDescriptors(CURRENT_RELEASE, {
  schema: 1,
  releaseId: 'older',
  releaseSequence: CURRENT_RELEASE.releaseSequence - 1
});
assert.equal(older.updateAvailable, false);
assert.equal(older.reason, 'REMOTE_OLDER');

const replacement = compareReleaseDescriptors(CURRENT_RELEASE, {
  ...CURRENT_RELEASE,
  releaseId: 'replacement'
});
assert.equal(replacement.updateAvailable, true);
assert.equal(replacement.reason, 'REPLACED_RELEASE');

assert.equal(compareReleaseDescriptors(CURRENT_RELEASE, {}).reason, 'INVALID_REMOTE');
assert.deepEqual(normalizeReleaseDescriptor(null), {
  schema: 0,
  releaseId: '',
  releaseSequence: 0,
  productVersion: ''
});

assert.equal(shouldDeferUpdate({ menuVisible: false }), true);
assert.equal(shouldDeferUpdate({ activeLobby: true }), true);
assert.equal(shouldDeferUpdate({ matchmakingActive: true }), true);
assert.equal(shouldDeferUpdate({ documentVisible: false }), true);
assert.equal(shouldDeferUpdate({ documentVisible: true, menuVisible: true }), false);

const refreshed = new URL(createRefreshUrl('https://example.test/game?mode=solo#x', 'next-release'));
assert.equal(refreshed.searchParams.get('ka_release'), 'next-release');
assert.equal(refreshed.hash, '#x');

console.log('POST-LAUNCH.4 update delivery core tests passed');
