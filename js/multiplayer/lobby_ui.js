import { deriveMultiplayerProductionReleaseUiState } from './production_release_ui_core.js';
import { matchmakingStatusPresentation } from './matchmaking_core.js';
import { roomDirectoryStatusPresentation } from './room_directory_core.js';
import { PVP2_MODE, pvp2StatsPresentation } from './pvp2_core.js';

// js/multiplayer/lobby_ui.js

const NAME_STORAGE_KEY = 'ka_multiplayer_display_name';
const SERVER_STORAGE_KEY = 'ka_multiplayer_server_url';
const MATCH3_PRIORITY_STORAGE_KEY = 'ka_match3_search_priority';
const MATCH3_REGION_POLICY_STORAGE_KEY = 'ka_match3_region_policy';
const MATCH3_ROOM_STATUS_STORAGE_KEY = 'ka_match3_room_status';
const MATCH3_ROOM_SCOPE_STORAGE_KEY = 'ka_match3_room_scope';
const MATCH3_ROOM_BOT_STORAGE_KEY = 'ka_match3_room_bot';
const COOP2_ROLE_STORAGE_KEY = 'ka_coop2_role_v1';
const PVP1_PRIVATE_MODE_STORAGE_KEY = 'ka_pvp1_private_room_mode';

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

export class MultiplayerLobbyUI {
  constructor({ actions = {} } = {}) {
    this.actions = actions;
    this.state = null;
    this.elements = {};
    this.opened = false;
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

    const modal = document.createElement('div');
    modal.id = 'ka-coop-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <section class="ka-coop-card" role="dialog" aria-modal="true" aria-labelledby="ka-coop-title">
        <header class="ka-coop-header">
          <div>
            <span class="ka-coop-kicker">KHADIJA PROTOCOL</span>
            <h2 id="ka-coop-title">ONLINE MULTIPLAYER</h2>
          </div>
          <button id="ka-coop-close" class="ka-coop-icon-btn" type="button" aria-label="Close">×</button>
        </header>

        <div id="ka-coop-status" class="ka-coop-status" data-tone="neutral">LOCAL MODE</div>

        <div id="ka-coop-connect-view">
          <p class="ka-coop-note">
            Create isolated private Co-Op or Team Elimination rooms, find public
            Co-Op allies, or enter rated public PvP 1v1 matchmaking. Existing Co-Op
            progression, enemies, operations, reconnect recovery, and rewards remain unchanged.
          </p>

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

          <label class="ka-coop-field">
            <span>Worker server URL</span>
            <input id="ka-coop-server" placeholder="https://your-worker.workers.dev">
          </label>

          <button id="ka-coop-release-retry" type="button">RECHECK CERTIFIED SERVER</button>

          <section class="ka-matchmaking-panel" aria-labelledby="ka-matchmaking-title">
            <div class="ka-matchmaking-heading">
              <div>
                <span class="ka-coop-kicker">PUBLIC MATCHMAKING</span>
                <strong id="ka-matchmaking-title">QUICK MATCH</strong>
              </div>
              <span class="ka-matchmaking-region">REGION-AWARE</span>
            </div>
            <p class="ka-matchmaking-copy">
              Find a compatible Co-Op operative or a rated public PvP 1v1 opponent
              using the current arena, protocol, game build, and region policy.
            </p>
            <div class="ka-matchmaking-preferences">
              <label class="ka-coop-field">
                <span>Arena</span>
                <select id="ka-matchmaking-map"></select>
              </label>
              <label class="ka-coop-field">
                <span>Difficulty</span>
                <select id="ka-matchmaking-difficulty"></select>
              </label>
              <label class="ka-coop-field">
                <span>Search priority</span>
                <select id="ka-match3-search-priority">
                  <option value="balanced">Balanced</option>
                  <option value="quality">Best connection</option>
                  <option value="fast">Fastest match</option>
                </select>
              </label>
              <label class="ka-coop-field">
                <span>Region policy</span>
                <select id="ka-match3-region-policy">
                  <option value="auto">Region first, then global</option>
                  <option value="regional-only">Regional only</option>
                  <option value="global">Global immediately</option>
                </select>
              </label>
            </div>
            <div class="ka-pvp2-queue-actions">
              <button id="ka-coop-quick-match" class="ka-coop-primary" type="button">
                FIND PUBLIC CO-OP
              </button>
              <button id="ka-pvp2-quick-match" class="ka-pvp2-primary" type="button">
                FIND PUBLIC PVP 1V1
              </button>
            </div>
            <div class="ka-public-room-actions">
              <button id="ka-coop-browse-rooms" type="button">BROWSE PUBLIC CO-OP ROOMS</button>
              <button id="ka-coop-create-public" type="button">CREATE PUBLIC CO-OP ROOM</button>
            </div>
            <section id="ka-room-browser" class="ka-room-browser" hidden aria-live="polite">
              <div class="ka-room-browser-heading">
                <div>
                  <strong id="ka-room-browser-title">PUBLIC CO-OP ROOMS</strong>
                  <span id="ka-room-browser-detail">HOSTED CO-OP ROOMS · PVP USES QUICK MATCH</span>
                </div>
                <button id="ka-room-browser-refresh" type="button">REFRESH</button>
              </div>
              <div class="ka-room-browser-filters">
                <label>
                  <span>Status</span>
                  <select id="ka-room-filter-status">
                    <option value="any">Any status</option>
                    <option value="waiting">Waiting only</option>
                    <option value="in-run">In progress</option>
                  </select>
                </label>
                <label>
                  <span>Region</span>
                  <select id="ka-room-filter-scope">
                    <option value="any">Any region</option>
                    <option value="regional">My region</option>
                    <option value="global">Global</option>
                  </select>
                </label>
                <label>
                  <span>AI</span>
                  <select id="ka-room-filter-bot">
                    <option value="any">Any team</option>
                    <option value="without-bot">Human slot only</option>
                    <option value="with-bot">AI present</option>
                  </select>
                </label>
                <label class="ka-room-filter-toggle">
                  <input id="ka-room-filter-in-progress" type="checkbox" checked>
                  <span>Allow join-in-progress</span>
                </label>
              </div>
              <div id="ka-room-browser-list" class="ka-room-browser-list"></div>
            </section>
            <div id="ka-matchmaking-status" class="ka-matchmaking-status" data-tone="neutral" hidden>
              <div>
                <strong id="ka-matchmaking-status-title">PUBLIC QUICK MATCH</strong>
                <span id="ka-matchmaking-status-detail">MATCH BY BUILD, PROTOCOL, ARENA AND REGION</span>
              </div>
              <span id="ka-matchmaking-elapsed"></span>
              <button id="ka-matchmaking-bot" class="ka-matchmaking-bot" type="button" hidden>
                DEPLOY AI WINGMATE
              </button>
              <button id="ka-matchmaking-cancel" type="button">CANCEL</button>
            </div>
            <section class="ka-pvp2-record" aria-labelledby="ka-pvp2-record-title">
              <div class="ka-pvp2-record-heading">
                <div>
                  <span class="ka-coop-kicker">COMPETITIVE RECORD</span>
                  <strong id="ka-pvp2-record-title">PVP RATING 1000</strong>
                </div>
                <button id="ka-pvp2-refresh" type="button">REFRESH</button>
              </div>
              <div class="ka-pvp2-record-grid">
                <span id="ka-pvp2-record">0W · 0L</span>
                <span id="ka-pvp2-performance">0 ELIMS · 0 DEATHS</span>
                <span id="ka-pvp2-streak">NO ACTIVE STREAK</span>
              </div>
              <ol id="ka-pvp2-leaderboard" class="ka-pvp2-leaderboard">
                <li>NO PUBLIC PVP RESULTS YET</li>
              </ol>
            </section>
          </section>

          <div class="ka-coop-private-divider"><span>PRIVATE ROOMS</span></div>

          <label class="ka-coop-field ka-pvp1-private-mode">
            <span>Private room mode</span>
            <select id="ka-private-game-mode">
              <option value="coop">Co-Op Operations</option>
              <option value="pvp-team-elimination">PvP · Team Elimination (1v1 / 2v2)</option>
            </select>
          </label>
          <p id="ka-pvp1-private-note" class="ka-pvp1-private-note">
            PvP uses isolated rooms, separate damage rules, no AI enemies, no Wingman,
            and no Co-Op reward receipts.
          </p>

          <div class="ka-coop-connect-grid">
            <button id="ka-coop-create" class="ka-coop-primary" type="button">CREATE PRIVATE ROOM</button>
            <div class="ka-coop-join-row">
              <input id="ka-coop-code-input" maxlength="6" placeholder="ROOM CODE" autocomplete="off">
              <button id="ka-coop-join" type="button">JOIN</button>
            </div>
          </div>
        </div>

        <div id="ka-coop-room-view" hidden>
          <div class="ka-coop-room-top">
            <div>
              <span class="ka-coop-label">ROOM CODE</span>
              <strong id="ka-coop-code">------</strong>
            </div>
            <button id="ka-coop-copy" type="button">COPY CODE</button>
          </div>

          <div id="ka-coop-player-list" class="ka-coop-player-list"></div>

          <div class="ka-coop-settings-grid">
            <label class="ka-coop-field">
              <span>Arena</span>
              <select id="ka-coop-map"></select>
            </label>
            <label class="ka-coop-field">
              <span>Difficulty</span>
              <select id="ka-coop-difficulty"></select>
            </label>
          </div>

          <div class="ka-coop-actions">
            <button id="ka-coop-ready" type="button" aria-label="Set status to ready">READY</button>
            <button id="ka-coop-start" class="ka-coop-primary" type="button">START CO-OP RUN</button>
            <button id="ka-coop-leave" class="ka-coop-danger" type="button">LEAVE ROOM</button>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(modal);

    this.elements = {
      modal,
      openButton,
      close: modal.querySelector('#ka-coop-close'),
      status: modal.querySelector('#ka-coop-status'),
      connectView: modal.querySelector('#ka-coop-connect-view'),
      roomView: modal.querySelector('#ka-coop-room-view'),
      name: modal.querySelector('#ka-coop-name'),
      coop2Role: modal.querySelector('#ka-coop2-role'),
      server: modal.querySelector('#ka-coop-server'),
      releaseRetry: modal.querySelector('#ka-coop-release-retry'),
      quickMatch: modal.querySelector('#ka-coop-quick-match'),
      pvp2QuickMatch: modal.querySelector('#ka-pvp2-quick-match'),
      browseRooms: modal.querySelector('#ka-coop-browse-rooms'),
      createPublic: modal.querySelector('#ka-coop-create-public'),
      roomBrowser: modal.querySelector('#ka-room-browser'),
      roomBrowserTitle: modal.querySelector('#ka-room-browser-title'),
      roomBrowserDetail: modal.querySelector('#ka-room-browser-detail'),
      roomBrowserRefresh: modal.querySelector('#ka-room-browser-refresh'),
      roomBrowserList: modal.querySelector('#ka-room-browser-list'),
      matchmakingMap: modal.querySelector('#ka-matchmaking-map'),
      matchmakingDifficulty: modal.querySelector('#ka-matchmaking-difficulty'),
      match3SearchPriority: modal.querySelector('#ka-match3-search-priority'),
      match3RegionPolicy: modal.querySelector('#ka-match3-region-policy'),
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
      pvp2Record: modal.querySelector('#ka-pvp2-record'),
      pvp2Performance: modal.querySelector('#ka-pvp2-performance'),
      pvp2Streak: modal.querySelector('#ka-pvp2-streak'),
      pvp2Leaderboard: modal.querySelector('#ka-pvp2-leaderboard'),
      create: modal.querySelector('#ka-coop-create'),
      privateGameMode: modal.querySelector('#ka-private-game-mode'),
      privateModeNote: modal.querySelector('#ka-pvp1-private-note'),
      codeInput: modal.querySelector('#ka-coop-code-input'),
      join: modal.querySelector('#ka-coop-join'),
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
    this.elements.server.value = readStored(
      SERVER_STORAGE_KEY,
      'https://khadijas-arena-multiplayer.abraratech-8cc.workers.dev/'
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
      this.saveIdentity();
      this.actions.findReplacementPublicAlly?.({
        displayName: this.elements.name.value,
        serverUrl: this.elements.server.value,
        mapId: this.elements.map.value || 'grid_bunker',
        difficulty: Number(this.elements.difficulty.value) || 1
      });
    });
    this.elements.callWingman?.addEventListener('click', () => {
      this.actions.deployRoomBotFill?.({
        mapId: this.elements.map.value || 'grid_bunker',
        difficulty: Number(this.elements.difficulty.value) || 1
      });
    });
    this.elements.dismissWingman?.addEventListener('click', () => {
      this.actions.dismissRoomBotFill?.();
    });
  }

bindEvents() {
    this.elements.close.addEventListener('click', () => this.close());
    this.elements.modal.addEventListener('click', (event) => {
      if (event.target === this.elements.modal) this.close();
    });

    this.elements.releaseRetry.addEventListener('click', () => {
      this.saveIdentity();
      this.actions.retryRelease?.({ serverUrl: this.elements.server.value });
    });

    this.elements.coop2Role.addEventListener('change', () => {
      const roleId = this.elements.coop2Role.value || 'VANGUARD';
      writeStored(COOP2_ROLE_STORAGE_KEY, roleId);
      window.dispatchEvent(new CustomEvent('ka:coop2-role-selected', {
        detail: { roleId }
      }));
    });

    this.elements.quickMatch.addEventListener('click', () => {
      this.saveIdentity();
      this.actions.quickMatch?.({
        displayName: this.elements.name.value,
        serverUrl: this.elements.server.value,
        mapId: this.elements.matchmakingMap.value || 'grid_bunker',
        difficulty: Number(this.elements.matchmakingDifficulty.value) || 1,
        searchPriority: this.elements.match3SearchPriority.value || 'balanced',
        regionPolicy: this.elements.match3RegionPolicy.value || 'auto',
        allowBackfill: true,
        joinInProgress: this.elements.roomFilterInProgress.checked !== false
      });
    });

    this.elements.pvp2QuickMatch.addEventListener('click', () => {
      this.saveIdentity();
      this.actions.quickMatch?.({
        displayName: this.elements.name.value,
        serverUrl: this.elements.server.value,
        mapId: this.elements.matchmakingMap.value || 'grid_bunker',
        difficulty: 1,
        searchPriority: this.elements.match3SearchPriority.value || 'balanced',
        regionPolicy: this.elements.match3RegionPolicy.value || 'auto',
        allowBackfill: false,
        joinInProgress: false,
        mode: PVP2_MODE
      });
    });

    this.elements.pvp2Refresh.addEventListener('click', () => {
      this.saveIdentity();
      this.actions.refreshPvp2?.({
        serverUrl: this.elements.server.value,
        scope: 'global'
      });
    });

    const browseRooms = () => {
      this.saveIdentity();
      this.actions.browseOpenRooms?.({
        serverUrl: this.elements.server.value,
        searchPriority: this.elements.match3SearchPriority.value || 'balanced',
        filters: {
          mapId: this.elements.matchmakingMap.value || '',
          difficulty: Number(this.elements.matchmakingDifficulty.value) || null,
          status: this.elements.roomFilterStatus.value || 'any',
          regionScope: this.elements.roomFilterScope.value || 'any',
          bot: this.elements.roomFilterBot.value || 'any',
          joinInProgress: this.elements.roomFilterInProgress.checked !== false
        }
      });
    };
    this.elements.browseRooms.addEventListener('click', browseRooms);
    this.elements.roomBrowserRefresh.addEventListener('click', browseRooms);
    this.elements.createPublic.addEventListener('click', () => {
      this.saveIdentity();
      this.actions.createPublicRoom?.({
        displayName: this.elements.name.value,
        serverUrl: this.elements.server.value
      });
    });

    this.elements.matchmakingBot.addEventListener('click', () => {
      this.saveIdentity();
      this.actions.deployBotFill?.({
        displayName: this.elements.name.value,
        serverUrl: this.elements.server.value,
        mapId: this.elements.matchmakingMap.value || 'grid_bunker',
        difficulty: Number(this.elements.matchmakingDifficulty.value) || 1
      });
    });

    this.elements.matchmakingCancel.addEventListener('click', () => {
      this.actions.cancelQuickMatch?.();
    });

    this.elements.match3SearchPriority.addEventListener('change', () => {
      writeStored(MATCH3_PRIORITY_STORAGE_KEY, this.elements.match3SearchPriority.value);
    });
    this.elements.match3RegionPolicy.addEventListener('change', () => {
      writeStored(MATCH3_REGION_POLICY_STORAGE_KEY, this.elements.match3RegionPolicy.value);
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
      this.saveIdentity();
      writeStored(
        PVP1_PRIVATE_MODE_STORAGE_KEY,
        this.elements.privateGameMode.value
      );
      this.actions.createRoom?.({
        displayName: this.elements.name.value,
        serverUrl: this.elements.server.value,
        gameMode: this.elements.privateGameMode.value
      });
    });

    this.elements.rejoin.addEventListener('click', () => {
            this.saveIdentity();
            this.actions.rejoinLastRoom?.({
                displayName: this.elements.name.value
            });
        });
        this.elements.join.addEventListener('click', () => {
      this.saveIdentity();
      this.actions.joinRoom?.({
        roomCode: this.elements.codeInput.value,
        displayName: this.elements.name.value,
        serverUrl: this.elements.server.value
      });
    });

    this.elements.codeInput.addEventListener('input', () => {
      this.elements.codeInput.value = this.elements.codeInput.value
        .toUpperCase()
        .replace(/[^A-Z2-9]/g, '')
        .slice(0, 6);
    });

    [
      this.elements.name,
      this.elements.server,
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
      try {
        await navigator.clipboard.writeText(code);
        this.elements.copy.textContent = 'COPIED';
        setTimeout(() => {
          this.elements.copy.textContent = 'COPY CODE';
        }, 1000);
      } catch {
        window.prompt('Copy room code:', code);
      }
    });

    this.elements.ready.addEventListener('click', () => {
      const local = this.localPlayer();
      this.actions.setReady?.(!(local?.ready === true));
    });

    this.elements.start.addEventListener('click', () => {
      this.actions.updateSettings?.({
        mapId: this.elements.map.value || 'grid_bunker',
        difficulty: Number(this.elements.difficulty.value) || 1
      });
      this.actions.startRun?.();
    });

    this.elements.leave.addEventListener('click', () => {
      this.actions.leaveRoom?.();
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

  saveIdentity() {
    const name = this.elements.name.value.trim().slice(0, 24) || 'Player';
    const serverUrl = this.elements.server.value.trim();
    this.elements.name.value = name;
    writeStored(NAME_STORAGE_KEY, name);
    writeStored(SERVER_STORAGE_KEY, serverUrl);
  }

  getConnectionIdentity() {
    return {
      displayName: this.elements.name?.value?.trim?.().slice(0, 24) || 'Player',
      serverUrl: this.elements.server?.value?.trim?.() || ''
    };
  }

  open() {
    this.opened = true;
    this.elements.modal.classList.add('open');
    this.elements.modal.setAttribute('aria-hidden', 'false');
    this.render(this.state);
  }

  close() {
    this.opened = false;
    this.elements.modal.classList.remove('open');
    this.elements.modal.setAttribute('aria-hidden', 'true');
  }

  localPlayer() {
    return this.state?.room?.players?.find(
      (player) => player.playerId === this.state.localPlayerId
    ) || null;
  }

  render(nextState) {
    if (!nextState || !this.elements.modal) return;
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
    this.elements.connectView.hidden = online;
    this.elements.roomView.hidden = !online;

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
    const disabled = nextState.connecting || releaseUi.blockActions;
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
    this.elements.pvp2RecordTitle.textContent = pvp2Presentation.headline;
    this.elements.pvp2Record.textContent = `${pvp2Presentation.record} · ${pvp2Presentation.winRateText}`;
    this.elements.pvp2Performance.textContent = `${pvp2Presentation.performance} · ${pvp2Presentation.kdText}`;
    this.elements.pvp2Streak.textContent = pvp2Presentation.streak;
    this.elements.pvp2Refresh.disabled = disabled || pvp2.status === 'loading';
    this.elements.pvp2Leaderboard.replaceChildren();
    const pvp2Entries = pvp2.leaderboard?.entries || [];
    if (pvp2Entries.length) {
      pvp2Entries.slice(0, 5).forEach((entry) => {
        const item = document.createElement('li');
        item.textContent = `#${entry.rank} ${entry.displayName} · ${entry.rating} · ${entry.wins}W`;
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
    this.elements.roomBrowserRefresh.disabled = disabled || online || directoryActive;
    this.elements.roomFilterStatus.disabled = disabled || online || directoryActive;
    this.elements.roomFilterScope.disabled = disabled || online || directoryActive;
    this.elements.roomFilterBot.disabled = disabled || online || directoryActive;
    this.elements.roomFilterInProgress.disabled = disabled || online || directoryActive;
    this.elements.roomBrowser.hidden = roomDirectory.status === 'idle' || online;
    this.elements.roomBrowser.dataset.tone = roomDirectoryUi.tone;
    this.elements.roomBrowserTitle.textContent = roomDirectoryUi.title;
    this.elements.roomBrowserDetail.textContent = roomDirectoryUi.detail;
    this.elements.roomBrowserList.replaceChildren();
    if (['ready', 'join-rejected'].includes(roomDirectory.status) && roomDirectory.rooms?.length) {
      roomDirectory.rooms.forEach((entry) => {
        const card = document.createElement('article');
        card.className = 'ka-room-browser-card';
        card.dataset.status = entry.status;
        card.dataset.scope = entry.scope;

        const identity = document.createElement('div');
        identity.className = 'ka-room-browser-card-main';
        const title = document.createElement('strong');
        const mapOption = Array.from(this.elements.matchmakingMap.options).find(
          (option) => option.value === entry.mapId
        );
        title.textContent = mapOption?.textContent?.trim?.() || entry.mapId.replace(/_/g, ' ').toUpperCase();
        const meta = document.createElement('span');
        const difficultyOption = Array.from(this.elements.matchmakingDifficulty.options).find(
          (option) => Number(option.value) === Number(entry.difficulty)
        );
        const difficultyLabel = difficultyOption?.textContent?.trim?.() || `DIFFICULTY ${entry.difficulty}`;
        meta.textContent = [
          difficultyLabel,
          entry.status === 'in-run' ? 'IN PROGRESS' : 'WAITING',
          `${entry.connectedHumans}/${entry.maxPlayers} HUMANS`,
          entry.reservedHumans > 0 ? `${entry.reservedHumans} JOINING` : null,
          entry.hasBot ? 'AI WINGMAN' : null,
          entry.scope === 'regional' ? 'YOUR REGION' : 'GLOBAL'
        ].filter(Boolean).join(' · ');
        identity.append(title, meta);

        const join = document.createElement('button');
        join.type = 'button';
        join.className = 'ka-room-browser-join';
        join.textContent = entry.status === 'in-run' ? 'JOIN RUN' : 'JOIN ROOM';
        join.disabled = disabled || directoryActive || entry.openHumanSlots < 1;
        join.addEventListener('click', () => {
          this.saveIdentity();
          this.actions.joinOpenRoom?.({
            listingId: entry.listingId,
            joinToken: entry.joinToken,
            displayName: this.elements.name.value,
            serverUrl: this.elements.server.value,
            partySize: roomDirectory.filters?.requiredSlots || 1
          });
        });
        card.append(identity, join);
        this.elements.roomBrowserList.appendChild(card);
      });
    } else if (roomDirectory.status !== 'loading' && roomDirectory.status !== 'joining') {
      const empty = document.createElement('div');
      empty.className = 'ka-room-browser-empty';
      empty.textContent = roomDirectoryUi.detail;
      this.elements.roomBrowserList.appendChild(empty);
    }

    this.elements.create.disabled = disabled || matchmakingActive || directoryActive;
    this.elements.privateGameMode.disabled = disabled || matchmakingActive || directoryActive || !pvpWorkerEnabled;
    this.elements.join.disabled = disabled || matchmakingActive || directoryActive;
    this.elements.releaseRetry.hidden = !releaseUi.retryVisible || online;
    this.elements.releaseRetry.disabled = releaseUi.retryDisabled || nextState.connecting || online;
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

    this.elements.playerList.replaceChildren();
    room.players.forEach((player, index) => {
      const row = document.createElement('div');
      row.className = 'ka-coop-player';
      row.id = `ka-coop-player-${escapeForId(player.playerId)}`;
      row.dataset.bot = player.isBot === true ? 'true' : 'false';

      const identity = document.createElement('div');
      identity.className = 'ka-coop-player-identity';

      const slot = document.createElement('span');
      slot.className = 'ka-coop-player-slot';
      slot.textContent = String(index + 1);

      const name = document.createElement('strong');
      name.textContent = player.displayName || 'Player';

      const role = document.createElement('span');
      role.className = 'ka-coop-player-role';
      role.textContent = isPvp
        ? `${player.team || 'UNASSIGNED'}${player.isHost ? ' · HOST' : ''}`
        : player.isBot
          ? 'AI WINGMATE'
          : player.isHost
            ? 'HOST'
            : 'OPERATIVE';
      row.dataset.team = isPvp ? String(player.team || '') : '';

      identity.append(slot, name, role);

      const state = document.createElement('span');
      state.className = 'ka-coop-player-state';
      state.dataset.ready = player.ready ? 'true' : 'false';
      state.dataset.connected = player.connected === false ? 'false' : 'true';
      state.textContent = player.connected === false
        ? 'RECONNECTING'
        : player.ready
          ? 'READY'
          : 'NOT READY';

      row.append(identity, state);

      if (
        isHost
        && player.playerId !== local?.playerId
        && player.isBot !== true
      ) {
        const controls = document.createElement('div');
        controls.className = 'ka-coop-player-controls';

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
      this.elements.publicListing.checked = isPvp
        ? false
        : room.settings?.publicListing === true;
      this.elements.publicListing.disabled = isPvp || !isHost;
    }

    const botPresent = connectedPlayers.some((player) => player.isBot === true);
    const connectedHumanCount = connectedPlayers.filter(
      (player) => player.isBot !== true
    ).length;
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
