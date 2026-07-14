// js/maps/reactor_courtyard.js
// ART.6 — Reactor Courtyard cinematic visual-art overhaul.
// Gameplay collision, traps, barricades, player starts, zombie spawns, and navigation
// remain aligned with the certified Reactor Courtyard layout.

import * as THREE from 'three';
import { createMapFloor } from './map_helpers.js';

const REACTOR_WIDTH = 92;
const REACTOR_DEPTH = 76;
const ART_PATCH = 'art6-reactor-courtyard-r1';

const MATERIALS = new Map();
const GEOMETRIES = new Map();
let reactorFloorTexture = null;

function material(key, options) {
  if (!MATERIALS.has(key)) {
    MATERIALS.set(key, new THREE.MeshStandardMaterial(options));
  }
  return MATERIALS.get(key);
}

function basicMaterial(key, options) {
  const cacheKey = `basic:${key}`;
  if (!MATERIALS.has(cacheKey)) {
    MATERIALS.set(cacheKey, new THREE.MeshBasicMaterial(options));
  }
  return MATERIALS.get(cacheKey);
}

function boxGeometry(w, h, d) {
  const key = `box:${w}:${h}:${d}`;
  if (!GEOMETRIES.has(key)) GEOMETRIES.set(key, new THREE.BoxGeometry(w, h, d));
  return GEOMETRIES.get(key);
}

function cylinderGeometry(rt, rb, h, segments = 12) {
  const key = `cyl:${rt}:${rb}:${h}:${segments}`;
  if (!GEOMETRIES.has(key)) {
    GEOMETRIES.set(key, new THREE.CylinderGeometry(rt, rb, h, segments));
  }
  return GEOMETRIES.get(key);
}

function planeGeometry(w, h) {
  const key = `plane:${w}:${h}`;
  if (!GEOMETRIES.has(key)) GEOMETRIES.set(key, new THREE.PlaneGeometry(w, h));
  return GEOMETRIES.get(key);
}

function torusGeometry(radius, tube, radial = 8, tubular = 24) {
  const key = `torus:${radius}:${tube}:${radial}:${tubular}`;
  if (!GEOMETRIES.has(key)) {
    GEOMETRIES.set(key, new THREE.TorusGeometry(radius, tube, radial, tubular));
  }
  return GEOMETRIES.get(key);
}

function createReactorFloorTexture() {
  if (reactorFloorTexture) return reactorFloorTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#11191d';
  ctx.fillRect(0, 0, 256, 256);

  let seed = 0x52454143;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < 1600; i++) {
    const shade = 15 + Math.floor(random() * 28);
    ctx.fillStyle = `rgba(${shade},${shade + 7},${shade + 10},${0.10 + random() * 0.20})`;
    const size = random() > 0.95 ? 3 : 1;
    ctx.fillRect(random() * 256, random() * 256, size, size);
  }

  ctx.strokeStyle = 'rgba(52,78,87,0.22)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(2,5,7,0.42)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const x = random() * 256;
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10 + random() * 34, y - 5 + random() * 12);
    ctx.stroke();
  }

  reactorFloorTexture = new THREE.CanvasTexture(canvas);
  reactorFloorTexture.wrapS = THREE.RepeatWrapping;
  reactorFloorTexture.wrapT = THREE.RepeatWrapping;
  reactorFloorTexture.repeat.set(12, 10);
  reactorFloorTexture.colorSpace = THREE.SRGBColorSpace;
  return reactorFloorTexture;
}

function createArtRoot(context, name, minGraphicsQuality = 'medium') {
  const root = new THREE.Group();
  root.name = name;
  root.userData.isMapDressing = true;
  root.userData.noCollision = true;
  root.userData.playerNonWalkable = true;
  root.userData.playerNonBlockingProjectile = true;
  root.userData.minGraphicsQuality = minGraphicsQuality;
  root.userData.artPatch = ART_PATCH;
  context.scene.add(root);
  context.mapMeshes.push(root);
  return root;
}

function addArtObject(root, object, name) {
  object.name = name;
  object.userData.isMapDressing = true;
  object.userData.noCollision = true;
  object.userData.playerNonWalkable = true;
  object.userData.playerNonBlockingProjectile = true;
  object.userData.artPatch = ART_PATCH;
  object.frustumCulled = true;
  root.add(object);
  return object;
}

function addVisualBox(root, name, x, y, z, w, h, d, meshMaterial, options = {}) {
  const mesh = new THREE.Mesh(boxGeometry(w, h, d), meshMaterial);
  mesh.position.set(x, y, z);
  mesh.rotation.set(options.rotationX || 0, options.rotationY || 0, options.rotationZ || 0);
  return addArtObject(root, mesh, name);
}

function addVisualCylinder(root, name, x, y, z, rt, rb, h, meshMaterial, options = {}) {
  const mesh = new THREE.Mesh(
    cylinderGeometry(rt, rb, h, options.segments || 12),
    meshMaterial
  );
  mesh.position.set(x, y, z);
  mesh.rotation.set(options.rotationX || 0, options.rotationY || 0, options.rotationZ || 0);
  return addArtObject(root, mesh, name);
}

function addGroundPlane(root, name, x, z, w, d, meshMaterial, rotationY = 0, y = 0.035) {
  const mesh = new THREE.Mesh(planeGeometry(w, d), meshMaterial);
  mesh.position.set(x, y, z);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotationY;
  return addArtObject(root, mesh, name);
}

function addCollisionBox(context, name, x, y, z, w, h, d, color, options = {}) {
  const meshMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.82,
    metalness: options.metalness ?? 0.06,
    emissive: options.emissiveColor ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), meshMaterial);
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

function makeTextTexture(text, bg, fg, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = fg;
  ctx.shadowColor = fg;
  ctx.shadowBlur = 12;
  ctx.font = '900 52px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addWallSign(root, name, text, x, y, z, rotationY, bg, fg, accent) {
  const housing = material('reactor-sign-housing', {
    color: 0x11181d,
    roughness: 0.54,
    metalness: 0.58
  });
  const faceMaterial = new THREE.MeshBasicMaterial({
    map: makeTextTexture(text, bg, fg, accent),
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
    toneMapped: false
  });

  addVisualBox(root, `${name}_housing`, x, y, z, 5.9, 1.75, 0.18, housing, { rotationY });
  const normalX = Math.sin(rotationY);
  const normalZ = Math.cos(rotationY);
  const face = new THREE.Mesh(planeGeometry(5.5, 1.48), faceMaterial);
  face.position.set(x + normalX * 0.11, y, z + normalZ * 0.11);
  face.rotation.y = rotationY;
  addArtObject(root, face, `${name}_face`);
}

function addLightPool(root, name, x, z, w, d, color, opacity, rotationY = 0) {
  const pool = basicMaterial(`pool:${color}:${opacity}`, {
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  addGroundPlane(root, name, x, z, w, d, pool, rotationY, 0.04);
}

function addFixture(root, name, x, y, z, rotationY, color, includeLight = true) {
  const housing = material('reactor-fixture-housing', {
    color: 0x202a30,
    roughness: 0.48,
    metalness: 0.68
  });
  const glow = material(`reactor-fixture-glow:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 2.5,
    roughness: 0.15,
    metalness: 0.04
  });

  addVisualBox(root, `${name}_housing`, x, y, z, 2.7, 0.28, 0.45, housing, { rotationY });
  addVisualBox(root, `${name}_lamp`, x, y - 0.16, z, 2.25, 0.08, 0.18, glow, { rotationY });

  if (includeLight) {
    const light = new THREE.PointLight(color, 5.6, 18, 2.1);
    light.position.set(x, y - 0.55, z);
    light.castShadow = false;
    addArtObject(root, light, `${name}_light`);
  }
}

function addCoreVisuals(medium, high) {
  const steel = material('reactor-core-steel', {
    color: 0x26343a,
    roughness: 0.48,
    metalness: 0.72
  });
  const darkSteel = material('reactor-core-dark', {
    color: 0x10181c,
    roughness: 0.55,
    metalness: 0.78
  });
  const cyan = material('reactor-core-cyan', {
    color: 0x3befff,
    emissive: 0x0edfff,
    emissiveIntensity: 3.2,
    transparent: true,
    opacity: 0.82,
    roughness: 0.08,
    metalness: 0.02
  });
  const orange = material('reactor-core-orange', {
    color: 0xffa23a,
    emissive: 0xff6a16,
    emissiveIntensity: 2.6,
    roughness: 0.16,
    metalness: 0.06
  });

  addVisualCylinder(medium, 'reactor_core_plinth', 0, 1.70, 0, 4.35, 4.65, 0.50, darkSteel, { segments: 16 });
  addVisualCylinder(medium, 'reactor_core_column', 0, 4.10, 0, 2.10, 2.55, 5.10, steel, { segments: 16 });
  addVisualCylinder(medium, 'reactor_core_energy', 0, 4.15, 0, 1.45, 1.45, 5.35, cyan, { segments: 16 });
  addVisualCylinder(medium, 'reactor_core_cap', 0, 6.75, 0, 2.75, 2.25, 0.62, darkSteel, { segments: 16 });

  [2.55, 4.10, 5.65].forEach((y, index) => {
    const ring = new THREE.Mesh(torusGeometry(2.35, 0.16, 8, 28), index === 1 ? orange : cyan);
    ring.position.set(0, y, 0);
    ring.rotation.x = Math.PI / 2;
    addArtObject(medium, ring, `reactor_core_ring_${index}`);
  });

  [[-4.7, -4.7], [4.7, -4.7], [-4.7, 4.7], [4.7, 4.7]].forEach(([x, z], index) => {
    addVisualBox(medium, `reactor_core_pylon_${index}`, x, 2.65, z, 0.72, 5.3, 0.72, steel);
    addVisualBox(medium, `reactor_core_pylon_lamp_${index}`, x, 4.9, z, 0.42, 0.52, 0.42, index % 2 ? orange : cyan);
  });

  addLightPool(medium, 'reactor_core_cyan_pool', -1.4, 0, 13, 13, 0x18ddff, 0.16);
  addLightPool(medium, 'reactor_core_orange_pool', 1.8, 0.6, 9, 9, 0xff741c, 0.10);

  const coreLight = new THREE.PointLight(0x28e7ff, 13, 28, 2.0);
  coreLight.position.set(0, 4.8, 0);
  coreLight.castShadow = false;
  addArtObject(medium, coreLight, 'reactor_core_point_light');

  const warningLight = new THREE.PointLight(0xff721f, 7, 20, 2.0);
  warningLight.position.set(0, 2.2, 0);
  warningLight.castShadow = false;
  addArtObject(high, warningLight, 'reactor_core_warning_light');
}

function addCoolantBankVisual(root, name, x, z, warm = false) {
  const body = material(warm ? 'coolant-body-warm' : 'coolant-body-cool', {
    color: warm ? 0x4a3529 : 0x29434a,
    roughness: 0.56,
    metalness: 0.52
  });
  const trim = material('coolant-trim', {
    color: 0x172126,
    roughness: 0.46,
    metalness: 0.72
  });
  const glow = material(warm ? 'coolant-glow-warm' : 'coolant-glow-cool', {
    color: warm ? 0xff9a32 : 0x32e5ff,
    emissive: warm ? 0xff6115 : 0x12cfee,
    emissiveIntensity: 2.2,
    roughness: 0.14,
    metalness: 0.05
  });

  addVisualBox(root, `${name}_shell`, x, 1.24, z, 7.12, 2.42, 5.12, body);
  addVisualBox(root, `${name}_top`, x, 2.50, z, 7.42, 0.18, 5.42, trim);
  [-2.55, 0, 2.55].forEach((offset, index) => {
    addVisualBox(root, `${name}_rib_${index}`, x + offset, 1.28, z - 2.60, 0.18, 2.05, 0.12, trim);
    addVisualBox(root, `${name}_lamp_${index}`, x + offset, 1.30, z - 2.68, 0.52, 0.18, 0.05, glow);
  });
  addLightPool(root, `${name}_pool`, x, z - 2.8, 7.5, 3.2, warm ? 0xff731c : 0x1bdcff, 0.08);
}

function addPipeRun(root, name, x, z, length, rotationY, warm = false) {
  const steel = material('reactor-pipe-steel', {
    color: 0x273238,
    roughness: 0.46,
    metalness: 0.76
  });
  const pipe = material(warm ? 'reactor-pipe-warm' : 'reactor-pipe-cool', {
    color: warm ? 0x774023 : 0x24566a,
    roughness: 0.52,
    metalness: 0.64
  });

  const supportCount = Math.max(3, Math.floor(length / 6));
  for (let i = 0; i < supportCount; i++) {
    const t = supportCount === 1 ? 0 : i / (supportCount - 1);
    const local = -length / 2 + t * length;
    const sx = x + Math.cos(rotationY) * local;
    const sz = z - Math.sin(rotationY) * local;
    addVisualBox(root, `${name}_support_${i}`, sx, 2.25, sz, 0.22, 4.5, 0.22, steel, { rotationY });
  }

  [-0.54, 0.54].forEach((side, index) => {
    const px = x + Math.cos(rotationY + Math.PI / 2) * side;
    const pz = z - Math.sin(rotationY + Math.PI / 2) * side;
    addVisualCylinder(root, `${name}_pipe_${index}`, px, 3.1 + index * 0.45, pz, 0.18, 0.18, length, pipe, {
      segments: 10,
      rotationZ: Math.PI / 2,
      rotationY
    });
  });
}

function addSteamVent(root, name, x, z, warm = false) {
  const base = material('reactor-vent-base', {
    color: 0x1d282d,
    roughness: 0.50,
    metalness: 0.70
  });
  const steam = basicMaterial(`steam:${warm}`, {
    color: warm ? 0xffc088 : 0xbdeeff,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  addVisualCylinder(root, `${name}_base`, x, 0.22, z, 0.82, 0.92, 0.42, base, { segments: 12 });
  for (let i = 0; i < 3; i++) {
    const plume = new THREE.Mesh(planeGeometry(1.2 + i * 0.45, 3.2 + i * 1.25), steam);
    plume.position.set(x + (i - 1) * 0.18, 2.1 + i * 0.75, z + (i % 2 ? 0.15 : -0.12));
    plume.rotation.y = i * Math.PI / 3;
    addArtObject(root, plume, `${name}_steam_${i}`);
  }
}

function addPerimeterDressing(medium, high) {
  const cyan = 0x26ddff;
  const orange = 0xff8b2b;
  const wallSteel = material('reactor-wall-steel', {
    color: 0x1c272d,
    roughness: 0.58,
    metalness: 0.62
  });
  const hazard = material('reactor-hazard', {
    color: 0xe89a22,
    emissive: 0x6a2d00,
    emissiveIntensity: 0.16,
    roughness: 0.68,
    metalness: 0.22
  });

  // Interior wall ribs and utility ledges.
  for (let x = -40; x <= 40; x += 10) {
    addVisualBox(medium, `reactor_wall_rib_n_${x}`, x, 2.45, -36.88, 0.34, 4.2, 0.24, wallSteel);
    addVisualBox(medium, `reactor_wall_rib_s_${x}`, x, 2.45, 36.88, 0.34, 4.2, 0.24, wallSteel);
  }
  for (let z = -30; z <= 30; z += 10) {
    addVisualBox(medium, `reactor_wall_rib_w_${z}`, -44.88, 2.45, z, 0.24, 4.2, 0.34, wallSteel);
    addVisualBox(medium, `reactor_wall_rib_e_${z}`, 44.88, 2.45, z, 0.24, 4.2, 0.34, wallSteel);
  }

  // Correctly oriented inward-facing signs.
  addWallSign(medium, 'reactor_sign_n', 'CORE 06', -20, 2.65, -36.82, 0, '#102631', '#d7fbff', '#21dfff');
  addWallSign(medium, 'reactor_sign_s', 'COOLANT', 20, 2.65, 36.82, Math.PI, '#2d1b10', '#fff1d8', '#ff8b2b');
  addWallSign(medium, 'reactor_sign_w', 'OVERRIDE', -44.82, 2.65, 15, Math.PI / 2, '#102631', '#d7fbff', '#21dfff');
  addWallSign(medium, 'reactor_sign_e', 'SECTOR C', 44.82, 2.65, -15, -Math.PI / 2, '#2d1b10', '#fff1d8', '#ff8b2b');

  [
    [-30, 5.15, -34.9, 0, cyan],
    [0, 5.15, -34.9, 0, cyan],
    [30, 5.15, -34.9, 0, orange],
    [-30, 5.15, 34.9, Math.PI, cyan],
    [0, 5.15, 34.9, Math.PI, orange],
    [30, 5.15, 34.9, Math.PI, orange],
    [-43.9, 5.15, -18, Math.PI / 2, cyan],
    [43.9, 5.15, 18, -Math.PI / 2, orange]
  ].forEach(([x, y, z, rotationY, color], index) => {
    addFixture(medium, `reactor_fixture_${index}`, x, y, z, rotationY, color, index < 6);
  });

  // Hazard-striped approach pads.
  const hazardMat = hazard;
  [
    [0, -10.8, 0], [0, 10.8, 0], [-10.8, 0, Math.PI / 2], [10.8, 0, Math.PI / 2]
  ].forEach(([x, z, rotationY], groupIndex) => {
    for (let i = -4; i <= 4; i++) {
      const local = i * 0.72;
      const px = x + Math.cos(rotationY) * local;
      const pz = z - Math.sin(rotationY) * local;
      addVisualBox(medium, `reactor_hazard_${groupIndex}_${i + 4}`, px, 0.055, pz, 0.34, 0.025, 1.25, hazardMat, {
        rotationY: rotationY + 0.48
      });
    }
  });

  // High-detail overhead truss silhouettes.
  [-28, 0, 28].forEach((x, index) => {
    addVisualBox(high, `reactor_truss_${index}`, x, 7.4, 0, 0.34, 0.34, 70, wallSteel);
  });
  [-24, 24].forEach((z, index) => {
    addVisualBox(high, `reactor_cross_truss_${index}`, 0, 7.4, z, 82, 0.34, 0.34, wallSteel);
  });
}

function addFloorDressing(medium, high) {
  const cyan = material('reactor-lane-cyan', {
    color: 0x34e9ff,
    emissive: 0x13d8ff,
    emissiveIntensity: 2.4,
    roughness: 0.16,
    metalness: 0.03
  });
  const orange = material('reactor-lane-orange', {
    color: 0xff9a37,
    emissive: 0xff6415,
    emissiveIntensity: 2.1,
    roughness: 0.16,
    metalness: 0.03
  });
  const white = material('reactor-lane-white', {
    color: 0xaac3cb,
    emissive: 0x294a55,
    emissiveIntensity: 0.20,
    roughness: 0.72,
    metalness: 0.10
  });
  const puddle = basicMaterial('reactor-puddle', {
    color: 0x1bcfff,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });

  addVisualBox(medium, 'reactor_lane_north', 0, 0.055, -27, 72, 0.03, 0.20, cyan);
  addVisualBox(medium, 'reactor_lane_south', 0, 0.055, 27, 72, 0.03, 0.20, orange);
  addVisualBox(medium, 'reactor_lane_west', -35, 0.055, 0, 0.20, 0.03, 46, cyan);
  addVisualBox(medium, 'reactor_lane_east', 35, 0.055, 0, 0.20, 0.03, 46, orange);

  [-18, 18].forEach((x, index) => {
    addVisualBox(medium, `reactor_center_lane_${index}`, x, 0.052, 0, 0.16, 0.025, 54, white);
  });

  [
    [-28, -22, 6.4, 3.4, 0.18],
    [26, 18, 7.2, 4.0, -0.24],
    [-6, 25, 5.8, 3.0, 0.10],
    [10, -24, 6.8, 3.5, -0.12],
    [-34, 5, 4.8, 2.7, 0.20],
    [34, -5, 4.8, 2.7, -0.20]
  ].forEach(([x, z, w, d, rotationY], index) => {
    addGroundPlane(high, `reactor_puddle_${index}`, x, z, w, d, puddle, rotationY, 0.042);
  });
}

function addReactorDressing(context) {
  const medium = createArtRoot(context, 'reactor_art_medium', 'medium');
  const high = createArtRoot(context, 'reactor_art_high', 'high');

  addCoreVisuals(medium, high);
  addCoolantBankVisual(medium, 'reactor_coolant_visual_nw', -20, -17, false);
  addCoolantBankVisual(medium, 'reactor_coolant_visual_ne', 20, -17, true);
  addCoolantBankVisual(medium, 'reactor_coolant_visual_sw', -20, 17, false);
  addCoolantBankVisual(medium, 'reactor_coolant_visual_se', 20, 17, true);

  addPipeRun(medium, 'reactor_pipe_west', -39, 0, 34, Math.PI / 2, false);
  addPipeRun(medium, 'reactor_pipe_east', 39, 0, 34, Math.PI / 2, true);
  addPipeRun(high, 'reactor_pipe_north', 0, -32, 62, 0, false);
  addPipeRun(high, 'reactor_pipe_south', 0, 32, 62, 0, true);

  addSteamVent(high, 'reactor_steam_nw', -27, -26, false);
  addSteamVent(high, 'reactor_steam_ne', 27, -26, true);
  addSteamVent(high, 'reactor_steam_sw', -27, 26, false);
  addSteamVent(high, 'reactor_steam_se', 27, 26, true);

  addPerimeterDressing(medium, high);
  addFloorDressing(medium, high);
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

export function buildReactorCourtyard(context) {
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x11191d,
    map: createReactorFloorTexture(),
    roughness: 0.56,
    metalness: 0.10,
    clearcoat: 0.62,
    clearcoatRoughness: 0.30
  });

  const floorMesh = createMapFloor(
    { scene: context.scene, mapMeshes: context.mapMeshes },
    {
      width: REACTOR_WIDTH,
      depth: REACTOR_DEPTH,
      material: floorMaterial,
      supportTag: 'reactor_floor'
    }
  );
  floorMesh.name = 'reactor_courtyard_floor';
  floorMesh.receiveShadow = true;
  floorMesh.userData.artPatch = ART_PATCH;

  // Certified perimeter shell.
  addCollisionBox(context, 'reactor_wall_north', 0, 2.4, -38, REACTOR_WIDTH, 4.8, 2, 0x202b31);
  addCollisionBox(context, 'reactor_wall_south', 0, 2.4, 38, REACTOR_WIDTH, 4.8, 2, 0x202b31);
  addCollisionBox(context, 'reactor_wall_west', -46, 2.4, 0, 2, 4.8, REACTOR_DEPTH, 0x202b31);
  addCollisionBox(context, 'reactor_wall_east', 46, 2.4, 0, 2, 4.8, REACTOR_DEPTH, 0x202b31);

  // Certified central reactor collision.
  addCollisionBox(context, 'reactor_core', 0, 1.45, 0, 8, 2.9, 8, 0x253d46, {
    emissiveColor: 0x064a56,
    emissiveIntensity: 0.34,
    supportTag: 'reactor_core',
    playerClimbable: false
  });

  // Certified coolant banks.
  addCollisionBox(context, 'reactor_coolant_nw', -20, 1.15, -17, 7, 2.3, 5, 0x29434a);
  addCollisionBox(context, 'reactor_coolant_ne', 20, 1.15, -17, 7, 2.3, 5, 0x4a3529);
  addCollisionBox(context, 'reactor_coolant_sw', -20, 1.15, 17, 7, 2.3, 5, 0x29434a);
  addCollisionBox(context, 'reactor_coolant_se', 20, 1.15, 17, 7, 2.3, 5, 0x4a3529);

  // Certified service islands and lane dividers.
  addCollisionBox(context, 'reactor_service_west', -31, 1.25, 0, 7, 2.5, 5, 0x303943);
  addCollisionBox(context, 'reactor_service_east', 31, 1.25, 0, 7, 2.5, 5, 0x40352e);
  addCollisionBox(context, 'reactor_divider_north', 0, 0.75, -17, 13, 1.5, 2, 0x313b43);
  addCollisionBox(context, 'reactor_divider_south', 0, 0.75, 17, 13, 1.5, 2, 0x3d342d);

  // Certified barricades.
  if (context.spawnBarricade) {
    context.spawnBarricade(-42, -24, Math.PI / 2);
    context.spawnBarricade(42, 24, Math.PI / 2);
    context.spawnBarricade(-18, -34, 0);
    context.spawnBarricade(18, 34, 0);
  }

  // Certified electric traps.
  if (context.spawnTrap) {
    context.spawnTrap(0, -27, 10, false);
    context.spawnTrap(0, 27, 10, false);
  }

  addPlayerSpawns(context);
  addZombieSpawns(context);
  addReactorDressing(context);

  return {
    floorMesh,
    width: REACTOR_WIDTH,
    depth: REACTOR_DEPTH,
    center: { x: 0, z: 0 },
    navigationCellSize: 2.5
  };
}
