// js/multiplayer/coop_scoreboard.js

const ROOT_ID = 'multiplayer-coop-scoreboard';
const UPDATE_INTERVAL_MS = 160;

function nowMs() {
  return (
    typeof performance !== 'undefined'
    && typeof performance.now === 'function'
  ) ? performance.now() : Date.now();
}

function injectStylesheet() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ka-multiplayer-styles')) return;
  const link = document.createElement('link');
  link.id = 'ka-multiplayer-styles';
  link.rel = 'stylesheet';
  link.href = './css/multiplayer.css';
  document.head.appendChild(link);
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function whole(value) {
  return String(Math.max(0, Math.round(finite(value))));
}

function seconds(value) {
  const total = Math.max(0, Math.floor(finite(value)));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function playerStatus(player = {}) {
  if (player.connected === false) return 'RECONNECTING';
  const state = String(player.lifeState || '').toUpperCase();
  if (state === 'DOWNED') return 'DOWNED';
  if (state === 'SPECTATING') return 'SPECTATING';
  if (state === 'ELIMINATED') return 'ELIMINATED';
  if (player.isBot === true || player.role === 'COMPANION') return 'WINGMAN';
  return player.role === 'HOST' ? 'HOST' : 'ALLY';
}

function pct(value) {
  return `${Math.max(0, Math.min(100, finite(value))).toFixed(0)}%`;
}

function cell(text, className = '') {
  const el = document.createElement('span');
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function addStat(parent, label, value) {
  const item = document.createElement('div');
  item.className = 'ka-scoreboard-stat';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value;
  item.append(labelEl, valueEl);
  parent.appendChild(item);
}

export class MultiplayerCoopScoreboard {
  constructor({ stats = null, session = null } = {}) {
    this.stats = stats;
    this.session = session;
    this.held = false;
    this.root = null;
    this.lastRenderAt = -Infinity;
    this.visibleMode = null;
  }

  isOnlineRun() {
    return this.session?.run?.active === true
      && (this.session?.mode === 'host' || this.session?.mode === 'client');
  }

  ensureRoot() {
    if (this.root || typeof document === 'undefined') return this.root;
    injectStylesheet();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    root.style.display = 'none';
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  setHeld(held) {
    this.held = held === true;
    if (!this.held && this.visibleMode === 'live') this.hide();
    return this.held;
  }

  hide() {
    if (!this.root) return;
    this.root.style.display = 'none';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.replaceChildren();
    this.visibleMode = null;
  }

  hideAll() {
    this.held = false;
    this.hide();
  }

  renderHeader(parent, snapshot) {
    const header = document.createElement('header');
    header.className = 'ka-scoreboard-header';

    const title = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'CO-OP SCOREBOARD';
    const heading = document.createElement('strong');
    heading.textContent = `WAVE ${whole(snapshot.highestWave || snapshot.team?.highestWave || 1)}`;
    title.append(kicker, heading);

    const stats = document.createElement('div');
    stats.className = 'ka-scoreboard-stats';
    addStat(stats, 'TIME', seconds(snapshot.durationSeconds || snapshot.team?.durationSeconds));
    addStat(stats, 'KILLS', whole(snapshot.team?.totalKills));
    addStat(stats, 'REVIVES', whole(snapshot.team?.totalRevives));
    addStat(stats, 'DAMAGE', whole(snapshot.team?.totalDamage));

    header.append(title, stats);
    parent.appendChild(header);
  }

  renderPlayerRows(parent, players = []) {
    const grid = document.createElement('div');
    grid.className = 'ka-scoreboard-grid';
    ['PLAYER', 'STATUS', 'HP', 'PTS', 'K', 'HS', 'DMG', 'REV', 'DOWN', 'PING']
      .forEach((label) => grid.appendChild(cell(label, 'ka-scoreboard-grid-head')));

    players.forEach((player) => {
      const counters = player.counters || {};
      const status = playerStatus(player);
      const rtt = player.networkRttMs === null || player.networkRttMs === undefined
        ? '-'
        : `${whole(player.networkRttMs)}ms`;
      const hp = `${whole(player.health)}/${whole(player.maxHealth || 100)}`;
      const values = [
        player.displayName || 'Player',
        status,
        hp,
        whole(player.currentPoints),
        whole(counters.kills),
        whole(counters.headshotKills),
        whole(counters.damageDealt),
        whole(counters.revives),
        whole(counters.timesDowned),
        rtt
      ];
      values.forEach((value, index) => {
        const className = index === 0
          ? 'ka-scoreboard-name'
          : index === 1
            ? `ka-scoreboard-status ka-scoreboard-status-${status.toLowerCase()}`
            : 'ka-scoreboard-cell';
        grid.appendChild(cell(value, className));
      });
    });

    parent.appendChild(grid);
  }

  renderLive(snapshot) {
    const root = this.ensureRoot();
    if (!root) return;
    root.className = 'ka-scoreboard-root ka-scoreboard-root-live';
    root.replaceChildren();

    const panel = document.createElement('section');
    panel.className = 'ka-scoreboard-panel';
    panel.setAttribute('aria-label', 'Live co-op scoreboard');
    this.renderHeader(panel, snapshot);

    const meta = document.createElement('div');
    meta.className = 'ka-scoreboard-meta';
    meta.textContent = [
      `MAP ${String(snapshot.mapId || snapshot.team?.mapId || 'grid_bunker').toUpperCase()}`,
      `DIFF ${finite(snapshot.difficulty || snapshot.team?.difficulty, 1).toFixed(1)}`,
      `EPOCH ${whole(snapshot.authorityEpoch)}`
    ].join(' | ');
    panel.appendChild(meta);

    this.renderPlayerRows(panel, snapshot.players || []);
    root.appendChild(panel);
    root.style.display = 'flex';
    root.setAttribute('aria-hidden', 'false');
    this.visibleMode = 'live';
  }

  renderFinal(summary) {
    const root = this.ensureRoot();
    if (!root) return;
    root.className = 'ka-scoreboard-root ka-scoreboard-root-final';
    root.replaceChildren();

    const panel = document.createElement('section');
    panel.className = 'ka-scoreboard-panel ka-scoreboard-final-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Shared co-op run summary');

    const header = document.createElement('header');
    header.className = 'ka-scoreboard-header';
    const title = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'SHARED RUN SUMMARY';
    const heading = document.createElement('strong');
    heading.textContent = `WAVE ${whole(summary.team?.highestWave || 1)} COMPLETE`;
    title.append(kicker, heading);
    const stats = document.createElement('div');
    stats.className = 'ka-scoreboard-stats';
    addStat(stats, 'TIME', seconds(summary.team?.durationSeconds));
    addStat(stats, 'KILLS', whole(summary.team?.totalKills));
    addStat(stats, 'REVIVES', whole(summary.team?.totalRevives));
    addStat(stats, 'DAMAGE', whole(summary.team?.totalDamage));
    header.append(title, stats);
    panel.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'ka-scoreboard-meta';
    meta.textContent = [
      `MAP ${String(summary.team?.mapId || 'grid_bunker').toUpperCase()}`,
      `DIFF ${finite(summary.team?.difficulty, 1).toFixed(1)}`,
      `END ${String(summary.team?.endReason || summary.endReason || 'ENDED').toUpperCase()}`
    ].join(' | ');
    panel.appendChild(meta);

    const grid = document.createElement('div');
    grid.className = 'ka-scoreboard-grid ka-scoreboard-final-grid';
    ['PLAYER', 'ROLE', 'K', 'HS', 'ACC', 'DMG', 'TAKEN', 'PTS+', 'PTS-', 'REV', 'DOWN', 'DEATHS']
      .forEach((label) => grid.appendChild(cell(label, 'ka-scoreboard-grid-head')));
    (summary.players || []).forEach((player) => {
      [
        player.displayName || 'Player',
        player.isBot === true || player.role === 'COMPANION'
          ? 'WINGMAN'
          : player.role === 'HOST' ? 'HOST' : 'ALLY',
        whole(player.kills),
        whole(player.headshotKills),
        pct(player.accuracyPct),
        whole(player.damageDealt),
        whole(player.damageTaken),
        whole(player.pointsEarned),
        whole(player.pointsSpent),
        whole(player.revives),
        whole(player.timesDowned),
        whole(player.deaths)
      ].forEach((value, index) => {
        grid.appendChild(cell(value, index === 0 ? 'ka-scoreboard-name' : 'ka-scoreboard-cell'));
      });
    });
    panel.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'ka-scoreboard-actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'BACK TO LOBBY';
    close.addEventListener('click', () => {
      this.stats?.closeFinalSummary?.();
      this.hide();
    });
    actions.appendChild(close);
    panel.appendChild(actions);

    root.appendChild(panel);
    root.style.display = 'flex';
    root.setAttribute('aria-hidden', 'false');
    this.visibleMode = 'final';
  }

  update(now = nowMs(), { force = false } = {}) {
    const state = this.stats?.getSnapshot?.(now) || null;
    if (state?.showFinalSummary && state.finalSummary) {
      if (force || now - this.lastRenderAt >= UPDATE_INTERVAL_MS || this.visibleMode !== 'final') {
        this.lastRenderAt = now;
        this.renderFinal(state.finalSummary);
      }
      return;
    }

    if (!this.held || !this.isOnlineRun()) {
      if (this.visibleMode === 'live') this.hide();
      return;
    }

    const snapshot = state?.snapshot;
    if (!snapshot) return;
    if (!force && now - this.lastRenderAt < UPDATE_INTERVAL_MS && this.visibleMode === 'live') return;
    this.lastRenderAt = now;
    this.renderLive(snapshot);
  }
}
