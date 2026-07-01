// js/map.js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a11, 0.025); // Moody dark fog

export const doors = [];
export const spawnPoints = [];
export const lockedSpawnPoints = [];

export function openDoor(doorObj) {
  scene.remove(doorObj.mesh);
  
  // Remove collision and physical rendering data cleanly
  const mIdx = mapMeshes.indexOf(doorObj.mesh); if (mIdx > -1) mapMeshes.splice(mIdx, 1);
  const dIdx = doors.indexOf(doorObj); if (dIdx > -1) doors.splice(dIdx, 1);
  const wIdx = walls.indexOf(doorObj); if (wIdx > -1) walls.splice(wIdx, 1);
  
  // Unlock all the inner vault spawn points dynamically
  if (lockedSpawnPoints.length > 0) {
    spawnPoints.push(...lockedSpawnPoints);
    lockedSpawnPoints.length = 0; // Empty so it only triggers once per match
  }
}

export const camera = new THREE.PerspectiveCamera(82, window.innerWidth / window.innerHeight, 0.1, 100);
export const muzzleLight = new THREE.PointLight(0xffaa00, 0, 15);
scene.add(camera);
camera.add(muzzleLight);

const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// ── POST-PROCESSING BLOOM ENGINE ──
export const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8,  // Strength
  0.4,  // Radius
  0.85  // Threshold (Only neon light passes flash)
);
composer.addPass(bloomPass);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight); 
});

export const mapMeshes = [];
export const walls = []; // Holds bounding metrics for mathematical pushOut collisions

// ── ENVIRONMENT LIGHTING ──
const ambLight = new THREE.AmbientLight(0xffffff, 1.85); // Boosted base illumination
scene.add(ambLight);
const dirLight = new THREE.DirectionalLight(0xbbeeff, 1.2); // Blue moonlight cast
dirLight.position.set(20, 40, -20);
scene.add(dirLight);

// ── GRITTY TEXTURE SYSTEM ──
function createGrungeTexture(size, baseColor, speckleColor) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  
  for (let i = 0; i < size * size * 0.15; i++) {
    ctx.fillStyle = speckleColor;
    ctx.globalAlpha = Math.random() * 0.5;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

const floorTex = createGrungeTexture(512, '#2a2a35', '#111118');
const wallTex = createGrungeTexture(512, '#3a3a4a', '#1a1a25');

const TILE_SIZE = 6; 
const WALL_HEIGHT = 4.5;
let floorMesh = null;

// ── MAP REGISTRY INDEX LAYOUTS ──
const MAP_LAYOUTS = [
  {
    // MAP 0: The Grid Bunker
    grid: [
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
    ]
  },
  {
    // MAP 1: The Grid Courtyard
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,1,0,0,0,0,0,0,1,1],
      [1,0,0,0,1,1,0,0,0,1],
      [1,0,0,0,2,2,0,0,0,1],
      [1,0,1,2,3,3,2,1,0,1], 
      [1,0,1,2,3,3,2,1,0,1],
      [1,0,0,0,2,2,0,0,0,1],
      [1,0,0,0,1,1,0,0,0,1],
      [1,1,0,0,0,0,0,0,1,1],
      [1,1,1,1,1,1,1,1,1,1]
    ]
  }
];

// Helper to spawn blocks and log their metrics directly into the AABB tracker array
function spawnBlock(w, h, d, x, y, z, colorOrMap, isWall = true, isDoor = false) {
  const geo = new THREE.BoxGeometry(w, h, d);
  let mat;
  if (colorOrMap instanceof THREE.Texture) {
    mat = new THREE.MeshStandardMaterial({ map: colorOrMap, roughness: 0.8 });
  } else if (isDoor) {
    mat = new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xaa2200, transparent: true, opacity: 0.85 });
  } else {
    mat = new THREE.MeshStandardMaterial({ color: colorOrMap, roughness: 0.7 });
  }
  
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  mapMeshes.push(mesh);

  const blockObj = {
    minX: x - w / 2, maxX: x + w / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
    isDoor: isDoor,
    mesh: mesh,
    pos: new THREE.Vector3(x, 0, z)
  };

  if (isWall) {
    walls.push(blockObj);
  }
  return blockObj;
}

export function buildMap(mapIndex) {
  // Reset active scene elements
  mapMeshes.forEach(m => scene.remove(m));
  mapMeshes.length = 0;
  walls.length = 0;
  doors.length = 0;
  spawnPoints.length = 0;
  lockedSpawnPoints.length = 0;
  if (floorMesh) scene.remove(floorMesh);

  // ── CORE GENERATION DISTRIBUTOR ──
  if (mapIndex === 0 || mapIndex === 1) {
    // GENERATE FROM ORIGINAL ARRAY GRIDS
    const mapData = MAP_LAYOUTS[mapIndex].grid;
    const gridRows = mapData.length; const gridCols = mapData[0].length;
    const offsetX = (gridCols * TILE_SIZE) / 2; const offsetZ = (gridRows * TILE_SIZE) / 2;

    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.1 });
    const floorGeo = new THREE.PlaneGeometry(gridCols * TILE_SIZE, gridRows * TILE_SIZE);
    floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    scene.add(floorMesh); mapMeshes.push(floorMesh);

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const tile = mapData[row][col];
        const posX = (col * TILE_SIZE) - offsetX + (TILE_SIZE / 2);
        const posZ = (row * TILE_SIZE) - offsetZ + (TILE_SIZE / 2);

        if (tile === 0 || tile === 3) {
          const pt = new THREE.Vector3(posX, 0, posZ);
          if (tile === 0) spawnPoints.push(pt);
          if (tile === 3) lockedSpawnPoints.push(pt);
        } 
        else if (tile === 1 || tile === 2) {
          const isDoor = (tile === 2);
          const wallObj = spawnBlock(TILE_SIZE, WALL_HEIGHT, TILE_SIZE, posX, WALL_HEIGHT / 2, posZ, isDoor ? null : wallTex, true, isDoor);
          if (isDoor) doors.push(wallObj);
        }
      }
    }
  } 
  else {
    // GENERATE OPEN PROC-CONTAINERS (MAPS 2, 3, AND 4)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    mapMeshes.push(floor);

    if (mapIndex === 2) {
      // MAP 2: The Sandbox Arena
      spawnBlock(40, 6, 2, 0, 3, -20, wallTex); 
      spawnBlock(40, 6, 2, 0, 3, 20, wallTex);  
      spawnBlock(2, 6, 40, -20, 3, 0, wallTex); 
      spawnBlock(2, 6, 40, 20, 3, 0, wallTex);  

      spawnBlock(3, 2, 6, -8, 1, -5, 0x334455);
      spawnBlock(4, 3, 4, 10, 1.5, 8, 0x443322);
      spawnBlock(8, 2, 2, 0, 1, 10, 0x223322);

      spawnPoints.push(new THREE.Vector3(0, 0, -15), new THREE.Vector3(-15, 0, 15), new THREE.Vector3(15, 0, 15));
    } 
    else if (mapIndex === 3) {
      // MAP 3: The Red Courtyard
      spawnBlock(50, 4, 2, 0, 2, -25, wallTex);
      spawnBlock(50, 4, 2, 0, 2, 25, wallTex);
      spawnBlock(2, 4, 50, -25, 2, 0, wallTex);
      spawnBlock(2, 4, 50, 25, 2, 0, wallTex);

      spawnBlock(6, 4, 6, 0, 2, 0, 0x111111); // Central Monolith

      spawnPoints.push(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 0, -20), new THREE.Vector3(-20, 0, 20), new THREE.Vector3(20, 0, 20));
    } 
    else if (mapIndex === 4) {
      // MAP 4: Massive Multistory Warehouse
      spawnBlock(70, 16, 2, 0, 8, -35, wallTex); 
      spawnBlock(70, 16, 2, 0, 8, 35, wallTex);  
      spawnBlock(2, 16, 70, -35, 8, 0, wallTex); 
      spawnBlock(2, 16, 70, 35, 8, 0, wallTex);  

      // Second Floor Balcony (Walkable floor surface)
      spawnBlock(70, 1, 15, 0, 6, -27.5, 0x2a2a35, false);

      spawnBlock(4, 16, 4, -20, 8, -15, 0x333344);
      spawnBlock(4, 16, 4, 20, 8, -15, 0x333344);

      // The Staircase steps
      for (let i = 0; i < 12; i++) {
        spawnBlock(6, 0.5 * (i + 1), 2, 0, (0.5 * (i + 1)) / 2, -10 - (i * 1.2), 0x444455);
      }

      spawnBlock(8, 4, 8, -15, 2, 10, 0x554433);
      spawnBlock(12, 6, 4, 10, 3, 20, 0x554433);
      spawnBlock(4, 2, 4, 15, 1, 12, 0x335533); 

      spawnPoints.push(new THREE.Vector3(-25, 0, 25), new THREE.Vector3(25, 0, 25), new THREE.Vector3(0, 7, -30));
    }
  }
}

// ── SCREEN SHAKE ENGINE ──
export let shakeIntensity = 0;
export function addScreenShake(amount) { shakeIntensity = Math.min(shakeIntensity + amount, 0.5); }
export function applyScreenShake(dt) {
  if (shakeIntensity > 0) {
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity;
    camera.position.z += (Math.random() - 0.5) * shakeIntensity;
    camera.rotation.z = (Math.random() - 0.5) * shakeIntensity * 0.3; 
    shakeIntensity -= dt * 2.5; 
    if (shakeIntensity <= 0) { shakeIntensity = 0; camera.rotation.z = 0; }
  }
}