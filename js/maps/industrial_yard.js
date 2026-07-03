// js/maps/industrial_yard.js
// Industrial Yard map builder.
// Single-floor arena with perimeter walls, shipping containers, barricades, and electric traps.

import * as THREE from 'three';
import { createMapFloor } from './map_helpers.js';

const YARD_WIDTH = 84;
const YARD_DEPTH = 84;
const WALL_HEIGHT = 4.5;
const WALL_THICKNESS = 2;

function addBlock(context, options) {
  const {
    w,
    h,
    d,
    x,
    z,
    color = 0x3a3a4a,
    isWall = true,
    isDoor = false
  } = options;

  return context.spawnBlock(
    w,
    h,
    d,
    x,
    h / 2,
    z,
    color,
    isWall,
    isDoor
  );
}

function addZombieSpawn(context, x, z, locked = false) {
  const pt = new THREE.Vector3(x, 0, z);

  if (locked) {
    context.lockedSpawnPoints.push(pt);
  } else {
    context.spawnPoints.push(pt);
  }
}

function addPlayerSpawn(context, x, z) {
  context.playerSpawnPoints.push(new THREE.Vector3(x, 0, z));
}

function addContainer(context, x, z, w = 14, d = 4, color = 0x1f5f7a) {
  addBlock(context, {
    w,
    h: 3.2,
    d,
    x,
    z,
    color,
    isWall: true
  });

  // Slight raised cap so containers read better from preview/top view.
  addBlock(context, {
    w: w + 0.25,
    h: 0.18,
    d: d + 0.25,
    x,
    z,
    color: 0x163b4d,
    isWall: false
  });
}

function addCrateStack(context, x, z) {
  addBlock(context, {
    w: 3,
    h: 1.4,
    d: 3,
    x,
    z,
    color: 0x7a5630,
    isWall: true
  });

  addBlock(context, {
    w: 2.4,
    h: 1.2,
    d: 2.4,
    x: x + 0.45,
    z: z - 0.35,
    color: 0x6a4728,
    isWall: true
  });
}

function addLowCover(context, x, z, w = 6, d = 2) {
  addBlock(context, {
    w,
    h: 1.2,
    d,
    x,
    z,
    color: 0x55504a,
    isWall: true
  });
}

export function buildIndustrialYard(context) {
  const {
    scene,
    mapMeshes,
    spawnBarricade,
    spawnTrap
  } = context;

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x242629,
    roughness: 0.92,
    metalness: 0.05
  });

  const floorMesh = createMapFloor(
    {
      scene,
      mapMeshes
    },
    {
      width: YARD_WIDTH,
      depth: YARD_DEPTH,
      material: floorMaterial
    }
  );

  // Perimeter walls.
  addBlock(context, {
    w: YARD_WIDTH,
    h: WALL_HEIGHT,
    d: WALL_THICKNESS,
    x: 0,
    z: -YARD_DEPTH / 2,
    color: 0x33363c
  });

  addBlock(context, {
    w: YARD_WIDTH,
    h: WALL_HEIGHT,
    d: WALL_THICKNESS,
    x: 0,
    z: YARD_DEPTH / 2,
    color: 0x33363c
  });

  addBlock(context, {
    w: WALL_THICKNESS,
    h: WALL_HEIGHT,
    d: YARD_DEPTH,
    x: -YARD_WIDTH / 2,
    z: 0,
    color: 0x33363c
  });

  addBlock(context, {
    w: WALL_THICKNESS,
    h: WALL_HEIGHT,
    d: YARD_DEPTH,
    x: YARD_WIDTH / 2,
    z: 0,
    color: 0x33363c
  });

  // Shipping containers — placed away from current shop spawn pools.
  addContainer(context, -24, 24, 16, 4, 0x1f5f7a);
  addContainer(context, 24, -24, 16, 4, 0x6f2e23);
  addContainer(context, 28, 10, 4, 16, 0x245f3d);
  addContainer(context, -28, -10, 4, 16, 0x6f2e23);
  addContainer(context, -24, -28, 12, 4, 0x1f5f7a);
  addContainer(context, 24, 28, 12, 4, 0x245f3d);

  // Low cover and crates.
  addLowCover(context, 0, 32, 12, 2);
  addLowCover(context, 0, -34, 12, 2);
  addLowCover(context, -32, 8, 2, 10);
  addLowCover(context, 32, -8, 2, 10);

  addCrateStack(context, -22, 6);
  addCrateStack(context, 22, -6);
  addCrateStack(context, -6, 28);
  addCrateStack(context, 8, -28);

  // Repairable barricades.
  if (spawnBarricade) {
    spawnBarricade(-18, 0, Math.PI / 2);
    spawnBarricade(18, 0, Math.PI / 2);
    spawnBarricade(0, 18, 0);
  }

  // Electric traps.
  if (spawnTrap) {
    spawnTrap(0, -30, 18, false);
    spawnTrap(30, 0, 18, true);
  }

  // Open-floor zombie/player spawn candidates.
  addZombieSpawn(context, -34, -34);
  addZombieSpawn(context, 0, -36);
  addZombieSpawn(context, 34, -34);

  addZombieSpawn(context, -36, 0);
  addZombieSpawn(context, 36, 0);

  addZombieSpawn(context, -34, 34);
  addZombieSpawn(context, 0, 36);
  addZombieSpawn(context, 34, 34);

  addZombieSpawn(context, -16, -30);
  addZombieSpawn(context, 16, 30);
  addZombieSpawn(context, -30, 16);
  addZombieSpawn(context, 30, -16);

  // Dedicated player start points.
  // These are separate from zombie spawn candidates.
  addPlayerSpawn(context, -8, 8);
  addPlayerSpawn(context, 8, -8);
  addPlayerSpawn(context, 0, 0);
  
  return {
    floorMesh,
    width: YARD_WIDTH,
    depth: YARD_DEPTH
  };
}