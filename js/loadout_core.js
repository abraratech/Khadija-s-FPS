// LOADOUT.1 R1 — deterministic saved loadouts, avatar presets, and cosmetic collections.
import {
  AVATAR_PROFILE_VERSION,
  DEFAULT_AVATAR_PROFILE,
  normalizeAvatarProfile,
} from './avatar_customization_core.js';
import { PROGRESSION_UNLOCK_CATALOG } from './progression_core.js';

export const LOADOUT_PATCH = 'loadout1-r1-saved-presets-avatar-cosmetic-collections';
export const LOADOUT_PROFILE_KEY = 'ka_loadout_profile_v1';
export const LOADOUT_BACKUP_KEY = 'ka_loadout_backup_v1';
export const LOADOUT_CORRUPT_KEY = 'ka_loadout_corrupt_v1';
export const LOADOUT_RUN_SNAPSHOT_KEY = 'ka_loadout_run_snapshot_v1';
export const LOADOUT_PROFILE_VERSION = 1;
export const MAX_LOADOUT_PRESETS = 6;
export const MAX_AVATAR_PRESETS = 6;

export const LOADOUT_WEAPON_CATALOG = Object.freeze([
  Object.freeze({ id: 'SMG', label: 'SMG', role: 'PRIMARY', description: 'Mobile close-range pressure.' }),
  Object.freeze({ id: 'RIFLE', label: 'Rifle', role: 'PRIMARY', description: 'Stable medium-range control.' }),
  Object.freeze({ id: 'SHOTGUN', label: 'Shotgun', role: 'PRIMARY', description: 'High-impact close-quarters control.' }),
  Object.freeze({ id: 'SNIPER', label: 'Sniper', role: 'PRIMARY', description: 'Precision long-range coverage.' }),
  Object.freeze({ id: 'PISTOL', label: 'Starting Pistol', role: 'SECONDARY', description: 'Every deployment begins with this weapon.' }),
]);

export const LOADOUT_DOCTRINES = Object.freeze([
  Object.freeze({ id: 'BALANCED', label: 'Balanced', description: 'Flexible acquisition order for changing pressure.' }),
  Object.freeze({ id: 'CLOSE_QUARTERS', label: 'Close Quarters', description: 'Prioritize mobile and high-impact weapons.' }),
  Object.freeze({ id: 'PRECISION', label: 'Precision', description: 'Prioritize controlled fire and long sightlines.' }),
  Object.freeze({ id: 'MOBILE', label: 'Mobile', description: 'Prioritize fast handling and repositioning.' }),
]);

export const LOADOUT_MELEE_CATALOG = Object.freeze([
  Object.freeze({ id: 'FIELD_KNIFE', label: 'Field Knife', description: 'Standard survival melee profile.' }),
]);

const WEAPON_IDS = new Set(LOADOUT_WEAPON_CATALOG.map((entry) => entry.id));
const PRIMARY_IDS = new Set(LOADOUT_WEAPON_CATALOG.filter((entry) => entry.role === 'PRIMARY').map((entry) => entry.id));
const SECONDARY_IDS = new Set(LOADOUT_WEAPON_CATALOG.map((entry) => entry.id));
const DOCTRINE_IDS = new Set(LOADOUT_DOCTRINES.map((entry) => entry.id));
const MELEE_IDS = new Set(LOADOUT_MELEE_CATALOG.map((entry) => entry.id));
const DEFAULT_COSMETICS = Object.freeze({
  title: 'TITLE_SURVIVOR',
  badge: 'BADGE_RECRUIT',
  banner: 'BANNER_STANDARD',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(max, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', maxLength = 80) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || String(fallback || '')).slice(0, maxLength);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function safeId(value, fallback, maxLength = 72) {
  const token = cleanText(value, '', maxLength)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return token || fallback;
}

function uniqueId(preferred, used, fallbackPrefix, index) {
  let candidate = safeId(preferred, `${fallbackPrefix}-${index + 1}`);
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${safeId(preferred, fallbackPrefix).slice(0, 58)}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeCosmetics(value = {}) {
  const source = isObject(value) ? value : {};
  return {
    title: cleanText(source.title, DEFAULT_COSMETICS.title, 80),
    badge: cleanText(source.badge, DEFAULT_COSMETICS.badge, 80),
    banner: cleanText(source.banner, DEFAULT_COSMETICS.banner, 80),
  };
}

function normalizeWeapon(value, allowed, fallback) {
  const token = cleanText(value, fallback, 24).toUpperCase();
  return allowed.has(token) ? token : fallback;
}

function normalizeDoctrine(value) {
  const token = cleanText(value, 'BALANCED', 32).toUpperCase();
  return DOCTRINE_IDS.has(token) ? token : 'BALANCED';
}

function normalizeMelee(value) {
  const token = cleanText(value, 'FIELD_KNIFE', 32).toUpperCase();
  return MELEE_IDS.has(token) ? token : 'FIELD_KNIFE';
}

function normalizeAvatarPreset(entry, index, now, usedIds) {
  const source = isObject(entry) ? entry : {};
  const id = uniqueId(source.id, usedIds, 'avatar', index);
  const createdAt = integer(source.createdAt, now, 1);
  return {
    id,
    name: cleanText(source.name, `Operator ${index + 1}`, 28),
    avatar: normalizeAvatarProfile(source.avatar || source.profile || DEFAULT_AVATAR_PROFILE),
    createdAt,
    updatedAt: Math.max(createdAt, integer(source.updatedAt, now, 1)),
  };
}

function normalizeLoadoutPreset(entry, index, now, usedIds, avatarIds) {
  const source = isObject(entry) ? entry : {};
  const id = uniqueId(source.id, usedIds, 'loadout', index);
  const primary = normalizeWeapon(source.primary, PRIMARY_IDS, index % 2 === 0 ? 'SMG' : 'RIFLE');
  let secondary = normalizeWeapon(source.secondary, SECONDARY_IDS, primary === 'SHOTGUN' ? 'PISTOL' : 'SHOTGUN');
  if (secondary === primary) secondary = primary === 'PISTOL' ? 'SMG' : 'PISTOL';
  const requestedAvatarId = safeId(source.avatarPresetId, '');
  const avatarPresetId = avatarIds.has(requestedAvatarId) ? requestedAvatarId : [...avatarIds][0];
  const createdAt = integer(source.createdAt, now, 1);
  return {
    id,
    name: cleanText(source.name, `Field Plan ${index + 1}`, 28),
    primary,
    secondary,
    melee: normalizeMelee(source.melee),
    doctrine: normalizeDoctrine(source.doctrine),
    avatarPresetId,
    cosmetics: normalizeCosmetics(source.cosmetics),
    createdAt,
    updatedAt: Math.max(createdAt, integer(source.updatedAt, now, 1)),
  };
}

function defaultAvatarPreset(avatarProfile, now) {
  return {
    id: 'avatar-operator-one',
    name: 'Operator One',
    avatar: normalizeAvatarProfile(avatarProfile),
    createdAt: now,
    updatedAt: now,
  };
}

function defaultLoadoutPresets(now, avatarPresetId) {
  return [
    {
      id: 'loadout-field-standard',
      name: 'Field Standard',
      primary: 'SMG',
      secondary: 'SHOTGUN',
      melee: 'FIELD_KNIFE',
      doctrine: 'BALANCED',
      avatarPresetId,
      cosmetics: { ...DEFAULT_COSMETICS },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'loadout-long-watch',
      name: 'Long Watch',
      primary: 'RIFLE',
      secondary: 'SNIPER',
      melee: 'FIELD_KNIFE',
      doctrine: 'PRECISION',
      avatarPresetId,
      cosmetics: { ...DEFAULT_COSMETICS },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function createDefaultLoadoutProfile({
  now = Date.now(),
  avatarProfile = DEFAULT_AVATAR_PROFILE,
} = {}) {
  const safeNow = integer(now, Date.now(), 1);
  const avatarPreset = defaultAvatarPreset(avatarProfile, safeNow);
  const presets = defaultLoadoutPresets(safeNow, avatarPreset.id);
  return {
    version: LOADOUT_PROFILE_VERSION,
    patch: LOADOUT_PATCH,
    activeLoadoutId: presets[0].id,
    activeAvatarPresetId: avatarPreset.id,
    presets,
    avatarPresets: [avatarPreset],
    createdAt: safeNow,
    updatedAt: safeNow,
  };
}

export function normalizeLoadoutProfile(value, {
  now = Date.now(),
  avatarProfile = DEFAULT_AVATAR_PROFILE,
} = {}) {
  const source = isObject(value) ? value : {};
  const safeNow = integer(now, Date.now(), 1);
  const defaults = createDefaultLoadoutProfile({ now: safeNow, avatarProfile });

  const avatarUsed = new Set();
  let avatarPresets = Array.isArray(source.avatarPresets)
    ? source.avatarPresets.slice(0, MAX_AVATAR_PRESETS).map((entry, index) => (
      normalizeAvatarPreset(entry, index, safeNow, avatarUsed)
    ))
    : [];
  if (!avatarPresets.length) avatarPresets = defaults.avatarPresets.map(deepClone);
  const avatarIds = new Set(avatarPresets.map((entry) => entry.id));

  const presetUsed = new Set();
  let presets = Array.isArray(source.presets)
    ? source.presets.slice(0, MAX_LOADOUT_PRESETS).map((entry, index) => (
      normalizeLoadoutPreset(entry, index, safeNow, presetUsed, avatarIds)
    ))
    : [];
  if (!presets.length) presets = defaults.presets.map(deepClone);

  const presetIds = new Set(presets.map((entry) => entry.id));
  let activeLoadoutId = safeId(source.activeLoadoutId, presets[0].id);
  if (!presetIds.has(activeLoadoutId)) activeLoadoutId = presets[0].id;

  let activeAvatarPresetId = safeId(source.activeAvatarPresetId, avatarPresets[0].id);
  if (!avatarIds.has(activeAvatarPresetId)) activeAvatarPresetId = avatarPresets[0].id;

  const createdAt = integer(source.createdAt, safeNow, 1);
  return {
    version: LOADOUT_PROFILE_VERSION,
    patch: LOADOUT_PATCH,
    activeLoadoutId,
    activeAvatarPresetId,
    presets,
    avatarPresets,
    createdAt,
    updatedAt: Math.max(createdAt, integer(source.updatedAt, safeNow, 1)),
  };
}

export function parseLoadoutProfile(raw, options = {}) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return Object.freeze({
      profile: normalizeLoadoutProfile({}, options),
      recovered: false,
      reason: 'EMPTY',
      corruptRaw: '',
    });
  }
  try {
    const parsed = JSON.parse(raw);
    return Object.freeze({
      profile: normalizeLoadoutProfile(parsed, options),
      recovered: false,
      reason: integer(parsed?.version, 0) < LOADOUT_PROFILE_VERSION ? 'MIGRATED' : 'OK',
      corruptRaw: '',
    });
  } catch {
    return Object.freeze({
      profile: normalizeLoadoutProfile({}, options),
      recovered: true,
      reason: 'CORRUPT_JSON',
      corruptRaw: raw.slice(0, 600000),
    });
  }
}

export function serializeLoadoutProfile(profile, options = {}) {
  return JSON.stringify(normalizeLoadoutProfile(profile, options));
}

export function getActiveLoadoutPreset(profileValue) {
  const profile = normalizeLoadoutProfile(profileValue);
  return profile.presets.find((entry) => entry.id === profile.activeLoadoutId) || profile.presets[0];
}

export function getActiveAvatarPreset(profileValue) {
  const profile = normalizeLoadoutProfile(profileValue);
  return profile.avatarPresets.find((entry) => entry.id === profile.activeAvatarPresetId)
    || profile.avatarPresets[0];
}

export function getWeaponCatalogEntry(id) {
  const token = cleanText(id, '', 24).toUpperCase();
  return LOADOUT_WEAPON_CATALOG.find((entry) => entry.id === token) || null;
}

export function getDoctrineEntry(id) {
  const token = cleanText(id, '', 32).toUpperCase();
  return LOADOUT_DOCTRINES.find((entry) => entry.id === token) || null;
}

export function getProgressionCosmeticCollection(progressionProfile = {}) {
  const unlocks = isObject(progressionProfile?.unlocks) ? progressionProfile.unlocks : {};
  const equipped = isObject(progressionProfile?.equipped) ? progressionProfile.equipped : {};
  return PROGRESSION_UNLOCK_CATALOG.map((entry) => Object.freeze({
    ...entry,
    unlocked: integer(unlocks[entry.id], 0) > 0,
    unlockedAt: integer(unlocks[entry.id], 0),
    equipped: equipped[entry.kind.toLowerCase()] === entry.id,
  }));
}

export function sanitizePresetCosmetics(presetValue, progressionProfile = {}) {
  const preset = isObject(presetValue) ? presetValue : {};
  const requested = normalizeCosmetics(preset.cosmetics);
  const unlocks = isObject(progressionProfile?.unlocks) ? progressionProfile.unlocks : {};
  const result = {};
  for (const [kind, fallback] of Object.entries(DEFAULT_COSMETICS)) {
    const id = requested[kind];
    const catalog = PROGRESSION_UNLOCK_CATALOG.find((entry) => (
      entry.id === id && entry.kind.toLowerCase() === kind
    ));
    result[kind] = catalog && integer(unlocks[id], 0) > 0 ? id : fallback;
  }
  return result;
}

export function createFrozenLoadoutSnapshot(profileValue, progressionProfile = {}, {
  now = Date.now(),
  runId = '',
  mapId = 'grid_bunker',
  difficulty = 1,
  mode = 'single',
} = {}) {
  const profile = normalizeLoadoutProfile(profileValue, { now });
  const preset = getActiveLoadoutPreset(profile);
  const avatarPreset = profile.avatarPresets.find((entry) => entry.id === preset.avatarPresetId)
    || getActiveAvatarPreset(profile);
  return Object.freeze({
    version: 1,
    patch: LOADOUT_PATCH,
    runId: cleanText(runId, `run-${integer(now, Date.now(), 1).toString(36)}`, 100),
    frozenAt: integer(now, Date.now(), 1),
    mapId: cleanText(mapId, 'grid_bunker', 80),
    difficulty: Math.max(0.5, Math.min(2, finite(difficulty, 1))),
    mode: cleanText(mode, 'single', 24),
    loadoutId: preset.id,
    loadoutName: preset.name,
    primary: preset.primary,
    secondary: preset.secondary,
    melee: preset.melee,
    doctrine: preset.doctrine,
    avatarPresetId: avatarPreset.id,
    avatar: normalizeAvatarProfile(avatarPreset.avatar),
    cosmetics: sanitizePresetCosmetics(preset, progressionProfile),
    balancePolicy: Object.freeze({
      startingWeapon: 'PISTOL',
      grantsCombatPower: false,
      preferencesOnly: true,
    }),
  });
}

function newerRecord(left, right) {
  const a = isObject(left) ? left : {};
  const b = isObject(right) ? right : {};
  const aUpdated = integer(a.updatedAt, 0);
  const bUpdated = integer(b.updatedAt, 0);
  if (aUpdated !== bUpdated) return deepClone(aUpdated > bUpdated ? a : b);
  return JSON.stringify(a) >= JSON.stringify(b) ? deepClone(a) : deepClone(b);
}

function mergeRecordLists(left, right, maxEntries, fallbackPrefix) {
  const byId = new Map();
  [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].forEach((entry, index) => {
    const id = safeId(entry?.id, `${fallbackPrefix}-${index + 1}`);
    const previous = byId.get(id);
    byId.set(id, previous ? newerRecord(previous, { ...entry, id }) : deepClone({ ...entry, id }));
  });
  return Array.from(byId.values())
    .sort((a, b) => integer(b.updatedAt, 0) - integer(a.updatedAt, 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, maxEntries);
}

export function mergeLoadoutProfiles(leftValue, rightValue, {
  now = Date.now(),
  avatarProfile = DEFAULT_AVATAR_PROFILE,
} = {}) {
  const left = normalizeLoadoutProfile(leftValue, { now, avatarProfile });
  const right = normalizeLoadoutProfile(rightValue, { now, avatarProfile });
  const preferred = integer(left.updatedAt, 0) >= integer(right.updatedAt, 0) ? left : right;
  const avatarPresets = mergeRecordLists(
    left.avatarPresets,
    right.avatarPresets,
    MAX_AVATAR_PRESETS,
    'avatar',
  );
  const avatarIds = new Set(avatarPresets.map((entry) => entry.id));
  const presets = mergeRecordLists(left.presets, right.presets, MAX_LOADOUT_PRESETS, 'loadout')
    .map((entry) => ({
      ...entry,
      avatarPresetId: avatarIds.has(entry.avatarPresetId) ? entry.avatarPresetId : avatarPresets[0]?.id,
    }));
  const merged = {
    version: LOADOUT_PROFILE_VERSION,
    patch: LOADOUT_PATCH,
    activeLoadoutId: presets.some((entry) => entry.id === preferred.activeLoadoutId)
      ? preferred.activeLoadoutId
      : presets[0]?.id,
    activeAvatarPresetId: avatarIds.has(preferred.activeAvatarPresetId)
      ? preferred.activeAvatarPresetId
      : avatarPresets[0]?.id,
    presets,
    avatarPresets,
    createdAt: Math.min(integer(left.createdAt, now, 1), integer(right.createdAt, now, 1)),
    updatedAt: Math.max(integer(left.updatedAt, now, 1), integer(right.updatedAt, now, 1)),
  };
  return normalizeLoadoutProfile(merged, { now, avatarProfile });
}

export function getLoadoutMergePolicy() {
  return Object.freeze({
    profile: 'newest active selections',
    presets: 'union by stable preset id; newest update wins',
    avatarPresets: 'union by stable preset id; newest update wins',
    maximumLoadoutPresets: MAX_LOADOUT_PRESETS,
    maximumAvatarPresets: MAX_AVATAR_PRESETS,
    combatPower: 'never granted by saved presets',
  });
}

export function loadoutProfileFingerprint(profileValue) {
  const profile = normalizeLoadoutProfile(profileValue);
  return JSON.stringify({
    activeLoadoutId: profile.activeLoadoutId,
    activeAvatarPresetId: profile.activeAvatarPresetId,
    presets: profile.presets,
    avatarPresets: profile.avatarPresets,
  });
}
