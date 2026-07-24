import assert from 'node:assert/strict';
import {
  ONBOARDING1_PATCH,
  ONBOARDING1_PRODUCT_VERSION,
  ONBOARDING1_QUICK_PLAY_PRESET,
  createDefaultOnboarding1Profile,
  createOnboarding1QuickPlayPlan,
  getOnboarding1FunnelSnapshot,
  markOnboarding1DiscoverySeen,
  markOnboarding1QuickPlayCompleted,
  markOnboarding1QuickPlayFailed,
  markOnboarding1QuickPlayStarted,
  normalizeOnboarding1DiscoveryScreen,
  parseOnboarding1Profile,
  serializeOnboarding1Profile,
  shouldShowOnboarding1Discovery,
} from './onboarding1_core.js';

const NOW = 1_800_000_000_000;
assert.equal(ONBOARDING1_PATCH, 'onboarding1-r1-instant-quick-play-funnel');
assert.equal(ONBOARDING1_PRODUCT_VERSION, '1.14.0-onboarding1-r1');
assert.deepEqual(ONBOARDING1_QUICK_PLAY_PRESET, {
  mode: 'single',
  gameMode: 'survival',
  mapId: 'grid_bunker',
  difficulty: 1,
  difficultyLabel: 'Normal',
  loadoutPolicy: 'default-balanced',
  loadoutId: 'loadout-field-standard',
  loadoutName: 'Field Standard',
  tutorialPolicy: 'first-run-field-training',
});

const empty = createDefaultOnboarding1Profile(NOW);
const firstPlan = createOnboarding1QuickPlayPlan(empty, {
  now: NOW + 10,
  source: 'home-primary',
});
assert.equal(firstPlan.firstTime, true);
assert.equal(firstPlan.mapId, 'grid_bunker');
assert.equal(firstPlan.difficulty, 1);
assert.equal(firstPlan.loadoutPolicy, 'default-balanced');
assert.equal(firstPlan.persistPresetSelection, false);
assert.equal(firstPlan.preserveAdvancedSelections, true);
assert.equal(firstPlan.workerChangeRequired, false);
assert.equal(firstPlan.protocol, 6);

const started = markOnboarding1QuickPlayStarted(empty, firstPlan, NOW + 20);
assert.equal(started.quickPlayStarts, 1);
assert.equal(started.firstQuickPlayStartedAt, NOW + 20);
assert.equal(started.lastSource, 'home-primary');
assert.equal(getOnboarding1FunnelSnapshot(started).activeAttempts, 1);

const completed = markOnboarding1QuickPlayCompleted(started, {
  reason: 'DEATH',
  now: NOW + 40,
});
assert.equal(completed.quickPlayCompletions, 1);
assert.equal(completed.firstQuickPlayCompletedAt, NOW + 40);
assert.equal(completed.lastOutcome, 'DEATH');
assert.equal(shouldShowOnboarding1Discovery(completed), true);
assert.equal(getOnboarding1FunnelSnapshot(completed).completionRate, 1);

const returningPlan = createOnboarding1QuickPlayPlan(completed, {
  now: NOW + 50,
  source: 'rail',
});
assert.equal(returningPlan.firstTime, false);

const failed = markOnboarding1QuickPlayFailed(started, {
  reason: 'ARENA_ASSET_TIMEOUT',
  now: NOW + 60,
});
assert.equal(failed.quickPlayFailures, 1);
assert.equal(failed.lastOutcome, 'ARENA_ASSET_TIMEOUT');

const seen = markOnboarding1DiscoverySeen(completed, NOW + 70);
assert.equal(seen.discoveryGuidanceSeen, true);
assert.equal(shouldShowOnboarding1Discovery(seen), false);

assert.equal(normalizeOnboarding1DiscoveryScreen('multiplayer'), 'multiplayer');
assert.equal(normalizeOnboarding1DiscoveryScreen('unknown'), 'map');

const roundTrip = parseOnboarding1Profile(serializeOnboarding1Profile(completed), NOW + 80);
assert.equal(roundTrip.recovered, false);
assert.equal(roundTrip.profile.quickPlayCompletions, 1);
const corrupt = parseOnboarding1Profile('{broken', NOW + 90);
assert.equal(corrupt.recovered, true);
assert.equal(corrupt.profile.quickPlayStarts, 0);

console.log('ONBOARDING.1 instant Quick Play funnel core tests passed');
