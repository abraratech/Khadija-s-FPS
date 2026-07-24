// ONBOARDING.1 R1 — instant Quick Play funnel and first-session guidance.

export const ONBOARDING1_PATCH = 'onboarding1-r1-instant-quick-play-funnel';
export const ONBOARDING1_PRODUCT_VERSION = '1.14.0-onboarding1-r1';
export const ONBOARDING1_PROFILE_VERSION = 1;
export const ONBOARDING1_PROFILE_KEY = 'ka_onboarding1_profile_v1';
export const ONBOARDING1_ACTIVE_RUN_KEY = 'ka_onboarding1_active_run_v1';

export const ONBOARDING1_QUICK_PLAY_PRESET = Object.freeze({
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

const DISCOVERY_SCREENS = new Set([
  'map',
  'difficulty',
  'multiplayer',
  'avatar',
  'social',
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(max, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', maxLength = 120) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || String(fallback || '')).slice(0, maxLength);
}

function timestamp(value, fallback = 0) {
  return integer(value, fallback, 0);
}

export function createDefaultOnboarding1Profile(now = Date.now()) {
  const safeNow = timestamp(now, Date.now());
  return {
    version: ONBOARDING1_PROFILE_VERSION,
    patch: ONBOARDING1_PATCH,
    quickPlayStarts: 0,
    quickPlayCompletions: 0,
    quickPlayFailures: 0,
    firstQuickPlayStartedAt: 0,
    firstQuickPlayCompletedAt: 0,
    lastQuickPlayStartedAt: 0,
    lastQuickPlayCompletedAt: 0,
    lastOutcome: 'NONE',
    lastSource: '',
    discoveryGuidanceSeen: false,
    createdAt: safeNow,
    updatedAt: safeNow,
  };
}

export function normalizeOnboarding1Profile(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const defaults = createDefaultOnboarding1Profile(now);
  const createdAt = timestamp(source.createdAt, defaults.createdAt);
  const starts = integer(source.quickPlayStarts, 0, 0);
  const completions = integer(source.quickPlayCompletions, 0, 0, starts);
  return {
    version: ONBOARDING1_PROFILE_VERSION,
    patch: ONBOARDING1_PATCH,
    quickPlayStarts: starts,
    quickPlayCompletions: completions,
    quickPlayFailures: integer(source.quickPlayFailures, 0, 0),
    firstQuickPlayStartedAt: timestamp(source.firstQuickPlayStartedAt, 0),
    firstQuickPlayCompletedAt: timestamp(source.firstQuickPlayCompletedAt, 0),
    lastQuickPlayStartedAt: timestamp(source.lastQuickPlayStartedAt, 0),
    lastQuickPlayCompletedAt: timestamp(source.lastQuickPlayCompletedAt, 0),
    lastOutcome: cleanText(source.lastOutcome, 'NONE', 48).toUpperCase(),
    lastSource: cleanText(source.lastSource, '', 80),
    discoveryGuidanceSeen: source.discoveryGuidanceSeen === true,
    createdAt,
    updatedAt: Math.max(createdAt, timestamp(source.updatedAt, createdAt)),
  };
}

export function parseOnboarding1Profile(raw, now = Date.now()) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return Object.freeze({
      profile: normalizeOnboarding1Profile({}, now),
      recovered: false,
      reason: 'EMPTY',
    });
  }
  try {
    const parsed = JSON.parse(raw);
    return Object.freeze({
      profile: normalizeOnboarding1Profile(parsed, now),
      recovered: false,
      reason: Number(parsed?.version) < ONBOARDING1_PROFILE_VERSION ? 'MIGRATED' : 'OK',
    });
  } catch {
    return Object.freeze({
      profile: normalizeOnboarding1Profile({}, now),
      recovered: true,
      reason: 'CORRUPT_JSON',
    });
  }
}

export function serializeOnboarding1Profile(value, now = Date.now()) {
  return JSON.stringify(normalizeOnboarding1Profile(value, now));
}

export function createOnboarding1QuickPlayPlan(profileValue = {}, {
  now = Date.now(),
  source = 'quick-play',
} = {}) {
  const profile = normalizeOnboarding1Profile(profileValue, now);
  const safeNow = timestamp(now, Date.now());
  return Object.freeze({
    ...ONBOARDING1_QUICK_PLAY_PRESET,
    patch: ONBOARDING1_PATCH,
    startedAt: safeNow,
    source: cleanText(source, 'quick-play', 80),
    firstTime: profile.quickPlayStarts === 0,
    preserveAdvancedSelections: true,
    persistPresetSelection: false,
    workerChangeRequired: false,
    protocol: 6,
  });
}

export function markOnboarding1QuickPlayStarted(profileValue, plan, now = Date.now()) {
  const profile = normalizeOnboarding1Profile(profileValue, now);
  const safeNow = timestamp(now, Date.now());
  const starts = profile.quickPlayStarts + 1;
  return normalizeOnboarding1Profile({
    ...profile,
    quickPlayStarts: starts,
    firstQuickPlayStartedAt: profile.firstQuickPlayStartedAt || safeNow,
    lastQuickPlayStartedAt: safeNow,
    lastOutcome: 'STARTED',
    lastSource: plan?.source || 'quick-play',
    updatedAt: safeNow,
  }, safeNow);
}

export function markOnboarding1QuickPlayCompleted(profileValue, {
  reason = 'ENDED',
  now = Date.now(),
} = {}) {
  const profile = normalizeOnboarding1Profile(profileValue, now);
  const safeNow = timestamp(now, Date.now());
  const completions = Math.min(
    profile.quickPlayStarts,
    profile.quickPlayCompletions + 1,
  );
  return normalizeOnboarding1Profile({
    ...profile,
    quickPlayCompletions: completions,
    firstQuickPlayCompletedAt: profile.firstQuickPlayCompletedAt || safeNow,
    lastQuickPlayCompletedAt: safeNow,
    lastOutcome: cleanText(reason, 'ENDED', 48).toUpperCase(),
    updatedAt: safeNow,
  }, safeNow);
}

export function markOnboarding1QuickPlayFailed(profileValue, {
  reason = 'DEPLOYMENT_FAILED',
  now = Date.now(),
} = {}) {
  const profile = normalizeOnboarding1Profile(profileValue, now);
  const safeNow = timestamp(now, Date.now());
  return normalizeOnboarding1Profile({
    ...profile,
    quickPlayFailures: profile.quickPlayFailures + 1,
    lastOutcome: cleanText(reason, 'DEPLOYMENT_FAILED', 48).toUpperCase(),
    updatedAt: safeNow,
  }, safeNow);
}

export function markOnboarding1DiscoverySeen(profileValue, now = Date.now()) {
  const profile = normalizeOnboarding1Profile(profileValue, now);
  return normalizeOnboarding1Profile({
    ...profile,
    discoveryGuidanceSeen: true,
    updatedAt: timestamp(now, Date.now()),
  }, now);
}

export function shouldShowOnboarding1Discovery(profileValue) {
  const profile = normalizeOnboarding1Profile(profileValue);
  return profile.quickPlayCompletions > 0 && profile.discoveryGuidanceSeen !== true;
}

export function normalizeOnboarding1DiscoveryScreen(value) {
  const screen = cleanText(value, 'map', 32).toLowerCase();
  return DISCOVERY_SCREENS.has(screen) ? screen : 'map';
}

export function getOnboarding1FunnelSnapshot(profileValue) {
  const profile = normalizeOnboarding1Profile(profileValue);
  const starts = profile.quickPlayStarts;
  const completions = profile.quickPlayCompletions;
  return Object.freeze({
    ...profile,
    firstTimePending: starts === 0,
    activeAttempts: Math.max(0, starts - completions - profile.quickPlayFailures),
    completionRate: starts > 0 ? completions / starts : 0,
    discoveryPending: shouldShowOnboarding1Discovery(profile),
    preset: ONBOARDING1_QUICK_PLAY_PRESET,
  });
}
