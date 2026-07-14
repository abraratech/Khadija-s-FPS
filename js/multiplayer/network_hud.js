// POST.1A R1 - player-facing co-op status HUD.
// Raw RTT/jitter/loss/reconciliation telemetry is debug-only.
const UPDATE_INTERVAL_MS = 200;
const QUALITY_COLORS = Object.freeze({
  WAITING: '#c7d2df',
  EXCELLENT: '#63ff9b',
  GOOD: '#9dff70',
  FAIR: '#ffd166',
  POOR: '#ff9f43',
  UNSTABLE: '#ff5c5c',
  RECONNECTING: '#ff4fd8'
});
const QUALITY_LABELS = Object.freeze({
  WAITING: 'CONNECTING',
  EXCELLENT: 'CONNECTION EXCELLENT',
  GOOD: 'CONNECTION GOOD',
  FAIR: 'MINOR NETWORK DELAY',
  POOR: 'NOTICEABLE NETWORK DELAY',
  UNSTABLE: 'HIGH DELAY - ACTIONS MAY ARRIVE LATE',
  RECONNECTING: 'RESTORING CONNECTION'
});
function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function percentage(value, maxValue) {
  const max = Math.max(1, safeNumber(maxValue, 100));
  return Math.max(0, Math.min(100, safeNumber(value, max) / max * 100));
}
function lifeLabel(entry) {
  const value = String(entry?.lifeState || '').toUpperCase();
  if (value === 'DOWNED') return 'DOWNED';
  if (value === 'SPECTATING' || value === 'ELIMINATED') return 'SPECTATING';
  return 'ACTIVE';
}
function debugNetworkMetricsEnabled() {
  try {
    return globalThis.KA_MULTIPLAYER_DEBUG === true
      || globalThis.localStorage?.getItem?.('ka_multiplayer_debug') === '1';
  } catch {
    return false;
  }
}
export class MultiplayerNetworkHud {
  constructor({
    runtime,
    session,
    players,
    getEconomySnapshot = () => null,
    getReviveSnapshot = () => null,
    getMigrationSnapshot = () => null
  } = {}) {
    this.runtime = runtime;
    this.session = session;
    this.players = players;
    this.getEconomySnapshot = getEconomySnapshot;
    this.getReviveSnapshot = getReviveSnapshot;
    this.getMigrationSnapshot = getMigrationSnapshot;
    this.root = null;
    this.lastUpdateAt = 0;
    this.lastSnapshot = null;
  }

  isOnlineRun() {
    return this.session?.run?.active === true
      && (this.session?.mode === 'host' || this.session?.mode === 'client');
  }

  ensureRoot() {
    if (this.root || typeof document === 'undefined') return this.root;
    const root = document.createElement('section');
    root.id = 'multiplayer-network-hud';
    root.setAttribute('aria-label', 'Co-op connection and teammate status');
    Object.assign(root.style, {
      position: 'fixed', top: '132px', right: '12px', zIndex: '70', width: '250px',
      padding: '8px', border: '1px solid rgba(160,220,255,.32)', borderRadius: '8px',
      background: 'rgba(5,12,20,.78)', boxShadow: '0 4px 18px rgba(0,0,0,.34)',
      color: '#edf8ff', fontFamily: 'system-ui,sans-serif', fontSize: '11px',
      lineHeight: '1.3', pointerEvents: 'none', backdropFilter: 'blur(4px)'
    });
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  reset() {
    this.lastSnapshot = null;
    this.lastUpdateAt = 0;
    if (this.root) this.root.style.display = 'none';
  }

  buildSnapshot(now) {
    const room = this.runtime?.room?.getSnapshot?.() || {};
    const registry = this.players?.getPlayersSnapshot?.() || [];
    const registryById = new Map(registry.map((entry) => [entry.playerId, entry]));
    const economy = this.getEconomySnapshot?.() || {};
    const accounts = new Map((economy.accounts || []).map((entry) => [entry.playerId, entry]));
    const revive = this.getReviveSnapshot?.() || {};
    const revivePlayers = new Map((revive.state?.players || []).map((entry) => [entry.playerId, entry]));
    const migration = this.getMigrationSnapshot?.() || {};
    const network = this.runtime?.getNetworkQualitySnapshot?.(Date.now())
      || this.runtime?.getSnapshot?.()?.networkQuality
      || {};
    const reconciliation = this.runtime?.getReconciliationSnapshot?.(Date.now()) || {};
    const localPlayerId = this.runtime?.localPlayerId || null;
    const hostPlayerId = room.hostPlayerId || this.session?.hostPlayerId || null;
    const teammates = (room.players || []).map((roomPlayer) => {
      const registered = registryById.get(roomPlayer.playerId);
      const state = registered?.state || {};
      const life = revivePlayers.get(roomPlayer.playerId);
      const account = accounts.get(roomPlayer.playerId);
      const connected = roomPlayer.connected !== false;
      return {
        playerId: roomPlayer.playerId,
        displayName: roomPlayer.displayName || registered?.displayName || 'Player',
        isLocal: roomPlayer.playerId === localPlayerId,
        isHost: roomPlayer.playerId === hostPlayerId,
        connected,
        health: safeNumber(life?.health, safeNumber(state.health, 100)),
        maxHealth: safeNumber(life?.maxHealth, safeNumber(state.maxHealth, 100)),
        score: safeNumber(account?.score, state.score ?? 0),
        lifeState: connected ? lifeLabel(life) : 'RECONNECTING'
      };
    });
    return {
      updatedAt: now,
      roomCode: room.roomCode || null,
      network,
      reconciliation,
      authorityEpoch: safeNumber(room.authorityEpoch, migration.authorityEpoch || 0),
      migrationStatus: migration.status || null,
      teammates
    };
  }

  render(snapshot) {
    const root = this.ensureRoot();
    if (!root) return;
    root.replaceChildren();
    const network = snapshot.network || {};
    const reconciliation = snapshot.reconciliation || {};
    const quality = String(network.level || 'WAITING').toUpperCase();

    const heading = document.createElement('div');
    Object.assign(heading.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '5px', fontWeight: '700', letterSpacing: '.04em'
    });
    const title = document.createElement('span');
    title.textContent = `CO-OP ${snapshot.roomCode || '------'}`;
    const qualityText = document.createElement('span');
    qualityText.textContent = quality;
    qualityText.style.color = QUALITY_COLORS[quality] || '#dbeeff';
    heading.append(title, qualityText);
    root.appendChild(heading);

    const qualityDetail = document.createElement('div');
    qualityDetail.textContent = QUALITY_LABELS[quality] || 'CONNECTION STATUS UNKNOWN';
    Object.assign(qualityDetail.style, {
      marginBottom: '7px', color: quality === 'UNSTABLE' ? '#ff9696' : '#b9d8ea'
    });
    root.appendChild(qualityDetail);

    if (debugNetworkMetricsEnabled()) {
      const stats = document.createElement('div');
      stats.textContent = [
        `${safeNumber(network.rttMs)} ms`,
        `J ${safeNumber(network.jitterMs)} ms`,
        `L ${safeNumber(network.packetLossPct)}%`,
        `B ${safeNumber(network.interpolationDelayMs)} ms`,
        `S ${safeNumber(network.silenceMs)} ms`,
        `SYNC ${String(reconciliation.status || 'WAITING')}`,
        `G ${safeNumber(reconciliation.metrics?.sequenceGaps)}`
      ].join(' | ');
      Object.assign(stats.style, {
        marginBottom: '7px', color: '#7895a4', fontVariantNumeric: 'tabular-nums',
        fontSize: '10px'
      });
      root.appendChild(stats);
    }

    snapshot.teammates.forEach((player) => {
      const card = document.createElement('div');
      Object.assign(card.style, {
        marginTop: '5px', padding: '5px 6px', borderRadius: '5px',
        background: player.isLocal ? 'rgba(72,166,255,.13)' : 'rgba(255,255,255,.06)'
      });
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', gap: '6px' });
      const name = document.createElement('span');
      name.textContent = `${player.displayName}${player.isLocal ? ' (YOU)' : ''}`;
      const role = document.createElement('span');
      role.textContent = player.isHost
        ? `HOST${player.lifeState !== 'ACTIVE' ? ` - ${player.lifeState}` : ''}`
        : player.lifeState;
      role.style.color = player.lifeState === 'DOWNED'
        ? '#ff6b57'
        : player.lifeState === 'RECONNECTING'
          ? '#ff4fd8'
          : '#9edbff';
      row.append(name, role);
      card.appendChild(row);

      const healthBar = document.createElement('div');
      Object.assign(healthBar.style, {
        height: '3px', margin: '4px 0', borderRadius: '2px', overflow: 'hidden',
        background: 'rgba(255,255,255,.14)'
      });
      const healthFill = document.createElement('div');
      Object.assign(healthFill.style, {
        width: `${percentage(player.health, player.maxHealth)}%`, height: '100%',
        background: player.lifeState === 'DOWNED' ? '#ff5c5c' : '#62e58b'
      });
      healthBar.appendChild(healthFill);
      card.appendChild(healthBar);

      const detail = document.createElement('div');
      detail.textContent = `HP ${Math.round(player.health)}/${Math.round(player.maxHealth)} - ${Math.round(player.score)} pts`;
      detail.style.color = '#b9d8ea';
      card.appendChild(detail);
      root.appendChild(card);
    });
  }

  update(now = performance.now()) {
    if (!this.isOnlineRun()) {
      this.reset();
      return;
    }
    if (now - this.lastUpdateAt < UPDATE_INTERVAL_MS) return;
    this.lastUpdateAt = now;
    this.lastSnapshot = this.buildSnapshot(now);
    const root = this.ensureRoot();
    if (root) root.style.display = 'block';
    this.render(this.lastSnapshot);
  }

  getSnapshot() {
    return this.lastSnapshot ? JSON.parse(JSON.stringify(this.lastSnapshot)) : null;
  }

  destroy() {
    this.root?.remove?.();
    this.root = null;
    this.lastSnapshot = null;
  }
}
