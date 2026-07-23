// js/maps/stormbreak_canal.js
// CONTENT.2 R1 — Stormbreak Canal, a single-level flood-control arena.

import * as THREE from 'three';
import { createMapFloor } from './map_helpers.js';

const WIDTH = 94;
const DEPTH = 78;
const WALL_HEIGHT = 4.8;
const PATCH = 'content2-r1-stormbreak-canal';
const MATERIALS = new Map();
const GEOMETRIES = new Map();

function material(key, options) {
  if (!MATERIALS.has(key)) MATERIALS.set(key, new THREE.MeshStandardMaterial(options));
  return MATERIALS.get(key);
}

function box(w, h, d) {
  const key = `${w}:${h}:${d}`;
  if (!GEOMETRIES.has(key)) GEOMETRIES.set(key, new THREE.BoxGeometry(w, h, d));
  return GEOMETRIES.get(key);
}

function addBlock(context, { x, y, z, w, h, d, color, wall = true, door = false, tag = 'stormbreak_block' }) {
  const block = context.spawnBlock(w, h, d, x, y, z, color, wall, door);
  if (door && block && Array.isArray(context.doors) && !context.doors.includes(block)) {
    context.doors.push(block);
  }
  if (block?.mesh?.userData) {
    block.mesh.userData.supportTag = tag;
    block.mesh.userData.content2Patch = PATCH;
  }
  return block;
}

function addDressing(context, root, { name, x, y, z, w, h, d, color, emissive = 0, intensity = 0, rotationY = 0 }) {
  const mesh = new THREE.Mesh(box(w, h, d), material(`${color}:${emissive}:${intensity}`, {
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.74,
    metalness: 0.16
  }));
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotationY;
  mesh.userData.isMapDressing = true;
  mesh.userData.noCollision = true;
  mesh.userData.playerNonWalkable = true;
  mesh.userData.playerNonBlockingProjectile = true;
  mesh.userData.content2Patch = PATCH;
  root.add(mesh);
  return mesh;
}

function spawn(context, x, z, locked = false) {
  const point = new THREE.Vector3(x, 0, z);
  (locked ? context.lockedSpawnPoints : context.spawnPoints).push(point);
}

function playerSpawn(context, x, z) {
  context.playerSpawnPoints.push(new THREE.Vector3(x, 0, z));
}

export function buildStormbreakCanal(context) {
  const floor = new THREE.MeshStandardMaterial({
    color: 0x14262c,
    roughness: 0.88,
    metalness: 0.08,
    emissive: 0x031419,
    emissiveIntensity: 0.16
  });
  const floorMesh = createMapFloor(context, {
    width: WIDTH,
    depth: DEPTH,
    material: floor,
    supportTag: 'stormbreak_floor'
  });
  floorMesh.name = 'stormbreak_canal_floor';
  floorMesh.userData.content2Patch = PATCH;

  // Outer flood-control shell.
  addBlock(context, { x: 0, y: WALL_HEIGHT / 2, z: -DEPTH / 2, w: WIDTH, h: WALL_HEIGHT, d: 2, color: 0x253a42, tag: 'stormbreak_north_wall' });
  addBlock(context, { x: 0, y: WALL_HEIGHT / 2, z: DEPTH / 2, w: WIDTH, h: WALL_HEIGHT, d: 2, color: 0x253a42, tag: 'stormbreak_south_wall' });
  addBlock(context, { x: -WIDTH / 2, y: WALL_HEIGHT / 2, z: 0, w: 2, h: WALL_HEIGHT, d: DEPTH, color: 0x253a42, tag: 'stormbreak_west_wall' });
  addBlock(context, { x: WIDTH / 2, y: WALL_HEIGHT / 2, z: 0, w: 2, h: WALL_HEIGHT, d: DEPTH, color: 0x253a42, tag: 'stormbreak_east_wall' });

  // Pump houses define two flanks without creating vertical traversal.
  for (const x of [-27, 27]) {
    addBlock(context, { x, y: 1.7, z: -11, w: 12, h: 3.4, d: 12, color: 0x334b54, tag: 'stormbreak_pump_house' });
    addBlock(context, { x, y: 1.7, z: 13, w: 12, h: 3.4, d: 10, color: 0x30454c, tag: 'stormbreak_filter_house' });
  }

  // Central canal ribs and control islands create cross-lane decisions.
  addBlock(context, { x: 0, y: 0.85, z: -17, w: 18, h: 1.7, d: 3.2, color: 0x41616a, tag: 'stormbreak_control_island' });
  addBlock(context, { x: 0, y: 0.85, z: 17, w: 18, h: 1.7, d: 3.2, color: 0x41616a, tag: 'stormbreak_control_island' });
  addBlock(context, { x: -10, y: 0.65, z: 0, w: 3.0, h: 1.3, d: 13, color: 0x38555e, tag: 'stormbreak_canal_rib' });
  addBlock(context, { x: 10, y: 0.65, z: 0, w: 3.0, h: 1.3, d: 13, color: 0x38555e, tag: 'stormbreak_canal_rib' });

  // Destructible-route style floodgates: opening either door releases locked spawns.
  addBlock(context, { x: -18, y: 1.8, z: -31, w: 9, h: 3.6, d: 1.2, color: 0xff7a27, wall: true, door: true, tag: 'stormbreak_floodgate_west' });
  addBlock(context, { x: 18, y: 1.8, z: 31, w: 9, h: 3.6, d: 1.2, color: 0xff7a27, wall: true, door: true, tag: 'stormbreak_floodgate_east' });

  const artRoot = new THREE.Group();
  artRoot.name = 'stormbreak_canal_art_root';
  artRoot.userData.isMapDressing = true;
  artRoot.userData.noCollision = true;
  artRoot.userData.playerNonBlockingProjectile = true;
  artRoot.userData.minGraphicsQuality = 'medium';
  artRoot.userData.content2Patch = PATCH;
  context.scene.add(artRoot);
  context.mapMeshes.push(artRoot);

  // Flat water strips are visual only; the arena remains one walkable level.
  addDressing(context, artRoot, { name: 'canal_water_west', x: -5.2, y: 0.035, z: 0, w: 5.2, h: 0.04, d: 57, color: 0x0b5c70, emissive: 0x063e4d, intensity: 0.45 });
  addDressing(context, artRoot, { name: 'canal_water_east', x: 5.2, y: 0.035, z: 0, w: 5.2, h: 0.04, d: 57, color: 0x0b5c70, emissive: 0x063e4d, intensity: 0.45 });
  for (const z of [-28, -14, 0, 14, 28]) {
    addDressing(context, artRoot, { name: `warning_${z}`, x: 0, y: 0.08, z, w: 20, h: 0.05, d: 0.34, color: 0xffa126, emissive: 0xff6319, intensity: 0.72 });
  }
  for (const x of [-39, -21, 21, 39]) {
    addDressing(context, artRoot, { name: `beacon_${x}`, x, y: 2.2, z: 0, w: 0.3, h: 4.4, d: 0.3, color: 0x1f3d47, emissive: 0x16d9ff, intensity: 0.62 });
  }

  // Existing trap and barricade systems provide interactive lane control.
  context.spawnTrap(0, -24, 11, false);
  context.spawnTrap(0, 24, 11, false);
  context.spawnTrap(-34, 0, 9, true);
  context.spawnBarricade(-45, -20, Math.PI / 2);
  context.spawnBarricade(45, 20, -Math.PI / 2);
  context.spawnBarricade(-20, 37, 0);
  context.spawnBarricade(20, -37, Math.PI);

  // Broad ring pressure plus two locked floodgate groups.
  [
    [-42, -30], [-42, 0], [-42, 30], [42, -30], [42, 0], [42, 30],
    [-28, -35], [0, -35], [28, -35], [-28, 35], [0, 35], [28, 35]
  ].forEach(([x, z]) => spawn(context, x, z));
  [[-18, -34], [-7, -34], [18, 34], [7, 34]].forEach(([x, z]) => spawn(context, x, z, true));

  [[-15, -7], [15, 7], [-15, 7], [15, -7]].forEach(([x, z]) => playerSpawn(context, x, z));

  return {
    floorMesh,
    width: WIDTH,
    depth: DEPTH,
    navigationCellSize: 2.5
  };
}
