// js/ai_squad.js
// C10.2 — Coordinated Zombie Intelligence
//
// Lightweight coordination layer used by the Adaptive AI Director.
// It runs on a fixed update budget, assigns stable horde roles, remembers
// player/death heat, and supplies coordinated movement targets.
//
// This module intentionally does not import ai_director.js, preventing a
// circular dependency. The director passes its current tuning into update.

const SQUAD_ACTIVATION_WAVE = 9;
const ASSIGNMENT_INTERVAL = 0.42;
const HEAT_SAMPLE_INTERVAL = 0.28;
const HEAT_DECAY_INTERVAL = 2.2;
const HEAT_CELL_SIZE = 8;
const MAX_HEAT_CELLS = 72;

// C10.9.1 — direct pursuit/contact reliability.
const PLAYER_STATIONARY_SPEED = 0.42;

const state = {
  runActive: false,
  active: false,
  mapId: 'unknown',
  wave: 1,
  intensity: 0,
  assignmentTimer: 0,
  heatSampleTimer: 0,
  heatDecayTimer: 0,
  nextEnemyId: 1,
  assignmentEpoch: 0,
  playerHeat: new Map(),
  deathHeat: new Map(),
  lastPlayerX: null,
  lastPlayerZ: null,
  routeVX: 0,
  routeVZ: 0,
  hotspot: null,
  roleCounts: {},
  trapAvoidanceAssignments: 0,
  lastLivingCount: 0,
  lastLivingSignature: '',
  forceReassign: true,
  roleRefreshTimer: 0,
  playerStationaryT: 0,
  directPressureEnemies: 0
};

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getDirectPressureDistance(enemy) {
  const attackRange = Math.max(0.8, finite(enemy?.attackRange, 1.4));

  if (enemy?.type === 'GOLIATH') return Math.max(4.25, attackRange + 1.05);
  if (enemy?.type === 'BRUTE') return Math.max(3.65, attackRange + 1.10);
  if (enemy?.type === 'EXPLODER') return Math.max(4.00, attackRange + 1.25);

  return Math.max(3.15, attackRange + 1.05);
}

function getStationaryCollapseDistance(enemy) {
  if (enemy?.type === 'GOLIATH') return 8.2;
  if (enemy?.type === 'BRUTE') return 7.4;
  if (enemy?.type === 'EXPLODER') return 7.0;
  if (enemy?.type === 'RUNNER') return 7.2;
  return 6.4;
}

function heatKey(x, z) {
  const cellX = Math.floor((Number(x) || 0) / HEAT_CELL_SIZE);
  const cellZ = Math.floor((Number(z) || 0) / HEAT_CELL_SIZE);
  return `${cellX}:${cellZ}`;
}

function parseHeatKey(key) {
  const [x, z] = String(key).split(':').map(Number);
  return {
    x: (x + 0.5) * HEAT_CELL_SIZE,
    z: (z + 0.5) * HEAT_CELL_SIZE
  };
}

function addHeat(map, x, z, amount = 1) {
  const key = heatKey(x, z);
  map.set(key, (map.get(key) || 0) + Math.max(0, Number(amount) || 0));

  if (map.size <= MAX_HEAT_CELLS) return;

  let weakestKey = null;
  let weakestValue = Infinity;

  for (const [entryKey, value] of map.entries()) {
    if (value < weakestValue) {
      weakestValue = value;
      weakestKey = entryKey;
    }
  }

  if (weakestKey !== null) map.delete(weakestKey);
}

function getHeat(map, x, z) {
  return map.get(heatKey(x, z)) || 0;
}

function decayHeatMap(map, factor) {
  for (const [key, value] of map.entries()) {
    const next = value * factor;
    if (next < 0.08) map.delete(key);
    else map.set(key, next);
  }
}

function updateHotspot() {
  let bestKey = null;
  let bestValue = -Infinity;

  for (const [key, value] of state.playerHeat.entries()) {
    if (value > bestValue) {
      bestValue = value;
      bestKey = key;
    }
  }

  state.hotspot = bestKey
    ? { ...parseHeatKey(bestKey), heat: bestValue }
    : null;
}

function getLivingEnemies(enemies) {
  if (!Array.isArray(enemies)) return [];

  return enemies.filter((enemy) => {
    return enemy?.alive && enemy.dyingT < 0 && enemy.mesh?.position;
  });
}

function ensureSquadIdentity(enemy) {
  if (!enemy) return;

  if (!Number.isFinite(enemy.squadId)) {
    enemy.squadId = state.nextEnemyId++;
  }

  if (!Number.isFinite(enemy.squadSeed)) {
    enemy.squadSeed = ((enemy.squadId * 9301 + 49297) % 233280) / 233280;
  }
}

function getPreferredFlankRole(enemy, playerState) {
  const px = Number(playerState?.pos?.x) || 0;
  const pz = Number(playerState?.pos?.z) || 0;
  const ex = Number(enemy?.mesh?.position?.x) || 0;
  const ez = Number(enemy?.mesh?.position?.z) || 0;

  let forwardX = Number(playerState?.vel?.x) || 0;
  let forwardZ = Number(playerState?.vel?.z) || 0;
  let forwardLen = Math.hypot(forwardX, forwardZ);

  if (forwardLen < 0.35) {
    forwardX = px - ex;
    forwardZ = pz - ez;
    forwardLen = Math.max(0.001, Math.hypot(forwardX, forwardZ));
  }

  forwardX /= Math.max(0.001, forwardLen);
  forwardZ /= Math.max(0.001, forwardLen);

  const leftX = px - forwardZ * 5.2;
  const leftZ = pz + forwardX * 5.2;
  const rightX = px + forwardZ * 5.2;
  const rightZ = pz - forwardX * 5.2;

  const leftDanger = getHeat(state.deathHeat, leftX, leftZ);
  const rightDanger = getHeat(state.deathHeat, rightX, rightZ);

  if (Math.abs(leftDanger - rightDanger) < 0.15) {
    return enemy.squadSeed < 0.5 ? 'FLANK_LEFT' : 'FLANK_RIGHT';
  }

  // Prefer the side where fewer enemies have recently died.
  return leftDanger <= rightDanger ? 'FLANK_LEFT' : 'FLANK_RIGHT';
}

function assignStableRoles(enemies, playerState, tuning) {
  const living = getLivingEnemies(enemies);
  const active = Boolean(
    state.runActive &&
    tuning?.active &&
    state.wave >= SQUAD_ACTIVATION_WAVE &&
    living.length >= 4
  );

  state.active = active;
  state.lastLivingCount = living.length;
  state.intensity = active ? clamp(tuning?.intensity, 0, 0.92) : 0;
  state.roleCounts = {};
  state.trapAvoidanceAssignments = 0;
  state.assignmentEpoch++;

  if (!active) {
    for (const enemy of living) {
      ensureSquadIdentity(enemy);
      enemy.squadRole = 'DIRECT';
      enemy.squadSlot = -1;
      enemy.squadEpoch = state.assignmentEpoch;
      enemy.trapAware = false;
    }
    return;
  }

  living.sort((a, b) => {
    ensureSquadIdentity(a);
    ensureSquadIdentity(b);
    return a.squadId - b.squadId;
  });

  const roleCycleLow = [
    'PRESSURE',
    'PRESSURE',
    'INTERCEPT',
    'FLANK',
    'ENCIRCLE'
  ];

  const roleCycleHigh = [
    'PRESSURE',
    'INTERCEPT',
    'FLANK',
    'ENCIRCLE',
    'BLOCKER',
    'FLANK',
    'ENCIRCLE'
  ];

  const roleCycle = state.intensity >= 0.58 ? roleCycleHigh : roleCycleLow;
  let normalIndex = 0;
  let surroundSlot = 0;

  for (const enemy of living) {
    ensureSquadIdentity(enemy);

    let role;

    if ((enemy.navRolePenaltyT || 0) > 0) {
      role = enemy.type === 'RANGED' ? 'SUPPORT' : 'PRESSURE';
      enemy.navNeedsRoleReset = false;
    } else if (enemy.type === 'GOLIATH' || enemy.type === 'BRUTE') {
      role = 'ANCHOR';
    } else if (enemy.type === 'RANGED') {
      role = 'SUPPORT';
    } else if (enemy.type === 'EXPLODER') {
      role = 'BREACHER';
    } else {
      role = roleCycle[normalIndex % roleCycle.length];
      normalIndex++;

      if (role === 'FLANK') {
        role = getPreferredFlankRole(enemy, playerState);
      }
    }

    enemy.squadRole = role;
    enemy.squadSlot = role === 'ENCIRCLE' ? surroundSlot++ : -1;
    enemy.squadEpoch = state.assignmentEpoch;

    const canAvoidTraps = !['GOLIATH', 'EXPLODER'].includes(enemy.type);
    const awarenessThreshold = 0.42 + state.intensity * 0.42;
    enemy.trapAware = canAvoidTraps && enemy.squadSeed <= awarenessThreshold;

    if (enemy.trapAware) state.trapAvoidanceAssignments++;

    state.roleCounts[role] = (state.roleCounts[role] || 0) + 1;
  }
}

function updateRouteMemory(dt, playerState) {
  const x = Number(playerState?.pos?.x);
  const z = Number(playerState?.pos?.z);

  if (!Number.isFinite(x) || !Number.isFinite(z)) return;

  if (Number.isFinite(state.lastPlayerX) && Number.isFinite(state.lastPlayerZ)) {
    const safeDt = Math.max(0.001, dt);
    const vx = (x - state.lastPlayerX) / safeDt;
    const vz = (z - state.lastPlayerZ) / safeDt;
    const speed = Math.hypot(vx, vz);

    if (speed < PLAYER_STATIONARY_SPEED) {
      state.playerStationaryT += safeDt;

      // Old route memory must decay quickly when the player stops. Otherwise
      // BLOCKER/INTERCEPT roles continue chasing an imaginary future position.
      state.routeVX *= 0.48;
      state.routeVZ *= 0.48;
    } else {
      state.playerStationaryT = 0;
      state.routeVX = state.routeVX * 0.76 + vx * 0.24;
      state.routeVZ = state.routeVZ * 0.76 + vz * 0.24;
    }
  }

  state.lastPlayerX = x;
  state.lastPlayerZ = z;

  addHeat(state.playerHeat, x, z, 0.55 + state.intensity * 0.35);
}

function segmentIntersectsAABB(x1, z1, x2, z2, minX, maxX, minZ, maxZ) {
  // Small fixed sample count keeps this predictable and inexpensive.
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;

    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
      return true;
    }
  }

  return false;
}

function routeAroundActiveTrap(enemy, target, traps, out) {
  if (!enemy?.trapAware || !Array.isArray(traps) || traps.length === 0) {
    return false;
  }

  const ex = Number(enemy.mesh?.position?.x) || 0;
  const ez = Number(enemy.mesh?.position?.z) || 0;

  for (const trap of traps) {
    if (!trap || trap.state !== 'ACTIVE' || !trap.center) continue;

    const halfWidth = Math.max(0.5, (Number(trap.width) || 1) * 0.5);
    const pad = 1.25;

    const minX = trap.isZAxis
      ? trap.center.x - 0.75 - pad
      : trap.center.x - halfWidth - pad;
    const maxX = trap.isZAxis
      ? trap.center.x + 0.75 + pad
      : trap.center.x + halfWidth + pad;
    const minZ = trap.isZAxis
      ? trap.center.z - halfWidth - pad
      : trap.center.z - 0.75 - pad;
    const maxZ = trap.isZAxis
      ? trap.center.z + halfWidth + pad
      : trap.center.z + 0.75 + pad;

    if (!segmentIntersectsAABB(
      ex,
      ez,
      target.x,
      target.z,
      minX,
      maxX,
      minZ,
      maxZ
    )) {
      continue;
    }

    if (trap.isZAxis) {
      const topZ = trap.center.z - halfWidth - 1.75;
      const bottomZ = trap.center.z + halfWidth + 1.75;
      out.x = trap.center.x + (ex < trap.center.x ? -1.65 : 1.65);
      out.z = Math.abs(ez - topZ) <= Math.abs(ez - bottomZ) ? topZ : bottomZ;
    } else {
      const leftX = trap.center.x - halfWidth - 1.75;
      const rightX = trap.center.x + halfWidth + 1.75;
      out.x = Math.abs(ex - leftX) <= Math.abs(ex - rightX) ? leftX : rightX;
      out.z = trap.center.z + (ez < trap.center.z ? -1.65 : 1.65);
    }

    return true;
  }

  return false;
}

export function resetAISquadRun({ mapId = 'unknown' } = {}) {
  state.runActive = true;
  state.active = false;
  state.mapId = String(mapId || 'unknown');
  state.wave = 1;
  state.intensity = 0;
  state.assignmentTimer = 0;
  state.heatSampleTimer = 0;
  state.heatDecayTimer = HEAT_DECAY_INTERVAL;
  state.nextEnemyId = 1;
  state.assignmentEpoch = 0;
  state.playerHeat.clear();
  state.deathHeat.clear();
  state.lastPlayerX = null;
  state.lastPlayerZ = null;
  state.routeVX = 0;
  state.routeVZ = 0;
  state.hotspot = null;
  state.roleCounts = {};
  state.trapAvoidanceAssignments = 0;
  state.lastLivingCount = 0;
  state.lastLivingSignature = '';
  state.forceReassign = true;
  state.roleRefreshTimer = 0;
  state.playerStationaryT = 0;
  state.directPressureEnemies = 0;
}

export function endAISquadRun() {
  state.runActive = false;
  state.active = false;
  state.roleCounts = {};
  state.lastLivingCount = 0;
  state.lastLivingSignature = '';
  state.forceReassign = true;
  state.playerStationaryT = 0;
  state.directPressureEnemies = 0;
}

export function beginAISquadWave(waveNumber) {
  state.wave = Math.max(1, Number(waveNumber) || 1);
  state.assignmentTimer = 0;
  state.roleRefreshTimer = 0;
  state.forceReassign = true;
}

export function registerSquadEnemy(enemy) {
  if (!enemy) return;

  ensureSquadIdentity(enemy);
  enemy.squadRole = 'DIRECT';
  enemy.squadSlot = -1;
  enemy.squadEpoch = -1;
  enemy.trapAware = false;
  enemy.squadDirectPressure = false;
  state.forceReassign = true;
}

export function updateAISquad(dt, context = {}) {
  if (!state.runActive) return;

  const safeDt = clamp(dt, 0, 0.05);
  const playerState = context.player;
  const tuning = context.tuning || {};
  const enemies = context.enemies || [];

  state.directPressureEnemies = 0;
  state.wave = Math.max(1, Number(context.wave) || state.wave);
  state.assignmentTimer -= safeDt;
  state.roleRefreshTimer -= safeDt;
  state.heatSampleTimer -= safeDt;
  state.heatDecayTimer -= safeDt;

  if (playerState?.alive && state.heatSampleTimer <= 0) {
    state.heatSampleTimer = HEAT_SAMPLE_INTERVAL;
    updateRouteMemory(HEAT_SAMPLE_INTERVAL, playerState);
  }

  if (state.heatDecayTimer <= 0) {
    state.heatDecayTimer = HEAT_DECAY_INTERVAL;
    decayHeatMap(state.playerHeat, 0.90);
    decayHeatMap(state.deathHeat, 0.86);
    updateHotspot();
  }

  if (state.assignmentTimer <= 0) {
    state.assignmentTimer = ASSIGNMENT_INTERVAL;

    const living = getLivingEnemies(enemies);

    living.forEach((enemy) => ensureSquadIdentity(enemy));

    const livingSignature = living
      .map((enemy) => enemy.squadId)
      .sort((a, b) => a - b)
      .join(',');

    const navigationRequestedReset = living.some((enemy) => enemy.navNeedsRoleReset);
    const compositionChanged = livingSignature !== state.lastLivingSignature;

    if (
      state.forceReassign ||
      navigationRequestedReset ||
      compositionChanged ||
      state.roleRefreshTimer <= 0
    ) {
      assignStableRoles(enemies, playerState, tuning);
      state.lastLivingSignature = livingSignature;
      state.forceReassign = false;
      state.roleRefreshTimer = 1.65;
    }
  }
}

export function recordSquadEnemyDeath(enemy) {
  if (!state.runActive || !enemy?.mesh?.position) return;

  state.forceReassign = true;
  state.assignmentTimer = 0;

  addHeat(
    state.deathHeat,
    enemy.mesh.position.x,
    enemy.mesh.position.z,
    enemy.type === 'GOLIATH' || enemy.type === 'BRUTE' ? 1.8 : 1
  );
}

export function getSquadPursuitTarget(
  enemy,
  playerState,
  baseTarget,
  traps,
  outTarget
) {
  const out = outTarget || { x: 0, z: 0 };
  const playerX = Number(playerState?.pos?.x) || 0;
  const playerZ = Number(playerState?.pos?.z) || 0;
  const enemyX = Number(enemy?.mesh?.position?.x) || 0;
  const enemyZ = Number(enemy?.mesh?.position?.z) || 0;

  out.x = Number(baseTarget?.x);
  out.z = Number(baseTarget?.z);

  if (!Number.isFinite(out.x)) out.x = playerX;
  if (!Number.isFinite(out.z)) out.z = playerZ;

  if (!state.active || !enemy?.alive) {
    if (enemy) enemy.squadDirectPressure = false;
    return out;
  }

  const role = String(enemy.squadRole || 'DIRECT');
  const distToPlayer = Math.hypot(playerX - enemyX, playerZ - enemyZ);
  const playerGroundSpeed = Math.hypot(
    finite(playerState?.vel?.x),
    finite(playerState?.vel?.z)
  );
  const playerStationary = Boolean(
    playerGroundSpeed < PLAYER_STATIONARY_SPEED ||
    state.playerStationaryT >= 0.18
  );
  const attackCommitted = (
    enemy.attackState === 'QUEUED' ||
    enemy.attackState === 'WINDUP' ||
    enemy.attackState === 'RECOVERY'
  );
  const forceDirectPressure = Boolean(
    enemy.type !== 'RANGED' &&
    (
      attackCommitted ||
      distToPlayer <= getDirectPressureDistance(enemy) ||
      (
        playerStationary &&
        distToPlayer <= getStationaryCollapseDistance(enemy)
      )
    )
  );

  enemy.squadDirectPressure = forceDirectPressure;

  if (forceDirectPressure) {
    out.x = playerX;
    out.z = playerZ;
    state.directPressureEnemies++;
    return out;
  }

  let routeVX = state.routeVX;
  let routeVZ = state.routeVZ;
  let routeSpeed = Math.hypot(routeVX, routeVZ);

  if (routeSpeed < 0.45) {
    routeVX = Number(playerState?.vel?.x) || 0;
    routeVZ = Number(playerState?.vel?.z) || 0;
    routeSpeed = Math.hypot(routeVX, routeVZ);
  }

  let forwardX = routeSpeed > 0.25 ? routeVX / routeSpeed : (playerX - enemyX);
  let forwardZ = routeSpeed > 0.25 ? routeVZ / routeSpeed : (playerZ - enemyZ);
  const forwardLength = Math.max(0.001, Math.hypot(forwardX, forwardZ));
  forwardX /= forwardLength;
  forwardZ /= forwardLength;

  const sideX = -forwardZ;
  const sideZ = forwardX;

  if (role === 'INTERCEPT') {
    if (routeSpeed > 0.55 && playerGroundSpeed > PLAYER_STATIONARY_SPEED) {
      const lead = 0.22 + state.intensity * 0.42;
      out.x = playerX + routeVX * lead;
      out.z = playerZ + routeVZ * lead;
    } else {
      out.x = playerX;
      out.z = playerZ;
    }
  } else if (role === 'BLOCKER') {
    if (
      routeSpeed > 0.65 &&
      playerGroundSpeed > PLAYER_STATIONARY_SPEED &&
      distToPlayer > 5.2
    ) {
      const ahead = 3.2 + state.intensity * 3.0;
      out.x = playerX + forwardX * ahead;
      out.z = playerZ + forwardZ * ahead;
    } else {
      out.x = playerX;
      out.z = playerZ;
    }
  } else if (role === 'FLANK_LEFT' || role === 'FLANK_RIGHT') {
    if (distToPlayer > 4.0) {
      const sign = role === 'FLANK_LEFT' ? 1 : -1;
      const sideDistance = 3.3 + state.intensity * 2.1;
      const forwardDistance = 0.8 + state.intensity * 1.2;

      out.x = playerX + sideX * sideDistance * sign + forwardX * forwardDistance;
      out.z = playerZ + sideZ * sideDistance * sign + forwardZ * forwardDistance;
    } else {
      out.x = playerX;
      out.z = playerZ;
    }
  } else if (role === 'ENCIRCLE') {
    if (distToPlayer > 3.1) {
      const slotCount = 8;
      const slot = Math.abs(Number(enemy.squadSlot) || 0) % slotCount;
      const angle = (slot / slotCount) * Math.PI * 2;
      const ringRadius = 2.5 + (slot % 2) * 0.55;

      out.x = playerX + Math.cos(angle) * ringRadius;
      out.z = playerZ + Math.sin(angle) * ringRadius;
    } else {
      out.x = playerX;
      out.z = playerZ;
    }
  } else if (role === 'SUPPORT') {
    // Ranged enemies try to maintain an offset lane rather than joining the pile.
    if (distToPlayer < 7.5) {
      const sign = enemy.squadSeed < 0.5 ? 1 : -1;
      out.x = enemyX - forwardX * 2.2 + sideX * 2.0 * sign;
      out.z = enemyZ - forwardZ * 2.2 + sideZ * 2.0 * sign;
    }
  } else if (role === 'ANCHOR') {
    // Heavy enemies pressure the player's most-used nearby area when it remains relevant.
    if (state.hotspot) {
      const hotspotDist = Math.hypot(
        state.hotspot.x - playerX,
        state.hotspot.z - playerZ
      );

      if (hotspotDist < 15 && distToPlayer > 8) {
        out.x = out.x * 0.72 + state.hotspot.x * 0.28;
        out.z = out.z * 0.72 + state.hotspot.z * 0.28;
      }
    }
  }

  // C10.3: active-trap detours are finalized by ai_navigation.js after
  // wall validation, so squad intent and local collision steering do not fight.
  return out;
}

export function getAISquadSnapshot() {
  return {
    active: state.active,
    activationWave: SQUAD_ACTIVATION_WAVE,
    wave: state.wave,
    intensity: state.intensity,
    livingEnemies: state.lastLivingCount,
    roleCounts: { ...state.roleCounts },
    playerHeatCells: state.playerHeat.size,
    deathHeatCells: state.deathHeat.size,
    hotspot: state.hotspot ? { ...state.hotspot } : null,
    trapAwareEnemies: state.trapAvoidanceAssignments,
    routeSpeed: Math.hypot(state.routeVX, state.routeVZ),
    playerStationaryT: state.playerStationaryT,
    directPressureEnemies: state.directPressureEnemies
  };
}

if (typeof window !== 'undefined') {
  window.KAGetAISquad = getAISquadSnapshot;
}
