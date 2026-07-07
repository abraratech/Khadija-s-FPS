// js/map_validation.js
// C12 — Build-time map and spawn validation.
// Runs only when an arena is built, so gameplay frames do not pay the cost.

const state = {
  mapId: 'unknown',
  valid: false,
  checkedAt: 0,
  width: 0,
  depth: 0,
  zombieSpawns: 0,
  playerSpawns: 0,
  lockedSpawns: 0,
  insideWallSpawns: [],
  outOfBoundsSpawns: [],
  duplicateSpawns: [],
  unsafePlayerPairs: [],
  unreachableZombieSpawns: [],
  reachableSpawnCount: 0,
  openCells: 0,
  reachableCells: 0,
  coverage: 0,
  warnings: [],
  errors: []
};

let lastContext = null;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function flatDistance(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function pointInsideWall(point, wall, padding = 0.22) {
  if (!point || !wall) return false;
  return (
    finite(point.x) >= finite(wall.minX) - padding &&
    finite(point.x) <= finite(wall.maxX) + padding &&
    finite(point.z) >= finite(wall.minZ) - padding &&
    finite(point.z) <= finite(wall.maxZ) + padding
  );
}

function pointInsideBounds(point, width, depth, padding = 0.5) {
  const halfW = Math.max(1, finite(width, 80) * 0.5) - padding;
  const halfD = Math.max(1, finite(depth, 80) * 0.5) - padding;
  return Math.abs(finite(point?.x)) <= halfW && Math.abs(finite(point?.z)) <= halfD;
}

function findDuplicatePoints(points, prefix) {
  const duplicates = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (flatDistance(points[i], points[j]) < 0.55) {
        duplicates.push(`${prefix}${i + 1}/${prefix}${j + 1}`);
      }
    }
  }
  return duplicates;
}

function buildReachabilityGrid({ width, depth, walls, cellSize = 2.5 }) {
  const cols = Math.max(3, Math.floor(width / cellSize));
  const rows = Math.max(3, Math.floor(depth / cellSize));
  const minX = -width * 0.5 + cellSize * 0.5;
  const minZ = -depth * 0.5 + cellSize * 0.5;
  const open = new Uint8Array(cols * rows);

  const index = (col, row) => row * cols + col;
  const world = (col, row) => ({
    x: minX + col * cellSize,
    z: minZ + row * cellSize
  });

  let openCount = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const point = world(col, row);
      const blocked = walls.some((wall) => pointInsideWall(point, wall, 0.48));
      if (!blocked) {
        open[index(col, row)] = 1;
        openCount++;
      }
    }
  }

  function nearestOpenCell(point) {
    let baseCol = Math.round((finite(point?.x) - minX) / cellSize);
    let baseRow = Math.round((finite(point?.z) - minZ) / cellSize);
    baseCol = Math.max(0, Math.min(cols - 1, baseCol));
    baseRow = Math.max(0, Math.min(rows - 1, baseRow));

    for (let radius = 0; radius <= 3; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const col = baseCol + dx;
          const row = baseRow + dz;
          if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
          if (open[index(col, row)]) return { col, row };
        }
      }
    }
    return null;
  }

  function floodFrom(point) {
    const start = nearestOpenCell(point);
    const visited = new Uint8Array(cols * rows);
    if (!start) return { visited, count: 0 };

    const queueCols = new Int16Array(cols * rows);
    const queueRows = new Int16Array(cols * rows);
    let head = 0;
    let tail = 0;
    queueCols[tail] = start.col;
    queueRows[tail] = start.row;
    tail++;
    visited[index(start.col, start.row)] = 1;
    let count = 0;

    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < tail) {
      const col = queueCols[head];
      const row = queueRows[head];
      head++;
      count++;

      for (const [dx, dz] of directions) {
        const nextCol = col + dx;
        const nextRow = row + dz;
        if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) continue;
        const nextIndex = index(nextCol, nextRow);
        if (!open[nextIndex] || visited[nextIndex]) continue;
        visited[nextIndex] = 1;
        queueCols[tail] = nextCol;
        queueRows[tail] = nextRow;
        tail++;
      }
    }

    return { visited, count };
  }

  return { cols, rows, open, openCount, index, nearestOpenCell, floodFrom };
}

function validate(context) {
  const mapId = String(context?.mapId || 'unknown');
  const walls = Array.isArray(context?.walls) ? context.walls : [];
  const zombieSpawns = Array.isArray(context?.spawnPoints) ? context.spawnPoints : [];
  const playerSpawns = Array.isArray(context?.playerSpawnPoints) ? context.playerSpawnPoints : [];
  const lockedSpawns = Array.isArray(context?.lockedSpawnPoints) ? context.lockedSpawnPoints : [];
  const width = Math.max(20, finite(context?.width, 80));
  const depth = Math.max(20, finite(context?.depth, 80));
  const cellSize = Math.max(1.75, finite(context?.navigationCellSize, 2.5));

  const allZombieSpawns = [...zombieSpawns, ...lockedSpawns];
  const insideWallSpawns = [];
  const outOfBoundsSpawns = [];
  const unsafePlayerPairs = [];

  allZombieSpawns.forEach((point, index) => {
    if (walls.some((wall) => pointInsideWall(point, wall, 0.28))) {
      insideWallSpawns.push(`Z${index + 1}`);
    }
    if (!pointInsideBounds(point, width, depth, 0.25)) {
      outOfBoundsSpawns.push(`Z${index + 1}`);
    }
  });

  playerSpawns.forEach((point, index) => {
    if (walls.some((wall) => pointInsideWall(point, wall, 0.42))) {
      insideWallSpawns.push(`P${index + 1}`);
    }
    if (!pointInsideBounds(point, width, depth, 0.25)) {
      outOfBoundsSpawns.push(`P${index + 1}`);
    }

    allZombieSpawns.forEach((zombiePoint, zIndex) => {
      const distance = flatDistance(point, zombiePoint);
      if (distance < 6.0) {
        unsafePlayerPairs.push(`P${index + 1}-Z${zIndex + 1}:${distance.toFixed(1)}m`);
      }
    });
  });

  const duplicateSpawns = [
    ...findDuplicatePoints(allZombieSpawns, 'Z'),
    ...findDuplicatePoints(playerSpawns, 'P')
  ];

  const grid = buildReachabilityGrid({ width, depth, walls, cellSize });
  const flood = grid.floodFrom(playerSpawns[0] || { x: 0, z: 0 });
  const unreachableZombieSpawns = [];
  let reachableSpawnCount = 0;

  allZombieSpawns.forEach((point, index) => {
    const cell = grid.nearestOpenCell(point);
    if (!cell || !flood.visited[grid.index(cell.col, cell.row)]) {
      unreachableZombieSpawns.push(`Z${index + 1}`);
    } else {
      reachableSpawnCount++;
    }
  });

  const warnings = [];
  const errors = [];

  if (zombieSpawns.length < 8) warnings.push('Fewer than 8 open zombie spawns.');
  if (playerSpawns.length < 3) warnings.push('Fewer than 3 player spawn options.');
  if (lockedSpawns.length > 0 && !context?.hasUnlockRoute) {
    warnings.push('Locked spawns exist without an explicit unlock route.');
  }
  if (unsafePlayerPairs.length > 0) warnings.push(`${unsafePlayerPairs.length} player/zombie spawn pairs are closer than 6m.`);
  if (duplicateSpawns.length > 0) warnings.push(`${duplicateSpawns.length} duplicate or near-duplicate spawn pairs found.`);
  if (insideWallSpawns.length > 0) errors.push(`${insideWallSpawns.length} spawn points overlap collision.`);
  if (outOfBoundsSpawns.length > 0) errors.push(`${outOfBoundsSpawns.length} spawn points are outside arena bounds.`);
  if (unreachableZombieSpawns.length > 0) errors.push(`${unreachableZombieSpawns.length} zombie spawns are disconnected from the player navigation region.`);

  const coverage = grid.openCount > 0 ? flood.count / grid.openCount : 0;
  if (coverage < 0.82) warnings.push(`Navigation coverage is only ${(coverage * 100).toFixed(1)}%.`);

  Object.assign(state, {
    mapId,
    valid: errors.length === 0,
    checkedAt: Date.now(),
    width,
    depth,
    zombieSpawns: zombieSpawns.length,
    playerSpawns: playerSpawns.length,
    lockedSpawns: lockedSpawns.length,
    insideWallSpawns,
    outOfBoundsSpawns,
    duplicateSpawns,
    unsafePlayerPairs,
    unreachableZombieSpawns,
    reachableSpawnCount,
    openCells: grid.openCount,
    reachableCells: flood.count,
    coverage,
    warnings,
    errors
  });

  return getMapValidationSnapshot();
}

export function configureMapValidation(context = {}) {
  lastContext = context;
  const report = validate(context);
  if (report.valid) {
    console.log(`[MAP VALIDATION] ${report.mapId}: PASS · ${report.reachableSpawnCount}/${report.zombieSpawns + report.lockedSpawns} zombie spawns reachable · ${(report.coverage * 100).toFixed(1)}% coverage`);
  } else {
    console.warn(`[MAP VALIDATION] ${report.mapId}: FAIL`, report.errors, report.warnings);
  }
  return report;
}

export function revalidateCurrentMap() {
  if (!lastContext) return getMapValidationSnapshot();
  return validate(lastContext);
}

export function getMapValidationSnapshot() {
  return {
    ...state,
    insideWallSpawns: [...state.insideWallSpawns],
    outOfBoundsSpawns: [...state.outOfBoundsSpawns],
    duplicateSpawns: [...state.duplicateSpawns],
    unsafePlayerPairs: [...state.unsafePlayerPairs],
    unreachableZombieSpawns: [...state.unreachableZombieSpawns],
    warnings: [...state.warnings],
    errors: [...state.errors]
  };
}

if (typeof window !== 'undefined') {
  window.KAGetMapValidation = getMapValidationSnapshot;
  window.KAValidateMap = revalidateCurrentMap;
}
