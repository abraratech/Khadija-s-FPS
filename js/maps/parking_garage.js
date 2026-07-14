// js/maps/parking_garage.js
// ART.4 — Parking Garage cinematic visual-art overhaul.
// Gameplay collision, security gate, traps, barricades, and spawn coordinates
// remain aligned with the certified Parking Garage layout.

import * as THREE from 'three';
import { createMapFloor } from './map_helpers.js';

const GARAGE_WIDTH = 84;
const GARAGE_DEPTH = 72;
const ART_PATCH = 'art4-parking-garage-r1';

const MATERIALS = new Map();
const GEOMETRIES = new Map();
let garageFloorTexture = null;

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

function createGarageFloorTexture() {
  if (garageFloorTexture) return garageFloorTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#15191e';
  ctx.fillRect(0, 0, 256, 256);

  // Concrete expansion joints.
  ctx.strokeStyle = 'rgba(70, 78, 86, 0.24)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 256; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  let seed = 0x5041524b;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  // Aggregate and grime.
  for (let i = 0; i < 1450; i++) {
    const shade = 18 + Math.floor(random() * 30);
    ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 4},${0.10 + random() * 0.25})`;
    const size = random() > 0.94 ? 3 : 1;
    ctx.fillRect(random() * 256, random() * 256, size, size);
  }

  // Hairline cracks.
  ctx.strokeStyle = 'rgba(3, 5, 7, 0.46)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const x = random() * 256;
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12 + random() * 42, y - 9 + random() * 18);
    ctx.stroke();
  }

  garageFloorTexture = new THREE.CanvasTexture(canvas);
  garageFloorTexture.wrapS = THREE.RepeatWrapping;
  garageFloorTexture.wrapT = THREE.RepeatWrapping;
  garageFloorTexture.repeat.set(11, 9);
  garageFloorTexture.colorSpace = THREE.SRGBColorSpace;
  return garageFloorTexture;
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

function addGroundPlane(root, name, x, z, w, d, meshMaterial, rotationY = 0) {
  const mesh = new THREE.Mesh(planeGeometry(w, d), meshMaterial);
  mesh.position.set(x, 0.035, z);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotationY;
  return addArtObject(root, mesh, name);
}

function addGroundShadow(root, name, x, z, w, d, rotationY = 0, opacity = 0.28) {
  const shadow = basicMaterial(`shadow:${opacity}`, {
    color: 0x010203,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  addGroundPlane(root, name, x, z, w, d, shadow, rotationY);
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
  ctx.shadowColor = fg;
  ctx.shadowBlur = 12;
  ctx.font = '900 54px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addWallSign(root, name, text, x, y, z, rotationY, bg, fg) {
  const housing = material('sign-housing', {
    color: 0x111419,
    roughness: 0.55,
    metalness: 0.58
  });
  const signMaterial = new THREE.MeshBasicMaterial({
    map: makeTextTexture(text, bg, fg),
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  addVisualBox(root, `${name}_housing`, x, y, z, 5.75, 1.95, 0.16, housing, { rotationY });
  const sign = new THREE.Mesh(planeGeometry(5.4, 1.65), signMaterial);
  sign.position.set(
    x - Math.sin(rotationY) * 0.09,
    y,
    z - Math.cos(rotationY) * 0.09
  );
  sign.rotation.y = rotationY;
  addArtObject(root, sign, `${name}_face`);
}

function addParkingLine(root, name, x, z, w, d, rotationY = 0, color = 0xffd36a, opacity = 0.65) {
  const lineMaterial = basicMaterial(`line:${color}:${opacity}`, {
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  addGroundPlane(root, name, x, z, w, d, lineMaterial, rotationY);
}

function addArrow(root, name, x, z, rotationY = 0) {
  const arrowMaterial = basicMaterial('arrow', {
    color: 0xffffff,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  addGroundPlane(root, `${name}_shaft`, x, z, 0.38, 4.2, arrowMaterial, rotationY);

  const head = new THREE.Mesh(new THREE.CircleGeometry(0.9, 3), arrowMaterial);
  head.rotation.x = -Math.PI / 2;
  head.rotation.z = rotationY;
  head.position.set(
    x + Math.sin(rotationY) * 2.45,
    0.04,
    z + Math.cos(rotationY) * 2.45
  );
  addArtObject(root, head, `${name}_head`);
}

function addPillarDetails(root, name, x, z, accentColor) {
  const concrete = material('pillar-cap', {
    color: 0x626870,
    roughness: 0.90,
    metalness: 0.03
  });
  const dark = material('pillar-dark', {
    color: 0x15181c,
    roughness: 0.82,
    metalness: 0.12
  });
  const hazard = material(`pillar-hazard:${accentColor}`, {
    color: accentColor,
    emissive: new THREE.Color(accentColor).multiplyScalar(0.22),
    emissiveIntensity: 0.35,
    roughness: 0.68,
    metalness: 0.10
  });

  addGroundShadow(root, `${name}_shadow`, x, z, 3.1, 3.1, 0, 0.26);
  addVisualBox(root, `${name}_cap`, x, 3.75, z, 2.05, 0.18, 2.05, concrete);
  addVisualBox(root, `${name}_base`, x, 0.14, z, 2.12, 0.28, 2.12, dark);

  for (let i = 0; i < 4; i++) {
    const y = 0.46 + i * 0.34;
    addVisualBox(
      root,
      `${name}_hazard_${i}`,
      x,
      y,
      z - 0.94,
      1.64,
      0.22,
      0.055,
      i % 2 === 0 ? hazard : dark,
      { rotationZ: -0.48 }
    );
  }

  addParkingLine(root, `${name}_mark_n`, x, z - 1.55, 3.4, 0.12, 0, accentColor, 0.72);
  addParkingLine(root, `${name}_mark_s`, x, z + 1.55, 3.4, 0.12, 0, accentColor, 0.72);
  addParkingLine(root, `${name}_mark_w`, x - 1.55, z, 0.12, 3.4, 0, accentColor, 0.72);
  addParkingLine(root, `${name}_mark_e`, x + 1.55, z, 0.12, 3.4, 0, accentColor, 0.72);
}

function addLightSpill(root, name, x, z, rotationY, color, opacity = 0.15) {
  const spill = basicMaterial(`spill:${color}:${opacity}`, {
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  addGroundPlane(root, name, x, z, 8.2, 2.8, spill, rotationY);
}

function addOverheadLight(root, name, x, z, rotationY, color, includePointLight = true) {
  const fixture = material('fixture', {
    color: 0x25292e,
    metalness: 0.56,
    roughness: 0.46
  });
  const glow = material(`fixture-glow:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 3.1,
    roughness: 0.18,
    metalness: 0.04
  });

  addVisualBox(root, `${name}_housing`, x, 4.08, z, 5.7, 0.18, 0.38, fixture, { rotationY });
  addVisualBox(root, `${name}_tube`, x, 3.94, z, 5.05, 0.05, 0.13, glow, { rotationY });
  addLightSpill(root, `${name}_spill`, x, z, rotationY, color, 0.13);

  if (includePointLight) {
    const light = new THREE.PointLight(color, 8.5, 15, 2.0);
    light.position.set(x, 3.55, z);
    light.castShadow = false;
    addArtObject(root, light, `${name}_point_light`);
  }
}

function addCarDetails(root, key, x, z, rotationY, color) {
  const sideways = Math.abs(Math.sin(rotationY)) > 0.5;
  const bodyW = sideways ? 2.05 : 4.2;
  const bodyD = sideways ? 4.2 : 2.05;
  const longW = sideways ? 1.55 : 2.0;
  const longD = sideways ? 2.0 : 1.55;

  const body = material(`${key}-body`, {
    color,
    roughness: 0.45,
    metalness: 0.42
  });
  const trim = material(`${key}-trim`, {
    color: new THREE.Color(color).multiplyScalar(0.48),
    roughness: 0.40,
    metalness: 0.68
  });
  const glass = material('car-glass', {
    color: 0x07131c,
    emissive: 0x08202e,
    emissiveIntensity: 0.30,
    roughness: 0.12,
    metalness: 0.22
  });
  const tire = material('car-tire', {
    color: 0x08090a,
    roughness: 0.78,
    metalness: 0.12
  });
  const headlight = material('car-headlight', {
    color: 0xfff0c2,
    emissive: 0xffd58a,
    emissiveIntensity: 2.1,
    roughness: 0.14
  });
  const taillight = material('car-taillight', {
    color: 0xff3b22,
    emissive: 0xff1608,
    emissiveIntensity: 2.0,
    roughness: 0.16
  });

  addGroundShadow(root, `${key}_shadow`, x, z, bodyW + 1.0, bodyD + 0.9, rotationY, 0.34);
  addVisualBox(root, `${key}_roof`, x, 1.28, z, longW, 0.55, longD, body, { rotationY });
  addVisualBox(root, `${key}_glass`, x, 1.48, z, sideways ? 1.45 : 1.52, 0.24, sideways ? 1.52 : 1.45, glass, { rotationY });

  // Bumpers follow the long axis.
  if (!sideways) {
    addVisualBox(root, `${key}_bumper_front`, x + 2.05, 0.48, z, 0.13, 0.28, 1.78, trim);
    addVisualBox(root, `${key}_bumper_rear`, x - 2.05, 0.48, z, 0.13, 0.28, 1.78, trim);
    [-0.48, 0.48].forEach((offset, index) => {
      addVisualBox(root, `${key}_head_${index}`, x + 2.13, 0.72, z + offset, 0.05, 0.20, 0.34, headlight);
      addVisualBox(root, `${key}_tail_${index}`, x - 2.13, 0.72, z + offset, 0.05, 0.20, 0.34, taillight);
    });
  } else {
    addVisualBox(root, `${key}_bumper_front`, x, 0.48, z - 2.05, 1.78, 0.28, 0.13, trim);
    addVisualBox(root, `${key}_bumper_rear`, x, 0.48, z + 2.05, 1.78, 0.28, 0.13, trim);
    [-0.48, 0.48].forEach((offset, index) => {
      addVisualBox(root, `${key}_head_${index}`, x + offset, 0.72, z - 2.13, 0.34, 0.20, 0.05, headlight);
      addVisualBox(root, `${key}_tail_${index}`, x + offset, 0.72, z + 2.13, 0.34, 0.20, 0.05, taillight);
    });
  }

  const wheelPositions = !sideways
    ? [[-1.35, -0.96], [-1.35, 0.96], [1.35, -0.96], [1.35, 0.96]]
    : [[-0.96, -1.35], [0.96, -1.35], [-0.96, 1.35], [0.96, 1.35]];

  wheelPositions.forEach(([ox, oz], index) => {
    addVisualCylinder(
      root,
      `${key}_wheel_${index}`,
      x + ox,
      0.38,
      z + oz,
      0.34,
      0.34,
      0.22,
      tire,
      { segments: 10, rotationX: Math.PI / 2 }
    );
  });
}

function addGateLandmark(root) {
  const steel = material('gate-steel', {
    color: 0x24292e,
    roughness: 0.52,
    metalness: 0.72
  });
  const hazard = material('gate-hazard', {
    color: 0xff9f1a,
    emissive: 0x8a2d00,
    emissiveIntensity: 0.55,
    roughness: 0.60,
    metalness: 0.18
  });
  const red = material('gate-red', {
    color: 0xff2f22,
    emissive: 0xff1108,
    emissiveIntensity: 2.7,
    roughness: 0.18
  });

  [-2.4, 2.4].forEach((x, index) => {
    addGroundShadow(root, `garage_gate_post_shadow_${index}`, x, 0, 1.1, 2.1, 0, 0.30);
    addVisualBox(root, `garage_gate_post_${index}`, x, 2.25, 0, 0.45, 4.5, 0.55, steel);
    for (let stripe = 0; stripe < 5; stripe++) {
      addVisualBox(
        root,
        `garage_gate_post_${index}_hazard_${stripe}`,
        x,
        0.55 + stripe * 0.54,
        -0.31,
        0.36,
        0.24,
        0.05,
        stripe % 2 === 0 ? hazard : steel,
        { rotationZ: index === 0 ? -0.45 : 0.45 }
      );
    }
  });

  addVisualBox(root, 'garage_gate_header', 0, 4.15, 0, 5.35, 0.42, 0.65, steel);
  addVisualBox(root, 'garage_gate_beacon', 0, 4.45, 0, 1.35, 0.18, 0.18, red);

  const light = new THREE.PointLight(0xff2d22, 9.0, 15, 2.1);
  light.position.set(0, 3.8, 0);
  light.castShadow = false;
  addArtObject(root, light, 'garage_gate_red_light');
}

function addDuctRun(root, name, x, z, length, rotationY) {
  const duct = material('duct', {
    color: 0x353b40,
    roughness: 0.54,
    metalness: 0.70
  });
  const band = material('duct-band', {
    color: 0x181b1e,
    roughness: 0.48,
    metalness: 0.74
  });

  addVisualBox(root, `${name}_body`, x, 4.18, z, length, 0.48, 0.72, duct, { rotationY });
  const bandCount = Math.max(3, Math.floor(length / 5));
  for (let i = 0; i < bandCount; i++) {
    const t = bandCount === 1 ? 0.5 : i / (bandCount - 1);
    const local = -length / 2 + 0.7 + t * (length - 1.4);
    const bx = x + local * Math.cos(rotationY);
    const bz = z - local * Math.sin(rotationY);
    addVisualBox(root, `${name}_band_${i}`, bx, 4.18, bz, 0.14, 0.58, 0.82, band, { rotationY });
  }
}

function addSecurityCamera(root, name, x, z, rotationY) {
  const body = material('camera-body', {
    color: 0x20252a,
    roughness: 0.48,
    metalness: 0.66
  });
  const lens = material('camera-lens', {
    color: 0x43d9ff,
    emissive: 0x00a6ff,
    emissiveIntensity: 2.0,
    roughness: 0.12
  });

  addVisualBox(root, `${name}_arm`, x, 3.18, z, 0.12, 0.12, 0.85, body, { rotationY });
  addVisualBox(root, `${name}_body`, x, 3.02, z, 0.42, 0.32, 0.72, body, { rotationY, rotationX: -0.22 });
  addVisualBox(
    root,
    `${name}_lens`,
    x - Math.sin(rotationY) * 0.39,
    2.94,
    z - Math.cos(rotationY) * 0.39,
    0.20,
    0.16,
    0.05,
    lens,
    { rotationY, rotationX: -0.22 }
  );
}

function addPuddle(root, name, x, z, w, d, rotationY, color) {
  const puddle = basicMaterial(`puddle:${color}`, {
    color,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  addGroundPlane(root, name, x, z, w, d, puddle, rotationY);
}

function addOilStain(root, name, x, z, w, d, rotationY) {
  const oil = basicMaterial('oil-stain', {
    color: 0x030405,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  addGroundPlane(root, name, x, z, w, d, oil, rotationY);
}

function addGarageDressing(context, cars) {
  const medium = createArtRoot(context, 'parking_garage_art_medium', 'medium');
  const high = createArtRoot(context, 'parking_garage_art_high', 'high');

  const warm = 0xffc56a;
  const cool = 0x67d6ff;
  const red = 0xff4b32;

  // Pillar identification and lane readability.
  [-28, -14, 14, 28].forEach((x, xIndex) => {
    [-24, -8, 8, 24].forEach((z, zIndex) => {
      const accent = (xIndex + zIndex) % 2 === 0 ? 0xffc53a : 0xe9edf2;
      addPillarDetails(medium, `garage_pillar_${xIndex}_${zIndex}`, x, z, accent);
    });
  });

  // Detailed shells over the unchanged collision cars.
  cars.forEach((car, index) => {
    addCarDetails(medium, `garage_car_${index}`, car.x, car.z, car.rotationY, car.color);
  });

  // Parking bay lines and central lane markings.
  [-36, -28, -20, -12, 12, 20, 28, 36].forEach((x, index) => {
    addParkingLine(medium, `garage_bay_n_${index}`, x, 30, 0.16, 9.5, 0, 0xffd36a, 0.70);
    addParkingLine(medium, `garage_bay_s_${index}`, x, -30, 0.16, 9.5, 0, 0xffd36a, 0.70);
  });

  [-27, -9, 9, 27].forEach((x, index) => {
    addParkingLine(medium, `garage_lane_${index}`, x, 0, 10.0, 0.15, 0, 0xffffff, 0.48);
  });

  [-18, 18].forEach((x, index) => {
    addParkingLine(medium, `garage_cross_n_${index}`, x, 16, 11.5, 0.12, 0, 0xffcc33, 0.55);
    addParkingLine(medium, `garage_cross_s_${index}`, x, -16, 11.5, 0.12, 0, 0xffcc33, 0.55);
  });

  addArrow(medium, 'garage_arrow_w', -18, -4, Math.PI / 2);
  addArrow(medium, 'garage_arrow_e', 18, 4, -Math.PI / 2);
  addArrow(medium, 'garage_arrow_n', 0, -28, 0);
  addArrow(medium, 'garage_arrow_s', 0, 28, Math.PI);

  // Central security gate hero landmark.
  addGateLandmark(medium);

  // Directional landmarks.
  addWallSign(medium, 'garage_sign_b1', 'LEVEL B1', -42.03, 2.35, 0, Math.PI / 2, '#172333', '#ffcc55');
  addWallSign(medium, 'garage_sign_exit', 'EXIT →', 0, 2.35, -36.02, 0, '#12351f', '#74ff9b');
  addWallSign(medium, 'garage_sign_gate', 'SECURITY GATE', 0, 2.35, 36.02, Math.PI, '#331a10', '#ffcc55');
  addWallSign(medium, 'garage_sign_a', 'SECTION A', -26, 2.35, 36.02, Math.PI, '#10283a', '#9defff');
  addWallSign(medium, 'garage_sign_b', 'SECTION B', 26, 2.35, -36.02, 0, '#2e1234', '#ff9df5');

  // Alternating sodium and cool security fixtures.
  [
    [-28, -25, 0, warm],
    [28, -25, 0, cool],
    [0, 0, Math.PI / 2, red],
    [-28, 25, 0, cool],
    [28, 25, 0, warm],
    [-8, 14, Math.PI / 2, warm],
    [8, -14, Math.PI / 2, cool]
  ].forEach(([x, z, rotationY, color], index) => {
    addOverheadLight(medium, `garage_light_${index}`, x, z, rotationY, color, true);
  });

  // High-detail ceiling language while leaving the top-down preview open.
  addDuctRun(high, 'garage_duct_w', -34, 0, 52, Math.PI / 2);
  addDuctRun(high, 'garage_duct_e', 34, 0, 52, Math.PI / 2);
  addDuctRun(high, 'garage_duct_n', 0, -31, 55, 0);

  const beam = material('ceiling-beam', {
    color: 0x171a1e,
    roughness: 0.58,
    metalness: 0.62
  });
  [-21, 0, 21].forEach((z, index) => {
    addVisualBox(high, `garage_ceiling_beam_${index}`, 0, 4.35, z, 72, 0.22, 0.30, beam);
  });

  addSecurityCamera(high, 'garage_camera_nw', -40.7, -30, Math.PI / 2);
  addSecurityCamera(high, 'garage_camera_ne', 40.7, -30, -Math.PI / 2);
  addSecurityCamera(high, 'garage_camera_sw', -40.7, 30, Math.PI / 2);
  addSecurityCamera(high, 'garage_camera_se', 40.7, 30, -Math.PI / 2);

  // Reflections, puddles, and grime stay visual-only.
  addPuddle(high, 'garage_puddle_a', -20, -10, 9.2, 3.6, 0.20, cool);
  addPuddle(high, 'garage_puddle_b', 22, 13, 8.6, 3.2, -0.28, warm);
  addPuddle(high, 'garage_puddle_c', -4, 28, 7.2, 2.8, 0.08, 0x9adfff);
  addPuddle(high, 'garage_puddle_d', 5, -27, 6.8, 2.6, -0.12, 0xffd28b);

  addOilStain(high, 'garage_oil_a', -31, -20, 4.2, 2.8, 0.14);
  addOilStain(high, 'garage_oil_b', 31, 18, 4.5, 2.6, -0.20);
  addOilStain(high, 'garage_oil_c', -8, 6, 3.8, 2.4, 0.42);

  // Tire marks.
  const tireMark = basicMaterial('tire-mark', {
    color: 0x050607,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  [-0.62, 0.62].forEach((offset, index) => {
    addGroundPlane(high, `garage_tire_mark_n_${index}`, -7 + offset, -18, 0.18, 18, tireMark, -0.10);
    addGroundPlane(high, `garage_tire_mark_s_${index}`, 8 + offset, 18, 0.18, 18, tireMark, 0.12);
  });
}

export function buildParkingGarage(context) {
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

  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0x171c22,
    map: createGarageFloorTexture(),
    roughness: 0.78,
    metalness: 0.05,
    clearcoat: 0.28,
    clearcoatRoughness: 0.48
  });

  const floorMesh = createMapFloor(
    { scene, mapMeshes },
    {
      width: GARAGE_WIDTH,
      depth: GARAGE_DEPTH,
      material: floorMat,
      supportTag: 'parking_garage_floor'
    }
  );

  floorMesh.name = 'parking_garage_floor';
  floorMesh.receiveShadow = true;
  floorMesh.userData.artPatch = ART_PATCH;

  const wallColor = 0x292f36;
  const concreteColor = 0x555f6b;
  const barrierColor = 0x252b31;

  // Certified perimeter collision.
  spawnBlock(84, 4.4, 2, 0, 2.2, -37, wallColor, true, false);
  spawnBlock(84, 4.4, 2, 0, 2.2, 37, wallColor, true, false);
  spawnBlock(2, 4.4, 72, -43, 2.2, 0, wallColor, true, false);
  spawnBlock(2, 4.4, 72, 43, 2.2, 0, wallColor, true, false);

  // Certified divider and security gate collision.
  spawnBlock(1.2, 3.1, 17, 0, 1.55, -22, barrierColor, true, false);
  spawnBlock(1.2, 3.1, 17, 0, 1.55, 22, barrierColor, true, false);

  const gate = spawnBlock(1.3, 3.2, 14, 0, 1.6, 0, 0xff5500, true, true);
  gate.mesh.name = 'parking_garage_security_gate';
  gate.pos.set(0, 0, 0);
  doors.push(gate);

  // Certified pillar collision.
  [-28, -14, 14, 28].forEach((x) => {
    [-24, -8, 8, 24].forEach((z) => {
      spawnBlock(1.8, 3.7, 1.8, x, 1.85, z, concreteColor, true, false);
    });
  });

  // Certified low-cover collision.
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
    spawnBlock(w, 0.85, d, x, 0.42, z, 0x363d45, true, false);
  });

  // Certified parked-car collision.
  const cars = [
    { x: -31, z: -24, rotationY: 0, color: 0x7a2222 },
    { x: -31, z: 12, rotationY: 0, color: 0x314c75 },
    { x: -19, z: 18, rotationY: 0, color: 0x1e5476 },
    { x: -18, z: -30, rotationY: 0, color: 0x64696f },
    { x: 18, z: 30, rotationY: 0, color: 0x4b5f6a },
    { x: 19, z: -18, rotationY: 0, color: 0x6e6e72 },
    { x: 31, z: -12, rotationY: 0, color: 0x6c3e25 },
    { x: 31, z: 24, rotationY: 0, color: 0x225b38 },
    { x: -6, z: 31, rotationY: Math.PI / 2, color: 0x6d5924 },
    { x: 6, z: -31, rotationY: Math.PI / 2, color: 0x532970 }
  ];

  cars.forEach((car) => {
    const sideways = Math.abs(Math.sin(car.rotationY)) > 0.5;
    spawnBlock(
      sideways ? 2.05 : 4.2,
      1.05,
      sideways ? 4.2 : 2.05,
      car.x,
      0.52,
      car.z,
      car.color,
      true,
      false
    );
  });

  // Certified traps and barricades.
  spawnTrap(-34, 6, 8, true);
  spawnTrap(34, -6, 8, true);
  spawnTrap(0, -10, 10, false);

  spawnBarricade(-41, -18, Math.PI / 2);
  spawnBarricade(41, 18, -Math.PI / 2);
  spawnBarricade(-18, 35.5, 0);
  spawnBarricade(18, -35.5, Math.PI);

  // Certified player starts.
  addPoint(playerSpawnPoints, -34, -2);
  addPoint(playerSpawnPoints, 34, 2);
  addPoint(playerSpawnPoints, -10, -9);
  addPoint(playerSpawnPoints, 10, 9);

  // Certified normal zombie spawns.
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

  // Certified locked zombie spawns.
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

  addGarageDressing(context, cars);

  return {
    floorMesh,
    width: GARAGE_WIDTH,
    depth: GARAGE_DEPTH,
    navigationCellSize: 2.5
  };
}
