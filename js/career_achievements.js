// M4.59-M4.62 — player-facing Career & Achievements screen.

import { buildCareerPresentation } from './career_achievements_core.js';

let initialized = false;
let getProgression = () => ({ profile: {}, maxLevel: 50 });
let getChallenges = () => ({ achievements: [], totalUnlocked: 0 });

function make(tag, attributes = {}, text = '') {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') element.className = value;
    else element.setAttribute(key, String(value));
  }
  if (text) element.textContent = text;
  return element;
}

function safeStorageNumber(key, fallback) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function formatDate(timestamp) {
  const value = Number(timestamp) || 0;
  if (!value) return 'Not yet';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function snapshot() {
  return buildCareerPresentation({
    progression: getProgression(),
    challenges: getChallenges(),
    highScore: safeStorageNumber('fps_hi_score', 0),
    highWave: safeStorageNumber('fps_hi_wave', 1)
  });
}

function installStyle() {
  if (document.getElementById('ka-career-style')) return;
  const style = make('style', { id: 'ka-career-style' });
  style.textContent = `
    #ka-career-open{margin-top:10px;min-width:220px}
    #ka-career-dialog{border:1px solid rgba(34,255,136,.52);border-radius:16px;background:rgba(5,10,16,.985);color:#f4fbff;width:min(920px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 24px));padding:0;box-shadow:0 24px 84px rgba(0,0,0,.78)}
    #ka-career-dialog::backdrop{background:rgba(0,0,0,.78);backdrop-filter:blur(4px)}
    .ka-career-shell{padding:20px}.ka-career-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.ka-career-head h2{margin:0;color:#80ffc1;letter-spacing:.08em}.ka-career-close{font-size:24px;min-width:44px}
    .ka-career-intro{margin:14px 0;padding:12px 14px;border:1px solid rgba(0,212,255,.24);border-radius:12px;background:rgba(0,212,255,.06);color:#b9d4df;line-height:1.5}
    .ka-career-level{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:14px;border:1px solid rgba(34,255,136,.28);border-radius:14px;background:rgba(34,255,136,.055)}
    .ka-career-badge{width:74px;height:74px;border-radius:18px;display:grid;place-items:center;background:#22ff88;color:#00180c;font-size:28px;font-weight:1000;box-shadow:0 0 22px rgba(34,255,136,.26)}
    .ka-career-meter{height:10px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.1);margin-top:8px}.ka-career-meter>div{height:100%;background:linear-gradient(90deg,#00d4ff,#22ff88)}
    .ka-career-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:14px 0}.ka-career-stat{padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.045)}.ka-career-stat span{display:block;color:#8599a8;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.ka-career-stat b{display:block;margin-top:4px;font-size:20px}
    .ka-achievement-list{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.ka-achievement-card{padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.04)}.ka-achievement-card.unlocked{border-color:rgba(34,255,136,.38);background:rgba(34,255,136,.06)}.ka-achievement-card.locked{opacity:.68}.ka-achievement-state{font-size:10px;font-weight:1000;letter-spacing:.1em;color:#ffaa00}.ka-achievement-card.unlocked .ka-achievement-state{color:#22ff88}.ka-achievement-card strong{display:block;margin:4px 0}.ka-achievement-card small{display:block;color:#9fb4c5;line-height:1.4}.ka-achievement-meta{margin-top:7px;color:#6f8798;font-size:10px}
    @media(max-width:760px){.ka-career-grid{grid-template-columns:repeat(2,1fr)}.ka-achievement-list{grid-template-columns:1fr}.ka-career-level{grid-template-columns:auto 1fr}.ka-career-level>div:last-child{grid-column:1/-1}}
  `;
  document.head.append(style);
}

function render() {
  const value = snapshot();
  const level = document.getElementById('ka-career-level');
  const xp = document.getElementById('ka-career-xp');
  const meter = document.getElementById('ka-career-meter-fill');
  const count = document.getElementById('ka-career-count');
  if (level) level.textContent = String(value.level.value);
  if (xp) xp.textContent = value.level.capped
    ? `MAX LEVEL · ${value.level.totalXp.toLocaleString()} TOTAL XP`
    : `${value.level.xpIntoLevel.toLocaleString()} / ${value.level.xpToNext.toLocaleString()} XP TO NEXT LEVEL`;
  if (meter) meter.style.width = `${value.level.progressPercent}%`;
  if (count) count.textContent = `${value.unlockedCount} / ${value.totalAchievements} COMPLETE`;

  const stats = {
    'ka-career-runs': value.stats.totalRuns,
    'ka-career-kills': value.stats.totalKills,
    'ka-career-headshots': value.stats.totalHeadshots,
    'ka-career-waves': value.stats.totalWaves,
    'ka-career-best-score': value.stats.bestScore,
    'ka-career-best-wave': value.stats.bestWave,
    'ka-career-objectives': value.stats.objectivesCompleted,
    'ka-career-challenges': value.stats.challengesCompleted,
    'ka-career-upgrades': value.stats.weaponUpgrades,
    'ka-career-last-run': value.stats.lastRunAt ? new Date(value.stats.lastRunAt).toLocaleDateString() : '—'
  };
  Object.entries(stats).forEach(([id, entry]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = typeof entry === 'number' ? entry.toLocaleString() : String(entry);
  });

  const list = document.getElementById('ka-achievement-list');
  if (!list) return value;
  list.replaceChildren();
  value.achievements.forEach((achievement) => {
    const card = make('article', { class: `ka-achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'}` });
    card.append(
      make('div', { class: 'ka-achievement-state' }, achievement.unlocked ? 'COMPLETED' : 'LOCKED'),
      make('strong', {}, achievement.label),
      make('small', {}, achievement.description),
      make('div', { class: 'ka-achievement-meta' }, `${achievement.xp} XP · ${achievement.unlocked ? formatDate(achievement.unlockedAt) : 'Complete the milestone to unlock'}`)
    );
    list.append(card);
  });
  return value;
}

function openDialog() {
  const dialog = document.getElementById('ka-career-dialog');
  if (!dialog) return;
  render();
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute('open', '');
  requestAnimationFrame(() => document.getElementById('ka-career-close')?.focus());
}

function closeDialog() {
  const dialog = document.getElementById('ka-career-dialog');
  if (!dialog) return;
  if (dialog.contains(document.activeElement)) document.activeElement?.blur?.();
  if (dialog.open && dialog.close) dialog.close();
  else dialog.removeAttribute('open');
  queueMicrotask(() => document.getElementById('ka-career-open')?.focus());
}

function buildUi() {
  if (document.getElementById('ka-career-dialog')) return;
  installStyle();
  const home = document.querySelector('[data-menu-screen="home"]') || document.getElementById('menu') || document.body;
  const button = make('button', { type: 'button', id: 'ka-career-open', class: 'ka-link-btn ka-player-data-open', style: 'width:100%;text-align:center;' }, 'CAREER & ACHIEVEMENTS');
  home.append(button);

  const dialog = make('dialog', { id: 'ka-career-dialog', 'aria-labelledby': 'ka-career-title' });
  const shell = make('div', { class: 'ka-career-shell' });
  const head = make('div', { class: 'ka-career-head' });
  const title = make('div');
  title.append(make('h2', { id: 'ka-career-title' }, 'CAREER & ACHIEVEMENTS'), make('div', { id: 'ka-career-count' }, '0 / 0 COMPLETE'));
  head.append(title, make('button', { type: 'button', id: 'ka-career-close', class: 'ka-career-close', 'aria-label': 'Close Career and Achievements' }, '×'));

  const intro = make('div', { class: 'ka-career-intro' });
  intro.append(
    make('strong', {}, 'What Profile Level means'),
    make('div', {}, 'Profile Level is long-term career progress earned from kills, headshots, waves, objectives, challenges, achievements, and completed runs. It currently records experience and milestones only; it does not add weapon damage, health, or hidden combat advantages.'),
    make('div', { style: 'margin-top:7px' }, 'Achievements are permanent milestones. Each completed achievement awards career XP and records its completion time.')
  );

  const level = make('section', { class: 'ka-career-level' });
  level.append(
    make('div', { class: 'ka-career-badge', id: 'ka-career-level' }, '1'),
    (() => {
      const group = make('div');
      group.append(make('strong', {}, 'PROFILE LEVEL'), make('div', { id: 'ka-career-xp' }, '0 / 575 XP TO NEXT LEVEL'));
      const meter = make('div', { class: 'ka-career-meter' });
      meter.append(make('div', { id: 'ka-career-meter-fill', style: 'width:0%' }));
      group.append(meter);
      return group;
    })(),
    make('div', {}, 'Career progress is saved locally and included in cloud profiles.')
  );

  const stats = make('div', { class: 'ka-career-grid' });
  [
    ['Runs','ka-career-runs'],['Kills','ka-career-kills'],['Headshots','ka-career-headshots'],
    ['Waves Cleared','ka-career-waves'],['Best Score','ka-career-best-score'],['Best Wave','ka-career-best-wave'],
    ['Objectives','ka-career-objectives'],['Run Challenges','ka-career-challenges'],['Weapon Upgrades','ka-career-upgrades'],
    ['Last Run','ka-career-last-run']
  ].forEach(([label, id]) => {
    const card = make('div', { class: 'ka-career-stat' });
    card.append(make('span', {}, label), make('b', { id }, '0'));
    stats.append(card);
  });

  const achievementsTitle = make('h3', {}, 'ACHIEVEMENTS');
  const list = make('div', { id: 'ka-achievement-list', class: 'ka-achievement-list' });
  shell.append(head, intro, level, stats, achievementsTitle, list);
  dialog.append(shell);
  document.body.append(dialog);

  button.addEventListener('click', openDialog);
  document.getElementById('ka-career-close')?.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
}

export function initCareerAchievements({
  getProgressionSnapshot = getProgression,
  getChallengesSnapshot = getChallenges
} = {}) {
  getProgression = typeof getProgressionSnapshot === 'function' ? getProgressionSnapshot : getProgression;
  getChallenges = typeof getChallengesSnapshot === 'function' ? getChallengesSnapshot : getChallenges;
  if (!initialized) {
    initialized = true;
    buildUi();
    window.addEventListener('storage', (event) => {
      if (['ka_progression_v1', 'ka_challenges_v1', 'fps_hi_score', 'fps_hi_wave'].includes(event.key)) render();
    });
  }
  render();
  document.documentElement.dataset.kaCareerAchievements = 'ready';
}

export function getCareerAchievementsSnapshot() {
  return snapshot();
}

if (typeof window !== 'undefined') {
  window.KAGetCareerAchievements = getCareerAchievementsSnapshot;
}
