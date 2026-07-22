// js/maps/map_helpers.js
// Shared map-building helpers.
// C10.6 adds explicit player-support metadata so authored climbable surfaces
// can be distinguished from walls, fixtures, signs, and decorative geometry.

import * as THREE from 'three';
import {
  QUALITY2_FEATURES,
  getQuality2MaterialTier,
  isQuality2FeatureEnabled
} from '../quality2_core.js';


function getQuality2MapMaterialTier() {
  let effective = 'medium';
  try {
    effective = String(window.KAGetGraphicsPerformanceSnapshot?.().startupQuality || window.KAGetEffectiveGraphicsQuality?.() || localStorage.getItem('ka_graphics_quality') || 'medium');
  } catch {
    effective = 'medium';
  }
  const enabled = isQuality2FeatureEnabled(globalThis.localStorage, QUALITY2_FEATURES.MATERIAL_TIER);
  return getQuality2MaterialTier(effective, enabled);
}

function createQuality2MapMaterial(options = {}) {
  if (getQuality2MapMaterialTier() !== 'lambert') {
    const material = new THREE.MeshStandardMaterial(options);
    material.userData.quality2MaterialTier = 'standard';
    return material;
  }

  const material = new THREE.MeshLambertMaterial({
    color: options.color,
    map: options.map || null,
    emissive: options.emissive,
    emissiveIntensity: options.emissiveIntensity,
    transparent: options.transparent === true,
    opacity: options.opacity ?? 1,
    side: options.side,
    alphaTest: options.alphaTest,
    depthWrite: options.depthWrite,
    vertexColors: options.vertexColors
  });
  material.userData.quality2MaterialTier = 'lambert';
  return material;
}

function convertQuality2FloorMaterial(material) {
  if (!material || getQuality2MapMaterialTier() !== 'lambert' || !material.isMeshStandardMaterial) {
    if (material?.userData) material.userData.quality2MaterialTier = material?.isMeshStandardMaterial ? 'standard' : 'authored';
    return material;
  }

  const replacement = new THREE.MeshLambertMaterial({
    color: material.color?.clone?.() || 0xffffff,
    map: material.map || null,
    emissive: material.emissive?.clone?.() || 0x000000,
    emissiveIntensity: material.emissiveIntensity ?? 1,
    transparent: material.transparent === true,
    opacity: material.opacity ?? 1,
    side: material.side,
    alphaTest: material.alphaTest,
    depthWrite: material.depthWrite,
    vertexColors: material.vertexColors
  });
  replacement.name = material.name;
  replacement.userData.quality2MaterialTier = 'lambert';
  return replacement;
}

export function gridTileToWorld(row, col, gridRows, gridCols, tileSize) {
  const offsetX = (gridCols * tileSize) / 2;
  const offsetZ = (gridRows * tileSize) / 2;

  return {
    x: (col * tileSize) - offsetX + (tileSize / 2),

    // Corrected front/back orientation.
    z: ((gridRows - 1 - row) * tileSize) - offsetZ + (tileSize / 2)
  };
}

export function createMapFloor(context, options) {
  const {
    scene,
    mapMeshes
  } = context;

  const {
    width,
    depth,
    material,
    supportTag = 'floor'
  } = options;

  const floorGeo = new THREE.PlaneGeometry(width, depth);
  const floorMaterial = convertQuality2FloorMaterial(material);
  const floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
  floorMesh.userData.quality2MaterialTier = floorMaterial?.userData?.quality2MaterialTier || 'authored';

  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.frustumCulled = false;
  floorMesh.userData.playerClimbable = true;
  floorMesh.userData.playerNonWalkable = false;
  floorMesh.userData.supportTag = supportTag;

  scene.add(floorMesh);
  mapMeshes.push(floorMesh);

  return floorMesh;
}

export function createMapBlock(context, options) {
  const {
    scene,
    mapMeshes,
    walls
  } = context;

  const {
    w,
    h,
    d,
    x,
    y,
    z,
    colorOrMap,
    isWall = true,
    isDoor = false,
    playerClimbable = false,
    playerNonWalkable = false,
    supportTag = isDoor ? 'door' : 'block'
  } = options;

  const geo = new THREE.BoxGeometry(w, h, d);

  let mat;

  if (isDoor) {
    mat = createQuality2MapMaterial({
      color: 0xff5500,
      emissive: 0xaa2200,
      transparent: true,
      opacity: 0.85
    });
  } else if (colorOrMap instanceof THREE.Texture) {
    mat = createQuality2MapMaterial({
      map: colorOrMap,
      color: 0xffffff,
      roughness: 0.8
    });
  } else {
    mat = createQuality2MapMaterial({
      color: colorOrMap,
      roughness: 0.7
    });
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.userData.playerClimbable = playerClimbable === true;
  mesh.userData.playerNonWalkable = playerNonWalkable === true || isDoor === true;
  mesh.userData.supportTag = String(supportTag || 'block');
  mesh.userData.quality2MaterialTier = mat?.userData?.quality2MaterialTier || 'authored';

  scene.add(mesh);
  mapMeshes.push(mesh);

  const blockObj = {
    minX: x - w / 2,
    maxX: x + w / 2,
    maxY: y + (h / 2),
    minZ: z - d / 2,
    maxZ: z + d / 2,
    isDoor,
    playerClimbable: mesh.userData.playerClimbable,
    playerNonWalkable: mesh.userData.playerNonWalkable,
    supportTag: mesh.userData.supportTag,
    mesh,
    pos: new THREE.Vector3(x, 0, z)
  };

  if (isWall) {
    walls.push(blockObj);
  }

  return blockObj;
}
