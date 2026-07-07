// js/ai_navigation.js
// C10.3 — Tactical Navigation and AI Reliability
//
// This is a lightweight local navigation layer, not a full navmesh.
// It:
// - validates tactical squad targets against map collision AABBs
// - selects short-lived wall-corner or map-anchor detours
// - detects enemies that stop making progress
// - applies non-teleport recovery sidesteps
// - routes trap-aware enemies around active electric fields
// - temporarily removes blocked enemies from specialist flank roles
//
// Expensive collision planning is staggered and cached per enemy.

const NAV_SAMPLE_INTERVAL = 0.20;
const NAV_REPLAN_MIN = 0.18;
const NAV_REPLAN_MAX = 0.34;
const NAV_WAYPOINT_TTL = 1.20;
const NAV_CLEARANCE = 0.62;
const NAV_STUCK_START = 0.85;
const NAV_STUCK_ROLE_RESET = 1.65;
const NAV_STUCK_SEVERE = 2.75;
const NAV_ROLE_PENALTY = 4.0;
const NAV_MAX_WALL_CHECKS = 140;
const NAV_CONTACT_REFRESH_MIN = 0.16;
const NAV_CONTACT_REFRESH_MAX = 0.26;
const NAV_CONTACT_ANGLE_OFFSETS = Object.freeze([0, 0.55, -0.55, 1.05, -1.05]);

const MAP_ROUTE_ANCHORS = Object.freeze({
  grid_bunker: Object.freeze([
    [-21, -21], [0, -21], [21, -21],
    [-21, 0], [21, 0],
    [-21, 21], [0, 21], [21, 21],
    [-9, -9], [9, -9], [-9, 9], [9, 9]
  ]),
  industrial_yard: Object.freeze([
    [-32, -28], [0, -32], [32, -28],
    [-32, 0], [0, 0], [32, 0],
    [-32, 28], [0, 32], [32, 28],
    [-16, -16], [16, -16], [-16, 16], [16, 16]
  ]),
  neon_depot: Object.freeze([
    [-34, -30], [0, -34], [34, -30],
    [-34, 0], [-12, 0], [12, 0], [34, 0],
    [-34, 30], [0, 34], [34, 30],
    [0, -14], [0, 14]
  ]),
  parking_garage: Object.freeze([
    [-36, -28], [-18, -28], [0, -28], [18, -28], [36, -28],
    [-36, 0], [-10, 0], [10, 0], [36, 0],
    [-36, 28], [-18, 28], [0, 28], [18, 28], [36, 28],
    [-5, -8], [5, 8]
  ]),
  hospital_wing: Object.freeze([
    [-40, -24], [-18, -24], [0, -24], [18, -24], [40, -24],
    [-40, 0], [-20, 0], [-5, 0], [5, 0], [20, 0], [40, 0],
    [-40, 24], [-18, 24], [0, 24], [18, 24], [40, 24],
    [-14, -12], [14, 12], [-14, 12], [14, -12]
  ])
});

const state = {
  runActive: false,
  mapId: 'grid_bunker',
  wave: 1,
  plannedEnemies: 0,
  detouringEnemies: 0,
  recoveringEnemies: 0,
  stuckEnemies: 0,
  roleResetRequests: 0,
  trapDetours: 0,
  anchorDetours: 0,
  wallCornerDetours: 0,
  contactApproachEnemies: 0,
  cornerContactOverrides: 0
};

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function flatDistanceSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function flatDistance(ax, az, bx, bz) {
  return Math.sqrt(flatDistanceSq(ax, az, bx, bz));
}

function getContactOverrideDistance(enemy) {
  const attackRange = Math.max(0.8, Number(enemy?.attackRange) || 1.4);

  if (enemy?.type === 'GOLIATH') return Math.max(4.25, attackRange + 1.05);
  if (enemy?.type === 'BRUTE') return Math.max(3.65, attackRange + 1.10);
  if (enemy?.type === 'EXPLODER') return Math.max(4.00, attackRange + 1.25);

  return Math.max(3.15, attackRange + 1.05);
}


function getContactStandOff(enemy) {
  const attackRange = Math.max(0.8, Number(enemy?.attackRange) || 1.4);

  if (enemy?.type === 'GOLIATH') return clamp(attackRange * 0.78, 1.9, 2.55);
  if (enemy?.type === 'BRUTE') return clamp(attackRange * 0.74, 1.15, 1.48);
  if (enemy?.type === 'EXPLODER') return clamp(attackRange * 0.76, 1.35, 1.80);

  return clamp(attackRange * 0.72, 0.72, 1.12);
}

function pathCrossesActiveTrap(enemy, x1, z1, x2, z2, traps) {
  if (!enemy?.trapAware || !Array.isArray(traps)) return false;

  for (const trap of traps) {
    const bounds = getTrapBounds(trap);
    if (bounds && segmentIntersectsBounds(x1, z1, x2, z2, bounds)) {
      return true;
    }
  }

  return false;
}

function refreshPlayerContactTarget(enemy, playerState, walls) {
  const ex = Number(enemy?.mesh?.position?.x) || 0;
  const ez = Number(enemy?.mesh?.position?.z) || 0;
  const feetY = Number(enemy?.mesh?.position?.y) || 0;
  const px = Number(playerState?.pos?.x) || 0;
  const pz = Number(playerState?.pos?.z) || 0;
  const radius = getContactStandOff(enemy);
  const baseAngle = Math.atan2(ez - pz, ex - px);
  const clearance = clamp((Number(enemy?.colRadius) || 0.45) * 0.45, 0.16, 0.30);

  let best = null;
  let bestScore = Infinity;

  for (const offset of NAV_CONTACT_ANGLE_OFFSETS) {
    const angle = baseAngle + offset;
    const x = px + Math.cos(angle) * radius;
    const z = pz + Math.sin(angle) * radius;

    if (!isCandidateOpen(x, z, walls || [], feetY, clearance)) continue;
    if (!pathIsClear(ex, ez, x, z, walls || [], feetY, clearance)) continue;

    const score = flatDistance(ex, ez, x, z) + Math.abs(offset) * 0.72;
    if (score < bestScore) {
      bestScore = score;
      best = { x, z, offset };
    }
  }

  enemy.navContactRefreshTimer = NAV_CONTACT_REFRESH_MIN +
    Math.random() * (NAV_CONTACT_REFRESH_MAX - NAV_CONTACT_REFRESH_MIN);
  enemy.navContactPlayerX = px;
  enemy.navContactPlayerZ = pz;

  if (!best) {
    enemy.navContactTargetValid = false;
    enemy.navUsingContactTarget = false;
    enemy.navCornerContactOverride = false;
    return false;
  }

  enemy.navContactTarget.x = best.x;
  enemy.navContactTarget.z = best.z;
  enemy.navContactTargetValid = true;
  enemy.navUsingContactTarget = true;
  enemy.navCornerContactOverride = Math.abs(best.offset) > 0.01;
  return true;
}

function getPlayerContactTarget(enemy, playerState, walls, out, dt = 0) {
  if (!enemy || enemy.type === 'RANGED') return false;

  ensureEnemyNavigationState(enemy);
  enemy.navContactRefreshTimer = Math.max(
    0,
    Number(enemy.navContactRefreshTimer || 0) - clamp(dt, 0, 0.05)
  );

  const px = Number(playerState?.pos?.x) || 0;
  const pz = Number(playerState?.pos?.z) || 0;
  const lastPlayerX = Number(enemy.navContactPlayerX);
  const lastPlayerZ = Number(enemy.navContactPlayerZ);
  const playerMoved = flatDistance(
    px,
    pz,
    Number.isFinite(lastPlayerX) ? lastPlayerX : px,
    Number.isFinite(lastPlayerZ) ? lastPlayerZ : pz
  ) > 0.45;

  if (
    enemy.navContactRefreshTimer <= 0 ||
    playerMoved ||
    !enemy.navContactTargetValid
  ) {
    refreshPlayerContactTarget(enemy, playerState, walls || []);
  }

  if (!enemy.navContactTargetValid) return false;

  out.x = enemy.navContactTarget.x;
  out.z = enemy.navContactTarget.z;
  enemy.navUsingContactTarget = true;
  return true;
}

function pointInsideExpandedWall(x, z, wall, padding = NAV_CLEARANCE, feetY = 0) {
  if (!wall) return false;

  // Match the game's step-up collision rule: once an enemy is sufficiently
  // above a low block, it should no longer be treated as a horizontal obstacle.
  if (
    Number.isFinite(wall.maxY) &&
    feetY >= wall.maxY - 0.70
  ) {
    return false;
  }

  return (
    x >= Number(wall.minX) - padding &&
    x <= Number(wall.maxX) + padding &&
    z >= Number(wall.minZ) - padding &&
    z <= Number(wall.maxZ) + padding
  );
}

function segmentIntersectsExpandedWall(
  x1,
  z1,
  x2,
  z2,
  wall,
  padding = NAV_CLEARANCE,
  feetY = 0
) {
  if (!wall) return false;

  if (
    Number.isFinite(wall.maxY) &&
    feetY >= wall.maxY - 0.70
  ) {
    return false;
  }

  const minX = Number(wall.minX) - padding;
  const maxX = Number(wall.maxX) + padding;
  const minZ = Number(wall.minZ) - padding;
  const maxZ = Number(wall.maxZ) + padding;

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return false;

  let tMin = 0;
  let tMax = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;

  const clipAxis = (origin, delta, min, max) => {
    if (Math.abs(delta) < 0.000001) {
      return origin >= min && origin <= max;
    }

    let t1 = (min - origin) / delta;
    let t2 = (max - origin) / delta;

    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }

    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    return tMin <= tMax;
  };

  return clipAxis(x1, dx, minX, maxX) && clipAxis(z1, dz, minZ, maxZ);
}

function getFirstBlockingWall(x1, z1, x2, z2, walls, feetY = 0, padding = NAV_CLEARANCE) {
  if (!Array.isArray(walls)) return null;

  let nearest = null;
  let nearestSq = Infinity;
  let checks = 0;

  for (const wall of walls) {
    if (++checks > NAV_MAX_WALL_CHECKS) break;
    if (!wall) continue;

    // A barricade disappears from walls when destroyed. Closed barricades and
    // buyable doors remain real blockers and should not be crossed.
    if (!segmentIntersectsExpandedWall(x1, z1, x2, z2, wall, padding, feetY)) {
      continue;
    }

    const centerX = (Number(wall.minX) + Number(wall.maxX)) * 0.5;
    const centerZ = (Number(wall.minZ) + Number(wall.maxZ)) * 0.5;
    const distSq = flatDistanceSq(x1, z1, centerX, centerZ);

    if (distSq < nearestSq) {
      nearestSq = distSq;
      nearest = wall;
    }
  }

  return nearest;
}

function isCandidateOpen(x, z, walls, feetY = 0, padding = NAV_CLEARANCE) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

  let checks = 0;

  for (const wall of walls || []) {
    if (++checks > NAV_MAX_WALL_CHECKS) break;
    if (pointInsideExpandedWall(x, z, wall, padding, feetY)) return false;
  }

  return true;
}

function pathIsClear(x1, z1, x2, z2, walls, feetY = 0, padding = NAV_CLEARANCE) {
  return !getFirstBlockingWall(x1, z1, x2, z2, walls, feetY, padding);
}

function addLaneOffset(enemy, fromX, fromZ, targetX, targetZ, amount = 0.42) {
  const dx = targetX - fromX;
  const dz = targetZ - fromZ;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const sideX = -dz / length;
  const sideZ = dx / length;
  const seed = Number(enemy?.squadSeed);
  const sign = Number.isFinite(seed) && seed < 0.5 ? -1 : 1;

  return {
    x: targetX + sideX * amount * sign,
    z: targetZ + sideZ * amount * sign
  };
}

function scoreCandidate(ex, ez, tx, tz, candidate, walls, feetY) {
  if (!isCandidateOpen(candidate.x, candidate.z, walls, feetY, 0.52)) {
    return Infinity;
  }

  if (!pathIsClear(ex, ez, candidate.x, candidate.z, walls, feetY, 0.46)) {
    return Infinity;
  }

  const firstLeg = flatDistance(ex, ez, candidate.x, candidate.z);
  const secondLeg = flatDistance(candidate.x, candidate.z, tx, tz);
  const secondBlocker = getFirstBlockingWall(
    candidate.x,
    candidate.z,
    tx,
    tz,
    walls,
    feetY,
    0.45
  );

  // A second blocker is allowed, but penalized. The next cached replan will
  // handle it after the enemy reaches this local waypoint.
  const blockerPenalty = secondBlocker ? 7.5 : 0;
  return firstLeg + secondLeg + blockerPenalty;
}

function getWallCornerCandidates(wall, clearance = 1.0) {
  const minX = Number(wall.minX) - clearance;
  const maxX = Number(wall.maxX) + clearance;
  const minZ = Number(wall.minZ) - clearance;
  const maxZ = Number(wall.maxZ) + clearance;

  return [
    { x: minX, z: minZ },
    { x: minX, z: maxZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ }
  ];
}

function getMapAnchorCandidates() {
  const anchors = MAP_ROUTE_ANCHORS[state.mapId] || MAP_ROUTE_ANCHORS.grid_bunker;
  return anchors.map(([x, z]) => ({ x, z }));
}

function chooseBestCandidate(enemy, desired, walls, candidates, type) {
  const ex = Number(enemy?.mesh?.position?.x) || 0;
  const ez = Number(enemy?.mesh?.position?.z) || 0;
  const tx = Number(desired?.x) || 0;
  const tz = Number(desired?.z) || 0;
  const feetY = Number(enemy?.mesh?.position?.y) || 0;

  let best = null;
  let bestScore = Infinity;

  for (const rawCandidate of candidates) {
    const laneCandidate = addLaneOffset(
      enemy,
      ex,
      ez,
      rawCandidate.x,
      rawCandidate.z,
      type === 'anchor' ? 0.48 : 0.34
    );

    const score = scoreCandidate(
      ex,
      ez,
      tx,
      tz,
      laneCandidate,
      walls,
      feetY
    );

    if (score < bestScore) {
      bestScore = score;
      best = laneCandidate;
    }
  }

  return best;
}

function getTrapBounds(trap, padding = 1.15) {
  if (!trap?.center || trap.state !== 'ACTIVE') return null;

  const half = Math.max(0.5, (Number(trap.width) || 1) * 0.5);

  if (trap.isZAxis) {
    return {
      minX: trap.center.x - 0.55 - padding,
      maxX: trap.center.x + 0.55 + padding,
      minZ: trap.center.z - half - padding,
      maxZ: trap.center.z + half + padding
    };
  }

  return {
    minX: trap.center.x - half - padding,
    maxX: trap.center.x + half + padding,
    minZ: trap.center.z - 0.55 - padding,
    maxZ: trap.center.z + 0.55 + padding
  };
}

function segmentIntersectsBounds(x1, z1, x2, z2, bounds) {
  if (!bounds) return false;

  const pseudoWall = {
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ
  };

  return segmentIntersectsExpandedWall(
    x1,
    z1,
    x2,
    z2,
    pseudoWall,
    0,
    0
  );
}

function chooseTrapDetour(enemy, desired, traps, walls) {
  if (!enemy?.trapAware || !Array.isArray(traps)) return null;

  const ex = Number(enemy.mesh?.position?.x) || 0;
  const ez = Number(enemy.mesh?.position?.z) || 0;
  const tx = Number(desired?.x) || 0;
  const tz = Number(desired?.z) || 0;
  const feetY = Number(enemy.mesh?.position?.y) || 0;

  for (const trap of traps) {
    const bounds = getTrapBounds(trap);
    if (!bounds || !segmentIntersectsBounds(ex, ez, tx, tz, bounds)) continue;

    const clearance = 1.35;
    let candidates;

    if (trap.isZAxis) {
      // Field runs along Z, so route around its north/south endpoints.
      candidates = [
        { x: trap.center.x - 0.9, z: bounds.minZ - clearance },
        { x: trap.center.x + 0.9, z: bounds.minZ - clearance },
        { x: trap.center.x - 0.9, z: bounds.maxZ + clearance },
        { x: trap.center.x + 0.9, z: bounds.maxZ + clearance }
      ];
    } else {
      // Field runs along X, so route around its west/east endpoints.
      candidates = [
        { x: bounds.minX - clearance, z: trap.center.z - 0.9 },
        { x: bounds.minX - clearance, z: trap.center.z + 0.9 },
        { x: bounds.maxX + clearance, z: trap.center.z - 0.9 },
        { x: bounds.maxX + clearance, z: trap.center.z + 0.9 }
      ];
    }

    const chosen = chooseBestCandidate(enemy, desired, walls, candidates, 'trap');
    if (chosen) return chosen;
  }

  return null;
}

function ensureEnemyNavigationState(enemy) {
  if (!enemy) return;

  if (!Number.isFinite(enemy.navSampleTimer)) {
    enemy.navSampleTimer = Math.random() * NAV_SAMPLE_INTERVAL;
  }

  if (!Number.isFinite(enemy.navReplanTimer)) {
    enemy.navReplanTimer = NAV_REPLAN_MIN + Math.random() * (NAV_REPLAN_MAX - NAV_REPLAN_MIN);
  }

  if (!Number.isFinite(enemy.navWaypointTTL)) enemy.navWaypointTTL = 0;
  if (!Number.isFinite(enemy.navStuckTime)) enemy.navStuckTime = 0;
  if (!Number.isFinite(enemy.navRecoveryTimer)) enemy.navRecoveryTimer = 0;
  if (!Number.isFinite(enemy.navRolePenaltyT)) enemy.navRolePenaltyT = 0;
  if (!Number.isFinite(enemy.navLastX)) enemy.navLastX = Number(enemy.mesh?.position?.x) || 0;
  if (!Number.isFinite(enemy.navLastZ)) enemy.navLastZ = Number(enemy.mesh?.position?.z) || 0;
  if (!Number.isFinite(enemy.navLastTargetDistance)) enemy.navLastTargetDistance = Infinity;
  if (!Number.isFinite(enemy.navContactRefreshTimer)) enemy.navContactRefreshTimer = 0;
  if (!Number.isFinite(enemy.navContactPlayerX)) enemy.navContactPlayerX = Number(enemy.mesh?.position?.x) || 0;
  if (!Number.isFinite(enemy.navContactPlayerZ)) enemy.navContactPlayerZ = Number(enemy.mesh?.position?.z) || 0;
  if (!enemy.navContactTarget) enemy.navContactTarget = { x: 0, z: 0 };
  if (typeof enemy.navContactTargetValid !== 'boolean') enemy.navContactTargetValid = false;
  if (typeof enemy.navUsingContactTarget !== 'boolean') enemy.navUsingContactTarget = false;
  if (typeof enemy.navCornerContactOverride !== 'boolean') enemy.navCornerContactOverride = false;
  if (!enemy.navWaypoint) enemy.navWaypoint = { x: 0, z: 0, active: false, type: 'none' };
  if (!Number.isFinite(enemy.navRecoverySide)) {
    enemy.navRecoverySide = Number(enemy.squadSeed) < 0.5 ? -1 : 1;
  }
}

function requestRoleReset(enemy) {
  if (!enemy || enemy.navNeedsRoleReset) return;

  enemy.navNeedsRoleReset = true;
  enemy.navRolePenaltyT = NAV_ROLE_PENALTY;
  state.roleResetRequests++;
}

function updateProgressState(enemy, dt, desired) {
  ensureEnemyNavigationState(enemy);

  enemy.navSampleTimer -= dt;
  enemy.navRolePenaltyT = Math.max(0, enemy.navRolePenaltyT - dt);
  enemy.navRecoveryTimer = Math.max(0, enemy.navRecoveryTimer - dt);
  enemy.navWaypointTTL = Math.max(0, enemy.navWaypointTTL - dt);

  if (enemy.navSampleTimer > 0) return;

  const sampleDt = NAV_SAMPLE_INTERVAL;
  enemy.navSampleTimer = sampleDt;

  const ex = Number(enemy.mesh?.position?.x) || 0;
  const ez = Number(enemy.mesh?.position?.z) || 0;
  const moved = flatDistance(ex, ez, enemy.navLastX, enemy.navLastZ);
  const targetDistance = flatDistance(ex, ez, Number(desired?.x) || 0, Number(desired?.z) || 0);
  const progress = enemy.navLastTargetDistance - targetDistance;
  const expectsMovement = targetDistance > Math.max(1.25, Number(enemy.attackRange) || 1.2);

  if (expectsMovement && moved < 0.075 && progress < 0.045) {
    enemy.navStuckTime += sampleDt;
  } else if (moved > 0.14 || progress > 0.08) {
    enemy.navStuckTime = Math.max(0, enemy.navStuckTime - sampleDt * 1.8);
  } else {
    enemy.navStuckTime = Math.max(0, enemy.navStuckTime - sampleDt * 0.35);
  }

  if (enemy.navStuckTime >= NAV_STUCK_ROLE_RESET) {
    requestRoleReset(enemy);
  }

  if (enemy.navStuckTime >= NAV_STUCK_SEVERE) {
    enemy.navWaypoint.active = false;
    enemy.navWaypointTTL = 0;
    enemy.navRecoveryTimer = Math.max(enemy.navRecoveryTimer, 1.05);
    enemy.navRecoverySide *= -1;
    enemy.navStuckTime = NAV_STUCK_START;
  } else if (enemy.navStuckTime >= NAV_STUCK_START) {
    enemy.navRecoveryTimer = Math.max(enemy.navRecoveryTimer, 0.72);
  }

  enemy.navLastX = ex;
  enemy.navLastZ = ez;
  enemy.navLastTargetDistance = targetDistance;
}

function chooseRecoveryTarget(enemy, desired, walls) {
  const ex = Number(enemy.mesh?.position?.x) || 0;
  const ez = Number(enemy.mesh?.position?.z) || 0;
  const tx = Number(desired?.x) || 0;
  const tz = Number(desired?.z) || 0;
  const feetY = Number(enemy.mesh?.position?.y) || 0;

  const dx = tx - ex;
  const dz = tz - ez;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const sideX = -dz / length;
  const sideZ = dx / length;
  const forwardX = dx / length;
  const forwardZ = dz / length;

  const distance = 1.8 + Math.min(1.2, enemy.navStuckTime * 0.35);
  const sign = enemy.navRecoverySide || 1;

  const candidates = [
    {
      x: ex + sideX * distance * sign + forwardX * 0.55,
      z: ez + sideZ * distance * sign + forwardZ * 0.55
    },
    {
      x: ex - sideX * distance * sign + forwardX * 0.55,
      z: ez - sideZ * distance * sign + forwardZ * 0.55
    },
    {
      x: ex - forwardX * 0.65 + sideX * distance * sign,
      z: ez - forwardZ * 0.65 + sideZ * distance * sign
    }
  ];

  for (const candidate of candidates) {
    if (
      isCandidateOpen(candidate.x, candidate.z, walls, feetY, 0.48) &&
      pathIsClear(ex, ez, candidate.x, candidate.z, walls, feetY, 0.40)
    ) {
      return candidate;
    }
  }

  return null;
}

function setWaypoint(enemy, point, type) {
  enemy.navWaypoint.x = point.x;
  enemy.navWaypoint.z = point.z;
  enemy.navWaypoint.active = true;
  enemy.navWaypoint.type = type;
  enemy.navWaypointTTL = NAV_WAYPOINT_TTL;

  if (type === 'trap') state.trapDetours++;
  else if (type === 'anchor') state.anchorDetours++;
  else if (type === 'corner') state.wallCornerDetours++;
}

function replanEnemy(enemy, desired, walls, traps) {
  const ex = Number(enemy.mesh?.position?.x) || 0;
  const ez = Number(enemy.mesh?.position?.z) || 0;
  const tx = Number(desired?.x) || 0;
  const tz = Number(desired?.z) || 0;
  const feetY = Number(enemy.mesh?.position?.y) || 0;

  enemy.navReplanTimer = NAV_REPLAN_MIN + Math.random() * (NAV_REPLAN_MAX - NAV_REPLAN_MIN);

  if (enemy.navRecoveryTimer > 0) {
    const recovery = chooseRecoveryTarget(enemy, desired, walls);
    if (recovery) {
      setWaypoint(enemy, recovery, 'recovery');
      return;
    }
  }

  const trapDetour = chooseTrapDetour(enemy, desired, traps, walls);
  if (trapDetour) {
    setWaypoint(enemy, trapDetour, 'trap');
    return;
  }

  const blocker = getFirstBlockingWall(ex, ez, tx, tz, walls, feetY, NAV_CLEARANCE);

  if (!blocker) {
    enemy.navWaypoint.active = false;
    enemy.navWaypointTTL = 0;
    return;
  }

  const cornerCandidates = getWallCornerCandidates(
    blocker,
    NAV_CLEARANCE + Math.max(0.55, Number(enemy.colRadius) || 0.45)
  );
  const corner = chooseBestCandidate(enemy, desired, walls, cornerCandidates, 'corner');

  if (corner) {
    setWaypoint(enemy, corner, 'corner');
    return;
  }

  const anchors = getMapAnchorCandidates();
  const anchor = chooseBestCandidate(enemy, desired, walls, anchors, 'anchor');

  if (anchor) {
    setWaypoint(enemy, anchor, 'anchor');
    return;
  }

  // No safe local detour was found. Abandon specialist positioning for a few
  // seconds and retry direct pursuit on the next staggered plan.
  requestRoleReset(enemy);
  enemy.navWaypoint.active = false;
  enemy.navWaypointTTL = 0;
}

export function resetAINavigationRun({ mapId = 'grid_bunker' } = {}) {
  state.runActive = true;
  state.mapId = String(mapId || 'grid_bunker');
  state.wave = 1;
  state.plannedEnemies = 0;
  state.detouringEnemies = 0;
  state.recoveringEnemies = 0;
  state.stuckEnemies = 0;
  state.roleResetRequests = 0;
  state.trapDetours = 0;
  state.anchorDetours = 0;
  state.wallCornerDetours = 0;
  state.contactApproachEnemies = 0;
  state.cornerContactOverrides = 0;
}

export function endAINavigationRun() {
  state.runActive = false;
  state.plannedEnemies = 0;
  state.detouringEnemies = 0;
  state.recoveringEnemies = 0;
  state.stuckEnemies = 0;
  state.contactApproachEnemies = 0;
  state.cornerContactOverrides = 0;
}

export function beginAINavigationWave(waveNumber) {
  state.wave = Math.max(1, Number(waveNumber) || 1);
  state.plannedEnemies = 0;
  state.detouringEnemies = 0;
  state.recoveringEnemies = 0;
  state.stuckEnemies = 0;
  state.contactApproachEnemies = 0;
  state.cornerContactOverrides = 0;
}

export function registerNavigationEnemy(enemy) {
  if (!enemy) return;

  // Pooled enemies must never inherit a previous zombie's cached route.
  enemy.navSampleTimer = Math.random() * NAV_SAMPLE_INTERVAL;
  enemy.navReplanTimer = Math.random() * NAV_REPLAN_MAX;
  enemy.navWaypointTTL = 0;
  enemy.navStuckTime = 0;
  enemy.navRecoveryTimer = 0;
  enemy.navRolePenaltyT = 0;
  enemy.navNeedsRoleReset = false;
  enemy.navLastX = Number(enemy.mesh?.position?.x) || 0;
  enemy.navLastZ = Number(enemy.mesh?.position?.z) || 0;
  enemy.navLastTargetDistance = Infinity;
  enemy.navContactRefreshTimer = 0;
  enemy.navContactPlayerX = Number(enemy.mesh?.position?.x) || 0;
  enemy.navContactPlayerZ = Number(enemy.mesh?.position?.z) || 0;
  enemy.navContactTarget = { x: 0, z: 0 };
  enemy.navContactTargetValid = false;
  enemy.navUsingContactTarget = false;
  enemy.navCornerContactOverride = false;
  enemy.navRecoverySide = Number(enemy.squadSeed) < 0.5 ? -1 : 1;
  enemy.navWaypoint = {
    x: 0,
    z: 0,
    active: false,
    type: 'none'
  };
}

export function getReliableNavigationTarget(
  enemy,
  playerState,
  desiredTarget,
  walls,
  traps,
  outTarget,
  dt = 0
) {
  const out = outTarget || { x: 0, z: 0 };
  const desiredX = Number(desiredTarget?.x);
  const desiredZ = Number(desiredTarget?.z);
  const fallbackX = Number(playerState?.pos?.x) || 0;
  const fallbackZ = Number(playerState?.pos?.z) || 0;

  out.x = Number.isFinite(desiredX) ? desiredX : fallbackX;
  out.z = Number.isFinite(desiredZ) ? desiredZ : fallbackZ;

  if (!state.runActive || !enemy?.alive || !enemy.mesh?.position) {
    return out;
  }

  ensureEnemyNavigationState(enemy);

  const ex = Number(enemy.mesh.position.x) || 0;
  const ez = Number(enemy.mesh.position.z) || 0;
  const feetY = Number(enemy.mesh.position.y) || 0;
  const playerDistance = flatDistance(ex, ez, fallbackX, fallbackZ);
  const desiredTracksPlayer = flatDistance(out.x, out.z, fallbackX, fallbackZ) <= 0.85;
  const directPressureRequested = Boolean(
    enemy.type !== 'RANGED' &&
    (
      desiredTracksPlayer ||
      enemy.squadDirectPressure ||
      enemy.formationDirectPressure ||
      playerDistance <= getContactOverrideDistance(enemy)
    )
  );

  enemy.navUsingContactTarget = false;
  enemy.navCornerContactOverride = false;

  const hasContactTarget = directPressureRequested && getPlayerContactTarget(
    enemy,
    playerState,
    walls || [],
    out,
    dt
  );
  const hasDirectPath = directPressureRequested &&
    hasContactTarget &&
    !pathCrossesActiveTrap(enemy, ex, ez, out.x, out.z, traps || []) &&
    pathIsClear(
      ex,
      ez,
      out.x,
      out.z,
      walls || [],
      feetY,
      clamp((Number(enemy.colRadius) || 0.45) * 0.45, 0.16, 0.30)
    );

  if (hasDirectPath) {
    // A stale flank/recovery waypoint can otherwise pull a melee enemy away
    // after the player stops. Direct contact wins whenever the path is clear.
    enemy.navWaypoint.active = false;
    enemy.navWaypointTTL = 0;
    enemy.navRecoveryTimer = 0;
    enemy.navStuckTime = Math.max(0, enemy.navStuckTime - clamp(dt, 0, 0.05) * 2.5);
    enemy.navLastTargetDistance = playerDistance;
    return out;
  }

  updateProgressState(enemy, clamp(dt, 0, 0.05), out);

  enemy.navReplanTimer -= clamp(dt, 0, 0.05);

  if (
    enemy.navWaypoint.active &&
    (
      enemy.navWaypointTTL <= 0 ||
      flatDistance(ex, ez, enemy.navWaypoint.x, enemy.navWaypoint.z) < 0.72
    )
  ) {
    enemy.navWaypoint.active = false;
  }

  if (enemy.navReplanTimer <= 0) {
    replanEnemy(enemy, out, walls || [], traps || []);
  }

  if (enemy.navWaypoint.active) {
    out.x = enemy.navWaypoint.x;
    out.z = enemy.navWaypoint.z;
  }

  return out;
}

export function recordNavigationEnemyRemoved(enemy) {
  if (!enemy) return;

  enemy.navWaypoint && (enemy.navWaypoint.active = false);
  enemy.navNeedsRoleReset = false;
  enemy.navRecoveryTimer = 0;
  enemy.navContactTargetValid = false;
  enemy.navUsingContactTarget = false;
  enemy.navCornerContactOverride = false;
}

export function updateAINavigationDebug(enemies) {
  if (!state.runActive || !Array.isArray(enemies)) return;

  let planned = 0;
  let detouring = 0;
  let recovering = 0;
  let stuck = 0;
  let contactApproach = 0;
  let cornerContact = 0;

  for (const enemy of enemies) {
    if (!enemy?.alive || enemy.dyingT >= 0) continue;
    planned++;
    if (enemy.navWaypoint?.active) detouring++;
    if ((enemy.navRecoveryTimer || 0) > 0) recovering++;
    if ((enemy.navStuckTime || 0) >= NAV_STUCK_START) stuck++;
    if (enemy.navUsingContactTarget) contactApproach++;
    if (enemy.navCornerContactOverride) cornerContact++;
  }

  state.contactApproachEnemies = contactApproach;
  state.cornerContactOverrides = cornerContact;
  state.plannedEnemies = planned;
  state.detouringEnemies = detouring;
  state.recoveringEnemies = recovering;
  state.stuckEnemies = stuck;
}

export function getAINavigationSnapshot() {
  return {
    active: state.runActive,
    mapId: state.mapId,
    wave: state.wave,
    plannedEnemies: state.plannedEnemies,
    detouringEnemies: state.detouringEnemies,
    recoveringEnemies: state.recoveringEnemies,
    stuckEnemies: state.stuckEnemies,
    roleResetRequests: state.roleResetRequests,
    trapDetours: state.trapDetours,
    anchorDetours: state.anchorDetours,
    wallCornerDetours: state.wallCornerDetours,
    contactApproachEnemies: state.contactApproachEnemies,
    cornerContactOverrides: state.cornerContactOverrides
  };
}

if (typeof window !== 'undefined') {
  window.KAGetAINavigation = getAINavigationSnapshot;
}
