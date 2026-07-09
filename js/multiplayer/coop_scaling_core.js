// js/multiplayer/coop_scaling_core.js
const PLAYER_PROFILES = Object.freeze({
  1: Object.freeze({
    playerCount: 1,
    enemyHealthScale: 1.00,
    waveCountScale: 1.00,
    spawnIntervalScale: 1.00,
    activeCapBonus: 0
  }),
  2: Object.freeze({
    playerCount: 2,
    enemyHealthScale: 1.22,
    waveCountScale: 1.30,
    spawnIntervalScale: 0.88,
    activeCapBonus: 4
  }),
  3: Object.freeze({
    playerCount: 3,
    enemyHealthScale: 1.42,
    waveCountScale: 1.55,
    spawnIntervalScale: 0.78,
    activeCapBonus: 7
  }),
  4: Object.freeze({
    playerCount: 4,
    enemyHealthScale: 1.60,
    waveCountScale: 1.80,
    spawnIntervalScale: 0.70,
    activeCapBonus: 10
  })
});

const context = {
  online: false,
  playerCount: 1
};

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCoopPlayerCount(value) {
  return Math.max(1, Math.min(4, Math.floor(finite(value, 1))));
}

export function setCoopScalingContext({
  online = false,
  playerCount = 1
} = {}) {
  context.online = online === true;
  context.playerCount = context.online
    ? normalizeCoopPlayerCount(playerCount)
    : 1;
  return getCoopScalingProfile();
}

export function getCoopScalingProfile() {
  const count = context.online ? context.playerCount : 1;
  return { ...PLAYER_PROFILES[count] };
}

export function getLateJoinCatchUpScore(wave = 1) {
  const normalizedWave = Math.max(1, Math.floor(finite(wave, 1)));
  return Math.max(
    500,
    Math.min(3500, 500 + (normalizedWave - 1) * 250)
  );
}

export function isLateJoinProtected(roomPlayer, now = Date.now()) {
  if (!roomPlayer || roomPlayer.connected === false) return false;
  const protectedUntil = Math.max(
    0,
    finite(roomPlayer.lateJoinProtectionUntil)
  );
  return protectedUntil > finite(now, Date.now());
}

export function getCoopScalingSnapshot() {
  return {
    online: context.online,
    ...getCoopScalingProfile()
  };
}
