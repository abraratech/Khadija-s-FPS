// js/maps/hospital_wing.js
// ART.5 — Hospital Wing cinematic visual-art overhaul.
// Gameplay collision, quarantine gate, traps, barricades, and spawn coordinates
// remain aligned with the certified Hospital Wing layout.

import * as THREE from 'three';
import { createMapFloor } from './map_helpers.js';

const HOSPITAL_WIDTH = 92;
const HOSPITAL_DEPTH = 66;
const ART_PATCH = 'art5-hospital-wing-r1';

const MATERIALS = new Map();
const GEOMETRIES = new Map();
let hospitalFloorTexture = null;

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
  if (!GEOMETRIES.has(key)) {
    GEOMETRIES.set(key, new THREE.BoxGeometry(w, h, d));
  }
  return GEOMETRIES.get(key);
}

function cylinderGeometry(radiusTop, radiusBottom, height, segments = 10) {
  const key = `cyl:${radiusTop}:${radiusBottom}:${height}:${segments}`;
  if (!GEOMETRIES.has(key)) {
    GEOMETRIES.set(
      key,
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)
    );
  }
  return GEOMETRIES.get(key);
}

function planeGeometry(w, h) {
  const key = `plane:${w}:${h}`;
  if (!GEOMETRIES.has(key)) {
    GEOMETRIES.set(key, new THREE.PlaneGeometry(w, h));
  }
  return GEOMETRIES.get(key);
}

function createHospitalFloorTexture() {
  if (hospitalFloorTexture) return hospitalFloorTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#101918';
  ctx.fillRect(0, 0, 256, 256);

  // Worn hospital vinyl tiles.
  ctx.strokeStyle = 'rgba(105, 139, 132, 0.18)';
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

  let seed = 0x484f5350;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < 1350; i++) {
    const shade = 12 + Math.floor(random() * 26);
    ctx.fillStyle = `rgba(${shade},${shade + 7},${shade + 6},${0.10 + random() * 0.22})`;
    const size = random() > 0.95 ? 3 : 1;
    ctx.fillRect(random() * 256, random() * 256, size, size);
  }

  // Scuffs and dragged equipment marks.
  ctx.strokeStyle = 'rgba(2, 4, 4, 0.36)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const x = random() * 256;
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10 + random() * 36, y - 4 + random() * 8);
    ctx.stroke();
  }

  hospitalFloorTexture = new THREE.CanvasTexture(canvas);
  hospitalFloorTexture.wrapS = THREE.RepeatWrapping;
  hospitalFloorTexture.wrapT = THREE.RepeatWrapping;
  hospitalFloorTexture.repeat.set(12, 9);
  hospitalFloorTexture.colorSpace = THREE.SRGBColorSpace;
  return hospitalFloorTexture;
}

function addPoint(list, x, z) {
  list.push(new THREE.Vector3(x, 0, z));
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
  mesh.rotation.set(
    options.rotationX || 0,
    options.rotationY || 0,
    options.rotationZ || 0
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return addArtObject(root, mesh, name);
}

function addVisualCylinder(
  root,
  name,
  x,
  y,
  z,
  radiusTop,
  radiusBottom,
  height,
  meshMaterial,
  options = {}
) {
  const mesh = new THREE.Mesh(
    cylinderGeometry(radiusTop, radiusBottom, height, options.segments || 10),
    meshMaterial
  );
  mesh.position.set(x, y, z);
  mesh.rotation.set(
    options.rotationX || 0,
    options.rotationY || 0,
    options.rotationZ || 0
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return addArtObject(root, mesh, name);
}

function addGroundPlane(root, name, x, z, w, d, meshMaterial, rotationY = 0, y = 0.035) {
  const mesh = new THREE.Mesh(planeGeometry(w, d), meshMaterial);
  mesh.position.set(x, y, z);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotationY;
  return addArtObject(root, mesh, name);
}

function addGroundShadow(root, name, x, z, w, d, rotationY = 0, opacity = 0.28) {
  const shadow = basicMaterial(`shadow:${opacity}`, {
    color: 0x010202,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  addGroundPlane(root, name, x, z, w, d, shadow, rotationY, 0.026);
}

function makeTextTexture(text, bg = '#102825', fg = '#cffff4', accent = '#ff4b4b') {
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

function addWallSign(root, name, text, x, y, z, rotationY, bg, fg, accent = '#ff4b4b') {
  const housing = material('sign-housing', {
    color: 0x111817,
    roughness: 0.58,
    metalness: 0.52
  });
  const signMaterial = new THREE.MeshBasicMaterial({
    map: makeTextTexture(text, bg, fg, accent),
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false
  });

  addVisualBox(root, `${name}_housing`, x, y, z, 5.7, 1.72, 0.16, housing, { rotationY });
  const outwardY = rotationY + Math.PI;
  const sign = new THREE.Mesh(planeGeometry(5.35, 1.45), signMaterial);
  // Keep the face on the corridor side of the housing, but rotate its front
  // normal toward the corridor so the canvas text is readable, not mirrored.
  sign.position.set(
    x - Math.sin(rotationY) * 0.091,
    y,
    z - Math.cos(rotationY) * 0.091
  );
  sign.rotation.y = outwardY;
  addArtObject(root, sign, `${name}_face`);
}

function addLightPool(root, name, x, z, w, d, color, opacity = 0.13, rotationY = 0) {
  const pool = basicMaterial(`pool:${color}:${opacity}`, {
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  addGroundPlane(root, name, x, z, w, d, pool, rotationY, 0.040);
}

function addCeilingFixture(root, name, x, z, rotationY, color, intensity, options = {}) {
  const housing = material('ceiling-housing', {
    color: 0x202b29,
    roughness: 0.48,
    metalness: 0.62
  });
  const glow = material(`ceiling-glow:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: options.emissiveIntensity || 2.2,
    roughness: 0.18,
    metalness: 0.05
  });

  addVisualBox(root, `${name}_housing`, x, 4.04, z, 4.6, 0.18, 0.38, housing, { rotationY });
  addVisualBox(root, `${name}_lamp`, x, 3.92, z, 4.0, 0.055, 0.14, glow, { rotationY });
  addLightPool(root, `${name}_pool`, x, z, 8.0, 3.0, color, options.poolOpacity || 0.10, rotationY);

  const light = new THREE.PointLight(color, intensity, options.distance || 14, 2.0);
  light.position.set(x, 3.55, z);
  light.castShadow = false;
  addArtObject(root, light, `${name}_light`);
}

function addEmergencyBeacon(root, name, x, z, options = {}) {
  const red = options.color || 0xff3030;
  const housing = material('beacon-housing', {
    color: 0x171b1a,
    roughness: 0.48,
    metalness: 0.66
  });
  const glow = material(`beacon:${red}`, {
    color: red,
    emissive: red,
    emissiveIntensity: 3.6,
    roughness: 0.16
  });

  addVisualBox(root, `${name}_mount`, x, 3.60, z, 0.42, 0.22, 0.42, housing);
  addVisualCylinder(root, `${name}_lamp`, x, 3.79, z, 0.13, 0.18, 0.28, glow, { segments: 10 });
  addLightPool(root, `${name}_pool`, x, z, 5.6, 5.6, red, 0.08);

  const light = new THREE.PointLight(red, options.intensity || 7.5, options.distance || 12, 2.1);
  light.position.set(x, 3.35, z);
  light.castShadow = false;
  addArtObject(root, light, `${name}_light`);
}

function addWallPanel(root, name, x, z, rotationY, width = 5.5, color = 0x263a36) {
  const panel = material(`wall-panel:${color}`, {
    color,
    roughness: 0.72,
    metalness: 0.18
  });
  const trim = material('wall-panel-trim', {
    color: 0x131b19,
    roughness: 0.54,
    metalness: 0.52
  });

  addVisualBox(root, `${name}_panel`, x, 1.65, z, width, 2.75, 0.14, panel, { rotationY });
  addVisualBox(root, `${name}_top`, x, 2.91, z, width + 0.18, 0.12, 0.18, trim, { rotationY });
  addVisualBox(root, `${name}_rail`, x, 1.02, z, width + 0.10, 0.12, 0.20, trim, { rotationY });
}

function addTreatmentBedVisual(root, key, x, z, rotationY = 0) {
  const sideways = Math.abs(Math.sin(rotationY)) > 0.5;
  const mattress = material('bed-mattress', {
    color: 0x9cb8b1,
    roughness: 0.82,
    metalness: 0.02
  });
  const sheet = material('bed-sheet', {
    color: 0xb9d0ca,
    roughness: 0.92,
    metalness: 0.01
  });
  const frame = material('bed-frame', {
    color: 0xc4d6d1,
    roughness: 0.34,
    metalness: 0.72
  });
  const screen = material('monitor-screen', {
    color: 0x62fff0,
    emissive: 0x33d9ca,
    emissiveIntensity: 2.2,
    roughness: 0.16
  });

  const bedW = sideways ? 1.55 : 3.35;
  const bedD = sideways ? 3.35 : 1.55;

  addGroundShadow(root, `${key}_shadow`, x, z, bedW + 0.8, bedD + 0.8, rotationY, 0.26);
  addVisualBox(root, `${key}_mattress`, x, 0.82, z, bedW * 0.94, 0.24, bedD * 0.94, mattress, { rotationY });
  addVisualBox(root, `${key}_sheet`, x, 0.95, z, bedW * 0.90, 0.07, bedD * 0.88, sheet, { rotationY });

  const long = sideways ? bedD : bedW;
  [-0.62, 0.62].forEach((side, index) => {
    const px = x + Math.cos(rotationY + Math.PI / 2) * side;
    const pz = z - Math.sin(rotationY + Math.PI / 2) * side;
    addVisualBox(root, `${key}_rail_${index}`, px, 1.10, pz, long, 0.12, 0.10, frame, { rotationY });
  });

  const headOffset = 1.50;
  const hx = x - Math.cos(rotationY) * headOffset;
  const hz = z + Math.sin(rotationY) * headOffset;
  addVisualBox(root, `${key}_headboard`, hx, 1.02, hz, sideways ? 1.35 : 0.14, 1.12, sideways ? 0.14 : 1.35, frame, { rotationY });
  addVisualBox(root, `${key}_monitor`, hx + Math.cos(rotationY + Math.PI / 2) * 0.76, 1.42, hz - Math.sin(rotationY + Math.PI / 2) * 0.76, 0.54, 0.34, 0.10, screen, { rotationY });
}

function addSupplyCartVisual(root, key, x, z, rotationY = 0) {
  const body = material('cart-body', {
    color: 0x3b4b47,
    roughness: 0.62,
    metalness: 0.38
  });
  const trim = material('cart-trim', {
    color: 0xb8cfca,
    roughness: 0.34,
    metalness: 0.68
  });
  const glow = material('cart-screen', {
    color: 0x62ffe8,
    emissive: 0x39d8c5,
    emissiveIntensity: 1.9,
    roughness: 0.18
  });

  addGroundShadow(root, `${key}_shadow`, x, z, 3.2, 2.0, rotationY, 0.23);
  addVisualBox(root, `${key}_top`, x, 1.05, z, 2.55, 0.10, 1.12, trim, { rotationY });
  addVisualBox(root, `${key}_drawer`, x, 0.68, z, 2.20, 0.18, 1.02, body, { rotationY });
  addVisualBox(root, `${key}_screen`, x, 0.72, z - Math.cos(rotationY) * 0.58, 0.72, 0.34, 0.05, glow, { rotationY });

  [-0.88, 0.88].forEach((offset, index) => {
    const wx = x + Math.cos(rotationY) * offset;
    const wz = z - Math.sin(rotationY) * offset;
    addVisualCylinder(root, `${key}_wheel_${index}`, wx, 0.16, wz, 0.14, 0.14, 0.12, body, {
      segments: 8,
      rotationX: Math.PI / 2
    });
  });
}

function addCurtainTrack(root, key, x, z, rotationY = 0) {
  const steel = material('curtain-track', {
    color: 0x9bb6b0,
    roughness: 0.36,
    metalness: 0.68
  });
  addVisualBox(root, `${key}_track`, x, 2.48, z, 4.45, 0.10, 0.10, steel, { rotationY });
  [-1.8, -0.9, 0, 0.9, 1.8].forEach((offset, index) => {
    const px = x + Math.cos(rotationY) * offset;
    const pz = z - Math.sin(rotationY) * offset;
    addVisualCylinder(root, `${key}_hook_${index}`, px, 2.28, pz, 0.025, 0.025, 0.34, steel, { segments: 6 });
  });
}

function addIVStand(root, key, x, z) {
  const steel = material('iv-steel', {
    color: 0xb7cbc6,
    roughness: 0.30,
    metalness: 0.76
  });
  const fluid = basicMaterial('iv-fluid', {
    color: 0x8dfff0,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });

  addVisualCylinder(root, `${key}_pole`, x, 1.18, z, 0.035, 0.055, 2.20, steel, { segments: 7 });
  addVisualBox(root, `${key}_arm`, x, 2.18, z, 0.65, 0.05, 0.05, steel);
  addVisualBox(root, `${key}_bag`, x + 0.24, 1.82, z, 0.32, 0.62, 0.08, fluid);
  [-0.32, 0.32].forEach((offset, index) => {
    addVisualBox(root, `${key}_base_${index}`, x + offset, 0.08, z, 0.62, 0.05, 0.06, steel, { rotationY: index ? Math.PI / 2 : 0 });
  });
}

function addQuarantineFrame(root) {
  const steel = material('quarantine-steel', {
    color: 0x222a29,
    roughness: 0.46,
    metalness: 0.68
  });
  const red = material('quarantine-red', {
    color: 0xff3030,
    emissive: 0xff1010,
    emissiveIntensity: 3.2,
    roughness: 0.18
  });
  const amber = material('quarantine-amber', {
    color: 0xffaa22,
    emissive: 0x9b3b00,
    emissiveIntensity: 1.7,
    roughness: 0.34
  });

  [-1.05, 1.05].forEach((x, index) => {
    addVisualBox(root, `quarantine_post_${index}`, x, 2.12, 0, 0.28, 4.24, 13.4, steel);
    addVisualBox(root, `quarantine_red_${index}`, x + (index ? 0.17 : -0.17), 2.0, 0, 0.06, 3.55, 12.2, red);
  });
  addVisualBox(root, 'quarantine_header', 0, 3.78, 0, 2.25, 0.42, 13.6, steel);
  addVisualBox(root, 'quarantine_header_glow', -0.17, 3.72, 0, 0.08, 0.22, 10.8, amber);
  addLightPool(root, 'quarantine_red_pool', 0, 0, 5.2, 15.5, 0xff2020, 0.10, Math.PI / 2);
}

function addCeilingPipe(root, key, x, z, length, rotationY, color) {
  const pipe = material(`ceiling-pipe:${color}`, {
    color,
    roughness: 0.48,
    metalness: 0.72
  });
  addVisualCylinder(root, key, x, 3.72, z, 0.08, 0.08, length, pipe, {
    segments: 8,
    rotationZ: Math.PI / 2,
    rotationY
  });
}

function addHospitalDressing(context) {
  const medium = createArtRoot(context, 'hospital_wing_art_medium', 'medium');
  const high = createArtRoot(context, 'hospital_wing_art_high', 'high');

  const teal = 0x9effee;
  const red = 0xff3535;
  const warm = 0xffb066;

  // Corridor floor identity.
  const stripeTeal = basicMaterial('stripe-teal', {
    color: teal,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });
  const stripeRed = basicMaterial('stripe-red', {
    color: red,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  const white = basicMaterial('stripe-white', {
    color: 0xe9fff9,
    transparent: true,
    opacity: 0.24,
    depthWrite: false
  });

  addGroundPlane(medium, 'triage_lane_west', -23, 0, 33, 0.22, stripeTeal);
  addGroundPlane(medium, 'triage_lane_east', 23, 0, 33, 0.22, stripeTeal);
  addGroundPlane(medium, 'quarantine_lane_north', 0, 18, 0.22, 20, stripeRed);
  addGroundPlane(medium, 'quarantine_lane_south', 0, -18, 0.22, 20, stripeRed);

  [-36, -18, 18, 36].forEach((x, index) => {
    addGroundPlane(medium, `ward_mark_n_${index}`, x, 6, 5.2, 0.16, white);
    addGroundPlane(medium, `ward_mark_s_${index}`, x, -6, 5.2, 0.16, white);
  });

  // Room wall panels and identity signs.
  [
    [-43.72, 0, Math.PI / 2, 'WARD A', '#0d2b28', '#cffff4'],
    [43.72, 0, -Math.PI / 2, 'WARD B', '#0d2b28', '#cffff4'],
    [-18, 33.0, Math.PI, 'EMERGENCY', '#351111', '#fff1e8'],
    [18, -33.0, 0, 'SURGERY', '#14332f', '#d5fff7'],
    [-1.10, -7.83, Math.PI, 'QUARANTINE', '#3d1010', '#ffe1d7'],
    [1.10, 7.83, 0, 'BIOHAZARD', '#3d1010', '#ffe1d7']
  ].forEach(([x, z, rotationY, text, bg, fg], index) => {
    addWallSign(medium, `hospital_sign_${index}`, text, x, 2.38, z, rotationY, bg, fg);
  });

  [
    [-38, 8.56, 0, 10],
    [-14, 8.56, 0, 8],
    [14, 8.56, 0, 8],
    [38, 8.56, 0, 10],
    [-38, -8.56, Math.PI, 10],
    [-14, -8.56, Math.PI, 8],
    [14, -8.56, Math.PI, 8],
    [38, -8.56, Math.PI, 10]
  ].forEach(([x, z, rotationY, width], index) => {
    addWallPanel(medium, `hospital_panel_${index}`, x, z, rotationY, width);
  });

  // Clinical and emergency lighting.
  [
    [-34, 0, Math.PI / 2, teal, 7.5],
    [-18, 0, Math.PI / 2, teal, 6.5],
    [18, 0, Math.PI / 2, teal, 6.5],
    [34, 0, Math.PI / 2, teal, 7.5],
    [-28, 22, 0, 0xaaffee, 5.5],
    [28, -22, 0, 0xaaffee, 5.5],
    [0, 22, 0, 0xff7a7a, 4.8],
    [0, -22, 0, 0xff7a7a, 4.8]
  ].forEach(([x, z, rotationY, color, intensity], index) => {
    addCeilingFixture(medium, `hospital_light_${index}`, x, z, rotationY, color, intensity);
  });

  [
    [-3.2, 6.9],
    [3.2, -6.9],
    [-44.0, 26],
    [44.0, -26]
  ].forEach(([x, z], index) => addEmergencyBeacon(medium, `hospital_beacon_${index}`, x, z));

  addQuarantineFrame(medium);

  // Existing collision props receive visual shells.
  [
    [-38, 20, 0],
    [-20, -22, 0],
    [-12, 26, Math.PI / 2],
    [20, 22, 0],
    [38, -20, 0],
    [12, -26, Math.PI / 2]
  ].forEach(([x, z, rotationY], index) => {
    addTreatmentBedVisual(medium, `hospital_bed_${index}`, x, z, rotationY);
  });

  [
    [-12, 14, Math.PI / 2],
    [12, -14, Math.PI / 2],
    [-38, -12, 0],
    [38, 12, 0]
  ].forEach(([x, z, rotationY], index) => {
    addSupplyCartVisual(medium, `hospital_cart_${index}`, x, z, rotationY);
  });

  [
    [-22, 12, 0],
    [-22, -12, 0],
    [22, 12, 0],
    [22, -12, 0]
  ].forEach(([x, z, rotationY], index) => {
    addCurtainTrack(medium, `hospital_curtain_${index}`, x, z, rotationY);
  });

  [
    [-36.5, 18.5],
    [-18.0, -20.5],
    [-10.5, 23.5],
    [18.5, 20.5],
    [36.5, -18.5],
    [10.5, -23.5]
  ].forEach(([x, z], index) => addIVStand(medium, `hospital_iv_${index}`, x, z));

  // Blood, cleaning fluid, and wet-floor reflection cues.
  const blood = basicMaterial('blood', {
    color: 0x5a0508,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  const wet = basicMaterial('wet', {
    color: 0x8dfff3,
    transparent: true,
    opacity: 0.10,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  [
    [-30, -15, 5.2, 2.4, 0.18],
    [-8, 4, 3.5, 1.8, -0.28],
    [10, -5, 3.9, 1.9, 0.22],
    [32, 16, 5.0, 2.4, -0.14],
    [18, 28, 3.4, 1.6, 0.34]
  ].forEach(([x, z, w, d, rotationY], index) => {
    addGroundPlane(medium, `hospital_blood_${index}`, x, z, w, d, blood, rotationY, 0.044);
  });

  [
    [-34, 2.6, 8.5, 2.5, -0.08],
    [-16, -2.8, 7.0, 2.2, 0.12],
    [16, 2.9, 7.2, 2.3, -0.15],
    [34, -2.6, 8.0, 2.4, 0.08],
    [-28, 21, 5.6, 2.2, 0.18],
    [28, -21, 5.6, 2.2, -0.18]
  ].forEach(([x, z, w, d, rotationY], index) => {
    addGroundPlane(high, `hospital_wet_${index}`, x, z, w, d, wet, rotationY, 0.046);
  });

  // High-only ceiling infrastructure and ventilation.
  [
    [-34, -5.5, 16, 0, 0x6d8580],
    [-16, 5.5, 14, 0, 0x4e6862],
    [16, -5.5, 14, 0, 0x6d8580],
    [34, 5.5, 16, 0, 0x4e6862],
    [-28, 22, 10, Math.PI / 2, 0x6d8580],
    [28, -22, 10, Math.PI / 2, 0x6d8580]
  ].forEach(([x, z, length, rotationY, color], index) => {
    addCeilingPipe(high, `hospital_pipe_${index}`, x, z, length, rotationY, color);
  });

  const duct = material('hospital-duct', {
    color: 0x28322f,
    roughness: 0.52,
    metalness: 0.64
  });
  [
    [-28, 3.46, 26, 12, 0.36, 1.0],
    [28, 3.46, -26, 12, 0.36, 1.0],
    [-2.8, 3.46, 22, 1.0, 0.36, 8],
    [2.8, 3.46, -22, 1.0, 0.36, 8]
  ].forEach(([x, y, z, w, h, d], index) => {
    addVisualBox(high, `hospital_duct_${index}`, x, y, z, w, h, d, duct);
  });

  // Sparse low fog sheets deepen the corridor without obscuring gameplay.
  const fogMat = basicMaterial('hospital-ground-fog', {
    color: 0x78b8ae,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  [
    [-24, 0, 25, 5],
    [24, 0, 25, 5],
    [0, 21, 14, 4],
    [0, -21, 14, 4]
  ].forEach(([x, z, w, d], index) => {
    addGroundPlane(high, `hospital_fog_${index}`, x, z, w, d, fogMat, 0, 0.070);
  });

  // Warm backup lamps offer contrast at the wing ends.
  addCeilingFixture(high, 'hospital_backup_west', -42, 28, 0, warm, 4.2, {
    emissiveIntensity: 1.8,
    poolOpacity: 0.07,
    distance: 10
  });
  addCeilingFixture(high, 'hospital_backup_east', 42, -28, 0, warm, 4.2, {
    emissiveIntensity: 1.8,
    poolOpacity: 0.07,
    distance: 10
  });
}

function addTreatmentBedCollision(context, x, z, rotationY = 0, color = 0x6c8480) {
  const sideways = Math.abs(Math.sin(rotationY)) > 0.5;
  return context.spawnBlock(
    sideways ? 1.6 : 3.4,
    0.72,
    sideways ? 3.4 : 1.6,
    x,
    0.36,
    z,
    color,
    true,
    false
  );
}

function addCurtainCollision(context, x, z, rotationY = 0) {
  const curtain = context.spawnBlock(
    Math.abs(Math.sin(rotationY)) > 0.5 ? 0.22 : 4.2,
    2.2,
    Math.abs(Math.sin(rotationY)) > 0.5 ? 4.2 : 0.22,
    x,
    1.15,
    z,
    0x1e5c55,
    true,
    false
  );
  curtain.mesh.material.transparent = true;
  curtain.mesh.material.opacity = 0.62;
  return curtain;
}

function addSupplyCartCollision(context, x, z, rotationY = 0) {
  const sideways = Math.abs(Math.sin(rotationY)) > 0.5;
  return context.spawnBlock(
    sideways ? 1.2 : 2.6,
    1.0,
    sideways ? 2.6 : 1.2,
    x,
    0.5,
    z,
    0x46524f,
    true,
    false
  );
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

  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x101918,
    map: createHospitalFloorTexture(),
    roughness: 0.61,
    metalness: 0.04,
    clearcoat: 0.62,
    clearcoatRoughness: 0.30
  });

  const floorMesh = createMapFloor(
    { scene, mapMeshes },
    {
      width: HOSPITAL_WIDTH,
      depth: HOSPITAL_DEPTH,
      material: floorMaterial,
      supportTag: 'hospital_wing_floor'
    }
  );
  floorMesh.name = 'hospital_wing_floor';
  floorMesh.receiveShadow = true;
  floorMesh.userData.artPatch = ART_PATCH;

  const wallColor = 0x263330;
  const wardWall = 0x31443f;
  const deskColor = 0x4c5854;
  const cabinetColor = 0x364843;

  // Certified perimeter walls.
  spawnBlock(92, 4.4, 2, 0, 2.2, -34, wallColor, true, false);
  spawnBlock(92, 4.4, 2, 0, 2.2, 34, wallColor, true, false);
  spawnBlock(2, 4.4, 66, -47, 2.2, 0, wallColor, true, false);
  spawnBlock(2, 4.4, 66, 47, 2.2, 0, wallColor, true, false);

  // Certified broken corridor shell.
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

  // Certified cross-ward room separators.
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

  // Certified quarantine security door.
  const quarantineDoor = spawnBlock(1.25, 3.35, 13.0, 0, 1.68, 0, 0xff3333, true, true);
  quarantineDoor.mesh.name = 'hospital_wing_quarantine_door';
  quarantineDoor.pos.set(0, 0, 0);
  doors.push(quarantineDoor);

  // Certified reception and nurse-station cover.
  spawnBlock(7.0, 1.05, 2.0, -34, 0.52, 0, deskColor, true, false);
  spawnBlock(7.0, 1.05, 2.0, 34, 0.52, 0, deskColor, true, false);
  spawnBlock(3.0, 1.1, 2.8, -9, 0.55, 24, 0x52645e, true, false);
  spawnBlock(3.0, 1.1, 2.8, 9, 0.55, -24, 0x52645e, true, false);

  [
    [-12, 14, Math.PI / 2],
    [12, -14, Math.PI / 2],
    [-38, -12, 0],
    [38, 12, 0]
  ].forEach(([x, z, rotationY]) => addSupplyCartCollision(context, x, z, rotationY));

  // Certified cabinets.
  spawnBlock(3.4, 1.6, 0.55, -40, 0.8, 28, cabinetColor, true, false);
  spawnBlock(3.4, 1.6, 0.55, 40, 0.8, -28, cabinetColor, true, false);
  spawnBlock(0.55, 1.6, 3.4, -4, 0.8, 24, cabinetColor, true, false);
  spawnBlock(0.55, 1.6, 3.4, 4, 0.8, -24, cabinetColor, true, false);

  // Certified treatment-bed cover.
  [
    [-38, 20, 0],
    [-20, -22, 0],
    [-12, 26, Math.PI / 2],
    [20, 22, 0],
    [38, -20, 0],
    [12, -26, Math.PI / 2]
  ].forEach(([x, z, rotationY]) => addTreatmentBedCollision(context, x, z, rotationY));

  // Certified ward curtains.
  [
    [-22, 12, 0],
    [-22, -12, 0],
    [22, 12, 0],
    [22, -12, 0]
  ].forEach(([x, z, rotationY]) => addCurtainCollision(context, x, z, rotationY));

  addHospitalDressing(context);

  // Certified traps.
  spawnTrap(-25, 0, 8, false);
  spawnTrap(25, 0, 8, false);
  spawnTrap(0, 18, 8, false);

  // Certified barricades.
  spawnBarricade(-42.5, 18, Math.PI / 2);
  spawnBarricade(-42.5, -18, Math.PI / 2);
  spawnBarricade(42.5, 18, -Math.PI / 2);
  spawnBarricade(42.5, -18, -Math.PI / 2);

  // Certified player starts.
  addPoint(playerSpawnPoints, -40, 0);
  addPoint(playerSpawnPoints, -30, -4);
  addPoint(playerSpawnPoints, -30, 4);
  addPoint(playerSpawnPoints, -18, 0);

  // Certified open spawns.
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

  // Certified locked east-wing spawns.
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

  return {
    floorMesh,
    width: HOSPITAL_WIDTH,
    depth: HOSPITAL_DEPTH,
    navigationCellSize: 2.5
  };
}
