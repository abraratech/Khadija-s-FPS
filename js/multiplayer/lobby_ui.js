// js/multiplayer/lobby_ui.js

const NAME_STORAGE_KEY = 'ka_multiplayer_display_name';
const SERVER_STORAGE_KEY = 'ka_multiplayer_server_url';

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
    openButton.textContent = 'CO-OP ALPHA';
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
            <h2 id="ka-coop-title">CO-OP MULTIPLAYER ALPHA</h2>
          </div>
          <button id="ka-coop-close" class="ka-coop-icon-btn" type="button" aria-label="Close">×</button>
        </header>

        <div id="ka-coop-status" class="ka-coop-status" data-tone="neutral">LOCAL MODE</div>

        <div id="ka-coop-connect-view">
          <p class="ka-coop-note">
            This alpha synchronizes rooms, match launch, players, shared enemies,
            enemy damage, waves, and coordinated run endings. Shops and economy remain
            local while the remaining co-op authority systems are completed.
          </p>

          <label class="ka-coop-field">
            <span>Player name</span>
            <input id="ka-coop-name" maxlength="24" autocomplete="nickname">
          </label>

          <label class="ka-coop-field">
            <span>Worker server URL</span>
            <input id="ka-coop-server" placeholder="https://your-worker.workers.dev">
          </label>

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
            <button id="ka-coop-ready" type="button">NOT READY</button>
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
      server: modal.querySelector('#ka-coop-server'),
      create: modal.querySelector('#ka-coop-create'),
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

    this.elements.name.value = readStored(NAME_STORAGE_KEY, 'Player');
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

    this.elements.map.value = 'grid_bunker';
    setNumericSelectValue(this.elements.difficulty, 1, 1);

    this.bindEvents();
    this.render({
      connected: false,
      connecting: false,
      transportState: 'connected',
      transportMode: 'local',
      room: null,
      localPlayerId: null,
      error: null
    });
  }

  bindEvents() {
    this.elements.close.addEventListener('click', () => this.close());
    this.elements.modal.addEventListener('click', (event) => {
      if (event.target === this.elements.modal) this.close();
    });

    this.elements.create.addEventListener('click', () => {
      this.saveIdentity();
      this.actions.createRoom?.({
        displayName: this.elements.name.value,
        serverUrl: this.elements.server.value
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
      this.elements.codeInput
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
    this.elements.connectView.hidden = online;
    this.elements.roomView.hidden = !online;

    let statusText = 'LOCAL MODE';
    let tone = 'neutral';

    if (nextState.connecting) {
      statusText = nextState.transportState === 'reconnecting'
        ? 'RECONNECTING TO ROOM…'
        : 'CONNECTING…';
      tone = 'warning';
    } else if (
      nextState.transportMode === 'online'
      && nextState.transportState === 'connected'
      && !online
    ) {
      statusText = 'AWAITING ROOM CONFIRMATION…';
      tone = 'warning';
    } else if (nextState.error) {
      statusText = nextState.error;
      tone = 'danger';
    } else if (online) {
      statusText = room.status === 'in-run'
        ? 'CO-OP RUN ACTIVE'
        : 'ONLINE ROOM READY';
      tone = 'success';
    }

    this.elements.status.textContent = statusText;
    this.elements.status.dataset.tone = tone;
    this.elements.openButton.dataset.online = online ? 'true' : 'false';
    this.elements.openButton.textContent = online
      ? `CO-OP · ${room.roomCode || 'ONLINE'}`
      : 'CO-OP ALPHA';

    const disabled = nextState.connecting;
    this.elements.create.disabled = disabled;
    this.elements.join.disabled = disabled;

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

      const identity = document.createElement('div');
      identity.className = 'ka-coop-player-identity';

      const slot = document.createElement('span');
      slot.className = 'ka-coop-player-slot';
      slot.textContent = String(index + 1);

      const name = document.createElement('strong');
      name.textContent = player.displayName || 'Player';

      const role = document.createElement('span');
      role.className = 'ka-coop-player-role';
      role.textContent = player.isHost ? 'HOST' : 'OPERATIVE';

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
      this.elements.playerList.appendChild(row);
    });

    this.elements.map.value = String(room.settings?.mapId || 'grid_bunker');
    setNumericSelectValue(
      this.elements.difficulty,
      room.settings?.difficulty,
      1
    );
    this.elements.map.disabled = !isHost || room.status === 'in-run';
    this.elements.difficulty.disabled = !isHost || room.status === 'in-run';

    this.elements.ready.textContent = local?.ready ? 'READY' : 'NOT READY';
    this.elements.ready.dataset.ready = local?.ready ? 'true' : 'false';
    this.elements.ready.disabled = room.status === 'in-run';

    this.elements.start.hidden = !isHost;
    this.elements.start.disabled = !allReady || room.status === 'in-run';
    this.elements.start.textContent = allReady
      ? 'START CO-OP RUN'
      : 'WAITING FOR READY';
  }
}
