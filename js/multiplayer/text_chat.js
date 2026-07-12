// js/multiplayer/text_chat.js
import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { TRANSPORT_MODES, TRANSPORT_STATES } from './transport.js';
import {
  TEXT_CHAT_MAX_LENGTH,
  TEXT_CHAT_PATCH,
  TextChatStore,
  sanitizeTextChatText
} from './text_chat_core.js';
import {
  COMMUNICATION_SAFETY_PATCH,
  CommunicationSafetyStore
} from './communication_safety_core.js';

const ROOT_ID = 'ka-multiplayer-text-chat';

function isEditable(target) {
  return target instanceof Element
    && target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function bestPointerLockTarget() {
  return document.querySelector('canvas') || document.body;
}

function roomPlayers(room) {
  const entries = Array.isArray(room?.players) ? room.players : [];
  return entries
    .map((entry) => ({
      playerId: String(entry?.playerId || entry?.id || '').trim(),
      displayName: String(entry?.displayName || entry?.name || 'Player').trim().slice(0, 24) || 'Player',
      connected: entry?.connected !== false
    }))
    .filter((entry) => entry.playerId && entry.connected);
}

export class MultiplayerTextChat {
  constructor({ eventBus, transport, session, runtime } = {}) {
    this.eventBus = eventBus;
    this.transport = transport;
    this.session = session;
    this.runtime = runtime;
    this.store = new TextChatStore();
    this.safety = new CommunicationSafetyStore();
    this.initialized = false;
    this.opened = false;
    this.available = false;
    this.roomCode = null;
    this.root = null;
    this.panel = null;
    this.list = null;
    this.input = null;
    this.status = null;
    this.toggleButton = null;
    this.muteAllButton = null;
    this.clearButton = null;
    this.playerSelect = null;
    this.playerMuteButton = null;
    this.unsubscribers = [];
    this.syncTimer = null;
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  initialize() {
    if (this.initialized) return this.getSnapshot();
    this.initialized = true;
    this.ensureUi();
    this.unsubscribers.push(
      this.eventBus?.on?.(MULTIPLAYER_EVENTS.TRANSPORT_CONTROL, (event) => {
        const message = event?.payload || event;
        if (message?.action === 'chat-message') this.receive(message.payload?.message);
        if (message?.action === 'chat-rejected') this.showStatus(this.rejectionText(message.payload));
      }),
      this.eventBus?.on?.(MULTIPLAYER_EVENTS.TRANSPORT_STATE_CHANGED, () => this.syncAvailability()),
      this.eventBus?.on?.(MULTIPLAYER_EVENTS.ROOM_STATE_CHANGED, () => this.syncAvailability())
    );
    window.addEventListener('keydown', this.onKeyDown, true);
    this.syncTimer = setInterval(() => this.syncAvailability(), 300);
    this.syncAvailability();
    try { window.KHADIJA_TEXT_CHAT = this; } catch {}
    return this.getSnapshot();
  }

  currentRoom() {
    return this.runtime?.room?.getSnapshot?.() || null;
  }

  isAvailable() {
    const room = this.currentRoom();
    return this.transport?.getMode?.() === TRANSPORT_MODES.ONLINE
      && this.transport?.getState?.() === TRANSPORT_STATES.CONNECTED
      && Boolean(room?.roomId || room?.roomCode);
  }

  syncAvailability() {
    const room = this.currentRoom();
    const nextRoomCode = room?.roomCode || null;
    if (this.roomCode && nextRoomCode && this.roomCode !== nextRoomCode) {
      this.store.clear();
      this.render();
    }
    this.roomCode = nextRoomCode;
    this.available = this.isAvailable();
    if (!this.available) this.close({ restorePointerLock: false });
    if (this.toggleButton) this.toggleButton.style.display = this.available ? 'block' : 'none';
    if (this.root) this.root.style.display = this.available ? 'block' : 'none';
    this.renderSafetyControls();
    return this.available;
  }

  makeButton(label, ariaLabel = label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', ariaLabel);
    Object.assign(button.style, {
      padding: '6px 8px', border: '1px solid rgba(89, 232, 255, .62)',
      borderRadius: '7px', background: '#073044', color: '#effcff',
      fontSize: '10px', fontWeight: '800', letterSpacing: '.04em', cursor: 'pointer'
    });
    return button;
  }

  ensureUi() {
    if (this.root || typeof document === 'undefined') return;
    this.root = document.createElement('section');
    this.root.id = ROOT_ID;
    this.root.setAttribute('aria-label', 'Co-op text chat');
    Object.assign(this.root.style, {
      position: 'fixed', left: '18px', bottom: '18px', zIndex: '76',
      width: 'min(410px, calc(100vw - 36px))', display: 'none',
      fontFamily: 'system-ui, sans-serif', pointerEvents: 'none'
    });

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      display: 'none', marginBottom: '8px', padding: '10px',
      border: '1px solid rgba(73, 224, 255, .72)', borderRadius: '12px',
      background: 'rgba(2, 10, 16, .94)', boxShadow: '0 0 22px rgba(0, 212, 255, .22)',
      pointerEvents: 'auto'
    });

    const titleRow = document.createElement('div');
    Object.assign(titleRow.style, { display: 'flex', alignItems: 'center', gap: '6px' });
    const title = document.createElement('div');
    title.textContent = 'CO-OP TEXT CHAT';
    Object.assign(title.style, {
      flex: '1', color: '#74eaff', fontWeight: '900',
      fontSize: '12px', letterSpacing: '.1em'
    });

    this.muteAllButton = this.makeButton('MUTE ALL', 'Mute all co-op text chat');
    this.muteAllButton.addEventListener('click', () => {
      const muted = this.safety.getSnapshot().muteAllText !== true;
      this.safety.setMuteAllText(muted);
      this.render();
      this.renderSafetyControls();
      this.showStatus(muted ? 'All co-op text muted locally' : 'Co-op text unmuted');
    });

    this.clearButton = this.makeButton('CLEAR', 'Clear local chat history');
    this.clearButton.addEventListener('click', () => {
      this.store.clear();
      this.render();
      this.showStatus('Local chat history cleared');
    });
    titleRow.append(title, this.muteAllButton, this.clearButton);

    this.list = document.createElement('div');
    this.list.setAttribute('aria-live', 'polite');
    Object.assign(this.list.style, {
      height: '170px', overflowY: 'auto', margin: '8px 0', padding: '6px',
      borderRadius: '8px', background: 'rgba(0, 0, 0, .28)', color: '#eefbff',
      fontSize: '13px', lineHeight: '1.35'
    });

    const safetyRow = document.createElement('div');
    Object.assign(safetyRow.style, { display: 'flex', gap: '7px', marginBottom: '8px' });
    this.playerSelect = document.createElement('select');
    this.playerSelect.setAttribute('aria-label', 'Choose teammate to mute or unmute');
    Object.assign(this.playerSelect.style, {
      flex: '1', minWidth: '0', padding: '7px 8px', borderRadius: '7px',
      border: '1px solid rgba(100, 190, 210, .55)', background: '#061018', color: '#fff'
    });
    this.playerSelect.addEventListener('change', () => this.renderSafetyControls());
    this.playerMuteButton = this.makeButton('MUTE PLAYER', 'Mute selected teammate text');
    this.playerMuteButton.addEventListener('click', () => {
      const playerId = this.playerSelect?.value || '';
      const result = this.safety.toggleTextPlayer(playerId);
      this.render();
      this.renderSafetyControls();
      const selected = this.playerSelect?.selectedOptions?.[0]?.textContent || 'Player';
      this.showStatus(result.reason === 'muted' ? `${selected} muted locally` : `${selected} unmuted`);
    });
    safetyRow.append(this.playerSelect, this.playerMuteButton);

    const composer = document.createElement('div');
    Object.assign(composer.style, { display: 'flex', gap: '7px' });
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = TEXT_CHAT_MAX_LENGTH;
    this.input.placeholder = 'Message team…';
    this.input.autocomplete = 'off';
    Object.assign(this.input.style, {
      flex: '1', minWidth: '0', padding: '9px 10px', borderRadius: '8px',
      border: '1px solid rgba(100, 190, 210, .55)', background: '#061018', color: '#fff'
    });
    const sendButton = this.makeButton('SEND', 'Send co-op text message');
    Object.assign(sendButton.style, { padding: '8px 12px', fontSize: '11px' });
    sendButton.addEventListener('click', () => this.sendFromInput());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.sendFromInput();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });

    this.status = document.createElement('div');
    Object.assign(this.status.style, {
      minHeight: '16px', marginTop: '6px', color: '#a8c3cf', fontSize: '11px'
    });
    this.status.textContent = 'Press Enter to chat · Esc to close';

    composer.append(this.input, sendButton);
    this.panel.append(titleRow, this.list, safetyRow, composer, this.status);

    this.toggleButton = document.createElement('button');
    this.toggleButton.type = 'button';
    this.toggleButton.textContent = 'CHAT';
    this.toggleButton.setAttribute('aria-label', 'Open co-op text chat');
    Object.assign(this.toggleButton.style, {
      display: 'none', pointerEvents: 'auto', width: '68px', height: '42px',
      border: '1px solid #55e5ff', borderRadius: '11px',
      background: 'rgba(2, 14, 22, .9)', color: '#ecfbff', fontWeight: '900',
      letterSpacing: '.08em', cursor: 'pointer', boxShadow: '0 0 15px rgba(0, 212, 255, .22)'
    });
    this.toggleButton.addEventListener('click', () => this.toggle());
    this.root.append(this.panel, this.toggleButton);
    document.body.appendChild(this.root);
    this.renderSafetyControls();
  }

  renderSafetyControls() {
    if (!this.playerSelect) return;
    const previous = this.playerSelect.value;
    const localPlayerId = String(this.runtime?.localPlayerId || '');
    const teammates = roomPlayers(this.currentRoom()).filter((entry) => entry.playerId !== localPlayerId);
    this.playerSelect.replaceChildren();
    if (!teammates.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No teammate available';
      this.playerSelect.appendChild(option);
    } else {
      teammates.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.playerId;
        option.textContent = this.safety.isTextPlayerMuted(entry.playerId)
          ? `${entry.displayName} · MUTED`
          : entry.displayName;
        this.playerSelect.appendChild(option);
      });
      if (teammates.some((entry) => entry.playerId === previous)) this.playerSelect.value = previous;
    }
    const selectedId = this.playerSelect.value;
    const selectedMuted = selectedId && this.safety.isTextPlayerMuted(selectedId);
    if (this.playerMuteButton) {
      this.playerMuteButton.disabled = !selectedId;
      this.playerMuteButton.textContent = selectedMuted ? 'UNMUTE PLAYER' : 'MUTE PLAYER';
      this.playerMuteButton.setAttribute('aria-label', selectedMuted ? 'Unmute selected teammate text' : 'Mute selected teammate text');
      this.playerMuteButton.style.opacity = selectedId ? '1' : '.55';
    }
    const muteAll = this.safety.getSnapshot().muteAllText;
    if (this.muteAllButton) {
      this.muteAllButton.textContent = muteAll ? 'UNMUTE ALL' : 'MUTE ALL';
      this.muteAllButton.setAttribute('aria-label', muteAll ? 'Unmute all co-op text chat' : 'Mute all co-op text chat');
    }
  }

  onKeyDown(event) {
    if (event.key !== 'Enter' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (isEditable(event.target)) return;
    if (!this.isAvailable()) return;
    event.preventDefault();
    this.open();
  }

  open() {
    if (!this.syncAvailability()) return false;
    this.opened = true;
    if (this.panel) this.panel.style.display = 'block';
    if (this.toggleButton) this.toggleButton.style.display = 'none';
    try { document.exitPointerLock?.(); } catch {}
    queueMicrotask(() => this.input?.focus?.());
    return true;
  }

  close({ restorePointerLock = true } = {}) {
    const wasOpen = this.opened;
    this.opened = false;
    if (this.panel) this.panel.style.display = 'none';
    if (this.toggleButton) this.toggleButton.style.display = this.available ? 'block' : 'none';
    this.input?.blur?.();
    if (wasOpen && restorePointerLock && this.session?.run?.active === true) {
      try { bestPointerLockTarget()?.requestPointerLock?.(); } catch {}
    }
    return wasOpen;
  }

  toggle() {
    return this.opened ? (this.close(), false) : this.open();
  }

  sendFromInput() {
    const result = this.send(this.input?.value || '');
    if (result.accepted) {
      if (this.input) this.input.value = '';
      this.showStatus('Message sent');
      this.close();
    } else {
      this.showStatus(this.rejectionText(result));
    }
    return result;
  }

  send(value) {
    const text = sanitizeTextChatText(value);
    if (!this.isAvailable()) return { accepted: false, reason: 'offline' };
    if (!text) return { accepted: false, reason: 'invalid-text' };
    const sent = this.transport?.sendControl?.('chat-message', { text }) === true;
    return sent ? { accepted: true, reason: 'sent' } : { accepted: false, reason: 'not-ready' };
  }

  receive(candidate) {
    const result = this.store.add(candidate, { now: Date.now() });
    if (!result.accepted) return result;
    const hidden = this.safety.shouldHideText(result.message.playerId);
    this.render();
    if (!this.opened) {
      this.showStatus(hidden
        ? 'Message from a muted player hidden'
        : `${result.message.displayName}: ${result.message.text}`);
    }
    return { ...result, hidden };
  }

  render() {
    if (!this.list) return;
    this.list.replaceChildren();
    const messages = this.store.getSnapshot().messages;
    let visibleCount = 0;
    messages.forEach((message) => {
      if (this.safety.shouldHideText(message.playerId)) return;
      visibleCount += 1;
      const row = document.createElement('div');
      row.style.marginBottom = '5px';
      const name = document.createElement('strong');
      name.textContent = `${message.displayName}: `;
      name.style.color = '#70e8ff';
      const text = document.createElement('span');
      text.textContent = message.text;
      row.append(name, text);
      this.list.appendChild(row);
    });
    if (!visibleCount && messages.length) {
      const muted = document.createElement('div');
      muted.textContent = 'Messages are hidden by your local mute settings.';
      muted.style.color = '#8aa4af';
      muted.style.fontStyle = 'italic';
      this.list.appendChild(muted);
    }
    this.list.scrollTop = this.list.scrollHeight;
    this.renderSafetyControls();
  }

  rejectionText(payload = {}) {
    const reason = String(payload?.reason || 'not-ready');
    if (reason === 'cooldown') return 'Chat cooling down';
    if (reason === 'rate-limit') return 'Too many messages; wait a moment';
    if (reason === 'invalid-text') return 'Enter a message first';
    if (reason === 'offline') return 'Join a co-op room to chat';
    return 'Chat is not ready';
  }

  showStatus(text) {
    if (this.status) this.status.textContent = String(text || '').slice(0, 220);
  }

  handleRoomLeft() {
    this.roomCode = null;
    this.store.clear();
    this.render();
    this.available = false;
    this.close({ restorePointerLock: false });
  }

  getSnapshot() {
    return Object.freeze({
      patch: TEXT_CHAT_PATCH,
      safetyPatch: COMMUNICATION_SAFETY_PATCH,
      initialized: this.initialized,
      available: this.available,
      open: this.opened,
      roomCode: this.roomCode,
      history: this.store.getSnapshot(),
      safety: this.safety.getSnapshot()
    });
  }
}
