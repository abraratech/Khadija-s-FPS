// js/multiplayer/fault_simulator.js

import { resolveMultiplayerDebugPolicy } from './release_guard_core.js';

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  outboundLatencyMs: 0,
  inboundLatencyMs: 0,
  jitterMs: 0,
  lossPercent: 0,
  duplicatePercent: 0,
  seed: 1337
});

export const MULTIPLAYER_FAULT_PRESETS = Object.freeze({
  clean: Object.freeze({ ...DEFAULT_CONFIG }),
  wifi: Object.freeze({
    enabled: true,
    outboundLatencyMs: 45,
    inboundLatencyMs: 45,
    jitterMs: 35,
    lossPercent: 1,
    duplicatePercent: 0.25,
    seed: 1337
  }),
  highLatency: Object.freeze({
    enabled: true,
    outboundLatencyMs: 180,
    inboundLatencyMs: 180,
    jitterMs: 90,
    lossPercent: 2,
    duplicatePercent: 0.5,
    seed: 1337
  }),
  lossy: Object.freeze({
    enabled: true,
    outboundLatencyMs: 80,
    inboundLatencyMs: 80,
    jitterMs: 55,
    lossPercent: 12,
    duplicatePercent: 1,
    seed: 1337
  }),
  chaos: Object.freeze({
    enabled: true,
    outboundLatencyMs: 240,
    inboundLatencyMs: 240,
    jitterMs: 180,
    lossPercent: 20,
    duplicatePercent: 4,
    seed: 7331
  })
});

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function debugAllowedFromEnvironment() {
  if (typeof window === 'undefined') return false;
  let storedDebug = false;
  try {
    storedDebug = window.localStorage?.getItem('khadija:mp-debug') === '1';
  } catch {
    storedDebug = false;
  }
  return resolveMultiplayerDebugPolicy({
    hostname: window.location?.hostname || '',
    search: window.location?.search || '',
    globalDebug: window.KHADIJA_MULTIPLAYER_DEBUG === true,
    storedDebug
  }).allowed;
}

export class MultiplayerFaultSimulator {
  constructor({ debugAllowed = debugAllowedFromEnvironment() } = {}) {
    this.debugAllowed = debugAllowed === true;
    this.config = { ...DEFAULT_CONFIG };
    this.runId = null;
    this.generation = 0;
    this.randomState = DEFAULT_CONFIG.seed >>> 0;
    this.timers = new Set();
    this.listeners = new Set();
    this.metrics = this.createMetrics();
  }

  static isDebugAllowed() {
    return debugAllowedFromEnvironment();
  }

  createMetrics() {
    return {
      outboundScheduled: 0,
      outboundDelivered: 0,
      outboundDropped: 0,
      outboundDuplicated: 0,
      inboundScheduled: 0,
      inboundDelivered: 0,
      inboundDropped: 0,
      inboundDuplicated: 0,
      transportRejected: 0,
      forcedDisconnects: 0,
      lastEvent: null,
      lastEventAt: null
    };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(kind, details = {}) {
    const event = {
      kind,
      at: Date.now(),
      runId: this.runId,
      details
    };
    this.metrics.lastEvent = kind;
    this.metrics.lastEventAt = event.at;
    this.listeners.forEach((listener) => {
      try { listener(event); } catch { /* Debug listeners must never break play. */ }
    });
  }

  normalizeConfig(next = {}) {
    return {
      enabled: next.enabled === true,
      outboundLatencyMs: Math.round(clamp(next.outboundLatencyMs, 0, 3000, 0)),
      inboundLatencyMs: Math.round(clamp(next.inboundLatencyMs, 0, 3000, 0)),
      jitterMs: Math.round(clamp(next.jitterMs, 0, 2000, 0)),
      lossPercent: clamp(next.lossPercent, 0, 95, 0),
      duplicatePercent: clamp(next.duplicatePercent, 0, 25, 0),
      seed: Math.max(1, Math.floor(clamp(next.seed, 1, 0x7fffffff, 1337)))
    };
  }

  configure(next = {}) {
    if (!this.debugAllowed) {
      this.config = { ...DEFAULT_CONFIG };
      return this.getSnapshot();
    }
    this.config = this.normalizeConfig({ ...this.config, ...next });
    this.randomState = this.config.seed >>> 0;
    this.emit('config-changed', { config: { ...this.config } });
    return this.getSnapshot();
  }

  applyPreset(name = 'clean') {
    const preset = MULTIPLAYER_FAULT_PRESETS[name] || MULTIPLAYER_FAULT_PRESETS.clean;
    return this.configure(preset);
  }

  beginRun(runId = null) {
    this.flush('begin-run');
    this.runId = runId || null;
    this.metrics = this.createMetrics();
    this.randomState = this.config.seed >>> 0;
    this.emit('run-started', { runId: this.runId });
  }

  endRun() {
    this.flush('end-run');
    this.emit('run-ended', { runId: this.runId });
    this.runId = null;
  }

  flush(reason = 'manual') {
    this.generation += 1;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.emit('queue-flushed', { reason });
  }

  nextRandom() {
    let x = this.randomState || 1;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 0x100000000;
  }

  shouldDrop() {
    return this.nextRandom() * 100 < this.config.lossPercent;
  }

  shouldDuplicate() {
    return this.nextRandom() * 100 < this.config.duplicatePercent;
  }

  delayFor(direction) {
    const base = direction === 'outbound'
      ? this.config.outboundLatencyMs
      : this.config.inboundLatencyMs;
    const jitter = this.config.jitterMs;
    const offset = jitter > 0 ? (this.nextRandom() * 2 - 1) * jitter : 0;
    return Math.max(0, Math.round(base + offset));
  }

  schedule(direction, label, callback, delay, { duplicate = false } = {}) {
    const generation = this.generation;
    const metricPrefix = direction === 'outbound' ? 'outbound' : 'inbound';
    this.metrics[`${metricPrefix}Scheduled`] += 1;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (generation !== this.generation) return;
      const accepted = callback() !== false;
      if (accepted) {
        this.metrics[`${metricPrefix}Delivered`] += 1;
      } else if (direction === 'outbound') {
        this.metrics.transportRejected += 1;
      }
      this.emit(`${direction}-delivered`, { label, delay, duplicate });
    }, delay);
    this.timers.add(timer);
  }

  dispatchOutbound(type, envelope, deliver) {
    if (!this.debugAllowed || !this.config.enabled) {
      return deliver(type, envelope);
    }
    const label = `${type || 'envelope'}#${envelope?.sequence ?? '?'}`;
    if (this.shouldDrop()) {
      this.metrics.outboundDropped += 1;
      this.emit('outbound-dropped', { label });
      return true;
    }
    const delay = this.delayFor('outbound');
    this.schedule('outbound', label, () => deliver(type, envelope), delay);
    if (this.shouldDuplicate()) {
      this.metrics.outboundDuplicated += 1;
      this.schedule(
        'outbound',
        label,
        () => deliver(type, envelope),
        delay + Math.max(8, Math.round(this.nextRandom() * 60)),
        { duplicate: true }
      );
    }
    return true;
  }

  interceptInbound(message, deliver) {
    if (!this.debugAllowed || !this.config.enabled) return false;
    const envelope = message?.payload || null;
    const label = `${envelope?.type || message?.type || 'envelope'}#${envelope?.sequence ?? '?'}`;
    if (this.shouldDrop()) {
      this.metrics.inboundDropped += 1;
      this.emit('inbound-dropped', { label });
      return true;
    }
    const delay = this.delayFor('inbound');
    this.schedule('inbound', label, deliver, delay);
    if (this.shouldDuplicate()) {
      this.metrics.inboundDuplicated += 1;
      this.schedule(
        'inbound',
        label,
        deliver,
        delay + Math.max(8, Math.round(this.nextRandom() * 60)),
        { duplicate: true }
      );
    }
    return true;
  }

  triggerDisconnect(transport) {
    if (!this.debugAllowed || !transport) return false;
    this.metrics.forcedDisconnects += 1;
    this.emit('forced-disconnect', { at: nowMs() });
    transport.closeSocket?.('fault-simulated-disconnect');
    return true;
  }

  clearMetrics() {
    this.metrics = this.createMetrics();
    this.emit('metrics-cleared');
  }

  getSnapshot() {
    return {
      debugAllowed: this.debugAllowed,
      active: this.debugAllowed && this.config.enabled,
      runId: this.runId,
      queuedPackets: this.timers.size,
      config: { ...this.config },
      metrics: { ...this.metrics }
    };
  }
}
