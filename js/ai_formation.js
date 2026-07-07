// js/ai_formation.js
// C10.9 — Horde Coordination and AI Finalization
//
// Lightweight, performance-budgeted formation layer. It assigns stable approach
// lanes, reserves unique local slots, separates special enemies, detects crowd
// jams, and temporarily creates a breach leader when a narrow approach becomes
// congested. This is local steering—not a navmesh—and always feeds its target
// through ai_navigation.js before movement is applied.

const FORMATION_ACTIVATION_WAVE = 9;
const BASE_UPDATE_INTERVAL = 0.26;
const MAX_UPDATE_INTERVAL = 0.42;
const ASSIGNMENT_REFRESH = 1.45;
const CELL_SIZE = 2.15;
const JAM_CELL_OCCUPANCY = 3;
const BREACH_CELL_OCCUPANCY = 4;
const JAM_CONFIRM_TIME = 0.62;
const JAM_SEVERE_TIME = 1.45;
const YIELD_DURATION = 0.82;
const PERFORMANCE_BUDGET_MS = 1.65;
const MAX_NEIGHBOR_CHECKS = 280;

const state = {
  runActive: false,
  active: false,
  mapId: 'unknown',
  wave: 1,
  intensity: 0,
  updateTimer: 0,
  assignmentTimer: 0,
  assignmentEpoch: 0,
  lastSignature: '',
  forceAssignment: true,
  laneCounts: {},
  livingEnemies: 0,
  congestedCells: 0,
  maxCellOccupancy: 0,
  jammedEnemies: 0,
  yieldingEnemies: 0,
  specialSpacingAdjustments: 0,
  reassignments: 0,
  breachActive: false,
  breachLeadType: 'NONE',
  breachEvents: 0,
  breachCell: '',
  lastBreachCell: '',
  breachCooldown: 0,
  lastEvent: 'IDLE',
  lastUpdateMs: 0,
  averageUpdateMs: 0,
  overBudgetCount: 0,
  updateCount: 0,
  congestionPressure: 0
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

function getLivingEnemies(enemies) {
  if (!Array.isArray(enemies)) return [];
  return enemies.filter((enemy) => (
    enemy?.alive && enemy.dyingT < 0 && enemy.mesh?.position
  ));
}

function ensureFormationIdentity(enemy, fallbackIndex = 0) {
  if (!enemy) return;
  if (!Number.isFinite(enemy.formationId)) {
    enemy.formationId = Number.isFinite(enemy.squadId)
      ? enemy.squadId
      : fallbackIndex + 1;
  }
  if (!Number.isFinite(enemy.formationSeed)) {
    enemy.formationSeed = ((enemy.formationId * 1664525 + 1013904223) >>> 0) / 4294967295;
  }
}

function cellKey(x, z) {
  return `${Math.floor(finite(x) / CELL_SIZE)}:${Math.floor(finite(z) / CELL_SIZE)}`;
}

function chooseLane(enemy, index = 0) {
  const type = String(enemy?.type || 'SHAMBLER');
  const role = String(enemy?.squadRole || 'DIRECT');

  if (type === 'RANGED') return 'SUPPORT';
  if (type === 'EXPLODER') return 'BREACH';
  if (type === 'GOLIATH' || type === 'BRUTE') return 'ANCHOR';
  if (role === 'FLANK_LEFT') return 'LEFT';
  if (role === 'FLANK_RIGHT') return 'RIGHT';
  if (role === 'SUPPORT') return 'SUPPORT';
  if (role === 'BLOCKER') return 'REAR';
  if (role === 'BREACHER') return 'BREACH';
  if (role === 'ENCIRCLE') return index % 3 === 0 ? 'REAR' : (index % 2 ? 'LEFT' : 'RIGHT');
  if (role === 'INTERCEPT') return index % 2 ? 'LEFT' : 'RIGHT';
  return 'FRONT';
}

function assignStableLanes(living) {
  state.assignmentEpoch++;
  state.laneCounts = {};

  const sorted = [...living].sort((a, b) => {
    ensureFormationIdentity(a);
    ensureFormationIdentity(b);
    return a.formationId - b.formationId;
  });

  const laneMembers = new Map();
  sorted.forEach((enemy, index) => {
    const lane = chooseLane(enemy, index);
    if (!laneMembers.has(lane)) laneMembers.set(lane, []);
    laneMembers.get(lane).push(enemy);
  });

  for (const [lane, members] of laneMembers.entries()) {
    state.laneCounts[lane] = members.length;
    members.forEach((enemy, slot) => {
      enemy.formationLane = lane;
      enemy.formationSlot = slot;
      enemy.formationLaneCount = members.length;
      enemy.formationEpoch = state.assignmentEpoch;
      enemy.formationNeedsAssignment = false;
    });
  }

  state.lastEvent = `ASSIGNED ${sorted.length}`;
}

function getDesiredSpacing(a, b) {
  const specialA = ['RANGED', 'EXPLODER', 'BRUTE', 'GOLIATH'].includes(a.type);
  const specialB = ['RANGED', 'EXPLODER', 'BRUTE', 'GOLIATH'].includes(b.type);

  if (a.type === 'RANGED' || b.type === 'RANGED') return 2.85;
  if (a.type === 'EXPLODER' || b.type === 'EXPLODER') return 2.55;
  if (a.type === 'GOLIATH' || b.type === 'GOLIATH') return 2.35;
  if (a.type === 'BRUTE' || b.type === 'BRUTE') return 2.0;
  if (specialA || specialB) return 1.8;
  return 1.22;
}

function buildSpatialGrid(living) {
  const grid = new Map();
  living.forEach((enemy) => {
    const key = cellKey(enemy.mesh.position.x, enemy.mesh.position.z);
    enemy.formationCell = key;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(enemy);
  });
  return grid;
}

function chooseBreachLead(members, playerState) {
  const px = finite(playerState?.pos?.x);
  const pz = finite(playerState?.pos?.z);
  const typePriority = {
    GOLIATH: 5,
    BRUTE: 4,
    EXPLODER: 3,
    RUNNER: 2,
    CRAWLER: 1.5,
    SHAMBLER: 1,
    RANGED: 0
  };

  return [...members].sort((a, b) => {
    const ap = typePriority[a.type] || 0;
    const bp = typePriority[b.type] || 0;
    if (ap !== bp) return bp - ap;
    const ad = Math.hypot(px - a.mesh.position.x, pz - a.mesh.position.z);
    const bd = Math.hypot(px - b.mesh.position.x, pz - b.mesh.position.z);
    return ad - bd;
  })[0] || null;
}

function updateCongestionAndSpacing(living, grid, playerState, interval) {
  state.congestedCells = 0;
  state.maxCellOccupancy = 0;
  state.jammedEnemies = 0;
  state.yieldingEnemies = 0;
  state.specialSpacingAdjustments = 0;
  state.breachActive = false;
  state.breachLeadType = 'NONE';
  state.breachCell = '';

  living.forEach((enemy) => {
    enemy.formationRepulseX = 0;
    enemy.formationRepulseZ = 0;
    enemy.formationYieldT = Math.max(0, finite(enemy.formationYieldT) - interval);
    enemy.formationBreachLead = false;
    enemy.formationHoldBack = false;
  });

  let neighborChecks = 0;
  const checkedPairs = new Set();

  for (const members of grid.values()) {
    state.maxCellOccupancy = Math.max(state.maxCellOccupancy, members.length);
    if (members.length >= JAM_CELL_OCCUPANCY) state.congestedCells++;

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (++neighborChecks > MAX_NEIGHBOR_CHECKS) break;
        const a = members[i];
        const b = members[j];
        const pairKey = a.formationId < b.formationId
          ? `${a.formationId}:${b.formationId}`
          : `${b.formationId}:${a.formationId}`;
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);

        let dx = a.mesh.position.x - b.mesh.position.x;
        let dz = a.mesh.position.z - b.mesh.position.z;
        let dist = Math.hypot(dx, dz);
        const desired = getDesiredSpacing(a, b);
        if (dist >= desired) continue;

        if (dist < 0.001) {
          const sign = a.formationSeed < 0.5 ? -1 : 1;
          dx = sign * 0.01;
          dz = (1 - sign) * 0.01 + 0.01;
          dist = Math.hypot(dx, dz);
        }

        const strength = clamp((desired - dist) / desired, 0, 1) * 0.86;
        const nx = dx / dist;
        const nz = dz / dist;
        a.formationRepulseX += nx * strength;
        a.formationRepulseZ += nz * strength;
        b.formationRepulseX -= nx * strength;
        b.formationRepulseZ -= nz * strength;
        state.specialSpacingAdjustments++;
      }
      if (neighborChecks > MAX_NEIGHBOR_CHECKS) break;
    }
  }

  const px = finite(playerState?.pos?.x);
  const pz = finite(playerState?.pos?.z);
  let breachCandidate = null;

  for (const [key, members] of grid.entries()) {
    if (members.length < JAM_CELL_OCCUPANCY) {
      members.forEach((enemy) => {
        enemy.formationJamT = Math.max(0, finite(enemy.formationJamT) - interval * 1.5);
      });
      continue;
    }

    const avgX = members.reduce((sum, e) => sum + e.mesh.position.x, 0) / members.length;
    const avgZ = members.reduce((sum, e) => sum + e.mesh.position.z, 0) / members.length;
    const cellPlayerDistance = Math.hypot(px - avgX, pz - avgZ);

    members.forEach((enemy) => {
      const moved = Math.hypot(
        enemy.mesh.position.x - finite(enemy.formationLastX, enemy.mesh.position.x),
        enemy.mesh.position.z - finite(enemy.formationLastZ, enemy.mesh.position.z)
      );
      const navigationBlocked = finite(enemy.navStuckTime) >= 0.65 || finite(enemy.navRecoveryTimer) > 0;
      const jamEvidence = moved < 0.17 || navigationBlocked;

      if (jamEvidence && cellPlayerDistance > 2.2) {
        enemy.formationJamT = finite(enemy.formationJamT) + interval;
      } else {
        enemy.formationJamT = Math.max(0, finite(enemy.formationJamT) - interval);
      }

      enemy.formationLastX = enemy.mesh.position.x;
      enemy.formationLastZ = enemy.mesh.position.z;

      if (enemy.formationJamT >= JAM_CONFIRM_TIME) {
        state.jammedEnemies++;
      }

      if (enemy.formationYieldT > 0) state.yieldingEnemies++;

      if (enemy.formationJamT >= JAM_SEVERE_TIME && enemy.formationYieldT <= 0) {
        enemy.formationYieldT = YIELD_DURATION;
        enemy.formationJamT = JAM_CONFIRM_TIME * 0.55;
        enemy.formationSlot = Math.max(0, finite(enemy.formationSlot)) + 1;
        enemy.formationSideFlip = !enemy.formationSideFlip;
        state.reassignments++;
        state.lastEvent = `JAM REASSIGN ${enemy.type}`;
      }
    });

    if (
      members.length >= BREACH_CELL_OCCUPANCY &&
      cellPlayerDistance > 3.0 &&
      (!breachCandidate || members.length > breachCandidate.members.length)
    ) {
      breachCandidate = { key, members, distance: cellPlayerDistance };
    }
  }

  if (breachCandidate) {
    const lead = chooseBreachLead(breachCandidate.members, playerState);
    if (lead) {
      state.breachActive = true;
      state.breachLeadType = lead.type;
      state.breachCell = breachCandidate.key;
      lead.formationBreachLead = true;
      breachCandidate.members.forEach((enemy) => {
        if (enemy !== lead) enemy.formationHoldBack = true;
      });

      if (
        state.breachCooldown <= 0 &&
        state.lastBreachCell !== breachCandidate.key
      ) {
        state.breachEvents++;
        state.lastBreachCell = breachCandidate.key;
        state.breachCooldown = 2.4;
        state.lastEvent = `BREACH ${lead.type}`;
      }
    }
  }

  const livingCount = Math.max(1, living.length);
  state.congestionPressure = clamp(
    (state.jammedEnemies / livingCount) * 0.72 +
    (state.maxCellOccupancy / 7) * 0.28,
    0,
    1
  );
}

function updateFormationAssignments(living) {
  living.forEach((enemy, index) => ensureFormationIdentity(enemy, index));
  const signature = living
    .map((enemy) => enemy.formationId)
    .sort((a, b) => a - b)
    .join(',');

  const compositionChanged = signature !== state.lastSignature;
  const requested = living.some((enemy) => enemy.formationNeedsAssignment);

  if (
    state.forceAssignment ||
    compositionChanged ||
    requested ||
    state.assignmentTimer <= 0
  ) {
    assignStableLanes(living);
    state.lastSignature = signature;
    state.forceAssignment = false;
    state.assignmentTimer = ASSIGNMENT_REFRESH;
  }
}

export function resetAIFormationRun({ mapId = 'unknown' } = {}) {
  state.runActive = true;
  state.active = false;
  state.mapId = String(mapId || 'unknown');
  state.wave = 1;
  state.intensity = 0;
  state.updateTimer = 0;
  state.assignmentTimer = 0;
  state.assignmentEpoch = 0;
  state.lastSignature = '';
  state.forceAssignment = true;
  state.laneCounts = {};
  state.livingEnemies = 0;
  state.congestedCells = 0;
  state.maxCellOccupancy = 0;
  state.jammedEnemies = 0;
  state.yieldingEnemies = 0;
  state.specialSpacingAdjustments = 0;
  state.reassignments = 0;
  state.breachActive = false;
  state.breachLeadType = 'NONE';
  state.breachEvents = 0;
  state.breachCell = '';
  state.lastBreachCell = '';
  state.breachCooldown = 0;
  state.lastEvent = 'RESET';
  state.lastUpdateMs = 0;
  state.averageUpdateMs = 0;
  state.overBudgetCount = 0;
  state.updateCount = 0;
  state.congestionPressure = 0;
}

export function endAIFormationRun() {
  state.runActive = false;
  state.active = false;
  state.livingEnemies = 0;
  state.laneCounts = {};
  state.lastEvent = 'ENDED';
}

export function beginAIFormationWave(waveNumber) {
  state.wave = Math.max(1, Math.round(finite(waveNumber, 1)));
  state.updateTimer = 0;
  state.assignmentTimer = 0;
  state.forceAssignment = true;
  state.breachCooldown = 0;
  state.lastBreachCell = '';
}

export function registerFormationEnemy(enemy) {
  if (!enemy) return;
  ensureFormationIdentity(enemy);
  enemy.formationLane = 'DIRECT';
  enemy.formationSlot = 0;
  enemy.formationLaneCount = 1;
  enemy.formationEpoch = -1;
  enemy.formationNeedsAssignment = true;
  enemy.formationJamT = 0;
  enemy.formationYieldT = 0;
  enemy.formationSideFlip = false;
  enemy.formationRepulseX = 0;
  enemy.formationRepulseZ = 0;
  enemy.formationLastX = finite(enemy.mesh?.position?.x);
  enemy.formationLastZ = finite(enemy.mesh?.position?.z);
  enemy.formationBreachLead = false;
  enemy.formationHoldBack = false;
  state.forceAssignment = true;
}

export function recordFormationEnemyRemoved(enemy) {
  if (!enemy) return;
  enemy.formationNeedsAssignment = false;
  enemy.formationBreachLead = false;
  enemy.formationHoldBack = false;
  state.forceAssignment = true;
  state.assignmentTimer = 0;
}

export function updateAIFormation(dt, {
  enemies = [],
  player = null,
  tuning = {}
} = {}) {
  if (!state.runActive || !player?.alive) return;

  const safeDt = clamp(dt, 0, 0.05);
  state.wave = Math.max(1, Math.round(finite(tuning.wave, state.wave)));
  state.intensity = clamp(tuning.intensity, 0, 0.92);
  state.assignmentTimer -= safeDt;
  state.updateTimer -= safeDt;
  state.breachCooldown = Math.max(0, state.breachCooldown - safeDt);

  const living = getLivingEnemies(enemies);
  state.livingEnemies = living.length;
  state.active = Boolean(
    tuning.active &&
    state.wave >= FORMATION_ACTIVATION_WAVE &&
    living.length >= 5
  );

  if (!state.active) {
    state.laneCounts = {};
    state.congestedCells = 0;
    state.maxCellOccupancy = 0;
    state.jammedEnemies = 0;
    state.yieldingEnemies = 0;
    state.breachActive = false;
    state.congestionPressure = 0;
    return;
  }

  if (state.updateTimer > 0) return;

  const interval = clamp(
    BASE_UPDATE_INTERVAL + living.length * 0.0035 + (state.lastUpdateMs > PERFORMANCE_BUDGET_MS ? 0.05 : 0),
    BASE_UPDATE_INTERVAL,
    MAX_UPDATE_INTERVAL
  );
  state.updateTimer = interval;

  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  updateFormationAssignments(living);
  const grid = buildSpatialGrid(living);
  updateCongestionAndSpacing(living, grid, player, interval);
  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();

  state.lastUpdateMs = Math.max(0, ended - started);
  state.updateCount++;
  state.averageUpdateMs += (state.lastUpdateMs - state.averageUpdateMs) / Math.min(30, state.updateCount);
  if (state.lastUpdateMs > PERFORMANCE_BUDGET_MS) state.overBudgetCount++;
}

export function getFormationPursuitTarget(
  enemy,
  playerState,
  baseTarget,
  outTarget
) {
  const out = outTarget || { x: 0, z: 0 };
  const playerX = finite(playerState?.pos?.x);
  const playerZ = finite(playerState?.pos?.z);
  const enemyX = finite(enemy?.mesh?.position?.x);
  const enemyZ = finite(enemy?.mesh?.position?.z);

  out.x = finite(baseTarget?.x, playerX);
  out.z = finite(baseTarget?.z, playerZ);

  if (!state.active || !enemy?.alive) return out;

  const distToPlayer = Math.hypot(playerX - enemyX, playerZ - enemyZ);
  if (distToPlayer <= 2.45 || enemy.formationBreachLead) {
    out.x += clamp(enemy.formationRepulseX, -0.5, 0.5);
    out.z += clamp(enemy.formationRepulseZ, -0.5, 0.5);
    return out;
  }

  let forwardX = finite(playerState?.vel?.x);
  let forwardZ = finite(playerState?.vel?.z);
  let forwardLength = Math.hypot(forwardX, forwardZ);

  if (forwardLength < 0.35) {
    forwardX = playerX - enemyX;
    forwardZ = playerZ - enemyZ;
    forwardLength = Math.max(0.001, Math.hypot(forwardX, forwardZ));
  }

  forwardX /= Math.max(0.001, forwardLength);
  forwardZ /= Math.max(0.001, forwardLength);
  const sideX = -forwardZ;
  const sideZ = forwardX;

  const lane = String(enemy.formationLane || 'FRONT');
  const slot = Math.max(0, Math.round(finite(enemy.formationSlot)));
  const count = Math.max(1, Math.round(finite(enemy.formationLaneCount, 1)));
  const centeredSlot = slot - (count - 1) * 0.5;
  const flip = enemy.formationSideFlip ? -1 : 1;

  let targetX = playerX;
  let targetZ = playerZ;

  if (lane === 'LEFT') {
    const sideDistance = 3.2 + Math.min(2.2, slot * 0.62);
    targetX += sideX * sideDistance + forwardX * 0.85;
    targetZ += sideZ * sideDistance + forwardZ * 0.85;
  } else if (lane === 'RIGHT') {
    const sideDistance = 3.2 + Math.min(2.2, slot * 0.62);
    targetX -= sideX * sideDistance - forwardX * 0.85;
    targetZ -= sideZ * sideDistance - forwardZ * 0.85;
  } else if (lane === 'REAR') {
    targetX -= forwardX * (3.0 + slot * 0.55) + sideX * centeredSlot * 0.8;
    targetZ -= forwardZ * (3.0 + slot * 0.55) + sideZ * centeredSlot * 0.8;
  } else if (lane === 'SUPPORT') {
    const sign = slot % 2 === 0 ? 1 : -1;
    const sideDistance = 4.4 + Math.floor(slot / 2) * 1.15;
    targetX -= forwardX * 4.2;
    targetZ -= forwardZ * 4.2;
    targetX += sideX * sideDistance * sign;
    targetZ += sideZ * sideDistance * sign;
  } else if (lane === 'ANCHOR') {
    targetX += sideX * centeredSlot * 1.35;
    targetZ += sideZ * centeredSlot * 1.35;
  } else if (lane === 'BREACH') {
    targetX += sideX * centeredSlot * 1.55;
    targetZ += sideZ * centeredSlot * 1.55;
  } else {
    targetX += sideX * centeredSlot * 0.92;
    targetZ += sideZ * centeredSlot * 0.92;
    targetX += forwardX * Math.min(1.15, slot * 0.18);
    targetZ += forwardZ * Math.min(1.15, slot * 0.18);
  }

  const laneBlend = lane === 'SUPPORT' ? 0.48 : 0.38;
  out.x = out.x * (1 - laneBlend) + targetX * laneBlend;
  out.z = out.z * (1 - laneBlend) + targetZ * laneBlend;

  if (enemy.formationHoldBack) {
    out.x -= forwardX * 1.15;
    out.z -= forwardZ * 1.15;
  }

  if (enemy.formationYieldT > 0) {
    const sideYield = 1.25 * flip;
    out.x += sideX * sideYield - forwardX * 0.55;
    out.z += sideZ * sideYield - forwardZ * 0.55;
  }

  out.x += clamp(enemy.formationRepulseX, -1.1, 1.1);
  out.z += clamp(enemy.formationRepulseZ, -1.1, 1.1);

  return out;
}

export function getFormationMovementScale(enemy) {
  if (!state.active || !enemy?.alive) return 1;
  if (enemy.formationBreachLead) return 1.035;
  if (enemy.formationHoldBack) return 0.88;
  if (finite(enemy.formationYieldT) > 0) return 0.82;
  return 1;
}

export function getAIFormationSnapshot() {
  return {
    runActive: state.runActive,
    active: state.active,
    activationWave: FORMATION_ACTIVATION_WAVE,
    mapId: state.mapId,
    wave: state.wave,
    intensity: state.intensity,
    livingEnemies: state.livingEnemies,
    laneCounts: { ...state.laneCounts },
    congestedCells: state.congestedCells,
    maxCellOccupancy: state.maxCellOccupancy,
    jammedEnemies: state.jammedEnemies,
    yieldingEnemies: state.yieldingEnemies,
    specialSpacingAdjustments: state.specialSpacingAdjustments,
    reassignments: state.reassignments,
    breachActive: state.breachActive,
    breachLeadType: state.breachLeadType,
    breachEvents: state.breachEvents,
    breachCell: state.breachCell,
    congestionPressure: state.congestionPressure,
    lastEvent: state.lastEvent,
    lastUpdateMs: state.lastUpdateMs,
    averageUpdateMs: state.averageUpdateMs,
    overBudgetCount: state.overBudgetCount,
    performanceBudgetMs: PERFORMANCE_BUDGET_MS
  };
}

if (typeof window !== 'undefined') {
  window.KAGetAIFormation = getAIFormationSnapshot;
}
