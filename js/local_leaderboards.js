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

let store = loadLocalLeaderboardStore();
let runToken = '';
let submittedToken = '';
let uiBound = false;

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
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
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

function installStyle() {
  if (document.getElementById('ka-local-leaderboards-style')) return;
  const style = makeElement('style', { id: 'ka-local-leaderboards-style' });
  style.textContent = `
    #ka-local-leaderboards-open{margin-top:12px;min-width:220px}
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
  return document.getElementById('ka-lb-map')?.value || 'grid_bunker';
}
function selectedDifficulty() {
  return document.getElementById('ka-lb-difficulty')?.value || 'normal';
}

export function renderLocalLeaderboards() {
  const body = document.getElementById('ka-lb-body');
  const title = document.getElementById('ka-lb-context');
  if (!body) return;
  const mapId = normalizeLocalLeaderboardMap(selectedMap());
  const difficulty = normalizeLocalLeaderboardDifficulty(selectedDifficulty());
  const entries = getLocalLeaderboardEntries(store, { mapId, difficulty });
  if (title) title.textContent = `${leaderboardMapLabel(mapId)} · ${leaderboardDifficultyLabel(difficulty)}`;
  body.replaceChildren();
  if (entries.length === 0) {
    const row = makeElement('tr');
    const cell = makeElement('td', { colspan: '8', class: 'ka-lb-empty' }, 'No completed single-player runs in this category yet.');
    row.append(cell); body.append(row); return;
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
  const open = makeElement('button', { type: 'button', id: 'ka-local-leaderboards-open' }, 'LOCAL LEADERBOARDS');
  home.append(open);

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
  table.append(thead, tbody); wrap.append(table);
  const note = makeElement('p', { class: 'ka-lb-note' }, 'Stored only in this browser. Multiplayer runs are not submitted. Top 10 per map and difficulty.');
  shell.append(head, filters, wrap, note); dialog.append(shell); document.body.append(dialog);

  open.addEventListener('click', openDialog);
  close.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
  mapSelect.addEventListener('change', renderLocalLeaderboards);
  difficultySelect.addEventListener('change', renderLocalLeaderboards);
  clear.addEventListener('click', () => {
    if (!window.confirm('Clear every local leaderboard score stored in this browser?')) return;
    store = clearLocalLeaderboards();
    renderLocalLeaderboards();
  });
  renderLocalLeaderboards();
}

export function initLocalLeaderboards() {
  if (uiBound) { renderLocalLeaderboards(); return; }
  uiBound = true;
  buildUi();
  document.documentElement.dataset.kaLocalLeaderboards = 'ready';
}

export function beginLocalLeaderboardRun() {
  runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  submittedToken = '';
  return runToken;
}

export function submitLocalLeaderboardRun({ mapId, difficulty, score = 0, wave = 1, kills = 0, summary = null, mode = 'single' } = {}) {
  if (String(mode).toLowerCase() !== 'single') return Object.freeze({ accepted: false, reason: 'MULTIPLAYER_EXCLUDED' });
  if (!runToken) beginLocalLeaderboardRun();
  if (submittedToken === runToken) return Object.freeze({ accepted: false, reason: 'RUN_ALREADY_SUBMITTED' });
  const source = summary && typeof summary === 'object' ? summary : {};
  const entry = {
    id: runToken,
    createdAt: new Date().toISOString(),
    mapId,
    difficulty,
    score: numberFrom(source, ['score', 'finalScore', 'combat.score'], score),
    wave: numberFrom(source, ['wave', 'finalWave', 'combat.wave'], wave),
    kills: numberFrom(source, ['kills', 'eliminations', 'combat.kills'], kills),
    survivalSeconds: numberFrom(source, ['survivalSeconds', 'survivalTimeSeconds', 'durationSeconds', 'timeSeconds', 'combat.survivalSeconds'], 0),
    accuracy: numberFrom(source, ['accuracy', 'accuracyPercent', 'combat.accuracy'], 0),
    headshots: numberFrom(source, ['headshots', 'headshotKills', 'combat.headshots'], 0)
  };
  const result = addLocalLeaderboardEntry(store, entry);
  store = saveLocalLeaderboardStore(result.store);
  submittedToken = runToken;
  renderLocalLeaderboards();
  document.documentElement.dataset.kaLocalLeaderboardLastRank = String(result.rank ?? 'outside-top-10');
  return Object.freeze({ accepted: true, rank: result.rank, entry: result.entry });
}

export function getLocalLeaderboardSnapshot() {
  return { schema: store.schema, runToken, submitted: submittedToken === runToken, entries: store.entries.map((entry) => ({ ...entry })) };
}

if (typeof window !== 'undefined') {
  window.KAGetLocalLeaderboards = getLocalLeaderboardSnapshot;
  window.KAClearLocalLeaderboards = () => { store = clearLocalLeaderboards(); renderLocalLeaderboards(); return getLocalLeaderboardSnapshot(); };
}
