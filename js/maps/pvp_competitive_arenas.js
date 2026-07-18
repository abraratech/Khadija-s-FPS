// PVP.4 R1 — dedicated competitive arenas.
// These maps use mirrored lanes, readable cover, authored team spawns, and
// neutral-drop anchors. They remain technically playable outside PvP, but are
// tuned for Team Elimination rather than wave survival.

import * as THREE from 'three';
import { createMapBlock, createMapFloor } from './map_helpers.js';

const MATERIALS = new Map();

function material(key, options) {
  if (!MATERIALS.has(key)) MATERIALS.set(key, new THREE.MeshStandardMaterial(options));
  return MATERIALS.get(key);
}

function addBlock(context, {
  w, h, d, x, z, y = h / 2, color = 0x26313b,
  isWall = true, climbable = false, nonWalkable = false, supportTag = 'competitive-cover'
}) {
  return createMapBlock(context, {
    w, h, d, x, y, z, colorOrMap: color, isWall, isDoor: false,
    playerClimbable: climbable,
    playerNonWalkable: nonWalkable,
    supportTag
  });
}

function addPlayerSpawn(context, x, z) {
  context.playerSpawnPoints.push(new THREE.Vector3(x, 0, z));
}

function addZombieSpawn(context, x, z) {
  context.spawnPoints.push(new THREE.Vector3(x, 0, z));
}

function addBoundary(context, width, depth, color) {
  const t = 2;
  const h = 6;
  addBlock(context, { w: width, h, d: t, x: 0, z: -depth / 2, color, nonWalkable: true, supportTag: 'arena-boundary' });
  addBlock(context, { w: width, h, d: t, x: 0, z: depth / 2, color, nonWalkable: true, supportTag: 'arena-boundary' });
  addBlock(context, { w: t, h, d: depth, x: -width / 2, z: 0, color, nonWalkable: true, supportTag: 'arena-boundary' });
  addBlock(context, { w: t, h, d: depth, x: width / 2, z: 0, color, nonWalkable: true, supportTag: 'arena-boundary' });
}

function addSpawnPools(context, width, depth) {
  const x = width * 0.40;
  const z = depth * 0.28;
  // The farthest pair becomes the authoritative ALPHA/BRAVO anchor pair.
  addPlayerSpawn(context, -x, -z);
  addPlayerSpawn(context, x, z);
  addPlayerSpawn(context, -x, z);
  addPlayerSpawn(context, x, -z);

  const zx = width * 0.43;
  const zz = depth * 0.42;
  [
    [-zx, -zz], [0, -zz], [zx, -zz],
    [-zx, 0], [zx, 0],
    [-zx, zz], [0, zz], [zx, zz]
  ].forEach(([sx, sz]) => addZombieSpawn(context, sx, sz));
}

function addBeacon(context, x, z, tone, name) {
  const root = new THREE.Group();
  root.name = name;
  root.userData.isMapDressing = true;
  root.userData.noCollision = true;
  root.userData.playerNonWalkable = true;
  root.userData.playerNonBlockingProjectile = true;
  root.userData.minGraphicsQuality = 'medium';

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.08, 8, 28),
    material(`ring-${tone}`, { color: tone, emissive: tone, emissiveIntensity: 0.65, roughness: 0.32 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  root.add(ring);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 3.2, 8),
    material(`mast-${tone}`, { color: 0x16202a, emissive: tone, emissiveIntensity: 0.18, metalness: 0.72, roughness: 0.35 })
  );
  mast.position.y = 1.6;
  root.add(mast);
  const light = new THREE.PointLight(tone, 0.85, 10, 2);
  light.position.y = 2.8;
  root.add(light);
  root.position.set(x, 0, z);
  context.scene.add(root);
  context.mapMeshes.push(root);
}

function makeFloor(context, width, depth, color, roughness = 0.88) {
  return createMapFloor(context, {
    width,
    depth,
    material: material(`floor-${color}-${roughness}`, { color, roughness, metalness: 0.08 }),
    supportTag: 'competitive-floor'
  });
}

export function buildCrossfireTerminal(context) {
  const width = 108;
  const depth = 78;
  const floorMesh = makeFloor(context, width, depth, 0x111a22);
  addBoundary(context, width, depth, 0x263848);

  // Three readable lanes: two flanks and a central terminal split by cover.
  [-25, 25].forEach((x) => {
    addBlock(context, { w: 8, h: 4.6, d: 22, x, z: -17, color: 0x314654, nonWalkable: true });
    addBlock(context, { w: 8, h: 4.6, d: 22, x, z: 17, color: 0x314654, nonWalkable: true });
  });
  [-10, 10].forEach((z) => {
    addBlock(context, { w: 18, h: 2.2, d: 4, x: 0, z, color: 0x556777, climbable: true, supportTag: 'terminal-platform' });
  });
  addBlock(context, { w: 8, h: 1.15, d: 8, x: 0, z: 0, color: 0x6a7b88, climbable: true, supportTag: 'terminal-center-step' });

  // Mirrored short cover avoids unbroken sniper lanes.
  [[-39, -10], [-39, 14], [39, 10], [39, -14], [-14, -29], [14, 29], [-14, 29], [14, -29]].forEach(([x, z], index) => {
    addBlock(context, { w: index < 4 ? 6 : 12, h: 2.4, d: index < 4 ? 10 : 4, x, z, color: 0x43505c, climbable: true });
  });

  addSpawnPools(context, width, depth);
  addBeacon(context, 0, 0, 0x33d6ff, 'crossfire-central-uplink');
  addBeacon(context, -43, 0, 0xffb04a, 'crossfire-west-uplink');
  addBeacon(context, 43, 0, 0xffb04a, 'crossfire-east-uplink');
  return { floorMesh, width, depth, navigationCellSize: 2.25 };
}

export function buildFoundryRing(context) {
  const width = 96;
  const depth = 96;
  const floorMesh = makeFloor(context, width, depth, 0x171616);
  addBoundary(context, width, depth, 0x412a24);

  // Central forge ring with four breaks, creating orbit and cross-map routes.
  const ring = [
    [0, -16, 22, 5], [0, 16, 22, 5], [-16, 0, 5, 22], [16, 0, 5, 22]
  ];
  ring.forEach(([x, z, w, d]) => addBlock(context, {
    w, h: 3.8, d, x, z, color: 0x5a3327, nonWalkable: true, supportTag: 'foundry-core'
  }));
  addBlock(context, { w: 10, h: 1.1, d: 10, x: 0, z: 0, color: 0x8a4b2d, climbable: true, supportTag: 'foundry-hot-zone' });

  // Raised corner nests reached through stepped blocks.
  [[-31, -31], [31, 31], [-31, 31], [31, -31]].forEach(([x, z], index) => {
    addBlock(context, { w: 10, h: 1.0, d: 10, x, z, color: 0x4d4640, climbable: true, supportTag: 'foundry-step' });
    addBlock(context, { w: 5, h: 2.0, d: 5, x: x + (x > 0 ? -4 : 4), z: z + (z > 0 ? -4 : 4), color: 0x66564a, climbable: true, supportTag: 'foundry-overlook' });
    addBlock(context, { w: index % 2 ? 4 : 9, h: 2.5, d: index % 2 ? 9 : 4, x: x * 0.58, z: z * 0.58, color: 0x393c3f, climbable: true });
  });

  // Offset cover breaks direct corner-to-corner shots.
  [[-8, -36], [8, 36], [-36, 8], [36, -8], [-25, 0], [25, 0], [0, -25], [0, 25]].forEach(([x, z], index) => {
    addBlock(context, { w: index < 4 ? 8 : 5, h: 2.2, d: index < 4 ? 4 : 9, x, z, color: 0x4f4741, climbable: true });
  });

  addSpawnPools(context, width, depth);
  addBeacon(context, 0, 0, 0xff6a32, 'foundry-core-beacon');
  addBeacon(context, -34, 0, 0x61d6ff, 'foundry-west-beacon');
  addBeacon(context, 34, 0, 0x61d6ff, 'foundry-east-beacon');
  return { floorMesh, width, depth, navigationCellSize: 2.25 };
}

export function buildSkylineRelay(context) {
  const width = 104;
  const depth = 104;
  const floorMesh = makeFloor(context, width, depth, 0x0e151d, 0.78);
  addBoundary(context, width, depth, 0x22364c);

  // Twin rooftop compounds with a contested relay spine.
  [-29, 29].forEach((x) => {
    addBlock(context, { w: 22, h: 4.8, d: 16, x, z: 0, color: 0x263f59, nonWalkable: true, supportTag: 'relay-building' });
    addBlock(context, { w: 13, h: 1.2, d: 8, x, z: -22, color: 0x506a80, climbable: true, supportTag: 'relay-pad' });
    addBlock(context, { w: 13, h: 1.2, d: 8, x, z: 22, color: 0x506a80, climbable: true, supportTag: 'relay-pad' });
  });
  addBlock(context, { w: 9, h: 1.0, d: 32, x: 0, z: 0, color: 0x4d6378, climbable: true, supportTag: 'relay-spine' });
  addBlock(context, { w: 15, h: 2.2, d: 5, x: 0, z: 0, color: 0x71869a, climbable: true, supportTag: 'relay-crown' });

  // Flank route cover and alternating sightline blockers.
  [[-42, -25], [-42, 25], [42, -25], [42, 25], [-16, -38], [16, 38], [-16, 38], [16, -38]].forEach(([x, z], index) => {
    addBlock(context, { w: index < 4 ? 6 : 12, h: 2.7, d: index < 4 ? 12 : 5, x, z, color: 0x34495d, climbable: true });
  });
  [[-14, -14], [14, 14], [-14, 14], [14, -14]].forEach(([x, z]) => {
    addBlock(context, { w: 5, h: 2.0, d: 5, x, z, color: 0x5b7388, climbable: true, supportTag: 'relay-node' });
  });

  addSpawnPools(context, width, depth);
  addBeacon(context, 0, 0, 0x72e4ff, 'skyline-central-relay');
  addBeacon(context, 0, -40, 0xffcc66, 'skyline-south-relay');
  addBeacon(context, 0, 40, 0xffcc66, 'skyline-north-relay');
  return { floorMesh, width, depth, navigationCellSize: 2.25 };
}
