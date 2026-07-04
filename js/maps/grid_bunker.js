// js/maps/grid_bunker.js
// Grid Bunker map builder.
// Tile meanings:
// 0 = open zombie spawn
// 1 = solid wall
// 2 = buyable door / energy gate
// 3 = locked zombie spawn, unlocked after door purchase

import * as THREE from 'three';
function addGridDressingBox(context, name, x, y, z, w, h, d, color, options = {}) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);

  if (options.rotationY) mesh.rotation.y = options.rotationY;
  if (options.rotationZ) mesh.rotation.z = options.rotationZ;

  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.isMapDressing = true;
  mesh.userData.noCollision = true;

  context.scene.add(mesh);
  context.mapMeshes.push(mesh);

  return mesh;
}

function addGridBunkerDressing(context) {
  // Cold bunker ceiling light strips.
  addGridDressingBox(context, 'bunker_light_north', 0, 3.25, -21, 16, 0.08, 0.12, 0x66ccff);
  addGridDressingBox(context, 'bunker_light_south', 0, 3.25, 21, 16, 0.08, 0.12, 0x66ccff);
  addGridDressingBox(context, 'bunker_light_west', -21, 3.25, 0, 0.12, 0.08, 16, 0x66ccff);
  addGridDressingBox(context, 'bunker_light_east', 21, 3.25, 0, 0.12, 0.08, 16, 0x66ccff);

  // Subtle floor grime plates.
  addGridDressingBox(context, 'bunker_grime_a', -12, 0.035, -12, 5.0, 0.025, 3.2, 0x111820, { opacity: 0.55, rotationY: 0.25 });
  addGridDressingBox(context, 'bunker_grime_b', 12, 0.035, 12, 4.6, 0.025, 3.6, 0x10151a, { opacity: 0.50, rotationY: -0.35 });
  addGridDressingBox(context, 'bunker_grime_c', -15, 0.035, 15, 3.8, 0.025, 2.8, 0x121a22, { opacity: 0.45, rotationY: 0.75 });
  addGridDressingBox(context, 'bunker_grime_d', 15, 0.035, -15, 4.2, 0.025, 2.6, 0x0f151c, { opacity: 0.45, rotationY: -0.65 });

  // Warning panels on wall surfaces.
  addGridDressingBox(context, 'bunker_warning_panel_west', -27.08, 1.65, -6, 0.06, 0.75, 1.25, 0xffaa00);
  addGridDressingBox(context, 'bunker_warning_panel_east', 27.08, 1.65, 6, 0.06, 0.75, 1.25, 0xffaa00);
  addGridDressingBox(context, 'bunker_warning_panel_north', -6, 1.65, -27.08, 1.25, 0.75, 0.06, 0xffaa00);
  addGridDressingBox(context, 'bunker_warning_panel_south', 6, 1.65, 27.08, 1.25, 0.75, 0.06, 0xffaa00);

  // Dark accent trims.
  addGridDressingBox(context, 'bunker_trim_north', 0, 2.75, -27.1, 28, 0.08, 0.05, 0x0a0d11);
  addGridDressingBox(context, 'bunker_trim_south', 0, 2.75, 27.1, 28, 0.08, 0.05, 0x0a0d11);
  addGridDressingBox(context, 'bunker_trim_west', -27.1, 2.75, 0, 0.05, 0.08, 28, 0x0a0d11);
  addGridDressingBox(context, 'bunker_trim_east', 27.1, 2.75, 0, 0.05, 0.08, 28, 0x0a0d11);
}
import { createMapFloor, gridTileToWorld } from './map_helpers.js';

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
    scene,
    mapMeshes,
    doors,
	spawnPoints,
	playerSpawnPoints,
	lockedSpawnPoints,
	floorTex,
    wallTex,
    spawnBlock,
    tileSize = 6,
    wallHeight = 4.5
  } = context;

  const gridRows = GRID_BUNKER_LAYOUT.length;
  const gridCols = GRID_BUNKER_LAYOUT[0].length;

  // Position math is handled by gridTileToWorld().

  const floorMaterial = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.9,
    metalness: 0.1
  });

  const floorMesh = createMapFloor(
    {
      scene,
      mapMeshes
    },
    {
      width: gridCols * tileSize,
      depth: gridRows * tileSize,
      material: floorMaterial
    }
  );

  // Dedicated player start points.
  // These are separate from zombie spawn candidates.
    playerSpawnPoints.push(
    new THREE.Vector3(-21, 0, 21),
    new THREE.Vector3(21, 0, 21),
    new THREE.Vector3(-21, 0, -21),
    new THREE.Vector3(21, 0, -21)
  );
  
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const tile = GRID_BUNKER_LAYOUT[row][col];

      const { x: posX, z: posZ } = gridTileToWorld(
        row,
        col,
        gridRows,
        gridCols,
        tileSize
      );

      if (tile === 0 || tile === 3) {
        const pt = new THREE.Vector3(posX, 0, posZ);

        if (tile === 0) spawnPoints.push(pt);
        if (tile === 3) lockedSpawnPoints.push(pt);
      }

      if (tile === 1 || tile === 2) {
        const isDoor = tile === 2;

        const wallObj = spawnBlock(
          tileSize,
          wallHeight,
          tileSize,
          posX,
          wallHeight / 2,
          posZ,
          isDoor ? null : wallTex,
          true,
          isDoor
        );

        if (isDoor) doors.push(wallObj);
      }
    }
  }

  addGridBunkerDressing(context);

  return {
    floorMesh,
    rows: gridRows,
    cols: gridCols
  };
}