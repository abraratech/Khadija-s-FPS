// js/multiplayer/network_quality.js
const DEFAULT_PING_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_SAMPLES = 24;
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function rounded(value) { return Math.max(0, Math.round(Number(value) || 0)); }
export const NETWORK_QUALITY_LEVELS = Object.freeze({
  WAITING: 'WAITING', EXCELLENT: 'EXCELLENT', GOOD: 'GOOD', FAIR: 'FAIR',
  POOR: 'POOR', UNSTABLE: 'UNSTABLE', RECONNECTING: 'RECONNECTING'
});
export class NetworkQualityTracker {
  constructor({ pingIntervalMs = DEFAULT_PING_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS, maxSamples = DEFAULT_MAX_SAMPLES } = {}) {
    this.pingIntervalMs = Math.max(500, Number(pingIntervalMs) || 0);
    this.timeoutMs = Math.max(this.pingIntervalMs * 2, Number(timeoutMs) || 0);
    this.maxSamples = Math.max(6, Math.floor(maxSamples));
    this.reset();
  }
  reset(now = Date.now()) {
    this.pending = new Map(); this.rttSamples = []; this.pingsSent = 0;
    this.pongsReceived = 0; this.pingsLost = 0; this.lastPingAt = 0;
    this.lastPongAt = 0; this.lastEnvelopeAt = Number(now) || Date.now();
    this.lastQuality = NETWORK_QUALITY_LEVELS.WAITING;
  }
  markEnvelopeReceived(now = Date.now()) { this.lastEnvelopeAt = Number(now) || Date.now(); }
  shouldPing(now = Date.now()) { return Number(now) - this.lastPingAt >= this.pingIntervalMs; }
  startPing(pingId, now = Date.now()) {
    const id = String(pingId || ''); if (!id) return false;
    const sentAt = Number(now) || Date.now(); this.lastPingAt = sentAt;
    this.pingsSent += 1; this.pending.set(id, sentAt); return true;
  }
  recordPong(pingId, now = Date.now()) {
    const id = String(pingId || ''); if (!this.pending.has(id)) return null;
    const receivedAt = Number(now) || Date.now(); const sentAt = this.pending.get(id);
    this.pending.delete(id); const rtt = clamp(receivedAt - sentAt, 0, this.timeoutMs * 2);
    this.rttSamples.push(rtt);
    if (this.rttSamples.length > this.maxSamples) this.rttSamples.splice(0, this.rttSamples.length - this.maxSamples);
    this.pongsReceived += 1; this.lastPongAt = receivedAt; this.markEnvelopeReceived(receivedAt); return rtt;
  }
  prune(now = Date.now()) {
    const current = Number(now) || Date.now();
    for (const [pingId, sentAt] of this.pending.entries()) {
      if (current - sentAt < this.timeoutMs) continue;
      this.pending.delete(pingId); this.pingsLost += 1;
    }
  }
  getRttMs() { return average(this.rttSamples); }
  getJitterMs() {
    if (this.rttSamples.length < 2) return 0; const deltas = [];
    for (let i = 1; i < this.rttSamples.length; i += 1) deltas.push(Math.abs(this.rttSamples[i] - this.rttSamples[i - 1]));
    return average(deltas);
  }
  getPacketLossRatio() {
    const completed = this.pongsReceived + this.pingsLost;
    return completed ? clamp(this.pingsLost / completed, 0, 1) : 0;
  }
  getRecommendedInterpolationDelayMs() {
    const rtt = this.getRttMs(), jitter = this.getJitterMs(), loss = this.getPacketLossRatio();
    const base = 75 + jitter * 1.65 + Math.min(80, rtt * 0.18);
    return rounded(clamp(base + loss * 160, 75, 240));
  }
  classify(now = Date.now()) {
    const silenceMs = Math.max(0, (Number(now) || Date.now()) - this.lastEnvelopeAt);
    const rtt = this.getRttMs(), jitter = this.getJitterMs(), loss = this.getPacketLossRatio();
    if (silenceMs >= this.timeoutMs) return NETWORK_QUALITY_LEVELS.RECONNECTING;
    if (!this.pongsReceived) return NETWORK_QUALITY_LEVELS.WAITING;
    if (loss >= 0.2 || jitter >= 110 || rtt >= 500) return NETWORK_QUALITY_LEVELS.UNSTABLE;
    if (loss >= 0.1 || jitter >= 70 || rtt >= 330) return NETWORK_QUALITY_LEVELS.POOR;
    if (loss >= 0.05 || jitter >= 40 || rtt >= 210) return NETWORK_QUALITY_LEVELS.FAIR;
    if (loss <= 0.015 && jitter <= 18 && rtt <= 90) return NETWORK_QUALITY_LEVELS.EXCELLENT;
    return NETWORK_QUALITY_LEVELS.GOOD;
  }
  getSnapshot(now = Date.now()) {
    this.prune(now); const level = this.classify(now); this.lastQuality = level;
    return { level, rttMs: rounded(this.getRttMs()), jitterMs: rounded(this.getJitterMs()),
      packetLossPct: rounded(this.getPacketLossRatio() * 100),
      interpolationDelayMs: this.getRecommendedInterpolationDelayMs(),
      pendingPings: this.pending.size, pingsSent: this.pingsSent,
      pongsReceived: this.pongsReceived, pingsLost: this.pingsLost,
      silenceMs: rounded((Number(now) || Date.now()) - this.lastEnvelopeAt), lastPongAt: this.lastPongAt };
  }
}
