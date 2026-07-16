// PROG.1 R1 — unified Career, Operations, Rewards, and Achievements interface.

import { buildCareerPresentation } from './career_achievements_core.js';

let initialized = false;
let getProgression = () => ({ profile: {}, maxLevel: 50, unlocks: [] });
let getChallenges = () => ({ achievements: [], totalUnlocked: 0 });
let equipCosmetic = () => ({ ok: false, reason: 'UNAVAILABLE' });

function make(tag, attributes = {}, text = '') {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') element.className = value;
    else if (key === 'style') element.setAttribute('style', String(value));
    else element.setAttribute(key, String(value));
  }
  if (text !== '') element.textContent = String(text);
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
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatCountdown(milliseconds) {
  const seconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function mapLabel(mapId) {
  return String(mapId || 'unknown')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
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
    #ka-career-dialog{border:1px solid rgba(34,255,136,.52);border-radius:18px;background:rgba(5,10,16,.99);color:#f4fbff;width:min(1060px,calc(100vw - 22px));max-height:min(880px,calc(100vh - 22px));padding:0;box-shadow:0 24px 84px rgba(0,0,0,.82)}
    #ka-career-dialog::backdrop{background:rgba(0,0,0,.82);backdrop-filter:blur(5px)}
    .ka-career-shell{padding:20px;overflow:auto;max-height:calc(100vh - 44px)}
    .ka-career-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;position:sticky;top:-20px;z-index:3;background:linear-gradient(#050a10 75%,transparent);padding:20px 0 14px}
    .ka-career-head h2{margin:0;color:#80ffc1;letter-spacing:.08em}.ka-career-close{font-size:24px;min-width:44px}
    .ka-career-identity{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;padding:16px;border:1px solid color-mix(in srgb,var(--prog-banner,#00d4ff) 45%,transparent);border-radius:16px;background:linear-gradient(120deg,color-mix(in srgb,var(--prog-banner,#00d4ff) 15%,transparent),rgba(255,255,255,.025))}
    .ka-career-badge{width:78px;height:78px;border-radius:20px;display:grid;place-items:center;background:var(--prog-banner,#22ff88);color:#00180c;font-size:26px;font-weight:1000;box-shadow:0 0 24px color-mix(in srgb,var(--prog-banner,#22ff88) 30%,transparent)}
    .ka-career-title{font-size:12px;letter-spacing:.16em;color:#9fb4c5}.ka-career-name{font-size:26px;font-weight:1000;margin-top:2px}.ka-career-banner-name{font-size:11px;color:#8096a8;margin-top:5px}
    .ka-career-level-meta{text-align:right}.ka-career-level-meta b{font-size:28px;color:#80ffc1}.ka-career-level-meta span{display:block;font-size:10px;color:#8da2b1;letter-spacing:.08em}
    .ka-career-meter{height:11px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.1);margin-top:9px}.ka-career-meter>div{height:100%;background:linear-gradient(90deg,#00d4ff,#22ff88);transition:width .25s ease}
    .ka-career-intro{margin:14px 0;padding:12px 14px;border:1px solid rgba(0,212,255,.24);border-radius:12px;background:rgba(0,212,255,.06);color:#b9d4df;line-height:1.5}
    .ka-career-section{margin-top:18px}.ka-career-section-head{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:10px}.ka-career-section-head h3{margin:0;color:#f5fbff;letter-spacing:.08em}.ka-career-section-head small{color:#7890a1}
    .ka-career-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}.ka-career-stat{padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.045)}.ka-career-stat span{display:block;color:#8599a8;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.ka-career-stat b{display:block;margin-top:4px;font-size:19px}
    .ka-operation-groups{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ka-operation-group{padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.035)}.ka-operation-group>strong{color:#00d4ff;letter-spacing:.1em}.ka-operation-group.weekly>strong{color:#ffaa00}
    .ka-operation-card{margin-top:9px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(0,0,0,.18)}.ka-operation-card.complete{border-color:rgba(34,255,136,.36);background:rgba(34,255,136,.055)}.ka-operation-line{display:flex;justify-content:space-between;gap:10px}.ka-operation-card small{display:block;color:#93a8b7;margin:4px 0 8px;line-height:1.35}.ka-operation-meter{height:7px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden}.ka-operation-meter div{height:100%;background:#00d4ff}.ka-operation-card.complete .ka-operation-meter div{background:#22ff88}
    .ka-reward-list,.ka-achievement-list{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.ka-reward-card,.ka-achievement-card{padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.04)}.ka-reward-card.unlocked,.ka-achievement-card.unlocked{border-color:rgba(34,255,136,.34);background:rgba(34,255,136,.05)}.ka-reward-card.locked,.ka-achievement-card.locked{opacity:.58}.ka-reward-kind,.ka-achievement-state{font-size:9px;font-weight:1000;letter-spacing:.1em;color:#ffaa00}.ka-reward-card.unlocked .ka-reward-kind,.ka-achievement-card.unlocked .ka-achievement-state{color:#22ff88}.ka-reward-card strong,.ka-achievement-card strong{display:block;margin:4px 0}.ka-reward-card small,.ka-achievement-card small{display:block;color:#9fb4c5;line-height:1.4}.ka-reward-card button{margin-top:9px;width:100%;font-size:11px}.ka-reward-card.equipped{box-shadow:inset 0 0 0 1px #00d4ff}
    .ka-recent-list{display:grid;gap:7px}.ka-recent-row{display:grid;grid-template-columns:1.2fr .7fr repeat(4,.55fr);gap:8px;align-items:center;padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(255,255,255,.025);font-size:12px}.ka-recent-row span{color:#8fa5b4}.ka-recent-row b{font-size:12px}
    .ka-career-actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 4px}.ka-career-actions button{flex:1;min-width:180px}
    .prog1-postmatch-panel{margin-top:14px;padding:13px;border:1px solid rgba(34,255,136,.3);border-radius:10px;background:rgba(3,22,15,.45);text-align:left}.prog1-postmatch-head{display:flex;justify-content:space-between;gap:10px;color:#80ffc1;font-size:11px;letter-spacing:.08em}.prog1-postmatch-meter{height:8px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden;margin:9px 0}.prog1-postmatch-meter>div{height:100%;background:linear-gradient(90deg,#00d4ff,#22ff88);transition:width .3s ease}.prog1-postmatch-breakdown{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.prog1-postmatch-breakdown>div{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,.045);font-size:10px}.prog1-postmatch-events{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.prog1-postmatch-events>div{padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:7px;font-size:10px;color:#b9c9d4}.prog1-postmatch-events>div>span{display:block;color:#ffaa00;font-weight:900;letter-spacing:.08em;margin-bottom:4px}
    @media(max-width:820px){.ka-career-grid{grid-template-columns:repeat(2,1fr)}.ka-operation-groups{grid-template-columns:1fr}.ka-reward-list,.ka-achievement-list{grid-template-columns:1fr}.ka-career-identity{grid-template-columns:auto 1fr}.ka-career-level-meta{grid-column:1/-1;text-align:left}.ka-recent-row{grid-template-columns:1fr 1fr}.prog1-postmatch-breakdown{grid-template-columns:1fr 1fr}.prog1-postmatch-events{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function renderStats(value) {
  const stats = {
    'ka-career-runs': value.stats.totalRuns,
    'ka-career-kills': value.stats.totalKills,
    'ka-career-headshots': value.stats.totalHeadshots,
    'ka-career-waves': value.stats.totalWaves,
    'ka-career-revives': value.stats.totalRevives,
    'ka-career-coop': value.stats.multiplayerRuns,
    'ka-career-best-score': value.stats.bestScore,
    'ka-career-best-wave': value.stats.bestWave,
    'ka-career-accuracy': `${value.stats.bestAccuracy.toFixed(1)}%`,
    'ka-career-playtime': formatDuration(value.stats.totalPlaySeconds),
    'ka-career-objectives': value.stats.objectivesCompleted,
    'ka-career-operations': value.stats.operationsCompleted,
    'ka-career-challenges': value.stats.challengesCompleted,
    'ka-career-upgrades': value.stats.weaponUpgrades,
    'ka-career-last-run': value.stats.lastRunAt ? formatDate(value.stats.lastRunAt) : '—'
  };
  Object.entries(stats).forEach(([id, entry]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = typeof entry === 'number' ? entry.toLocaleString() : String(entry);
  });
}

function renderOperations(value) {
  const root = document.getElementById('ka-operation-groups');
  if (!root) return;
  root.replaceChildren();
  value.operations.forEach((group) => {
    const box = make('section', { class: `ka-operation-group ${group.scope.toLowerCase()}` });
    const expiry = group.scope === 'DAILY'
      ? value.operationExpiry?.dailyMs
      : value.operationExpiry?.weeklyMs;
    box.append(
      make('strong', {}, `${group.scope} OPERATIONS`),
      make('small', { style: 'float:right;color:#718899' }, `Refresh ${formatCountdown(expiry)}`)
    );
    group.operations.forEach((operation) => {
      const card = make('article', { class: `ka-operation-card ${operation.completed ? 'complete' : ''}` });
      const line = make('div', { class: 'ka-operation-line' });
      line.append(
        make('b', {}, operation.label),
        make('span', {}, operation.completed ? '✓ COMPLETE' : `${operation.progress}/${operation.target}`)
      );
      const meter = make('div', { class: 'ka-operation-meter' });
      meter.append(make('div', { style: `width:${Math.min(100, (operation.progress / Math.max(1, operation.target)) * 100)}%` }));
      card.append(
        line,
        make('small', {}, `${operation.description} · ${operation.xp} XP`),
        meter
      );
      box.append(card);
    });
    root.append(box);
  });
}

function requirementText(requirement) {
  if (!requirement) return 'Career reward';
  if (requirement.type === 'LEVEL') return `Reach level ${requirement.value}`;
  if (requirement.type === 'STAT') {
    return `${String(requirement.field || 'stat').replaceAll(/([A-Z])/g, ' $1').trim()}: ${Number(requirement.value || 0).toLocaleString()}`;
  }
  return 'Complete the requirement';
}

function renderRewards(value) {
  const root = document.getElementById('ka-reward-list');
  if (!root) return;
  root.replaceChildren();
  value.unlocks.forEach((reward) => {
    const card = make('article', {
      class: `ka-reward-card ${reward.unlocked ? 'unlocked' : 'locked'} ${reward.equipped ? 'equipped' : ''}`
    });
    card.append(
      make('div', { class: 'ka-reward-kind' }, `${reward.kind} · ${reward.equipped ? 'EQUIPPED' : (reward.unlocked ? 'UNLOCKED' : 'LOCKED')}`),
      make('strong', {}, reward.label),
      make('small', {}, reward.description),
      make('small', { style: 'margin-top:6px;color:#718899' }, reward.unlocked ? `Unlocked ${formatDate(reward.unlockedAt)}` : requirementText(reward.requirement))
    );
    if (reward.unlocked) {
      const button = make('button', {
        type: 'button',
        class: 'ka-link-btn',
        'data-equip-reward': reward.id
      }, reward.equipped ? 'EQUIPPED' : `EQUIP ${reward.kind}`);
      button.disabled = reward.equipped;
      card.append(button);
    }
    root.append(card);
  });
}

function renderAchievements(value) {
  const list = document.getElementById('ka-achievement-list');
  if (!list) return;
  list.replaceChildren();
  value.achievements.forEach((achievement) => {
    const card = make('article', { class: `ka-achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'}` });
    card.append(
      make('div', { class: 'ka-achievement-state' }, achievement.unlocked ? 'COMPLETED' : 'LOCKED'),
      make('strong', {}, achievement.label),
      make('small', {}, achievement.description),
      make('small', { style: 'margin-top:7px;color:#718899' }, `${achievement.xp} XP · ${achievement.unlocked ? formatDate(achievement.unlockedAt) : 'Milestone not completed'}`)
    );
    list.append(card);
  });
}

function renderRecentRuns(value) {
  const root = document.getElementById('ka-recent-list');
  if (!root) return;
  root.replaceChildren();
  if (!value.recentRuns.length) {
    root.append(make('div', { class: 'ka-career-intro' }, 'Complete a run to begin your deployment history.'));
    return;
  }
  value.recentRuns.forEach((run) => {
    const row = make('div', { class: 'ka-recent-row' });
    row.append(
      make('b', {}, mapLabel(run.mapId)),
      make('span', {}, run.mode === 'multiplayer' ? (run.botAssisted ? 'CO-OP + AI' : 'CO-OP') : 'SOLO'),
      make('span', {}, `W${run.wave}`),
      make('span', {}, `${run.kills} K`),
      make('span', {}, run.score.toLocaleString()),
      make('b', {}, `+${run.xpEarned} XP`)
    );
    root.append(row);
  });
}

function render() {
  const value = snapshot();
  const dialog = document.getElementById('ka-career-dialog');
  if (dialog) dialog.style.setProperty('--prog-banner', value.identity.bannerTone || '#00d4ff');

  const identityTitle = document.getElementById('ka-career-identity-title');
  const identityBadge = document.getElementById('ka-career-identity-badge');
  const identityBanner = document.getElementById('ka-career-identity-banner');
  if (identityTitle) identityTitle.textContent = value.identity.title;
  if (identityBadge) identityBadge.textContent = String(value.level.value);
  if (identityBanner) identityBanner.textContent = `${value.identity.badge} · ${value.identity.banner}`;
  const menuProfileTitle = document.getElementById('profile-title');
  if (menuProfileTitle) menuProfileTitle.textContent = value.identity.title;
  const menuProfileLevel = document.getElementById('profile-level');
  if (menuProfileLevel) menuProfileLevel.textContent = String(value.level.value);

  const level = document.getElementById('ka-career-level');
  const xp = document.getElementById('ka-career-xp');
  const meter = document.getElementById('ka-career-meter-fill');
  const count = document.getElementById('ka-career-count');
  if (level) level.textContent = String(value.level.value);
  if (xp) xp.textContent = value.level.capped
    ? `MAX LEVEL · ${value.level.totalXp.toLocaleString()} TOTAL XP`
    : `${value.level.xpIntoLevel.toLocaleString()} / ${value.level.xpToNext.toLocaleString()} XP`;
  if (meter) meter.style.width = `${value.level.progressPercent}%`;
  if (count) count.textContent = `${value.unlockedRewards}/${value.totalRewards} REWARDS · ${value.unlockedCount}/${value.totalAchievements} ACHIEVEMENTS`;

  renderStats(value);
  renderOperations(value);
  renderRewards(value);
  renderAchievements(value);
  renderRecentRuns(value);
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

function section(title, subtitle = '') {
  const root = make('section', { class: 'ka-career-section' });
  const head = make('div', { class: 'ka-career-section-head' });
  head.append(make('h3', {}, title), make('small', {}, subtitle));
  root.append(head);
  return root;
}

function buildUi() {
  if (document.getElementById('ka-career-dialog')) return;
  installStyle();
  const home = document.querySelector('[data-menu-screen="home"]') || document.getElementById('menu') || document.body;
  const button = make('button', {
    type: 'button',
    id: 'ka-career-open',
    class: 'ka-link-btn ka-player-data-open',
    style: 'width:100%;text-align:center;'
  }, 'CAREER · OPERATIONS · REWARDS');
  home.append(button);

  const dialog = make('dialog', { id: 'ka-career-dialog', 'aria-labelledby': 'ka-career-title' });
  const shell = make('div', { class: 'ka-career-shell' });
  const head = make('div', { class: 'ka-career-head' });
  const title = make('div');
  title.append(
    make('h2', { id: 'ka-career-title' }, 'CAREER COMMAND'),
    make('div', { id: 'ka-career-count' }, '0/0 REWARDS · 0/0 ACHIEVEMENTS')
  );
  head.append(title, make('button', { type: 'button', id: 'ka-career-close', class: 'ka-career-close', 'aria-label': 'Close Career Command' }, '×'));

  const identity = make('section', { class: 'ka-career-identity' });
  identity.append(
    make('div', { class: 'ka-career-badge', id: 'ka-career-identity-badge' }, '1'),
    (() => {
      const group = make('div');
      group.append(
        make('div', { class: 'ka-career-title' }, 'ACTIVE PROFILE TITLE'),
        make('div', { class: 'ka-career-name', id: 'ka-career-identity-title' }, 'Survivor'),
        make('div', { class: 'ka-career-banner-name', id: 'ka-career-identity-banner' }, 'Recruit Shield · Bunker Standard')
      );
      const meter = make('div', { class: 'ka-career-meter' });
      meter.append(make('div', { id: 'ka-career-meter-fill', style: 'width:0%' }));
      group.append(meter);
      return group;
    })(),
    (() => {
      const meta = make('div', { class: 'ka-career-level-meta' });
      meta.append(make('span', {}, 'PROFILE LEVEL'), make('b', { id: 'ka-career-level' }, '1'), make('span', { id: 'ka-career-xp' }, '0 XP'));
      return meta;
    })()
  );

  const intro = make('div', { class: 'ka-career-intro' });
  intro.textContent = 'Career progression is cosmetic and profile-focused. XP, operations, titles, badges, banners, statistics, and achievements never increase weapon damage, health, or hidden combat power. Progress is included in the existing player-profile backup and cloud systems.';

  const statsSection = section('CAREER STATISTICS', 'Lifetime local-player attribution');
  const stats = make('div', { class: 'ka-career-grid' });
  [
    ['Runs','ka-career-runs'],['Kills','ka-career-kills'],['Headshots','ka-career-headshots'],
    ['Waves','ka-career-waves'],['Revives','ka-career-revives'],['Co-op Runs','ka-career-coop'],
    ['Best Score','ka-career-best-score'],['Best Wave','ka-career-best-wave'],['Best Accuracy','ka-career-accuracy'],
    ['Play Time','ka-career-playtime'],['Objectives','ka-career-objectives'],['Operations','ka-career-operations'],
    ['Challenges','ka-career-challenges'],['Upgrades','ka-career-upgrades'],['Last Run','ka-career-last-run']
  ].forEach(([label, id]) => {
    const card = make('div', { class: 'ka-career-stat' });
    card.append(make('span', {}, label), make('b', { id }, '0'));
    stats.append(card);
  });
  statsSection.append(stats);

  const operationSection = section('ACTIVE OPERATIONS', 'Automatic UTC rotation and reward delivery');
  operationSection.append(make('div', { id: 'ka-operation-groups', class: 'ka-operation-groups' }));

  const rewardSection = section('PROFILE REWARDS', 'Equip unlocked titles, badges, and banners');
  rewardSection.append(make('div', { id: 'ka-reward-list', class: 'ka-reward-list' }));

  const achievementSection = section('ACHIEVEMENTS', 'Permanent career milestones');
  achievementSection.append(make('div', { id: 'ka-achievement-list', class: 'ka-achievement-list' }));

  const recentSection = section('RECENT DEPLOYMENTS', 'Your latest completed runs');
  recentSection.append(make('div', { id: 'ka-recent-list', class: 'ka-recent-list' }));

  const actions = make('div', { class: 'ka-career-actions' });
  actions.append(
    make('button', { type: 'button', id: 'ka-career-export', class: 'ka-link-btn' }, 'EXPORT PROFILE BACKUP'),
    make('button', { type: 'button', id: 'ka-career-import', class: 'ka-link-btn' }, 'IMPORT PROFILE BACKUP')
  );

  shell.append(head, identity, intro, statsSection, operationSection, rewardSection, achievementSection, recentSection, actions);
  dialog.append(shell);
  document.body.append(dialog);

  button.addEventListener('click', openDialog);
  document.getElementById('ka-career-close')?.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener('click', (event) => {
    const control = event.target?.closest?.('[data-equip-reward]');
    if (!control) return;
    const result = equipCosmetic(control.dataset.equipReward);
    if (result?.ok) render();
  });
  document.getElementById('ka-career-export')?.addEventListener('click', () => {
    if (typeof window.KAExportCloudProfile === 'function') window.KAExportCloudProfile();
    else document.getElementById('cloud-profile-export-btn')?.click();
  });
  document.getElementById('ka-career-import')?.addEventListener('click', () => {
    const buttonControl = document.getElementById('cloud-profile-import-btn');
    const fileControl = document.getElementById('cloud-profile-import-file');
    if (buttonControl) buttonControl.click();
    else fileControl?.click();
  });
}

export function initCareerAchievements({
  getProgressionSnapshot = getProgression,
  getChallengesSnapshot = getChallenges,
  equipProgressionCosmetic = equipCosmetic
} = {}) {
  getProgression = typeof getProgressionSnapshot === 'function' ? getProgressionSnapshot : getProgression;
  getChallenges = typeof getChallengesSnapshot === 'function' ? getChallengesSnapshot : getChallenges;
  equipCosmetic = typeof equipProgressionCosmetic === 'function' ? equipProgressionCosmetic : equipCosmetic;
  if (!initialized) {
    initialized = true;
    buildUi();
    window.addEventListener('storage', (event) => {
      if (['ka_progression_v1', 'ka_challenges_v1', 'fps_hi_score', 'fps_hi_wave'].includes(event.key)) render();
    });
    window.addEventListener('ka:progression-updated', render);
  }
  render();
  document.documentElement.dataset.kaCareerAchievements = 'ready';
  document.documentElement.dataset.kaProgressionPatch = 'prog1-r1-unified-progression-retention';
}

export function getCareerAchievementsSnapshot() {
  return snapshot();
}

if (typeof window !== 'undefined') {
  window.KAGetCareerAchievements = getCareerAchievementsSnapshot;
}
