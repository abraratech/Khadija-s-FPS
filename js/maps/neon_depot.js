// js/maps/neon_depot.js
import * as THREE from 'three';

function addCollisionBox(context, name, x, y, z, w, h, d, color, options = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.82,
    metalness: options.metalness ?? 0.02,
    emissive: options.emissiveColor ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: !!options.transparent,
    opacity: options.opacity ?? 1
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;

  context.scene.add(mesh);
  context.mapMeshes.push(mesh);

  const blockObj = {
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    maxY: y + h / 2,
    isDoor: !!options.isDoor,
    mesh,
    pos: new THREE.Vector3(x, 0, z)
  };

  context.walls.push(blockObj);

  if (options.isDoor && context.doors) {
    context.doors.push(blockObj);
  }

  return blockObj;
}

function addDressingBox(context, name, x, y, z, w, h, d, color, options = {}) {
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

function addPlayerSpawns(context) {
  if (!context.playerSpawnPoints) return;

  context.playerSpawnPoints.push(
    new THREE.Vector3(-30, 0, 0),
    new THREE.Vector3(30, 0, 0),
    new THREE.Vector3(0, 0, -30),
    new THREE.Vector3(0, 0, 30)
  );
}

function addZombieSpawns(context) {
  context.spawnPoints.push(
    new THREE.Vector3(-36, 0, -30),
    new THREE.Vector3(-30, 0, -36),
    new THREE.Vector3(36, 0, 30),
    new THREE.Vector3(30, 0, 36),
    new THREE.Vector3(-36, 0, 30),
    new THREE.Vector3(36, 0, -30),
    new THREE.Vector3(0, 0, -36),
    new THREE.Vector3(0, 0, 36)
  );

  context.lockedSpawnPoints.push(
    new THREE.Vector3(0, 0, -8),
    new THREE.Vector3(0, 0, 8),
    new THREE.Vector3(-4, 0, 0),
    new THREE.Vector3(4, 0, 0)
  );
}

function addNeonDepotDressing(context) {
  // Neon guide strips.
  addDressingBox(context, 'depot_neon_track_north', 0, 0.055, -24, 62, 0.04, 0.18, 0x00e5ff);
  addDressingBox(context, 'depot_neon_track_south', 0, 0.055, 24, 62, 0.04, 0.18, 0xff3bd5);
  addDressingBox(context, 'depot_neon_track_west', -24, 0.055, 0, 0.18, 0.04, 62, 0x00e5ff);
  addDressingBox(context, 'depot_neon_track_east', 24, 0.055, 0, 0.18, 0.04, 62, 0xff3bd5);

  // Wall signage.
  addDressingBox(context, 'depot_sign_north', -18, 2.5, -43.05, 8.5, 0.65, 0.06, 0x00e5ff);
  addDressingBox(context, 'depot_sign_south', 18, 2.5, 43.05, 8.5, 0.65, 0.06, 0xff3bd5);
  addDressingBox(context, 'depot_sign_west', -43.05, 2.5, 18, 0.06, 0.65, 8.5, 0x00e5ff);
  addDressingBox(context, 'depot_sign_east', 43.05, 2.5, -18, 0.06, 0.65, 8.5, 0xff3bd5);

  // Floor grime / maintenance panels.
  addDressingBox(context, 'depot_grime_a', -12, 0.035, 20, 6.2, 0.025, 3.2, 0x0b1218, { opacity: 0.55, rotationY: 0.25 });
  addDressingBox(context, 'depot_grime_b', 14, 0.035, -22, 6.2, 0.025, 3.0, 0x120b14, { opacity: 0.50, rotationY: -0.35 });
  addDressingBox(context, 'depot_panel_a', -28, 0.06, -8, 3.5, 0.04, 1.2, 0x1f2c35, { rotationY: 0.15 });
  addDressingBox(context, 'depot_panel_b', 28, 0.06, 8, 3.5, 0.04, 1.2, 0x2e1d35, { rotationY: -0.15 });

  // Non-collision hazard marks near traps.
  addDressingBox(context, 'depot_hazard_north_base', 0, 0.06, -22, 10, 0.035, 1.0, 0x111111);
  addDressingBox(context, 'depot_hazard_north_mark', 0, 0.09, -22, 8, 0.035, 0.22, 0xffd400);
  addDressingBox(context, 'depot_hazard_south_base', 0, 0.06, 22, 10, 0.035, 1.0, 0x111111);
  addDressingBox(context, 'depot_hazard_south_mark', 0, 0.09, 22, 8, 0.035, 0.22, 0xffd400);
}

export function buildNeonDepot(context) {
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x111823,
    roughness: 0.95,
    metalness: 0.02
  });

  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(88, 88), floorMat);
  floorMesh.name = 'neon_depot_floor';
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.frustumCulled = false;
  context.scene.add(floorMesh);
  context.mapMeshes.push(floorMesh);

  // Perimeter walls.
  addCollisionBox(context, 'depot_wall_north', 0, 2.25, -44, 88, 4.5, 2, 0x1c2632);
  addCollisionBox(context, 'depot_wall_south', 0, 2.25, 44, 88, 4.5, 2, 0x1c2632);
  addCollisionBox(context, 'depot_wall_west', -44, 2.25, 0, 2, 4.5, 88, 0x1c2632);
  addCollisionBox(context, 'depot_wall_east', 44, 2.25, 0, 2, 4.5, 88, 0x1c2632);

  // Train cars / depot cover.
  addCollisionBox(context, 'depot_train_car_a', -24, 1.1, 18, 18, 2.2, 5, 0x263240);
  addCollisionBox(context, 'depot_train_car_b', 24, 1.1, -18, 18, 2.2, 5, 0x3a283c);

  // Service kiosks / maintenance blocks.
  addCollisionBox(context, 'depot_kiosk_a', -18, 1.2, -12, 7, 2.4, 5, 0x242c30);
  addCollisionBox(context, 'depot_kiosk_b', 18, 1.2, 12, 7, 2.4, 5, 0x302434);

  // Split platform walls.
  addCollisionBox(context, 'depot_platform_north', 0, 1.6, -28, 16, 3.2, 2, 0x1b232d);
  addCollisionBox(context, 'depot_platform_south', 0, 1.6, 28, 16, 3.2, 2, 0x1b232d);

  // Central security gates. Opening either gate unlocks locked spawns.
  addCollisionBox(context, 'depot_security_gate_west', -8, 2.0, 0, 1.4, 4.0, 10, 0xff3366, {
    isDoor: true,
    transparent: true,
    opacity: 0.82,
    emissiveColor: 0xaa1133,
    emissiveIntensity: 0.6
  });

  addCollisionBox(context, 'depot_security_gate_east', 8, 2.0, 0, 1.4, 4.0, 10, 0xff3366, {
    isDoor: true,
    transparent: true,
    opacity: 0.82,
    emissiveColor: 0xaa1133,
    emissiveIntensity: 0.6
  });

  // Barricades near side entries.
  if (context.spawnBarricade) {
    context.spawnBarricade(-38, 0, Math.PI / 2);
    context.spawnBarricade(38, 0, Math.PI / 2);
    context.spawnBarricade(0, -38, 0);
    context.spawnBarricade(0, 38, 0);
  }

  // Electric traps.
  if (context.spawnTrap) {
    context.spawnTrap(0, -22, 8, false);
    context.spawnTrap(0, 22, 8, false);
  }

  addPlayerSpawns(context);
  addZombieSpawns(context);
  addNeonDepotDressing(context);

  return {
    floorMesh,
    width: 88,
    depth: 88
  };
}