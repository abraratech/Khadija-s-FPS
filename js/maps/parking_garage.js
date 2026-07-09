// js/maps/parking_garage.js
// Parking Garage playable arena.
// B2 polish: stronger visual identity, safer combat lanes, better cover rhythm, and clearer garage landmarks.

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

function makeLineMaterial(color = 0xffd36a, opacity = 0.72) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

function addParkingLine(context, x, z, w, d, rotY = 0, color = 0xffd36a, opacity = 0.65) {
  const mat = makeLineMaterial(color, opacity);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);

  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotY;
  mesh.position.set(x, 0.032, z);

  return addDressingMesh(context, mesh);
}

function addLightSpill(context, x, z, rotY = 0) {
  const spillMat = makeLineMaterial(0xffe6aa, 0.13);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.4), spillMat);
  spill.rotation.x = -Math.PI / 2;
  spill.rotation.z = rotY;
  spill.position.set(x, 0.034, z);
  return addDressingMesh(context, spill);
}

function addOverheadLight(context, x, z, rotY = 0) {
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xfff2cc,
    transparent: true,
    opacity: 0.82
  });

  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0x2a2d32,
    metalness: 0.45,
    roughness: 0.5
  });

  const fixture = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 0.34), fixtureMat);
  fixture.position.set(x, 4.05, z);
  fixture.rotation.y = rotY;
  fixture.userData.isMapDressing = true;

  const glow = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.04, 0.12), glowMat);
  glow.position.set(x, 3.93, z);
  glow.rotation.y = rotY;
  glow.userData.isMapDressing = true;

  const light = new THREE.PointLight(0xffdca8, 0.24, 13);
  light.position.set(x, 3.6, z);
  light.userData.isMapDressing = true;

  context.scene.add(fixture, glow, light);
  context.mapMeshes.push(fixture, glow);
  addLightSpill(context, x, z, rotY);

  return light;
}

function addParkingCar(context, spawnBlock, x, z, rotY, color) {
  const isSideways = Math.abs(Math.sin(rotY)) > 0.5;
  const bodyWidth = isSideways ? 2.05 : 4.2;
  const bodyDepth = isSideways ? 4.2 : 2.05;

  const body = spawnBlock(bodyWidth, 1.05, bodyDepth, x, 0.52, z, color, true, false);

  const roofMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.2
  });

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(isSideways ? 1.55 : 2.0, 0.55, isSideways ? 2.0 : 1.55),
    roofMat
  );
  roof.position.set(x, 1.28, z);
  roof.rotation.y = rotY;
  addDressingMesh(context, roof);

  const windshieldMat = new THREE.MeshBasicMaterial({ color: 0x9bd6ff, transparent: true, opacity: 0.24 });
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(isSideways ? 1.62 : 1.25, 0.035, isSideways ? 1.25 : 1.62),
    windshieldMat
  );
  windshield.position.set(x, 1.58, z);
  windshield.rotation.y = rotY;
  addDressingMesh(context, windshield);

  return body;
}

function addArrow(context, x, z, rotY = 0) {
  const mat = makeLineMaterial(0xffffff, 0.46);

  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 4.2), mat);
  shaft.rotation.x = -Math.PI / 2;
  shaft.rotation.z = rotY;
  shaft.position.set(x, 0.038, z);

  const head = new THREE.Mesh(new THREE.CircleGeometry(0.9, 3), mat);
  head.rotation.x = -Math.PI / 2;
  head.rotation.z = rotY;
  head.position.set(
    x + Math.sin(rotY) * 2.45,
    0.04,
    z + Math.cos(rotY) * 2.45
  );

  addDressingMesh(context, shaft);
  addDressingMesh(context, head);
}

function makeTextTexture(text, bg = '#102035', fg = '#dff8ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = fg;
  ctx.font = '900 54px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function addWallSign(context, text, x, z, rotY = 0, bg = '#102035', fg = '#dff8ff') {
  const mat = new THREE.MeshBasicMaterial({
    map: makeTextTexture(text, bg, fg),
    transparent: true,
    side: THREE.DoubleSide
  });

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.65), mat);
  sign.position.set(x, 2.35, z);
  sign.rotation.y = rotY;
  return addDressingMesh(context, sign);
}

function addPillarFloorMark(context, x, z, color) {
  addParkingLine(context, x, z - 1.55, 3.4, 0.12, 0, color, 0.72);
  addParkingLine(context, x, z + 1.55, 3.4, 0.12, 0, color, 0.72);
  addParkingLine(context, x - 1.55, z, 0.12, 3.4, 0, color, 0.72);
  addParkingLine(context, x + 1.55, z, 0.12, 3.4, 0, color, 0.72);
}

function addHazardGateStripes(context) {
  const yellow = 0xffcc33;
  const black = 0x111111;

  for (let i = -3; i <= 3; i++) {
    const color = i % 2 === 0 ? yellow : black;
    addParkingLine(context, -1.25, i * 1.5, 0.22, 1.05, Math.PI / 5, color, 0.7);
    addParkingLine(context, 1.25, i * 1.5, 0.22, 1.05, -Math.PI / 5, color, 0.7);
  }
}

export function buildParkingGarage(context) {
  const {
    scene,
    mapMeshes,
    walls,
    doors,
    spawnPoints,
    playerSpawnPoints,
    lockedSpawnPoints,
    spawnBlock,
    spawnBarricade,
    spawnTrap
  } = context;

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1d222a,
    roughness: 0.94,
    metalness: 0.02
  });

  const floorMesh = createMapFloor(
    { scene, mapMeshes },
    {
      width: 84,
      depth: 72,
      material: floorMat
    }
  );

  floorMesh.name = 'parking_garage_floor';

  // No full ceiling mesh: the top-down preview camera must see the playable floor.
  // Overhead fixtures below still give the garage its indoor feel without hiding the map.

  const wallColor = 0x303741;
  const concreteColor = 0x555f6b;
  const barrierColor = 0x2b3139;

  // Perimeter concrete walls.
  spawnBlock(84, 4.4, 2, 0, 2.2, -37, wallColor, true, false);
  spawnBlock(84, 4.4, 2, 0, 2.2, 37, wallColor, true, false);
  spawnBlock(2, 4.4, 72, -43, 2.2, 0, wallColor, true, false);
  spawnBlock(2, 4.4, 72, 43, 2.2, 0, wallColor, true, false);

  // Central divider walls with a security gate opening.
  spawnBlock(1.2, 3.1, 17, 0, 1.55, -22, barrierColor, true, false);
  spawnBlock(1.2, 3.1, 17, 0, 1.55, 22, barrierColor, true, false);

  const gate = spawnBlock(1.3, 3.2, 14, 0, 1.6, 0, 0xff5500, true, true);
  gate.mesh.name = 'parking_garage_security_gate';
  gate.pos.set(0, 0, 0);
  doors.push(gate);

  // Landmarks and signage make the garage easier to read while moving.
  addWallSign({ scene, mapMeshes }, 'LEVEL B1', -42.05, 0, Math.PI / 2, '#172333', '#ffcc55');
  addWallSign({ scene, mapMeshes }, 'EXIT →', 0, -36.05, 0, '#12351f', '#74ff9b');
  addWallSign({ scene, mapMeshes }, 'SECURITY GATE', 0, 36.05, Math.PI, '#331a10', '#ffcc55');
  addWallSign({ scene, mapMeshes }, 'SECTION A', -26, 36.05, Math.PI, '#10283a', '#9defff');
  addWallSign({ scene, mapMeshes }, 'SECTION B', 26, -36.05, 0, '#2e1234', '#ff9df5');
  addHazardGateStripes({ scene, mapMeshes });

  // Pillar grid with floor hazard markers.
  [-28, -14, 14, 28].forEach((x) => {
    [-24, -8, 8, 24].forEach((z) => {
      spawnBlock(1.8, 3.7, 1.8, x, 1.85, z, concreteColor, true, false);
      addPillarFloorMark({ scene, mapMeshes }, x, z, Math.abs(x) === Math.abs(z) ? 0xffcc33 : 0xffffff);
    });
  });

  // Low concrete wheel stops / lane blockers. These guide flow but leave clear routes around the gate.
  [
    [-21, 0, 9, 1.0],
    [21, 0, 9, 1.0],
    [-33, -12, 8, 1.0],
    [33, 12, 8, 1.0],
    [-10, 16, 8, 1.0],
    [10, -16, 8, 1.0],
    [-24, 8, 1.0, 8],
    [24, -8, 1.0, 8]
  ].forEach(([x, z, w, d]) => {
    spawnBlock(w, 0.85, d, x, 0.42, z, 0x3a424b, true, false);
  });

  // Parked cars used as combat cover. Spacing keeps player/trap markers clear.
  addParkingCar({ scene, mapMeshes }, spawnBlock, -31, -24, 0, 0x7a2222);
  addParkingCar({ scene, mapMeshes }, spawnBlock, -31, 12, 0, 0x314c75);
  addParkingCar({ scene, mapMeshes }, spawnBlock, -19, 18, 0, 0x1e5476);
  addParkingCar({ scene, mapMeshes }, spawnBlock, -18, -30, 0, 0x64696f);
  addParkingCar({ scene, mapMeshes }, spawnBlock, 18, 30, 0, 0x4b5f6a);
  addParkingCar({ scene, mapMeshes }, spawnBlock, 19, -18, 0, 0x6e6e72);
  addParkingCar({ scene, mapMeshes }, spawnBlock, 31, -12, 0, 0x6c3e25);
  addParkingCar({ scene, mapMeshes }, spawnBlock, 31, 24, 0, 0x225b38);
  addParkingCar({ scene, mapMeshes }, spawnBlock, -6, 31, Math.PI / 2, 0x6d5924);
  addParkingCar({ scene, mapMeshes }, spawnBlock, 6, -31, Math.PI / 2, 0x532970);

  // Parking bay lines, lane dividers, and direction arrows.
  [-36, -28, -20, -12, 12, 20, 28, 36].forEach((x) => {
    addParkingLine({ scene, mapMeshes }, x, 30, 0.16, 9.5);
    addParkingLine({ scene, mapMeshes }, x, -30, 0.16, 9.5);
  });

  [-27, -9, 9, 27].forEach((x) => {
    addParkingLine({ scene, mapMeshes }, x, 0, 10.0, 0.15, 0, 0xffffff, 0.45);
  });

  [-18, 18].forEach((x) => {
    addParkingLine({ scene, mapMeshes }, x, 16, 11.5, 0.12, 0, 0xffcc33, 0.48);
    addParkingLine({ scene, mapMeshes }, x, -16, 11.5, 0.12, 0, 0xffcc33, 0.48);
  });

  addArrow({ scene, mapMeshes }, -18, -4, Math.PI / 2);
  addArrow({ scene, mapMeshes }, 18, 4, -Math.PI / 2);
  addArrow({ scene, mapMeshes }, 0, -28, 0);
  addArrow({ scene, mapMeshes }, 0, 28, Math.PI);

  // Fluorescent lights. Kept modest so this map stays performance-safe.
  [
    [-28, -25, 0],
    [28, -25, 0],
    [0, 0, Math.PI / 2],
    [-28, 25, 0],
    [28, 25, 0],
    [-8, 14, Math.PI / 2],
    [8, -14, Math.PI / 2]
  ].forEach(([x, z, rotY]) => addOverheadLight({ scene, mapMeshes }, x, z, rotY));

  // Traps and barricades. Trap interaction points stay in open lanes.
  spawnTrap(-34, 6, 8, true);
  spawnTrap(34, -6, 8, true);
  spawnTrap(0, -10, 10, false);

  spawnBarricade(-41, -18, Math.PI / 2);
  spawnBarricade(41, 18, -Math.PI / 2);
  spawnBarricade(-18, 35.5, 0);
  spawnBarricade(18, -35.5, Math.PI);

  // Player starts: open lanes away from cars, pillars, wheel stops, traps, and divider collision.
  addPoint(playerSpawnPoints, -34, -2);
  addPoint(playerSpawnPoints, 34, 2);
  addPoint(playerSpawnPoints, -10, -9);
  addPoint(playerSpawnPoints, 10, 9);

  // Open spawns. Corners and back lanes keep early pressure readable.
  [
    [-38, -28],
    [-38, 28],
    [-26, -32],
    [-26, 32],
    [12, -32],
    [-12, 32],
    [26, -32],
    [26, 32]
  ].forEach(([x, z]) => addPoint(spawnPoints, x, z));

  // Extra pressure unlocks after opening the security gate.
  [
    [38, -28],
    [38, 28],
    [34, -8],
    [34, 8],
    [12, -31],
    [12, 31],
    [-12, -31],
    [-12, 31]
  ].forEach(([x, z]) => addPoint(lockedSpawnPoints, x, z));

  return { floorMesh, width: 84, depth: 72, navigationCellSize: 2.5 };
}
