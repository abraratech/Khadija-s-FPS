// js/maps/grid_bunker.js
// ART.3 — Grid Bunker cinematic visual-art overhaul.
// The certified tile layout, energy gates, spawn pools, and navigation contract
// remain unchanged while the bunker receives a cold containment presentation.

import * as THREE from 'three';
import { createMapFloor, gridTileToWorld } from './map_helpers.js';

const ART_PATCH = 'art3-grid-bunker-r1';
const MATERIALS = new Map();
const GEOMETRIES = new Map();
let bunkerFloorTexture = null;

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
    GEOMETRIES.set(key, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments));
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

function createBunkerFloorTexture() {
  if (bunkerFloorTexture) return bunkerFloorTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(95, 132, 154, 0.24)';
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

  let seed = 0x42554e4b;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < 1450; i++) {
    const shade = 14 + Math.floor(random() * 34);
    ctx.fillStyle = `rgba(${shade},${shade + 7},${shade + 12},${0.10 + random() * 0.28})`;
    const size = random() > 0.93 ? 3 : 1;
    ctx.fillRect(random() * 256, random() * 256, size, size);
  }

  ctx.strokeStyle = 'rgba(3, 6, 8, 0.60)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 15; i++) {
    const x = random() * 256;
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12 + random() * 40, y - 10 + random() * 20);
    ctx.stroke();
  }

  bunkerFloorTexture = new THREE.CanvasTexture(canvas);
  bunkerFloorTexture.wrapS = THREE.RepeatWrapping;
  bunkerFloorTexture.wrapT = THREE.RepeatWrapping;
  bunkerFloorTexture.repeat.set(9, 9);
  bunkerFloorTexture.colorSpace = THREE.SRGBColorSpace;
  return bunkerFloorTexture;
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
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return addArtObject(root, mesh, name);
}

function addVisualCylinder(root, name, x, y, z, radiusTop, radiusBottom, height, meshMaterial, options = {}) {
  const mesh = new THREE.Mesh(
    cylinderGeometry(radiusTop, radiusBottom, height, options.segments || 10),
    meshMaterial
  );
  mesh.position.set(x, y, z);
  mesh.rotation.set(options.rotationX || 0, options.rotationY || 0, options.rotationZ || 0);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return addArtObject(root, mesh, name);
}

function addFloorPanel(root, name, x, z, w, d, color, opacity = 0.22, rotationY = 0) {
  const panelMaterial = basicMaterial(`${name}:${color}:${opacity}`, {
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  addVisualBox(root, name, x, 0.032, z, w, 0.018, d, panelMaterial, { rotationY });
}

function addLightPool(root, name, x, z, radius, color, opacity = 0.13) {
  const poolMaterial = basicMaterial(`pool:${color}:${opacity}`, {
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const pool = new THREE.Mesh(planeGeometry(radius * 2, radius * 2), poolMaterial);
  pool.position.set(x, 0.038, z);
  pool.rotation.x = -Math.PI / 2;
  addArtObject(root, pool, name);
}

function createSignTexture(text, color = '#7ee7ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(4, 12, 18, 0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(126, 231, 255, 0.58)';
  ctx.lineWidth = 7;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 54px Arial, sans-serif';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addWallSign(root, name, text, x, y, z, rotationY, color = 0x7ee7ff, width = 4.8) {
  const housing = material('bunker-sign-housing', {
    color: 0x0b1218,
    roughness: 0.54,
    metalness: 0.68
  });
  const glow = material(`bunker-sign-glow:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 2.35,
    roughness: 0.18,
    metalness: 0.05
  });

  addVisualBox(root, `${name}_housing`, x, y, z, width + 0.35, 1.25, 0.16, housing, { rotationY });
  addVisualBox(
    root,
    `${name}_glow`,
    x - Math.sin(rotationY) * 0.10,
    y,
    z - Math.cos(rotationY) * 0.10,
    width,
    0.66,
    0.05,
    glow,
    { rotationY }
  );

  const label = new THREE.Mesh(
    planeGeometry(width * 0.88, 0.62),
    new THREE.MeshBasicMaterial({
      map: createSignTexture(text, `#${new THREE.Color(color).getHexString()}`),
      transparent: true,
      depthWrite: false
    })
  );
  label.position.set(
    x - Math.sin(rotationY) * 0.115,
    y,
    z - Math.cos(rotationY) * 0.125
  );
  label.rotation.y = rotationY;
  addArtObject(root, label, `${name}_label`);
}

function addHazardStrip(root, name, x, z, length, width, rotationY = 0) {
  const black = material('bunker-hazard-black', {
    color: 0x07090b,
    roughness: 0.94,
    metalness: 0.02
  });
  const amber = material('bunker-hazard-amber', {
    color: 0xffa400,
    emissive: 0x6f3000,
    emissiveIntensity: 0.22,
    roughness: 0.72,
    metalness: 0.10
  });

  addVisualBox(root, `${name}_base`, x, 0.048, z, length, 0.025, width, black, { rotationY });
  const stripeCount = Math.max(4, Math.floor(length / 0.95));
  for (let i = 0; i < stripeCount; i++) {
    const t = stripeCount === 1 ? 0.5 : i / (stripeCount - 1);
    const local = -length / 2 + 0.42 + t * (length - 0.84);
    addVisualBox(
      root,
      `${name}_stripe_${i}`,
      x + local * Math.cos(rotationY),
      0.069,
      z - local * Math.sin(rotationY),
      0.32,
      0.018,
      width * 0.88,
      amber,
      { rotationY: rotationY + 0.52 }
    );
  }
}

function isSolidTile(row, col) {
  if (row < 0 || row >= GRID_BUNKER_LAYOUT.length) return false;
  if (col < 0 || col >= GRID_BUNKER_LAYOUT[0].length) return false;
  const tile = GRID_BUNKER_LAYOUT[row][col];
  return tile === 1 || tile === 2;
}

function addExposedWallFace(root, row, col, face, tileSize, wallHeight, tile) {
  const { x, z } = gridTileToWorld(
    row,
    col,
    GRID_BUNKER_LAYOUT.length,
    GRID_BUNKER_LAYOUT[0].length,
    tileSize
  );

  const panel = material('bunker-wall-panel', {
    color: 0x18232d,
    roughness: 0.62,
    metalness: 0.48
  });
  const frame = material('bunker-wall-frame', {
    color: 0x293843,
    roughness: 0.48,
    metalness: 0.70
  });
  const seam = material('bunker-wall-seam', {
    color: 0x071019,
    roughness: 0.58,
    metalness: 0.56
  });
  const cyan = material('bunker-wall-cyan', {
    color: 0x5ee7ff,
    emissive: 0x20bce8,
    emissiveIntensity: 2.4,
    roughness: 0.18,
    metalness: 0.06
  });
  const gateGlow = material('bunker-gate-orange', {
    color: 0xff6a18,
    emissive: 0xff3c00,
    emissiveIntensity: 2.9,
    roughness: 0.18,
    metalness: 0.08
  });

  const isHorizontalFace = face === 'north' || face === 'south';
  const rotationY = face === 'north' ? 0 : face === 'south' ? Math.PI : face === 'west' ? Math.PI / 2 : -Math.PI / 2;
  const offsetX = face === 'west' ? -tileSize / 2 - 0.035 : face === 'east' ? tileSize / 2 + 0.035 : 0;
  const offsetZ = face === 'north' ? tileSize / 2 + 0.035 : face === 'south' ? -tileSize / 2 - 0.035 : 0;
  const faceW = tileSize * 0.84;

  addVisualBox(
    root,
    `bunker_panel_${row}_${col}_${face}`,
    x + offsetX,
    wallHeight * 0.53,
    z + offsetZ,
    isHorizontalFace ? faceW : 0.07,
    wallHeight * 0.72,
    isHorizontalFace ? 0.07 : faceW,
    panel,
    { rotationY: 0 }
  );

  const edgeOffset = faceW * 0.43;
  [-edgeOffset, edgeOffset].forEach((side, index) => {
    const px = x + offsetX + (isHorizontalFace ? side : 0);
    const pz = z + offsetZ + (isHorizontalFace ? 0 : side);
    addVisualBox(
      root,
      `bunker_panel_frame_${row}_${col}_${face}_${index}`,
      px,
      wallHeight * 0.53,
      pz,
      isHorizontalFace ? 0.10 : 0.075,
      wallHeight * 0.78,
      isHorizontalFace ? 0.075 : 0.10,
      frame
    );
  });

  addVisualBox(
    root,
    `bunker_panel_seam_${row}_${col}_${face}`,
    x + offsetX,
    wallHeight * 0.56,
    z + offsetZ,
    isHorizontalFace ? faceW * 0.72 : 0.075,
    0.08,
    isHorizontalFace ? 0.075 : faceW * 0.72,
    seam
  );

  if (tile === 2) {
    addVisualBox(
      root,
      `bunker_gate_header_${row}_${col}_${face}`,
      x + offsetX,
      wallHeight * 0.82,
      z + offsetZ,
      isHorizontalFace ? faceW * 0.74 : 0.08,
      0.34,
      isHorizontalFace ? 0.08 : faceW * 0.74,
      gateGlow
    );
    [-1.45, 1.45].forEach((side, index) => {
      addVisualBox(
        root,
        `bunker_gate_bar_${row}_${col}_${face}_${index}`,
        x + offsetX + (isHorizontalFace ? side : 0),
        wallHeight * 0.46,
        z + offsetZ + (isHorizontalFace ? 0 : side),
        isHorizontalFace ? 0.12 : 0.08,
        wallHeight * 0.58,
        isHorizontalFace ? 0.08 : 0.12,
        gateGlow
      );
    });
  } else if ((row * 17 + col * 11 + face.length) % 4 === 0) {
    addVisualBox(
      root,
      `bunker_face_light_${row}_${col}_${face}`,
      x + offsetX,
      wallHeight * 0.83,
      z + offsetZ,
      isHorizontalFace ? 2.25 : 0.08,
      0.16,
      isHorizontalFace ? 0.08 : 2.25,
      cyan
    );
  }
}

function addWallPanels(root, tileSize, wallHeight) {
  const rows = GRID_BUNKER_LAYOUT.length;
  const cols = GRID_BUNKER_LAYOUT[0].length;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = GRID_BUNKER_LAYOUT[row][col];
      if (tile !== 1 && tile !== 2) continue;

      if (!isSolidTile(row - 1, col)) addExposedWallFace(root, row, col, 'north', tileSize, wallHeight, tile);
      if (!isSolidTile(row + 1, col)) addExposedWallFace(root, row, col, 'south', tileSize, wallHeight, tile);
      if (!isSolidTile(row, col - 1)) addExposedWallFace(root, row, col, 'west', tileSize, wallHeight, tile);
      if (!isSolidTile(row, col + 1)) addExposedWallFace(root, row, col, 'east', tileSize, wallHeight, tile);
    }
  }
}

function addCeilingStructure(root) {
  const beam = material('bunker-ceiling-beam', {
    color: 0x121a20,
    roughness: 0.54,
    metalness: 0.76
  });
  const cable = material('bunker-ceiling-cable', {
    color: 0x202a31,
    roughness: 0.60,
    metalness: 0.62
  });

  [-24, -12, 0, 12, 24].forEach((z, index) => {
    addVisualBox(root, `bunker_ceiling_beam_x_${index}`, 0, 5.05, z, 54, 0.16, 0.22, beam);
  });
  [-24, -12, 0, 12, 24].forEach((x, index) => {
    addVisualBox(root, `bunker_ceiling_beam_z_${index}`, x, 5.18, 0, 0.22, 0.16, 54, beam);
  });

  [-18, 18].forEach((x, index) => {
    addVisualCylinder(
      root,
      `bunker_ceiling_pipe_${index}`,
      x,
      4.72,
      0,
      0.11,
      0.11,
      48,
      cable,
      { segments: 8, rotationX: Math.PI / 2 }
    );
  });
}

function addContainmentLighting(root) {
  const fixture = material('bunker-light-fixture', {
    color: 0x1b252c,
    roughness: 0.48,
    metalness: 0.74
  });
  const cyan = material('bunker-light-cyan', {
    color: 0x74e9ff,
    emissive: 0x2ec7ff,
    emissiveIntensity: 3.2,
    roughness: 0.16,
    metalness: 0.04
  });

  const lights = [
    [0, -21, 0],
    [0, 21, 0],
    [-21, 0, Math.PI / 2],
    [21, 0, Math.PI / 2],
    [-15, -15, 0],
    [15, 15, 0],
    [-15, 15, 0],
    [15, -15, 0]
  ];

  lights.forEach(([x, z, rotationY], index) => {
    addVisualBox(root, `bunker_light_fixture_${index}`, x, 4.24, z, 3.8, 0.18, 0.42, fixture, { rotationY });
    addVisualBox(root, `bunker_light_glow_${index}`, x, 4.12, z, 3.25, 0.05, 0.14, cyan, { rotationY });
    addLightPool(root, `bunker_light_pool_${index}`, x, z, 5.2, 0x37c9ff, 0.10);

    if (index < 4) {
      const light = new THREE.PointLight(0x55d9ff, 9.5, 18, 2.1);
      light.position.set(x, 3.85, z);
      light.castShadow = false;
      addArtObject(root, light, `bunker_point_light_${index}`);
    }
  });
}

function addControlTerminal(root, name, x, z, rotationY, color = 0x39d8ff) {
  const frame = material('bunker-terminal-frame', {
    color: 0x151f25,
    roughness: 0.52,
    metalness: 0.70
  });
  const screen = material(`bunker-terminal-screen:${color}`, {
    color,
    emissive: color,
    emissiveIntensity: 2.9,
    roughness: 0.16,
    metalness: 0.05
  });

  addVisualBox(root, `${name}_frame`, x, 1.30, z, 2.25, 2.25, 0.36, frame, { rotationY });
  addVisualBox(
    root,
    `${name}_screen`,
    x - Math.sin(rotationY) * 0.20,
    1.54,
    z - Math.cos(rotationY) * 0.20,
    1.55,
    0.76,
    0.06,
    screen,
    { rotationY }
  );
  addFloorPanel(root, `${name}_shadow`, x, z, 2.8, 1.1, 0x020508, 0.38, rotationY);
}

function addPipeRun(root, name, x, y, z, length, rotationY, color) {
  const pipe = material(`bunker-pipe:${color}`, {
    color,
    roughness: 0.58,
    metalness: 0.66
  });
  addVisualCylinder(
    root,
    name,
    x,
    y,
    z,
    0.10,
    0.10,
    length,
    pipe,
    { segments: 8, rotationZ: Math.PI / 2, rotationY }
  );
}

function addGridBunkerDressing(context, tileSize, wallHeight) {
  const medium = createArtRoot(context, 'grid_bunker_art_medium', 'medium');
  const high = createArtRoot(context, 'grid_bunker_art_high', 'high');

  addWallPanels(medium, tileSize, wallHeight);
  addContainmentLighting(medium);

  const cyanLine = material('bunker-guide-cyan', {
    color: 0x3edcff,
    emissive: 0x109fd2,
    emissiveIntensity: 2.2,
    roughness: 0.20,
    metalness: 0.05
  });
  const outerLanes = [
    [0, -21, 42, 0.08, 0.18, 0],
    [0, 21, 42, 0.08, 0.18, 0],
    [-21, 0, 0.18, 0.08, 42, 0],
    [21, 0, 0.18, 0.08, 42, 0]
  ];
  outerLanes.forEach(([x, z, w, h, d], index) => {
    addVisualBox(medium, `bunker_outer_guide_${index}`, x, 0.058, z, w, h, d, cyanLine);
  });

  addHazardStrip(medium, 'bunker_gate_north', 0, 12.4, 8.8, 1.35, 0);
  addHazardStrip(medium, 'bunker_gate_south', 0, -12.4, 8.8, 1.35, 0);
  addHazardStrip(medium, 'bunker_gate_west', -12.4, 0, 8.8, 1.35, Math.PI / 2);
  addHazardStrip(medium, 'bunker_gate_east', 12.4, 0, 8.8, 1.35, Math.PI / 2);

  addWallSign(medium, 'bunker_sector_north', 'SECTOR B', 0, 2.55, 24.04, Math.PI, 0x6ee6ff, 5.2);
  addWallSign(medium, 'bunker_sector_south', 'LOCKDOWN', 0, 2.55, -24.04, 0, 0xff9a2f, 5.2);
  addWallSign(medium, 'bunker_sector_west', 'COLD STORAGE', -24.04, 2.55, 0, -Math.PI / 2, 0x6ee6ff, 6.2);
  addWallSign(medium, 'bunker_sector_east', 'P-7', 24.04, 2.55, 0, Math.PI / 2, 0x6ee6ff, 4.0);

  addControlTerminal(medium, 'bunker_terminal_north', -12, 23.78, Math.PI, 0x50e5ff);
  addControlTerminal(medium, 'bunker_terminal_south', 12, -23.78, 0, 0xff8c35);
  addControlTerminal(medium, 'bunker_terminal_west', -23.78, -12, -Math.PI / 2, 0x50e5ff);
  addControlTerminal(medium, 'bunker_terminal_east', 23.78, 12, Math.PI / 2, 0x50e5ff);

  // Dark contact patches and wet floor cues.
  [
    [-14, -18, 6.8, 2.8, 0.18],
    [15, 17, 7.2, 2.6, -0.22],
    [-18, 13, 5.8, 2.4, 0.42],
    [18, -13, 6.2, 2.2, -0.36]
  ].forEach(([x, z, w, d, rotation], index) => {
    addFloorPanel(medium, `bunker_grime_${index}`, x, z, w, d, 0x03070a, 0.44, rotation);
  });

  addCeilingStructure(high);
  addPipeRun(high, 'bunker_pipe_north', 0, 3.62, 23.72, 38, 0, 0x31535f);
  addPipeRun(high, 'bunker_pipe_south', 0, 3.58, -23.72, 38, 0, 0x4c3d2d);
  addPipeRun(high, 'bunker_pipe_west', -23.72, 3.48, 0, 38, Math.PI / 2, 0x31535f);
  addPipeRun(high, 'bunker_pipe_east', 23.72, 3.54, 0, 38, Math.PI / 2, 0x31535f);

  const puddle = basicMaterial('bunker-puddle', {
    color: 0x1d9bc6,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  [
    [-10, -20, 7.8, 2.5, 0.20],
    [13, 20, 6.8, 2.2, -0.24],
    [-20, 10, 5.4, 2.1, 0.46],
    [20, -9, 5.8, 2.2, -0.35]
  ].forEach(([x, z, w, d, rotation], index) => {
    addVisualBox(high, `bunker_puddle_${index}`, x, 0.041, z, w, 0.015, d, puddle, { rotationY: rotation });
  });
}

export const GRID_BUNKER_LAYOUT = [
  [1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,2,2,1,1,0,1],
  [1,0,1,3,3,3,3,1,0,1],
  [1,0,2,3,3,3,3,2,0,1],
  [1,0,2,3,3,3,3,2,0,1],
  [1,0,1,3,3,3,3,1,0,1],
  [1,0,1,1,2,2,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1]
];

export function buildGridBunker(context) {
  const {
    scene, mapMeshes, doors, spawnPoints, playerSpawnPoints,
    lockedSpawnPoints, wallTex, spawnBlock,
    tileSize = 6, wallHeight = 4.5
  } = context;

  const gridRows = GRID_BUNKER_LAYOUT.length;
  const gridCols = GRID_BUNKER_LAYOUT[0].length;
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x16212a,
    map: createBunkerFloorTexture(),
    roughness: 0.54,
    metalness: 0.12,
    clearcoat: 0.42,
    clearcoatRoughness: 0.36
  });
  const floorMesh = createMapFloor(
    { scene, mapMeshes },
    {
      width: gridCols * tileSize,
      depth: gridRows * tileSize,
      material: floorMaterial,
      supportTag: 'grid_bunker_floor'
    }
  );
  floorMesh.name = 'grid_bunker_floor';
  floorMesh.receiveShadow = true;
  floorMesh.userData.artPatch = ART_PATCH;

  playerSpawnPoints.push(
    new THREE.Vector3(-21, 0, 21),
    new THREE.Vector3(21, 0, 21),
    new THREE.Vector3(-21, 0, -21),
    new THREE.Vector3(21, 0, -21)
  );

  const isReservedPlayerStart = (point) => playerSpawnPoints.some((start) => (
    Math.hypot(start.x - point.x, start.z - point.z) < 0.55
  ));

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const tile = GRID_BUNKER_LAYOUT[row][col];
      const { x: posX, z: posZ } = gridTileToWorld(row, col, gridRows, gridCols, tileSize);

      if (tile === 0 || tile === 3) {
        const point = new THREE.Vector3(posX, 0, posZ);
        if (tile === 0 && !isReservedPlayerStart(point)) spawnPoints.push(point);
        if (tile === 3) lockedSpawnPoints.push(point);
      }

      if (tile === 1 || tile === 2) {
        const isDoor = tile === 2;
        const wallObj = spawnBlock(
          tileSize, wallHeight, tileSize,
          posX, wallHeight / 2, posZ,
          isDoor ? null : wallTex,
          true,
          isDoor
        );
        if (isDoor) doors.push(wallObj);
      }
    }
  }

  addGridBunkerDressing(context, tileSize, wallHeight);

  return {
    floorMesh,
    rows: gridRows,
    cols: gridCols,
    width: gridCols * tileSize,
    depth: gridRows * tileSize,
    navigationCellSize: Math.max(2.0, tileSize * 0.5)
  };
}
