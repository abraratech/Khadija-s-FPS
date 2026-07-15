// js/multiplayer/bot_core.js
// BOT.1 R2.8 — late-join companion identity and combat integrity.

export const BOT1_SCHEMA = 1;
export const BOT1_PATCH = 'bot1-late-join-companion-integrity-r2-8';
export const BOT1_PLAYER_ID = 'bot-wingmate-r1';
export const BOT1_DISPLAY_NAME = 'ARENA WINGMATE';
export const BOT1_FILL_WAIT_MS = 25_000;
export const BOT1_MAX_HEALTH = 100;
export const BOT1_REVIVE_RANGE = 2.75;
export const BOT1_FOLLOW_DISTANCE = 3.8;
export const BOT1_FIRE_RANGE = 18;
export const BOT1_FIRE_INTERVAL_MS = 410;
export const BOT1_SHOT_DAMAGE = 13;
export const BOT1_MIN_ACCURACY = 0.38;
export const BOT1_MAX_ACCURACY = 0.68;
export const BOT1_TARGET_REACTION_MS = 260;
export const BOT1_BURST_SHOTS = 5;
export const BOT1_BURST_PAUSE_MS = 550;
export const BOT1_BODY_RADIUS = 0.48;
export const BOT1_STUCK_RECOVERY_MS = 2_400;
export const BOT1_SOFT_CATCHUP_DISTANCE = 15;
export const BOT1_HARD_RECOVERY_DISTANCE = 32;
export const BOT1_REVIVE_HARD_RECOVERY_DISTANCE = 24;
export const BOT1_RECOVERY_COOLDOWN_MS = 2_500;
export const BOT1_MIN_RECOVERY_ANCHOR_DISTANCE = 2.8;
export const BOT1_RESCUE_THREAT_RADIUS = 9;
export const BOT1_RESCUE_SELF_DEFENSE_RADIUS = 5.5;
export const BOT1_RESCUE_CRITICAL_RADIUS = 4.5;
export const BOT1_RESCUE_CRITICAL_SELF_RADIUS = 3.75;


export function computeBotShotAccuracy(distance = 0) {
  const range = Math.max(0, finite(distance));
  return Math.max(
    BOT1_MIN_ACCURACY,
    Math.min(BOT1_MAX_ACCURACY, BOT1_MAX_ACCURACY - range * 0.016)
  );
}

export function buildBotAuthoritySyncDetails({
  state = {},
  authorityExists = false,
  initialize = false,
  now = 0
} = {}) {
  const details = {
    displayName: BOT1_DISPLAY_NAME,
    connected: true,
    position: vector(state.position),
    maxHealth: BOT1_MAX_HEALTH,
    now: finite(now)
  };
  if (!authorityExists || initialize === true) {
    details.health = Math.max(0, finite(state.health, BOT1_MAX_HEALTH));
  }
  return details;
}

export function shouldBotFire({
  now = 0,
  lastShotAt = -Infinity,
  targetAcquiredAt = -Infinity,
  burstPauseUntil = -Infinity
} = {}) {
  const current = finite(now);
  return (
    current >= finite(targetAcquiredAt, -Infinity) + BOT1_TARGET_REACTION_MS
    && current >= finite(lastShotAt, -Infinity) + BOT1_FIRE_INTERVAL_MS
    && current >= finite(burstPauseUntil, -Infinity)
  );
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function vector(value = {}) {
  return {
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z)
  };
}

export function buildSafeAnchorCandidates(anchor = {}, yaw = 0) {
  const origin = vector(anchor);
  const heading = finite(yaw);
  const forward = { x: -Math.sin(heading), z: -Math.cos(heading) };
  const right = { x: Math.cos(heading), z: -Math.sin(heading) };
  const offsets = [
    { right: 3.0, forward: -0.45 },
    { right: -3.0, forward: -0.45 },
    { right: 2.25, forward: 2.15 },
    { right: -2.25, forward: 2.15 },
    { right: 3.65, forward: 1.15 },
    { right: -3.65, forward: 1.15 },
    { right: 0, forward: -3.2 },
    { right: 0, forward: 3.2 }
  ];

  return offsets.map((offset) => Object.freeze({
    x: origin.x + right.x * offset.right + forward.x * offset.forward,
    y: origin.y,
    z: origin.z + right.z * offset.right + forward.z * offset.forward
  }));
}

export function chooseCollisionSafeStep({
  full = false,
  xOnly = false,
  zOnly = false,
  deltaX = 0,
  deltaZ = 0
} = {}) {
  if (full) return 'FULL';
  if (xOnly && zOnly) {
    return Math.abs(finite(deltaX)) >= Math.abs(finite(deltaZ)) ? 'X' : 'Z';
  }
  if (xOnly) return 'X';
  if (zOnly) return 'Z';
  return 'BLOCKED';
}

export function distanceSquared(a, b) {
  const left = vector(a);
  const right = vector(b);
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const dz = right.z - left.z;
  return dx * dx + dy * dy + dz * dz;
}


export function shouldRecoverBotToHost({
  intentKind = 'FOLLOW',
  hostDistance = 0,
  stuckForMs = 0,
  routeClear = true,
  sinceLastRecoveryMs = Infinity
} = {}) {
  const kind = String(intentKind || 'FOLLOW').toUpperCase();
  if (!['FOLLOW', 'REVIVE'].includes(kind)) return false;
  if (finite(sinceLastRecoveryMs, Infinity) < BOT1_RECOVERY_COOLDOWN_MS) {
    return false;
  }

  const distance = Math.max(0, finite(hostDistance));
  const stuck = Math.max(0, finite(stuckForMs)) >= BOT1_STUCK_RECOVERY_MS;
  const hardDistance = kind === 'REVIVE'
    ? BOT1_REVIVE_HARD_RECOVERY_DISTANCE
    : BOT1_HARD_RECOVERY_DISTANCE;
  const unreachableSeparation = distance >= hardDistance && routeClear !== true;
  return stuck || unreachableSeparation;
}

export function shouldPreserveBotReservation({
  requested = false,
  reason = 'run-ended',
  connectedHumanCount = 1,
  roomExists = true
} = {}) {
  if (requested !== true || roomExists !== true) return false;

  // R2.7: the wingman occupies a virtual companion slot, not a human room
  // slot. It may coexist with the two-human public team, but not larger squads.
  if (Math.max(0, Math.floor(finite(connectedHumanCount))) > 2) return false;
  const normalized = String(reason || 'run-ended').trim().toLowerCase();
  return ![
    'left-room',
    'room-closed',
    'host-dismissed',
    'kicked',
    'connection-lost'
  ].includes(normalized);
}

export function shouldOfferBotFill({
  status = 'idle',
  elapsedMs = 0,
  connected = false,
  alreadyRequested = false
} = {}) {
  return (
    status === 'searching'
    && connected !== true
    && alreadyRequested !== true
    && finite(elapsedMs) >= BOT1_FILL_WAIT_MS
  );
}

export function selectBotEnemyTarget(
  enemies = [],
  botPosition = {},
  hostPosition = {}
) {
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const bot = vector(botPosition);
  const host = vector(hostPosition);

  for (const enemy of enemies) {
    if (
      !enemy
      || enemy.alive === false
      || Number(enemy.dyingT) >= 0
      || !enemy.mesh?.position
      || Number(enemy.health || 0) <= 0
    ) {
      continue;
    }

    const enemyPosition = vector(enemy.mesh.position);
    const botDistance = Math.sqrt(distanceSquared(bot, enemyPosition));
    const hostDistance = Math.sqrt(distanceSquared(host, enemyPosition));
    const threatBonus = enemy.targetPlayerId ? -1.5 : 0;
    const heavyPenalty = ['GOLIATH', 'BRUTE'].includes(String(enemy.type))
      ? 1.25
      : 0;
    const score = botDistance + hostDistance * 0.22 + threatBonus + heavyPenalty;

    if (score < bestScore) {
      bestScore = score;
      best = enemy;
    }
  }

  return best;
}


export function selectBotRescueThreat(
  enemies = [],
  botPosition = {},
  downedPosition = {}
) {
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const bot = vector(botPosition);
  const downed = vector(downedPosition);

  for (const enemy of enemies) {
    if (
      !enemy
      || enemy.alive === false
      || Number(enemy.dyingT) >= 0
      || !enemy.mesh?.position
      || Number(enemy.health || 0) <= 0
    ) {
      continue;
    }

    const enemyPosition = vector(enemy.mesh.position);
    const botDistance = Math.sqrt(distanceSquared(bot, enemyPosition));
    const downedDistance = Math.sqrt(distanceSquared(downed, enemyPosition));
    const insideRescueEnvelope = (
      downedDistance <= BOT1_RESCUE_THREAT_RADIUS
      || botDistance <= BOT1_RESCUE_SELF_DEFENSE_RADIUS
    );
    if (!insideRescueEnvelope) continue;

    const targetingBonus = enemy.targetPlayerId ? -1.25 : 0;
    const score = downedDistance * 0.72 + botDistance * 0.28 + targetingBonus;
    if (score < bestScore) {
      bestScore = score;
      best = enemy;
    }
  }

  return best;
}

export function isCriticalRescueThreat(
  enemy,
  botPosition = {},
  downedPosition = {}
) {
  if (!enemy?.mesh?.position) return false;
  const enemyPosition = vector(enemy.mesh.position);
  const botDistance = Math.sqrt(distanceSquared(botPosition, enemyPosition));
  const downedDistance = Math.sqrt(
    distanceSquared(downedPosition, enemyPosition)
  );
  return (
    downedDistance <= BOT1_RESCUE_CRITICAL_RADIUS
    || botDistance <= BOT1_RESCUE_CRITICAL_SELF_RADIUS
  );
}

export function resolveDownedHuman(
  reviveSnapshot = null,
  {
    botPlayerId = BOT1_PLAYER_ID,
    hostPlayerId = null,
    hostPlayer = null,
    hostPosition = null
  } = {}
) {
  const snapshotDowned = findDownedHuman(reviveSnapshot, botPlayerId);
  if (snapshotDowned) return snapshotDowned;

  const lifeState = String(hostPlayer?.multiplayerLifeState || '').toUpperCase();
  if (lifeState === 'SPECTATING' || lifeState === 'ELIMINATED') return null;

  const health = Number(hostPlayer?.health);
  const fallbackDowned = (
    lifeState === 'DOWNED'
    || hostPlayer?.isDowned === true
    || (
      hostPlayer?.alive === false
      && (!Number.isFinite(health) || health <= 0)
    )
  );
  if (!fallbackDowned || !hostPosition) return null;

  return Object.freeze({
    playerId: hostPlayerId || 'local-host',
    displayName: 'HOST OPERATIVE',
    connected: true,
    lifeState: 'DOWNED',
    position: vector(hostPosition),
    synthetic: true
  });
}

export function chooseBotIntent({
  botPosition = {},
  hostPosition = {},
  targetPosition = null,
  downedTeammatePosition = null,
  holdPosition = null
} = {}) {
  if (downedTeammatePosition) {
    return Object.freeze({
      kind: 'REVIVE',
      destination: vector(downedTeammatePosition),
      desiredDistance: 1.8,
      speed: 4.4
    });
  }

  if (targetPosition) {
    const distance = Math.sqrt(distanceSquared(botPosition, targetPosition));
    if (distance < 4.8) {
      const bot = vector(botPosition);
      const target = vector(targetPosition);
      const dx = bot.x - target.x;
      const dz = bot.z - target.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      return Object.freeze({
        kind: 'KITE',
        destination: {
          x: bot.x + (dx / length) * 3.0,
          y: bot.y,
          z: bot.z + (dz / length) * 3.0
        },
        desiredDistance: 0.3,
        speed: 3.8
      });
    }

    return Object.freeze({
      kind: 'ENGAGE',
      destination: vector(targetPosition),
      desiredDistance: 7.0,
      speed: distance > 13 ? 4.5 : 3.1
    });
  }

  if (holdPosition) {
    return Object.freeze({
      kind: 'HOLD',
      destination: vector(holdPosition),
      desiredDistance: 1.5,
      speed: 3.0
    });
  }

  const followDistance = Math.sqrt(distanceSquared(botPosition, hostPosition));
  return Object.freeze({
    kind: 'FOLLOW',
    destination: vector(hostPosition),
    desiredDistance: BOT1_FOLLOW_DISTANCE,
    speed: followDistance >= BOT1_SOFT_CATCHUP_DISTANCE
      ? 5.1
      : (followDistance >= 9 ? 4.25 : 3.6)
  });
}

export function computeBotVelocity({
  position = {},
  destination = {},
  desiredDistance = 0,
  speed = 3,
  dt = 1 / 60,
  avoidance = null
} = {}) {
  const current = vector(position);
  const target = vector(destination);
  let dx = target.x - current.x;
  let dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);

  if (avoidance) {
    dx += finite(avoidance.x) * 2.2;
    dz += finite(avoidance.z) * 2.2;
  }

  const adjustedDistance = Math.hypot(dx, dz);
  if (
    distance <= Math.max(0, finite(desiredDistance))
    || adjustedDistance <= 0.001
  ) {
    return Object.freeze({
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      moving: false,
      stepDistance: 0
    });
  }

  const normalizedX = dx / adjustedDistance;
  const normalizedZ = dz / adjustedDistance;
  const velocity = {
    x: normalizedX * finite(speed, 3),
    y: 0,
    z: normalizedZ * finite(speed, 3)
  };

  return Object.freeze({
    velocity,
    yaw: Math.atan2(-velocity.x, -velocity.z),
    moving: true,
    stepDistance: Math.max(0, finite(dt)) * finite(speed, 3)
  });
}

export function findDownedHuman(
  reviveSnapshot = null,
  botPlayerId = BOT1_PLAYER_ID
) {
  const players = Array.isArray(reviveSnapshot?.players)
    ? reviveSnapshot.players
    : [];
  return players.find((entry) => (
    entry?.playerId
    && entry.playerId !== botPlayerId
    && entry.connected !== false
    && entry.lifeState === 'DOWNED'
  )) || null;
}

export function shouldReplaceBot({
  connectedHumanCount = 1,
  livingEnemyCount = 0,
  runActive = false
} = {}) {
  if (finite(connectedHumanCount, 1) < 2) return false;
  return runActive !== true || finite(livingEnemyCount) <= 0;
}

export function markBotAssistedSummary(summary = {}, {
  botProfile = BOT1_PATCH,
  activeSeconds = 0,
  replacementReason = null
} = {}) {
  return Object.freeze({
    ...(summary && typeof summary === 'object' ? summary : {}),
    botAssisted: true,
    leaderboardEligible: false,
    botProfile: String(botProfile || BOT1_PATCH).slice(0, 80),
    botActiveSeconds: Math.max(0, finite(activeSeconds)),
    botReplacementReason: replacementReason
      ? String(replacementReason).slice(0, 80)
      : null
  });
}
