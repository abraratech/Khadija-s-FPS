import assert from 'node:assert/strict';
import {
  LIVE1_PATCH,
  LIVE1_REWARD_TRACK,
  applyLive1RunReceipt,
  defaultLive1Profile,
  normalizeLive1Manifest,
  resolveLive1Manifest
} from './live1_core.js';

const july16 = Date.UTC(2026, 6, 16, 12, 0, 0);
const manifest = resolveLive1Manifest(july16);
assert.equal(manifest.ok, true);
assert.equal(manifest.patch, LIVE1_PATCH);
assert.equal(manifest.rules.clientClockTrusted, false);
assert.equal(manifest.rules.automaticProtectedClaims, true);
assert.ok(manifest.validUntil > manifest.serverNow);
assert.equal(
  resolveLive1Manifest(july16).revision,
  manifest.revision,
  'same Worker time must resolve the same live revision'
);

const normalized = normalizeLive1Manifest({
  ...manifest,
  daily: {
    ...manifest.daily,
    featuredArena: { id: 'not-a-map' },
    featuredEncounter: { id: 'not-an-encounter' }
  }
}, july16);
assert.ok(normalized.daily.featuredArena.id);
assert.notEqual(normalized.daily.featuredArena.id, 'not-a-map');

let profile = defaultLive1Profile(july16, manifest);
for (let index = 0; index < 3; index += 1) {
  const result = applyLive1RunReceipt(profile, {
    runId: `run-live-test-${index}`,
    mapId: manifest.daily.featuredArena.id,
    reason: 'TEAM_ELIMINATED',
    endedAt: july16 + index * 1000,
    kills: index === 0 ? 100 : 0,
    wavesCleared: index === 0 ? 20 : 0,
    contentOperationsCompleted: index === 0 ? 4 : 1,
    coopContractsCompleted: index === 0 ? 3 : 0,
    liveSeasonId: manifest.season.id,
    liveManifestRevision: manifest.revision
  }, manifest, july16 + index * 1000);
  assert.equal(result.valid, true);
  profile = result.profile;
}
assert.equal(profile.metrics.completedRuns, 3);
assert.equal(profile.metrics.kills, 100);
assert.ok(Object.keys(profile.completedStages).length >= 4);
assert.ok(profile.seasonPoints >= LIVE1_REWARD_TRACK[0].threshold);
assert.ok(profile.rewardClaims.TITLE_SEASONED_OPERATOR);

const mismatch = applyLive1RunReceipt(profile, {
  runId: 'run-live-mismatch',
  mapId: 'grid_bunker',
  reason: 'ENDED',
  endedAt: july16,
  liveSeasonId: 'WRONG_SEASON',
  liveManifestRevision: manifest.revision
}, manifest, july16);
assert.equal(mismatch.valid, false);
assert.equal(mismatch.xpAward, 0);

const nextSeasonTime = manifest.season.endAt + 1000;
const nextManifest = resolveLive1Manifest(nextSeasonTime);
const rollover = applyLive1RunReceipt(profile, {
  runId: 'run-live-rollover',
  mapId: nextManifest.daily.featuredArena.id,
  reason: 'ENDED',
  endedAt: nextSeasonTime,
  liveSeasonId: nextManifest.season.id,
  liveManifestRevision: nextManifest.revision
}, nextManifest, nextSeasonTime);
assert.equal(rollover.valid, true);
assert.equal(rollover.profile.seasonId, nextManifest.season.id);
assert.equal(rollover.profile.history[0].seasonId, manifest.season.id);

console.log('LIVE.1 core tests passed');
