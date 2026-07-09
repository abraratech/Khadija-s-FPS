// js/multiplayer/snapshot_buffer.js

const DEFAULT_INTERPOLATION_DELAY_MS = 100;
const DEFAULT_MAX_SNAPSHOTS_PER_PLAYER = 32;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function lerp(a, b, alpha) {
  return Number(a || 0) + (Number(b || 0) - Number(a || 0)) * alpha;
}

function lerpAngle(a, b, alpha) {
  const start = Number(a || 0);
  const end = Number(b || 0);
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * alpha;
}

function lerpVector(a, b, alpha) {
  return {
    x: lerp(a?.x, b?.x, alpha),
    y: lerp(a?.y, b?.y, alpha),
    z: lerp(a?.z, b?.z, alpha)
  };
}

function interpolateState(a, b, alpha) {
  if (!a) return b || null;
  if (!b) return a;

  return {
    ...a,
    ...b,
    position: lerpVector(a.position, b.position, alpha),
    velocity: lerpVector(a.velocity, b.velocity, alpha),
    yaw: lerpAngle(a.yaw, b.yaw, alpha),
    pitch: lerp(a.pitch, b.pitch, alpha),
    health: alpha < 0.5 ? a.health : b.health,
    maxHealth: alpha < 0.5 ? a.maxHealth : b.maxHealth,
    alive: alpha < 0.5 ? a.alive : b.alive,
    onGround: alpha < 0.5 ? a.onGround : b.onGround,
    isADS: alpha < 0.5 ? a.isADS : b.isADS,
    isSprinting: alpha < 0.5 ? a.isSprinting : b.isSprinting,
    reloading: alpha < 0.5 ? a.reloading : b.reloading,
    currentWeaponIdx: alpha < 0.5 ? a.currentWeaponIdx : b.currentWeaponIdx,
    weaponKey: alpha < 0.5 ? a.weaponKey : b.weaponKey
  };
}

export class RemoteSnapshotBuffer {
  constructor({
    interpolationDelayMs = DEFAULT_INTERPOLATION_DELAY_MS,
    maxSnapshotsPerPlayer = DEFAULT_MAX_SNAPSHOTS_PER_PLAYER
  } = {}) {
    this.interpolationDelayMs = Math.max(0, Number(interpolationDelayMs) || 0);
    this.maxSnapshotsPerPlayer = Math.max(4, Math.floor(maxSnapshotsPerPlayer));
    this.buffers = new Map();
    this.latestSequences = new Map(); this.connectionEpochs = new Map();
  }

  push(playerId, { sequence, connectionEpoch = 0, sentAt = nowMs(), receivedAt = nowMs(), state } = {}) {
    if (!playerId || !state || !Number.isInteger(sequence) || sequence < 0) {
      return { accepted: false, reason: 'invalid-snapshot' };
    } const normalizedConnectionEpoch = Math.max(
      0,
      Math.floor(Number(connectionEpoch) || 0)
    );
    const previousConnectionEpoch = this.connectionEpochs.get(playerId);
    if (
      previousConnectionEpoch !== undefined
      && normalizedConnectionEpoch < previousConnectionEpoch
    ) {
      return { accepted: false, reason: 'stale-connection-epoch' };
    }
    const reset = (
      previousConnectionEpoch !== undefined
      && normalizedConnectionEpoch > previousConnectionEpoch
    );
    if (reset) {
      this.buffers.delete(playerId);
      this.latestSequences.delete(playerId);
    }
    this.connectionEpochs.set(playerId, normalizedConnectionEpoch);
    const latestSequence = this.latestSequences.get(playerId) ?? -1;
    if (sequence <= latestSequence) {
      return { accepted: false, reason: 'stale-sequence' };
    }

    const entry = {
      sequence,
      sentAt: Number(sentAt) || receivedAt,
      receivedAt: Number(receivedAt) || nowMs(),
      state
    };

    const buffer = this.buffers.get(playerId) || [];
    buffer.push(entry);
    buffer.sort((a, b) => a.sentAt - b.sentAt || a.sequence - b.sequence);

    while (buffer.length > this.maxSnapshotsPerPlayer) {
      buffer.shift();
    }

    this.buffers.set(playerId, buffer);
    this.latestSequences.set(playerId, sequence);

    return { accepted: true, entry, reset };
  }

  sample(playerId, now = nowMs()) {
    const buffer = this.buffers.get(playerId);
    if (!buffer || buffer.length === 0) return null;

    const targetTime = now - this.interpolationDelayMs;

    if (buffer.length === 1 || targetTime <= buffer[0].sentAt) {
      return {
        playerId,
        sequence: buffer[0].sequence,
        state: buffer[0].state,
        interpolated: false
      };
    }

    const latest = buffer[buffer.length - 1];
    if (targetTime >= latest.sentAt) {
      return {
        playerId,
        sequence: latest.sequence,
        state: latest.state,
        interpolated: false
      };
    }

    for (let index = 1; index < buffer.length; index += 1) {
      const right = buffer[index];
      if (right.sentAt < targetTime) continue;

      const left = buffer[index - 1];
      const span = Math.max(1, right.sentAt - left.sentAt);
      const alpha = Math.max(0, Math.min(1, (targetTime - left.sentAt) / span));

      return {
        playerId,
        sequence: right.sequence,
        state: interpolateState(left.state, right.state, alpha),
        interpolated: true,
        alpha
      };
    }

    return null;
  }

  removePlayer(playerId) {
    this.buffers.delete(playerId);
    this.latestSequences.delete(playerId); this.connectionEpochs.delete(playerId);
  }

  clear() {
    this.buffers.clear();
    this.latestSequences.clear(); this.connectionEpochs.clear();
  }

  getSnapshot() {
    return Array.from(this.buffers.entries(), ([playerId, entries]) => ({
      playerId,
      count: entries.length,
      latestSequence: this.latestSequences.get(playerId) ?? -1, connectionEpoch: this.connectionEpochs.get(playerId) ?? 0
    }));
  }
}
