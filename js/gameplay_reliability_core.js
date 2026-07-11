// js/gameplay_reliability_core.js
export const GAMEPLAY_RELIABILITY_PATCH = 'm4-gameplay-reliability-r1';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum, fallback = minimum) {
  return Math.max(minimum, Math.min(maximum, finite(value, fallback)));
}

export function normalizeLifeState(value = 'ACTIVE') {
  const token = String(value || 'ACTIVE').trim().toUpperCase();
  if (token === 'DOWNED') return 'DOWNED';
  if (token === 'SPECTATING' || token === 'ELIMINATED') return 'SPECTATING';
  return 'ACTIVE';
}

export function normalizePlayerReliabilityState({
  health = 100,
  maxHealth = 100,
  alive = true,
  lifeState = 'ACTIVE'
} = {}) {
  const normalizedLifeState = normalizeLifeState(lifeState);
  const safeMaxHealth = clamp(maxHealth, 1, 10000, 100);
  let safeHealth = clamp(health, 0, safeMaxHealth, safeMaxHealth);
  let safeAlive = alive === true;
  const reasons = [];

  if (normalizedLifeState !== 'ACTIVE') {
    if (safeHealth !== 0) reasons.push('non-active-health');
    if (safeAlive) reasons.push('non-active-alive');
    safeHealth = 0;
    safeAlive = false;
  } else if (safeHealth <= 0 && safeAlive) {
    reasons.push('zero-health-alive');
    safeAlive = false;
  }

  if (!Number.isFinite(Number(health))) reasons.push('invalid-health');
  if (!Number.isFinite(Number(maxHealth)) || Number(maxHealth) <= 0) {
    reasons.push('invalid-max-health');
  }

  return Object.freeze({
    health: safeHealth,
    maxHealth: safeMaxHealth,
    alive: safeAlive,
    lifeState: normalizedLifeState,
    corrected: reasons.length > 0,
    reasons: Object.freeze(reasons)
  });
}

export function isFiniteVector3(value) {
  return Boolean(
    value
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.y))
    && Number.isFinite(Number(value.z))
  );
}

export function isPlayerPositionSafe(
  value,
  {
    horizontalLimit = 120,
    minimumY = -12,
    maximumY = 80
  } = {}
) {
  if (!isFiniteVector3(value)) return false;
  return (
    Math.abs(Number(value.x)) <= Math.max(1, finite(horizontalLimit, 120))
    && Math.abs(Number(value.z)) <= Math.max(1, finite(horizontalLimit, 120))
    && Number(value.y) >= finite(minimumY, -12)
    && Number(value.y) <= finite(maximumY, 80)
  );
}

export function inspectEnemyReliability(enemies = [], {
  horizontalLimit = 150,
  minimumY = -18,
  maximumY = 100,
  staleDyingSeconds = 1.25
} = {}) {
  const list = Array.isArray(enemies) ? enemies : [];
  const summary = {
    total: 0,
    living: 0,
    dying: 0,
    hiddenLiving: 0,
    invalidPosition: 0,
    staleDying: 0,
    duplicateReferences: 0
  };
  const seen = new Set();

  list.forEach((enemy) => {
    if (!enemy) return;
    summary.total += 1;
    if (seen.has(enemy)) summary.duplicateReferences += 1;
    seen.add(enemy);

    const dyingT = finite(enemy.dyingT, -1);
    const living = enemy.alive === true && dyingT < 0;
    if (living) {
      summary.living += 1;
      if (enemy.mesh?.visible === false) summary.hiddenLiving += 1;
    } else if (dyingT >= 0) {
      summary.dying += 1;
      if (dyingT >= Math.max(0.2, finite(staleDyingSeconds, 1.25))) {
        summary.staleDying += 1;
      }
    }

    const position = enemy.mesh?.position;
    if (
      !isFiniteVector3(position)
      || Math.abs(Number(position?.x)) > horizontalLimit
      || Math.abs(Number(position?.z)) > horizontalLimit
      || Number(position?.y) < minimumY
      || Number(position?.y) > maximumY
    ) {
      summary.invalidPosition += 1;
    }
  });

  return Object.freeze(summary);
}

export function createWaveWatchdogState(wave = 1) {
  return Object.freeze({
    wave: Math.max(1, Math.floor(finite(wave, 1))),
    signature: '',
    stalledSeconds: 0,
    clearEligibleSeconds: 0,
    spawnStallSeconds: 0,
    repairCooldown: 0,
    lastAction: 'NONE',
    actionCount: 0
  });
}

function waveSignature(snapshot = {}) {
  return [
    Math.max(1, Math.floor(finite(snapshot.wave, 1))),
    Math.max(0, Math.floor(finite(snapshot.spawned, 0))),
    Math.max(0, Math.floor(finite(snapshot.total, 0))),
    Math.max(0, Math.floor(finite(snapshot.living, 0))),
    Math.max(0, Math.floor(finite(snapshot.dying, 0))),
    snapshot.nextWavePending === true ? 1 : 0
  ].join(':');
}

export function updateWaveWatchdog(
  previous = createWaveWatchdogState(),
  snapshot = {},
  dt = 0
) {
  const safeDt = clamp(dt, 0, 0.1, 0);
  const wave = Math.max(1, Math.floor(finite(snapshot.wave, 1)));
  const total = Math.max(0, Math.floor(finite(snapshot.total, 0)));
  const spawned = Math.max(0, Math.floor(finite(snapshot.spawned, 0)));
  const living = Math.max(0, Math.floor(finite(snapshot.living, 0)));
  const dying = Math.max(0, Math.floor(finite(snapshot.dying, 0)));
  const hiddenLiving = Math.max(0, Math.floor(finite(snapshot.hiddenLiving, 0)));
  const invalidPosition = Math.max(0, Math.floor(finite(snapshot.invalidPosition, 0)));
  const staleDying = Math.max(0, Math.floor(finite(snapshot.staleDying, 0)));
  const nextWavePending = snapshot.nextWavePending === true;
  const signature = waveSignature({
    wave,
    total,
    spawned,
    living,
    dying,
    nextWavePending
  });

  const resetForWave = Number(previous?.wave) !== wave;
  const sameSignature = !resetForWave && previous?.signature === signature;
  const stalledSeconds = sameSignature
    ? Math.max(0, finite(previous?.stalledSeconds, 0)) + safeDt
    : 0;
  const clearEligible = (
    total > 0
    && spawned >= total
    && living === 0
    && dying === 0
    && !nextWavePending
  );
  const spawnStalled = (
    total > 0
    && spawned < total
    && living === 0
    && dying === 0
    && !nextWavePending
  );
  const clearEligibleSeconds = clearEligible
    ? (resetForWave ? 0 : Math.max(0, finite(previous?.clearEligibleSeconds, 0))) + safeDt
    : 0;
  const spawnStallSeconds = spawnStalled
    ? (resetForWave ? 0 : Math.max(0, finite(previous?.spawnStallSeconds, 0))) + safeDt
    : 0;
  const repairCooldown = Math.max(
    0,
    (resetForWave ? 0 : finite(previous?.repairCooldown, 0)) - safeDt
  );

  let action = 'NONE';
  let nextRepairCooldown = repairCooldown;
  if ((hiddenLiving > 0 || invalidPosition > 0 || staleDying > 0) && repairCooldown <= 0) {
    action = 'REPAIR_ENEMIES';
    nextRepairCooldown = 0.45;
  } else if (clearEligibleSeconds >= 0.42) {
    action = 'COMPLETE_WAVE';
  } else if (spawnStallSeconds >= 2.4 || (spawnStalled && stalledSeconds >= 2.4)) {
    action = 'KICK_SPAWNER';
  }

  return Object.freeze({
    state: Object.freeze({
      wave,
      signature,
      stalledSeconds,
      clearEligibleSeconds,
      spawnStallSeconds,
      repairCooldown: nextRepairCooldown,
      lastAction: action,
      actionCount: Math.max(0, Math.floor(finite(previous?.actionCount, 0)))
        + (action === 'NONE' ? 0 : 1)
    }),
    action,
    snapshot: Object.freeze({
      wave,
      total,
      spawned,
      living,
      dying,
      hiddenLiving,
      invalidPosition,
      staleDying,
      nextWavePending
    })
  });
}

export function validateShotRay({ origin = null, direction = null } = {}) {
  const originValid = isFiniteVector3(origin);
  const directionValid = isFiniteVector3(direction);
  const lengthSq = directionValid
    ? Number(direction.x) ** 2 + Number(direction.y) ** 2 + Number(direction.z) ** 2
    : 0;
  const valid = originValid && directionValid && lengthSq > 1e-8;
  const length = valid ? Math.sqrt(lengthSq) : 0;

  return Object.freeze({
    valid,
    normalizedDirection: valid
      ? Object.freeze({
        x: Number(direction.x) / length,
        y: Number(direction.y) / length,
        z: Number(direction.z) / length
      })
      : Object.freeze({ x: 0, y: 0, z: -1 })
  });
}
