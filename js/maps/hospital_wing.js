// js/maps/hospital_wing.js
// Hospital Wing playable arena.
// B4 polish: darker corridor flow, stronger room identity, clearer cover rhythm, and safer spawn/shop/trap lanes.

import * as THREE from 'three';
import { createMapFloor } from './map_helpers.js';

function addPoint(list, x, z) {
  list.push(new THREE.Vector3(x, 0, z));
}

function addDressingMesh(context, mesh) {
  const { scene, mapMeshes } = context;

  mesh.userData.isMapDressing = true;
  mesh.frustumCulled = true;

  scene.add(mesh);
  mapMeshes.push(mesh);

  return mesh;
}

function makeBasicMat(color, opacity = 0.8) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

function addFloorStripe(context, x, z, w, d, color = 0xe6fff7, opacity = 0.42) {
  const mat = makeBasicMat(color, opacity);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.035, z);

  return addDressingMesh(context, mesh);
}

function addFloorDisc(context, x, z, radius = 2.0, color = 0x3a0000, opacity = 0.12) {
  const mat = makeBasicMat(color, opacity);
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 22), mat);

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.038, z);

  return addDressingMesh(context, mesh);
}

function addEmergencyLight(context, x, z, color = 0xff3333, intensity = 0.22) {
  const glowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.30
  });

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), glowMat);
  glow.position.set(x, 3.55, z);
  addDressingMesh(context, glow);

  const light = new THREE.PointLight(color, intensity, 11);
  light.position.set(x, 3.35, z);
  light.userData.isMapDressing = true;
  context.scene.add(light);

  return light;
}

function addCeilingLight(context, x, z, rotY = 0, color = 0xbffff2, intensity = 0.22) {
  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0x2b3434,
    metalness: 0.35,
    roughness: 0.55
  });

  const glowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.70
  });

  const fixture = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.15, 0.30), fixtureMat);
  fixture.position.set(x, 4.0, z);
  fixture.rotation.y = rotY;

  const glow = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.04, 0.11), glowMat);
  glow.position.set(x, 3.9, z);
  glow.rotation.y = rotY;

  const light = new THREE.PointLight(color, intensity, 12);
  light.position.set(x, 3.55, z);

  context.scene.add(fixture, glow, light);
  context.mapMeshes.push(fixture, glow);

  fixture.userData.isMapDressing = true;
  glow.userData.isMapDressing = true;
  light.userData.isMapDressing = true;
}

function addWallSign(context, x, z, rotY, textColor = 0x9ffff0, w = 3.8, h = 0.72) {
  const signMat = new THREE.MeshBasicMaterial({
    color: textColor,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide
  });

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMat);
  sign.position.set(x, 2.35, z);
  sign.rotation.y = rotY;

  return addDressingMesh(context, sign);
}

function addTreatmentBed(context, spawnBlock, x, z, rotY = 0, color = 0x6c8480) {
  const isSideways = Math.abs(Math.sin(rotY)) > 0.5;
  const w = isSideways ? 1.6 : 3.4;
  const d = isSideways ? 3.4 : 1.6;

  const bed = spawnBlock(w, 0.72, d, x, 0.36, z, color, true, false);

  const railMat = new THREE.MeshStandardMaterial({
    color: 0xd6eee9,
    roughness: 0.4,
    metalness: 0.35
  });

  const rail = new THREE.Mesh(new THREE.BoxGeometry(isSideways ? 0.18 : 3.6, 0.18, isSideways ? 3.6 : 0.18), railMat);
  rail.position.set(x, 0.88, z);
  rail.rotation.y = rotY;
  addDressingMesh(context, rail);

  return bed;
}

function addCurtain(context, spawnBlock, x, z, rotY = 0) {
  const curtain = spawnBlock(
    Math.abs(Math.sin(rotY)) > 0.5 ? 0.22 : 4.2,
    2.2,
    Math.abs(Math.sin(rotY)) > 0.5 ? 4.2 : 0.22,
    x,
    1.15,
    z,
    0x1e5c55,
    true,
    false
  );

  curtain.mesh.material.transparent = true;
  curtain.mesh.material.opacity = 0.68;

  return curtain;
}

function addSupplyCart(context, spawnBlock, x, z, rotY = 0) {
  const isSideways = Math.abs(Math.sin(rotY)) > 0.5;
  const cart = spawnBlock(
    isSideways ? 1.2 : 2.6,
    1.0,
    isSideways ? 2.6 : 1.2,
    x,
    0.5,
    z,
    0x46524f,
    true,
    false
  );

  const handleMat = new THREE.MeshStandardMaterial({ color: 0xd9eee9, metalness: 0.55, roughness: 0.35 });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(isSideways ? 0.12 : 2.8, 0.12, isSideways ? 2.8 : 0.12), handleMat);
  handle.position.set(x, 1.12, z);
  handle.rotation.y = rotY;
  addDressingMesh(context, handle);

  return cart;
}

function addMedicalCross(context, x, z, size = 2.4, color = 0x722222, opacity = 0.13) {
  addFloorStripe(context, x, z, size, size * 0.28, color, opacity);
  addFloorStripe(context, x, z, size * 0.28, size, color, opacity);
}

export function buildHospitalWing(context) {
  const {
    scene,
    mapMeshes,
    doors,
    spawnPoints,
    playerSpawnPoints,
    lockedSpawnPoints,
    spawnBlock,
    spawnBarricade,
    spawnTrap
  } = context;

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x151f1f,
    roughness: 0.96,
    metalness: 0.02
  });

  const floorMesh = createMapFloor(
    { scene, mapMeshes },
    {
      width: 92,
      depth: 66,
      material: floorMat
    }
  );

  floorMesh.name = 'hospital_wing_floor';

  const wallColor = 0x303d3c;
  const wardWall = 0x3d4f4c;
  const deskColor = 0x59605c;
  const cabinetColor = 0x44524e;

  // Perimeter walls.
  spawnBlock(92, 4.4, 2, 0, 2.2, -34, wallColor, true, false);
  spawnBlock(92, 4.4, 2, 0, 2.2, 34, wallColor, true, false);
  spawnBlock(2, 4.4, 66, -47, 2.2, 0, wallColor, true, false);
  spawnBlock(2, 4.4, 66, 47, 2.2, 0, wallColor, true, false);

  // Main corridor shell. Broken sections keep navigation readable while preserving horror-room pressure.
  [
    [-38, 8, 14],
    [-14, 8, 12],
    [14, 8, 12],
    [38, 8, 14],
    [-38, -8, 14],
    [-14, -8, 12],
    [14, -8, 12],
    [38, -8, 14]
  ].forEach(([x, z, w]) => {
    spawnBlock(w, 3.1, 1.0, x, 1.55, z, wardWall, true, false);
  });

  // Cross-ward room separators with big gaps for direct zombie movement.
  [
    [-28, 22, 1.0, 14],
    [-28, -22, 1.0, 14],
    [0, 22, 1.0, 14],
    [0, -22, 1.0, 14],
    [28, 22, 1.0, 14],
    [28, -22, 1.0, 14]
  ].forEach(([x, z, w, d]) => {
    spawnBlock(w, 3.0, d, x, 1.5, z, wardWall, true, false);
  });

  // Locked quarantine security door splitting the west and east ward.
  const quarantineDoor = spawnBlock(1.25, 3.35, 13.0, 0, 1.68, 0, 0xff3333, true, true);
  quarantineDoor.mesh.name = 'hospital_wing_quarantine_door';
  quarantineDoor.pos.set(0, 0, 0);
  doors.push(quarantineDoor);

  // Reception / nurse stations and sturdy cover.
  spawnBlock(7.0, 1.05, 2.0, -34, 0.52, 0, deskColor, true, false);
  spawnBlock(7.0, 1.05, 2.0, 34, 0.52, 0, deskColor, true, false);
  spawnBlock(3.0, 1.1, 2.8, -9, 0.55, 24, 0x5f685f, true, false);
  spawnBlock(3.0, 1.1, 2.8, 9, 0.55, -24, 0x5f685f, true, false);

  // New B4 cover: small supply carts that break sightlines without choking the main route.
  addSupplyCart({ scene, mapMeshes }, spawnBlock, -12, 14, Math.PI / 2);
  addSupplyCart({ scene, mapMeshes }, spawnBlock, 12, -14, Math.PI / 2);
  addSupplyCart({ scene, mapMeshes }, spawnBlock, -38, -12, 0);
  addSupplyCart({ scene, mapMeshes }, spawnBlock, 38, 12, 0);

  // Wall cabinets add room detail while keeping lanes open.
  // B4 visual hotfix: y must stay near the floor; previous cabinet calls accidentally used Z values as Y,
  // which made a few cabinet blocks appear high in the sky.
  spawnBlock(3.4, 1.6, 0.55, -40, 0.8, 28, cabinetColor, true, false);
  spawnBlock(3.4, 1.6, 0.55, 40, 0.8, -28, cabinetColor, true, false);
  spawnBlock(0.55, 1.6, 3.4, -4, 0.8, 24, cabinetColor, true, false);
  spawnBlock(0.55, 1.6, 3.4, 4, 0.8, -24, cabinetColor, true, false);

  // Treatment beds. These create cover but are placed away from spawn/shop/trap points.
  addTreatmentBed({ scene, mapMeshes }, spawnBlock, -38, 20, 0, 0x6c8480);
  addTreatmentBed({ scene, mapMeshes }, spawnBlock, -20, -22, 0, 0x6c8480);
  addTreatmentBed({ scene, mapMeshes }, spawnBlock, -12, 26, Math.PI / 2, 0x6c8480);
  addTreatmentBed({ scene, mapMeshes }, spawnBlock, 20, 22, 0, 0x6c8480);
  addTreatmentBed({ scene, mapMeshes }, spawnBlock, 38, -20, 0, 0x6c8480);
  addTreatmentBed({ scene, mapMeshes }, spawnBlock, 12, -26, Math.PI / 2, 0x6c8480);

  // Curtains for ward identity and controlled side-room visibility.
  addCurtain({ scene, mapMeshes }, spawnBlock, -22, 12, 0);
  addCurtain({ scene, mapMeshes }, spawnBlock, -22, -12, 0);
  addCurtain({ scene, mapMeshes }, spawnBlock, 22, 12, 0);
  addCurtain({ scene, mapMeshes }, spawnBlock, 22, -12, 0);

  // Corridor floor identity: triage lanes, quarantine stripes, medical crosses, and blood stains.
  addFloorStripe({ scene, mapMeshes }, -23, 0, 33, 0.22, 0xe6fff7, 0.34);
  addFloorStripe({ scene, mapMeshes }, 23, 0, 33, 0.22, 0xe6fff7, 0.34);
  addFloorStripe({ scene, mapMeshes }, 0, 18, 0.22, 20, 0x8a2a2a, 0.18);
  addFloorStripe({ scene, mapMeshes }, 0, -18, 0.22, 20, 0x8a2a2a, 0.18);

  [-36, -18, 18, 36].forEach((x) => {
    addFloorStripe({ scene, mapMeshes }, x, 6, 5.2, 0.16, 0xffffff, 0.28);
    addFloorStripe({ scene, mapMeshes }, x, -6, 5.2, 0.16, 0xffffff, 0.28);
  });

  [
    [-36, 25],
    [-20, 18],
    [20, -18],
    [36, -25]
  ].forEach(([x, z]) => addMedicalCross({ scene, mapMeshes }, x, z));

  [
    [-30, -15, 2.5],
    [-8, 4, 1.7],
    [10, -5, 1.8],
    [32, 16, 2.4],
    [18, 28, 1.6]
  ].forEach(([x, z, r]) => addFloorDisc({ scene, mapMeshes }, x, z, r, 0x3a0000, 0.10));

  // Medical signage and horror color cues.
  addWallSign({ scene, mapMeshes }, -43.7, 0, Math.PI / 2, 0x9ffff0, 4.4, 0.8);
  addWallSign({ scene, mapMeshes }, 43.7, 0, -Math.PI / 2, 0x9ffff0, 4.4, 0.8);
  addWallSign({ scene, mapMeshes }, -18, 33.0, Math.PI, 0x9ffff0, 4.2, 0.75);
  addWallSign({ scene, mapMeshes }, 18, -33.0, 0, 0x9ffff0, 4.2, 0.75);
  addWallSign({ scene, mapMeshes }, -1.1, -7.8, Math.PI, 0xffaa55, 3.4, 0.45);
  addWallSign({ scene, mapMeshes }, 1.1, 7.8, 0, 0xffaa55, 3.4, 0.45);

  // Fluorescent fixtures and red emergency beacons. Modest count for performance.
  [
    [-34, 0, Math.PI / 2, 0xcffff3, 0.20],
    [-18, 0, Math.PI / 2, 0xcffff3, 0.18],
    [18, 0, Math.PI / 2, 0xcffff3, 0.18],
    [34, 0, Math.PI / 2, 0xcffff3, 0.20],
    [-28, 22, 0, 0xaaffee, 0.17],
    [28, -22, 0, 0xaaffee, 0.17],
    [0, 22, 0, 0xff9999, 0.14],
    [0, -22, 0, 0xff9999, 0.14]
  ].forEach(([x, z, rotY, color, intensity]) => addCeilingLight({ scene, mapMeshes }, x, z, rotY, color, intensity));

  [
    [-3.2, 6.9],
    [3.2, -6.9],
    [-44.0, 26],
    [44.0, -26]
  ].forEach(([x, z]) => addEmergencyLight({ scene, mapMeshes }, x, z));

  // Traps: tuned for the corridor loop and clear of collision.
  spawnTrap(-25, 0, 8, false);
  spawnTrap(25, 0, 8, false);
  spawnTrap(0, 18, 8, false);

  // Barricades in side rooms / ward windows.
  spawnBarricade(-42.5, 18, Math.PI / 2);
  spawnBarricade(-42.5, -18, Math.PI / 2);
  spawnBarricade(42.5, 18, -Math.PI / 2);
  spawnBarricade(42.5, -18, -Math.PI / 2);

  // Player starts on the west side, away from the quarantine door and all cover collision.
  addPoint(playerSpawnPoints, -40, 0);
  addPoint(playerSpawnPoints, -30, -4);
  addPoint(playerSpawnPoints, -30, 4);
  addPoint(playerSpawnPoints, -18, 0);

  // Open spawns: west/perimeter pressure before the quarantine door opens.
  [
    [-42, -28],
    [-42, 28],
    [-30, -30],
    [-30, 30],
    [-12, -30],
    [-12, 30],
    [-44, 0],
    [-38, 12]
  ].forEach(([x, z]) => addPoint(spawnPoints, x, z));

  // Extra pressure from the east wing after opening the quarantine door.
  [
    [42, -28],
    [42, 28],
    [30, -30],
    [30, 30],
    [12, -30],
    [12, 30],
    [44, 0],
    [38, -12]
  ].forEach(([x, z]) => addPoint(lockedSpawnPoints, x, z));

  return { floorMesh };
}
