// js/maps/map_helpers.js
// Shared map-building helpers.
// C10.6 adds explicit player-support metadata so authored climbable surfaces
// can be distinguished from walls, fixtures, signs, and decorative geometry.

import * as THREE from 'three';

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
  const floorMesh = new THREE.Mesh(floorGeo, material);

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
    mat = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      emissive: 0xaa2200,
      transparent: true,
      opacity: 0.85
    });
  } else if (colorOrMap instanceof THREE.Texture) {
    mat = new THREE.MeshStandardMaterial({
      map: colorOrMap,
      roughness: 0.8
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: colorOrMap,
      roughness: 0.7
    });
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.userData.playerClimbable = playerClimbable === true;
  mesh.userData.playerNonWalkable = playerNonWalkable === true || isDoor === true;
  mesh.userData.supportTag = String(supportTag || 'block');

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
