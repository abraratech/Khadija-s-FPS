// POST-FINAL.3 R1 — compact human/AI team-intent HUD.
import { BOT1_DISPLAY_NAME, BOT1_PLAYER_ID } from './bot_core.js';
import { SQUAD_COMMAND_STATUS, squadIntentLabel } from './squad_command_core.js';

export const SQUAD_INTENT_HUD_PATCH = 'post-final3-r1-team-intent-hud';

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function distance(a, b) {
  const dx = finite(a?.x) - finite(b?.x);
  const dy = finite(a?.y) - finite(b?.y);
  const dz = finite(a?.z) - finite(b?.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function meters(value) {
  const dist = Math.max(0, finite(value));
  return dist < 10 ? `${dist.toFixed(1)}m` : `${Math.round(dist)}m`;
}

function statusColor(status) {
  if (status === SQUAD_COMMAND_STATUS.UNAVAILABLE) return '#ffc08f';
  if (status === SQUAD_COMMAND_STATUS.COMPLETE) return '#7df2a5';
  if (status === SQUAD_COMMAND_STATUS.REVIVING) return '#ff77a8';
  if (status === SQUAD_COMMAND_STATUS.ENGAGING) return '#ff6858';
  if (status === SQUAD_COMMAND_STATUS.DEFENDING) return '#86b8ff';
  return '#63d8ff';
}

export class MultiplayerSquadIntentHud {
  constructor({
    runtime,
    session,
    player,
    getBotSnapshot = () => null,
    getTacticalSnapshot = () => null
  } = {}) {
    this.runtime = runtime;
    this.session = session;
    this.player = player;
    this.getBotSnapshot = getBotSnapshot;
    this.getTacticalSnapshot = getTacticalSnapshot;
    this.active = false;
    this.root = null;
    this.lastRenderAt = -Infinity;
    this.lastSnapshot = null;
  }

  isOnlineRun() {
    return this.session?.run?.active === true
      && (this.session?.mode === 'host' || this.session?.mode === 'client');
  }

  beginRun() {
    this.active = true;
    this.lastRenderAt = -Infinity;
  }

  endRun() {
    this.active = false;
    this.lastSnapshot = null;
    if (this.root) this.root.style.display = 'none';
  }

  ensureRoot() {
    if (this.root || typeof document === 'undefined') return this.root;
    const root = document.createElement('section');
    root.id = 'ka-squad-intent-hud';
    root.setAttribute('aria-label', 'Squad intent');
    Object.assign(root.style, {
      position: 'fixed',
      top: '104px',
      right: '16px',
      zIndex: '46',
      display: 'none',
      width: 'min(310px, calc(100vw - 32px))',
      padding: '10px 11px',
      border: '1px solid rgba(99, 216, 255, .42)',
      borderRadius: '12px',
      background: 'linear-gradient(145deg, rgba(3, 13, 22, .90), rgba(4, 8, 14, .91))',
      boxShadow: '0 0 18px rgba(0, 180, 255, .13)',
      color: '#eefbff',
      fontFamily: 'system-ui, sans-serif',
      pointerEvents: 'none'
    });
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  botState(now) {
    const local = this.getBotSnapshot?.();
    if (local?.state) return local.state;
    return this.runtime?.sampleRemotePlayer?.(BOT1_PLAYER_ID, now)?.state || null;
  }

  latestCommand(now) {
    const tactical = this.getTacticalSnapshot?.() || {};
    const activePings = tactical?.pings?.activePings || [];
    return [...activePings]
      .filter((ping) => Number(ping?.expiresAt || 0) > now)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null;
  }

  buildSnapshot(now) {
    const bot = this.botState(now);
    const command = this.latestCommand(now);
    const botStatus = String(bot?.squadIntentStatus || SQUAD_COMMAND_STATUS.IDLE);
    const botVisibleUntil = Number(bot?.squadIntentVisibleUntilEpochMs || 0);
    const botVisible = Boolean(
      bot
      && (
        botStatus !== SQUAD_COMMAND_STATUS.IDLE
        || botVisibleUntil > Date.now()
      )
    );
    const commandDistance = command?.position
      ? distance(this.player?.pos, command.position)
      : null;
    return Object.freeze({
      active: this.active,
      online: this.isOnlineRun(),
      command: command ? Object.freeze({
        type: command.type,
        label: squadIntentLabel(command.type),
        ownerName: command.ownerName || 'OPERATIVE',
        distance: commandDistance
      }) : null,
      bot: botVisible ? Object.freeze({
        displayName: bot.displayName || BOT1_DISPLAY_NAME,
        type: bot.squadIntentType || null,
        status: botStatus,
        ownerName: bot.squadIntentOwnerName || null
      }) : null
    });
  }

  renderRow(title, primary, secondary, color) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      marginTop: '7px',
      paddingTop: '7px',
      borderTop: '1px solid rgba(255,255,255,.08)'
    });
    const heading = document.createElement('div');
    heading.textContent = title;
    Object.assign(heading.style, {
      color: '#89aabd',
      fontSize: '9px',
      fontWeight: '900',
      letterSpacing: '.10em'
    });
    const value = document.createElement('strong');
    value.textContent = primary;
    Object.assign(value.style, {
      display: 'block',
      marginTop: '2px',
      color,
      fontSize: '12px',
      letterSpacing: '.035em'
    });
    const detail = document.createElement('small');
    detail.textContent = secondary;
    Object.assign(detail.style, {
      display: 'block',
      marginTop: '2px',
      color: '#d0e5ef',
      fontSize: '10px'
    });
    row.append(heading, value, detail);
    return row;
  }

  update(now = performance.now()) {
    if (!this.active || !this.isOnlineRun()) {
      if (this.root) this.root.style.display = 'none';
      return;
    }
    if (now - this.lastRenderAt < 140) return;
    this.lastRenderAt = now;
    const snapshot = this.buildSnapshot(now);
    this.lastSnapshot = snapshot;
    const root = this.ensureRoot();
    if (!root) return;

    if (!snapshot.command && !snapshot.bot) {
      root.style.display = 'none';
      return;
    }

    root.style.display = 'block';
    root.replaceChildren();
    const title = document.createElement('div');
    title.textContent = 'SQUAD INTENT';
    Object.assign(title.style, {
      color: '#f2fdff',
      fontSize: '10px',
      fontWeight: '1000',
      letterSpacing: '.14em'
    });
    root.appendChild(title);

    if (snapshot.command) {
      root.appendChild(this.renderRow(
        `${snapshot.command.ownerName} · COMMAND`,
        snapshot.command.label,
        snapshot.command.distance === null ? 'ACTIVE MARK' : `${meters(snapshot.command.distance)} FROM YOU`,
        '#6fe5ff'
      ));
    }
    if (snapshot.bot) {
      root.appendChild(this.renderRow(
        snapshot.bot.displayName,
        snapshot.bot.status,
        snapshot.bot.ownerName ? `RESPONDING TO ${snapshot.bot.ownerName}` : 'AUTONOMOUS TEAM ACTION',
        statusColor(snapshot.bot.status)
      ));
    }
  }

  getSnapshot() {
    return this.lastSnapshot || this.buildSnapshot(performance.now());
  }

  destroy() {
    this.endRun();
    this.root?.remove?.();
    this.root = null;
  }
}
