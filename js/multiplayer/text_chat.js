// js/multiplayer/text_chat.js
import { MULTIPLAYER_EVENTS } from './event_bus.js';
import { TRANSPORT_MODES, TRANSPORT_STATES } from './transport.js';
import {
  TEXT_CHAT_MAX_LENGTH,
  TEXT_CHAT_PATCH,
  TextChatStore,
  sanitizeTextChatText
} from './text_chat_core.js';

const ROOT_ID = 'ka-multiplayer-text-chat';

function isEditable(target) {
  return target instanceof Element
    && target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function bestPointerLockTarget() {
  return document.querySelector('canvas') || document.body;
}

export class MultiplayerTextChat {
  constructor({ eventBus, transport, session, runtime } = {}) {
    this.eventBus = eventBus;
    this.transport = transport;
    this.session = session;
    this.runtime = runtime;
    this.store = new TextChatStore();
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

  isAvailable() {
    const room = this.runtime?.room?.getSnapshot?.() || null;
    return this.transport?.getMode?.() === TRANSPORT_MODES.ONLINE
      && this.transport?.getState?.() === TRANSPORT_STATES.CONNECTED
      && Boolean(room?.roomId || room?.roomCode);
  }

  syncAvailability() {
    const room = this.runtime?.room?.getSnapshot?.() || null;
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
    return this.available;
  }

  ensureUi() {
    if (this.root || typeof document === 'undefined') return;
    this.root = document.createElement('section');
    this.root.id = ROOT_ID;
    this.root.setAttribute('aria-label', 'Co-op text chat');
    Object.assign(this.root.style, {
      position: 'fixed', left: '18px', bottom: '18px', zIndex: '76',
      width: 'min(390px, calc(100vw - 36px))', display: 'none',
      fontFamily: 'system-ui, sans-serif', pointerEvents: 'none'
    });

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      display: 'none', marginBottom: '8px', padding: '10px',
      border: '1px solid rgba(73, 224, 255, .72)', borderRadius: '12px',
      background: 'rgba(2, 10, 16, .94)', boxShadow: '0 0 22px rgba(0, 212, 255, .22)',
      pointerEvents: 'auto'
    });

    const title = document.createElement('div');
    title.textContent = 'CO-OP TEXT CHAT';
    Object.assign(title.style, { color: '#74eaff', fontWeight: '900', fontSize: '12px', letterSpacing: '.1em' });

    this.list = document.createElement('div');
    this.list.setAttribute('aria-live', 'polite');
    Object.assign(this.list.style, {
      height: '170px', overflowY: 'auto', margin: '8px 0', padding: '6px',
      borderRadius: '8px', background: 'rgba(0, 0, 0, .28)', color: '#eefbff',
      fontSize: '13px', lineHeight: '1.35'
    });

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
    const sendButton = document.createElement('button');
    sendButton.type = 'button';
    sendButton.textContent = 'SEND';
    Object.assign(sendButton.style, {
      padding: '8px 12px', border: '1px solid #59e8ff', borderRadius: '8px',
      background: '#073044', color: '#effcff', fontWeight: '800', cursor: 'pointer'
    });
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
    Object.assign(this.status.style, { minHeight: '16px', marginTop: '6px', color: '#a8c3cf', fontSize: '11px' });
    this.status.textContent = 'Press Enter to chat · Esc to close';

    composer.append(this.input, sendButton);
    this.panel.append(title, this.list, composer, this.status);

    this.toggleButton = document.createElement('button');
    this.toggleButton.type = 'button';
    this.toggleButton.textContent = 'CHAT';
    this.toggleButton.setAttribute('aria-label', 'Open co-op text chat');
    Object.assign(this.toggleButton.style, {
      display: 'none', pointerEvents: 'auto', width: '68px', height: '42px',
      border: '1px solid #55e5ff', borderRadius: '11px', background: 'rgba(2, 14, 22, .9)',
      color: '#ecfbff', fontWeight: '900', letterSpacing: '.08em', cursor: 'pointer',
      boxShadow: '0 0 15px rgba(0, 212, 255, .22)'
    });
    this.toggleButton.addEventListener('click', () => this.toggle());

    this.root.append(this.panel, this.toggleButton);
    document.body.appendChild(this.root);
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
    this.render();
    if (!this.opened) this.showStatus(`${result.message.displayName}: ${result.message.text}`);
    return result;
  }

  render() {
    if (!this.list) return;
    this.list.replaceChildren();
    this.store.getSnapshot().messages.forEach((message) => {
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
    this.list.scrollTop = this.list.scrollHeight;
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
      initialized: this.initialized,
      available: this.available,
      open: this.opened,
      roomCode: this.roomCode,
      history: this.store.getSnapshot()
    });
  }
}
