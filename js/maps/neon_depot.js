// js/maps/neon_depot.js
// ART.2 — Neon Depot cinematic visual-art overhaul.
// Gameplay collision, doors, traps, barricades, and spawn coordinates remain
// aligned with the certified Neon Depot layout.

import * as THREE from 'three';
import { createMapFloor } from './map_helpers.js';

const DEPOT_WIDTH = 88;
const DEPOT_DEPTH = 88;
const ART_PATCH = 'art2-neon-depot-r2';

const MATERIALS = new Map();
const GEOMETRIES = new Map();
let depotFloorTexture = null;
let depotSkyTexture = null;

function material(key, options) {
  if (!MATERIALS.has(key)) {
    MATERIALS.set(key, new THREE.MeshStandardMaterial(options));
  }
  return MATERIALS.get(key);
}

function basicMaterial(key, options) {
  if (!MATERIALS.has(key)) {
    MATERIALS.set(key, new THREE.MeshBasicMaterial(options));
  }
  return MATERIALS.get(key);
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

function sphereGeometry(radius, widthSegments = 32, heightSegments = 16) {
  const key = `sphere:${radius}:${widthSegments}:${heightSegments}`;
  if (!GEOMETRIES.has(key)) {
    GEOMETRIES.set(
      key,
      new THREE.SphereGeometry(radius, widthSegments, heightSegments)
    );
  }
  return GEOMETRIES.get(key);
}

function createDepotFloorTexture() {
  if (depotFloorTexture) return depotFloorTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0a1016';
  ctx.fillRect(0, 0, 256, 256);

  // Large service slabs.
  ctx.strokeStyle = 'rgba(75, 102, 119, 0.25)';
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

  // Deterministic grime and aggregate.
  let seed = 0x4e454f4e;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < 1250; i++) {
    const shade = 15 + Math.floor(random() * 28);
    ctx.fillStyle = `rgba(${shade},${shade + 5},${shade + 10},${0.12 + random() * 0.26})`;
    const size = random() > 0.94 ? 3 : 1;
    ctx.fillRect(random() * 256, random() * 256, size, size);
  }

  // Thin maintenance seams.
  ctx.strokeStyle = 'rgba(3, 5, 7, 0.48)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 13; i++) {
    const x = random() * 256;
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14 + random() * 42, y - 7 + random() * 14);
    ctx.stroke();
  }

  depotFloorTexture = new THREE.CanvasTexture(canvas);
  depotFloorTexture.wrapS = THREE.RepeatWrapping;
  depotFloorTexture.wrapT = THREE.RepeatWrapping;
  depotFloorTexture.repeat.set(11, 11);
  depotFloorTexture.colorSpace = THREE.SRGBColorSpace;
  return depotFloorTexture;
}

function addCollisionBox(context, name, x, y, z, w, h, d, color, options = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0.12,
    emissive: options.emissiveColor ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: !!options.transparent,
    opacity: options.opacity ?? 1
  });

  const mesh = new THREE.Mesh(boxGeometry(w, h, d), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.supportTag = options.isDoor ? 'door' : 'neon-depot-block';
  mesh.userData.playerClimbable = false;
  mesh.userData.playerNonWalkable = true;

  context.scene.add(mesh);
  context.mapMeshes.push(mesh);

  const blockObj = {
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    maxY: y + h / 2,
    isDoor: !!options.isDoor,
    playerClimbable: false,
    playerNonWalkable: true,
    supportTag: mesh.userData.supportTag,
    mesh,
    pos: new THREE.Vector3(x, 0, z)
  };

  context.walls.push(blockObj);

  if (options.isDoor && context.doors) {
    context.doors.push(blockObj);
  }

  return blockObj;
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
    cylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      options.segments || 10
    ),
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

function addGroundShadow(root, name, x, z, w, d, rotationY = 0, opacity = 0.26) {
  const shadow = basicMaterial(`shadow:${opacity}`, {
    color: 0x010204,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  addVisualBox(root, name, x, 0.026, z, w, 0.018, d, shadow, { rotationY });
}

function addLightPool(root, name, x, z, radius, color, opacity = 0.18) {
  const poolMaterial = basicMaterial(`pool:${color}:${opacity}`, {
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const pool = new THREE.Mesh(planeGeometry(radius * 2, radius * 2), poolMaterial);
  pool.position.set(x, 0.035, z);
  pool.rotation.x = -Math.PI / 2;
  addArtObject(root, pool, name);
}

function addRailTrack(root, name, x, z, length, rotationY, glowColor) {
  const steel = material('rail-steel', {
    color: 0x252c32,
    roughness: 0.48,
    metalness: 0.84
  });
  const sleeper = material('rail-sleeper', {
    color: 0x161a1f,
    roughness: 0.88,
    metalness: 0.08
  });
  const glow = material(`rail-glow:${glowColor}`, {
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 2.0,
    roughness: 0.28,
    metalness: 0.08
  });

  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);

  [-1.1, 1.1].forEach((side, index) => {
    const px = x + Math.cos(rotationY + Math.PI / 2) * side;
    const pz = z - Math.sin(rotationY + Math.PI / 2) * side;
    addVisualBox(
      root,
      `${name}_rail_${index}`,
      px,
      0.12,
      pz,
      length,
      0.13,
      0.12,
      steel,
      { rotationY }
    );
  });

  const sleeperCount = Math.max(6, Math.floor(length / 2.2));
  for (let i = 0; i < sleeperCount; i++) {
    const t = sleeperCount === 1 ? 0.5 : i / (sleeperCount - 1);
    const local = -length / 2 + t * length;
    const sx = x + local * cos;
    const sz = z - local * sin;

    addVisualBox(
      root,
      `${name}_sleeper_${i}`,
      sx,
      0.07,
      sz,
      3.25,
      0.12,
      0.22,
      sleeper,
      { rotationY: rotationY + Math.PI / 2 }
    );
  }

  addVisualBox(
    root,
    `${name}_guide_glow`,
    x,
    0.16,
    z,
    length,
    0.035,
    0.09,
    glow,
    { rotationY }
  );
}

function addHazardZone(root, name, x, z, length, width, rotationY = 0) {
  const black = material('hazard-black', {
    color: 0x08090b,
    roughness: 0.94,
    metalness: 0.02
  });
  const yellow = material('hazard-yellow', {
    color: 0xffc400,
    emissive: 0x8a4400,
    emissiveIntensity: 0.25,
    roughness: 0.72,
    metalness: 0.10
  });

  addVisualBox(
    root,
    `${name}_base`,
    x,
    0.052,
    z,
    length,
    0.035,
    width,
    black,
    { rotationY }
  );

  const stripeCount = Math.max(4, Math.floor(length / 1.25));
  for (let i = 0; i < stripeCount; i++) {
    const t = stripeCount === 1 ? 0.5 : i / (stripeCount - 1);
    const local = -length / 2 + 0.5 + t * (length - 1.0);
    const sx = x + local * Math.cos(rotationY);
    const sz = z - local * Math.sin(rotationY);

    addVisualBox(
      root,
      `${name}_stripe_${i}`,
      sx,
      0.078,
      sz,
      0.42,
      0.02,
      width * 0.88,
      yellow,
      { rotationY: rotationY + 0.52 }
    );
  }
}

function addWallNeonSign(root, name, x, y, z, width, rotationY, color, labelTexture) {
  const housing = material('sign-housing', {
    color: 0x11161c,
    roughness: 0.58,
    metalness: 0.62
  });
  const glow = material(`sign-glow:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 3.1,
    roughness: 0.22,
    metalness: 0.08
  });

  addVisualBox(
    root,
    `${name}_housing`,
    x,
    y,
    z,
    width + 0.45,
    1.25,
    0.18,
    housing,
    { rotationY }
  );

  addVisualBox(
    root,
    `${name}_glow`,
    x,
    y,
    z - Math.cos(rotationY) * 0.12,
    width,
    0.68,
    0.05,
    glow,
    { rotationY }
  );

  if (labelTexture) {
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const label = new THREE.Mesh(planeGeometry(width * 0.86, 0.52), labelMaterial);
    label.position.set(
      x - Math.sin(rotationY) * 0.11,
      y,
      z - Math.cos(rotationY) * 0.14
    );
    label.rotation.y = rotationY;
    addArtObject(root, label, `${name}_label`);
  }
}

function createSignTexture(text, color = '#58f7ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 56px Arial, sans-serif';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addTrainCarDetails(root, key, x, z, bodyW, bodyD, color, glowColor) {
  const longOnX = bodyW >= bodyD;
  const dark = material(`${key}-dark`, {
    color: new THREE.Color(color).multiplyScalar(0.46),
    roughness: 0.58,
    metalness: 0.62
  });
  const trim = material(`${key}-trim`, {
    color: new THREE.Color(color).multiplyScalar(0.78),
    roughness: 0.46,
    metalness: 0.74
  });
  const glass = material(`${key}-glass`, {
    color: 0x07131d,
    emissive: 0x082d42,
    emissiveIntensity: 0.45,
    roughness: 0.15,
    metalness: 0.18
  });
  const glow = material(`${key}-glow`, {
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 2.45,
    roughness: 0.18,
    metalness: 0.12
  });

  addGroundShadow(root, `${key}_shadow`, x, z, bodyW + 1.4, bodyD + 1.2, 0, 0.34);

  // Roof cap and lower skirt.
  addVisualBox(
    root,
    `${key}_roof`,
    x,
    2.30,
    z,
    bodyW + 0.18,
    0.18,
    bodyD + 0.10,
    trim
  );
  addVisualBox(
    root,
    `${key}_skirt`,
    x,
    0.34,
    z,
    bodyW + 0.10,
    0.34,
    bodyD + 0.06,
    dark
  );

  // Windows along both long sides.
  const windowCount = Math.max(4, Math.floor((longOnX ? bodyW : bodyD) / 3.1));
  for (let i = 0; i < windowCount; i++) {
    const t = windowCount === 1 ? 0.5 : i / (windowCount - 1);
    if (longOnX) {
      const ox = -bodyW / 2 + 1.3 + t * (bodyW - 2.6);
      [-1, 1].forEach((side, sideIndex) => {
        addVisualBox(
          root,
          `${key}_window_${i}_${sideIndex}`,
          x + ox,
          1.45,
          z + side * (bodyD / 2 + 0.035),
          1.5,
          0.72,
          0.06,
          glass
        );
      });
    } else {
      const oz = -bodyD / 2 + 1.3 + t * (bodyD - 2.6);
      [-1, 1].forEach((side, sideIndex) => {
        addVisualBox(
          root,
          `${key}_window_${i}_${sideIndex}`,
          x + side * (bodyW / 2 + 0.035),
          1.45,
          z + oz,
          0.06,
          0.72,
          1.5,
          glass
        );
      });
    }
  }

  // Doors and neon route stripe.
  if (longOnX) {
    [-bodyW * 0.25, bodyW * 0.25].forEach((offset, index) => {
      addVisualBox(
        root,
        `${key}_door_${index}`,
        x + offset,
        1.16,
        z - bodyD / 2 - 0.04,
        1.35,
        1.75,
        0.07,
        dark
      );
    });
    addVisualBox(
      root,
      `${key}_route_glow`,
      x,
      1.04,
      z - bodyD / 2 - 0.085,
      bodyW - 0.7,
      0.11,
      0.05,
      glow
    );
  } else {
    [-bodyD * 0.25, bodyD * 0.25].forEach((offset, index) => {
      addVisualBox(
        root,
        `${key}_door_${index}`,
        x - bodyW / 2 - 0.04,
        1.16,
        z + offset,
        0.07,
        1.75,
        1.35,
        dark
      );
    });
    addVisualBox(
      root,
      `${key}_route_glow`,
      x - bodyW / 2 - 0.085,
      1.04,
      z,
      0.05,
      0.11,
      bodyD - 0.7,
      glow
    );
  }

  // Bogies/wheels.
  const wheelMaterial = material('train-wheel', {
    color: 0x111316,
    roughness: 0.60,
    metalness: 0.82
  });
  const positions = longOnX
    ? [
        [x - bodyW * 0.31, z - bodyD * 0.34],
        [x - bodyW * 0.31, z + bodyD * 0.34],
        [x + bodyW * 0.31, z - bodyD * 0.34],
        [x + bodyW * 0.31, z + bodyD * 0.34]
      ]
    : [
        [x - bodyW * 0.34, z - bodyD * 0.31],
        [x + bodyW * 0.34, z - bodyD * 0.31],
        [x - bodyW * 0.34, z + bodyD * 0.31],
        [x + bodyW * 0.34, z + bodyD * 0.31]
      ];

  positions.forEach(([wx, wz], index) => {
    addVisualCylinder(
      root,
      `${key}_wheel_${index}`,
      wx,
      0.36,
      wz,
      0.34,
      0.34,
      0.22,
      wheelMaterial,
      {
        segments: 10,
        rotationX: Math.PI / 2
      }
    );
  });
}

function addKioskDetails(root, key, x, z, color, glowColor) {
  const dark = material(`${key}-dark`, {
    color: 0x12161b,
    roughness: 0.56,
    metalness: 0.58
  });
  const trim = material(`${key}-trim`, {
    color,
    roughness: 0.54,
    metalness: 0.48
  });
  const screen = material(`${key}-screen`, {
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 2.8,
    roughness: 0.18,
    metalness: 0.05
  });

  addGroundShadow(root, `${key}_shadow`, x, z, 8.2, 6.2, 0, 0.31);
  addVisualBox(root, `${key}_roof`, x, 2.55, z, 7.35, 0.18, 5.25, trim);
  addVisualBox(root, `${key}_fascia`, x, 2.18, z - 2.56, 6.7, 0.52, 0.16, dark);
  addVisualBox(root, `${key}_screen`, x, 1.56, z - 2.61, 3.2, 0.78, 0.06, screen);

  [-2.65, 2.65].forEach((offset, index) => {
    addVisualBox(
      root,
      `${key}_post_${index}`,
      x + offset,
      1.26,
      z - 2.55,
      0.18,
      2.45,
      0.18,
      dark
    );
  });
}

function addPlatformCanopy(root, name, x, z, length, rotationY, glowColor) {
  const steel = material('canopy-steel', {
    color: 0x222a31,
    roughness: 0.54,
    metalness: 0.72
  });
  const roof = material('canopy-roof', {
    color: 0x141b22,
    roughness: 0.66,
    metalness: 0.46
  });
  const glow = material(`canopy-glow:${glowColor}`, {
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 2.35,
    roughness: 0.20,
    metalness: 0.08
  });

  const supportCount = Math.max(3, Math.floor(length / 6));
  for (let i = 0; i < supportCount; i++) {
    const t = supportCount === 1 ? 0.5 : i / (supportCount - 1);
    const local = -length / 2 + 1.0 + t * (length - 2.0);
    const sx = x + local * Math.cos(rotationY);
    const sz = z - local * Math.sin(rotationY);

    [-1.75, 1.75].forEach((side, sideIndex) => {
      const px = sx + Math.cos(rotationY + Math.PI / 2) * side;
      const pz = sz - Math.sin(rotationY + Math.PI / 2) * side;
      addVisualBox(
        root,
        `${name}_post_${i}_${sideIndex}`,
        px,
        2.45,
        pz,
        0.16,
        4.9,
        0.16,
        steel,
        { rotationY }
      );
    });
  }

  addVisualBox(
    root,
    `${name}_roof`,
    x,
    4.78,
    z,
    length,
    0.22,
    4.2,
    roof,
    { rotationY }
  );
  addVisualBox(
    root,
    `${name}_light`,
    x,
    4.62,
    z,
    length - 1.0,
    0.08,
    0.18,
    glow,
    { rotationY }
  );
}

function addTurnstiles(root, name, x, z, rotationY, color) {
  const metal = material('turnstile-metal', {
    color: 0x30383e,
    roughness: 0.44,
    metalness: 0.80
  });
  const glow = material(`turnstile-glow:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 2.2,
    roughness: 0.18
  });

  for (let i = -1; i <= 1; i++) {
    const local = i * 1.65;
    const tx = x + Math.cos(rotationY) * local;
    const tz = z - Math.sin(rotationY) * local;

    addVisualBox(
      root,
      `${name}_base_${i + 1}`,
      tx,
      0.46,
      tz,
      1.05,
      0.92,
      0.54,
      metal,
      { rotationY }
    );
    addVisualBox(
      root,
      `${name}_screen_${i + 1}`,
      tx,
      0.84,
      tz,
      0.48,
      0.16,
      0.58,
      glow,
      { rotationY }
    );
  }
}

function addBench(root, name, x, z, rotationY = 0) {
  const seat = material('bench-seat', {
    color: 0x25323a,
    roughness: 0.64,
    metalness: 0.52
  });
  const frame = material('bench-frame', {
    color: 0x14191d,
    roughness: 0.52,
    metalness: 0.76
  });

  addVisualBox(root, `${name}_seat`, x, 0.62, z, 3.2, 0.20, 0.76, seat, { rotationY });
  addVisualBox(root, `${name}_back`, x, 1.10, z + 0.33, 3.2, 0.78, 0.12, seat, { rotationY });
  [-1.2, 1.2].forEach((offset, index) => {
    addVisualBox(
      root,
      `${name}_leg_${index}`,
      x + Math.cos(rotationY) * offset,
      0.31,
      z - Math.sin(rotationY) * offset,
      0.13,
      0.62,
      0.13,
      frame,
      { rotationY }
    );
  });
}

function addPuddle(root, name, x, z, w, d, rotationY, color) {
  const puddle = basicMaterial(`puddle:${color}`, {
    color,
    transparent: true,
    opacity: 0.19,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  addVisualBox(root, name, x, 0.034, z, w, 0.018, d, puddle, { rotationY });
}

function addCableRun(root, name, x, y, z, length, rotationY, color) {
  const cable = material(`cable:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 0.55,
    roughness: 0.34,
    metalness: 0.58
  });
  addVisualCylinder(
    root,
    name,
    x,
    y,
    z,
    0.035,
    0.035,
    length,
    cable,
    {
      segments: 6,
      rotationZ: Math.PI / 2,
      rotationY
    }
  );
}


function createDepotSkyTexture() {
  if (depotSkyTexture) return depotSkyTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#02030d');
  sky.addColorStop(0.34, '#10092c');
  sky.addColorStop(0.68, '#2b0c54');
  sky.addColorStop(1, '#090716');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const horizon = ctx.createLinearGradient(0, 250, 0, 470);
  horizon.addColorStop(0, 'rgba(71, 31, 155, 0)');
  horizon.addColorStop(0.55, 'rgba(105, 42, 194, 0.38)');
  horizon.addColorStop(1, 'rgba(20, 8, 43, 0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 220, canvas.width, 270);

  let seed = 0x4b414e44;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  ctx.globalCompositeOperation = 'screen';
  for (let layer = 0; layer < 5; layer++) {
    const baseY = 82 + layer * 58;
    for (let i = 0; i < 34; i++) {
      const x = random() * canvas.width;
      const y = baseY + (random() - 0.5) * 80;
      const rx = 55 + random() * 150;
      const ry = 12 + random() * 34;
      const cloud = ctx.createRadialGradient(x, y, 0, x, y, rx);
      const alpha = 0.025 + random() * 0.06;
      cloud.addColorStop(0, `rgba(${80 + layer * 12}, ${55 + layer * 7}, ${150 + layer * 14}, ${alpha})`);
      cloud.addColorStop(0.55, `rgba(46, 31, 94, ${alpha * 0.65})`);
      cloud.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      ctx.translate(-x, -y);
      ctx.fillStyle = cloud;
      ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
      ctx.restore();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.24;
  const vignette = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height * 0.56,
    canvas.height * 0.08,
    canvas.width / 2,
    canvas.height * 0.56,
    canvas.width * 0.62
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

  depotSkyTexture = new THREE.CanvasTexture(canvas);
  depotSkyTexture.colorSpace = THREE.SRGBColorSpace;
  depotSkyTexture.wrapS = THREE.RepeatWrapping;
  depotSkyTexture.repeat.set(1.25, 1);
  return depotSkyTexture;
}

function addDepotSky(root) {
  const material = new THREE.MeshBasicMaterial({
    map: createDepotSkyTexture(),
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false
  });
  const dome = new THREE.Mesh(sphereGeometry(190, 36, 18), material);
  dome.position.set(0, 25, 0);
  dome.scale.y = 0.58;
  dome.renderOrder = -100;
  addArtObject(root, dome, 'depot_storm_sky');
  dome.frustumCulled = false;
}

function addNeonEdgeFrame(root, name, x, y, z, w, h, d, color, options = {}) {
  const frame = material(`edge-frame:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: options.intensity ?? 2.8,
    roughness: 0.18,
    metalness: 0.12
  });

  const thickness = options.thickness ?? 0.10;
  addVisualBox(root, `${name}_top`, x, y + h / 2 + 0.02, z, w, thickness, d, frame, options);
  addVisualBox(root, `${name}_bottom`, x, y - h / 2 + 0.02, z, w, thickness, d, frame, options);
}

function addPerimeterLamp(root, name, x, z, color, faceRotation = 0, includeLight = false) {
  const housing = material('depot-wall-lamp-housing', {
    color: 0x15181f,
    roughness: 0.52,
    metalness: 0.68
  });
  const glow = material(`depot-wall-lamp:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 3.6,
    roughness: 0.16,
    metalness: 0.04
  });

  addVisualBox(root, `${name}_housing`, x, 3.48, z, 1.4, 0.34, 0.26, housing, {
    rotationY: faceRotation
  });
  addVisualBox(root, `${name}_glow`, x, 3.39, z, 1.02, 0.16, 0.06, glow, {
    rotationY: faceRotation
  });
  addLightPool(root, `${name}_pool`, x, z, 5.8, color, 0.09);

  if (includeLight) {
    const light = new THREE.PointLight(color, 7.5, 18, 2.2);
    light.position.set(x, 3.0, z);
    light.castShadow = false;
    addArtObject(root, light, `${name}_light`);
  }
}

function addDepotWatchtower(root, x, z, color) {
  const steel = material('depot-watchtower-steel', {
    color: 0x171b24,
    roughness: 0.54,
    metalness: 0.76
  });
  const roof = material('depot-watchtower-roof', {
    color: 0x25172d,
    roughness: 0.62,
    metalness: 0.48
  });
  const glow = material(`depot-watchtower-glow:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 3.8,
    roughness: 0.14
  });

  [-1.25, 1.25].forEach((ox, xi) => {
    [-1.25, 1.25].forEach((oz, zi) => {
      addVisualBox(
        root,
        `depot_watchtower_post_${xi}_${zi}`,
        x + ox,
        3.5,
        z + oz,
        0.16,
        7.0,
        0.16,
        steel
      );
    });
  });

  addVisualBox(root, 'depot_watchtower_platform', x, 6.25, z, 3.4, 0.24, 3.4, steel);
  addVisualBox(root, 'depot_watchtower_roof', x, 7.35, z, 4.2, 0.22, 4.2, roof);
  addVisualBox(root, 'depot_watchtower_beacon', x, 7.58, z, 0.72, 0.26, 0.72, glow);
  addLightPool(root, 'depot_watchtower_pool', x, z, 7.0, color, 0.12);

  const beacon = new THREE.PointLight(color, 8.5, 22, 2.1);
  beacon.position.set(x, 7.1, z);
  beacon.castShadow = false;
  addArtObject(root, beacon, 'depot_watchtower_light');
}

function addAtmosphericMist(root, name, x, z, w, d, color, opacity, rotationY = 0) {
  const mist = basicMaterial(`mist:${color}:${opacity}`, {
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const plane = new THREE.Mesh(planeGeometry(w, d), mist);
  plane.position.set(x, 0.11, z);
  plane.rotation.x = -Math.PI / 2;
  plane.rotation.z = rotationY;
  plane.renderOrder = 3;
  addArtObject(root, plane, name);
}

function addHeroLightingPass(root) {
  const cyan = 0x21e8ff;
  const magenta = 0xff38d1;
  const violet = 0x7e5cff;

  const hemi = new THREE.HemisphereLight(0x5568ff, 0x170018, 0.38);
  addArtObject(root, hemi, 'depot_hero_hemisphere');

  addDepotSky(root);
  addDepotWatchtower(root, 19, -35.2, magenta);

  [
    [-36.8, -25, cyan, Math.PI / 2, true],
    [-36.8, 25, magenta, Math.PI / 2, false],
    [36.8, -25, cyan, -Math.PI / 2, false],
    [36.8, 25, magenta, -Math.PI / 2, true],
    [-24, -42.75, magenta, 0, false],
    [24, -42.75, cyan, 0, false],
    [-24, 42.75, cyan, Math.PI, false],
    [24, 42.75, magenta, Math.PI, false]
  ].forEach(([x, z, color, rotation, includeLight], index) => {
    addPerimeterLamp(
      root,
      `depot_perimeter_lamp_${index}`,
      x,
      z,
      color,
      rotation,
      includeLight
    );
  });

  addAtmosphericMist(root, 'depot_mist_center', 0, 0, 64, 44, violet, 0.035, 0.08);
  addAtmosphericMist(root, 'depot_mist_north', -5, -27, 48, 18, cyan, 0.028, -0.10);
  addAtmosphericMist(root, 'depot_mist_south', 7, 26, 48, 18, magenta, 0.030, 0.12);

  const cyanEdge = material('hero-cyan-edge', {
    color: cyan,
    emissive: cyan,
    emissiveIntensity: 3.2,
    roughness: 0.15
  });
  const magentaEdge = material('hero-magenta-edge', {
    color: magenta,
    emissive: magenta,
    emissiveIntensity: 3.2,
    roughness: 0.15
  });

  [
    [0, -36, 58, 0.06, 0.10, cyanEdge],
    [0, 36, 58, 0.06, 0.10, magentaEdge],
    [-36, 0, 0.10, 0.06, 58, magentaEdge],
    [36, 0, 0.10, 0.06, 58, cyanEdge]
  ].forEach(([x, z, w, h, d, mat], index) => {
    addVisualBox(root, `depot_outer_glow_${index}`, x, 0.09, z, w, h, d, mat);
  });

  addNeonEdgeFrame(root, 'depot_kiosk_a_hero', -18, 1.2, -12, 7.1, 2.45, 5.1, cyan, {
    thickness: 0.08,
    intensity: 2.9
  });
  addNeonEdgeFrame(root, 'depot_kiosk_b_hero', 18, 1.2, 12, 7.1, 2.45, 5.1, magenta, {
    thickness: 0.08,
    intensity: 2.9
  });
  addNeonEdgeFrame(root, 'depot_platform_n_hero', 0, 1.6, -28, 16.1, 3.2, 2.1, cyan, {
    thickness: 0.09,
    intensity: 3.1
  });
  addNeonEdgeFrame(root, 'depot_platform_s_hero', 0, 1.6, 28, 16.1, 3.2, 2.1, magenta, {
    thickness: 0.09,
    intensity: 3.1
  });

}

function addNeonDepotDressing(context) {
  const medium = createArtRoot(context, 'neon_depot_art_medium', 'medium');
  const high = createArtRoot(context, 'neon_depot_art_high', 'high');

  const cyan = 0x20e7ff;
  const magenta = 0xff3ccf;
  const violet = 0x8b5cff;
  const warm = 0xffb34d;

  const depot07Texture = createSignTexture('DEPOT 07', '#5df5ff');
  const platformTexture = createSignTexture('NIGHT LINE', '#ff5dd8');

  // R2 cinematic hero pass: storm sky, wall lamps, mist, reflective accents,
  // and stronger landmark silhouettes. Low graphics hides both art roots.
  addHeroLightingPass(medium);

  // Track lanes and platform edge readability.
  addRailTrack(medium, 'depot_track_north', 0, -18, 58, 0, cyan);
  addRailTrack(medium, 'depot_track_south', 0, 18, 58, 0, magenta);
  addRailTrack(medium, 'depot_track_west', -18, 0, 58, Math.PI / 2, cyan);
  addRailTrack(medium, 'depot_track_east', 18, 0, 58, Math.PI / 2, magenta);

  // Existing collision boxes receive detailed visual shells.
  addTrainCarDetails(medium, 'depot_train_a', -24, 18, 18, 5, 0x294553, cyan);
  addTrainCarDetails(medium, 'depot_train_b', 24, -18, 18, 5, 0x51314d, magenta);
  addKioskDetails(medium, 'depot_kiosk_a_art', -18, -12, 0x24313a, cyan);
  addKioskDetails(medium, 'depot_kiosk_b_art', 18, 12, 0x3d293d, magenta);

  // Canopies are visual-only and placed over the existing platform blocks.
  addPlatformCanopy(medium, 'depot_canopy_north', 0, -28, 18, 0, cyan);
  addPlatformCanopy(medium, 'depot_canopy_south', 0, 28, 18, 0, magenta);

  // Perimeter signs create recognizable directional landmarks.
  addWallNeonSign(
    medium,
    'depot_sign_north',
    -18,
    2.75,
    -42.86,
    10.2,
    0,
    cyan,
    depot07Texture
  );
  addWallNeonSign(
    medium,
    'depot_sign_south',
    18,
    2.75,
    42.86,
    10.2,
    Math.PI,
    magenta,
    platformTexture
  );
  addWallNeonSign(
    medium,
    'depot_sign_west',
    -42.86,
    2.75,
    18,
    10.2,
    Math.PI / 2,
    cyan,
    depot07Texture
  );
  addWallNeonSign(
    medium,
    'depot_sign_east',
    42.86,
    2.75,
    -18,
    10.2,
    -Math.PI / 2,
    magenta,
    platformTexture
  );

  // Security gate approach and trap warnings.
  addTurnstiles(medium, 'depot_turnstiles_west', -13.0, 0, Math.PI / 2, cyan);
  addTurnstiles(medium, 'depot_turnstiles_east', 13.0, 0, Math.PI / 2, magenta);
  addHazardZone(medium, 'depot_hazard_north', 0, -22, 11, 1.5, 0);
  addHazardZone(medium, 'depot_hazard_south', 0, 22, 11, 1.5, 0);

  // Rest areas and platform props.
  addBench(medium, 'depot_bench_nw', -14, -31.0, 0);
  addBench(medium, 'depot_bench_se', 14, 31.0, Math.PI);
  addBench(medium, 'depot_bench_w', -31.0, 12, Math.PI / 2);
  addBench(medium, 'depot_bench_e', 31.0, -12, -Math.PI / 2);

  // Low-cost reflection cues.
  addPuddle(medium, 'depot_puddle_a', -11, 12, 7.5, 3.0, 0.24, cyan);
  addPuddle(medium, 'depot_puddle_b', 12, -10, 7.2, 2.7, -0.34, magenta);
  addPuddle(medium, 'depot_puddle_c', -27, -23, 5.2, 2.2, 0.10, violet);

  // Ground light pools and actual non-shadow-casting lights.
  [
    [-31, -31, cyan],
    [31, 31, magenta],
    [-31, 31, violet],
    [31, -31, warm]
  ].forEach(([x, z, color], index) => {
    addLightPool(medium, `depot_light_pool_${index}`, x, z, 8.5, color, 0.15);

    const light = new THREE.PointLight(color, 14, 25, 2.1);
    light.position.set(x, 5.6, z);
    light.castShadow = false;
    addArtObject(medium, light, `depot_point_light_${index}`);
  });

  // High-only wet-floor reflection cues matching the cinematic hero target.
  [
    [-20, 8, 8.5, 3.2, 0.18, cyan],
    [21, -9, 8.0, 3.1, -0.22, magenta],
    [-6, -11, 6.4, 2.2, 0.34, violet],
    [8, 13, 6.2, 2.4, -0.28, magenta]
  ].forEach(([x, z, w, d, rotationY, color], index) => {
    addPuddle(high, `depot_hero_puddle_${index}`, x, z, w, d, rotationY, color);
  });

  // High-quality ceiling/cable depth pass.
  [
    [-34, -16, 16, cyan],
    [-34, 16, 16, violet],
    [34, -16, 16, warm],
    [34, 16, 16, magenta]
  ].forEach(([x, z, length, color], index) => {
    addCableRun(
      high,
      `depot_cable_${index}`,
      x,
      4.2 + (index % 2) * 0.25,
      z,
      length,
      Math.PI / 2,
      color
    );
  });

  const highGlowCyan = material('high-glow-cyan', {
    color: cyan,
    emissive: cyan,
    emissiveIntensity: 2.7,
    roughness: 0.18
  });
  const highGlowMagenta = material('high-glow-magenta', {
    color: magenta,
    emissive: magenta,
    emissiveIntensity: 2.7,
    roughness: 0.18
  });

  // Suspended lane identifiers and upper-wall light bars.
  [-1, 1].forEach((side, index) => {
    addVisualBox(
      high,
      `depot_upper_bar_n_${index}`,
      side * 21,
      4.05,
      -42.82,
      14,
      0.12,
      0.06,
      index === 0 ? highGlowCyan : highGlowMagenta
    );
    addVisualBox(
      high,
      `depot_upper_bar_s_${index}`,
      side * 21,
      4.05,
      42.82,
      14,
      0.12,
      0.06,
      index === 0 ? highGlowMagenta : highGlowCyan
    );
  });

  // High-only small service crates along arena edges.
  const crate = material('service-crate', {
    color: 0x28323a,
    roughness: 0.72,
    metalness: 0.38
  });
  const crateGlow = material('service-crate-glow', {
    color: warm,
    emissive: warm,
    emissiveIntensity: 1.65,
    roughness: 0.30
  });

  [
    [-35, -8, 0.18],
    [-34, 9, -0.14],
    [35, 8, -0.18],
    [34, -9, 0.14]
  ].forEach(([x, z, rotationY], index) => {
    addGroundShadow(high, `depot_crate_shadow_${index}`, x, z, 2.5, 2.1, rotationY, 0.25);
    addVisualBox(
      high,
      `depot_crate_${index}`,
      x,
      0.62,
      z,
      2.1,
      1.22,
      1.7,
      crate,
      { rotationY }
    );
    addVisualBox(
      high,
      `depot_crate_glow_${index}`,
      x,
      0.86,
      z - 0.88,
      0.82,
      0.14,
      0.05,
      crateGlow,
      { rotationY }
    );
  });
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

export function buildNeonDepot(context) {
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x080b12,
    map: createDepotFloorTexture(),
    roughness: 0.42,
    metalness: 0.18,
    clearcoat: 0.46,
    clearcoatRoughness: 0.24
  });

  const floorMesh = createMapFloor(
    {
      scene: context.scene,
      mapMeshes: context.mapMeshes
    },
    {
      width: DEPOT_WIDTH,
      depth: DEPOT_DEPTH,
      material: floorMaterial,
      supportTag: 'neon_depot_floor'
    }
  );
  floorMesh.name = 'neon_depot_floor';
  floorMesh.receiveShadow = true;
  floorMesh.userData.artPatch = ART_PATCH;

  // Certified perimeter collision.
  addCollisionBox(context, 'depot_wall_north', 0, 2.25, -44, 88, 4.5, 2, 0x151e29);
  addCollisionBox(context, 'depot_wall_south', 0, 2.25, 44, 88, 4.5, 2, 0x151e29);
  addCollisionBox(context, 'depot_wall_west', -44, 2.25, 0, 2, 4.5, 88, 0x151e29);
  addCollisionBox(context, 'depot_wall_east', 44, 2.25, 0, 2, 4.5, 88, 0x151e29);

  // Certified train-car collision.
  addCollisionBox(context, 'depot_train_car_a', -24, 1.1, 18, 18, 2.2, 5, 0x263c49, {
    roughness: 0.58,
    metalness: 0.50
  });
  addCollisionBox(context, 'depot_train_car_b', 24, 1.1, -18, 18, 2.2, 5, 0x4a2d47, {
    roughness: 0.58,
    metalness: 0.50
  });

  // Certified service-kiosk collision.
  addCollisionBox(context, 'depot_kiosk_a', -18, 1.2, -12, 7, 2.4, 5, 0x202b31, {
    roughness: 0.66,
    metalness: 0.32
  });
  addCollisionBox(context, 'depot_kiosk_b', 18, 1.2, 12, 7, 2.4, 5, 0x342637, {
    roughness: 0.66,
    metalness: 0.32
  });

  // Certified split-platform collision.
  addCollisionBox(context, 'depot_platform_north', 0, 1.6, -28, 16, 3.2, 2, 0x17212b, {
    roughness: 0.72,
    metalness: 0.34
  });
  addCollisionBox(context, 'depot_platform_south', 0, 1.6, 28, 16, 3.2, 2, 0x17212b, {
    roughness: 0.72,
    metalness: 0.34
  });

  // Certified central security gates. Opening either gate unlocks locked spawns.
  addCollisionBox(context, 'depot_security_gate_west', -8, 2.0, 0, 1.4, 4.0, 10, 0xff315f, {
    isDoor: true,
    transparent: true,
    opacity: 0.78,
    emissiveColor: 0xb3163f,
    emissiveIntensity: 1.15,
    roughness: 0.38,
    metalness: 0.18
  });

  addCollisionBox(context, 'depot_security_gate_east', 8, 2.0, 0, 1.4, 4.0, 10, 0xff315f, {
    isDoor: true,
    transparent: true,
    opacity: 0.78,
    emissiveColor: 0xb3163f,
    emissiveIntensity: 1.15,
    roughness: 0.38,
    metalness: 0.18
  });

  // Certified barricades.
  if (context.spawnBarricade) {
    context.spawnBarricade(-38, 0, Math.PI / 2);
    context.spawnBarricade(38, 0, Math.PI / 2);
    context.spawnBarricade(0, -38, 0);
    context.spawnBarricade(0, 38, 0);
  }

  // Certified electric traps.
  if (context.spawnTrap) {
    context.spawnTrap(0, -22, 8, false);
    context.spawnTrap(0, 22, 8, false);
  }

  addPlayerSpawns(context);
  addZombieSpawns(context);
  addNeonDepotDressing(context);

  return {
    floorMesh,
    width: DEPOT_WIDTH,
    depth: DEPOT_DEPTH,
    navigationCellSize: 2.5
  };
}
