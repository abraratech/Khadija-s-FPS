// M4.39-M4.42 — versioned guest profile schema and deterministic merge rules.

export const CLOUD_PROFILE_PATCH = 'm4-cloud-guest-sync-r1';
export const CLOUD_PROFILE_SCHEMA = 'khadijas-arena-player-profile';
export const CLOUD_PROFILE_VERSION = 1;

const MAX_STORAGE_ENTRIES = 320;
const MAX_STORAGE_KEY_LENGTH = 128;
const MAX_STORAGE_VALUE_LENGTH = 600000;
const MAX_STORAGE_TOTAL_LENGTH = 2400000;

const PROFILE_STORAGE_KEYS = new Set([
  'ka_cloud_profile_v1',
  'ka_cloud_profile_backup_v1',
  'ka_cloud_profile_corrupt_v1',
  'ka_cloud_profile_revision_v1',
  'ka_cloud_profile_force_hydrate_v1',
  'ka_cloud_profile_account_v1',
  'ka_cloud_profile_token_v1',
  'ka_cloud_profile_remote_revision_v1',
  'ka_cloud_profile_device_v1',
  'ka_cloud_profile_sync_pending_v1'
]);

const PROGRESSION_KEY = 'ka_progression_v1';
const CHALLENGES_KEY = 'ka_challenges_v1';
const HIGH_SCORE_KEY = 'fps_hi_score';
const HIGH_WAVE_KEY = 'fps_hi_wave';
const ONLINE_PLAYER_KEY = 'ka_online_leaderboard_player_v1';
const ONLINE_NAME_KEY = 'ka_online_leaderboard_name_v1';
const ONLINE_PENDING_KEY = 'ka_online_leaderboard_pending_v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(max, Math.floor(finite(value, fallback))));
}

function cleanString(value, fallback = '', maxLength = 240) {
  const string = typeof value === 'string' ? value : String(value ?? fallback);
  return string.slice(0, maxLength);
}

function safeJson(raw, fallback = null) {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (!isPlainObject(value)) return value;
  return Object.keys(value).sort().reduce((output, key) => {
    output[key] = sortedValue(value[key]);
    return output;
  }, {});
}

export function stableStringify(value) {
  return JSON.stringify(sortedValue(value));
}

export function profileChecksum(value) {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function isGameOwnedStorageKey(key) {
  const value = cleanString(key, '', MAX_STORAGE_KEY_LENGTH);
  if (!value || PROFILE_STORAGE_KEYS.has(value)) return false;
  const lower = value.toLowerCase();
  if (
    /(?:debug|diagnostic|incident|fault_simulation|certification|release_guard|tab_lease)/.test(lower)
    || /ka_multiplayer_(?:room|session|transport|refresh|recovery)/.test(lower)
  ) return false;
  return value.startsWith('ka_')
    || value.startsWith('fps_hi_')
    || value.startsWith('mobile_');
}

export function sanitizeLegacyStorage(input) {
  const source = isPlainObject(input) ? input : {};
  const output = {};
  let totalLength = 0;
  let count = 0;

  for (const key of Object.keys(source).sort()) {
    if (count >= MAX_STORAGE_ENTRIES) break;
    if (!isGameOwnedStorageKey(key)) continue;
    if (key.length > MAX_STORAGE_KEY_LENGTH) continue;
    const raw = source[key];
    if (raw === null || raw === undefined) continue;
    const value = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (value.length > MAX_STORAGE_VALUE_LENGTH) continue;
    if (totalLength + key.length + value.length > MAX_STORAGE_TOTAL_LENGTH) break;
    output[key] = value;
    totalLength += key.length + value.length;
    count += 1;
  }

  return output;
}

function normalizeUnlocked(value) {
  const source = isPlainObject(value) ? value : {};
  return Object.keys(source).sort().reduce((output, key) => {
    const timestamp = integer(source[key], 0, 0);
    if (timestamp > 0) output[cleanString(key, '', 80)] = timestamp;
    return output;
  }, {});
}

function normalizeProgression(value) {
  const source = isPlainObject(value) ? value : {};
  const output = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === 'number') output[key] = Math.max(0, finite(entry));
    else if (typeof entry === 'string' || typeof entry === 'boolean') output[key] = entry;
  }
  output.version = integer(source.version, 1, 1, 999);
  return output;
}

function normalizeAchievements(value) {
  const source = isPlainObject(value) ? value : {};
  const unlocked = normalizeUnlocked(source.unlocked);
  return {
    version: integer(source.version, 1, 1, 999),
    unlocked,
    totalUnlocked: Object.keys(unlocked).length
  };
}

function normalizePending(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  value.slice(0, 256).forEach((entry, index) => {
    if (!isPlainObject(entry)) return;
    const id = cleanString(entry.runId || entry.id || `pending-${index}`, '', 180);
    if (!id) return;
    byId.set(id, deepClone(entry));
  });
  return Array.from(byId.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entry]) => entry);
}

function findLocalLeaderboardStorage(storage) {
  return Object.keys(storage)
    .filter((key) => /local.*leaderboard|leaderboard.*local/i.test(key))
    .sort()
    .reduce((output, key) => {
      output[key] = safeJson(storage[key], storage[key]);
      return output;
    }, {});
}

export function deriveCloudProfileSections(legacyStorage) {
  const storage = sanitizeLegacyStorage(legacyStorage);
  const progression = normalizeProgression(safeJson(storage[PROGRESSION_KEY], {}));
  const achievements = normalizeAchievements(safeJson(storage[CHALLENGES_KEY], {}));
  const pendingSubmissions = normalizePending(safeJson(storage[ONLINE_PENDING_KEY], []));
  const identity = {
    leaderboardPlayerId: cleanString(storage[ONLINE_PLAYER_KEY], '', 160),
    displayName: cleanString(storage[ONLINE_NAME_KEY], '', 48)
  };
  const records = {
    highScore: integer(storage[HIGH_SCORE_KEY], 0),
    highWave: integer(storage[HIGH_WAVE_KEY], 1, 1),
    localLeaderboards: findLocalLeaderboardStorage(storage)
  };
  const settings = {};
  const reserved = new Set([
    PROGRESSION_KEY,
    CHALLENGES_KEY,
    HIGH_SCORE_KEY,
    HIGH_WAVE_KEY,
    ONLINE_PLAYER_KEY,
    ONLINE_NAME_KEY,
    ONLINE_PENDING_KEY,
    ...Object.keys(records.localLeaderboards)
  ]);
  Object.keys(storage).sort().forEach((key) => {
    if (!reserved.has(key)) settings[key] = storage[key];
  });
  return { identity, progression, achievements, records, settings, pendingSubmissions };
}

function normalizeMetadata(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    migratedAt: integer(source.migratedAt, 0),
    lastMergeAt: integer(source.lastMergeAt, 0),
    lastSyncAt: integer(source.lastSyncAt, 0),
    lastSyncReason: cleanString(source.lastSyncReason, 'unknown', 80),
    corruptionRecoveries: integer(source.corruptionRecoveries, 0, 0, 9999),
    migrationSources: Array.isArray(source.migrationSources)
      ? Array.from(new Set(source.migrationSources.map((entry) => cleanString(entry, '', 100)).filter(Boolean))).sort()
      : []
  };
}

export function createGuestCloudProfile({
  profileId,
  legacyStorage = {},
  now = Date.now(),
  createdAt = now,
  revision = 1,
  metadata = {}
} = {}) {
  const storage = sanitizeLegacyStorage(legacyStorage);
  const sections = deriveCloudProfileSections(storage);
  const safeProfileId = cleanString(profileId, '', 120);
  if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(safeProfileId)) {
    throw new TypeError('A valid guest profileId is required.');
  }
  const safeNow = integer(now, Date.now(), 1);
  const safeCreatedAt = integer(createdAt, safeNow, 1, safeNow);
  return {
    schema: CLOUD_PROFILE_SCHEMA,
    version: CLOUD_PROFILE_VERSION,
    patch: CLOUD_PROFILE_PATCH,
    profileId: safeProfileId,
    accountType: 'guest',
    revision: integer(revision, 1, 1),
    createdAt: safeCreatedAt,
    updatedAt: Math.max(safeCreatedAt, safeNow),
    legacyFingerprint: profileChecksum(storage),
    legacyStorage: storage,
    ...sections,
    metadata: normalizeMetadata(metadata)
  };
}

function unwrapProfile(value) {
  if (isPlainObject(value?.profile)) return value.profile;
  return value;
}

export function validateCloudProfile(value) {
  const source = unwrapProfile(value);
  const errors = [];
  if (!isPlainObject(source)) {
    return { valid: false, errors: ['PROFILE_NOT_OBJECT'], profile: null };
  }
  if (source.schema !== CLOUD_PROFILE_SCHEMA) errors.push('SCHEMA_MISMATCH');
  if (integer(source.version, 0) !== CLOUD_PROFILE_VERSION) errors.push('VERSION_UNSUPPORTED');
  if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(String(source.profileId || ''))) errors.push('PROFILE_ID_INVALID');
  if (!isPlainObject(source.legacyStorage)) errors.push('LEGACY_STORAGE_MISSING');
  if (errors.length) return { valid: false, errors, profile: null };

  try {
    const profile = createGuestCloudProfile({
      profileId: source.profileId,
      legacyStorage: source.legacyStorage,
      now: integer(source.updatedAt, Date.now(), 1),
      createdAt: integer(source.createdAt, Date.now(), 1),
      revision: integer(source.revision, 1, 1),
      metadata: source.metadata
    });
    return { valid: true, errors: [], profile };
  } catch (error) {
    return { valid: false, errors: [String(error?.message || error)], profile: null };
  }
}

function newerProfile(left, right) {
  const leftUpdated = integer(left?.updatedAt, 0);
  const rightUpdated = integer(right?.updatedAt, 0);
  if (leftUpdated !== rightUpdated) return leftUpdated > rightUpdated ? left : right;
  const leftRevision = integer(left?.revision, 0);
  const rightRevision = integer(right?.revision, 0);
  if (leftRevision !== rightRevision) return leftRevision > rightRevision ? left : right;
  return stableStringify(left) <= stableStringify(right) ? left : right;
}

function identityProfile(left, right) {
  const leftCreated = integer(left?.createdAt, Number.MAX_SAFE_INTEGER);
  const rightCreated = integer(right?.createdAt, Number.MAX_SAFE_INTEGER);
  if (leftCreated !== rightCreated) return leftCreated < rightCreated ? left : right;
  return String(left?.profileId || '').localeCompare(String(right?.profileId || '')) <= 0 ? left : right;
}

function mergeProgression(left, right) {
  const a = normalizeProgression(left);
  const b = normalizeProgression(right);
  const output = {};
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  keys.forEach((key) => {
    if (typeof a[key] === 'number' || typeof b[key] === 'number') {
      output[key] = Math.max(finite(a[key], 0), finite(b[key], 0));
    } else {
      output[key] = b[key] ?? a[key];
    }
  });
  output.version = Math.max(integer(a.version, 1), integer(b.version, 1));
  return output;
}

function mergeAchievements(left, right) {
  const a = normalizeAchievements(left);
  const b = normalizeAchievements(right);
  const unlocked = { ...a.unlocked };
  Object.entries(b.unlocked).forEach(([key, timestamp]) => {
    const previous = integer(unlocked[key], 0);
    unlocked[key] = previous > 0 ? Math.min(previous, integer(timestamp, previous)) : integer(timestamp, 0);
  });
  return {
    version: Math.max(a.version, b.version),
    unlocked,
    totalUnlocked: Object.keys(unlocked).length
  };
}

function entryIdentity(entry, index = 0) {
  if (isPlainObject(entry)) {
    return cleanString(entry.id || entry.runId || entry.createdAt || `entry-${index}`, `entry-${index}`, 220);
  }
  return `${typeof entry}:${stableStringify(entry)}`;
}

function mergeArrays(left, right) {
  const byId = new Map();
  [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].forEach((entry, index) => {
    const id = entryIdentity(entry, index);
    if (!byId.has(id)) {
      byId.set(id, deepClone(entry));
      return;
    }
    const previous = byId.get(id);
    if (stableStringify(entry) > stableStringify(previous)) byId.set(id, deepClone(entry));
  });
  return Array.from(byId.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => entry);
}

function mergeRecordValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) return mergeArrays(left, right);
  if (isPlainObject(left) || isPlainObject(right)) {
    const a = isPlainObject(left) ? left : {};
    const b = isPlainObject(right) ? right : {};
    const output = {};
    Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort().forEach((key) => {
      output[key] = mergeRecordValue(a[key], b[key]);
    });
    return output;
  }
  if (typeof left === 'number' || typeof right === 'number') return Math.max(finite(left), finite(right));
  if (left === undefined) return deepClone(right);
  if (right === undefined) return deepClone(left);
  return stableStringify(left) <= stableStringify(right) ? deepClone(left) : deepClone(right);
}

function parseStorageJson(storage, key, fallback) {
  return safeJson(storage[key], fallback);
}

function writeStorageJson(storage, key, value) {
  storage[key] = JSON.stringify(value);
}

function mergeSpecialStorage(baseStorage, left, right, preferred, identitySource) {
  const output = { ...baseStorage };
  const leftStorage = left.legacyStorage;
  const rightStorage = right.legacyStorage;

  writeStorageJson(output, PROGRESSION_KEY, mergeProgression(
    parseStorageJson(leftStorage, PROGRESSION_KEY, {}),
    parseStorageJson(rightStorage, PROGRESSION_KEY, {})
  ));
  writeStorageJson(output, CHALLENGES_KEY, mergeAchievements(
    parseStorageJson(leftStorage, CHALLENGES_KEY, {}),
    parseStorageJson(rightStorage, CHALLENGES_KEY, {})
  ));
  output[HIGH_SCORE_KEY] = String(Math.max(integer(leftStorage[HIGH_SCORE_KEY], 0), integer(rightStorage[HIGH_SCORE_KEY], 0)));
  output[HIGH_WAVE_KEY] = String(Math.max(integer(leftStorage[HIGH_WAVE_KEY], 1, 1), integer(rightStorage[HIGH_WAVE_KEY], 1, 1)));

  const pending = mergeArrays(
    parseStorageJson(leftStorage, ONLINE_PENDING_KEY, []),
    parseStorageJson(rightStorage, ONLINE_PENDING_KEY, [])
  );
  writeStorageJson(output, ONLINE_PENDING_KEY, pending);

  const localLeaderboardKeys = Array.from(new Set([
    ...Object.keys(leftStorage).filter((key) => /local.*leaderboard|leaderboard.*local/i.test(key)),
    ...Object.keys(rightStorage).filter((key) => /local.*leaderboard|leaderboard.*local/i.test(key))
  ])).sort();
  localLeaderboardKeys.forEach((key) => {
    const merged = mergeRecordValue(
      parseStorageJson(leftStorage, key, leftStorage[key]),
      parseStorageJson(rightStorage, key, rightStorage[key])
    );
    output[key] = typeof merged === 'string' ? merged : JSON.stringify(merged);
  });

  const identityStorage = identitySource.legacyStorage || {};
  const preferredStorage = preferred.legacyStorage || {};
  if (identityStorage[ONLINE_PLAYER_KEY]) output[ONLINE_PLAYER_KEY] = identityStorage[ONLINE_PLAYER_KEY];
  if (preferredStorage[ONLINE_NAME_KEY]) output[ONLINE_NAME_KEY] = preferredStorage[ONLINE_NAME_KEY];
  return sanitizeLegacyStorage(output);
}

export function mergeCloudProfiles(leftValue, rightValue, { now = Date.now() } = {}) {
  const leftValidation = validateCloudProfile(leftValue);
  const rightValidation = validateCloudProfile(rightValue);
  if (!leftValidation.valid && !rightValidation.valid) {
    throw new TypeError('Neither profile is valid.');
  }
  if (!leftValidation.valid) return rightValidation.profile;
  if (!rightValidation.valid) return leftValidation.profile;

  const left = leftValidation.profile;
  const right = rightValidation.profile;
  const preferred = newerProfile(left, right);
  const identitySource = identityProfile(left, right);
  const baseStorage = { ...left.legacyStorage, ...right.legacyStorage, ...preferred.legacyStorage };
  const mergedStorage = mergeSpecialStorage(baseStorage, left, right, preferred, identitySource);
  const metadata = normalizeMetadata({
    ...preferred.metadata,
    lastMergeAt: integer(now, Date.now(), 1),
    lastSyncAt: integer(now, Date.now(), 1),
    lastSyncReason: 'profile-merge',
    corruptionRecoveries: Math.max(
      integer(left.metadata?.corruptionRecoveries, 0),
      integer(right.metadata?.corruptionRecoveries, 0)
    ),
    migrationSources: [
      ...(left.metadata?.migrationSources || []),
      ...(right.metadata?.migrationSources || []),
      'deterministic-merge'
    ]
  });

  return createGuestCloudProfile({
    profileId: identitySource.profileId,
    legacyStorage: mergedStorage,
    now: integer(now, Date.now(), 1),
    createdAt: Math.min(left.createdAt, right.createdAt),
    revision: Math.max(left.revision, right.revision) + 1,
    metadata
  });
}

export function createCloudProfileExport(profileValue, { exportedAt = Date.now() } = {}) {
  const validation = validateCloudProfile(profileValue);
  if (!validation.valid) throw new TypeError(`Invalid profile: ${validation.errors.join(', ')}`);
  const profile = validation.profile;
  return {
    exportType: CLOUD_PROFILE_SCHEMA,
    exportVersion: 1,
    exportedAt: integer(exportedAt, Date.now(), 1),
    checksum: profileChecksum(profile),
    profile
  };
}

export function parseCloudProfileImport(textOrValue) {
  let value = textOrValue;
  if (typeof textOrValue === 'string') {
    try {
      value = JSON.parse(textOrValue);
    } catch {
      return { valid: false, errors: ['IMPORT_JSON_INVALID'], profile: null };
    }
  }
  const validation = validateCloudProfile(value);
  if (!validation.valid) return validation;
  if (isPlainObject(value) && typeof value.checksum === 'string') {
    const actual = profileChecksum(validation.profile);
    if (actual !== value.checksum) {
      return { valid: false, errors: ['IMPORT_CHECKSUM_MISMATCH'], profile: null };
    }
  }
  return validation;
}

export function getCloudProfileMergePolicy() {
  return Object.freeze({
    identity: 'oldest-profile-id; newest display name',
    progression: 'maximum durable counters and records',
    achievements: 'union; earliest unlock timestamp',
    localLeaderboards: 'deduplicate by run identity and merge records',
    onlinePending: 'union by run identity',
    settings: 'newer profile wins per stored setting key',
    revision: 'max revision plus one'
  });
}
