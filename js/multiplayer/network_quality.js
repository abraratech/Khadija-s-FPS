// js/multiplayer/network_quality.js
// MPNET.1 R1 — rolling relay measurements with sustained degradation hysteresis.

const DEFAULT_PING_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_SAMPLES = 30;
const DEFAULT_SAMPLE_WINDOW_MS = 30_000;
const DEFAULT_WARMUP_MS = 6000;
const DEFAULT_WORSEN_HOLD_MS = 7000;
const DEFAULT_IMPROVE_HOLD_MS = 5000;
const DEFAULT_MIN_COMPLETED_SAMPLES = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function rounded(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export const NETWORK_QUALITY_LEVELS = Object.freeze({
  WAITING: 'WAITING',
  EXCELLENT: 'EXCELLENT',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  POOR: 'POOR',
  UNSTABLE: 'UNSTABLE',
  RECONNECTING: 'RECONNECTING'
});

const QUALITY_RANK = Object.freeze({
  WAITING: -1,
  EXCELLENT: 0,
  GOOD: 1,
  FAIR: 2,
  POOR: 3,
  UNSTABLE: 4,
  RECONNECTING: 5
});

export class NetworkQualityTracker {
  constructor({
    pingIntervalMs = DEFAULT_PING_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxSamples = DEFAULT_MAX_SAMPLES,
    sampleWindowMs = DEFAULT_SAMPLE_WINDOW_MS,
    warmupMs = DEFAULT_WARMUP_MS,
    worsenHoldMs = DEFAULT_WORSEN_HOLD_MS,
    improveHoldMs = DEFAULT_IMPROVE_HOLD_MS,
    minCompletedSamples = DEFAULT_MIN_COMPLETED_SAMPLES
  } = {}) {
    this.pingIntervalMs = Math.max(500, Number(pingIntervalMs) || 0);
    this.timeoutMs = Math.max(this.pingIntervalMs * 2, Number(timeoutMs) || 0);
    this.maxSamples = Math.max(6, Math.floor(maxSamples));
    this.sampleWindowMs = Math.max(10_000, Number(sampleWindowMs) || 0);
    this.warmupMs = Math.max(1200, Number(warmupMs) || 0);
    this.worsenHoldMs = Math.max(600, Number(worsenHoldMs) || 0);
    this.improveHoldMs = Math.max(1200, Number(improveHoldMs) || 0);
    this.minCompletedSamples = Math.max(3, Math.floor(minCompletedSamples));
    this.reset();
  }

  reset(now = Date.now()) {
    const startedAt = Number(now);
    this.pending = new Map();
    this.outcomes = [];
    this.pingsSent = 0;
    this.pongsReceived = 0;
    this.pingsLost = 0;
    this.lastPingAt = 0;
    this.lastPongAt = 0;
    this.lastEnvelopeAt = Number.isFinite(startedAt) ? startedAt : Date.now();
    this.startedAt = this.lastEnvelopeAt;
    this.lastQuality = NETWORK_QUALITY_LEVELS.WAITING;
    this.candidateQuality = null;
    this.candidateSince = 0;
  }

  markEnvelopeReceived(now = Date.now()) {
    const value = Number(now);
    this.lastEnvelopeAt = Number.isFinite(value) ? value : Date.now();
  }

  shouldPing(now = Date.now()) {
    return Number(now) - this.lastPingAt >= this.pingIntervalMs;
  }

  startPing(pingId, now = Date.now()) {
    const id = String(pingId || '');
    if (!id) return false;
    const value = Number(now);
    const sentAt = Number.isFinite(value) ? value : Date.now();
    this.lastPingAt = sentAt;
    this.pingsSent += 1;
    this.pending.set(id, sentAt);
    return true;
  }

  recordPong(pingId, now = Date.now()) {
    const id = String(pingId || '');
    if (!this.pending.has(id)) return null;
    const value = Number(now);
    const receivedAt = Number.isFinite(value) ? value : Date.now();
    const sentAt = this.pending.get(id);
    this.pending.delete(id);
    const rtt = clamp(receivedAt - sentAt, 0, this.timeoutMs * 2);
    this.outcomes.push({ at: receivedAt, lost: false, rtt });
    this.pongsReceived += 1;
    this.lastPongAt = receivedAt;
    this.markEnvelopeReceived(receivedAt);
    this.prune(receivedAt);
    return rtt;
  }

  prune(now = Date.now()) {
    const current = Number(now) || Date.now();
    for (const [pingId, sentAt] of this.pending.entries()) {
      if (current - sentAt < this.timeoutMs) continue;
      this.pending.delete(pingId);
      this.pingsLost += 1;
      this.outcomes.push({ at: current, lost: true, rtt: null });
    }
    const cutoff = current - this.sampleWindowMs;
    this.outcomes = this.outcomes
      .filter((entry) => entry.at >= cutoff)
      .slice(-this.maxSamples);
  }

  successfulOutcomes() {
    return this.outcomes.filter((entry) => entry.lost !== true && Number.isFinite(entry.rtt));
  }

  getRttMs() {
    return average(this.successfulOutcomes().map((entry) => entry.rtt));
  }

  getJitterMs() {
    const samples = this.successfulOutcomes().map((entry) => entry.rtt);
    if (samples.length < 2) return 0;
    const deltas = [];
    for (let index = 1; index < samples.length; index += 1) {
      deltas.push(Math.abs(samples[index] - samples[index - 1]));
    }
    return average(deltas);
  }

  getPacketLossRatio() {
    return this.outcomes.length
      ? clamp(this.outcomes.filter((entry) => entry.lost === true).length / this.outcomes.length, 0, 1)
      : 0;
  }

  getRecommendedInterpolationDelayMs() {
    const rtt = this.getRttMs();
    const jitter = this.getJitterMs();
    const loss = this.getPacketLossRatio();
    const base = 75 + jitter * 1.5 + Math.min(80, rtt * 0.18);
    return rounded(clamp(base + loss * 150, 75, 240));
  }

  warmupComplete(now = Date.now()) {
    return this.outcomes.length >= this.minCompletedSamples
      && (Number(now) || Date.now()) - this.startedAt >= this.warmupMs;
  }

  classifyRaw(now = Date.now()) {
    const current = Number(now) || Date.now();
    const silenceMs = Math.max(0, current - this.lastEnvelopeAt);
    const rtt = this.getRttMs();
    const jitter = this.getJitterMs();
    const loss = this.getPacketLossRatio();

    if (silenceMs >= this.timeoutMs) {
      return NETWORK_QUALITY_LEVELS.RECONNECTING;
    }
    if (!this.warmupComplete(current)) return NETWORK_QUALITY_LEVELS.WAITING;

    if (loss >= 0.22 || jitter >= 180 || rtt >= 900) {
      return NETWORK_QUALITY_LEVELS.UNSTABLE;
    }
    if (loss >= 0.10 || jitter >= 110 || rtt >= 600) {
      return NETWORK_QUALITY_LEVELS.POOR;
    }
    if (loss >= 0.04 || jitter >= 65 || rtt >= 350) {
      return NETWORK_QUALITY_LEVELS.FAIR;
    }
    if (loss <= 0.015 && jitter <= 24 && rtt <= 140) {
      return NETWORK_QUALITY_LEVELS.EXCELLENT;
    }
    return NETWORK_QUALITY_LEVELS.GOOD;
  }

  classify(now = Date.now()) {
    const current = Number(now) || Date.now();
    const raw = this.classifyRaw(current);

    if (raw === NETWORK_QUALITY_LEVELS.RECONNECTING) {
      this.lastQuality = raw;
      this.candidateQuality = null;
      this.candidateSince = 0;
      return raw;
    }
    if (raw === NETWORK_QUALITY_LEVELS.WAITING) {
      return this.lastQuality === NETWORK_QUALITY_LEVELS.WAITING
        ? raw
        : this.lastQuality;
    }

    if (this.lastQuality === NETWORK_QUALITY_LEVELS.WAITING) {
      const degraded = QUALITY_RANK[raw] >= QUALITY_RANK[NETWORK_QUALITY_LEVELS.FAIR];
      if (!degraded) {
        this.lastQuality = raw;
        return raw;
      }
      if (this.candidateQuality !== raw) {
        this.candidateQuality = raw;
        this.candidateSince = current;
        return NETWORK_QUALITY_LEVELS.WAITING;
      }
      if (current - this.candidateSince < this.worsenHoldMs) {
        return NETWORK_QUALITY_LEVELS.WAITING;
      }
      this.lastQuality = raw;
      this.candidateQuality = null;
      this.candidateSince = 0;
      return raw;
    }

    if (raw === this.lastQuality) {
      this.candidateQuality = null;
      this.candidateSince = 0;
      return this.lastQuality;
    }
    if (this.candidateQuality !== raw) {
      this.candidateQuality = raw;
      this.candidateSince = current;
      return this.lastQuality;
    }

    const worsening = QUALITY_RANK[raw] > QUALITY_RANK[this.lastQuality];
    const requiredHold = worsening ? this.worsenHoldMs : this.improveHoldMs;
    if (current - this.candidateSince >= requiredHold) {
      this.lastQuality = raw;
      this.candidateQuality = null;
      this.candidateSince = 0;
    }
    return this.lastQuality;
  }

  getSnapshot(now = Date.now()) {
    this.prune(now);
    const rawLevel = this.classifyRaw(now);
    const level = this.classify(now);
    return {
      level,
      rawLevel,
      measurementKind: 'PEER_RELAY_RTT',
      warmupComplete: this.warmupComplete(now),
      sampleCount: this.successfulOutcomes().length,
      completedSamples: this.outcomes.length,
      sampleWindowMs: this.sampleWindowMs,
      rttMs: rounded(this.getRttMs()),
      jitterMs: rounded(this.getJitterMs()),
      packetLossPct: rounded(this.getPacketLossRatio() * 100),
      interpolationDelayMs: this.getRecommendedInterpolationDelayMs(),
      pendingPings: this.pending.size,
      pingsSent: this.pingsSent,
      pongsReceived: this.pongsReceived,
      pingsLost: this.pingsLost,
      silenceMs: rounded((Number(now) || Date.now()) - this.lastEnvelopeAt),
      lastPongAt: this.lastPongAt,
      candidateLevel: this.candidateQuality,
      candidateForMs: this.candidateQuality
        ? rounded((Number(now) || Date.now()) - this.candidateSince)
        : 0
    };
  }
}
