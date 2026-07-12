// js/online_leaderboards.js
import {
  ONLINE_LEADERBOARD_DIFFICULTIES,
  ONLINE_LEADERBOARD_MAPS,
  ONLINE_LEADERBOARD_WORKER_URL,
  buildOnlineChallenge,
  buildOnlineSubmission,
  cleanOnlineDisplayName,
  createOnlineRunId,
  normalizeOnlineDifficulty,
  normalizeOnlineLeaderboardResponse,
  normalizeOnlineMap,
  normalizePendingOnlineSubmissions
} from './online_leaderboards_core.js';

const PLAYER_ID_KEY = 'ka_online_leaderboard_player_v1';
const DISPLAY_NAME_KEY = 'ka_online_leaderboard_name_v1';
const PENDING_KEY = 'ka_online_leaderboard_pending_v1';
const LAST_CATEGORY_KEY = 'ka_online_leaderboard_last_category_v1';
const LAST_SUBMISSION_KEY = 'ka_online_leaderboard_last_submission_v1';
const REQUEST_TIMEOUT_MS = 7000;

let activeRun = null;
let uiBound = false;
let latest = null;
let lastSubmission = loadLastSubmission();

function readStorage(key, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
}
function removeStorage(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
export function createOnlineLeaderboardPlayerToken({
  cryptoObject = globalThis.crypto,
  random = Math.random,
  now = Date.now
} = {}) {
  try {
    if (typeof cryptoObject?.randomUUID === 'function') {
      const value = String(cryptoObject.randomUUID())
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 96);
      if (value.length >= 8) return value;
    }
  } catch {
    // Fall through to getRandomValues or the compatibility path.
  }

  try {
    if (typeof cryptoObject?.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      cryptoObject.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fall through to the compatibility path.
  }

  const timestamp = Math.max(0, Math.floor(Number(now?.()) || Date.now())).toString(36);
  let entropy = '';
  for (let index = 0; index < 4; index += 1) {
    const sample = Math.max(0, Math.min(0.999999999999, Number(random?.()) || 0));
    entropy += Math.floor(sample * 0x100000000).toString(36).padStart(7, '0');
  }
  return `compat-${timestamp}-${entropy}`.slice(0, 96);
}

function playerId() {
  let value = readStorage(PLAYER_ID_KEY);
  if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(value)) {
    value = `player-${createOnlineLeaderboardPlayerToken()}`;
    writeStorage(PLAYER_ID_KEY, value);
  }
  return value;
}
function displayName() {
  const fallback = `Survivor-${playerId().slice(-4).toUpperCase()}`;
  return cleanOnlineDisplayName(readStorage(DISPLAY_NAME_KEY, fallback));
}
function numberFrom(source, paths, fallback = 0) {
  for (const path of paths) {
    let value = source;
    for (const part of path.split('.')) value = value?.[part];
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return fallback;
}
function make(tag, attrs = {}, text = '') {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') element.className = value;
    else element.setAttribute(key, String(value));
  }
  if (text) element.textContent = text;
  return element;
}
function formatTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function friendlyLeaderboardError(error) {
  const code = String(error?.message || error || 'ONLINE_UNAVAILABLE').replace(/^HTTP_/, 'HTTP ');
  const messages = {
    CHALLENGE_RATE_LIMITED: 'Too many score attempts. Try again shortly.',
    SUBMISSION_RATE_LIMITED: 'Too many score submissions. The run was queued.',
    CHALLENGE_EXPIRED: 'The score challenge expired and will be renewed.',
    CHALLENGE_NOT_FOUND: 'The score challenge expired and will be renewed.',
    CHALLENGE_ALREADY_USED: 'This run was already submitted.',
    LEADERBOARD_BINDING_UNAVAILABLE: 'Online rankings are temporarily unavailable.'
  };
  return messages[code] || code;
}
function setStatus(text, tone = '') {
  if (typeof document === 'undefined') return;
  const status = document.getElementById('ka-online-lb-status');
  if (status) {
    status.textContent = text;
    status.dataset.tone = tone;
  }
  const homeStatus = document.getElementById('ka-online-lb-home-status');
  if (homeStatus) {
    homeStatus.textContent = text;
    homeStatus.dataset.tone = tone;
  }
  document.documentElement.dataset.kaOnlineLeaderboardStatus = tone || 'idle';
}
function loadLastCategory() {
  try {
    const value = JSON.parse(readStorage(LAST_CATEGORY_KEY, '{}'));
    return {
      mapId: normalizeOnlineMap(value?.mapId),
      difficulty: normalizeOnlineDifficulty(value?.difficulty),
      scope: value?.scope === 'region' ? 'region' : 'global'
    };
  } catch {
    return { mapId: 'grid_bunker', difficulty: 'normal', scope: 'global' };
  }
}
function saveLastCategory(mapId, difficulty, scope = 'global') {
  const category = {
    mapId: normalizeOnlineMap(mapId),
    difficulty: normalizeOnlineDifficulty(difficulty),
    scope: scope === 'region' ? 'region' : 'global'
  };
  writeStorage(LAST_CATEGORY_KEY, JSON.stringify(category));
  return category;
}
function loadLastSubmission() {
  try {
    const value = JSON.parse(readStorage(LAST_SUBMISSION_KEY, 'null'));
    if (!value || typeof value !== 'object' || !value.message) return null;
    const category = {
      mapId: normalizeOnlineMap(value?.category?.mapId),
      difficulty: normalizeOnlineDifficulty(value?.category?.difficulty),
      scope: value?.category?.scope === 'region' ? 'region' : 'global'
    };
    return Object.freeze({
      accepted: value.accepted === true,
      queued: value.queued === true,
      runId: String(value.runId || ''),
      category: Object.freeze(category),
      globalRank: value.globalRank ?? null,
      regionRank: value.regionRank ?? null,
      reason: String(value.reason || ''),
      restored: true,
      message: String(value.message)
    });
  } catch {
    return null;
  }
}
function persistLastSubmission(value) {
  if (!value?.message) {
    removeStorage(LAST_SUBMISSION_KEY);
    return null;
  }
  writeStorage(LAST_SUBMISSION_KEY, JSON.stringify({
    accepted: value.accepted === true,
    queued: value.queued === true,
    runId: value.runId || '',
    category: value.category || null,
    globalRank: value.globalRank ?? null,
    regionRank: value.regionRank ?? null,
    reason: value.reason || '',
    message: value.message,
    savedAt: Date.now()
  }));
  return value;
}
function restoreHomeStatus() {
  if (!lastSubmission) lastSubmission = loadLastSubmission();
  if (lastSubmission?.message) setStatus(lastSubmission.message, lastSubmission.accepted ? 'pass' : 'offline');
  return lastSubmission;
}
function syncCategoryControls(category = loadLastCategory()) {
  if (typeof document === 'undefined') return;
  const map = document.getElementById('ka-online-lb-map');
  const difficulty = document.getElementById('ka-online-lb-difficulty');
  const scope = document.getElementById('ka-online-lb-scope');
  if (map) map.value = category.mapId;
  if (difficulty) difficulty.value = category.difficulty;
  if (scope) scope.value = category.scope;
}
async function requestJson(path, { method = 'GET', body = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${ONLINE_LEADERBOARD_WORKER_URL}${path}`, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok || value.ok !== true) throw new Error(String(value.error || `HTTP_${response.status}`));
    return value;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('REQUEST_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function issueChallenge(run) {
  const value = await requestJson('/leaderboards/challenge', {
    method: 'POST',
    body: buildOnlineChallenge(run)
  });
  run.challengeToken = String(value.challengeToken || '');
  run.challengeExpiresAt = Date.parse(value.expiresAt) || 0;
  run.region = String(value.region || 'ZZ');
  return run;
}
function pending() {
  try {
    return normalizePendingOnlineSubmissions(JSON.parse(readStorage(PENDING_KEY, '[]')));
  } catch {
    return normalizePendingOnlineSubmissions([]);
  }
}
function savePending(items) {
  writeStorage(PENDING_KEY, JSON.stringify(normalizePendingOnlineSubmissions(items)));
  updatePendingCount();
}
function queueSubmission(item) {
  const items = pending().filter((entry) => entry.runId !== item.runId);
  items.push({ ...item, queuedAt: new Date().toISOString() });
  savePending(items);
}
function updatePendingCount() {
  if (typeof document === 'undefined') return;
  const element = document.getElementById('ka-online-lb-pending');
  if (element) element.textContent = String(pending().length);
}

export function selectOnlineLeaderboardCategory(mapId, difficulty, scope = 'global', { refresh = false } = {}) {
  const category = saveLastCategory(mapId, difficulty, scope);
  syncCategoryControls(category);
  if (refresh) void refreshOnlineLeaderboard();
  return category;
}

export function beginOnlineLeaderboardRun({ mapId, difficulty, mode = 'single' } = {}) {
  activeRun = {
    playerId: playerId(),
    runId: createOnlineRunId(),
    mapId: normalizeOnlineMap(mapId),
    difficulty: normalizeOnlineDifficulty(difficulty),
    mode: String(mode).toLowerCase(),
    challengeToken: '',
    challengeExpiresAt: 0,
    region: 'ZZ'
  };
  if (activeRun.mode !== 'single') {
    return Promise.resolve({ accepted: false, reason: 'MULTIPLAYER_EXCLUDED' });
  }
  saveLastCategory(activeRun.mapId, activeRun.difficulty, loadLastCategory().scope);
  activeRun.challengePromise = issueChallenge(activeRun)
    .then(() => ({ accepted: true, runId: activeRun.runId }))
    .catch((error) => ({ accepted: false, reason: String(error?.message || error) }));
  return activeRun.challengePromise;
}

async function submitPayload(payload, { queueOnFailure = true } = {}) {
  try {
    let run = { ...payload };
    if (!run.challengeToken || Number(run.challengeExpiresAt || 0) <= Date.now() + 5000) {
      run = await issueChallenge(run);
    }
    const value = await requestJson('/leaderboards/submit', {
      method: 'POST',
      body: buildOnlineSubmission(run)
    });
    const category = selectOnlineLeaderboardCategory(run.mapId, run.difficulty, 'global', { refresh: false });
    lastSubmission = Object.freeze({
      accepted: true,
      queued: false,
      runId: run.runId,
      category,
      globalRank: value.globalRank ?? null,
      regionRank: value.regionRank ?? null,
      message: `ONLINE SCORE ACCEPTED · GLOBAL #${value.globalRank ?? '—'} · REGION #${value.regionRank ?? '—'}`
    });
    if (typeof document !== 'undefined') document.documentElement.dataset.kaOnlineLeaderboardLastRank = String(value.globalRank ?? 'outside-top-100');
    persistLastSubmission(lastSubmission);
    setStatus(lastSubmission.message, 'pass');
    return Object.freeze({ accepted: true, ...value });
  } catch (error) {
    if (queueOnFailure) queueSubmission(payload);
    const reason = friendlyLeaderboardError(error);
    lastSubmission = Object.freeze({
      accepted: false,
      queued: queueOnFailure,
      runId: payload.runId,
      category: saveLastCategory(payload.mapId, payload.difficulty, 'global'),
      reason,
      message: queueOnFailure ? `ONLINE SCORE QUEUED · ${reason}` : `ONLINE SCORE NOT SENT · ${reason}`
    });
    persistLastSubmission(lastSubmission);
    setStatus(lastSubmission.message, 'offline');
    return Object.freeze({ accepted: false, queued: queueOnFailure, reason });
  }
}

export function submitOnlineLeaderboardRun({
  mapId,
  difficulty,
  score = 0,
  wave = 1,
  kills = 0,
  summary = null,
  mode = 'single'
} = {}) {
  if (String(mode).toLowerCase() !== 'single') {
    return Promise.resolve(Object.freeze({ accepted: false, reason: 'MULTIPLAYER_EXCLUDED' }));
  }
  if (!activeRun || activeRun.mode !== 'single') beginOnlineLeaderboardRun({ mapId, difficulty, mode });
  const source = summary && typeof summary === 'object' ? summary : {};
  const payload = {
    ...activeRun,
    displayName: displayName(),
    mapId: normalizeOnlineMap(mapId),
    difficulty: normalizeOnlineDifficulty(difficulty),
    score: numberFrom(source, ['score', 'finalScore', 'combat.score'], score),
    wave: numberFrom(source, ['wave', 'highestWave', 'finalWave', 'combat.wave'], wave),
    kills: numberFrom(source, ['kills', 'eliminations', 'combat.kills'], kills),
    survivalSeconds: numberFrom(source, ['durationSeconds', 'survivalSeconds', 'survivalTimeSeconds', 'timeSeconds', 'combat.survivalSeconds'], 0),
    accuracy: numberFrom(source, ['accuracy', 'accuracyPercent', 'combat.accuracy'], 0),
    headshots: numberFrom(source, ['headshotKills', 'headshots', 'combat.headshots'], 0)
  };
  saveLastCategory(payload.mapId, payload.difficulty, 'global');
  return Promise.resolve(activeRun?.challengePromise)
    .catch(() => null)
    .then(() => submitPayload({
      ...payload,
      challengeToken: activeRun?.challengeToken || payload.challengeToken,
      challengeExpiresAt: activeRun?.challengeExpiresAt || payload.challengeExpiresAt,
      region: activeRun?.region || payload.region
    }));
}

async function retryPending() {
  const items = [...pending()];
  if (!items.length) {
    setStatus('NO QUEUED ONLINE SUBMISSIONS', 'pass');
    return Object.freeze({ accepted: true, remaining: 0 });
  }
  setStatus(`RETRYING ${items.length} ONLINE SUBMISSION${items.length === 1 ? '' : 'S'}…`, 'loading');
  const remaining = [];
  for (const item of items) {
    const result = await submitPayload(
      { ...item, challengeToken: '', challengeExpiresAt: 0 },
      { queueOnFailure: false }
    );
    if (!result.accepted) remaining.push(item);
  }
  savePending(remaining);
  setStatus(
    remaining.length
      ? `${remaining.length} ONLINE SUBMISSION${remaining.length === 1 ? '' : 'S'} STILL QUEUED`
      : 'ALL QUEUED ONLINE SUBMISSIONS SENT',
    remaining.length ? 'offline' : 'pass'
  );
  return Object.freeze({ accepted: remaining.length === 0, remaining: remaining.length });
}

async function refreshOnlineLeaderboard() {
  const mapId = document.getElementById('ka-online-lb-map')?.value || loadLastCategory().mapId;
  const difficulty = document.getElementById('ka-online-lb-difficulty')?.value || loadLastCategory().difficulty;
  const scope = document.getElementById('ka-online-lb-scope')?.value || loadLastCategory().scope;
  saveLastCategory(mapId, difficulty, scope);
  setStatus('LOADING ONLINE LEADERBOARD…', 'loading');
  try {
    latest = normalizeOnlineLeaderboardResponse(await requestJson(
      `/leaderboards?scope=${encodeURIComponent(scope)}&mapId=${encodeURIComponent(mapId)}&difficulty=${encodeURIComponent(difficulty)}&limit=10`
    ));
    render();
    setStatus(`${scope === 'region' ? `REGION ${latest.region || '—'}` : 'GLOBAL'} · UPDATED`, 'pass');
    return latest;
  } catch (error) {
    latest = null;
    render();
    setStatus(`ONLINE LEADERBOARD UNAVAILABLE · ${friendlyLeaderboardError(error)}`, 'offline');
    return null;
  }
}
function render() {
  const body = document.getElementById('ka-online-lb-body');
  if (!body) return;
  body.replaceChildren();
  const entries = latest?.entries || [];
  if (!entries.length) {
    const row = make('tr');
    row.append(make('td', { colspan: '9', class: 'ka-online-lb-empty' }, latest
      ? 'No online scores in this category yet.'
      : 'Online leaderboard data is unavailable. Local scores remain available.'));
    body.append(row);
    return;
  }
  for (const entry of entries) {
    const row = make('tr');
    [entry.rank, entry.displayName, entry.region, entry.score.toLocaleString(), entry.wave, entry.kills, formatTime(entry.survivalSeconds), `${entry.accuracy.toFixed(1)}%`, new Date(entry.createdAt).toLocaleDateString()]
      .forEach((value) => row.append(make('td', {}, String(value))));
    body.append(row);
  }
}
function close() {
  const dialog = document.getElementById('ka-online-leaderboards-dialog');
  if (!dialog) return;
  if (dialog.contains(document.activeElement)) document.activeElement?.blur?.();
  if (dialog.open && dialog.close) dialog.close();
  else dialog.removeAttribute('open');
  queueMicrotask(() => document.getElementById('ka-online-leaderboards-open')?.focus());
}
function open() {
  const dialog = document.getElementById('ka-online-leaderboards-dialog');
  if (!dialog) return;
  syncCategoryControls(loadLastCategory());
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute('open', '');
  const name = document.getElementById('ka-online-lb-name');
  if (name) name.value = displayName();
  updatePendingCount();
  void refreshOnlineLeaderboard();
  requestAnimationFrame(() => document.getElementById('ka-online-lb-close')?.focus());
}

function buildUi() {
  if (document.getElementById('ka-online-leaderboards-dialog')) return;
  const style = make('style', { id: 'ka-online-leaderboards-style' });
  style.textContent = `
    #ka-online-leaderboards-open{margin-top:10px;min-width:220px}
    #ka-online-lb-home-status{margin-top:5px;max-width:620px;color:#9fb4c5;font-size:11px;font-weight:800;letter-spacing:.04em}
    #ka-online-lb-home-status[data-tone=pass]{color:#7dffb2}#ka-online-lb-home-status[data-tone=offline]{color:#ffbb6a}
    #ka-online-leaderboards-dialog{border:1px solid rgba(255,180,52,.62);border-radius:14px;background:rgba(7,10,16,.98);color:#f7fbff;width:min(880px,calc(100vw - 24px));max-height:min(720px,calc(100vh - 24px));padding:0;box-shadow:0 24px 80px rgba(0,0,0,.75)}
    #ka-online-leaderboards-dialog::backdrop{background:rgba(0,0,0,.78);backdrop-filter:blur(4px)}
    .ka-online-lb-shell{padding:20px}.ka-online-lb-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.ka-online-lb-head h2{margin:0;color:#ffc66b;letter-spacing:.08em}.ka-online-lb-close{font-size:24px;min-width:44px}
    .ka-online-lb-profile,.ka-online-lb-filters{display:grid;grid-template-columns:1fr auto auto;gap:10px;margin:14px 0}.ka-online-lb-filters{grid-template-columns:1fr 1fr 1fr auto}.ka-online-lb-profile input,.ka-online-lb-filters select,.ka-online-lb-profile button,.ka-online-lb-filters button{min-height:42px}
    .ka-online-lb-status{min-height:24px;color:#9fb4c5;font-size:12px}.ka-online-lb-status[data-tone=pass]{color:#7dffb2}.ka-online-lb-status[data-tone=offline]{color:#ffbb6a}
    .ka-online-lb-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:10px}.ka-online-lb-table{width:100%;border-collapse:collapse;min-width:790px}.ka-online-lb-table th,.ka-online-lb-table td{padding:9px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}.ka-online-lb-table th{position:sticky;top:0;background:#181b22;color:#ffc66b}.ka-online-lb-empty{text-align:center;padding:28px;color:#9fb4c5}.ka-online-lb-note{font-size:12px;color:#9fb4c5}
    @media(max-width:700px){.ka-online-lb-profile,.ka-online-lb-filters{grid-template-columns:1fr}.ka-online-lb-shell{padding:14px}}
  `;
  document.head.append(style);

  const home = document.querySelector('[data-menu-screen="home"]') || document.getElementById('menu') || document.body;
  const button = make('button', { type: 'button', id: 'ka-online-leaderboards-open', class: 'ka-link-btn ka-player-data-open', style: 'width:100%;text-align:center;' }, 'ONLINE LEADERBOARDS');
  const homeStatus = make('div', { id: 'ka-online-lb-home-status' }, pending().length
    ? `${pending().length} online score submission${pending().length === 1 ? '' : 's'} queued.`
    : 'Complete a single-player run to submit an online score.');
  home.append(button, homeStatus);
  restoreHomeStatus();

  const dialog = make('dialog', { id: 'ka-online-leaderboards-dialog', 'aria-labelledby': 'ka-online-lb-title' });
  const shell = make('div', { class: 'ka-online-lb-shell' });
  const head = make('div', { class: 'ka-online-lb-head' });
  head.append(
    make('h2', { id: 'ka-online-lb-title' }, 'ONLINE LEADERBOARDS'),
    make('button', { type: 'button', id: 'ka-online-lb-close', class: 'ka-online-lb-close', 'aria-label': 'Close online leaderboards' }, '×')
  );

  const profile = make('div', { class: 'ka-online-lb-profile' });
  const nameInput = make('input', { id: 'ka-online-lb-name', maxlength: '24', 'aria-label': 'Leaderboard display name', placeholder: 'Display name' });
  const saveName = make('button', { type: 'button', id: 'ka-online-lb-save-name' }, 'SAVE NAME');
  const retry = make('button', { type: 'button', id: 'ka-online-lb-retry' }, 'RETRY QUEUED ');
  retry.append(make('span', { id: 'ka-online-lb-pending' }, '0'));
  profile.append(nameInput, saveName, retry);

  const filters = make('div', { class: 'ka-online-lb-filters' });
  const scope = make('select', { id: 'ka-online-lb-scope', 'aria-label': 'Leaderboard scope' });
  scope.append(make('option', { value: 'global' }, 'Global'), make('option', { value: 'region' }, 'My Region'));
  const map = make('select', { id: 'ka-online-lb-map', 'aria-label': 'Leaderboard map' });
  ONLINE_LEADERBOARD_MAPS.forEach((item) => map.append(make('option', { value: item.id }, item.label)));
  const difficulty = make('select', { id: 'ka-online-lb-difficulty', 'aria-label': 'Leaderboard difficulty' });
  ONLINE_LEADERBOARD_DIFFICULTIES.forEach((item) => difficulty.append(make('option', { value: item.id }, item.label)));
  const refreshButton = make('button', { type: 'button', id: 'ka-online-lb-refresh' }, 'REFRESH');
  filters.append(scope, map, difficulty, refreshButton);

  const status = make('div', { id: 'ka-online-lb-status', class: 'ka-online-lb-status' }, 'READY');
  const wrap = make('div', { class: 'ka-online-lb-table-wrap' });
  const table = make('table', { class: 'ka-online-lb-table' });
  const thead = make('thead');
  const header = make('tr');
  ['#', 'Player', 'Region', 'Score', 'Wave', 'Kills', 'Time', 'Accuracy', 'Date'].forEach((label) => header.append(make('th', {}, label)));
  thead.append(header);
  const tbody = make('tbody', { id: 'ka-online-lb-body' });
  table.append(thead, tbody);
  wrap.append(table);

  shell.append(
    head,
    profile,
    filters,
    status,
    wrap,
    make('p', { class: 'ka-online-lb-note' }, 'Single-player runs only. Failed submissions are queued automatically. The latest completed map and difficulty open automatically.')
  );
  dialog.append(shell);
  document.body.append(dialog);

  button.addEventListener('click', open);
  document.getElementById('ka-online-lb-close')?.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  document.getElementById('ka-online-lb-save-name')?.addEventListener('click', () => {
    const input = document.getElementById('ka-online-lb-name');
    const name = cleanOnlineDisplayName(input?.value);
    if (input) input.value = name;
    writeStorage(DISPLAY_NAME_KEY, name);
    setStatus('DISPLAY NAME SAVED', 'pass');
  });
  document.getElementById('ka-online-lb-retry')?.addEventListener('click', () => void retryPending());
  [scope, map, difficulty].forEach((element) => element.addEventListener('change', () => {
    selectOnlineLeaderboardCategory(map.value, difficulty.value, scope.value, { refresh: true });
  }));
  refreshButton.addEventListener('click', () => void refreshOnlineLeaderboard());
  syncCategoryControls(loadLastCategory());
  updatePendingCount();
  render();
}

export function initOnlineLeaderboards() {
  if (typeof document === 'undefined') return;
  if (uiBound) return;
  uiBound = true;
  buildUi();
  restoreHomeStatus();
  window.addEventListener('storage', (event) => {
    if (event.key === LAST_SUBMISSION_KEY) {
      lastSubmission = loadLastSubmission();
      restoreHomeStatus();
    }
  });
  document.documentElement.dataset.kaOnlineLeaderboards = 'ready';
  if (pending().length) void retryPending();
}

export function getOnlineLeaderboardSnapshot() {
  return {
    activeRun: activeRun ? { ...activeRun, challengePromise: undefined } : null,
    pending: [...pending()],
    latest,
    lastCategory: loadLastCategory(),
    lastSubmission
  };
}

if (typeof window !== 'undefined') {
  window.KAGetOnlineLeaderboards = getOnlineLeaderboardSnapshot;
  window.KASelectOnlineLeaderboardCategory = selectOnlineLeaderboardCategory;
  window.KARetryOnlineLeaderboardSubmissions = retryPending;
}
