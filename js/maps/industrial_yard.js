// js/maps/industrial_yard.js
// ART.1 — Industrial Yard cinematic visual-art overhaul.
// Gameplay geometry, interaction positions, spawn points, traps, and barricades
// remain aligned with the certified Industrial Yard layout.

import * as THREE from 'three';
import { createMapFloor } from './map_helpers.js';

const YARD_WIDTH = 84;
const YARD_DEPTH = 84;
const WALL_HEIGHT = 4.5;
const WALL_THICKNESS = 2;

const INDUSTRIAL_ART_PATCH = 'art1-industrial-yard-r1';

const MATERIALS = new Map();
const GEOMETRIES = new Map();
let industrialFloorTexture = null;

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

function geometryBox(w, h, d) {
  const key = `box:${w}:${h}:${d}`;
  if (!GEOMETRIES.has(key)) {
    GEOMETRIES.set(key, new THREE.BoxGeometry(w, h, d));
  }
  return GEOMETRIES.get(key);
}

function geometryCylinder(radiusTop, radiusBottom, height, segments = 10) {
  const key = `cyl:${radiusTop}:${radiusBottom}:${height}:${segments}`;
  if (!GEOMETRIES.has(key)) {
    GEOMETRIES.set(
      key,
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)
    );
  }
  return GEOMETRIES.get(key);
}

function getArtTier() {
  const coarsePointer = typeof matchMedia === 'function'
    && matchMedia('(pointer: coarse)').matches;
  const narrowScreen = Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 720;
  const memory = Number(navigator.deviceMemory || 8);
  const cores = Number(navigator.hardwareConcurrency || 8);

  if ((coarsePointer && narrowScreen) || memory <= 4 || cores <= 4) return 0;
  return 1;
}

function getIndustrialArtRoot(context) {
  if (context.__industrialArtRoot) return context.__industrialArtRoot;

  const root = new THREE.Group();
  root.name = 'industrial_yard_art_root';
  root.userData.isMapDressing = true;
  root.userData.noCollision = true;
  root.userData.playerNonWalkable = true;
  root.userData.playerNonBlockingProjectile = true;
  root.userData.minGraphicsQuality = 'medium';
  root.userData.artPatch = INDUSTRIAL_ART_PATCH;
  context.scene.add(root);

  // Only the non-renderable root is registered for lifecycle cleanup. This
  // keeps decorative child meshes out of flat map-mesh raycasts while still
  // removing the complete art pass whenever the arena changes.
  context.mapMeshes.push(root);
  context.__industrialArtRoot = root;
  return root;
}

function addMapObject(context, object, {
  name = '',
  noCollision = true,
  dressing = true
} = {}) {
  if (name) object.name = name;
  object.userData.isMapDressing = dressing;
  object.userData.noCollision = noCollision;
  object.userData.playerNonWalkable = true;
  object.userData.playerNonBlockingProjectile = true;
  object.userData.artPatch = INDUSTRIAL_ART_PATCH;
  getIndustrialArtRoot(context).add(object);
  return object;
}

function addVisualBox(context, {
  name,
  x,
  y,
  z,
  w,
  h,
  d,
  material: meshMaterial,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
  castShadow = false,
  receiveShadow = false
}) {
  const mesh = new THREE.Mesh(geometryBox(w, h, d), meshMaterial);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotationX, rotationY, rotationZ);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = true;
  return addMapObject(context, mesh, { name });
}

function addVisualCylinder(context, {
  name,
  x,
  y,
  z,
  radiusTop,
  radiusBottom = radiusTop,
  height,
  material: meshMaterial,
  segments = 10,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0
}) {
  const mesh = new THREE.Mesh(
    geometryCylinder(radiusTop, radiusBottom, height, segments),
    meshMaterial
  );
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotationX, rotationY, rotationZ);
  mesh.frustumCulled = true;
  return addMapObject(context, mesh, { name });
}

function createIndustrialFloorTexture() {
  if (industrialFloorTexture) return industrialFloorTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#171b1e';
  ctx.fillRect(0, 0, 256, 256);

  // Deterministic aggregate/grit pattern.
  let seed = 0x4b414931;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < 1500; i++) {
    const shade = 24 + Math.floor(random() * 28);
    ctx.globalAlpha = 0.18 + random() * 0.28;
    ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 4})`;
    const size = random() > 0.92 ? 3 : 1;
    ctx.fillRect(random() * 256, random() * 256, size, size);
  }

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#080a0b';
  ctx.lineWidth = 2;
  for (let i = 0; i < 11; i++) {
    const x = random() * 256;
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10 + random() * 38, y - 8 + random() * 18);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  industrialFloorTexture = new THREE.CanvasTexture(canvas);
  industrialFloorTexture.wrapS = THREE.RepeatWrapping;
  industrialFloorTexture.wrapT = THREE.RepeatWrapping;
  industrialFloorTexture.repeat.set(10, 10);
  industrialFloorTexture.colorSpace = THREE.SRGBColorSpace;
  return industrialFloorTexture;
}

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
  const point = new THREE.Vector3(x, 0, z);
  if (locked) context.lockedSpawnPoints.push(point);
  else context.spawnPoints.push(point);
}

function addPlayerSpawn(context, x, z) {
  context.playerSpawnPoints.push(new THREE.Vector3(x, 0, z));
}

function addGroundShadow(context, name, x, z, w, d, rotationY = 0, opacity = 0.28) {
  const shadowMaterial = basicMaterial(`shadow-${opacity}`, {
    color: 0x020304,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  addVisualBox(context, {
    name,
    x,
    y: 0.025,
    z,
    w,
    h: 0.018,
    d,
    material: shadowMaterial,
    rotationY
  });
}

function addHazardZone(context, name, x, z, length, width, rotationY = 0) {
  const black = material('hazard-black', {
    color: 0x090a0b,
    roughness: 0.92,
    metalness: 0.04
  });
  const amber = material('hazard-amber', {
    color: 0xe59419,
    emissive: 0x6b2d02,
    emissiveIntensity: 0.14,
    roughness: 0.78,
    metalness: 0.08
  });

  addVisualBox(context, {
    name: `${name}_base`,
    x,
    y: 0.052,
    z,
    w: length,
    h: 0.035,
    d: width,
    material: black,
    rotationY
  });

  const stripeCount = Math.max(3, Math.floor(length / 1.25));
  for (let i = 0; i < stripeCount; i++) {
    const local = -length / 2 + 0.65 + i * (length - 1.3) / Math.max(1, stripeCount - 1);
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    addVisualBox(context, {
      name: `${name}_stripe_${i}`,
      x: x + local * cos,
      y: 0.075,
      z: z - local * sin,
      w: 0.48,
      h: 0.022,
      d: width * 0.92,
      material: amber,
      rotationY: rotationY + 0.48
    });
  }
}

function addContainerVisualDetails(context, x, z, w, d, baseKey, baseColor) {
  const longOnX = w >= d;
  const dark = material(`${baseKey}-dark`, {
    color: new THREE.Color(baseColor).multiplyScalar(0.45),
    roughness: 0.78,
    metalness: 0.34
  });
  const edge = material(`${baseKey}-edge`, {
    color: new THREE.Color(baseColor).multiplyScalar(0.68),
    roughness: 0.72,
    metalness: 0.38
  });
  const door = material(`${baseKey}-door`, {
    color: new THREE.Color(baseColor).multiplyScalar(0.58),
    roughness: 0.76,
    metalness: 0.32
  });

  addGroundShadow(context, `${baseKey}_shadow`, x, z, w + 1.2, d + 1.2, 0, 0.34);

  // Corner frame.
  const postH = 3.18;
  const px = w / 2 - 0.11;
  const pz = d / 2 - 0.11;
  [
    [-px, -pz],
    [px, -pz],
    [-px, pz],
    [px, pz]
  ].forEach(([ox, oz], index) => {
    addVisualBox(context, {
      name: `${baseKey}_post_${index}`,
      x: x + ox,
      y: 1.62,
      z: z + oz,
      w: 0.18,
      h: postH,
      d: 0.18,
      material: edge
    });
  });

  // Corrugated ribs.
  const ribCount = Math.max(4, Math.floor((longOnX ? w : d) / 1.6));
  for (let i = 0; i < ribCount; i++) {
    const t = ribCount === 1 ? 0 : i / (ribCount - 1);
    if (longOnX) {
      const ox = -w / 2 + 0.55 + t * (w - 1.1);
      addVisualBox(context, {
        name: `${baseKey}_rib_n_${i}`,
        x: x + ox,
        y: 1.62,
        z: z - d / 2 - 0.025,
        w: 0.10,
        h: 2.78,
        d: 0.10,
        material: dark
      });
      addVisualBox(context, {
        name: `${baseKey}_rib_s_${i}`,
        x: x + ox,
        y: 1.62,
        z: z + d / 2 + 0.025,
        w: 0.10,
        h: 2.78,
        d: 0.10,
        material: dark
      });
    } else {
      const oz = -d / 2 + 0.55 + t * (d - 1.1);
      addVisualBox(context, {
        name: `${baseKey}_rib_w_${i}`,
        x: x - w / 2 - 0.025,
        y: 1.62,
        z: z + oz,
        w: 0.10,
        h: 2.78,
        d: 0.10,
        material: dark
      });
      addVisualBox(context, {
        name: `${baseKey}_rib_e_${i}`,
        x: x + w / 2 + 0.025,
        y: 1.62,
        z: z + oz,
        w: 0.10,
        h: 2.78,
        d: 0.10,
        material: dark
      });
    }
  }

  // End doors and locking bars.
  const endX = longOnX ? x + w / 2 + 0.035 : x;
  const endZ = longOnX ? z : z + d / 2 + 0.035;
  addVisualBox(context, {
    name: `${baseKey}_door`,
    x: endX,
    y: 1.58,
    z: endZ,
    w: longOnX ? 0.08 : w * 0.86,
    h: 2.72,
    d: longOnX ? d * 0.86 : 0.08,
    material: door
  });

  [-0.23, 0.23].forEach((offset, index) => {
    addVisualBox(context, {
      name: `${baseKey}_lock_${index}`,
      x: longOnX ? endX + 0.055 : endX + offset * w,
      y: 1.58,
      z: longOnX ? endZ + offset * d : endZ + 0.055,
      w: longOnX ? 0.08 : 0.07,
      h: 2.38,
      d: longOnX ? 0.07 : 0.08,
      material: edge
    });
  });
}

function addContainer(context, x, z, w = 14, d = 4, color = 0x1f5f7a, key = 'container') {
  addBlock(context, {
    w,
    h: 3.2,
    d,
    x,
    z,
    color,
    isWall: true
  });

  addBlock(context, {
    w: w + 0.25,
    h: 0.18,
    d: d + 0.25,
    x,
    z,
    color: new THREE.Color(color).multiplyScalar(0.62),
    isWall: false
  });

  addContainerVisualDetails(context, x, z, w, d, key, color);
}

function addPallet(context, name, x, z, rotationY = 0) {
  const wood = material('pallet-wood', {
    color: 0x6b4928,
    roughness: 0.94,
    metalness: 0.01
  });
  const darkWood = material('pallet-dark', {
    color: 0x3d2818,
    roughness: 0.96
  });

  addGroundShadow(context, `${name}_shadow`, x, z, 2.8, 2.3, rotationY, 0.24);

  [-0.78, 0, 0.78].forEach((offset, index) => {
    addVisualBox(context, {
      name: `${name}_runner_${index}`,
      x: x + Math.cos(rotationY) * offset,
      y: 0.14,
      z: z - Math.sin(rotationY) * offset,
      w: 0.18,
      h: 0.22,
      d: 2.05,
      material: darkWood,
      rotationY
    });
  });

  for (let i = -3; i <= 3; i++) {
    addVisualBox(context, {
      name: `${name}_slat_${i + 3}`,
      x: x + Math.cos(rotationY + Math.PI / 2) * i * 0.31,
      y: 0.30,
      z: z - Math.sin(rotationY + Math.PI / 2) * i * 0.31,
      w: 2.45,
      h: 0.10,
      d: 0.22,
      material: wood,
      rotationY
    });
  }
}

function addCrateStack(context, x, z, key) {
  const woodA = 0x735130;
  const woodB = 0x5a3a22;

  addBlock(context, {
    w: 3,
    h: 1.4,
    d: 3,
    x,
    z,
    color: woodA,
    isWall: true
  });
  addBlock(context, {
    w: 2.4,
    h: 1.2,
    d: 2.4,
    x: x + 0.45,
    z: z - 0.35,
    color: woodB,
    isWall: true
  });

  addGroundShadow(context, `${key}_shadow`, x + 0.15, z - 0.1, 4.2, 4.0, 0, 0.30);

  const brace = material('crate-brace', {
    color: 0x2f2118,
    roughness: 0.92
  });

  [
    [x - 1.51, 0.72, z, 0.08, 1.18, 2.72],
    [x + 1.51, 0.72, z, 0.08, 1.18, 2.72],
    [x, 0.72, z - 1.51, 2.72, 1.18, 0.08],
    [x, 0.72, z + 1.51, 2.72, 1.18, 0.08]
  ].forEach(([bx, by, bz, bw, bh, bd], index) => {
    addVisualBox(context, {
      name: `${key}_brace_${index}`,
      x: bx,
      y: by,
      z: bz,
      w: bw,
      h: bh,
      d: bd,
      material: brace
    });
  });
}

function addLowCover(context, x, z, w = 6, d = 2, key = 'barrier') {
  addBlock(context, {
    w,
    h: 1.2,
    d,
    x,
    z,
    color: 0x4a4c4d,
    isWall: true
  });

  addGroundShadow(context, `${key}_shadow`, x, z, w + 0.8, d + 0.8, 0, 0.25);

  const concrete = material('barrier-concrete', {
    color: 0x55585a,
    roughness: 0.96,
    metalness: 0.01
  });
  const hazard = material('barrier-hazard', {
    color: 0xd88b14,
    emissive: 0x572400,
    emissiveIntensity: 0.10,
    roughness: 0.78
  });

  addVisualBox(context, {
    name: `${key}_cap`,
    x,
    y: 1.23,
    z,
    w: w + 0.20,
    h: 0.10,
    d: d + 0.20,
    material: concrete
  });

  const stripeCount = Math.max(2, Math.floor(w / 1.8));
  for (let i = 0; i < stripeCount; i++) {
    const xOffset = -w / 2 + 0.75 + i * (w - 1.5) / Math.max(1, stripeCount - 1);
    addVisualBox(context, {
      name: `${key}_hazard_${i}`,
      x: x + xOffset,
      y: 0.72,
      z: z - d / 2 - 0.035,
      w: 0.42,
      h: 0.56,
      d: 0.06,
      material: hazard,
      rotationZ: -0.48
    });
  }
}

function addFloodlightTower(context, name, x, z, facingY, includeLight) {
  const steel = material('tower-steel', {
    color: 0x202428,
    roughness: 0.64,
    metalness: 0.72
  });
  const lampHousing = material('lamp-housing', {
    color: 0x35393c,
    roughness: 0.55,
    metalness: 0.74
  });
  const lamp = material('lamp-emissive', {
    color: 0xffc36b,
    emissive: 0xff8a1f,
    emissiveIntensity: 3.6,
    roughness: 0.24,
    metalness: 0.05
  });

  addGroundShadow(context, `${name}_shadow`, x, z, 3.6, 3.6, 0, 0.30);

  const poolMaterial = basicMaterial('floodlight-pool', {
    color: 0xff7a22,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  addVisualCylinder(context, {
    name: `${name}_light_pool`,
    x,
    y: 0.035,
    z,
    radiusTop: 6.8,
    radiusBottom: 6.8,
    height: 0.022,
    material: poolMaterial,
    segments: 24
  });

  addVisualCylinder(context, {
    name: `${name}_pole`,
    x,
    y: 3.9,
    z,
    radiusTop: 0.13,
    height: 7.6,
    material: steel,
    segments: 8
  });

  addVisualBox(context, {
    name: `${name}_crossbar`,
    x,
    y: 7.45,
    z,
    w: 2.65,
    h: 0.16,
    d: 0.18,
    material: steel,
    rotationY: facingY
  });

  [-0.83, 0.83].forEach((offset, index) => {
    const ox = Math.cos(facingY) * offset;
    const oz = -Math.sin(facingY) * offset;
    addVisualBox(context, {
      name: `${name}_housing_${index}`,
      x: x + ox,
      y: 7.18,
      z: z + oz,
      w: 0.82,
      h: 0.52,
      d: 0.32,
      material: lampHousing,
      rotationX: -0.32,
      rotationY: facingY
    });
    addVisualBox(context, {
      name: `${name}_lamp_${index}`,
      x: x + ox,
      y: 7.10,
      z: z + oz - 0.18,
      w: 0.62,
      h: 0.32,
      d: 0.05,
      material: lamp,
      rotationX: -0.32,
      rotationY: facingY
    });
  });

  if (includeLight) {
    const light = new THREE.PointLight(0xff9b3d, 18, 27, 2.0);
    light.name = `${name}_point_light`;
    light.position.set(x, 6.65, z);
    light.castShadow = false;
    addMapObject(context, light, { name: light.name });
  }
}

function addPipeRack(context, name, x, z, length, rotationY = 0) {
  const steel = material('pipe-rack-steel', {
    color: 0x262a2d,
    roughness: 0.62,
    metalness: 0.74
  });
  const pipeA = material('pipe-rust', {
    color: 0x6f3824,
    roughness: 0.76,
    metalness: 0.50
  });
  const pipeB = material('pipe-dark', {
    color: 0x39464a,
    roughness: 0.62,
    metalness: 0.66
  });

  addGroundShadow(context, `${name}_shadow`, x, z, length + 2, 3.3, rotationY, 0.28);

  const supportCount = Math.max(3, Math.floor(length / 6));
  for (let i = 0; i < supportCount; i++) {
    const t = supportCount === 1 ? 0 : i / (supportCount - 1);
    const local = -length / 2 + t * length;
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const sx = x + local * cos;
    const sz = z - local * sin;

    [-1.05, 1.05].forEach((side, index) => {
      const px = sx + Math.cos(rotationY + Math.PI / 2) * side;
      const pz = sz - Math.sin(rotationY + Math.PI / 2) * side;
      addVisualBox(context, {
        name: `${name}_post_${i}_${index}`,
        x: px,
        y: 1.55,
        z: pz,
        w: 0.16,
        h: 3.1,
        d: 0.16,
        material: steel,
        rotationY
      });
    });

    addVisualBox(context, {
      name: `${name}_beam_${i}`,
      x: sx,
      y: 2.92,
      z: sz,
      w: 2.45,
      h: 0.14,
      d: 0.18,
      material: steel,
      rotationY: rotationY + Math.PI / 2
    });
  }

  [-0.66, 0, 0.66].forEach((side, index) => {
    const px = x + Math.cos(rotationY + Math.PI / 2) * side;
    const pz = z - Math.sin(rotationY + Math.PI / 2) * side;
    addVisualCylinder(context, {
      name: `${name}_pipe_${index}`,
      x: px,
      y: 2.35 + index * 0.23,
      z: pz,
      radiusTop: 0.16 + index * 0.02,
      height: length,
      material: index === 1 ? pipeB : pipeA,
      segments: 10,
      rotationZ: Math.PI / 2,
      rotationY
    });
  });
}

function addLoadingGantry(context, artTier) {
  const steel = material('gantry-steel', {
    color: 0x20262a,
    roughness: 0.60,
    metalness: 0.76
  });
  const beam = material('gantry-amber', {
    color: 0xb66713,
    emissive: 0x4f1d00,
    emissiveIntensity: 0.13,
    roughness: 0.70,
    metalness: 0.52
  });
  const sign = material('gantry-sign', {
    color: 0xe7a42a,
    emissive: 0x8a3f00,
    emissiveIntensity: 0.62,
    roughness: 0.44,
    metalness: 0.20
  });

  addGroundShadow(context, 'yard_gantry_shadow', 0, 44.4, 24, 5.5, 0, 0.34);

  [-8.2, 8.2].forEach((x, index) => {
    addVisualBox(context, {
      name: `yard_gantry_leg_${index}`,
      x,
      y: 3.2,
      z: 44.4,
      w: 0.42,
      h: 6.4,
      d: 0.42,
      material: steel
    });
  });

  addVisualBox(context, {
    name: 'yard_gantry_top',
    x: 0,
    y: 6.15,
    z: 44.4,
    w: 17.0,
    h: 0.48,
    d: 0.58,
    material: beam
  });

  addVisualBox(context, {
    name: 'yard_gantry_sign',
    x: 0,
    y: 5.28,
    z: 44.05,
    w: 5.8,
    h: 0.92,
    d: 0.12,
    material: sign
  });

  // Hook silhouette.
  addVisualCylinder(context, {
    name: 'yard_gantry_cable',
    x: 0,
    y: 4.10,
    z: 44.4,
    radiusTop: 0.035,
    height: 2.45,
    material: steel,
    segments: 6
  });
  addVisualBox(context, {
    name: 'yard_gantry_hook',
    x: 0,
    y: 2.85,
    z: 44.4,
    w: 0.38,
    h: 0.52,
    d: 0.25,
    material: beam,
    rotationZ: 0.35
  });

  if (artTier > 0) {
    for (let i = 0; i < 7; i++) {
      const x = -7.2 + i * 2.4;
      addVisualBox(context, {
        name: `yard_gantry_brace_${i}`,
        x,
        y: 6.55,
        z: 44.4,
        w: 0.12,
        h: 1.25,
        d: 0.12,
        material: steel,
        rotationZ: i % 2 === 0 ? 0.78 : -0.78
      });
    }
  }
}

function addTankLandmark(context, artTier) {
  const tank = material('tank-body', {
    color: 0x4b5457,
    roughness: 0.68,
    metalness: 0.64
  });
  const rust = material('tank-rust', {
    color: 0x71351f,
    roughness: 0.82,
    metalness: 0.42
  });
  const ring = material('tank-ring', {
    color: 0x252a2d,
    roughness: 0.58,
    metalness: 0.74
  });

  const x = -46.5;
  const z = -20.5;

  addGroundShadow(context, 'yard_tank_shadow', x, z, 8.0, 8.0, 0, 0.38);
  addVisualCylinder(context, {
    name: 'yard_tank_body',
    x,
    y: 3.1,
    z,
    radiusTop: 2.6,
    radiusBottom: 2.9,
    height: 6.0,
    material: tank,
    segments: artTier > 0 ? 14 : 10
  });
  addVisualCylinder(context, {
    name: 'yard_tank_cap',
    x,
    y: 6.24,
    z,
    radiusTop: 0.25,
    radiusBottom: 2.6,
    height: 0.65,
    material: rust,
    segments: artTier > 0 ? 14 : 10
  });

  [1.0, 3.0, 5.0].forEach((y, index) => {
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(2.82 - index * 0.06, 0.08, 6, artTier > 0 ? 18 : 12),
      ring
    );
    ringMesh.name = `yard_tank_ring_${index}`;
    ringMesh.position.set(x, y, z);
    ringMesh.rotation.x = Math.PI / 2;
    addMapObject(context, ringMesh, { name: ringMesh.name });
  });
}


function addIndustrialBackdrop(context, artTier) {
  const steel = material('backdrop-steel', {
    color: 0x1a2227,
    roughness: 0.72,
    metalness: 0.46
  });
  const rust = material('backdrop-rust', {
    color: 0x58301f,
    roughness: 0.84,
    metalness: 0.34
  });
  const skyline = material('backdrop-silhouette', {
    color: 0x10171c,
    roughness: 0.92,
    metalness: 0.08
  });

  [-34, -24, -14, 14, 24, 34].forEach((x, index) => {
    addVisualBox(context, {
      name: `yard_north_wall_post_${index}`,
      x,
      y: 2.45,
      z: 40.93,
      w: 0.28,
      h: 4.9,
      d: 0.34,
      material: index % 2 ? rust : steel
    });
    addVisualBox(context, {
      name: `yard_south_wall_post_${index}`,
      x,
      y: 2.45,
      z: -40.93,
      w: 0.28,
      h: 4.9,
      d: 0.34,
      material: index % 2 ? steel : rust
    });
  });

  [-32, -20, -8, 8, 20, 32].forEach((z, index) => {
    addVisualBox(context, {
      name: `yard_west_wall_post_${index}`,
      x: -40.93,
      y: 2.45,
      z,
      w: 0.34,
      h: 4.9,
      d: 0.28,
      material: index % 2 ? rust : steel
    });
    addVisualBox(context, {
      name: `yard_east_wall_post_${index}`,
      x: 40.93,
      y: 2.45,
      z,
      w: 0.34,
      h: 4.9,
      d: 0.28,
      material: index % 2 ? steel : rust
    });
  });

  [
    [-31, 49, 12, 5, 5],
    [-18, 50, 9, 7, 6],
    [-4, 49, 15, 4, 5],
    [13, 50, 10, 8, 6],
    [28, 49, 15, 5, 5]
  ].forEach(([x, z, w, h, d], index) => {
    addVisualBox(context, {
      name: `yard_skyline_block_${index}`,
      x,
      y: h / 2,
      z,
      w,
      h,
      d,
      material: skyline
    });
  });

  const stacks = artTier > 0
    ? [[-30, 52, 12], [-9, 53, 14], [24, 52, 13]]
    : [[-22, 52, 12], [22, 52, 13]];

  stacks.forEach(([x, z, height], index) => {
    addVisualCylinder(context, {
      name: `yard_skyline_stack_${index}`,
      x,
      y: height / 2,
      z,
      radiusTop: 0.45,
      radiusBottom: 0.72,
      height,
      material: index % 2 ? rust : steel,
      segments: 10
    });
  });
}

function addIndustrialDressing(context) {
  const artTier = getArtTier();
  const steel = material('yard-steel', {
    color: 0x24292c,
    roughness: 0.64,
    metalness: 0.70
  });
  const amber = material('yard-amber', {
    color: 0xd88a1a,
    emissive: 0x6f2b00,
    emissiveIntensity: 0.18,
    roughness: 0.72,
    metalness: 0.22
  });
  const rust = material('yard-rust', {
    color: 0x73351f,
    roughness: 0.84,
    metalness: 0.36
  });
  const palletWrap = material('pallet-wrap', {
    color: 0xa5b5b0,
    transparent: true,
    opacity: 0.30,
    roughness: 0.48,
    metalness: 0.02
  });

  // Primary landmarks and silhouettes.
  addIndustrialBackdrop(context, artTier);
  addLoadingGantry(context, artTier);
  addTankLandmark(context, artTier);
  addPipeRack(context, 'yard_pipe_rack_east', 46.0, 12, 18, Math.PI / 2);
  addPipeRack(context, 'yard_pipe_rack_west', -46.0, 7, 13, Math.PI / 2);

  // Floodlights: all towers are visible; lower tier uses fewer real lights.
  addFloodlightTower(context, 'yard_flood_nw', -31, -31, 0, true);
  addFloodlightTower(context, 'yard_flood_se', 31, 31, Math.PI, true);
  addFloodlightTower(context, 'yard_flood_ne', 31, -31, Math.PI / 2, artTier > 0);
  addFloodlightTower(context, 'yard_flood_sw', -31, 31, -Math.PI / 2, artTier > 0);

  // Hazard/readability zones around certified trap and lane positions.
  addHazardZone(context, 'yard_hazard_trap_south', 0, -30, 19, 2.2, 0);
  addHazardZone(context, 'yard_hazard_trap_east', 30, 0, 19, 2.2, Math.PI / 2);
  addHazardZone(context, 'yard_hazard_center_w', -14, 0, 6.5, 1.25, Math.PI / 2);
  addHazardZone(context, 'yard_hazard_center_e', 14, 0, 6.5, 1.25, Math.PI / 2);

  // Pallets and wrapped supply bundles remain visual-only and stay near existing cover.
  [
    ['yard_pallet_a', -25.5, 4.2, 0.18],
    ['yard_pallet_b', 25.0, -4.0, -0.22],
    ['yard_pallet_c', -7.5, 30.5, 0.08],
    ['yard_pallet_d', 9.5, -30.2, -0.10]
  ].forEach(([name, x, z, rotation]) => addPallet(context, name, x, z, rotation));

  [
    [-24.8, 0.92, 4.1],
    [24.5, 0.92, -4.2]
  ].forEach(([x, y, z], index) => {
    addVisualBox(context, {
      name: `yard_wrapped_bundle_${index}`,
      x,
      y,
      z,
      w: 2.15,
      h: 1.52,
      d: 1.85,
      material: palletWrap,
      rotationY: index === 0 ? 0.18 : -0.22
    });
  });

  // Barrier posts and chain-like lane markers.
  [
    [-12, -17],
    [-8, -17],
    [8, 17],
    [12, 17]
  ].forEach(([x, z], index) => {
    addVisualCylinder(context, {
      name: `yard_bollard_${index}`,
      x,
      y: 0.56,
      z,
      radiusTop: 0.16,
      height: 1.1,
      material: index % 2 ? steel : amber,
      segments: 8
    });
  });

  // Edge barrels and pipe bundles.
  [
    [-34, 18, 0x6f2d1d],
    [-32.8, 19.1, 0x873921],
    [34, -18, 0x6f2d1d],
    [32.8, -19.1, 0x873921]
  ].forEach(([x, z, color], index) => {
    const barrelMaterial = material(`barrel-${color}`, {
      color,
      roughness: 0.78,
      metalness: 0.48
    });
    addVisualCylinder(context, {
      name: `yard_barrel_${index}`,
      x,
      y: 0.47,
      z,
      radiusTop: 0.36,
      height: 0.94,
      material: barrelMaterial,
      segments: 10
    });
  });

  // Visual-only perimeter braces strengthen depth without narrowing gameplay lanes.
  if (artTier > 0) {
    const bracePoints = [
      [-40.8, -29, 0.65],
      [-40.8, 29, -0.65],
      [40.8, -29, -0.65],
      [40.8, 29, 0.65]
    ];
    bracePoints.forEach(([x, z, rotationZ], index) => {
      addVisualBox(context, {
        name: `yard_wall_brace_${index}`,
        x,
        y: 2.2,
        z,
        w: 0.24,
        h: 4.6,
        d: 0.28,
        material: rust,
        rotationZ
      });
    });
  }
}

export function buildIndustrialYard(context) {
  const {
    scene,
    mapMeshes,
    spawnBarricade,
    spawnTrap
  } = context;

  const floorMaterial = material('yard-floor', {
    color: 0x1f2428,
    map: createIndustrialFloorTexture(),
    roughness: 0.96,
    metalness: 0.03
  });

  const floorMesh = createMapFloor(
    { scene, mapMeshes },
    {
      width: YARD_WIDTH,
      depth: YARD_DEPTH,
      material: floorMaterial,
      supportTag: 'industrial_yard_floor'
    }
  );
  floorMesh.name = 'industrial_yard_floor';
  floorMesh.receiveShadow = true;
  floorMesh.userData.artPatch = INDUSTRIAL_ART_PATCH;

  // Certified perimeter collision remains unchanged.
  addBlock(context, {
    w: YARD_WIDTH,
    h: WALL_HEIGHT,
    d: WALL_THICKNESS,
    x: 0,
    z: -YARD_DEPTH / 2,
    color: 0x20262b
  });
  addBlock(context, {
    w: YARD_WIDTH,
    h: WALL_HEIGHT,
    d: WALL_THICKNESS,
    x: 0,
    z: YARD_DEPTH / 2,
    color: 0x20262b
  });
  addBlock(context, {
    w: WALL_THICKNESS,
    h: WALL_HEIGHT,
    d: YARD_DEPTH,
    x: -YARD_WIDTH / 2,
    z: 0,
    color: 0x20262b
  });
  addBlock(context, {
    w: WALL_THICKNESS,
    h: WALL_HEIGHT,
    d: YARD_DEPTH,
    x: YARD_WIDTH / 2,
    z: 0,
    color: 0x20262b
  });

  // Certified container collision remains at the original coordinates.
  addContainer(context, -24, 24, 16, 4, 0x1c5065, 'yard_container_nw');
  addContainer(context, 24, -24, 16, 4, 0x6a2c21, 'yard_container_se');
  addContainer(context, 28, 10, 4, 16, 0x285840, 'yard_container_e');
  addContainer(context, -28, -10, 4, 16, 0x653026, 'yard_container_w');
  addContainer(context, -24, -28, 12, 4, 0x234f63, 'yard_container_sw');
  addContainer(context, 24, 28, 12, 4, 0x2b5b41, 'yard_container_ne');

  // Certified cover collision remains unchanged.
  addLowCover(context, 0, 32, 12, 2, 'yard_barrier_n');
  addLowCover(context, 0, -34, 12, 2, 'yard_barrier_s');
  addLowCover(context, -32, 8, 2, 10, 'yard_barrier_w');
  addLowCover(context, 32, -8, 2, 10, 'yard_barrier_e');

  addCrateStack(context, -22, 6, 'yard_crates_w');
  addCrateStack(context, 22, -6, 'yard_crates_e');
  addCrateStack(context, -6, 28, 'yard_crates_n');
  addCrateStack(context, 8, -28, 'yard_crates_s');

  // Certified repairable barricades.
  if (spawnBarricade) {
    spawnBarricade(-18, 0, Math.PI / 2);
    spawnBarricade(18, 0, Math.PI / 2);
    spawnBarricade(0, 18, 0);
  }

  // Certified electric traps.
  if (spawnTrap) {
    spawnTrap(0, -30, 18, false);
    spawnTrap(30, 0, 18, true);
  }

  // Certified zombie spawn candidates.
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

  // Certified player spawn candidates.
  addPlayerSpawn(context, -8, 8);
  addPlayerSpawn(context, 8, -8);
  addPlayerSpawn(context, 0, 0);

  addIndustrialDressing(context);

  return {
    floorMesh,
    width: YARD_WIDTH,
    depth: YARD_DEPTH,
    navigationCellSize: 2.5
  };
}
