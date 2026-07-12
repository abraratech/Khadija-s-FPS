// js/multiplayer/live_voice_turn.js
import { MULTIPLAYER_EVENTS } from './event_bus.js';
import {
  LIVE_VOICE_TURN_PATCH,
  VOICE_ICE_CONFIG_ACTION,
  VOICE_ICE_CONFIG_REJECTED_ACTION,
  VOICE_ICE_CONFIG_REQUEST_ACTION,
  VOICE_ICE_REQUEST_TIMEOUT_MS,
  DEFAULT_VOICE_ICE_SERVERS,
  normalizeVoiceIceConfig,
  voiceIceConfigFresh,
  voicePeerConfiguration
} from './live_voice_turn_core.js';

const POLL_MS = 500;
const ROOT_ID = 'ka-live-voice-turn';

class MultiplayerLiveVoiceTurn {
  constructor() {
    this.controller = null;
    this.chat = null;
    this.transport = null;
    this.eventBus = null;
    this.config = normalizeVoiceIceConfig({ iceServers: DEFAULT_VOICE_ICE_SERVERS, source: 'stun-only:boot' });
    this.pending = null;
    this.pendingResolve = null;
    this.unsubscribe = null;
    this.wrapped = false;
    this.root = null;
    this.status = null;
    this.retryButton = null;
    this.timer = 0;
  }

  initialize() {
    if (typeof window === 'undefined') return this.getSnapshot();
    this.timer = window.setInterval(() => this.sync(), POLL_MS);
    window.addEventListener('online', () => void this.ensureConfig({ force: true }));
    this.sync();
    try { window.KHADIJA_VOICE_TURN = this; } catch {}
    return this.getSnapshot();
  }

  attach() {
    const controller = window.KHADIJA_LIVE_VOICE || null;
    const chat = window.KHADIJA_TEXT_CHAT || null;
    if (!controller || !chat) return false;
    this.controller = controller;
    this.chat = chat;
    this.transport = chat.transport || null;
    this.eventBus = chat.eventBus || null;
    if (!this.unsubscribe && this.eventBus?.on) {
      this.unsubscribe = this.eventBus.on(MULTIPLAYER_EVENTS.TRANSPORT_CONTROL, (event) => {
        const message = event?.payload || event;
        if (message?.action === VOICE_ICE_CONFIG_ACTION) {
          this.applyConfig(message.payload?.config);
        } else if (message?.action === VOICE_ICE_CONFIG_REJECTED_ACTION) {
          this.finishPending(false);
          this.render('TURN CREDENTIAL REQUEST COOLED DOWN', true);
        }
      });
    }
    this.wrapController();
    this.ensureUi();
    return true;
  }

  wrapController() {
    if (this.wrapped || !this.controller) return;
    const originalEnsurePeer = this.controller.ensurePeer.bind(this.controller);
    const originalStart = this.controller.start.bind(this.controller);
    this.controller.ensurePeer = (teammate) => {
      const peer = originalEnsurePeer(teammate);
      this.applyToPeer(peer);
      return peer;
    };
    this.controller.start = async (...args) => {
      await this.ensureConfig();
      return originalStart(...args);
    };
    this.wrapped = true;
  }

  ensureUi() {
    if (this.root || !this.controller?.root) return;
    this.root = document.createElement('section');
    this.root.id = ROOT_ID;
    Object.assign(this.root.style, { marginTop: '9px', paddingTop: '9px', borderTop: '1px solid rgba(89, 232, 255, .22)' });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '7px', alignItems: 'center' });
    this.status = document.createElement('div');
    Object.assign(this.status.style, { flex: '1', color: '#ffe27a', fontSize: '10px', fontWeight: '800', letterSpacing: '.03em' });
    this.retryButton = document.createElement('button');
    this.retryButton.type = 'button';
    this.retryButton.textContent = 'REFRESH TURN';
    this.retryButton.setAttribute('aria-label', 'Refresh secure TURN voice fallback credentials');
    Object.assign(this.retryButton.style, { padding: '7px 9px', border: '1px solid rgba(89, 232, 255, .62)', borderRadius: '7px', background: '#073044', color: '#effcff', fontSize: '10px', fontWeight: '800', cursor: 'pointer' });
    this.retryButton.addEventListener('click', () => void this.ensureConfig({ force: true }));
    row.append(this.status, this.retryButton);
    this.root.appendChild(row);
    this.controller.root.appendChild(this.root);
    this.render();
  }

  roomAvailable() {
    return this.chat?.getSnapshot?.().available === true;
  }

  sync() {
    if (!this.attach()) return false;
    if (this.roomAvailable() && !voiceIceConfigFresh(this.config)) void this.ensureConfig();
    this.render();
    return true;
  }

  ensureConfig({ force = false } = {}) {
    if (!force && voiceIceConfigFresh(this.config)) return Promise.resolve(this.config);
    if (this.pending) return this.pending;
    if (!this.roomAvailable() || !this.transport?.sendControl) return Promise.resolve(this.config);
    const pending = new Promise((resolve) => { this.pendingResolve = resolve; });
    this.pending = pending;
    const sent = this.transport.sendControl(VOICE_ICE_CONFIG_REQUEST_ACTION, {});
    if (sent !== true) {
      this.finishPending(false);
      return Promise.resolve(this.config);
    }
    window.setTimeout(() => this.finishPending(false), VOICE_ICE_REQUEST_TIMEOUT_MS);
    this.render('REQUESTING SECURE VOICE FALLBACK…', false);
    return pending;
  }

  finishPending(success) {
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.pending = null;
    resolve?.(this.config);
    if (!success) this.render();
  }

  applyConfig(candidate) {
    const hadRelay = this.config.turnRelayConfigured === true;
    this.config = normalizeVoiceIceConfig(candidate);
    for (const peer of this.controller?.peers?.values?.() || []) this.applyToPeer(peer);
    this.finishPending(true);
    if (this.controller?.active && !hadRelay && this.config.turnRelayConfigured) {
      window.KHADIJA_VOICE_RELIABILITY?.retryAll?.('turn-config', { resetBudget: true });
    }
    this.render();
    return this.config;
  }

  applyToPeer(peer) {
    if (!peer?.pc || typeof peer.pc.setConfiguration !== 'function') return false;
    try {
      peer.pc.setConfiguration(voicePeerConfiguration(this.config.iceServers));
      return true;
    } catch {
      return false;
    }
  }

  render(override = '', isError = false) {
    if (!this.status) return;
    const label = override || (this.config.turnRelayConfigured
      ? 'TURN FALLBACK AVAILABLE'
      : 'DIRECT P2P / STUN ONLY · TURN NOT CONFIGURED');
    this.status.textContent = label;
    this.status.style.color = isError ? '#ff8f8f' : this.config.turnRelayConfigured ? '#8effb0' : '#ffe27a';
    if (this.retryButton) {
      this.retryButton.disabled = !this.roomAvailable() || Boolean(this.pending);
      this.retryButton.style.opacity = this.retryButton.disabled ? '.55' : '1';
    }
  }

  getSnapshot() {
    return Object.freeze({
      patch: LIVE_VOICE_TURN_PATCH,
      turnRelayConfigured: this.config.turnRelayConfigured,
      source: this.config.source,
      expiresAt: this.config.expiresAt,
      iceServerCount: this.config.iceServers.length,
      longTermSecretsClientVisible: false
    });
  }
}

const controller = new MultiplayerLiveVoiceTurn();
if (typeof window !== 'undefined') controller.initialize();
export { controller as multiplayerLiveVoiceTurn };
