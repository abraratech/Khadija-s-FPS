// LOADOUT.2 R1 — saved loadouts, weapon mastery, operator specialization, and functional melee UI.
import {
  LOADOUT_PATCH,
  LOADOUT_PROFILE_KEY,
  LOADOUT_BACKUP_KEY,
  LOADOUT_CORRUPT_KEY,
  LOADOUT_RUN_SNAPSHOT_KEY,
  MAX_LOADOUT_PRESETS,
  MAX_AVATAR_PRESETS,
  LOADOUT_WEAPON_CATALOG,
  LOADOUT_DOCTRINES,
  LOADOUT_MELEE_CATALOG,
  createDefaultLoadoutProfile,
  normalizeLoadoutProfile,
  parseLoadoutProfile,
  serializeLoadoutProfile,
  getActiveLoadoutPreset,
  getActiveAvatarPreset,
  getProgressionCosmeticCollection,
  sanitizePresetCosmetics,
  createFrozenLoadoutSnapshot,
  getWeaponCatalogEntry,
  getDoctrineEntry,
  loadoutProfileFingerprint,
} from './loadout_core.js';
import {
  AVATAR_PROFILE_KEY,
  DEFAULT_AVATAR_PROFILE,
  normalizeAvatarProfile,
  parseAvatarProfile,
} from './avatar_customization_core.js';
import { LOADOUT2_SPECIALIZATIONS } from './loadout2_mastery_core.js';

const root = typeof document !== 'undefined' ? document.documentElement : null;
const DEFAULT_TOAST = () => {};
const DEFAULT_PROGRESSION = () => ({ profile: { unlocks: {}, equipped: {} }, unlocks: [] });

let adapters = {
  showToast: DEFAULT_TOAST,
  getProgressionSnapshot: DEFAULT_PROGRESSION,
  equipProgressionCosmetic: () => ({ ok: false, reason: 'NOT_CONFIGURED' }),
};

let profile = null;
let initialized = false;
let activeEditorId = '';
let selectedAvatarPresetId = '';
let lastStoredRaw = '';
let refreshTimer = null;

function storageGet(key, session = false) {
  try {
    const storage = session ? globalThis.sessionStorage : globalThis.localStorage;
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key, value, session = false) {
  try {
    const storage = session ? globalThis.sessionStorage : globalThis.localStorage;
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(key, session = false) {
  try {
    const storage = session ? globalThis.sessionStorage : globalThis.localStorage;
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}

function safeJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanName(value, fallback = 'Field Plan') {
  return String(value || fallback).trim().replace(/\s+/g, ' ').slice(0, 28) || fallback;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));
}

function currentAvatarProfile() {
  const runtime = globalThis.window?.KHADIJA_AVATAR;
  if (runtime?.getProfile) return normalizeAvatarProfile(runtime.getProfile());
  return parseAvatarProfile(storageGet(AVATAR_PROFILE_KEY) || '') || DEFAULT_AVATAR_PROFILE;
}

function progressionProfile() {
  const snapshot = adapters.getProgressionSnapshot?.() || {};
  return snapshot.profile || {};
}

function backupRaw(raw, reason = 'update') {
  if (!raw) return;
  storageSet(LOADOUT_BACKUP_KEY, JSON.stringify({
    version: 1,
    patch: LOADOUT_PATCH,
    reason,
    backedUpAt: Date.now(),
    raw: String(raw).slice(0, 600000),
  }));
}

function loadProfile({ persistRecovery = true } = {}) {
  const raw = storageGet(LOADOUT_PROFILE_KEY) || '';
  const parsed = parseLoadoutProfile(raw, {
    now: Date.now(),
    avatarProfile: currentAvatarProfile(),
  });

  if (parsed.recovered && persistRecovery) {
    storageSet(LOADOUT_CORRUPT_KEY, JSON.stringify({
      version: 1,
      patch: LOADOUT_PATCH,
      reason: parsed.reason,
      preservedAt: Date.now(),
      raw: parsed.corruptRaw,
    }));
    storageSet(LOADOUT_PROFILE_KEY, serializeLoadoutProfile(parsed.profile));
  } else if (parsed.reason === 'MIGRATED' && persistRecovery) {
    backupRaw(raw, 'schema-migration');
    storageSet(LOADOUT_PROFILE_KEY, serializeLoadoutProfile(parsed.profile));
  } else if (!raw && persistRecovery) {
    storageSet(LOADOUT_PROFILE_KEY, serializeLoadoutProfile(parsed.profile));
  }

  lastStoredRaw = storageGet(LOADOUT_PROFILE_KEY) || serializeLoadoutProfile(parsed.profile);
  return parsed.profile;
}

function ensureProfile() {
  if (!profile) profile = loadProfile();
  return profile;
}

function notify(reason = 'updated') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('ka:loadout-profile-change', {
    detail: { reason, profile: getLoadoutProfileSnapshot() },
  }));
  window.dispatchEvent(new CustomEvent('ka:player-preferences-change', {
    detail: { reason: `loadout:${reason}` },
  }));
}

function persistProfile(next, reason = 'updated', { backup = true } = {}) {
  const currentRaw = storageGet(LOADOUT_PROFILE_KEY) || '';
  const normalized = normalizeLoadoutProfile({
    ...next,
    updatedAt: Date.now(),
  }, {
    now: Date.now(),
    avatarProfile: currentAvatarProfile(),
  });

  const serialized = serializeLoadoutProfile(normalized);
  if (backup && currentRaw && currentRaw !== serialized) backupRaw(currentRaw, reason);
  const ok = storageSet(LOADOUT_PROFILE_KEY, serialized);
  profile = normalized;
  lastStoredRaw = serialized;
  activeEditorId = profile.presets.some((entry) => entry.id === activeEditorId)
    ? activeEditorId
    : profile.activeLoadoutId;
  selectedAvatarPresetId = profile.avatarPresets.some((entry) => entry.id === selectedAvatarPresetId)
    ? selectedAvatarPresetId
    : profile.activeAvatarPresetId;
  syncRootState();
  renderAll();
  notify(reason);
  return { ok, profile: getLoadoutProfileSnapshot() };
}

function syncRootState() {
  if (!root) return;
  const active = getActiveLoadoutPreset(ensureProfile());
  root.dataset.kaLoadout = 'ready';
  root.dataset.kaLoadoutPatch = LOADOUT_PATCH;
  root.dataset.kaLoadoutActive = active?.id || '';
  root.dataset.kaLoadoutDoctrine = active?.doctrine || 'BALANCED';
}

function makeId(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function getPreset(id = activeEditorId) {
  const current = ensureProfile();
  return current.presets.find((entry) => entry.id === id)
    || getActiveLoadoutPreset(current);
}

function getAvatarPreset(id = selectedAvatarPresetId) {
  const current = ensureProfile();
  return current.avatarPresets.find((entry) => entry.id === id)
    || getActiveAvatarPreset(current);
}

function applyAvatarProfile(avatar) {
  const normalized = normalizeAvatarProfile(avatar);
  const runtime = globalThis.window?.KHADIJA_AVATAR;
  if (runtime?.setProfile) {
    runtime.setProfile(normalized);
    return true;
  }
  storageSet(AVATAR_PROFILE_KEY, JSON.stringify(normalized));
  if (root) {
    root.dataset.kaAvatarApplied = 'pending';
  }
  return true;
}

function applyCosmetics(cosmetics) {
  const safe = sanitizePresetCosmetics({ cosmetics }, progressionProfile());
  for (const id of [safe.title, safe.badge, safe.banner]) {
    adapters.equipProgressionCosmetic?.(id);
  }
  return safe;
}

function applyPresetPresentation(preset) {
  const current = ensureProfile();
  const avatarPreset = current.avatarPresets.find((entry) => entry.id === preset.avatarPresetId)
    || getActiveAvatarPreset(current);
  applyAvatarProfile(avatarPreset.avatar);
  const cosmetics = applyCosmetics(preset.cosmetics);
  return { avatarPreset, cosmetics };
}

export function getLoadoutProfileSnapshot() {
  return JSON.parse(JSON.stringify(ensureProfile()));
}

export function getCurrentLoadoutPreset() {
  return JSON.parse(JSON.stringify(getActiveLoadoutPreset(ensureProfile())));
}

export function activateLoadoutPreset(id, { applyPresentation = true } = {}) {
  const current = ensureProfile();
  const preset = current.presets.find((entry) => entry.id === String(id || ''));
  if (!preset) return { ok: false, reason: 'LOADOUT_NOT_FOUND' };

  const next = {
    ...current,
    activeLoadoutId: preset.id,
    activeAvatarPresetId: preset.avatarPresetId,
  };
  const saved = persistProfile(next, 'loadout-activated');
  activeEditorId = preset.id;
  if (applyPresentation) applyPresetPresentation(preset);
  globalThis.window?.KASelectLoadout2Specialization?.(preset.specializationId || 'FIELD_OPERATIVE');
  adapters.showToast?.(`${preset.name.toUpperCase()} ACTIVE`, '#00d4ff', 2200);
  return { ok: saved.ok, preset: JSON.parse(JSON.stringify(preset)) };
}

export function saveLoadoutPreset(input = {}, { activate = false } = {}) {
  const current = ensureProfile();
  const id = String(input.id || activeEditorId || '').trim();
  const index = current.presets.findIndex((entry) => entry.id === id);
  const existing = index >= 0 ? current.presets[index] : null;

  if (!existing && current.presets.length >= MAX_LOADOUT_PRESETS) {
    return { ok: false, reason: 'LOADOUT_LIMIT' };
  }

  const requested = {
    ...(existing || {}),
    id: existing?.id || makeId('loadout'),
    name: cleanName(input.name, existing?.name || `Field Plan ${current.presets.length + 1}`),
    primary: input.primary || existing?.primary || 'SMG',
    secondary: input.secondary || existing?.secondary || 'SHOTGUN',
    melee: input.melee || existing?.melee || 'FIELD_KNIFE',
    specializationId: input.specializationId || existing?.specializationId || 'FIELD_OPERATIVE',
    doctrine: input.doctrine || existing?.doctrine || 'BALANCED',
    avatarPresetId: input.avatarPresetId || existing?.avatarPresetId || current.activeAvatarPresetId,
    cosmetics: input.cosmetics || existing?.cosmetics || {},
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  const presets = current.presets.slice();
  if (existing) presets[index] = requested;
  else presets.push(requested);

  const next = {
    ...current,
    presets,
    activeLoadoutId: activate ? requested.id : current.activeLoadoutId,
  };
  const saved = persistProfile(next, existing ? 'loadout-updated' : 'loadout-created');
  activeEditorId = requested.id;
  if (activate) activateLoadoutPreset(requested.id);
  return { ok: saved.ok, preset: getPreset(requested.id) };
}

export function duplicateLoadoutPreset(id = activeEditorId) {
  const current = ensureProfile();
  if (current.presets.length >= MAX_LOADOUT_PRESETS) {
    return { ok: false, reason: 'LOADOUT_LIMIT' };
  }
  const source = getPreset(id);
  return saveLoadoutPreset({
    ...source,
    id: makeId('loadout'),
    name: cleanName(`${source.name} Copy`),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export function deleteLoadoutPreset(id = activeEditorId) {
  const current = ensureProfile();
  if (current.presets.length <= 1) return { ok: false, reason: 'LAST_LOADOUT' };
  const filtered = current.presets.filter((entry) => entry.id !== id);
  if (filtered.length === current.presets.length) return { ok: false, reason: 'LOADOUT_NOT_FOUND' };
  const activeLoadoutId = current.activeLoadoutId === id ? filtered[0].id : current.activeLoadoutId;
  const saved = persistProfile({ ...current, presets: filtered, activeLoadoutId }, 'loadout-deleted');
  activeEditorId = activeLoadoutId;
  return { ok: saved.ok };
}

export function saveAvatarPreset({
  id = '',
  name = '',
  avatar = currentAvatarProfile(),
  activate = false,
} = {}) {
  const current = ensureProfile();
  const index = current.avatarPresets.findIndex((entry) => entry.id === id);
  const existing = index >= 0 ? current.avatarPresets[index] : null;

  if (!existing && current.avatarPresets.length >= MAX_AVATAR_PRESETS) {
    return { ok: false, reason: 'AVATAR_LIMIT' };
  }

  const requested = {
    ...(existing || {}),
    id: existing?.id || makeId('avatar'),
    name: cleanName(name, existing?.name || `Operator ${current.avatarPresets.length + 1}`),
    avatar: normalizeAvatarProfile(avatar),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  const avatarPresets = current.avatarPresets.slice();
  if (existing) avatarPresets[index] = requested;
  else avatarPresets.push(requested);

  const next = {
    ...current,
    avatarPresets,
    activeAvatarPresetId: activate ? requested.id : current.activeAvatarPresetId,
  };
  const saved = persistProfile(next, existing ? 'avatar-preset-updated' : 'avatar-preset-created');
  selectedAvatarPresetId = requested.id;
  if (activate) applyAvatarPreset(requested.id);
  return { ok: saved.ok, preset: getAvatarPreset(requested.id) };
}

export function applyAvatarPreset(id = selectedAvatarPresetId) {
  const current = ensureProfile();
  const preset = current.avatarPresets.find((entry) => entry.id === id);
  if (!preset) return { ok: false, reason: 'AVATAR_PRESET_NOT_FOUND' };
  applyAvatarProfile(preset.avatar);
  const next = { ...current, activeAvatarPresetId: preset.id };
  const saved = persistProfile(next, 'avatar-preset-applied');
  selectedAvatarPresetId = preset.id;
  adapters.showToast?.(`${preset.name.toUpperCase()} APPLIED`, '#22ff88', 2000);
  return { ok: saved.ok, preset: JSON.parse(JSON.stringify(preset)) };
}

export function duplicateAvatarPreset(id = selectedAvatarPresetId) {
  const current = ensureProfile();
  if (current.avatarPresets.length >= MAX_AVATAR_PRESETS) {
    return { ok: false, reason: 'AVATAR_LIMIT' };
  }
  const source = getAvatarPreset(id);
  return saveAvatarPreset({
    avatar: source.avatar,
    name: `${source.name} Copy`,
  });
}

export function deleteAvatarPreset(id = selectedAvatarPresetId) {
  const current = ensureProfile();
  if (current.avatarPresets.length <= 1) return { ok: false, reason: 'LAST_AVATAR_PRESET' };
  const avatarPresets = current.avatarPresets.filter((entry) => entry.id !== id);
  if (avatarPresets.length === current.avatarPresets.length) {
    return { ok: false, reason: 'AVATAR_PRESET_NOT_FOUND' };
  }
  const replacement = avatarPresets[0].id;
  const presets = current.presets.map((entry) => (
    entry.avatarPresetId === id ? { ...entry, avatarPresetId: replacement, updatedAt: Date.now() } : entry
  ));
  const activeAvatarPresetId = current.activeAvatarPresetId === id ? replacement : current.activeAvatarPresetId;
  const saved = persistProfile({
    ...current,
    avatarPresets,
    presets,
    activeAvatarPresetId,
  }, 'avatar-preset-deleted');
  selectedAvatarPresetId = activeAvatarPresetId;
  return { ok: saved.ok };
}

function parseRunSnapshot(raw) {
  const value = safeJson(raw, null);
  if (
    !value
    || value.patch !== LOADOUT_PATCH
    || value.balancePolicy?.grantsCombatPower !== true
    || value.balancePolicy?.pveOnlyBonuses !== true
    || value.balancePolicy?.pvpIsolated !== true
  ) {
    return null;
  }
  return value;
}

export function getFrozenLoadoutForRun() {
  const value = parseRunSnapshot(storageGet(LOADOUT_RUN_SNAPSHOT_KEY, true));
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

export function freezeActiveLoadoutForRun({
  reuseExisting = false,
  runId = '',
  mapId = 'grid_bunker',
  difficulty = 1,
  mode = 'single',
} = {}) {
  const existing = getFrozenLoadoutForRun();
  if (reuseExisting && existing) return existing;

  const snapshot = createFrozenLoadoutSnapshot(
    ensureProfile(),
    progressionProfile(),
    { now: Date.now(), runId, mapId, difficulty, mode },
  );
  storageSet(LOADOUT_RUN_SNAPSHOT_KEY, JSON.stringify(snapshot), true);
  applyAvatarProfile(snapshot.avatar);
  applyCosmetics(snapshot.cosmetics);
  if (root) {
    root.dataset.kaRunLoadout = snapshot.loadoutId;
    root.dataset.kaRunLoadoutPolicy = 'bounded-pve-pvp-isolated';
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ka:loadout-run-frozen', { detail: snapshot }));
  }
  return JSON.parse(JSON.stringify(snapshot));
}

export function clearFrozenLoadoutForRun() {
  storageRemove(LOADOUT_RUN_SNAPSHOT_KEY, true);
  if (root) {
    delete root.dataset.kaRunLoadout;
    delete root.dataset.kaRunLoadoutPolicy;
  }
}

function requirementLabel(entry) {
  const requirement = entry?.requirement || {};
  if (requirement.type === 'LEVEL') return `Reach level ${requirement.value}`;
  if (requirement.type === 'STAT') {
    const field = String(requirement.field || '').replace(/([A-Z])/g, ' $1').replace(/^total /i, '');
    return `${requirement.value} ${field}`.trim();
  }
  return 'Career milestone';
}

function optionMarkup(entries, selected, { labelKey = 'label', idKey = 'id' } = {}) {
  return entries.map((entry) => (
    `<option value="${escapeHtml(entry[idKey])}"${entry[idKey] === selected ? ' selected' : ''}>${escapeHtml(entry[labelKey])}</option>`
  )).join('');
}

function unlockedCosmeticsByKind(kind) {
  return getProgressionCosmeticCollection(progressionProfile())
    .filter((entry) => entry.kind === kind && entry.unlocked);
}

function renderLoadoutCommand() {
  const container = document.getElementById('ka-loadout-command');
  if (!container) return;

  const current = ensureProfile();
  const active = getActiveLoadoutPreset(current);
  const editor = getPreset(activeEditorId || active.id);
  activeEditorId = editor.id;
  const titleOptions = unlockedCosmeticsByKind('TITLE');
  const badgeOptions = unlockedCosmeticsByKind('BADGE');
  const bannerOptions = unlockedCosmeticsByKind('BANNER');
  const collection = getProgressionCosmeticCollection(progressionProfile());
  const unlockedCount = collection.filter((entry) => entry.unlocked).length;
  const mastery = adapters.getProgressionSnapshot?.()?.loadout2 || null;
  const masteryFamilies = Array.isArray(mastery?.families) ? mastery.families : [];

  container.innerHTML = `
    <section class="ka-loadout-command-card" aria-labelledby="ka-loadout-command-title">
      <header class="ka-loadout-command-head">
        <div>
          <span class="ka-card-kicker">LOADOUT.2 · ${escapeHtml(LOADOUT_PATCH)}</span>
          <strong id="ka-loadout-command-title">FIELD LOADOUT COMMAND</strong>
          <small>Configure weapon priorities, operator specialization, Field Knife access, mastery unlocks, Avatar Studio presets, and profile cosmetics.</small>
        </div>
        <div class="ka-loadout-active-chip">
          <span>ACTIVE</span>
          <b>${escapeHtml(active.name)}</b>
          <small>${escapeHtml(getDoctrineEntry(active.doctrine)?.label || active.doctrine)}</small>
        </div>
      </header>

      <div class="ka-loadout-preset-strip" role="list" aria-label="Saved loadout presets">
        ${current.presets.map((entry) => `
          <button type="button" class="ka-loadout-preset-card${entry.id === editor.id ? ' selected' : ''}${entry.id === current.activeLoadoutId ? ' active' : ''}" data-loadout-edit="${escapeHtml(entry.id)}">
            <span>${entry.id === current.activeLoadoutId ? 'ACTIVE' : 'SAVED'}</span>
            <b>${escapeHtml(entry.name)}</b>
            <small>${escapeHtml(entry.primary)} · ${escapeHtml(entry.secondary)}</small>
          </button>
        `).join('')}
      </div>

      <div class="ka-loadout-editor-grid">
        <label><span>Preset name</span><input id="ka-loadout-name" maxlength="28" value="${escapeHtml(editor.name)}"></label>
        <label><span>Primary priority</span><select id="ka-loadout-primary">${optionMarkup(LOADOUT_WEAPON_CATALOG.filter((entry) => entry.role === 'PRIMARY'), editor.primary)}</select></label>
        <label><span>Secondary priority</span><select id="ka-loadout-secondary">${optionMarkup(LOADOUT_WEAPON_CATALOG, editor.secondary)}</select></label>
        <label><span>Doctrine</span><select id="ka-loadout-doctrine">${optionMarkup(LOADOUT_DOCTRINES, editor.doctrine)}</select></label>
        <label><span>Melee profile</span><select id="ka-loadout-melee">${optionMarkup(LOADOUT_MELEE_CATALOG, editor.melee)}</select></label>
        <label><span>Operator specialization</span><select id="ka-loadout-specialization">${optionMarkup(LOADOUT2_SPECIALIZATIONS, editor.specializationId || 'FIELD_OPERATIVE')}</select></label>
        <label><span>Avatar preset</span><select id="ka-loadout-avatar">${optionMarkup(current.avatarPresets, editor.avatarPresetId, { labelKey: 'name' })}</select></label>
        <label><span>Profile title</span><select id="ka-loadout-title">${optionMarkup(titleOptions, editor.cosmetics.title)}</select></label>
        <label><span>Badge</span><select id="ka-loadout-badge">${optionMarkup(badgeOptions, editor.cosmetics.badge)}</select></label>
        <label><span>Banner</span><select id="ka-loadout-banner">${optionMarkup(bannerOptions, editor.cosmetics.banner)}</select></label>
      </div>

      <div class="ka-loadout-actions">
        <button type="button" class="ka-link-btn" data-loadout-action="new"${current.presets.length >= MAX_LOADOUT_PRESETS ? ' disabled' : ''}>New</button>
        <button type="button" class="ka-link-btn" data-loadout-action="duplicate"${current.presets.length >= MAX_LOADOUT_PRESETS ? ' disabled' : ''}>Duplicate</button>
        <button type="button" class="ka-link-btn danger" data-loadout-action="delete"${current.presets.length <= 1 ? ' disabled' : ''}>Delete</button>
        <button type="button" class="ka-link-btn" data-loadout-action="save">Save Changes</button>
        <button type="button" class="ka-nav-btn" data-loadout-action="activate">Activate &amp; Apply</button>
      </div>

      <div class="ka-loadout-balance-note">
        <b>LOADOUT.2 COMBAT POLICY</b>
        <span>The Field Knife is available by default in solo and co-op with <b>V</b>. Mastery bonuses are bounded PvE tuning and are disabled in PvP.</span>
      </div>

      <details class="ka-loadout-collection" open>
        <summary>WEAPON MASTERY · ${escapeHtml(mastery?.specialization?.label || 'Field Operative')} · RANK ${Number(mastery?.specializationRank || 1)}</summary>
        <div class="ka-loadout-collection-grid ka-loadout-mastery-grid">
          ${masteryFamilies.map((entry) => `
            <article class="unlocked">
              <span>${escapeHtml(entry.familyId)}</span>
              <b>LEVEL ${Number(entry.level || 1)}</b>
              <small>${Number(entry.xp || 0)} XP · ${(entry.unlockDetails || []).map((unlock) => escapeHtml(unlock.label)).join(' · ') || 'Base handling'}</small>
            </article>
          `).join('')}
        </div>
      </details>

      <details class="ka-loadout-collection">
        <summary>COSMETIC COLLECTION · ${unlockedCount}/${collection.length} UNLOCKED</summary>
        <div class="ka-loadout-collection-grid">
          ${collection.map((entry) => `
            <article class="${entry.unlocked ? 'unlocked' : 'locked'}${entry.equipped ? ' equipped' : ''}">
              <span>${escapeHtml(entry.kind)}</span>
              <b>${escapeHtml(entry.label)}</b>
              <small>${escapeHtml(entry.unlocked ? entry.description : requirementLabel(entry))}</small>
            </article>
          `).join('')}
        </div>
      </details>
    </section>
  `;
}

function renderAvatarPresets() {
  const container = document.getElementById('ka-avatar-presets');
  if (!container) return;
  const current = ensureProfile();
  const selected = getAvatarPreset(selectedAvatarPresetId || current.activeAvatarPresetId);
  selectedAvatarPresetId = selected.id;

  container.innerHTML = `
    <section class="ka-avatar-preset-manager" aria-labelledby="ka-avatar-preset-title">
      <header>
        <div><span class="ka-card-kicker">Saved identities</span><strong id="ka-avatar-preset-title">AVATAR PRESETS</strong></div>
        <small>${current.avatarPresets.length}/${MAX_AVATAR_PRESETS} saved</small>
      </header>
      <div class="ka-avatar-preset-row">
        ${current.avatarPresets.map((entry) => `
          <button type="button" class="ka-avatar-preset-card${entry.id === selected.id ? ' selected' : ''}${entry.id === current.activeAvatarPresetId ? ' active' : ''}" data-avatar-preset-select="${escapeHtml(entry.id)}">
            <span>${entry.id === current.activeAvatarPresetId ? 'ACTIVE' : 'SAVED'}</span>
            <b>${escapeHtml(entry.name)}</b>
          </button>
        `).join('')}
      </div>
      <label class="ka-avatar-preset-name"><span>Preset name</span><input id="ka-avatar-preset-name" maxlength="28" value="${escapeHtml(selected.name)}"></label>
      <div class="ka-avatar-preset-actions">
        <button type="button" class="ka-link-btn" data-avatar-preset-action="new"${current.avatarPresets.length >= MAX_AVATAR_PRESETS ? ' disabled' : ''}>Save Current as New</button>
        <button type="button" class="ka-link-btn" data-avatar-preset-action="update">Update Selected</button>
        <button type="button" class="ka-link-btn" data-avatar-preset-action="duplicate"${current.avatarPresets.length >= MAX_AVATAR_PRESETS ? ' disabled' : ''}>Duplicate</button>
        <button type="button" class="ka-link-btn danger" data-avatar-preset-action="delete"${current.avatarPresets.length <= 1 ? ' disabled' : ''}>Delete</button>
        <button type="button" class="ka-nav-btn" data-avatar-preset-action="apply">Apply Preset</button>
      </div>
    </section>
  `;
}

function renderAll() {
  if (typeof document === 'undefined') return;
  renderLoadoutCommand();
  renderAvatarPresets();
}

function readLoadoutForm() {
  const editor = getPreset(activeEditorId);
  return {
    id: editor.id,
    name: document.getElementById('ka-loadout-name')?.value || editor.name,
    primary: document.getElementById('ka-loadout-primary')?.value || editor.primary,
    secondary: document.getElementById('ka-loadout-secondary')?.value || editor.secondary,
    doctrine: document.getElementById('ka-loadout-doctrine')?.value || editor.doctrine,
    melee: document.getElementById('ka-loadout-melee')?.value || editor.melee,
    specializationId: document.getElementById('ka-loadout-specialization')?.value || editor.specializationId || 'FIELD_OPERATIVE',
    avatarPresetId: document.getElementById('ka-loadout-avatar')?.value || editor.avatarPresetId,
    cosmetics: {
      title: document.getElementById('ka-loadout-title')?.value || editor.cosmetics.title,
      badge: document.getElementById('ka-loadout-badge')?.value || editor.cosmetics.badge,
      banner: document.getElementById('ka-loadout-banner')?.value || editor.cosmetics.banner,
    },
  };
}

function actionFailure(result, fallback) {
  const reasons = {
    LOADOUT_LIMIT: `Maximum ${MAX_LOADOUT_PRESETS} loadouts reached.`,
    AVATAR_LIMIT: `Maximum ${MAX_AVATAR_PRESETS} avatar presets reached.`,
    LAST_LOADOUT: 'At least one loadout must remain.',
    LAST_AVATAR_PRESET: 'At least one avatar preset must remain.',
    LOADOUT_NOT_FOUND: 'Loadout not found.',
    AVATAR_PRESET_NOT_FOUND: 'Avatar preset not found.',
  };
  adapters.showToast?.(reasons[result?.reason] || fallback || 'Action unavailable.', '#ff7b6b', 2400);
}

function bindUiEvents() {
  if (typeof document === 'undefined' || document.body.dataset.kaLoadoutBindings === 'ready') return;
  document.body.dataset.kaLoadoutBindings = 'ready';

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const edit = target.closest('[data-loadout-edit]');
    if (edit) {
      activeEditorId = edit.dataset.loadoutEdit || '';
      renderLoadoutCommand();
      return;
    }

    const loadoutAction = target.closest('[data-loadout-action]')?.dataset.loadoutAction;
    if (loadoutAction) {
      if (loadoutAction === 'new') {
        const result = saveLoadoutPreset({
          name: `Field Plan ${ensureProfile().presets.length + 1}`,
          primary: 'SMG',
          secondary: 'SHOTGUN',
          doctrine: 'BALANCED',
          specializationId: 'FIELD_OPERATIVE',
          avatarPresetId: ensureProfile().activeAvatarPresetId,
        });
        if (!result.ok) actionFailure(result);
        else activeEditorId = result.preset.id;
      } else if (loadoutAction === 'save') {
        const result = saveLoadoutPreset(readLoadoutForm());
        if (!result.ok) actionFailure(result);
        else adapters.showToast?.('LOADOUT SAVED', '#22ff88', 1800);
      } else if (loadoutAction === 'activate') {
        const saved = saveLoadoutPreset(readLoadoutForm());
        if (!saved.ok) actionFailure(saved);
        else activateLoadoutPreset(saved.preset.id);
      } else if (loadoutAction === 'duplicate') {
        const result = duplicateLoadoutPreset(activeEditorId);
        if (!result.ok) actionFailure(result);
        else activeEditorId = result.preset.id;
      } else if (loadoutAction === 'delete') {
        const result = deleteLoadoutPreset(activeEditorId);
        if (!result.ok) actionFailure(result);
      }
      renderAll();
      return;
    }

    const avatarSelect = target.closest('[data-avatar-preset-select]');
    if (avatarSelect) {
      selectedAvatarPresetId = avatarSelect.dataset.avatarPresetSelect || '';
      renderAvatarPresets();
      return;
    }

    const avatarAction = target.closest('[data-avatar-preset-action]')?.dataset.avatarPresetAction;
    if (avatarAction) {
      const name = document.getElementById('ka-avatar-preset-name')?.value || getAvatarPreset().name;
      let result = null;
      if (avatarAction === 'new') {
        result = saveAvatarPreset({ name, avatar: currentAvatarProfile() });
      } else if (avatarAction === 'update') {
        result = saveAvatarPreset({
          id: selectedAvatarPresetId,
          name,
          avatar: currentAvatarProfile(),
        });
      } else if (avatarAction === 'apply') {
        result = applyAvatarPreset(selectedAvatarPresetId);
      } else if (avatarAction === 'duplicate') {
        result = duplicateAvatarPreset(selectedAvatarPresetId);
      } else if (avatarAction === 'delete') {
        result = deleteAvatarPreset(selectedAvatarPresetId);
      }
      if (!result?.ok) actionFailure(result, 'Avatar preset action unavailable.');
      renderAll();
    }
  });
}

function refreshFromStorage() {
  const raw = storageGet(LOADOUT_PROFILE_KEY) || '';
  if (!raw || raw === lastStoredRaw) return false;
  const parsed = parseLoadoutProfile(raw, {
    now: Date.now(),
    avatarProfile: currentAvatarProfile(),
  });
  profile = parsed.profile;
  lastStoredRaw = raw;
  activeEditorId = profile.activeLoadoutId;
  selectedAvatarPresetId = profile.activeAvatarPresetId;
  syncRootState();
  renderAll();
  return true;
}

function initUi() {
  ensureProfile();
  activeEditorId ||= profile.activeLoadoutId;
  selectedAvatarPresetId ||= profile.activeAvatarPresetId;
  syncRootState();
  bindUiEvents();
  renderAll();

  window.addEventListener('storage', (event) => {
    if (event.key !== LOADOUT_PROFILE_KEY) return;
    refreshFromStorage();
  });
  window.addEventListener('focus', refreshFromStorage);
  window.addEventListener('ka-avatar-profile-change', () => {
    renderAvatarPresets();
  });
  window.addEventListener('ka:progression-updated', renderAll);

  refreshTimer = window.setInterval(() => {
    if (document.visibilityState !== 'hidden') refreshFromStorage();
  }, 5000);
  window.addEventListener('beforeunload', () => {
    if (refreshTimer) window.clearInterval(refreshTimer);
  }, { once: true });
}

export function initializeLoadoutSystems({
  showToast = null,
  getProgressionSnapshot = null,
  equipProgressionCosmetic = null,
} = {}) {
  if (typeof showToast === 'function') adapters.showToast = showToast;
  if (typeof getProgressionSnapshot === 'function') adapters.getProgressionSnapshot = getProgressionSnapshot;
  if (typeof equipProgressionCosmetic === 'function') adapters.equipProgressionCosmetic = equipProgressionCosmetic;

  if (initialized) {
    renderAll();
    return getLoadoutProfileSnapshot();
  }
  initialized = true;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUi, { once: true });
    else initUi();
  } else {
    ensureProfile();
  }
  return getLoadoutProfileSnapshot();
}

export function resetLoadoutProfile() {
  const raw = storageGet(LOADOUT_PROFILE_KEY);
  backupRaw(raw, 'manual-reset');
  const next = createDefaultLoadoutProfile({
    now: Date.now(),
    avatarProfile: currentAvatarProfile(),
  });
  clearFrozenLoadoutForRun();
  return persistProfile(next, 'manual-reset', { backup: false });
}

if (typeof window !== 'undefined') {
  window.KHADIJA_LOADOUT = Object.freeze({
    patch: LOADOUT_PATCH,
    getProfile: getLoadoutProfileSnapshot,
    getActivePreset: getCurrentLoadoutPreset,
    activate: activateLoadoutPreset,
    save: saveLoadoutPreset,
    duplicate: duplicateLoadoutPreset,
    remove: deleteLoadoutPreset,
    saveAvatarPreset,
    applyAvatarPreset,
    duplicateAvatarPreset,
    deleteAvatarPreset,
    freezeForRun: freezeActiveLoadoutForRun,
    getRunSnapshot: getFrozenLoadoutForRun,
    clearRunSnapshot: clearFrozenLoadoutForRun,
    reset: resetLoadoutProfile,
  });
}
