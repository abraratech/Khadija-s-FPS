import {
  LOCAL_LEADERBOARD_DIFFICULTIES,
  LOCAL_LEADERBOARD_MAPS,
  addLocalLeaderboardEntry,
  clearLocalLeaderboards,
  getLocalLeaderboardEntries,
  leaderboardDifficultyLabel,
  leaderboardMapLabel,
  loadLocalLeaderboardStore,
  normalizeLocalLeaderboardDifficulty,
  normalizeLocalLeaderboardMap,
  saveLocalLeaderboardStore
} from './local_leaderboards_core.js';

const LAST_CATEGORY_KEY = 'ka_local_leaderboard_last_category_v1';
const LAST_SUBMISSION_KEY = 'ka_local_leaderboard_last_submission_v1';

let store = loadLocalLeaderboardStore();
let runToken = '';
let submittedToken = '';
let uiBound = false;
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
function numberFrom(source, paths, fallback = 0) {
  for (const path of paths) {
    let value = source;
    for (const part of path.split('.')) value = value?.[part];
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
}
function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function makeElement(tag, attributes = {}, text = '') {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') element.className = value;
    else if (name === 'dataset') Object.assign(element.dataset, value);
    else element.setAttribute(name, String(value));
  }
  if (text) element.textContent = text;
  return element;
}
function loadLastCategory() {
  try {
    const value = JSON.parse(readStorage(LAST_CATEGORY_KEY, '{}'));
    return {
      mapId: normalizeLocalLeaderboardMap(value?.mapId),
      difficulty: normalizeLocalLeaderboardDifficulty(value?.difficulty)
    };
  } catch {
    return { mapId: 'grid_bunker', difficulty: 'normal' };
  }
}
function saveLastCategory(mapId, difficulty) {
  const category = {
    mapId: normalizeLocalLeaderboardMap(mapId),
    difficulty: normalizeLocalLeaderboardDifficulty(difficulty)
  };
  writeStorage(LAST_CATEGORY_KEY, JSON.stringify(category));
  return category;
}
function loadLastSubmission() {
  try {
    const value = JSON.parse(readStorage(LAST_SUBMISSION_KEY, 'null'));
    if (!value || value.accepted !== true) return null;
    const category = {
      mapId: normalizeLocalLeaderboardMap(value?.category?.mapId ?? value?.entry?.mapId),
      difficulty: normalizeLocalLeaderboardDifficulty(value?.category?.difficulty ?? value?.entry?.difficulty)
    };
    const numericRank = Number(value.rank);
    const rank = Number.isFinite(numericRank) && numericRank > 0 ? Math.floor(numericRank) : null;
    return Object.freeze({
      accepted: true,
      rank,
      entry: value.entry && typeof value.entry === 'object' ? Object.freeze({ ...value.entry }) : null,
      category: Object.freeze(category),
      restored: true,
      message: `LOCAL SCORE SAVED · ${leaderboardMapLabel(category.mapId)} · ${leaderboardDifficultyLabel(category.difficulty)}${rank ? ` · #${rank}` : ''}`
    });
  } catch {
    return null;
  }
}
function persistLastSubmission(value) {
  if (!value || value.accepted !== true) {
    removeStorage(LAST_SUBMISSION_KEY);
    return null;
  }
  writeStorage(LAST_SUBMISSION_KEY, JSON.stringify({
    accepted: true,
    rank: value.rank ?? null,
    entry: value.entry ?? null,
    category: value.category ?? null,
    savedAt: Date.now()
  }));
  return value;
}
function restoreHomeStatus() {
  if (!lastSubmission) lastSubmission = loadLastSubmission();
  if (lastSubmission?.message) setHomeStatus(lastSubmission.message, 'pass');
  return lastSubmission;
}
function syncCategoryControls(category = loadLastCategory()) {
  if (typeof document === 'undefined') return;
  const map = document.getElementById('ka-lb-map');
  const difficulty = document.getElementById('ka-lb-difficulty');
  if (map) map.value = category.mapId;
  if (difficulty) difficulty.value = category.difficulty;
}
function setHomeStatus(text, tone = '') {
  if (typeof document === 'undefined') return;
  const status = document.getElementById('ka-local-lb-home-status');
  if (!status) return;
  status.textContent = text;
  status.dataset.tone = tone;
}
function reloadStore() {
  store = loadLocalLeaderboardStore();
  return store;
}

function installStyle() {
  if (document.getElementById('ka-local-leaderboards-style')) return;
  const style = makeElement('style', { id: 'ka-local-leaderboards-style' });
  style.textContent = `
    #ka-local-leaderboards-open{margin-top:12px;min-width:220px}
    #ka-local-lb-home-status{margin-top:5px;max-width:520px;color:#9fb4c5;font-size:11px;font-weight:800;letter-spacing:.04em}
    #ka-local-lb-home-status[data-tone=pass]{color:#7dffb2}#ka-local-lb-home-status[data-tone=warn]{color:#ffbb6a}
    #ka-local-leaderboards-dialog{border:1px solid rgba(0,212,255,.58);border-radius:14px;background:rgba(5,10,18,.98);color:#eefcff;width:min(760px,calc(100vw - 28px));max-height:min(680px,calc(100vh - 28px));padding:0;box-shadow:0 22px 70px rgba(0,0,0,.72)}
    #ka-local-leaderboards-dialog::backdrop{background:rgba(0,0,0,.75);backdrop-filter:blur(4px)}
    .ka-lb-shell{padding:20px}.ka-lb-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.ka-lb-head h2{margin:0;color:#8beeff;letter-spacing:.08em}.ka-lb-close{font-size:24px;min-width:44px}
    .ka-lb-filters{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;margin:16px 0}.ka-lb-filters select,.ka-lb-filters button{min-height:42px}
    .ka-lb-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:10px}.ka-lb-table{width:100%;border-collapse:collapse;min-width:620px}.ka-lb-table th,.ka-lb-table td{padding:10px 9px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08)}.ka-lb-table th{position:sticky;top:0;background:#101b28;color:#8beeff}.ka-lb-empty{padding:28px;text-align:center;color:#9fb4c5}.ka-lb-note{margin:12px 0 0;color:#9fb4c5;font-size:12px}
    @media(max-width:620px){.ka-lb-filters{grid-template-columns:1fr}.ka-lb-shell{padding:14px}}
  `;
  document.head.append(style);
}

function selectedMap() {
  return document.getElementById('ka-lb-map')?.value || loadLastCategory().mapId;
}
function selectedDifficulty() {
  return document.getElementById('ka-lb-difficulty')?.value || loadLastCategory().difficulty;
}

export function selectLocalLeaderboardCategory(mapId, difficulty, { render = true } = {}) {
  const category = saveLastCategory(mapId, difficulty);
  syncCategoryControls(category);
  if (render) renderLocalLeaderboards();
  return category;
}

export function renderLocalLeaderboards() {
  reloadStore();
  if (typeof document === 'undefined') return;
  const body = document.getElementById('ka-lb-body');
  const title = document.getElementById('ka-lb-context');
  if (!body) return;
  const mapId = normalizeLocalLeaderboardMap(selectedMap());
  const difficulty = normalizeLocalLeaderboardDifficulty(selectedDifficulty());
  saveLastCategory(mapId, difficulty);
  const entries = getLocalLeaderboardEntries(store, { mapId, difficulty });
  if (title) title.textContent = `${leaderboardMapLabel(mapId)} · ${leaderboardDifficultyLabel(difficulty)}`;
  body.replaceChildren();
  if (entries.length === 0) {
    const row = makeElement('tr');
    row.append(makeElement('td', { colspan: '8', class: 'ka-lb-empty' }, 'No completed single-player runs in this category yet.'));
    body.append(row);
    return;
  }
  entries.forEach((entry, index) => {
    const row = makeElement('tr');
    [index + 1, entry.score.toLocaleString(), entry.wave, entry.kills, formatDuration(entry.survivalSeconds), `${entry.accuracy.toFixed(1)}%`, entry.headshots, new Date(entry.createdAt).toLocaleDateString()]
      .forEach((value) => row.append(makeElement('td', {}, String(value))));
    body.append(row);
  });
}

function openDialog() {
  const dialog = document.getElementById('ka-local-leaderboards-dialog');
  if (!dialog) return;
  syncCategoryControls(loadLastCategory());
  renderLocalLeaderboards();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  requestAnimationFrame(() => document.getElementById('ka-lb-close')?.focus());
}
function closeDialog() {
  const dialog = document.getElementById('ka-local-leaderboards-dialog');
  if (!dialog) return;
  if (dialog.contains(document.activeElement)) document.activeElement?.blur?.();
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
  queueMicrotask(() => document.getElementById('ka-local-leaderboards-open')?.focus());
}

function buildUi() {
  if (document.getElementById('ka-local-leaderboards-dialog')) return;
  installStyle();
  const home = document.querySelector('[data-menu-screen="home"]') || document.getElementById('menu') || document.body;
  const open = makeElement('button', { type: 'button', id: 'ka-local-leaderboards-open', class: 'ka-link-btn ka-player-data-open', style: 'width:100%;text-align:center;' }, 'LOCAL LEADERBOARDS');
  const homeStatus = makeElement('div', { id: 'ka-local-lb-home-status' }, 'Complete a single-player run to save a score in this browser.');
  home.append(open, homeStatus);
  restoreHomeStatus();

  const dialog = makeElement('dialog', { id: 'ka-local-leaderboards-dialog', 'aria-labelledby': 'ka-lb-title' });
  const shell = makeElement('div', { class: 'ka-lb-shell' });
  const head = makeElement('div', { class: 'ka-lb-head' });
  const headingGroup = makeElement('div');
  headingGroup.append(makeElement('h2', { id: 'ka-lb-title' }, 'LOCAL LEADERBOARDS'), makeElement('div', { id: 'ka-lb-context' }, 'Grid Bunker · Normal'));
  const close = makeElement('button', { type: 'button', id: 'ka-lb-close', class: 'ka-lb-close', 'aria-label': 'Close local leaderboards' }, '×');
  head.append(headingGroup, close);

  const filters = makeElement('div', { class: 'ka-lb-filters' });
  const mapSelect = makeElement('select', { id: 'ka-lb-map', 'aria-label': 'Leaderboard map' });
  LOCAL_LEADERBOARD_MAPS.forEach((map) => mapSelect.append(makeElement('option', { value: map.id }, map.label)));
  const difficultySelect = makeElement('select', { id: 'ka-lb-difficulty', 'aria-label': 'Leaderboard difficulty' });
  LOCAL_LEADERBOARD_DIFFICULTIES.forEach((difficulty) => difficultySelect.append(makeElement('option', { value: difficulty.id }, difficulty.label)));
  const clear = makeElement('button', { type: 'button', id: 'ka-lb-clear' }, 'CLEAR LOCAL SCORES');
  filters.append(mapSelect, difficultySelect, clear);

  const wrap = makeElement('div', { class: 'ka-lb-table-wrap' });
  const table = makeElement('table', { class: 'ka-lb-table' });
  const thead = makeElement('thead');
  const header = makeElement('tr');
  ['#', 'Score', 'Wave', 'Kills', 'Time', 'Accuracy', 'Headshots', 'Date'].forEach((label) => header.append(makeElement('th', {}, label)));
  thead.append(header);
  const tbody = makeElement('tbody', { id: 'ka-lb-body' });
  table.append(thead, tbody);
  wrap.append(table);
  const note = makeElement('p', { class: 'ka-lb-note' }, 'Stored in this browser and included in cloud profile backups. Multiplayer runs are excluded. The latest completed category opens automatically.');
  shell.append(head, filters, wrap, note);
  dialog.append(shell);
  document.body.append(dialog);

  open.addEventListener('click', openDialog);
  close.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
  mapSelect.addEventListener('change', () => selectLocalLeaderboardCategory(mapSelect.value, difficultySelect.value));
  difficultySelect.addEventListener('change', () => selectLocalLeaderboardCategory(mapSelect.value, difficultySelect.value));
  clear.addEventListener('click', () => {
    if (!window.confirm('Clear every local leaderboard score stored in this browser?')) return;
    store = clearLocalLeaderboards();
    lastSubmission = null;
    persistLastSubmission(null);
    setHomeStatus('Local leaderboard scores were cleared.', 'warn');
    renderLocalLeaderboards();
  });
  syncCategoryControls(loadLastCategory());
  renderLocalLeaderboards();
}

export function initLocalLeaderboards() {
  reloadStore();
  if (typeof document === 'undefined') return;
  if (uiBound) {
    syncCategoryControls(loadLastCategory());
    renderLocalLeaderboards();
    restoreHomeStatus();
    return;
  }
  uiBound = true;
  buildUi();
  window.addEventListener('storage', (event) => {
    if (event.key === 'ka_local_leaderboards_v1') renderLocalLeaderboards();
    if (event.key === LAST_SUBMISSION_KEY) {
      lastSubmission = loadLastSubmission();
      restoreHomeStatus();
    }
  });
  document.documentElement.dataset.kaLocalLeaderboards = 'ready';
}

export function beginLocalLeaderboardRun() {
  runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  submittedToken = '';
  return runToken;
}

export function submitLocalLeaderboardRun({ mapId, difficulty, score = 0, wave = 1, kills = 0, summary = null, mode = 'single' } = {}) {
  if (String(mode).toLowerCase() !== 'single') {
    lastSubmission = Object.freeze({ accepted: false, reason: 'MULTIPLAYER_EXCLUDED' });
    return lastSubmission;
  }
  if (!runToken) beginLocalLeaderboardRun();
  if (submittedToken === runToken) {
    lastSubmission = Object.freeze({ accepted: false, reason: 'RUN_ALREADY_SUBMITTED' });
    return lastSubmission;
  }

  reloadStore();
  const source = summary && typeof summary === 'object' ? summary : {};
  const entry = {
    id: runToken,
    createdAt: new Date().toISOString(),
    mapId,
    difficulty,
    score: numberFrom(source, ['score', 'finalScore', 'combat.score'], score),
    wave: numberFrom(source, ['wave', 'highestWave', 'finalWave', 'combat.wave'], wave),
    kills: numberFrom(source, ['kills', 'eliminations', 'combat.kills'], kills),
    survivalSeconds: numberFrom(source, ['durationSeconds', 'survivalSeconds', 'survivalTimeSeconds', 'timeSeconds', 'combat.survivalSeconds'], 0),
    accuracy: numberFrom(source, ['accuracy', 'accuracyPercent', 'combat.accuracy'], 0),
    headshots: numberFrom(source, ['headshotKills', 'headshots', 'combat.headshots'], 0)
  };

  const result = addLocalLeaderboardEntry(store, entry);
  store = saveLocalLeaderboardStore(result.store);
  submittedToken = runToken;
  const category = selectLocalLeaderboardCategory(result.entry.mapId, result.entry.difficulty, { render: false });
  renderLocalLeaderboards();
  if (typeof document !== 'undefined') document.documentElement.dataset.kaLocalLeaderboardLastRank = String(result.rank ?? 'outside-top-10');
  lastSubmission = Object.freeze({
    accepted: true,
    rank: result.rank,
    entry: result.entry,
    category,
    message: `LOCAL SCORE SAVED · ${leaderboardMapLabel(category.mapId)} · ${leaderboardDifficultyLabel(category.difficulty)}${result.rank ? ` · #${result.rank}` : ''}`
  });
  persistLastSubmission(lastSubmission);
  setHomeStatus(lastSubmission.message, 'pass');
  return lastSubmission;
}

export function getLocalLeaderboardSnapshot() {
  reloadStore();
  return {
    schema: store.schema,
    runToken,
    submitted: submittedToken === runToken,
    lastCategory: loadLastCategory(),
    lastSubmission,
    entries: store.entries.map((entry) => ({ ...entry }))
  };
}

if (typeof window !== 'undefined') {
  window.KAGetLocalLeaderboards = getLocalLeaderboardSnapshot;
  window.KASelectLocalLeaderboardCategory = selectLocalLeaderboardCategory;
  window.KAClearLocalLeaderboards = () => {
    store = clearLocalLeaderboards();
    lastSubmission = null;
    persistLastSubmission(null);
    renderLocalLeaderboards();
    return getLocalLeaderboardSnapshot();
  };
}
