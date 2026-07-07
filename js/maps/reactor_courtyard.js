// js/maps/reactor_courtyard.js
// C12 — Reactor Courtyard
// Optimized single-floor arena with broad lanes, central reactor cover,
// authored hazard pads, validated spawn routes, and low-cost procedural dressing.

import * as THREE from 'three';

function addCollisionBox(context, name, x, y, z, w, h, d, color, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.82,
    metalness: options.metalness ?? 0.06,
    emissive: options.emissiveColor ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.playerClimbable = options.playerClimbable === true;
  mesh.userData.playerNonWalkable = options.playerNonWalkable !== false;
  mesh.userData.supportTag = String(options.supportTag || 'reactor_block');

  context.scene.add(mesh);
  context.mapMeshes.push(mesh);

  const block = {
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    maxY: y + h / 2,
    isDoor: !!options.isDoor,
    playerClimbable: mesh.userData.playerClimbable,
    playerNonWalkable: mesh.userData.playerNonWalkable,
    supportTag: mesh.userData.supportTag,
    mesh,
    pos: new THREE.Vector3(x, 0, z)
  };

  if (options.collision !== false) context.walls.push(block);
  if (options.isDoor && context.doors) context.doors.push(block);
  return block;
}

function addDressingBox(context, name, x, y, z, w, h, d, color, options = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.isMapDressing = true;
  mesh.userData.noCollision = true;
  mesh.userData.playerNonBlockingProjectile = true;
  context.scene.add(mesh);
  context.mapMeshes.push(mesh);
  return mesh;
}

function addPlayerSpawns(context) {
  context.playerSpawnPoints.push(
    new THREE.Vector3(-34, 0, -24),
    new THREE.Vector3(34, 0, 24),
    new THREE.Vector3(-34, 0, 24),
    new THREE.Vector3(34, 0, -24)
  );
}

function addZombieSpawns(context) {
  context.spawnPoints.push(
    new THREE.Vector3(-41, 0, -30),
    new THREE.Vector3(-28, 0, -34),
    new THREE.Vector3(0, 0, -34),
    new THREE.Vector3(20, 0, -34),
    new THREE.Vector3(41, 0, -30),
    new THREE.Vector3(-41, 0, 30),
    new THREE.Vector3(-20, 0, 34),
    new THREE.Vector3(0, 0, 34),
    new THREE.Vector3(28, 0, 34),
    new THREE.Vector3(41, 0, 30),
    new THREE.Vector3(-43, 0, 0),
    new THREE.Vector3(43, 0, 0)
  );
}

function addReactorDressing(context) {
  const cyan = 0x19d8ff;
  const orange = 0xff8a22;

  // Lane guide strips.
  addDressingBox(context, 'reactor_lane_north', 0, 0.05, -27, 72, 0.03, 0.18, cyan);
  addDressingBox(context, 'reactor_lane_south', 0, 0.05, 27, 72, 0.03, 0.18, orange);
  addDressingBox(context, 'reactor_lane_west', -35, 0.05, 0, 0.18, 0.03, 46, cyan);
  addDressingBox(context, 'reactor_lane_east', 35, 0.05, 0, 0.18, 0.03, 46, orange);

  // Central core glow and hazard chevrons.
  addDressingBox(context, 'reactor_core_glow', 0, 2.45, 0, 7.6, 0.18, 7.6, 0x33eeff, { opacity: 0.62 });
  addDressingBox(context, 'reactor_chevron_n', 0, 0.07, -10.8, 10, 0.03, 0.30, 0xffcc22);
  addDressingBox(context, 'reactor_chevron_s', 0, 0.07, 10.8, 10, 0.03, 0.30, 0xffcc22);

  // Lightweight wall signage.
  addDressingBox(context, 'reactor_sign_west', -45.03, 2.5, -15, 0.05, 0.72, 9, cyan);
  addDressingBox(context, 'reactor_sign_east', 45.03, 2.5, 15, 0.05, 0.72, 9, orange);
}

export function buildReactorCourtyard(context) {
  const width = 92;
  const depth = 76;

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x151a1f,
    roughness: 0.94,
    metalness: 0.03
  });

  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMaterial);
  floorMesh.name = 'reactor_courtyard_floor';
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.frustumCulled = false;
  floorMesh.userData.playerClimbable = true;
  floorMesh.userData.playerNonWalkable = false;
  floorMesh.userData.supportTag = 'reactor_floor';
  context.scene.add(floorMesh);
  context.mapMeshes.push(floorMesh);

  // Perimeter shell.
  addCollisionBox(context, 'reactor_wall_north', 0, 2.4, -38, width, 4.8, 2, 0x252d34);
  addCollisionBox(context, 'reactor_wall_south', 0, 2.4, 38, width, 4.8, 2, 0x252d34);
  addCollisionBox(context, 'reactor_wall_west', -46, 2.4, 0, 2, 4.8, depth, 0x252d34);
  addCollisionBox(context, 'reactor_wall_east', 46, 2.4, 0, 2, 4.8, depth, 0x252d34);

  // Central reactor and four broad approach lanes.
  addCollisionBox(context, 'reactor_core', 0, 1.45, 0, 8, 2.9, 8, 0x253d46, {
    emissiveColor: 0x064a56,
    emissiveIntensity: 0.34,
    supportTag: 'reactor_core',
    playerClimbable: false
  });

  // Coolant banks create cover without forming narrow dead ends.
  addCollisionBox(context, 'reactor_coolant_nw', -20, 1.15, -17, 7, 2.3, 5, 0x29434a);
  addCollisionBox(context, 'reactor_coolant_ne', 20, 1.15, -17, 7, 2.3, 5, 0x4a3529);
  addCollisionBox(context, 'reactor_coolant_sw', -20, 1.15, 17, 7, 2.3, 5, 0x29434a);
  addCollisionBox(context, 'reactor_coolant_se', 20, 1.15, 17, 7, 2.3, 5, 0x4a3529);

  // Service islands and lane dividers.
  addCollisionBox(context, 'reactor_service_west', -31, 1.25, 0, 7, 2.5, 5, 0x303943);
  addCollisionBox(context, 'reactor_service_east', 31, 1.25, 0, 7, 2.5, 5, 0x40352e);
  addCollisionBox(context, 'reactor_divider_north', 0, 0.75, -17, 13, 1.5, 2, 0x313b43);
  addCollisionBox(context, 'reactor_divider_south', 0, 0.75, 17, 13, 1.5, 2, 0x3d342d);

  // Barricades on four perimeter entrances.
  if (context.spawnBarricade) {
    context.spawnBarricade(-42, -24, Math.PI / 2);
    context.spawnBarricade(42, 24, Math.PI / 2);
    context.spawnBarricade(-18, -34, 0);
    context.spawnBarricade(18, 34, 0);
  }

  // Standard electric traps remain available alongside the C12 reactor override.
  if (context.spawnTrap) {
    context.spawnTrap(0, -27, 10, false);
    context.spawnTrap(0, 27, 10, false);
  }

  addPlayerSpawns(context);
  addZombieSpawns(context);
  addReactorDressing(context);

  return {
    floorMesh,
    width,
    depth,
    center: { x: 0, z: 0 },
    navigationCellSize: 2.5
  };
}
