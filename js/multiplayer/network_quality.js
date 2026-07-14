// js/multiplayer/network_quality.js
// POST.1B R1.1 — relay-aware quality classification with warm-up and hysteresis.

const DEFAULT_PING_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_SAMPLES = 24;
const DEFAULT_WARMUP_MS = 3500;
const DEFAULT_WORSEN_HOLD_MS = 1800;
const DEFAULT_IMPROVE_HOLD_MS = 3500;

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
    warmupMs = DEFAULT_WARMUP_MS,
    worsenHoldMs = DEFAULT_WORSEN_HOLD_MS,
    improveHoldMs = DEFAULT_IMPROVE_HOLD_MS
  } = {}) {
    this.pingIntervalMs = Math.max(500, Number(pingIntervalMs) || 0);
    this.timeoutMs = Math.max(this.pingIntervalMs * 2, Number(timeoutMs) || 0);
    this.maxSamples = Math.max(6, Math.floor(maxSamples));
    this.warmupMs = Math.max(1200, Number(warmupMs) || 0);
    this.worsenHoldMs = Math.max(600, Number(worsenHoldMs) || 0);
    this.improveHoldMs = Math.max(1200, Number(improveHoldMs) || 0);
    this.reset();
  }

  reset(now = Date.now()) {
    const startedAt = Number(now);
    this.pending = new Map();
    this.rttSamples = [];
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
    this.rttSamples.push(rtt);
    if (this.rttSamples.length > this.maxSamples) {
      this.rttSamples.splice(0, this.rttSamples.length - this.maxSamples);
    }
    this.pongsReceived += 1;
    this.lastPongAt = receivedAt;
    this.markEnvelopeReceived(receivedAt);
    return rtt;
  }

  prune(now = Date.now()) {
    const current = Number(now) || Date.now();
    for (const [pingId, sentAt] of this.pending.entries()) {
      if (current - sentAt < this.timeoutMs) continue;
      this.pending.delete(pingId);
      this.pingsLost += 1;
    }
  }

  getRttMs() {
    return average(this.rttSamples);
  }

  getJitterMs() {
    if (this.rttSamples.length < 2) return 0;
    const deltas = [];
    for (let index = 1; index < this.rttSamples.length; index += 1) {
      deltas.push(Math.abs(this.rttSamples[index] - this.rttSamples[index - 1]));
    }
    return average(deltas);
  }

  getPacketLossRatio() {
    const completed = this.pongsReceived + this.pingsLost;
    return completed ? clamp(this.pingsLost / completed, 0, 1) : 0;
  }

  getRecommendedInterpolationDelayMs() {
    const rtt = this.getRttMs();
    const jitter = this.getJitterMs();
    const loss = this.getPacketLossRatio();
    const base = 75 + jitter * 1.65 + Math.min(80, rtt * 0.18);
    return rounded(clamp(base + loss * 160, 75, 240));
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

    const warmingUp = (
      this.pongsReceived < 3
      || current - this.startedAt < this.warmupMs
    );
    if (warmingUp) return NETWORK_QUALITY_LEVELS.WAITING;

    // These are peer-relay RTT thresholds, not local Wi-Fi/LAN thresholds.
    if (loss >= 0.25 || jitter >= 190 || rtt >= 900) {
      return NETWORK_QUALITY_LEVELS.UNSTABLE;
    }
    if (loss >= 0.12 || jitter >= 120 || rtt >= 600) {
      return NETWORK_QUALITY_LEVELS.POOR;
    }
    if (loss >= 0.05 || jitter >= 70 || rtt >= 350) {
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
      if (this.lastQuality === NETWORK_QUALITY_LEVELS.WAITING) return raw;
      return this.lastQuality;
    }

    if (this.lastQuality === NETWORK_QUALITY_LEVELS.WAITING) {
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
      warmupComplete: this.pongsReceived >= 3
        && (Number(now) || Date.now()) - this.startedAt >= this.warmupMs,
      sampleCount: this.rttSamples.length,
      rttMs: rounded(this.getRttMs()),
      jitterMs: rounded(this.getJitterMs()),
      packetLossPct: rounded(this.getPacketLossRatio() * 100),
      interpolationDelayMs: this.getRecommendedInterpolationDelayMs(),
      pendingPings: this.pending.size,
      pingsSent: this.pingsSent,
      pongsReceived: this.pongsReceived,
      pingsLost: this.pingsLost,
      silenceMs: rounded((Number(now) || Date.now()) - this.lastEnvelopeAt),
      lastPongAt: this.lastPongAt
    };
  }
}
