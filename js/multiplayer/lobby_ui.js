import { deriveMultiplayerProductionReleaseUiState } from './production_release_ui_core.js';
import { MULTIPLAYER_PRODUCTION_WORKER_URL } from './production_release_core.js';
import { matchmakingStatusPresentation } from './matchmaking_core.js';
import { roomDirectoryStatusPresentation } from './room_directory_core.js';
import { PVP2_MODE, pvp2StatsPresentation } from './pvp2_core.js';

// js/multiplayer/lobby_ui.js
// POST-LAUNCH.1 R1 — live multiplayer interaction safety and recovery.
// Preserves MPUI.2 R1.1 room isolation while adding action de-duplication, offline gating,
// automatic service refresh after reconnect, and prompt-free room-code copying.

const NAME_STORAGE_KEY = 'ka_multiplayer_display_name';
const MATCH3_PRIORITY_STORAGE_KEY = 'ka_match3_search_priority';
const MATCH3_REGION_POLICY_STORAGE_KEY = 'ka_match3_region_policy';
const MATCH3_ROOM_STATUS_STORAGE_KEY = 'ka_match3_room_status';
const MATCH3_ROOM_SCOPE_STORAGE_KEY = 'ka_match3_room_scope';
const MATCH3_ROOM_BOT_STORAGE_KEY = 'ka_match3_room_bot';
const PVP2_PUBLIC_TEAM_SIZE_STORAGE_KEY = 'ka_pvp2_public_team_size';
const PVP2_ROOM_MODE_FILTER_STORAGE_KEY = 'ka_pvp2_room_mode_filter';
const COOP2_ROLE_STORAGE_KEY = 'ka_coop2_role_v1';
const PVP1_PRIVATE_MODE_STORAGE_KEY = 'ka_pvp1_private_room_mode';
const MPUI1_TAB_STORAGE_KEY = 'ka_mpui1_active_tab';
const POST_LAUNCH1_ACTION_COOLDOWN_MS = 900;
const POST_LAUNCH1_NETWORK_RECOVERY_MS = 3600;

async function copyTextWithFallback(text, sourceElement = null) {
  const value = String(text || '').trim();
  if (!value) return { copied: false, selected: false };

  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(value);
      return { copied: true, selected: false };
    }
  } catch {
    // Fall through to a local DOM copy method for restricted clipboard contexts.
  }

  if (typeof document === 'undefined') return { copied: false, selected: false };
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-10000px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  let copied = false;
  try {
    copied = document.execCommand?.('copy') === true;
  } catch {
    copied = false;
  }
  textarea.remove();
  if (copied) return { copied: true, selected: false };

  if (sourceElement && globalThis.getSelection && document.createRange) {
    try {
      const selection = globalThis.getSelection();
      const range = document.createRange();
      range.selectNodeContents(sourceElement);
      selection?.removeAllRanges?.();
      selection?.addRange?.(range);
      sourceElement.setAttribute('tabindex', '-1');
      sourceElement.focus?.({ preventScroll: true });
      return { copied: false, selected: true };
    } catch {
      // The room code remains visible even if selection is unavailable.
    }
  }
  return { copied: false, selected: false };
}

function escapeForId(value) {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '_');
}

function injectStylesheet() {
  if (document.getElementById('ka-multiplayer-styles')) return;
  const link = document.createElement('link');
  link.id = 'ka-multiplayer-styles';
  link.rel = 'stylesheet';
  link.href = './css/multiplayer.css';
  document.head.appendChild(link);
}

function readStored(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore restricted storage.
  }
}

function optionData(select, fallback) {
  if (!select) return fallback;
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.textContent.trim()
  }));
}

function appendOptions(select, options) {
  select.replaceChildren();
  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
}

function setNumericSelectValue(select, value, fallback = 1) {
  if (!select) return;

  const numericValue = Number(value);
  const match = Array.from(select.options).find((option) => (
    Number(option.value) === numericValue
  ));

  if (match) {
    select.value = match.value;
    return;
  }

  const fallbackMatch = Array.from(select.options).find((option) => (
    Number(option.value) === Number(fallback)
  ));
  select.value = fallbackMatch?.value || select.options[0]?.value || '';
}


const MPUI2_MAP_IDS = new Set([
  'grid_bunker',
  'industrial_yard',
  'neon_depot',
  'parking_garage',
  'hospital_wing',
  'reactor_courtyard'
]);

function mapVisualClass(mapId) {
  const normalized = String(mapId || 'grid_bunker').trim().toLowerCase();
  const safe = MPUI2_MAP_IDS.has(normalized) ? normalized : 'grid_bunker';
  return `ka-map-${safe.replace(/_/g, '-')}`;
}

function displayInitials(displayName) {
  const parts = String(displayName || 'Player')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part[0] || '').join('').toUpperCase();
  return initials || 'P';
}

function formatRoomAge(entry = {}) {
  const ageMs = Math.max(0, Number(entry.ageMs || 0));
  if (ageMs < 15_000) return 'JUST UPDATED';
  if (ageMs < 60_000) return `${Math.max(1, Math.floor(ageMs / 1000))}S AGO`;
  return `${Math.max(1, Math.floor(ageMs / 60_000))}M AGO`;
}

function roomQualityPresentation(entry = {}) {
  const quality = String(entry.quality || '').toLowerCase();
  if (quality === 'excellent') return { label: 'BEST CONNECTION', tone: 'excellent' };
  if (quality === 'good') return { label: 'GOOD CONNECTION', tone: 'good' };
  if (quality === 'expanded') return { label: 'EXPANDED REGION', tone: 'expanded' };
  return { label: entry.scope === 'regional' ? 'REGIONAL' : 'COMPATIBLE', tone: 'compatible' };
}

export class MultiplayerLobbyUI {
  constructor({ actions = {} } = {}) {
    this.actions = actions;
    this.state = null;
    this.elements = {};
    this.opened = false;
    this.activeTab = readStored(MPUI1_TAB_STORAGE_KEY, 'play');
    this.actionLocks = new Map();
    this.networkOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    this.networkRestoredUntil = 0;
  }

  runActionOnce(key, callback, { button = null, cooldownMs = POST_LAUNCH1_ACTION_COOLDOWN_MS } = {}) {
    const actionKey = String(key || 'action');
    const now = Date.now();
    const lockedUntil = Number(this.actionLocks.get(actionKey) || 0);
    if (lockedUntil > now) return false;

    const safeCooldown = Math.max(250, Math.min(5000, Number(cooldownMs) || POST_LAUNCH1_ACTION_COOLDOWN_MS));
    this.actionLocks.set(actionKey, now + safeCooldown);
    button?.classList?.add('ka-action-pending');
    button?.setAttribute?.('aria-busy', 'true');

    try {
      callback?.();
    } catch (error) {
      this.actionLocks.delete(actionKey);
      button?.classList?.remove('ka-action-pending');
      button?.removeAttribute?.('aria-busy');
      throw error;
    }

    globalThis.setTimeout?.(() => {
      if (Number(this.actionLocks.get(actionKey) || 0) <= Date.now()) {
        this.actionLocks.delete(actionKey);
      }
      button?.classList?.remove('ka-action-pending');
      button?.removeAttribute?.('aria-busy');
    }, safeCooldown + 30);
    return true;
  }

  handleNetworkChange(online) {
    const restored = online === true;
    this.networkOffline = !restored;
    this.networkRestoredUntil = restored ? Date.now() + POST_LAUNCH1_NETWORK_RECOVERY_MS : 0;
    this.render(this.state);

    if (!restored || this.state?.connected || !this.opened) return;
    globalThis.setTimeout?.(() => {
      this.runActionOnce('network-recovery-refresh', () => {
        this.actions.refreshPvp2?.({
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
          scope: 'global'
        });
        if (this.activeTab === 'rooms') {
          this.actions.browseOpenRooms?.({
            serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
            searchPriority: this.elements.match3SearchPriority?.value || 'balanced',
            filters: {
              gameMode: this.elements.roomFilterMode?.value || 'any',
              mapId: this.elements.matchmakingMap?.value || '',
              difficulty: Number(this.elements.matchmakingDifficulty?.value) || null,
              status: this.elements.roomFilterStatus?.value || 'any',
              regionScope: this.elements.roomFilterScope?.value || 'any',
              bot: this.elements.roomFilterBot?.value || 'any',
              joinInProgress: this.elements.roomFilterInProgress?.checked !== false
            }
          });
        }
      }, { cooldownMs: POST_LAUNCH1_NETWORK_RECOVERY_MS });
    }, 250);
  }

  initialize() {
    injectStylesheet();

    const menu = document.getElementById('menu') || document.body;
    const openButton = document.createElement('button');
    openButton.id = 'ka-coop-open';
    openButton.type = 'button';
    openButton.textContent = 'CO-OP';
    openButton.addEventListener('click', () => this.open());
    menu.appendChild(openButton);

    const menuCard = document.getElementById('ka-coop-menu-card');
    if (menuCard) {
      menuCard.addEventListener('click', () => this.open());
      openButton.hidden = true;
    }

    const mount = document.getElementById('ka-multiplayer-hub-mount') || document.body;
    mount.replaceChildren();

    const modal = document.createElement('section');
    modal.id = 'ka-coop-modal';
    modal.className = 'ka-multiplayer-hub-shell';
    modal.setAttribute('aria-hidden', 'false');
    modal.innerHTML = `
      <section class="ka-coop-card ka-mp-hub" role="region" aria-labelledby="ka-coop-title">
        <header class="ka-coop-header ka-mp-hero">
          <div class="ka-mp-hero-copy">
            <span class="ka-coop-kicker">ONLINE OPERATIONS</span>
            <h2 id="ka-coop-title">MULTIPLAYER HUB</h2>
            <p>Deploy with allies, enter rated duels, host custom rooms, and track competitive performance.</p>
          </div>
          <div class="ka-mp-hero-side">
            <div id="ka-coop-status" class="ka-coop-status" data-tone="neutral">ONLINE SERVICES STANDBY</div>
            <button id="ka-coop-close" class="ka-mp-back-btn" type="button" aria-label="Back to main menu">← MAIN MENU</button>
          </div>
        </header>

        <div id="ka-coop-connect-view" class="ka-mp-connect-view">
          <section class="ka-mp-identity-bar" aria-label="Multiplayer identity">
            <label class="ka-coop-field">
              <span>Player name</span>
              <input id="ka-coop-name" maxlength="24" autocomplete="nickname">
            </label>
            <label class="ka-coop-field">
              <span>Co-op role</span>
              <select id="ka-coop2-role">
                <option value="VANGUARD">Vanguard · frontline rescue cover</option>
                <option value="FIELD_MEDIC">Field Medic · faster safer revives</option>
                <option value="RECON">Recon · longer tactical marks</option>
                <option value="SUPPORT">Support · team cohesion utility</option>
              </select>
            </label>
            <div class="ka-mp-service-card"><span>LIVE SERVICE</span><strong>REGION-AWARE</strong><small>Secure managed online connection</small></div>
          </section>

          <nav class="ka-mp-tabs" aria-label="Multiplayer hub sections">
            <button type="button" data-mp-tab="play"><span>▶</span><b>PLAY</b><small>Quick Match</small></button>
            <button type="button" data-mp-tab="rooms"><span>▦</span><b>ROOMS</b><small>Browse + Host</small></button>
            <button type="button" data-mp-tab="competitive"><span>◆</span><b>COMPETITIVE</b><small>Rating + Record</small></button>
            <button type="button" data-mp-tab="private"><span>⌁</span><b>PRIVATE</b><small>Invite Code</small></button>
          </nav>

          <section class="ka-mp-panel" data-mp-panel="play">
            <div class="ka-mp-panel-heading"><div><span>PUBLIC MATCHMAKING</span><strong>CHOOSE YOUR OPERATION</strong></div><small>One click starts a region-aware search.</small></div>
            <div class="ka-mp-mode-grid">
              <article class="ka-mp-mode-card ka-mp-mode-coop">
                <div class="ka-mp-mode-art"><span>●●</span><i>CO-OP</i></div>
                <div><span class="ka-coop-kicker">SHARED SURVIVAL</span><h3>CO-OP QUICK MATCH</h3><p>Fight escalating enemy waves with one human ally or an AI Wingman.</p></div>
                <button id="ka-coop-quick-match" class="ka-coop-primary" type="button">FIND PUBLIC CO-OP</button>
              </article>
              <article class="ka-mp-mode-card ka-mp-mode-pvp">
                <div class="ka-mp-mode-art"><span>⚔</span><i>RATED</i></div>
                <div><span class="ka-coop-kicker">TEAM ELIMINATION</span><h3>PVP QUICK MATCH</h3><p>Enter a rated public 1v1 with isolated competitive rules and equal starts.</p></div>
                <button id="ka-pvp2-quick-match" class="ka-pvp2-primary" type="button">FIND PUBLIC PVP 1V1</button>
              </article>
            </div>

            <section class="ka-matchmaking-panel ka-mp-search-settings" aria-labelledby="ka-matchmaking-title">
              <div class="ka-matchmaking-heading"><div><span class="ka-coop-kicker">MATCH PREFERENCES</span><strong id="ka-matchmaking-title">SEARCH CONFIGURATION</strong></div><span class="ka-matchmaking-region">AUTO REGION</span></div>
              <div class="ka-matchmaking-preferences">
                <label class="ka-coop-field"><span>Arena</span><select id="ka-matchmaking-map"></select></label>
                <label class="ka-coop-field"><span>Difficulty</span><select id="ka-matchmaking-difficulty"></select></label>
                <label class="ka-coop-field"><span>Search priority</span><select id="ka-match3-search-priority"><option value="balanced">Balanced</option><option value="quality">Best connection</option><option value="fast">Fastest match</option></select></label>
                <label class="ka-coop-field"><span>Region policy</span><select id="ka-match3-region-policy"><option value="auto">Region first, then global</option><option value="regional-only">Regional only</option><option value="global">Global immediately</option></select></label>
              </div>
              <div id="ka-matchmaking-status" class="ka-matchmaking-status" data-tone="neutral" hidden>
                <div><strong id="ka-matchmaking-status-title">PUBLIC QUICK MATCH</strong><span id="ka-matchmaking-status-detail">SEARCHING BY CONNECTION, ARENA AND REGION</span></div>
                <span id="ka-matchmaking-elapsed"></span>
                <button id="ka-matchmaking-bot" class="ka-matchmaking-bot" type="button" hidden>DEPLOY AI WINGMATE</button>
                <button id="ka-matchmaking-cancel" type="button">CANCEL</button>
              </div>
            </section>
          </section>

          <section class="ka-mp-panel" data-mp-panel="rooms" hidden>
            <div class="ka-mp-panel-heading"><div><span>COMMUNITY ROOMS</span><strong>BROWSE OR HOST</strong></div><small>Public PvP rooms are unranked and waiting-room only.</small></div>
            <div class="ka-mp-room-create-grid">
              <article class="ka-mp-create-card ka-mp-create-coop"><span class="ka-mp-create-icon">●●</span><div><b>PUBLIC CO-OP</b><small>Open an operation room for another survivor.</small></div><button id="ka-coop-create-public" type="button">CREATE PUBLIC CO-OP ROOM</button></article>
              <article class="ka-mp-create-card ka-mp-create-pvp"><span class="ka-mp-create-icon">⚔</span><div><b>PUBLIC PVP</b><small>Host an unranked Team Elimination room.</small></div><label class="ka-public-pvp-size"><span>Size</span><select id="ka-pvp2-public-team-size"><option value="1">1v1</option><option value="2">2v2</option></select></label><button id="ka-pvp2-create-public" class="ka-pvp2-primary" type="button">CREATE PUBLIC PVP ROOM</button></article>
            </div>
            <div class="ka-public-room-actions ka-mp-browser-action"><button id="ka-coop-browse-rooms" type="button">BROWSE PUBLIC ROOMS</button></div>
            <section id="ka-room-browser" class="ka-room-browser ka-mp2-room-browser" hidden aria-live="polite">
              <div class="ka-room-browser-heading ka-mp2-browser-heading">
                <div class="ka-mp2-browser-heading-icon" aria-hidden="true">▦</div>
                <div class="ka-mp2-browser-heading-copy"><strong id="ka-room-browser-title">PUBLIC ROOMS</strong><span id="ka-room-browser-detail">HOSTED CO-OP AND UNRANKED TEAM ELIMINATION ROOMS</span></div>
                <div class="ka-mp2-browser-live"><i></i><div><strong id="ka-room-browser-count">0 ROOMS</strong><small id="ka-room-browser-hint">SELECT FILTERS AND REFRESH</small></div></div>
                <button id="ka-room-browser-refresh" type="button">↻ REFRESH</button>
              </div>
              <div class="ka-room-browser-filters ka-mp2-browser-filters">
                <label><span>Mode</span><select id="ka-room-filter-mode"><option value="any">Any mode</option><option value="coop">Co-Op</option><option value="pvp-team-elimination">PvP · Team Elimination</option></select></label>
                <label><span>Status</span><select id="ka-room-filter-status"><option value="any">Any status</option><option value="waiting">Waiting only</option><option value="in-run">In progress</option></select></label>
                <label><span>Region</span><select id="ka-room-filter-scope"><option value="any">Any region</option><option value="regional">My region</option><option value="global">Global</option></select></label>
                <label><span>AI</span><select id="ka-room-filter-bot"><option value="any">Any team</option><option value="without-bot">Human slot only</option><option value="with-bot">AI present</option></select></label>
                <label class="ka-room-filter-toggle"><input id="ka-room-filter-in-progress" type="checkbox" checked><span>Allow join-in-progress</span></label>
              </div>
              <div id="ka-room-browser-list" class="ka-room-browser-list ka-mp2-room-grid"></div>
            </section>
          </section>

          <section class="ka-mp-panel" data-mp-panel="competitive" hidden>
            <div class="ka-mp-panel-heading"><div><span>COMPETITIVE RECORD</span><strong>RATED PVP PROFILE</strong></div><small>Only public Quick Match affects rating.</small></div>
            <section class="ka-pvp2-record ka-mp-competitive-card ka-vis1-competitive" aria-labelledby="ka-pvp2-record-title">
              <div class="ka-pvp2-record-heading"><div><span class="ka-coop-kicker">RATED QUICK MATCH</span><strong>COMPETITIVE OPERATOR PROFILE</strong></div><button id="ka-pvp2-refresh" type="button">REFRESH RECORD</button></div>
              <div id="ka-pvp2-rank-hero" class="ka-vis1-rank-hero" style="--rank-tone:#d08a5b">
                <div id="ka-pvp2-rank-emblem" class="ka-vis1-rank-emblem" aria-hidden="true">◆</div>
                <div class="ka-vis1-rank-copy"><span id="ka-pvp2-tier">BRONZE DIVISION</span><strong id="ka-pvp2-record-title">BRONZE · 1000</strong><small id="ka-pvp2-rank-progress">100 RATING TO SILVER</small></div>
                <div class="ka-vis1-rank-rating"><span>CURRENT RATING</span><b id="ka-pvp2-rating-value">1000</b><small id="ka-pvp2-best-rating">BEST 1000</small></div>
                <div class="ka-vis1-rank-meter" aria-label="Competitive rank progress"><i id="ka-pvp2-rank-meter"></i></div>
              </div>
              <div class="ka-pvp2-record-grid ka-vis1-metric-grid">
                <span><small>MATCH RECORD</small><b id="ka-pvp2-record">0W · 0L</b></span>
                <span><small>COMBAT</small><b id="ka-pvp2-performance">0 ELIMS · 0 DEATHS</b></span>
                <span><small>MOMENTUM</small><b id="ka-pvp2-streak">NO ACTIVE STREAK</b></span>
              </div>
              <div class="ka-vis1-section-title"><div><span>COMPETITIVE BADGES</span><strong>CAREER MILESTONES</strong></div><small>Earned through rated public PvP</small></div>
              <div id="ka-pvp2-milestones" class="ka-vis1-pvp-milestones"></div>
              <div class="ka-vis1-section-title"><div><span>PUBLIC STANDINGS</span><strong>TOP OPERATORS</strong></div><small>Global leaderboard</small></div>
              <ol id="ka-pvp2-leaderboard" class="ka-pvp2-leaderboard"><li>NO PUBLIC PVP RESULTS YET</li></ol>
            </section>
          </section>

          <section class="ka-mp-panel" data-mp-panel="private" hidden>
            <div class="ka-mp-panel-heading"><div><span>INVITE-ONLY PLAY</span><strong>PRIVATE SQUAD ROOM</strong></div><small>Create a room or join with a six-character code.</small></div>
            <div class="ka-mp-private-card">
              <label class="ka-coop-field ka-pvp1-private-mode"><span>Private room mode</span><select id="ka-private-game-mode"><option value="coop">Co-Op Operations</option><option value="pvp-team-elimination">PvP · Team Elimination (1v1 / 2v2)</option></select></label>
              <p id="ka-pvp1-private-note" class="ka-pvp1-private-note">PvP uses isolated rooms, separate damage rules, no AI enemies, no Wingman, and no Co-Op reward receipts.</p>
              <div class="ka-coop-connect-grid"><button id="ka-coop-create" class="ka-coop-primary" type="button">CREATE PRIVATE ROOM</button><div class="ka-coop-join-row"><input id="ka-coop-code-input" maxlength="6" placeholder="ROOM CODE" autocomplete="off"><button id="ka-coop-join" type="button">JOIN ROOM</button></div></div>
            </div>
          </section>
        </div>

        <div id="ka-coop-room-view" class="ka-mp-room-view ka-mp2-lobby" hidden>
          <div id="ka-mp-room-visual" class="ka-mp-room-banner ka-mp2-lobby-hero ka-map-grid-bunker" data-mode="coop">
            <div class="ka-mp2-lobby-hero-shade"></div>
            <div class="ka-mp2-lobby-hero-copy">
              <div class="ka-mp2-lobby-badges"><span id="ka-mp-room-mode-badge">CO-OP</span><span id="ka-mp-room-status-badge">WAITING</span><span id="ka-mp-room-visibility-badge">PRIVATE</span></div>
              <span class="ka-coop-kicker">ACTIVE LOBBY</span>
              <h3 id="ka-mp-room-title">TEAM ASSEMBLY</h3>
              <p id="ka-mp-room-subtitle">Prepare your squad and confirm readiness.</p>
            </div>
            <div class="ka-coop-room-top ka-mp2-room-code-panel"><div><span class="ka-coop-label">ROOM CODE</span><strong id="ka-coop-code">------</strong><small id="ka-mp-room-rule-badge">SHARED SURVIVAL</small></div><button id="ka-coop-copy" type="button">COPY CODE</button></div>
          </div>

          <div class="ka-mp2-readiness-panel">
            <div class="ka-mp2-readiness-copy"><span>LOBBY STATUS</span><strong id="ka-mp-ready-summary">WAITING FOR OPERATIVES</strong><small id="ka-mp-ready-detail">Invite players or open the room to continue.</small></div>
            <div class="ka-mp2-readiness-meter" aria-hidden="true"><i id="ka-mp-ready-meter"></i></div>
          </div>

          <div id="ka-coop-player-list" class="ka-coop-player-list ka-mp2-player-grid"></div>

          <section class="ka-mp2-lobby-settings">
            <div id="ka-mp-lobby-map-preview" class="ka-mp2-map-preview ka-map-grid-bunker"><div><span>SELECTED ARENA</span><strong id="ka-mp-lobby-map-name">GRID BUNKER</strong><small id="ka-mp-lobby-map-rule">HOST CAN CHANGE BEFORE DEPLOYMENT</small></div></div>
            <div class="ka-coop-settings-grid ka-mp2-settings-grid"><label class="ka-coop-field"><span>Arena</span><select id="ka-coop-map"></select></label><label class="ka-coop-field"><span>Difficulty</span><select id="ka-coop-difficulty"></select></label></div>
          </section>

          <div class="ka-coop-actions ka-mp2-lobby-actions"><button id="ka-coop-ready" type="button" aria-label="Set status to ready">READY</button><button id="ka-coop-start" class="ka-coop-primary" type="button">START CO-OP RUN</button><button id="ka-coop-leave" class="ka-coop-danger" type="button">LEAVE ROOM</button></div>
        </div>
      </section>
    `;

    mount.appendChild(modal);

    this.elements = {
      modal,
      openButton,
      close: modal.querySelector('#ka-coop-close'),
      tabbar: modal.querySelector('.ka-mp-tabs'),
      tabButtons: Array.from(modal.querySelectorAll('[data-mp-tab]')),
      tabPanels: Array.from(modal.querySelectorAll('[data-mp-panel]')),
      status: modal.querySelector('#ka-coop-status'),
      connectView: modal.querySelector('#ka-coop-connect-view'),
      roomView: modal.querySelector('#ka-coop-room-view'),
      name: modal.querySelector('#ka-coop-name'),
      coop2Role: modal.querySelector('#ka-coop2-role'),
      quickMatch: modal.querySelector('#ka-coop-quick-match'),
      pvp2QuickMatch: modal.querySelector('#ka-pvp2-quick-match'),
      browseRooms: modal.querySelector('#ka-coop-browse-rooms'),
      createPublic: modal.querySelector('#ka-coop-create-public'),
      createPublicPvp: modal.querySelector('#ka-pvp2-create-public'),
      publicPvpTeamSize: modal.querySelector('#ka-pvp2-public-team-size'),
      roomBrowser: modal.querySelector('#ka-room-browser'),
      roomBrowserTitle: modal.querySelector('#ka-room-browser-title'),
      roomBrowserDetail: modal.querySelector('#ka-room-browser-detail'),
      roomBrowserCount: modal.querySelector('#ka-room-browser-count'),
      roomBrowserHint: modal.querySelector('#ka-room-browser-hint'),
      roomBrowserRefresh: modal.querySelector('#ka-room-browser-refresh'),
      roomBrowserList: modal.querySelector('#ka-room-browser-list'),
      matchmakingMap: modal.querySelector('#ka-matchmaking-map'),
      matchmakingDifficulty: modal.querySelector('#ka-matchmaking-difficulty'),
      match3SearchPriority: modal.querySelector('#ka-match3-search-priority'),
      match3RegionPolicy: modal.querySelector('#ka-match3-region-policy'),
      roomFilterMode: modal.querySelector('#ka-room-filter-mode'),
      roomFilterStatus: modal.querySelector('#ka-room-filter-status'),
      roomFilterScope: modal.querySelector('#ka-room-filter-scope'),
      roomFilterBot: modal.querySelector('#ka-room-filter-bot'),
      roomFilterInProgress: modal.querySelector('#ka-room-filter-in-progress'),
      matchmakingStatus: modal.querySelector('#ka-matchmaking-status'),
      matchmakingStatusTitle: modal.querySelector('#ka-matchmaking-status-title'),
      matchmakingStatusDetail: modal.querySelector('#ka-matchmaking-status-detail'),
      matchmakingElapsed: modal.querySelector('#ka-matchmaking-elapsed'),
      matchmakingBot: modal.querySelector('#ka-matchmaking-bot'),
      matchmakingCancel: modal.querySelector('#ka-matchmaking-cancel'),
      pvp2Refresh: modal.querySelector('#ka-pvp2-refresh'),
      pvp2RecordTitle: modal.querySelector('#ka-pvp2-record-title'),
      pvp2RankHero: modal.querySelector('#ka-pvp2-rank-hero'),
      pvp2RankEmblem: modal.querySelector('#ka-pvp2-rank-emblem'),
      pvp2Tier: modal.querySelector('#ka-pvp2-tier'),
      pvp2RankProgress: modal.querySelector('#ka-pvp2-rank-progress'),
      pvp2RatingValue: modal.querySelector('#ka-pvp2-rating-value'),
      pvp2BestRating: modal.querySelector('#ka-pvp2-best-rating'),
      pvp2RankMeter: modal.querySelector('#ka-pvp2-rank-meter'),
      pvp2Milestones: modal.querySelector('#ka-pvp2-milestones'),
      pvp2Record: modal.querySelector('#ka-pvp2-record'),
      pvp2Performance: modal.querySelector('#ka-pvp2-performance'),
      pvp2Streak: modal.querySelector('#ka-pvp2-streak'),
      pvp2Leaderboard: modal.querySelector('#ka-pvp2-leaderboard'),
      create: modal.querySelector('#ka-coop-create'),
      privateGameMode: modal.querySelector('#ka-private-game-mode'),
      privateModeNote: modal.querySelector('#ka-pvp1-private-note'),
      codeInput: modal.querySelector('#ka-coop-code-input'),
      join: modal.querySelector('#ka-coop-join'),
      roomVisual: modal.querySelector('#ka-mp-room-visual'),
      roomModeBadge: modal.querySelector('#ka-mp-room-mode-badge'),
      roomStatusBadge: modal.querySelector('#ka-mp-room-status-badge'),
      roomVisibilityBadge: modal.querySelector('#ka-mp-room-visibility-badge'),
      roomTitle: modal.querySelector('#ka-mp-room-title'),
      roomSubtitle: modal.querySelector('#ka-mp-room-subtitle'),
      roomRuleBadge: modal.querySelector('#ka-mp-room-rule-badge'),
      readySummary: modal.querySelector('#ka-mp-ready-summary'),
      readyDetail: modal.querySelector('#ka-mp-ready-detail'),
      readyMeter: modal.querySelector('#ka-mp-ready-meter'),
      lobbyMapPreview: modal.querySelector('#ka-mp-lobby-map-preview'),
      lobbyMapName: modal.querySelector('#ka-mp-lobby-map-name'),
      lobbyMapRule: modal.querySelector('#ka-mp-lobby-map-rule'),
      roomCode: modal.querySelector('#ka-coop-code'),
      copy: modal.querySelector('#ka-coop-copy'),
      playerList: modal.querySelector('#ka-coop-player-list'),
      map: modal.querySelector('#ka-coop-map'),
      difficulty: modal.querySelector('#ka-coop-difficulty'),
      ready: modal.querySelector('#ka-coop-ready'),
      start: modal.querySelector('#ka-coop-start'),
      leave: modal.querySelector('#ka-coop-leave')
    };

    const rejoin = document.createElement('button');
        rejoin.id = 'ka-coop-rejoin';
        rejoin.className = 'ka-coop-primary';
        rejoin.type = 'button';
        rejoin.textContent = 'REJOIN LAST ROOM';
        rejoin.hidden = true;
        this.elements.join.insertAdjacentElement('afterend', rejoin);
        this.elements.rejoin = rejoin;

        this.installHostControls(); this.elements.name.value = readStored(NAME_STORAGE_KEY, 'Player');
    this.elements.coop2Role.value = readStored(COOP2_ROLE_STORAGE_KEY, 'VANGUARD');
    this.elements.privateGameMode.value = readStored(
      PVP1_PRIVATE_MODE_STORAGE_KEY,
      'coop'
    );

    appendOptions(
      this.elements.map,
      optionData(document.getElementById('map-select'), [
        { value: 'grid_bunker', label: 'Grid Bunker' }
      ])
    );
    appendOptions(
      this.elements.difficulty,
      optionData(document.getElementById('diff-select'), [
        { value: '1.0', label: 'Normal' }
      ])
    );
    appendOptions(
      this.elements.matchmakingMap,
      optionData(document.getElementById('map-select'), [
        { value: 'grid_bunker', label: 'Grid Bunker' }
      ])
    );
    appendOptions(
      this.elements.matchmakingDifficulty,
      optionData(document.getElementById('diff-select'), [
        { value: '1.0', label: 'Normal' }
      ])
    );

    this.elements.map.value = 'grid_bunker';
    setNumericSelectValue(this.elements.difficulty, 1, 1);
    this.elements.matchmakingMap.value = (
      document.getElementById('map-select')?.value || 'grid_bunker'
    );
    setNumericSelectValue(
      this.elements.matchmakingDifficulty,
      document.getElementById('diff-select')?.value || 1,
      1
    );
    this.elements.match3SearchPriority.value = readStored(
      MATCH3_PRIORITY_STORAGE_KEY,
      'balanced'
    );
    this.elements.match3RegionPolicy.value = readStored(
      MATCH3_REGION_POLICY_STORAGE_KEY,
      'auto'
    );
    this.elements.publicPvpTeamSize.value = readStored(
      PVP2_PUBLIC_TEAM_SIZE_STORAGE_KEY,
      '1'
    );
    this.elements.roomFilterMode.value = readStored(
      PVP2_ROOM_MODE_FILTER_STORAGE_KEY,
      'any'
    );
    this.elements.roomFilterStatus.value = readStored(
      MATCH3_ROOM_STATUS_STORAGE_KEY,
      'any'
    );
    this.elements.roomFilterScope.value = readStored(
      MATCH3_ROOM_SCOPE_STORAGE_KEY,
      'any'
    );
    this.elements.roomFilterBot.value = readStored(
      MATCH3_ROOM_BOT_STORAGE_KEY,
      'any'
    );

    this.bindEvents();
    this.switchHubTab(this.activeTab);
    this.render({
      connected: false,
      connecting: false,
      transportState: 'connected',
      transportMode: 'local',
      room: null,
      matchmaking: {
        status: 'idle',
        active: false,
        queuedAt: 0,
        elapsedMs: 0,
        fallbackAt: 0
      },
      roomDirectory: {
        status: 'idle',
        active: false,
        rooms: [],
        region: 'ZZ',
        error: null,
        refreshedAt: 0
      },
            lastRoom: null,
            localPlayerId: null,
      error: null
    });

    window.addEventListener('offline', () => this.handleNetworkChange(false));
    window.addEventListener('online', () => this.handleNetworkChange(true));
  }


  installHostControls() {
    const panel = document.createElement('section');
    panel.id = 'ka-coop-host-controls';
    panel.className = 'ka-coop-host-controls';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="ka-coop-host-controls-title">HOST CONTROLS</div>
      <label>
        PLAYER LIMIT
        <select id="ka-coop-max-players">
          <option value="2">2 PLAYERS</option>
          <option value="3">3 PLAYERS</option>
          <option value="4">4 PLAYERS</option>
        </select>
      </label>
      <label class="ka-coop-toggle">
        <input id="ka-coop-room-locked" type="checkbox">
        LOCK ROOM
      </label>
      <label class="ka-coop-toggle">
        <input id="ka-coop-late-join" type="checkbox" checked>
        ALLOW LATE JOIN
      </label>
      <label class="ka-coop-toggle">
        <input id="ka-coop-public-listing" type="checkbox">
        LIST AS PUBLIC ROOM
      </label>
      <div id="ka-coop-team-options" class="ka-coop-team-options" hidden>
        <div class="ka-coop-team-options-copy">
          <strong>TEAM OPTIONS</strong>
          <span>Search opens a fresh public room. The AI uses a separate companion slot.</span>
        </div>
        <div class="ka-coop-team-options-actions">
          <button id="ka-coop-find-public-ally" type="button">FIND NEW PUBLIC ALLY</button>
          <button id="ka-coop-call-wingman" type="button">CALL AI WINGMAN</button>
          <button id="ka-coop-dismiss-wingman" type="button">DISMISS WINGMAN</button>
        </div>
      </div>
    `;

    const actionRow = this.elements.ready?.closest(
      '.ka-coop-actions, .ka-coop-room-actions'
    ) || this.elements.ready;
    if (actionRow?.parentElement) {
      actionRow.parentElement.insertBefore(panel, actionRow);
    } else {
      this.elements.roomView?.appendChild(panel);
    }

    this.elements.hostControls = panel;
    this.elements.maxPlayers = panel.querySelector(
      '#ka-coop-max-players'
    );
    this.elements.roomLocked = panel.querySelector(
      '#ka-coop-room-locked'
    );
    this.elements.allowLateJoin = panel.querySelector(
      '#ka-coop-late-join'
    );
    this.elements.publicListing = panel.querySelector(
      '#ka-coop-public-listing'
    );
    this.elements.teamOptions = panel.querySelector('#ka-coop-team-options');
    this.elements.findPublicAlly = panel.querySelector(
      '#ka-coop-find-public-ally'
    );
    this.elements.callWingman = panel.querySelector('#ka-coop-call-wingman');
    this.elements.dismissWingman = panel.querySelector(
      '#ka-coop-dismiss-wingman'
    );

    this.elements.maxPlayers?.addEventListener('change', () => {
      this.actions.updateSettings?.({
        maxPlayers: Number(this.elements.maxPlayers.value) || 4
      });
    });
    this.elements.roomLocked?.addEventListener('change', () => {
      this.actions.updateSettings?.({
        locked: this.elements.roomLocked.checked === true
      });
    });
    this.elements.allowLateJoin?.addEventListener('change', () => {
      this.actions.updateSettings?.({
        allowLateJoin: this.elements.allowLateJoin.checked === true
      });
    });
    this.elements.publicListing?.addEventListener('change', () => {
      this.actions.updateSettings?.({
        publicListing: this.elements.publicListing.checked === true,
        locked: this.elements.publicListing.checked === true
          ? false
          : this.elements.roomLocked.checked === true
      });
    });
    this.elements.findPublicAlly?.addEventListener('click', () => {
      this.runActionOnce('find-public-ally', () => {
        this.saveIdentity();
        this.actions.findReplacementPublicAlly?.({
          displayName: this.elements.name.value,
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
          mapId: this.elements.map.value || 'grid_bunker',
          difficulty: Number(this.elements.difficulty.value) || 1
        });
      }, { button: this.elements.findPublicAlly, cooldownMs: 1400 });
    });
    this.elements.callWingman?.addEventListener('click', () => {
      this.runActionOnce('call-wingman', () => {
        this.actions.deployRoomBotFill?.({
          mapId: this.elements.map.value || 'grid_bunker',
          difficulty: Number(this.elements.difficulty.value) || 1
        });
      }, { button: this.elements.callWingman, cooldownMs: 1400 });
    });
    this.elements.dismissWingman?.addEventListener('click', () => {
      this.runActionOnce('dismiss-wingman', () => {
        this.actions.dismissRoomBotFill?.();
      }, { button: this.elements.dismissWingman, cooldownMs: 1000 });
    });
  }

bindEvents() {
    this.elements.close.addEventListener('click', () => this.close());
    this.elements.tabButtons.forEach((button) => {
      button.addEventListener('click', () => this.switchHubTab(button.dataset.mpTab));
    });

    this.elements.coop2Role.addEventListener('change', () => {
      const roleId = this.elements.coop2Role.value || 'VANGUARD';
      writeStored(COOP2_ROLE_STORAGE_KEY, roleId);
      window.dispatchEvent(new CustomEvent('ka:coop2-role-selected', {
        detail: { roleId }
      }));
    });

    this.elements.quickMatch.addEventListener('click', () => {
      this.runActionOnce('quick-match-coop', () => {
        this.saveIdentity();
        this.actions.quickMatch?.({
          displayName: this.elements.name.value,
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
          mapId: this.elements.matchmakingMap.value || 'grid_bunker',
          difficulty: Number(this.elements.matchmakingDifficulty.value) || 1,
          searchPriority: this.elements.match3SearchPriority.value || 'balanced',
          regionPolicy: this.elements.match3RegionPolicy.value || 'auto',
          allowBackfill: true,
          joinInProgress: this.elements.roomFilterInProgress.checked !== false
        });
      }, { button: this.elements.quickMatch, cooldownMs: 1500 });
    });

    this.elements.pvp2QuickMatch.addEventListener('click', () => {
      this.runActionOnce('quick-match-pvp', () => {
        this.saveIdentity();
        this.actions.quickMatch?.({
          displayName: this.elements.name.value,
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
          mapId: this.elements.matchmakingMap.value || 'grid_bunker',
          difficulty: 1,
          searchPriority: this.elements.match3SearchPriority.value || 'balanced',
          regionPolicy: this.elements.match3RegionPolicy.value || 'auto',
          allowBackfill: false,
          joinInProgress: false,
          mode: PVP2_MODE
        });
      }, { button: this.elements.pvp2QuickMatch, cooldownMs: 1500 });
    });

    this.elements.pvp2Refresh.addEventListener('click', () => {
      this.runActionOnce('refresh-pvp-stats', () => {
        this.saveIdentity();
        this.actions.refreshPvp2?.({
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
          scope: 'global'
        });
      }, { button: this.elements.pvp2Refresh, cooldownMs: 1200 });
    });

    const browseRooms = () => {
      this.switchHubTab('rooms');
      this.saveIdentity();
      this.actions.browseOpenRooms?.({
        serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
        searchPriority: this.elements.match3SearchPriority.value || 'balanced',
        filters: {
          gameMode: this.elements.roomFilterMode.value || 'any',
          mapId: this.elements.matchmakingMap.value || '',
          difficulty: Number(this.elements.matchmakingDifficulty.value) || null,
          status: this.elements.roomFilterStatus.value || 'any',
          regionScope: this.elements.roomFilterScope.value || 'any',
          bot: this.elements.roomFilterBot.value || 'any',
          joinInProgress: this.elements.roomFilterInProgress.checked !== false
        }
      });
    };
    this.elements.browseRooms.addEventListener('click', () => {
      this.runActionOnce('browse-public-rooms', browseRooms, {
        button: this.elements.browseRooms,
        cooldownMs: 1200
      });
    });
    this.elements.roomBrowserRefresh.addEventListener('click', () => {
      this.runActionOnce('refresh-public-rooms', browseRooms, {
        button: this.elements.roomBrowserRefresh,
        cooldownMs: 1200
      });
    });
    this.elements.createPublic.addEventListener('click', () => {
      this.runActionOnce('create-public-coop', () => {
        this.saveIdentity();
        this.actions.createPublicRoom?.({
          displayName: this.elements.name.value,
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
          gameMode: 'coop'
        });
      }, { button: this.elements.createPublic, cooldownMs: 1600 });
    });
    this.elements.createPublicPvp.addEventListener('click', () => {
      this.runActionOnce('create-public-pvp', () => {
        this.saveIdentity();
        writeStored(
          PVP2_PUBLIC_TEAM_SIZE_STORAGE_KEY,
          this.elements.publicPvpTeamSize.value
        );
        this.actions.createPublicRoom?.({
          displayName: this.elements.name.value,
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
          gameMode: PVP2_MODE,
          teamSize: Number(this.elements.publicPvpTeamSize.value) || 1
        });
      }, { button: this.elements.createPublicPvp, cooldownMs: 1600 });
    });

    this.elements.matchmakingBot.addEventListener('click', () => {
      this.runActionOnce('deploy-matchmaking-bot', () => {
        this.saveIdentity();
        this.actions.deployBotFill?.({
          displayName: this.elements.name.value,
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
          mapId: this.elements.matchmakingMap.value || 'grid_bunker',
          difficulty: Number(this.elements.matchmakingDifficulty.value) || 1
        });
      }, { button: this.elements.matchmakingBot, cooldownMs: 1400 });
    });

    this.elements.matchmakingCancel.addEventListener('click', () => {
      this.runActionOnce('cancel-matchmaking', () => {
        this.actions.cancelQuickMatch?.();
      }, { button: this.elements.matchmakingCancel, cooldownMs: 700 });
    });

    this.elements.match3SearchPriority.addEventListener('change', () => {
      writeStored(MATCH3_PRIORITY_STORAGE_KEY, this.elements.match3SearchPriority.value);
    });
    this.elements.match3RegionPolicy.addEventListener('change', () => {
      writeStored(MATCH3_REGION_POLICY_STORAGE_KEY, this.elements.match3RegionPolicy.value);
    });
    this.elements.roomFilterMode.addEventListener('change', () => {
      writeStored(PVP2_ROOM_MODE_FILTER_STORAGE_KEY, this.elements.roomFilterMode.value);
      if (this.elements.roomFilterMode.value === PVP2_MODE) {
        this.elements.roomFilterStatus.value = 'waiting';
        this.elements.roomFilterBot.value = 'without-bot';
        this.elements.roomFilterInProgress.checked = false;
      }
    });
    this.elements.roomFilterStatus.addEventListener('change', () => {
      writeStored(MATCH3_ROOM_STATUS_STORAGE_KEY, this.elements.roomFilterStatus.value);
    });
    this.elements.roomFilterScope.addEventListener('change', () => {
      writeStored(MATCH3_ROOM_SCOPE_STORAGE_KEY, this.elements.roomFilterScope.value);
    });
    this.elements.roomFilterBot.addEventListener('change', () => {
      writeStored(MATCH3_ROOM_BOT_STORAGE_KEY, this.elements.roomFilterBot.value);
    });

    this.elements.create.addEventListener('click', () => {
      this.runActionOnce('create-private-room', () => {
        this.saveIdentity();
        writeStored(
          PVP1_PRIVATE_MODE_STORAGE_KEY,
          this.elements.privateGameMode.value
        );
        this.actions.createRoom?.({
          displayName: this.elements.name.value,
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
          gameMode: this.elements.privateGameMode.value
        });
      }, { button: this.elements.create, cooldownMs: 1600 });
    });

    this.elements.rejoin.addEventListener('click', () => {
      this.runActionOnce('rejoin-last-room', () => {
        this.saveIdentity();
        this.actions.rejoinLastRoom?.({
          displayName: this.elements.name.value
        });
      }, { button: this.elements.rejoin, cooldownMs: 1600 });
    });
    this.elements.join.addEventListener('click', () => {
      this.runActionOnce('join-private-room', () => {
        this.saveIdentity();
        this.actions.joinRoom?.({
          roomCode: this.elements.codeInput.value,
          displayName: this.elements.name.value,
          serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL
        });
      }, { button: this.elements.join, cooldownMs: 1600 });
    });

    this.elements.codeInput.addEventListener('input', () => {
      this.elements.codeInput.value = this.elements.codeInput.value
        .toUpperCase()
        .replace(/[^A-Z2-9]/g, '')
        .slice(0, 6);
    });

    [
      this.elements.name,
      this.elements.codeInput,
      this.elements.matchmakingMap,
      this.elements.matchmakingDifficulty,
      this.elements.match3SearchPriority,
      this.elements.match3RegionPolicy,
      this.elements.roomFilterStatus,
      this.elements.roomFilterScope,
      this.elements.roomFilterBot,
      this.elements.roomFilterInProgress
    ].forEach((input) => {
      input?.addEventListener('keydown', (event) => {
        event.stopPropagation();
      });
      input?.addEventListener('keyup', (event) => {
        event.stopPropagation();
      });
    });

    this.elements.codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.elements.join.click();
    });

    this.elements.copy.addEventListener('click', async () => {
      const code = this.state?.room?.roomCode || '';
      if (!code) return;
      const result = await copyTextWithFallback(code, this.elements.roomCode);
      this.elements.copy.textContent = result.copied ? 'COPIED' : result.selected ? 'PRESS CTRL+C' : 'CODE VISIBLE';
      if (!result.copied) {
        this.elements.status.textContent = result.selected
          ? 'ROOM CODE SELECTED · COPY IT WITH CTRL+C'
          : 'ROOM CODE IS VISIBLE ABOVE';
        this.elements.status.dataset.tone = 'warning';
      }
      setTimeout(() => {
        this.elements.copy.textContent = 'COPY CODE';
      }, result.copied ? 1000 : 2200);
    });

    this.elements.ready.addEventListener('click', () => {
      this.runActionOnce('toggle-ready', () => {
        const local = this.localPlayer();
        this.actions.setReady?.(!(local?.ready === true));
      }, { button: this.elements.ready, cooldownMs: 600 });
    });

    this.elements.start.addEventListener('click', () => {
      this.runActionOnce('start-room-run', () => {
        this.actions.updateSettings?.({
          mapId: this.elements.map.value || 'grid_bunker',
          difficulty: Number(this.elements.difficulty.value) || 1
        });
        this.actions.startRun?.();
      }, { button: this.elements.start, cooldownMs: 1800 });
    });

    this.elements.leave.addEventListener('click', () => {
      this.runActionOnce('leave-room', () => {
        this.actions.leaveRoom?.();
      }, { button: this.elements.leave, cooldownMs: 1200 });
    });

    const sendSettings = () => {
      this.actions.updateSettings?.({
        mapId: this.elements.map.value,
        difficulty: Number(this.elements.difficulty.value) || 1
      });
    };

    this.elements.map.addEventListener('change', sendSettings);
    this.elements.difficulty.addEventListener('change', sendSettings);
  }

  switchHubTab(tab = 'play') {
    const valid = new Set(['play', 'rooms', 'competitive', 'private']);
    const next = valid.has(tab) ? tab : 'play';
    const online = Boolean(this.state?.room && this.state?.connected);
    this.activeTab = next;
    writeStored(MPUI1_TAB_STORAGE_KEY, next);
    this.elements.tabButtons?.forEach((button) => {
      const active = button.dataset.mpTab === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    this.elements.tabPanels?.forEach((panel) => {
      const isActivePanel = panel.dataset.mpPanel === next;
      const activeLobbyReplacesRoomsPanel = (
        online
        && next === 'rooms'
        && panel.dataset.mpPanel === 'rooms'
      );
      panel.hidden = !isActivePanel || activeLobbyReplacesRoomsPanel;
    });
    if (this.elements.roomView) {
      this.elements.roomView.hidden = !(online && next === 'rooms');
    }
  }

  saveIdentity() {
    const name = this.elements.name.value.trim().slice(0, 24) || 'Player';
    this.elements.name.value = name;
    writeStored(NAME_STORAGE_KEY, name);
  }

  getConnectionIdentity() {
    return {
      displayName: this.elements.name?.value?.trim?.().slice(0, 24) || 'Player',
      serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL
    };
  }

  open() {
    this.opened = true;
    this.elements.modal.classList.add('open');
    this.elements.modal.setAttribute('aria-hidden', 'false');
    window.dispatchEvent(new CustomEvent('ka:menu-screen', {
      detail: { screen: 'multiplayer' }
    }));
    this.switchHubTab(this.activeTab || 'play');
    this.render(this.state);
  }

  close() {
    this.opened = false;
    this.elements.modal.classList.remove('open');
    window.dispatchEvent(new CustomEvent('ka:menu-screen', {
      detail: { screen: 'home' }
    }));
  }

  localPlayer() {
    return this.state?.room?.players?.find(
      (player) => player.playerId === this.state.localPlayerId
    ) || null;
  }

  render(nextState) {
    if (!nextState || !this.elements.modal) return;
    const wasOnline = Boolean(this.state?.room && this.state?.connected);
    this.state = nextState;

    const room = nextState.room;
    const online = Boolean(room && nextState.connected);
    const isPvp = room?.settings?.gameMode === 'pvp-team-elimination';
    const pvpWorkerEnabled = (
      nextState.productionRelease?.worker?.pvp1?.featureEnabled !== false
    );
    const pvp2WorkerEnabled = (
      nextState.productionRelease?.worker?.pvp2?.publicMatchmakingEnabled !== false
    );
    const pvp2CustomRoomsEnabled = (
      nextState.productionRelease?.worker?.pvp2?.publicCustomRoomsEnabled !== false
    );
    if (
      !pvpWorkerEnabled
      && this.elements.privateGameMode?.value === 'pvp-team-elimination'
    ) {
      this.elements.privateGameMode.value = 'coop';
    }
    if (this.elements.privateModeNote) {
      this.elements.privateModeNote.textContent = pvpWorkerEnabled
        ? 'PvP uses isolated rooms, separate damage rules, no AI enemies, no Wingman, and no Co-Op reward receipts.'
        : 'PvP is temporarily disabled by the Worker. Solo and Co-Op remain available.';
    }
    this.elements.connectView.hidden = false;
    if (this.elements.tabbar) this.elements.tabbar.hidden = false;
    if (online && !wasOnline) {
      this.activeTab = 'rooms';
    }
    this.switchHubTab(this.activeTab || 'play');

    const releaseUi = deriveMultiplayerProductionReleaseUiState({
      productionRelease: nextState.productionRelease,
      connecting: nextState.connecting,
      online,
      error: nextState.error
    });
    let statusText = releaseUi.statusText;
    let tone = releaseUi.tone;
    if (online && room.status === 'in-run') {
      statusText = isPvp ? 'PVP TEAM ELIMINATION ACTIVE' : 'CO-OP RUN ACTIVE';
    } else if (nextState.transportMode === 'online' && nextState.transportState === 'connected' && !online && releaseUi.status !== 'FAIL') {
      statusText = 'AWAITING ROOM CONFIRMATION…';
      tone = 'warning';
    }
    if (this.networkOffline) {
      statusText = 'OFFLINE · ONLINE PLAY WILL RESUME AUTOMATICALLY';
      tone = 'danger';
    } else if (!online && Date.now() < this.networkRestoredUntil) {
      statusText = 'CONNECTION RESTORED · REFRESHING ONLINE PLAY';
      tone = 'warning';
    }
    this.elements.status.textContent = statusText;
    this.elements.status.dataset.tone = tone;
    this.elements.openButton.dataset.online = online ? 'true' : 'false';
    this.elements.openButton.textContent = online
      ? `${isPvp ? 'PVP' : 'CO-OP'} · ${room.roomCode || 'ONLINE'}`
      : 'CO-OP / PVP';

    const matchmaking = nextState.matchmaking || { status: 'idle' };
    const matchmakingUi = matchmakingStatusPresentation(matchmaking);
    const matchmakingActive = ['searching', 'matched', 'connecting'].includes(
      matchmaking.status
    );
    const disabled = nextState.connecting || releaseUi.blockActions || this.networkOffline;
    this.elements.quickMatch.disabled = disabled || online || matchmakingActive;
    this.elements.pvp2QuickMatch.disabled = disabled || online || matchmakingActive || !pvp2WorkerEnabled;
    this.elements.matchmakingMap.disabled = disabled || matchmakingActive;
    this.elements.matchmakingDifficulty.disabled = disabled || matchmakingActive;
    this.elements.match3SearchPriority.disabled = disabled || matchmakingActive;
    this.elements.match3RegionPolicy.disabled = disabled || matchmakingActive;
    this.elements.matchmakingStatus.hidden = (
      !matchmakingActive
      && !['error', 'cancelled', 'expired'].includes(matchmaking.status)
    );
    this.elements.matchmakingStatus.dataset.tone = matchmakingUi.tone;
    this.elements.matchmakingStatusTitle.textContent = matchmakingUi.title;
    this.elements.matchmakingStatusDetail.textContent = matchmakingUi.detail;
    this.elements.matchmakingElapsed.textContent = matchmakingUi.elapsedText;
    this.elements.matchmakingBot.hidden = matchmaking.botAvailable !== true;
    this.elements.matchmakingBot.disabled = (
      disabled
      || online
      || matchmaking.botAvailable !== true
      || matchmaking.status !== 'searching'
    );
    this.elements.matchmakingCancel.hidden = !matchmakingUi.cancellable;
    this.elements.matchmakingCancel.disabled = !matchmakingUi.cancellable;

    const pvp2 = nextState.pvp2 || {};
    const pvp2Presentation = pvp2StatsPresentation(pvp2.stats || {});
    const rank = pvp2Presentation.rank;
    this.elements.pvp2RecordTitle.textContent = pvp2Presentation.headline;
    this.elements.pvp2RankHero.style.setProperty('--rank-tone', rank.tone);
    this.elements.pvp2RankHero.dataset.rank = rank.id.toLowerCase();
    this.elements.pvp2RankEmblem.textContent = rank.emblem;
    this.elements.pvp2Tier.textContent = `${rank.label.toUpperCase()} DIVISION`;
    this.elements.pvp2RankProgress.textContent = rank.capped
      ? 'MAXIMUM COMPETITIVE RANK'
      : `${rank.ratingToNext} RATING TO ${rank.nextLabel.toUpperCase()}`;
    this.elements.pvp2RatingValue.textContent = String(pvp2Presentation.rating);
    this.elements.pvp2BestRating.textContent = `BEST ${pvp2Presentation.bestRating}`;
    this.elements.pvp2RankMeter.style.width = `${rank.progressPercent}%`;
    this.elements.pvp2Record.textContent = `${pvp2Presentation.record} · ${pvp2Presentation.winRateText}`;
    this.elements.pvp2Performance.textContent = `${pvp2Presentation.performance} · ${pvp2Presentation.kdText}`;
    this.elements.pvp2Streak.textContent = pvp2Presentation.streak;
    this.elements.pvp2Milestones.replaceChildren();
    pvp2Presentation.milestones.forEach((milestone) => {
      const badge = document.createElement('article');
      badge.className = `ka-vis1-pvp-badge ${milestone.unlocked ? 'unlocked' : 'locked'}`;
      const icon = document.createElement('span');
      icon.textContent = milestone.unlocked ? milestone.icon : '◇';
      icon.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('div');
      const label = document.createElement('b');
      label.textContent = milestone.label;
      const stateLabel = document.createElement('small');
      stateLabel.textContent = milestone.unlocked ? 'UNLOCKED' : 'LOCKED';
      copy.append(label, stateLabel);
      badge.append(icon, copy);
      this.elements.pvp2Milestones.appendChild(badge);
    });
    this.elements.pvp2Refresh.disabled = disabled || pvp2.status === 'loading';
    this.elements.pvp2Leaderboard.replaceChildren();
    const pvp2Entries = pvp2.leaderboard?.entries || [];
    if (pvp2Entries.length) {
      pvp2Entries.slice(0, 5).forEach((entry) => {
        const item = document.createElement('li');
        const rankNumber = document.createElement('b');
        rankNumber.textContent = `#${entry.rank}`;
        const identity = document.createElement('span');
        identity.textContent = entry.displayName;
        const score = document.createElement('small');
        score.textContent = `${entry.rating} RATING · ${entry.wins}W`;
        item.append(rankNumber, identity, score);
        this.elements.pvp2Leaderboard.appendChild(item);
      });
    } else {
      const item = document.createElement('li');
      item.textContent = pvp2.status === 'error'
        ? 'COMPETITIVE STATS TEMPORARILY UNAVAILABLE'
        : 'NO PUBLIC PVP RESULTS YET';
      this.elements.pvp2Leaderboard.appendChild(item);
    }

    const roomDirectory = nextState.roomDirectory || { status: 'idle', rooms: [] };
    const roomDirectoryUi = roomDirectoryStatusPresentation(roomDirectory);
    const directoryActive = ['loading', 'joining'].includes(roomDirectory.status);
    this.elements.browseRooms.disabled = disabled || online || matchmakingActive || directoryActive;
    this.elements.createPublic.disabled = disabled || online || matchmakingActive || directoryActive;
    this.elements.createPublicPvp.disabled = disabled || online || matchmakingActive || directoryActive || !pvp2WorkerEnabled || !pvp2CustomRoomsEnabled;
    this.elements.publicPvpTeamSize.disabled = disabled || online || matchmakingActive || directoryActive || !pvp2WorkerEnabled || !pvp2CustomRoomsEnabled;
    this.elements.roomBrowserRefresh.disabled = disabled || online || directoryActive;
    this.elements.roomFilterMode.disabled = disabled || online || directoryActive;
    this.elements.roomFilterStatus.disabled = disabled || online || directoryActive;
    this.elements.roomFilterScope.disabled = disabled || online || directoryActive;
    this.elements.roomFilterBot.disabled = disabled || online || directoryActive;
    this.elements.roomFilterInProgress.disabled = disabled || online || directoryActive;
    this.elements.roomBrowser.hidden = roomDirectory.status === 'idle' || online;
    this.elements.roomBrowser.dataset.tone = roomDirectoryUi.tone;
    this.elements.roomBrowserTitle.textContent = roomDirectoryUi.title;
    this.elements.roomBrowserDetail.textContent = roomDirectoryUi.detail;
    const visibleRoomCount = Array.isArray(roomDirectory.rooms) ? roomDirectory.rooms.length : 0;
    this.elements.roomBrowserCount.textContent = `${visibleRoomCount} ROOM${visibleRoomCount === 1 ? '' : 'S'}`;
    this.elements.roomBrowserHint.textContent = roomDirectory.status === 'loading'
      ? 'SCANNING LIVE LOBBIES'
      : roomDirectory.status === 'joining'
        ? 'RESERVING YOUR SLOT'
        : visibleRoomCount > 0
          ? 'LIVE COMPATIBLE LOBBIES'
          : 'CREATE A ROOM TO LEAD';
    this.elements.roomBrowserList.replaceChildren();
    if (['ready', 'join-rejected'].includes(roomDirectory.status) && roomDirectory.rooms?.length) {
      roomDirectory.rooms.forEach((entry) => {
        const card = document.createElement('article');
        card.className = 'ka-room-browser-card ka-mp2-room-card';
        card.dataset.status = entry.status;
        card.dataset.scope = entry.scope;
        card.dataset.mode = entry.gameMode || 'coop';
        card.dataset.quality = String(entry.quality || 'compatible').toLowerCase();

        const mapOption = Array.from(this.elements.matchmakingMap.options).find(
          (option) => option.value === entry.mapId
        );
        const arenaLabel = mapOption?.textContent?.trim?.()
          || String(entry.mapId || 'grid_bunker').replace(/_/g, ' ').toUpperCase();
        const pvpEntry = entry.gameMode === PVP2_MODE;
        const quality = roomQualityPresentation(entry);
        const difficultyOption = Array.from(this.elements.matchmakingDifficulty.options).find(
          (option) => Number(option.value) === Number(entry.difficulty)
        );
        const difficultyLabel = difficultyOption?.textContent?.trim?.()
          || `DIFFICULTY ${entry.difficulty}`;

        const visual = document.createElement('div');
        visual.className = `ka-mp2-room-card-visual ${mapVisualClass(entry.mapId)}`;
        const visualShade = document.createElement('div');
        visualShade.className = 'ka-mp2-room-card-shade';
        const visualTop = document.createElement('div');
        visualTop.className = 'ka-mp2-room-card-top';
        const modeBadge = document.createElement('span');
        modeBadge.className = 'ka-mp2-room-mode-badge';
        modeBadge.textContent = pvpEntry ? '⚔ UNRANKED PVP' : '●● CO-OP';
        const statusBadge = document.createElement('span');
        statusBadge.className = 'ka-mp2-room-status-badge';
        statusBadge.dataset.status = entry.status;
        statusBadge.textContent = entry.status === 'in-run' ? 'IN PROGRESS' : 'WAITING';
        visualTop.append(modeBadge, statusBadge);
        const visualBottom = document.createElement('div');
        visualBottom.className = 'ka-mp2-room-card-arena';
        const arenaKicker = document.createElement('span');
        arenaKicker.textContent = pvpEntry ? 'TEAM ELIMINATION' : difficultyLabel.toUpperCase();
        const arenaTitle = document.createElement('strong');
        arenaTitle.textContent = arenaLabel;
        visualBottom.append(arenaKicker, arenaTitle);
        visual.append(visualShade, visualTop, visualBottom);

        const body = document.createElement('div');
        body.className = 'ka-mp2-room-card-body';
        const headline = document.createElement('div');
        headline.className = 'ka-mp2-room-card-headline';
        const title = document.createElement('strong');
        title.textContent = pvpEntry
          ? `${entry.maxPlayers === 4 ? '2V2' : '1V1'} CUSTOM BATTLE`
          : 'PUBLIC SURVIVAL SQUAD';
        const qualityBadge = document.createElement('span');
        qualityBadge.className = 'ka-mp2-room-quality';
        qualityBadge.dataset.tone = quality.tone;
        qualityBadge.textContent = quality.label;
        headline.append(title, qualityBadge);

        const occupancy = document.createElement('div');
        occupancy.className = 'ka-mp2-room-occupancy';
        const slots = document.createElement('div');
        slots.className = 'ka-mp2-room-slots';
        const connected = Math.max(0, Number(entry.connectedHumans || 0));
        const reserved = Math.max(0, Number(entry.reservedHumans || 0));
        const capacity = Math.max(2, Math.min(4, Number(entry.maxPlayers || 2)));
        for (let index = 0; index < capacity; index += 1) {
          const slot = document.createElement('i');
          slot.dataset.slot = index < connected
            ? 'occupied'
            : index < connected + reserved
              ? 'reserved'
              : 'open';
          slot.title = slot.dataset.slot === 'occupied'
            ? 'Connected player'
            : slot.dataset.slot === 'reserved'
              ? 'Player joining'
              : 'Open player slot';
          slots.appendChild(slot);
        }
        const slotCopy = document.createElement('div');
        const slotTitle = document.createElement('strong');
        slotTitle.textContent = `${connected}/${capacity} PLAYERS`;
        const slotDetail = document.createElement('small');
        slotDetail.textContent = entry.openHumanSlots > 0
          ? `${entry.openHumanSlots} OPEN SLOT${entry.openHumanSlots === 1 ? '' : 'S'}`
          : 'ROOM FULL';
        slotCopy.append(slotTitle, slotDetail);
        occupancy.append(slots, slotCopy);

        const meta = document.createElement('div');
        meta.className = 'ka-mp2-room-meta';
        const metaEntries = [
          ['REGION', entry.scope === 'regional' ? `${entry.region || 'LOCAL'} · NEARBY` : `${entry.region || 'ZZ'} · GLOBAL`],
          ['ACTIVITY', formatRoomAge(entry)],
          ['RULES', pvpEntry ? 'EQUAL STARTS · NO LATE JOIN' : entry.hasBot ? 'AI WINGMAN ACTIVE' : 'HUMAN SLOT AVAILABLE']
        ];
        metaEntries.forEach(([label, value]) => {
          const item = document.createElement('span');
          const key = document.createElement('small');
          key.textContent = label;
          const val = document.createElement('b');
          val.textContent = value;
          item.append(key, val);
          meta.appendChild(item);
        });
        body.append(headline, occupancy, meta);

        const join = document.createElement('button');
        join.type = 'button';
        join.className = 'ka-room-browser-join ka-mp2-room-join';
        const joinMain = document.createElement('strong');
        joinMain.textContent = entry.status === 'in-run' ? 'JOIN ACTIVE RUN' : 'JOIN LOBBY';
        const joinSub = document.createElement('small');
        joinSub.textContent = pvpEntry ? 'UNRANKED CUSTOM MATCH' : 'DEPLOY WITH THIS SQUAD';
        join.append(joinMain, joinSub);
        join.disabled = disabled || directoryActive || entry.openHumanSlots < 1;
        join.addEventListener('click', () => {
          this.runActionOnce(`join-listing-${entry.listingId || entry.roomCode || 'room'}`, () => {
            this.saveIdentity();
            this.actions.joinOpenRoom?.({
              listingId: entry.listingId,
              joinToken: entry.joinToken,
              displayName: this.elements.name.value,
              serverUrl: MULTIPLAYER_PRODUCTION_WORKER_URL,
              partySize: roomDirectory.filters?.requiredSlots || 1,
              gameMode: entry.gameMode || 'coop'
            });
          }, { button: join, cooldownMs: 1600 });
        });

        card.setAttribute(
          'aria-label',
          `${pvpEntry ? 'Unranked PvP' : 'Co-Op'} room on ${arenaLabel}, ${connected} of ${capacity} players, ${entry.openHumanSlots} open slots`
        );
        card.append(visual, body, join);
        this.elements.roomBrowserList.appendChild(card);
      });
    } else if (roomDirectory.status !== 'loading' && roomDirectory.status !== 'joining') {
      const empty = document.createElement('div');
      empty.className = 'ka-room-browser-empty ka-mp2-browser-empty';
      const emptyIcon = document.createElement('span');
      emptyIcon.textContent = '◇';
      const emptyTitle = document.createElement('strong');
      emptyTitle.textContent = roomDirectoryUi.title;
      const emptyDetail = document.createElement('small');
      emptyDetail.textContent = roomDirectoryUi.detail;
      empty.append(emptyIcon, emptyTitle, emptyDetail);
      this.elements.roomBrowserList.appendChild(empty);
    }

    this.elements.create.disabled = disabled || matchmakingActive || directoryActive;
    this.elements.privateGameMode.disabled = disabled || matchmakingActive || directoryActive || !pvpWorkerEnabled;
    this.elements.join.disabled = disabled || matchmakingActive || directoryActive;
        const lastRoom = nextState.lastRoom;
        this.elements.rejoin.hidden = online || !lastRoom?.roomCode;
        this.elements.rejoin.disabled = disabled || online;
        this.elements.rejoin.textContent = lastRoom?.roomCode
            ? `REJOIN ${lastRoom.roomCode}`
            : 'REJOIN LAST ROOM';
        if (!online) return;

    this.elements.roomCode.textContent = room.roomCode || '------';
    const local = this.localPlayer();
    const isHost = local?.isHost === true;
    const connectedPlayers = room.players.filter(
      (player) => player.connected !== false
    );
    const allReady = connectedPlayers.length > 0
      && connectedPlayers.every((player) => player.ready === true);
    const connectedHumanCount = connectedPlayers.filter(
      (player) => player.isBot !== true
    ).length;
    const botPresent = connectedPlayers.some((player) => player.isBot === true);
    const maxPlayers = Math.max(2, Math.min(4, Number(room.settings?.maxPlayers) || 2));
    const readyCount = connectedPlayers.filter((player) => player.ready === true).length;
    const roomMapId = String(room.settings?.mapId || 'grid_bunker');
    const roomMapOption = Array.from(this.elements.map.options).find(
      (option) => option.value === roomMapId
    );
    const roomMapLabel = roomMapOption?.textContent?.trim?.()
      || roomMapId.replace(/_/g, ' ').toUpperCase();
    const mapClass = mapVisualClass(roomMapId);

    this.elements.roomVisual.className = `ka-mp-room-banner ka-mp2-lobby-hero ${mapClass}`;
    this.elements.roomVisual.dataset.mode = isPvp ? 'pvp' : 'coop';
    this.elements.roomModeBadge.textContent = isPvp ? '⚔ TEAM ELIMINATION' : '●● CO-OP OPERATIONS';
    this.elements.roomStatusBadge.textContent = room.status === 'in-run' ? 'IN PROGRESS' : 'WAITING ROOM';
    this.elements.roomStatusBadge.dataset.status = room.status || 'waiting';
    this.elements.roomVisibilityBadge.textContent = room.settings?.publicListing === true ? 'PUBLIC' : 'PRIVATE';
    this.elements.roomTitle.textContent = isPvp ? 'BATTLE LOBBY' : 'SURVIVAL SQUAD';
    this.elements.roomSubtitle.textContent = isPvp
      ? 'Build two balanced teams, ready every competitor, then begin the elimination series.'
      : 'Assemble your squad, choose an arena, and confirm every operative is ready.';
    this.elements.roomRuleBadge.textContent = isPvp
      ? `${maxPlayers === 4 ? '2V2' : '1V1'} · UNRANKED · EQUAL STARTS`
      : `${maxPlayers} PLAYER CAP · SHARED SURVIVAL`;
    this.elements.lobbyMapPreview.className = `ka-mp2-map-preview ${mapClass}`;
    this.elements.lobbyMapName.textContent = roomMapLabel;
    this.elements.lobbyMapRule.textContent = isPvp
      ? 'TEAM ELIMINATION · DIFFICULTY LOCKED'
      : isHost
        ? 'HOST CAN CHANGE BEFORE DEPLOYMENT'
        : 'ARENA SELECTED BY HOST';
    this.elements.readyMeter.style.width = `${Math.round((readyCount / Math.max(1, connectedPlayers.length)) * 100)}%`;
    this.elements.readySummary.textContent = room.status === 'in-run'
      ? 'OPERATION IN PROGRESS'
      : allReady
        ? 'SQUAD READY TO DEPLOY'
        : `${readyCount}/${connectedPlayers.length} OPERATIVES READY`;
    this.elements.readyDetail.textContent = room.status === 'in-run'
      ? 'The active match is protected from lobby changes.'
      : allReady
        ? (isHost ? 'Launch when your team is prepared.' : 'Waiting for the host to launch.')
        : connectedPlayers.length < 2
          ? 'Invite another player or use an available team option.'
          : 'Every connected player must confirm readiness.';

    this.elements.playerList.replaceChildren();
    this.elements.playerList.dataset.mode = isPvp ? 'pvp' : 'coop';
    this.elements.playerList.dataset.capacity = String(maxPlayers);
    room.players.forEach((player, index) => {
      const row = document.createElement('div');
      row.className = 'ka-coop-player ka-mp2-player-card';
      row.id = `ka-coop-player-${escapeForId(player.playerId)}`;
      row.dataset.bot = player.isBot === true ? 'true' : 'false';
      row.dataset.local = player.playerId === local?.playerId ? 'true' : 'false';
      row.dataset.host = player.isHost === true ? 'true' : 'false';
      row.dataset.team = isPvp ? String(player.team || '') : '';

      const identity = document.createElement('div');
      identity.className = 'ka-coop-player-identity ka-mp2-player-identity';

      const avatar = document.createElement('span');
      avatar.className = 'ka-mp2-player-avatar';
      avatar.textContent = player.isBot ? 'AI' : displayInitials(player.displayName);

      const copy = document.createElement('div');
      copy.className = 'ka-mp2-player-copy';
      const nameLine = document.createElement('div');
      nameLine.className = 'ka-mp2-player-name-line';
      const name = document.createElement('strong');
      name.textContent = player.displayName || 'Player';
      nameLine.appendChild(name);
      if (player.playerId === local?.playerId) {
        const you = document.createElement('span');
        you.textContent = 'YOU';
        you.dataset.badge = 'you';
        nameLine.appendChild(you);
      }
      if (player.isHost) {
        const host = document.createElement('span');
        host.textContent = 'HOST';
        host.dataset.badge = 'host';
        nameLine.appendChild(host);
      }
      const role = document.createElement('span');
      role.className = 'ka-coop-player-role';
      role.textContent = isPvp
        ? `${player.team || 'UNASSIGNED'} TEAM · SLOT ${index + 1}`
        : player.isBot
          ? 'AI WINGMAN · COMPANION SLOT'
          : player.isHost
            ? 'SQUAD LEADER · OPERATIVE'
            : 'OPERATIVE · HUMAN PLAYER';
      copy.append(nameLine, role);
      identity.append(avatar, copy);

      const state = document.createElement('span');
      state.className = 'ka-coop-player-state ka-mp2-player-state';
      state.dataset.ready = player.ready ? 'true' : 'false';
      state.dataset.connected = player.connected === false ? 'false' : 'true';
      const stateDot = document.createElement('i');
      const stateCopy = document.createElement('b');
      stateCopy.textContent = player.connected === false
        ? 'RECONNECTING'
        : player.ready
          ? 'READY'
          : 'NOT READY';
      state.append(stateDot, stateCopy);

      row.append(identity, state);

      if (
        isHost
        && player.playerId !== local?.playerId
        && player.isBot !== true
      ) {
        const controls = document.createElement('div');
        controls.className = 'ka-coop-player-controls ka-mp2-player-controls';

        const transfer = document.createElement('button');
        transfer.type = 'button';
        transfer.className = 'ka-coop-player-transfer';
        transfer.textContent = 'MAKE HOST';
        transfer.disabled = player.connected === false;
        transfer.addEventListener('click', () => {
          this.actions.transferHost?.(player.playerId);
        });

        const kick = document.createElement('button');
        kick.type = 'button';
        kick.className = 'ka-coop-player-kick';
        kick.textContent = 'REMOVE';
        kick.addEventListener('click', () => {
          this.actions.kickPlayer?.(player.playerId);
        });

        controls.append(transfer, kick);
        row.appendChild(controls);
      }

      this.elements.playerList.appendChild(row);
    });

    for (let index = room.players.length; index < maxPlayers; index += 1) {
      const openSlot = document.createElement('div');
      openSlot.className = 'ka-coop-player ka-mp2-player-card ka-mp2-player-open';
      openSlot.dataset.open = 'true';
      const openIcon = document.createElement('span');
      openIcon.className = 'ka-mp2-player-avatar';
      openIcon.textContent = '+';
      const openCopy = document.createElement('div');
      openCopy.className = 'ka-mp2-player-copy';
      const openTitle = document.createElement('strong');
      openTitle.textContent = isPvp ? 'OPEN COMPETITOR SLOT' : 'OPEN OPERATIVE SLOT';
      const openDetail = document.createElement('span');
      openDetail.className = 'ka-coop-player-role';
      openDetail.textContent = room.settings?.publicListing === true
        ? 'VISIBLE IN PUBLIC ROOM BROWSER'
        : 'SHARE THE ROOM CODE TO INVITE';
      openCopy.append(openTitle, openDetail);
      openSlot.append(openIcon, openCopy);
      this.elements.playerList.appendChild(openSlot);
    }

    this.elements.map.value = String(room.settings?.mapId || 'grid_bunker');
    setNumericSelectValue(
      this.elements.difficulty,
      room.settings?.difficulty,
      1
    );
    this.elements.map.disabled = !isHost || room.status === 'in-run';
    this.elements.difficulty.disabled = isPvp || !isHost || room.status === 'in-run';
    if (this.elements.hostControls) {
      this.elements.hostControls.hidden = !isHost;
    }
    if (this.elements.maxPlayers) {
      this.elements.maxPlayers.value = String(
        Math.max(2, Math.min(4, Number(room.settings?.maxPlayers) || 4))
      );
      Array.from(this.elements.maxPlayers.options).forEach((option) => {
        option.disabled = isPvp && option.value === '3';
      });
      this.elements.maxPlayers.disabled =
        !isHost || room.status === 'in-run';
    }
    if (this.elements.roomLocked) {
      this.elements.roomLocked.checked = room.settings?.locked === true;
      this.elements.roomLocked.disabled = !isHost;
    }
    if (this.elements.allowLateJoin) {
      this.elements.allowLateJoin.checked = isPvp
        ? false
        : room.settings?.allowLateJoin !== false;
      this.elements.allowLateJoin.disabled = isPvp || !isHost;
    }
    if (this.elements.publicListing) {
      this.elements.publicListing.checked = room.settings?.publicListing === true;
      this.elements.publicListing.disabled = !isHost || room.status === 'in-run';
      this.elements.publicListing.parentElement?.classList.toggle('ka-pvp-public-listing', isPvp);
    }

    if (this.elements.maxPlayers && botPresent) {
      this.elements.maxPlayers.value = '2';
      this.elements.maxPlayers.disabled = true;
    }
    const teamOptionsAvailable = !isPvp && isHost && room.status !== 'in-run';
    const canFindPublicAlly = teamOptionsAvailable && connectedHumanCount < 2;
    const canCallWingman = (
      teamOptionsAvailable && !botPresent && connectedHumanCount <= 2
    );
    const canDismissWingman = teamOptionsAvailable && botPresent;
    if (this.elements.teamOptions) {
      this.elements.teamOptions.hidden = !(
        canFindPublicAlly || canCallWingman || canDismissWingman
      );
    }
    // BOT.1 R2.8.1: the production-release UI intentionally reports online
    // rooms as action-blocked for connect controls. Lobby recovery actions are
    // already inside an authenticated room, so they must use room authority
    // rather than that global connect-view gate. This re-enables immediate
    // public backfill or AI deployment after the host removes an ally.
    if (this.elements.findPublicAlly) {
      this.elements.findPublicAlly.hidden = !canFindPublicAlly;
      this.elements.findPublicAlly.disabled = !canFindPublicAlly;
    }
    if (this.elements.callWingman) {
      this.elements.callWingman.hidden = !canCallWingman;
      this.elements.callWingman.disabled = !canCallWingman;
    }
    if (this.elements.dismissWingman) {
      this.elements.dismissWingman.hidden = !canDismissWingman;
      this.elements.dismissWingman.disabled = !canDismissWingman;
    }



    const localReady = local?.ready === true;
    this.elements.ready.textContent = localReady ? 'NOT READY' : 'READY';
    this.elements.ready.setAttribute(
      'aria-label',
      localReady ? 'Set status to not ready' : 'Set status to ready'
    );
    this.elements.ready.title = localReady
      ? 'Click to become not ready'
      : 'Click when you are ready';
    this.elements.ready.dataset.ready = localReady ? 'true' : 'false';
    this.elements.ready.disabled = room.status === 'in-run';

    const pvpHasOpponents = !isPvp || connectedHumanCount >= 2;
    const canStart = allReady && pvpHasOpponents;
    this.elements.start.hidden = !isHost;
    this.elements.start.disabled = !canStart || room.status === 'in-run';
    this.elements.start.textContent = canStart
      ? (isPvp ? 'START TEAM ELIMINATION' : 'START CO-OP RUN')
      : (isPvp && connectedHumanCount < 2
          ? 'WAITING FOR OPPONENT'
          : 'WAITING FOR READY');
  }
}
