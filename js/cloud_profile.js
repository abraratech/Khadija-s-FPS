import {
  CLOUD_PROFILE_PATCH,
  CLOUD_PROFILE_SCHEMA,
  CLOUD_PROFILE_VERSION,
  createCloudProfileExport,
  createGuestCloudProfile,
  getCloudProfileMergePolicy,
  isGameOwnedStorageKey,
  mergeCloudProfiles,
  parseCloudProfileImport,
  profileChecksum,
  sanitizeLegacyStorage,
  validateCloudProfile
} from './cloud_profile_core.js';

const PRIMARY_KEY = 'ka_cloud_profile_v1';
const BACKUP_KEY = 'ka_cloud_profile_backup_v1';
const CORRUPT_KEY = 'ka_cloud_profile_corrupt_v1';
const REVISION_KEY = 'ka_cloud_profile_revision_v1';
const FORCE_HYDRATE_KEY = 'ka_cloud_profile_force_hydrate_v1';
const AUTO_SYNC_MS = 10000;

let currentProfile = null;
let initialized = false;
let syncTimer = null;
let scheduledSync = null;
let applyingProfile = false;
let statusMessage = 'LOCAL GUEST PROFILE';
let toast = null;

function nowMs() {
  return Date.now();
}

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return `guest-${globalThis.crypto.randomUUID()}`;
  } catch {
    // Fall through to a timestamp/random guest identity.
  }
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readRaw(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeRaw(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore restricted storage failures.
  }
}

function parseRawProfile(raw) {
  if (typeof raw !== 'string' || !raw) return { valid: false, errors: ['PROFILE_MISSING'], profile: null };
  try {
    return validateCloudProfile(JSON.parse(raw));
  } catch {
    return { valid: false, errors: ['PROFILE_JSON_INVALID'], profile: null };
  }
}

function captureLegacyStorage() {
  const values = {};
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!isGameOwnedStorageKey(key)) continue;
      const value = localStorage.getItem(key);
      if (typeof value === 'string') values[key] = value;
    }
  } catch {
    // A partial capture is still preferable to failing profile initialization.
  }
  return sanitizeLegacyStorage(values);
}

function migrationSources(storage) {
  const sources = [];
  if (storage.ka_progression_v1) sources.push('progression');
  if (storage.ka_challenges_v1) sources.push('achievements');
  if (storage.fps_hi_score || storage.fps_hi_wave) sources.push('records');
  if (Object.keys(storage).some((key) => key.includes('leaderboard'))) sources.push('leaderboards');
  if (Object.keys(storage).some((key) => /accessibility|preference|binding|controller|volume|graphics|selected_|mobile_/i.test(key))) sources.push('settings');
  return sources.length ? sources : ['fresh-guest'];
}

function quarantineCorruptProfile(raw, errors = []) {
  if (!raw) return;
  const payload = {
    capturedAt: nowMs(),
    errors: Array.isArray(errors) ? errors.slice(0, 12) : [String(errors)],
    raw: String(raw).slice(0, 700000)
  };
  writeRaw(CORRUPT_KEY, JSON.stringify(payload));
}

function writeProfile(profile, { backup = true } = {}) {
  const validation = validateCloudProfile(profile);
  if (!validation.valid) throw new TypeError(`Cloud profile validation failed: ${validation.errors.join(', ')}`);
  const normalized = validation.profile;

  if (backup) {
    const previousRaw = readRaw(PRIMARY_KEY, '');
    const previous = parseRawProfile(previousRaw);
    if (previous.valid && previous.profile.profileId === normalized.profileId) {
      writeRaw(BACKUP_KEY, JSON.stringify(previous.profile));
    }
  }

  if (!writeRaw(PRIMARY_KEY, JSON.stringify(normalized))) {
    throw new Error('PROFILE_STORAGE_WRITE_FAILED');
  }
  writeRaw(REVISION_KEY, String(normalized.revision));
  currentProfile = normalized;
  refreshProfileUi();
  return currentProfile;
}

function recoverOrCreateProfile() {
  const primaryRaw = readRaw(PRIMARY_KEY, '');
  const primary = parseRawProfile(primaryRaw);
  if (primary.valid) return primary.profile;

  if (primaryRaw) quarantineCorruptProfile(primaryRaw, primary.errors);

  const backupRaw = readRaw(BACKUP_KEY, '');
  const backup = parseRawProfile(backupRaw);
  if (backup.valid) {
    const recovered = createGuestCloudProfile({
      profileId: backup.profile.profileId,
      legacyStorage: backup.profile.legacyStorage,
      createdAt: backup.profile.createdAt,
      now: nowMs(),
      revision: backup.profile.revision + 1,
      metadata: {
        ...backup.profile.metadata,
        lastSyncAt: nowMs(),
        lastSyncReason: 'backup-recovery',
        corruptionRecoveries: Number(backup.profile.metadata?.corruptionRecoveries || 0) + 1,
        migrationSources: [...(backup.profile.metadata?.migrationSources || []), 'backup-recovery']
      }
    });
    statusMessage = 'RECOVERED FROM BACKUP';
    return writeProfile(recovered, { backup: false });
  }

  const legacyStorage = captureLegacyStorage();
  const now = nowMs();
  const created = createGuestCloudProfile({
    profileId: randomId(),
    legacyStorage,
    now,
    createdAt: now,
    revision: 1,
    metadata: {
      migratedAt: now,
      lastSyncAt: now,
      lastSyncReason: 'initial-migration',
      migrationSources: migrationSources(legacyStorage),
      corruptionRecoveries: primaryRaw ? 1 : 0
    }
  });
  statusMessage = Object.keys(legacyStorage).length ? 'LEGACY SAVE MIGRATED' : 'NEW GUEST PROFILE';
  return writeProfile(created, { backup: false });
}

function applyProfileToLegacy(profile, { forceHydrate = false } = {}) {
  const validation = validateCloudProfile(profile);
  if (!validation.valid) throw new TypeError(`Cannot apply invalid profile: ${validation.errors.join(', ')}`);
  applyingProfile = true;
  try {
    for (const [key, value] of Object.entries(validation.profile.legacyStorage)) {
      writeRaw(key, value);
    }
    writeRaw(REVISION_KEY, String(validation.profile.revision));
    if (forceHydrate) writeRaw(FORCE_HYDRATE_KEY, '1');
  } finally {
    applyingProfile = false;
  }
  return validation.profile;
}

export function syncCloudProfile(reason = 'manual') {
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  if (applyingProfile) return getCloudProfileDiagnostics();
  const storage = captureLegacyStorage();
  const fingerprint = profileChecksum(storage);
  if (fingerprint === currentProfile.legacyFingerprint) {
    refreshProfileUi();
    return getCloudProfileDiagnostics();
  }

  const now = nowMs();
  const next = createGuestCloudProfile({
    profileId: currentProfile.profileId,
    legacyStorage: storage,
    createdAt: currentProfile.createdAt,
    now,
    revision: currentProfile.revision + 1,
    metadata: {
      ...currentProfile.metadata,
      lastSyncAt: now,
      lastSyncReason: String(reason || 'manual').slice(0, 80)
    }
  });
  writeProfile(next);
  statusMessage = 'PROFILE SAVED';
  refreshProfileUi();
  return getCloudProfileDiagnostics();
}

function scheduleProfileSync(reason = 'ui-change', delay = 80) {
  if (scheduledSync) clearTimeout(scheduledSync);
  scheduledSync = setTimeout(() => {
    scheduledSync = null;
    syncCloudProfile(reason);
  }, Math.max(0, Number(delay) || 0));
}

function formatTimestamp(value) {
  const timestamp = Number(value) || 0;
  if (!timestamp) return 'NOT YET';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return String(timestamp);
  }
}

function shortProfileId(profileId) {
  const value = String(profileId || 'guest');
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-7)}` : value;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function refreshProfileUi() {
  if (!currentProfile || typeof document === 'undefined') return;
  setText('cloud-profile-status', `${statusMessage} · LOCAL ONLY`);
  setText('cloud-profile-id', shortProfileId(currentProfile.profileId));
  setText('cloud-profile-revision', `REV ${currentProfile.revision}`);
  setText('cloud-profile-updated', formatTimestamp(currentProfile.updatedAt));
  document.documentElement.dataset.kaCloudProfile = 'ready';
  document.documentElement.dataset.kaCloudProfileRevision = String(currentProfile.revision);
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCloudProfile() {
  syncCloudProfile('manual-export');
  const envelope = createCloudProfileExport(currentProfile);
  const date = new Date(envelope.exportedAt).toISOString().slice(0, 10);
  downloadJson(`khadijas-arena-profile-${date}.json`, envelope);
  statusMessage = 'BACKUP EXPORTED';
  refreshProfileUi();
  return envelope;
}

export function importCloudProfileText(text, { merge = true, reload = false } = {}) {
  const imported = parseCloudProfileImport(text);
  if (!imported.valid) {
    statusMessage = `IMPORT REJECTED: ${imported.errors[0] || 'INVALID PROFILE'}`;
    refreshProfileUi();
    return Object.freeze({ accepted: false, errors: imported.errors });
  }

  syncCloudProfile('before-import');
  const next = merge
    ? mergeCloudProfiles(currentProfile, imported.profile, { now: nowMs() })
    : imported.profile;
  writeProfile(next);
  applyProfileToLegacy(next, { forceHydrate: true });
  statusMessage = merge ? 'BACKUP MERGED · RELOAD REQUIRED' : 'BACKUP RESTORED · RELOAD REQUIRED';
  refreshProfileUi();
  toast?.('PROFILE BACKUP APPLIED · RELOADING', '#22ff88', 1600);

  if (reload && typeof location !== 'undefined') {
    setTimeout(() => location.reload(), 500);
  }
  return Object.freeze({ accepted: true, merged: merge, profile: getCloudProfileDiagnostics() });
}

async function copyDiagnostics() {
  const text = JSON.stringify(getCloudProfileDiagnostics(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    statusMessage = 'DIAGNOSTICS COPIED';
  } catch {
    statusMessage = 'COPY BLOCKED · USE KAGETCLOUDPROFILEDIAGNOSTICS()';
  }
  refreshProfileUi();
}

function bindProfileUi() {
  document.getElementById('cloud-profile-export-btn')?.addEventListener('click', () => {
    exportCloudProfile();
  });
  document.getElementById('cloud-profile-import-btn')?.addEventListener('click', () => {
    document.getElementById('cloud-profile-import-file')?.click();
  });
  document.getElementById('cloud-profile-copy-btn')?.addEventListener('click', () => {
    void copyDiagnostics();
  });
  document.getElementById('cloud-profile-import-file')?.addEventListener('change', async (event) => {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      if (file.size > 3000000) throw new Error('BACKUP_FILE_TOO_LARGE');
      const text = await file.text();
      const confirmed = window.confirm('Merge this backup into the current guest profile? The game will reload after the merge.');
      if (confirmed) importCloudProfileText(text, { merge: true, reload: true });
    } catch (error) {
      statusMessage = `IMPORT FAILED: ${String(error?.message || error).slice(0, 80)}`;
      refreshProfileUi();
    } finally {
      input.value = '';
    }
  });
}

export function getCloudProfileSnapshot({ includeStorage = true } = {}) {
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  const clone = JSON.parse(JSON.stringify(currentProfile));
  if (!includeStorage) delete clone.legacyStorage;
  return clone;
}

export function getCloudProfileDiagnostics() {
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  const storage = currentProfile.legacyStorage || {};
  const storageBytes = Object.entries(storage).reduce((sum, [key, value]) => sum + key.length + String(value).length, 0);
  return Object.freeze({
    patch: CLOUD_PROFILE_PATCH,
    schema: CLOUD_PROFILE_SCHEMA,
    version: CLOUD_PROFILE_VERSION,
    accountType: currentProfile.accountType,
    profileId: currentProfile.profileId,
    revision: currentProfile.revision,
    createdAt: currentProfile.createdAt,
    updatedAt: currentProfile.updatedAt,
    legacyFingerprint: currentProfile.legacyFingerprint,
    storageEntries: Object.keys(storage).length,
    storageBytes,
    progression: currentProfile.progression,
    achievementsUnlocked: currentProfile.achievements?.totalUnlocked || 0,
    records: currentProfile.records,
    identity: currentProfile.identity,
    pendingSubmissions: currentProfile.pendingSubmissions?.length || 0,
    metadata: currentProfile.metadata,
    mergePolicy: getCloudProfileMergePolicy(),
    status: statusMessage,
    remoteSync: false,
    authentication: false
  });
}

export function initCloudProfile({ showToast = null } = {}) {
  if (typeof showToast === 'function') toast = showToast;
  if (!currentProfile) currentProfile = recoverOrCreateProfile();
  if (initialized) {
    refreshProfileUi();
    return getCloudProfileDiagnostics();
  }
  initialized = true;
  bindProfileUi();
  refreshProfileUi();

  document.addEventListener('input', () => scheduleProfileSync('settings-input'), true);
  document.addEventListener('change', () => scheduleProfileSync('settings-change'), true);
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-menu-screen="settings"], #keybind-modal, #pause-screen, #ka-local-leaderboards-dialog, #ka-online-leaderboards-dialog')) {
      scheduleProfileSync('profile-ui-action', 180);
    }
  }, true);
  window.addEventListener('ka:player-preferences-change', () => scheduleProfileSync('player-preferences'));
  window.addEventListener('storage', (event) => {
    if (isGameOwnedStorageKey(event.key)) scheduleProfileSync('cross-tab-storage', 20);
  });
  window.addEventListener('pagehide', () => syncCloudProfile('pagehide'));
  window.addEventListener('beforeunload', () => syncCloudProfile('beforeunload'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncCloudProfile('visibility-hidden');
  });

  syncTimer = setInterval(() => {
    if (document.visibilityState !== 'hidden') syncCloudProfile('periodic');
  }, AUTO_SYNC_MS);
  window.addEventListener('unload', () => {
    if (syncTimer) clearInterval(syncTimer);
  }, { once: true });

  queueMicrotask(() => syncCloudProfile('boot-complete'));
  return getCloudProfileDiagnostics();
}

if (typeof window !== 'undefined') {
  window.KAGetCloudProfile = () => getCloudProfileSnapshot({ includeStorage: true });
  window.KAGetCloudProfileDiagnostics = getCloudProfileDiagnostics;
  window.KASyncCloudProfile = syncCloudProfile;
  window.KAExportCloudProfile = exportCloudProfile;
  window.KAImportCloudProfileText = importCloudProfileText;
  window.KAValidateCloudProfile = validateCloudProfile;
  window.KAMergeCloudProfiles = mergeCloudProfiles;
  window.KAGetCloudProfileMergePolicy = getCloudProfileMergePolicy;
}
