// LIVE.1 R1 — Worker-time seasonal operations, rotating events and live UI.

import {
  LIVE1_PATCH,
  getLive1ContractPresentation,
  getLive1RewardPresentation,
  normalizeLive1Manifest
} from './live1_core.js';
import {
  getLive1ManifestSnapshot,
  getLive1RunDirective,
  getLive1ServerNow,
  setLive1ManifestSnapshot
} from './live1_state.js';

const CACHE_KEY = 'ka_live1_manifest_v1';
const CACHE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const REFRESH_RETRY_MS = 60 * 1000;

let initialized = false;
let getProgressionSnapshotRef = () => null;
let showToastRef = () => {};
let activeRun = null;
let refreshTimer = null;
let lastError = '';
let workerUrl = '';

function cleanText(value, fallback = '', max = 160) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readCachedManifest() {
  const raw = safeStorageGet(CACHE_KEY);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    if (
      !entry
      || entry.patch !== LIVE1_PATCH
      || !entry.manifest
      || Date.now() - Number(entry.cachedAt || 0) > CACHE_MAX_AGE_MS
    ) return null;
    return normalizeLive1Manifest(entry.manifest, Date.now());
  } catch {
    return null;
  }
}

function writeCachedManifest(manifest) {
  safeStorageSet(CACHE_KEY, JSON.stringify({
    patch: LIVE1_PATCH,
    cachedAt: Date.now(),
    manifest
  }));
}

function durationLabel(milliseconds) {
  const value = Math.max(0, Math.floor(Number(milliseconds) || 0));
  const days = Math.floor(value / 86_400_000);
  const hours = Math.floor((value % 86_400_000) / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  return `${Math.max(1, minutes)}M`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value ?? '');
}

function renderContracts(profile) {
  const host = document.getElementById('live1-contract-list');
  if (!host) return;
  const contracts = getLive1ContractPresentation(profile?.live1);
  host.replaceChildren(...contracts.map((entry, index) => {
    const card = document.createElement('article');
    card.className = `ka-live1-contract${entry.completed ? ' complete' : ''}`;
    card.innerHTML = `
      <div class="ka-live1-contract-top">
        <span>STAGE ${index + 1}</span>
        <b>${entry.completed ? 'COMPLETE' : `${entry.progress}/${entry.target}`}</b>
      </div>
      <strong>${entry.label}</strong>
      <small>${entry.description}</small>
      <div class="ka-live1-meter"><i style="width:${Math.min(100, entry.progress / entry.target * 100)}%"></i></div>
      <em>+${entry.xp} XP · +${entry.seasonPoints} SP</em>
    `;
    return card;
  }));
}

function renderRewards(profile) {
  const host = document.getElementById('live1-reward-list');
  if (!host) return;
  const rewards = getLive1RewardPresentation(profile?.live1);
  host.replaceChildren(...rewards.map((entry) => {
    const card = document.createElement('article');
    card.className = `ka-live1-reward${entry.unlocked ? ' unlocked' : ''}`;
    card.innerHTML = `
      <span>${entry.kind}</span>
      <strong>${entry.label}</strong>
      <small>${entry.description}</small>
      <b>${entry.unlocked ? 'UNLOCKED' : `${entry.progress}/${entry.threshold} SP`}</b>
    `;
    return card;
  }));
}

function renderManifest() {
  if (typeof document === 'undefined') return;
  const manifest = getLive1ManifestSnapshot();
  const progression = getProgressionSnapshotRef?.()?.profile || {};
  const liveProfile = progression.live1 || {};
  const status = document.getElementById('live1-status');

  if (!manifest) {
    if (status) {
      status.textContent = lastError
        ? `LIVE SERVICE RETRYING · ${lastError}`
        : 'CONNECTING TO LIVE SERVICE';
      status.dataset.tone = 'warning';
    }
    return;
  }

  if (status) {
    status.textContent = manifest.source === 'worker'
      ? 'WORKER TIME VERIFIED · AUTOMATIC PROTECTED CLAIMS'
      : 'OFFLINE CACHED SCHEDULE · REWARDS VERIFY ON RECONNECT';
    status.dataset.tone = manifest.source === 'worker' ? 'good' : 'warning';
  }

  setText('live1-season-label', manifest.season.label.toUpperCase());
  setText(
    'live1-season-time',
    `${durationLabel(manifest.season.endAt - getLive1ServerNow())} REMAINING`
  );
  setText(
    'live1-season-points',
    `${Number(liveProfile.seasonPoints || 0).toLocaleString()} SP`
  );
  setText(
    'live1-featured-arena',
    manifest.daily.featuredArena.label.toUpperCase()
  );
  setText(
    'live1-featured-operation',
    manifest.weekly.featuredOperation.label.toUpperCase()
  );
  setText(
    'live1-featured-encounter',
    manifest.daily.featuredEncounter.label.toUpperCase()
  );
  setText(
    'live1-next-rotation',
    durationLabel(manifest.validUntil - getLive1ServerNow())
  );

  renderContracts(progression);
  renderRewards(progression);
  updateRunHud();
}

function ensureHud() {
  if (typeof document === 'undefined') return null;
  let hud = document.getElementById('ka-live1-hud');
  if (hud) return hud;
  hud = document.createElement('aside');
  hud.id = 'ka-live1-hud';
  hud.className = 'ka-live1-hud';
  hud.hidden = true;
  hud.innerHTML = `
    <span>LIVE EVENT</span>
    <strong>OUTBREAK CYCLE</strong>
    <small>STANDARD DEPLOYMENT</small>
  `;
  document.body.appendChild(hud);
  return hud;
}

function updateRunHud() {
  const hud = ensureHud();
  if (!hud) return;
  if (!activeRun) {
    hud.hidden = true;
    return;
  }
  const directive = getLive1RunDirective(activeRun.mapId);
  if (!directive) {
    hud.hidden = true;
    return;
  }
  hud.hidden = false;
  hud.querySelector('strong').textContent = directive.seasonLabel.toUpperCase();
  const labels = [];
  if (directive.isFeaturedArena) labels.push('FEATURED ARENA');
  if (directive.isFeaturedOperationArena) labels.push('FEATURED OPERATION');
  labels.push(directive.featuredEncounterLabel.toUpperCase());
  hud.querySelector('small').textContent = labels.join(' · ');
}

async function discoverWorkerUrl() {
  if (workerUrl) return workerUrl;
  try {
    const response = await fetch('multiplayer-release.json', {
      cache: 'no-store'
    });
    const release = await response.json();
    workerUrl = cleanText(release?.workerUrl, '', 260).replace(/\/+$/, '');
  } catch {
    workerUrl = '';
  }
  return workerUrl;
}

function scheduleRefresh(manifest = getLive1ManifestSnapshot()) {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  const serverNow = getLive1ServerNow();
  const untilRotation = manifest
    ? Math.max(15_000, Number(manifest.validUntil || 0) - serverNow + 2_500)
    : REFRESH_RETRY_MS;
  refreshTimer = setTimeout(() => {
    void refreshLive1Manifest();
  }, Math.min(untilRotation, 6 * 60 * 60 * 1000));
}

export async function refreshLive1Manifest({ silent = false } = {}) {
  const endpoint = await discoverWorkerUrl();
  if (!endpoint) {
    lastError = 'WORKER URL UNAVAILABLE';
    renderManifest();
    scheduleRefresh(null);
    return null;
  }
  try {
    const response = await fetch(`${endpoint}/live/manifest`, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' }
    });
    const payload = await response.json();
    if (!response.ok || payload?.ok !== true) {
      throw new Error(cleanText(payload?.error, `HTTP ${response.status}`, 100));
    }
    const manifest = setLive1ManifestSnapshot(payload, {
      sourceName: 'worker',
      localReceivedAt: Date.now()
    });
    writeCachedManifest(manifest);
    lastError = '';
    renderManifest();
    scheduleRefresh(manifest);
    if (!silent) showToastRef?.(
      `${manifest.season.label.toUpperCase()} · LIVE SCHEDULE VERIFIED`,
      '#ff5fd2',
      2600
    );
    return manifest;
  } catch (error) {
    lastError = cleanText(error?.message, 'LIVE SERVICE OFFLINE', 100);
    renderManifest();
    scheduleRefresh(null);
    return null;
  }
}

export function beginLive1Run({
  runId = '',
  mapId = 'grid_bunker',
  difficulty = 1,
  mode = 'single'
} = {}) {
  const manifest = getLive1ManifestSnapshot();
  activeRun = {
    runId: cleanText(runId, `live-${Date.now()}`, 120),
    mapId: cleanText(mapId, 'grid_bunker', 80).toLowerCase(),
    difficulty: Math.max(0.5, Math.min(2, Number(difficulty) || 1)),
    mode: mode === 'multiplayer' ? 'multiplayer' : 'single',
    seasonId: manifest?.season?.id || '',
    manifestRevision: manifest?.revision || '',
    startedAt: Date.now()
  };
  updateRunHud();
  return Object.freeze({ ...activeRun });
}

export function endLive1Run() {
  const previous = activeRun ? { ...activeRun } : null;
  activeRun = null;
  updateRunHud();
  renderManifest();
  return previous;
}

export function getLive1RuntimeSnapshot() {
  return Object.freeze({
    patch: LIVE1_PATCH,
    initialized,
    manifest: getLive1ManifestSnapshot(),
    activeRun: activeRun ? { ...activeRun } : null,
    lastError
  });
}

export function initLive1Systems({
  getProgressionSnapshot = () => null,
  showToast = () => {}
} = {}) {
  if (initialized) return getLive1RuntimeSnapshot();
  initialized = true;
  getProgressionSnapshotRef = getProgressionSnapshot;
  showToastRef = showToast;

  const cached = readCachedManifest();
  if (cached) {
    setLive1ManifestSnapshot(cached, {
      sourceName: 'cache',
      localReceivedAt: Date.now()
    });
  }

  window.addEventListener('ka:progression-updated', renderManifest);
  window.addEventListener('ka:cloud-profile-applied', renderManifest);
  window.KAGetLive1 = getLive1RuntimeSnapshot;
  window.KARefreshLive1 = refreshLive1Manifest;

  renderManifest();
  void refreshLive1Manifest({ silent: true });
  return getLive1RuntimeSnapshot();
}
