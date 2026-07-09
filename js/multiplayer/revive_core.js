// js/multiplayer/revive_core.js
export const MULTIPLAYER_LIFE_STATES = Object.freeze({
  ACTIVE: 'ACTIVE',
  DOWNED: 'DOWNED',
  SPECTATING: 'SPECTATING'
});

const DEFAULT_BLEEDOUT_MS = 30_000;
const DEFAULT_REVIVE_HOLD_MS = 3_000;
const DEFAULT_REVIVE_RANGE = 3.2;
const DEFAULT_HOLD_STALE_MS = 420;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function position(value = {}) {
  const source = value || {};
  return {
    x: finite(source.x),
    y: finite(source.y),
    z: finite(source.z)
  };
}

function distanceSquared(a, b) {
  const dx = finite(a?.x) - finite(b?.x);
  const dy = finite(a?.y) - finite(b?.y);
  const dz = finite(a?.z) - finite(b?.z);
  return dx * dx + dy * dy + dz * dz;
}

function clonePlayer(player) {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    connected: player.connected === true,
    lifeState: player.lifeState,
    health: finite(player.health),
    maxHealth: Math.max(1, finite(player.maxHealth, 100)),
    position: position(player.position),
    downedAt: finite(player.downedAt),
    bleedoutEndsAt: finite(player.bleedoutEndsAt),
    reviveProgressMs: Math.max(0, finite(player.reviveProgressMs)),
    eliminatedWave: Math.max(0, Math.floor(finite(player.eliminatedWave))),
    respawnNonce: Math.max(0, Math.floor(finite(player.respawnNonce))),
    updatedAt: finite(player.updatedAt)
  };
}

export class ReviveAuthority {
  constructor({
    bleedoutMs = DEFAULT_BLEEDOUT_MS,
    reviveHoldMs = DEFAULT_REVIVE_HOLD_MS,
    reviveRange = DEFAULT_REVIVE_RANGE,
    holdStaleMs = DEFAULT_HOLD_STALE_MS
  } = {}) {
    this.bleedoutMs = Math.max(5_000, finite(bleedoutMs, DEFAULT_BLEEDOUT_MS));
    this.reviveHoldMs = Math.max(500, finite(reviveHoldMs, DEFAULT_REVIVE_HOLD_MS));
    this.reviveRange = Math.max(1, finite(reviveRange, DEFAULT_REVIVE_RANGE));
    this.holdStaleMs = Math.max(100, finite(holdStaleMs, DEFAULT_HOLD_STALE_MS));
    this.players = new Map();
    this.holds = new Map();
    this.events = [];
    this.runId = null;
    this.wave = 1;
    this.teamEliminated = false;
  }

  reset({ runId = null, wave = 1 } = {}) {
    this.players.clear();
    this.holds.clear();
    this.events.length = 0;
    this.runId = runId || null;
    this.wave = Math.max(1, Math.floor(finite(wave, 1)));
    this.teamEliminated = false;
  }

  ensurePlayer(playerId, details = {}) {
    if (!playerId) return null;
    let player = this.players.get(playerId);
    if (!player) {
      player = {
        playerId: String(playerId),
        displayName: String(details.displayName || 'Player').slice(0, 24),
        connected: details.connected !== false,
        lifeState: MULTIPLAYER_LIFE_STATES.ACTIVE,
        health: Math.max(1, finite(details.health, 100)),
        maxHealth: Math.max(1, finite(details.maxHealth, 100)),
        position: position(details.position),
        downedAt: 0,
        bleedoutEndsAt: 0,
        reviveProgressMs: 0,
        eliminatedWave: 0,
        respawnNonce: 0,
        updatedAt: finite(details.now)
      };
      this.players.set(player.playerId, player);
    } else {
      if (details.displayName) {
        player.displayName = String(details.displayName).slice(0, 24);
      }
      if (details.connected !== undefined) {
        player.connected = details.connected === true;
      }
      if (details.position) player.position = position(details.position);
      if (details.maxHealth !== undefined) {
        player.maxHealth = Math.max(1, finite(details.maxHealth, player.maxHealth));
      }
      if (
        details.health !== undefined
        && player.lifeState === MULTIPLAYER_LIFE_STATES.ACTIVE
      ) {
        player.health = Math.max(0, finite(details.health, player.health));
      }
      player.updatedAt = finite(details.now, player.updatedAt);
    }
    return player;
  }

  setConnected(playerId, connected, now = 0) {
    const player = this.ensurePlayer(playerId, { connected, now });
    if (!player) return false;
    player.connected = connected === true;
    player.updatedAt = finite(now, player.updatedAt);
    if (!player.connected) {
      this.holds.delete(playerId);
      for (const [reviverId, hold] of this.holds) {
        if (hold.targetPlayerId === playerId) this.holds.delete(reviverId);
      }
    }
    return true;
  }

  updatePlayer(playerId, details = {}) {
    return this.ensurePlayer(playerId, details);
  }

  downPlayer(playerId, {
    now = 0,
    wave = this.wave,
    position: playerPosition = null,
    displayName = null
  } = {}) {
    const player = this.ensurePlayer(playerId, {
      now,
      position: playerPosition,
      displayName
    });
    if (!player || player.lifeState !== MULTIPLAYER_LIFE_STATES.ACTIVE) {
      return false;
    }
    player.lifeState = MULTIPLAYER_LIFE_STATES.DOWNED;
    player.health = 0;
    player.downedAt = finite(now);
    player.bleedoutEndsAt = finite(now) + this.bleedoutMs;
    player.reviveProgressMs = 0;
    player.eliminatedWave = Math.max(1, Math.floor(finite(wave, this.wave)));
    player.updatedAt = finite(now);
    this.events.push({ type: 'DOWNED', playerId: player.playerId });
    this.teamEliminated = false;
    return true;
  }

  setReviveHold(reviverId, targetPlayerId, {
    holding = true,
    now = 0,
    position: reviverPosition = null
  } = {}) {
    if (!reviverId) return false;
    if (!holding || !targetPlayerId) {
      this.holds.delete(String(reviverId));
      return true;
    }
    this.holds.set(String(reviverId), {
      reviverId: String(reviverId),
      targetPlayerId: String(targetPlayerId),
      position: position(reviverPosition),
      updatedAt: finite(now)
    });
    return true;
  }

  replaceSnapshot(snapshot = {}) {
    if (!Array.isArray(snapshot.players)) return false;
    this.runId = snapshot.runId || this.runId;
    this.wave = Math.max(1, Math.floor(finite(snapshot.wave, this.wave)));
    this.teamEliminated = snapshot.teamEliminated === true;
    const next = new Map();
    snapshot.players.forEach((entry) => {
      if (!entry?.playerId) return;
      const lifeState = Object.values(MULTIPLAYER_LIFE_STATES).includes(
        entry.lifeState
      ) ? entry.lifeState : MULTIPLAYER_LIFE_STATES.ACTIVE;
      next.set(String(entry.playerId), {
        playerId: String(entry.playerId),
        displayName: String(entry.displayName || 'Player').slice(0, 24),
        connected: entry.connected !== false,
        lifeState,
        health: Math.max(0, finite(entry.health)),
        maxHealth: Math.max(1, finite(entry.maxHealth, 100)),
        position: position(entry.position),
        downedAt: finite(entry.downedAt),
        bleedoutEndsAt: finite(entry.bleedoutEndsAt),
        reviveProgressMs: Math.max(0, finite(entry.reviveProgressMs)),
        eliminatedWave: Math.max(0, Math.floor(finite(entry.eliminatedWave))),
        respawnNonce: Math.max(0, Math.floor(finite(entry.respawnNonce))),
        updatedAt: finite(entry.updatedAt)
      });
    });
    this.players = next;
    return true;
  }

  update({
    now = 0,
    dtMs = 0,
    wave = this.wave
  } = {}) {
    const currentNow = finite(now);
    const stepMs = Math.max(0, Math.min(250, finite(dtMs)));
    const nextWave = Math.max(1, Math.floor(finite(wave, this.wave)));
    const waveAdvanced = nextWave > this.wave;
    this.wave = nextWave;

    this.players.forEach((player) => {
      if (
        player.lifeState === MULTIPLAYER_LIFE_STATES.DOWNED
        && currentNow >= player.bleedoutEndsAt
      ) {
        player.lifeState = MULTIPLAYER_LIFE_STATES.SPECTATING;
        player.health = 0;
        player.reviveProgressMs = 0;
        player.eliminatedWave = Math.max(player.eliminatedWave, this.wave);
        player.updatedAt = currentNow;
        this.events.push({ type: 'BLEEDOUT', playerId: player.playerId });
      }
    });

    const activeConnectedBeforeRespawn = Array.from(this.players.values())
      .some((player) => (
        player.connected
        && player.lifeState === MULTIPLAYER_LIFE_STATES.ACTIVE
      ));

    if (waveAdvanced && activeConnectedBeforeRespawn) {
      this.players.forEach((player) => {
        if (
          player.connected
          && player.lifeState === MULTIPLAYER_LIFE_STATES.SPECTATING
          && this.wave > player.eliminatedWave
        ) {
          player.lifeState = MULTIPLAYER_LIFE_STATES.ACTIVE;
          player.health = player.maxHealth;
          player.reviveProgressMs = 0;
          player.downedAt = 0;
          player.bleedoutEndsAt = 0;
          player.respawnNonce += 1;
          player.updatedAt = currentNow;
          this.events.push({ type: 'RESPAWN', playerId: player.playerId });
        }
      });
    }

    const validTargets = new Map();
    for (const [reviverId, hold] of this.holds) {
      if (currentNow - hold.updatedAt > this.holdStaleMs) {
        this.holds.delete(reviverId);
        continue;
      }
      const reviver = this.players.get(reviverId);
      const target = this.players.get(hold.targetPlayerId);
      if (
        !reviver?.connected
        || !target?.connected
        || reviver.lifeState !== MULTIPLAYER_LIFE_STATES.ACTIVE
        || target.lifeState !== MULTIPLAYER_LIFE_STATES.DOWNED
      ) {
        this.holds.delete(reviverId);
        continue;
      }
      if (
        distanceSquared(reviver.position, target.position)
        > this.reviveRange * this.reviveRange
      ) {
        continue;
      }
      if (!validTargets.has(target.playerId)) {
        validTargets.set(target.playerId, reviverId);
      }
    }

    this.players.forEach((target) => {
      if (target.lifeState !== MULTIPLAYER_LIFE_STATES.DOWNED) return;
      if (validTargets.has(target.playerId)) {
        target.reviveProgressMs = Math.min(
          this.reviveHoldMs,
          target.reviveProgressMs + stepMs
        );
        if (target.reviveProgressMs >= this.reviveHoldMs) {
          target.lifeState = MULTIPLAYER_LIFE_STATES.ACTIVE;
          target.health = Math.max(1, Math.round(target.maxHealth * 0.4));
          target.reviveProgressMs = 0;
          target.downedAt = 0;
          target.bleedoutEndsAt = 0;
          target.updatedAt = currentNow;
          this.events.push({
            type: 'REVIVED',
            playerId: target.playerId,
            reviverId: validTargets.get(target.playerId) || null
          });
          for (const [reviverId, hold] of this.holds) {
            if (hold.targetPlayerId === target.playerId) {
              this.holds.delete(reviverId);
            }
          }
        }
      } else if (target.reviveProgressMs > 0) {
        target.reviveProgressMs = 0;
      }
    });

    const connected = Array.from(this.players.values())
      .filter((player) => player.connected);
    const eliminated = (
      connected.length > 0
      && connected.every((player) => (
        player.lifeState === MULTIPLAYER_LIFE_STATES.SPECTATING
      ))
    );
    if (eliminated && !this.teamEliminated) {
      this.teamEliminated = true;
      this.events.push({ type: 'TEAM_ELIMINATED' });
    } else if (!eliminated) {
      this.teamEliminated = false;
    }

    return this.getSnapshot(currentNow);
  }

  consumeEvents() {
    return this.events.splice(0);
  }

  getSnapshot(now = 0) {
    return {
      runId: this.runId,
      wave: this.wave,
      serverTime: finite(now),
      bleedoutMs: this.bleedoutMs,
      reviveHoldMs: this.reviveHoldMs,
      reviveRange: this.reviveRange,
      teamEliminated: this.teamEliminated,
      players: Array.from(this.players.values(), clonePlayer)
    };
  }
}
