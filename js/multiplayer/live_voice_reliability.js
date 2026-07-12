// js/multiplayer/live_voice_reliability.js
import { LIVE_VOICE_SIGNAL_KINDS, shouldInitiateVoiceOffer } from './live_voice_core.js';
import {
  LIVE_VOICE_RELIABILITY_PATCH,
  VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS,
  VOICE_REPAIR_WINDOW_MS,
  VOICE_STATS_SAMPLE_MS,
  classifyVoiceQuality,
  normalizeVoicePeerState,
  normalizeVoiceQualityMetrics,
  shouldRepairVoicePeer,
  summarizeVoiceHealth,
  voiceRepairDelay,
} from './live_voice_reliability_core.js';

const POLL_INTERVAL_MS = 500;
const ROOT_ID = 'ka-live-voice-reliability';

function nowMs() { return Date.now(); }
function onlineNow() { return globalThis.navigator?.onLine !== false; }

class MultiplayerLiveVoiceReliability {
  constructor() {
    this.controller = null;
    this.records = new Map();
    this.repairTimers = new Map();
    this.statsPending = new Set();
    this.interval = 0;
    this.root = null;
    this.health = null;
    this.details = null;
    this.retryButton = null;
    this.lastOnline = onlineNow();
  }

  initialize() {
    if (typeof window === 'undefined') return this.getSnapshot();
    this.interval = window.setInterval(() => this.sync(), POLL_INTERVAL_MS);
    window.addEventListener('online', () => { this.lastOnline = true; this.retryAll('network-online', { resetBudget: false }); });
    window.addEventListener('offline', () => { this.lastOnline = false; this.controller?.setPttHeld?.(false); this.render(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.controller?.setPttHeld?.(false);
      else this.retryAll('page-visible', { resetBudget: false });
    });
    this.sync();
    try { window.KHADIJA_VOICE_RELIABILITY = this; } catch {}
    return this.getSnapshot();
  }

  attachController() {
    const controller = window.KHADIJA_LIVE_VOICE || null;
    if (!controller) return false;
    this.controller = controller;
    this.ensureUi();
    return true;
  }

  ensureUi() {
    if (this.root || !this.controller?.root) return;
    this.root = document.createElement('section');
    this.root.id = ROOT_ID;
    Object.assign(this.root.style, {
      marginTop: '9px', paddingTop: '9px', borderTop: '1px solid rgba(89, 232, 255, .22)'
    });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '7px', alignItems: 'center' });
    this.health = document.createElement('div');
    Object.assign(this.health.style, {
      flex: '1', color: '#b9d7e2', fontSize: '10px', fontWeight: '800', letterSpacing: '.03em'
    });
    this.retryButton = document.createElement('button');
    this.retryButton.type = 'button';
    this.retryButton.textContent = 'RETRY VOICE';
    this.retryButton.setAttribute('aria-label', 'Retry all teammate voice connections');
    Object.assign(this.retryButton.style, {
      padding: '7px 9px', border: '1px solid rgba(89, 232, 255, .62)', borderRadius: '7px',
      background: '#073044', color: '#effcff', fontSize: '10px', fontWeight: '800', cursor: 'pointer'
    });
    this.retryButton.addEventListener('click', () => this.retryAll('manual', { resetBudget: true }));
    row.append(this.health, this.retryButton);
    this.details = document.createElement('div');
    Object.assign(this.details.style, { marginTop: '5px', color: '#8faab5', fontSize: '9px', lineHeight: '1.35' });
    this.root.append(row, this.details);
    this.controller.root.appendChild(this.root);
  }

  recordFor(playerId, displayName = 'Teammate') {
    let record = this.records.get(playerId);
    if (!record) {
      record = {
        playerId, displayName, state: 'unknown', previousState: 'unknown', disconnectedSince: 0,
        attempts: 0, attemptWindowStartedAt: 0, nextRetryAt: 0, recovering: false, blocked: false,
        lastAction: '', lastStateChangedAt: nowMs(), lastStatsAt: 0,
        metrics: normalizeVoiceQualityMetrics(null), quality: 'good'
      };
      this.records.set(playerId, record);
    }
    record.displayName = displayName || record.displayName;
    return record;
  }

  sync(now = nowMs()) {
    if (!this.attachController()) return false;
    this.lastOnline = onlineNow();
    const active = this.controller.active === true;
    const seen = new Set();
    for (const [playerId, peer] of this.controller.peers || []) {
      seen.add(playerId);
      const record = this.recordFor(playerId, peer.displayName);
      const state = normalizeVoicePeerState(peer.pc?.connectionState, peer.pc?.iceConnectionState);
      if (state !== record.state) {
        record.previousState = record.state;
        record.state = state;
        record.lastStateChangedAt = now;
        if (state === 'disconnected') record.disconnectedSince = now;
        if (state === 'connected') {
          record.disconnectedSince = 0;
          record.recovering = false;
          record.blocked = false;
          if (now - record.attemptWindowStartedAt > 10000) {
            record.attempts = 0;
            record.attemptWindowStartedAt = 0;
          }
        }
      }
      const disconnectedForMs = record.disconnectedSince ? now - record.disconnectedSince : 0;
      const repairableFailure = state === 'failed' || (state === 'disconnected' && disconnectedForMs >= 4000);
      if (
        active && this.lastOnline && repairableFailure
        && record.attempts >= VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS
        && now >= record.nextRetryAt
      ) {
        record.blocked = true;
        record.recovering = false;
        this.controller.setPttHeld?.(false);
        this.controller.setStatus?.('DIRECT VOICE CONNECTION BLOCKED · TURN MAY BE REQUIRED', true);
      } else if (shouldRepairVoicePeer({
        active, online: this.lastOnline, state, disconnectedForMs,
        attempts: record.attempts, now, nextRetryAt: record.nextRetryAt,
      })) {
        this.schedulePeerRepair(playerId, state);
      }
      if (state === 'connected' && now - record.lastStatsAt >= VOICE_STATS_SAMPLE_MS) {
        void this.samplePeerStats(playerId, peer, record, now);
      }
    }
    for (const playerId of [...this.records.keys()]) {
      if (!seen.has(playerId) && !this.repairTimers.has(playerId)) this.records.delete(playerId);
    }
    if (!active) {
      this.clearRepairTimers();
      this.records.forEach((record) => { record.recovering = false; record.blocked = false; });
    }
    this.render();
    return true;
  }

  schedulePeerRepair(playerId, reason = 'failed', { manual = false } = {}) {
    if (!this.controller?.active || !playerId || this.repairTimers.has(playerId)) return false;
    const peer = this.controller.peers?.get?.(playerId);
    const record = this.recordFor(playerId, peer?.displayName || 'Teammate');
    const now = nowMs();
    if (!record.attemptWindowStartedAt || now - record.attemptWindowStartedAt > VOICE_REPAIR_WINDOW_MS || manual) {
      record.attemptWindowStartedAt = now;
      record.attempts = 0;
      record.blocked = false;
    }
    if (!manual && record.attempts >= VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS) {
      record.blocked = true;
      record.recovering = false;
      this.controller.setPttHeld?.(false);
      this.controller.setStatus?.('DIRECT VOICE CONNECTION BLOCKED · TURN MAY BE REQUIRED', true);
      this.render();
      return true;
    }
    const delay = manual ? 0 : voiceRepairDelay(record.attempts);
    record.recovering = true;
    record.lastAction = reason === 'disconnected' ? 'WAITING FOR PEER' : 'RECOVERING';
    record.nextRetryAt = now + delay;
    const timer = setTimeout(() => {
      this.repairTimers.delete(playerId);
      void this.repairPeer(playerId, reason, { manual });
    }, delay);
    this.repairTimers.set(playerId, timer);
    this.render();
    return true;
  }

  async repairPeer(playerId, reason, { manual = false } = {}) {
    if (!this.controller?.active || !onlineNow()) return false;
    const peer = this.controller.peers?.get?.(playerId);
    const record = this.recordFor(playerId, peer?.displayName || 'Teammate');
    const now = nowMs();
    record.attempts += 1;
    record.nextRetryAt = now + voiceRepairDelay(record.attempts);
    record.recovering = true;
    this.controller.setPttHeld?.(false);

    const nativeTimer = this.controller.retryTimers?.get?.(playerId);
    if (nativeTimer) {
      clearTimeout(nativeTimer);
      this.controller.retryTimers.delete(playerId);
    }

    try {
      if (peer?.pc && typeof peer.pc.restartIce === 'function' && record.attempts <= 2 && peer.pc.signalingState === 'stable') {
        peer.pc.restartIce();
        peer.offerSent = false;
        record.lastAction = `ICE RESTART ${record.attempts}/${VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS}`;
        if (shouldInitiateVoiceOffer(this.controller.localPlayerId?.(), playerId)) {
          await this.controller.makeOffer?.(peer, { force: true });
        } else {
          this.controller.sendSignal?.(playerId, LIVE_VOICE_SIGNAL_KINDS.READY);
        }
      } else {
        this.controller.removePeer?.(playerId);
        const teammate = this.controller.teammates?.().find((entry) => entry.playerId === playerId);
        if (!teammate) throw new Error('peer-unavailable');
        const replacement = this.controller.ensurePeer?.(teammate);
        record.lastAction = `PEER REBUILD ${record.attempts}/${VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS}`;
        this.controller.sendSignal?.(playerId, LIVE_VOICE_SIGNAL_KINDS.READY);
        if (replacement && shouldInitiateVoiceOffer(this.controller.localPlayerId?.(), playerId)) {
          await this.controller.makeOffer?.(replacement, { force: true });
        }
      }
      this.controller.setStatus?.(`VOICE RECOVERY ${record.attempts}/${VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS} · ${record.displayName}`, false);
      return true;
    } catch {
      record.lastAction = 'RECOVERY FAILED';
      if (!manual && record.attempts >= VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS) {
        record.blocked = true;
        record.recovering = false;
        this.controller.setStatus?.('DIRECT VOICE CONNECTION BLOCKED · TURN MAY BE REQUIRED', true);
      }
      return false;
    } finally {
      this.render();
    }
  }

  retryAll(reason = 'manual', { resetBudget = true } = {}) {
    if (!this.controller?.active) return false;
    this.controller.setPttHeld?.(false);
    const teammates = this.controller.teammates?.() || [];
    teammates.forEach((entry) => {
      const record = this.recordFor(entry.playerId, entry.displayName);
      if (resetBudget) {
        record.attempts = 0;
        record.attemptWindowStartedAt = nowMs();
        record.blocked = false;
        record.nextRetryAt = 0;
      }
      const timer = this.repairTimers.get(entry.playerId);
      if (timer) clearTimeout(timer);
      this.repairTimers.delete(entry.playerId);
      this.schedulePeerRepair(entry.playerId, reason, { manual: resetBudget });
    });
    this.render();
    return teammates.length > 0;
  }

  clearRepairTimers() {
    this.repairTimers.forEach((timer) => clearTimeout(timer));
    this.repairTimers.clear();
  }

  async samplePeerStats(playerId, peer, record, now) {
    if (this.statsPending.has(playerId) || typeof peer?.pc?.getStats !== 'function') return;
    this.statsPending.add(playerId);
    record.lastStatsAt = now;
    try {
      const reports = await peer.pc.getStats();
      const aggregate = { packetsReceived: 0, packetsLost: 0, jitterMs: 0, rttMs: 0 };
      reports.forEach((report) => {
        if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio') && report.isRemote !== true) {
          aggregate.packetsReceived += Number(report.packetsReceived) || 0;
          aggregate.packetsLost += Number(report.packetsLost) || 0;
          aggregate.jitterMs = Math.max(aggregate.jitterMs, (Number(report.jitter) || 0) * 1000);
        }
        if (report.type === 'candidate-pair' && (report.selected === true || report.nominated === true) && report.state === 'succeeded') {
          aggregate.rttMs = Math.max(aggregate.rttMs, (Number(report.currentRoundTripTime) || 0) * 1000);
        }
      });
      record.metrics = normalizeVoiceQualityMetrics(aggregate);
      record.quality = classifyVoiceQuality(record.metrics);
    } catch {
      // Browser stats are optional diagnostics and never interrupt voice.
    } finally {
      this.statsPending.delete(playerId);
      this.render();
    }
  }

  render() {
    if (!this.root) return;
    const active = this.controller?.active === true;
    const teammates = this.controller?.teammates?.() || [];
    const records = teammates.map((entry) => {
      const record = this.recordFor(entry.playerId, entry.displayName);
      return { ...record };
    });
    const summary = summarizeVoiceHealth(records, { active, online: this.lastOnline });
    if (this.health) {
      this.health.textContent = summary.label;
      this.health.style.color = summary.state === 'blocked' ? '#ff8f8f' : summary.state === 'connected' ? '#8effb0' : '#ffe27a';
    }
    if (this.retryButton) {
      this.retryButton.disabled = !active || teammates.length === 0;
      this.retryButton.style.opacity = this.retryButton.disabled ? '.55' : '1';
    }
    if (this.details) {
      this.details.textContent = records.map((record) => {
        const metrics = record.metrics || {};
        const quality = record.state === 'connected' ? ` · ${record.quality.toUpperCase()} · ${Math.round(metrics.rttMs || 0)}ms · ${(metrics.lossPercent || 0).toFixed(1)}% loss` : '';
        const action = record.lastAction ? ` · ${record.lastAction}` : '';
        return `${record.displayName} · ${record.state.toUpperCase()}${quality}${action}`;
      }).join(' | ') || 'No teammate voice connection to diagnose.';
    }
  }

  getSnapshot() {
    const peers = [...this.records.values()].map((record) => Object.freeze({
      playerId: record.playerId,
      displayName: record.displayName,
      state: record.state,
      attempts: record.attempts,
      recovering: record.recovering,
      blocked: record.blocked,
      quality: record.quality,
      metrics: record.metrics,
      lastAction: record.lastAction,
    }));
    return Object.freeze({
      patch: LIVE_VOICE_RELIABILITY_PATCH,
      active: this.controller?.active === true,
      online: this.lastOnline,
      maxAutomaticRepairAttempts: VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS,
      turnRelayConfigured: false,
      peers: Object.freeze(peers),
      summary: summarizeVoiceHealth(peers, { active: this.controller?.active === true, online: this.lastOnline }),
    });
  }
}

const controller = new MultiplayerLiveVoiceReliability();
if (typeof window !== 'undefined') controller.initialize();
export { controller as multiplayerLiveVoiceReliability };
