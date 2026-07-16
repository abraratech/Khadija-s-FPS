// js/multiplayer/text_chat.js
import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { TRANSPORT_MODES, TRANSPORT_STATES } from './transport.js';
import { isSocialPlayerBlocked } from '../social_bridge.js';
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
import {
  TEXT_CHAT_ATTENTION_PATCH,
  formatTextChatPreview,
  nextTextChatUnreadCount,
  shouldNotifyTextChat
} from './text_chat_attention_core.js';

const ROOT_ID = 'ka-multiplayer-text-chat';
const LOBBY_CHAT_ID = 'ka-coop-lobby-text-chat';
const TOAST_VISIBLE_MS = 4200;

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
    this.unreadCount = 0;
    this.unreadBadge = null;
    this.toast = null;
    this.toastTimer = null;
    this.audioContext = null;
    this.lobbyPanel = null;
    this.lobbyList = null;
    this.lobbyInput = null;
    this.lobbySendButton = null;
    this.lobbyUnreadBadge = null;
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
    if (this.root) this.root.style.display = this.available ? 'block' : 'none';
    this.syncLobbyUi();
    this.updateToggleVisibility();
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
    this.status.textContent = 'T / Enter to open · Enter to send · Esc to close';

    composer.append(this.input, sendButton);
    this.panel.append(titleRow, this.list, safetyRow, composer, this.status);

    this.toggleButton = document.createElement('button');
    this.toggleButton.type = 'button';
    this.toggleButton.setAttribute('aria-label', 'Open co-op text chat');
    Object.assign(this.toggleButton.style, {
      display: 'none', pointerEvents: 'auto', width: '82px', height: '42px',
      position: 'relative', border: '1px solid #55e5ff', borderRadius: '11px',
      background: 'rgba(2, 14, 22, .9)', color: '#ecfbff', fontWeight: '900',
      letterSpacing: '.08em', cursor: 'pointer', boxShadow: '0 0 15px rgba(0, 212, 255, .22)'
    });
    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'CHAT [T]';
    this.unreadBadge = document.createElement('span');
    this.unreadBadge.setAttribute('aria-label', 'Unread chat messages');
    Object.assign(this.unreadBadge.style, {
      display: 'none', position: 'absolute', right: '-7px', top: '-8px',
      minWidth: '20px', height: '20px', padding: '0 5px', borderRadius: '999px',
      alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
      background: '#ff4f64', color: '#fff', border: '2px solid #071018',
      fontSize: '10px', fontWeight: '900', lineHeight: '16px', letterSpacing: '0'
    });
    this.toggleButton.append(toggleLabel, this.unreadBadge);
    this.toggleButton.addEventListener('click', () => this.toggle());

    this.toast = document.createElement('div');
    this.toast.id = 'ka-multiplayer-chat-notification';
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    Object.assign(this.toast.style, {
      display: 'none', position: 'fixed', right: '18px', top: '84px', zIndex: '190',
      width: 'min(360px, calc(100vw - 36px))', padding: '10px 12px',
      border: '1px solid rgba(85, 229, 255, .82)', borderRadius: '10px',
      background: 'rgba(3, 15, 23, .96)', color: '#eefcff',
      boxShadow: '0 0 24px rgba(0, 212, 255, .3)', fontSize: '12px',
      fontWeight: '700', lineHeight: '1.35', pointerEvents: 'none'
    });

    this.root.append(this.panel, this.toggleButton, this.toast);
    document.body.appendChild(this.root);
    this.ensureLobbyUi();
    this.updateUnreadBadges();
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
    const enterShortcut = event.key === 'Enter';
    const chatShortcut = event.code === 'KeyT' || String(event.key || '').toLowerCase() === 't';
    if (
      (!enterShortcut && !chatShortcut)
      || event.repeat
      || event.ctrlKey
      || event.altKey
      || event.metaKey
    ) {
      return;
    }
    if (isEditable(event.target)) return;
    if (!this.isAvailable()) return;
    event.preventDefault();
    this.open({ releasePointerLock: false, keyboardShortcut: true });
  }

  isRunActive() {
    return this.session?.run?.active === true;
  }

  setInputModeActive(active) {
    try {
      window.KHADIJA_TEXT_CHAT_INPUT_ACTIVE = Boolean(active);
      document?.body?.toggleAttribute?.('data-ka-text-chat-open', Boolean(active));
    } catch {}
  }

  open({ releasePointerLock = true, keyboardShortcut = false } = {}) {
    if (!this.syncAvailability()) return false;
    const runActive = this.isRunActive();
    const shouldReleasePointer = releasePointerLock && !runActive;
    this.opened = true;
    this.clearUnread();
    this.setInputModeActive(true);
    if (this.panel) this.panel.style.display = 'block';
    this.updateToggleVisibility();
    if (shouldReleasePointer) {
      try { document.exitPointerLock?.(); } catch {}
    }
    queueMicrotask(() => {
      try { this.input?.focus?.({ preventScroll: true }); } catch { this.input?.focus?.(); }
      if (keyboardShortcut && runActive) this.showStatus('Chat open - gameplay stays active');
    });
    return true;
  }

  close({ restorePointerLock = true } = {}) {
    const wasOpen = this.opened;
    this.opened = false;
    this.setInputModeActive(false);
    if (this.panel) this.panel.style.display = 'none';
    this.updateToggleVisibility();
    this.input?.blur?.();
    if (wasOpen && restorePointerLock && this.isRunActive()) {
      try { bestPointerLockTarget()?.requestPointerLock?.(); } catch {}
    }
    return wasOpen;
  }

  toggle() {
    return this.opened ? (this.close(), false) : this.open();
  }

  sendFromInput() {
    return this.sendFromComposer(this.input, { closeFloating: true });
  }

  sendFromComposer(input, { closeFloating = false } = {}) {
    const result = this.send(input?.value || '');
    if (result.accepted) {
      if (input) input.value = '';
      this.showStatus('Message sent');
      if (closeFloating) this.close();
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
    const hidden = this.safety.shouldHideText(result.message.playerId)
      || isSocialPlayerBlocked(result.message.playerId, this.currentRoom());
    const localPlayerId = String(this.runtime?.localPlayerId || '');
    const localMessage = Boolean(localPlayerId && result.message.playerId === localPlayerId);
    const lobbyVisible = this.isLobbyChatVisible();
    const notify = shouldNotifyTextChat({
      muted: hidden,
      localMessage,
      chatOpen: this.opened,
      lobbyVisible
    });
    this.unreadCount = nextTextChatUnreadCount(this.unreadCount, {
      notify,
      clear: this.opened || lobbyVisible
    });
    this.render();
    this.updateUnreadBadges();
    if (notify) this.notifyIncoming(result.message);
    if (!this.opened) {
      this.showStatus(hidden
        ? 'Message from a muted player hidden'
        : `${result.message.displayName}: ${result.message.text}`);
    }
    return { ...result, hidden, notify };
  }

  renderMessagesInto(container) {
    if (!container) return;
    container.replaceChildren();
    const messages = this.store.getSnapshot().messages;
    let visibleCount = 0;
    messages.forEach((message) => {
      if (
        this.safety.shouldHideText(message.playerId)
        || isSocialPlayerBlocked(message.playerId, this.currentRoom())
      ) return;
      visibleCount += 1;
      const row = document.createElement('div');
      row.style.marginBottom = '5px';
      const name = document.createElement('strong');
      name.textContent = `${message.displayName}: `;
      name.style.color = '#70e8ff';
      const text = document.createElement('span');
      text.textContent = message.text;
      row.append(name, text);
      container.appendChild(row);
    });
    if (!visibleCount && messages.length) {
      const muted = document.createElement('div');
      muted.textContent = 'Messages are hidden by your local mute settings.';
      muted.style.color = '#8aa4af';
      muted.style.fontStyle = 'italic';
      container.appendChild(muted);
    }
    if (!messages.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No room messages yet.';
      empty.style.color = '#7f9aa6';
      empty.style.fontStyle = 'italic';
      container.appendChild(empty);
    }
    container.scrollTop = container.scrollHeight;
  }

  render() {
    this.renderMessagesInto(this.list);
    this.renderMessagesInto(this.lobbyList);
    this.renderSafetyControls();
    this.updateUnreadBadges();
  }

  ensureLobbyUi() {
    if (this.lobbyPanel?.isConnected || typeof document === 'undefined') return;
    const roomView = document.getElementById('ka-coop-room-view');
    if (!roomView) return;

    const panel = document.createElement('section');
    panel.id = LOBBY_CHAT_ID;
    panel.setAttribute('aria-label', 'Room text chat');
    Object.assign(panel.style, {
      marginTop: '12px', padding: '10px', borderRadius: '11px',
      border: '1px solid rgba(85, 229, 255, .5)',
      background: 'rgba(1, 12, 19, .72)', boxSizing: 'border-box'
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px'
    });
    const title = document.createElement('strong');
    title.textContent = 'ROOM TEXT CHAT';
    Object.assign(title.style, {
      flex: '1', color: '#74eaff', fontSize: '11px', letterSpacing: '.1em'
    });
    this.lobbyUnreadBadge = document.createElement('span');
    Object.assign(this.lobbyUnreadBadge.style, {
      display: 'none', minWidth: '20px', height: '20px', padding: '0 6px',
      borderRadius: '999px', alignItems: 'center', justifyContent: 'center',
      background: '#ff4f64', color: '#fff', fontSize: '10px', fontWeight: '900'
    });
    header.append(title, this.lobbyUnreadBadge);

    this.lobbyList = document.createElement('div');
    this.lobbyList.setAttribute('aria-live', 'polite');
    Object.assign(this.lobbyList.style, {
      height: '112px', overflowY: 'auto', padding: '7px', marginBottom: '8px',
      borderRadius: '8px', background: 'rgba(0, 0, 0, .3)', color: '#eefbff',
      fontSize: '12px', lineHeight: '1.35'
    });

    const composer = document.createElement('div');
    Object.assign(composer.style, { display: 'flex', gap: '7px' });
    this.lobbyInput = document.createElement('input');
    this.lobbyInput.type = 'text';
    this.lobbyInput.maxLength = TEXT_CHAT_MAX_LENGTH;
    this.lobbyInput.placeholder = 'Message room…';
    this.lobbyInput.autocomplete = 'off';
    this.lobbyInput.setAttribute('aria-label', 'Room chat message');
    Object.assign(this.lobbyInput.style, {
      flex: '1', minWidth: '0', padding: '8px 9px', borderRadius: '8px',
      border: '1px solid rgba(100, 190, 210, .55)', background: '#061018', color: '#fff'
    });
    this.lobbySendButton = this.makeButton('SEND', 'Send room chat message');
    Object.assign(this.lobbySendButton.style, { padding: '8px 12px', fontSize: '11px' });
    this.lobbySendButton.addEventListener('click', () => {
      this.sendFromComposer(this.lobbyInput, { closeFloating: false });
    });
    this.lobbyInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.sendFromComposer(this.lobbyInput, { closeFloating: false });
      }
    });
    this.lobbyInput.addEventListener('keyup', (event) => event.stopPropagation());
    this.lobbyInput.addEventListener('focus', () => this.clearUnread());
    composer.append(this.lobbyInput, this.lobbySendButton);
    panel.append(header, this.lobbyList, composer);

    const actions = roomView.querySelector('.ka-coop-actions');
    if (actions) roomView.insertBefore(panel, actions);
    else roomView.appendChild(panel);
    this.lobbyPanel = panel;
    this.render();
  }

  isLobbyChatVisible() {
    const modal = document.getElementById('ka-coop-modal');
    const roomView = document.getElementById('ka-coop-room-view');
    return Boolean(
      this.available
      && this.lobbyPanel?.isConnected
      && this.lobbyPanel.hidden !== true
      && roomView?.hidden === false
      && modal?.classList?.contains('open')
      && this.session?.run?.active !== true
    );
  }

  syncLobbyUi() {
    this.ensureLobbyUi();
    if (!this.lobbyPanel) return;
    const inRun = this.session?.run?.active === true;
    this.lobbyPanel.hidden = !this.available || inRun;
    if (this.lobbyInput) this.lobbyInput.disabled = !this.available || inRun;
    if (this.lobbySendButton) this.lobbySendButton.disabled = !this.available || inRun;
    if (this.isLobbyChatVisible()) this.clearUnread();
  }

  updateToggleVisibility() {
    if (!this.toggleButton) return;
    this.toggleButton.style.display = (
      this.available && !this.opened && !this.isLobbyChatVisible()
    ) ? 'block' : 'none';
  }

  updateUnreadBadges() {
    const text = this.unreadCount > 9 ? '9+' : String(this.unreadCount);
    [this.unreadBadge, this.lobbyUnreadBadge].forEach((badge) => {
      if (!badge) return;
      badge.textContent = text;
      badge.style.display = this.unreadCount > 0 ? 'inline-flex' : 'none';
    });
    if (this.toggleButton) {
      this.toggleButton.setAttribute(
        'aria-label',
        this.unreadCount > 0
          ? `Open co-op text chat, ${this.unreadCount} unread`
          : 'Open co-op text chat'
      );
    }
  }

  clearUnread() {
    if (this.unreadCount === 0) return;
    this.unreadCount = 0;
    this.updateUnreadBadges();
  }

  notifyIncoming(message) {
    const preview = formatTextChatPreview(message);
    if (this.toast) {
      this.toast.textContent = preview;
      this.toast.style.display = 'block';
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        if (this.toast) this.toast.style.display = 'none';
      }, TOAST_VISIBLE_MS);
    }
    try {
      this.toggleButton?.animate?.([
        { transform: 'scale(1)', boxShadow: '0 0 15px rgba(0, 212, 255, .22)' },
        { transform: 'scale(1.06)', boxShadow: '0 0 26px rgba(255, 79, 100, .72)' },
        { transform: 'scale(1)', boxShadow: '0 0 15px rgba(0, 212, 255, .22)' }
      ], { duration: 720, easing: 'ease-out' });
    } catch {}
    this.playAttentionSound();
  }

  playAttentionSound() {
    try {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return false;
      if (!this.audioContext) this.audioContext = new Context();
      const context = this.audioContext;
      void context.resume?.().catch?.(() => {});
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(720, start);
      oscillator.frequency.exponentialRampToValueAtTime(940, start + 0.09);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.035, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
      return true;
    } catch {
      return false;
    }
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
    this.clearUnread();
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
      attentionPatch: TEXT_CHAT_ATTENTION_PATCH,
      unreadCount: this.unreadCount,
      lobbyVisible: this.isLobbyChatVisible(),
      history: this.store.getSnapshot(),
      safety: this.safety.getSnapshot()
    });
  }
}
