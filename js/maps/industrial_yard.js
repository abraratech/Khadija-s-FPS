// js/maps/industrial_yard.js
// Industrial Yard map builder.
// Single-floor arena with perimeter walls, shipping containers, barricades, and electric traps.

import * as THREE from 'three';
function addIndustrialDressingBox(context, name, x, y, z, w, h, d, color, options = {}) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);

  if (options.rotationY) mesh.rotation.y = options.rotationY;
  if (options.rotationZ) mesh.rotation.z = options.rotationZ;

  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.isMapDressing = true;
  mesh.userData.noCollision = true;

  context.scene.add(mesh);
  context.mapMeshes.push(mesh);

  return mesh;
}

function addIndustrialDressingCylinder(context, name, x, y, z, radius, height, color, options = {}) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1
  });

  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);

  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.isMapDressing = true;
  mesh.userData.noCollision = true;

  context.scene.add(mesh);
  context.mapMeshes.push(mesh);

  return mesh;
}

function addHazardStripes(context, name, x, z, rotationY = 0) {
  addIndustrialDressingBox(context, `${name}_base`, x, 0.045, z, 4.8, 0.035, 0.9, 0x111111, { rotationY });

  for (let i = -2; i <= 2; i++) {
    addIndustrialDressingBox(
      context,
      `${name}_stripe_${i + 3}`,
      x + i * Math.cos(rotationY) * 0.75,
      0.075,
      z + i * Math.sin(rotationY) * 0.75,
      0.38,
      0.04,
      0.95,
      0xffc400,
      {
        rotationY,
        rotationZ: 0.45
      }
    );
  }
}

function addIndustrialYardDressing(context) {
  // Amber work lights and poles.
  addIndustrialDressingBox(context, 'yard_work_pole_a', -31, 1.7, -31, 0.08, 3.2, 0.08, 0x151515);
  addIndustrialDressingBox(context, 'yard_work_light_a', -31, 3.35, -31, 0.7, 0.28, 0.12, 0xffbb55);

  addIndustrialDressingBox(context, 'yard_work_pole_b', 31, 1.7, 31, 0.08, 3.2, 0.08, 0x151515);
  addIndustrialDressingBox(context, 'yard_work_light_b', 31, 3.35, 31, 0.7, 0.28, 0.12, 0xffbb55);

  addIndustrialDressingBox(context, 'yard_work_pole_c', -31, 1.7, 31, 0.08, 3.2, 0.08, 0x151515);
  addIndustrialDressingBox(context, 'yard_work_light_c', -31, 3.35, 31, 0.7, 0.28, 0.12, 0xffbb55);

  // Ground hazard striping.
  addHazardStripes(context, 'yard_hazard_trap_a', 0, -26, 0);
  addHazardStripes(context, 'yard_hazard_center_a', -14, 0, Math.PI / 2);
  addHazardStripes(context, 'yard_hazard_center_b', 14, 0, Math.PI / 2);

  // Visual-only barrels near edges/containers.
  addIndustrialDressingCylinder(context, 'yard_barrel_a', -34, 0.45, 18, 0.34, 0.9, 0x7a2e18);
  addIndustrialDressingCylinder(context, 'yard_barrel_b', -32.8, 0.45, 19.1, 0.34, 0.9, 0x8a351c);
  addIndustrialDressingCylinder(context, 'yard_barrel_c', 34, 0.45, -18, 0.34, 0.9, 0x7a2e18);
  addIndustrialDressingCylinder(context, 'yard_barrel_d', 32.8, 0.45, -19.1, 0.34, 0.9, 0x8a351c);

  // Small scrap plates / dust stains.
  addIndustrialDressingBox(context, 'yard_dust_patch_a', -8, 0.035, -12, 5.5, 0.025, 3.0, 0x2c1a0e, { opacity: 0.45, rotationY: 0.25 });
  addIndustrialDressingBox(context, 'yard_dust_patch_b', 16, 0.035, 10, 4.8, 0.025, 3.4, 0x2f1c10, { opacity: 0.42, rotationY: -0.45 });
  addIndustrialDressingBox(context, 'yard_scrap_plate_a', -24, 0.055, -2, 2.2, 0.04, 1.0, 0x2a2a2a, { rotationY: 0.4 });
  addIndustrialDressingBox(context, 'yard_scrap_plate_b', 24, 0.055, 2, 2.2, 0.04, 1.0, 0x2a2a2a, { rotationY: -0.4 });
}

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
  
  addIndustrialYardDressing(context);

  return {
    floorMesh,
    width: YARD_WIDTH,
    depth: YARD_DEPTH
  };
}