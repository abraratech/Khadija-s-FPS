// js/maps/grid_bunker.js
// Grid Bunker map builder.
// Tile meanings:
// 0 = open zombie spawn
// 1 = solid wall
// 2 = buyable door / energy gate
// 3 = locked zombie spawn, unlocked after door purchase

import * as THREE from 'three';
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

  return {
    floorMesh,
    rows: gridRows,
    cols: gridCols
  };
}