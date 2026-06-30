export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a11, 0.025); // Moody dark fog
export const doors = [];
export const spawnPoints = [];
export const lockedSpawnPoints = [];

export function openDoor(doorObj) {
  scene.remove(doorObj.mesh);
  // Remove collision and physical rendering data
  const mIdx = mapMeshes.indexOf(doorObj.mesh); if (mIdx > -1) mapMeshes.splice(mIdx, 1);
  const dIdx = doors.indexOf(doorObj); if (dIdx > -1) doors.splice(dIdx, 1);
  const wIdx = walls.indexOf(doorObj); if (wIdx > -1) walls.splice(wIdx, 1);
  // ── NEW: Unlock all the inner vault spawn points! ──
  if (lockedSpawnPoints.length > 0) {
    spawnPoints.push(...lockedSpawnPoints);
    lockedSpawnPoints.length = 0; // Empty it so it only triggers once per match
  }
}

export const camera = new THREE.PerspectiveCamera(82, window.innerWidth / window.innerHeight, 0.1, 100);
export const muzzleLight = new THREE.PointLight(0xffaa00, 0, 15);
scene.add(camera);
camera.add(muzzleLight);

// Inside js/map.js - Update your renderer and window resize block:
const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// ── NEW: POST-PROCESSING BLOOM ENGINE ──
export const composer = new THREE.EffectComposer(renderer);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

// Inside js/map.js - Update your bloomPass:
const bloomPass = new THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8,  // Strength (Lowered from 1.8 to reduce the blinding glare)
  0.4,  // Radius
  0.85  // Threshold (Raised from 0.2! Now ONLY pure neon colors will glow)
);
composer.addPass(bloomPass);
// ───────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight); // Keep filters scaled!
});

export const mapMeshes = [];
export const walls = [];

// ── ENVIRONMENT LIGHTING ──
const ambLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambLight);
const dirLight = new THREE.DirectionalLight(0xaaccff, 0.4);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// ── MAP LAYOUT GRIDS (1 = Wall, 0 = Floor) ──
const MAP_LAYOUTS = [
  {
    // MAP 0: The Bunker (0 = Safe Start, 3 = Locked Vault Floor)
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,2,2,1,1,0,1],
      [1,0,1,3,3,3,3,1,0,1], // ◄── Replaced inner 0s with 3s!
      [1,0,2,3,3,3,3,2,0,1],
      [1,0,2,3,3,3,3,2,0,1],
      [1,0,1,3,3,3,3,1,0,1],
      [1,0,1,1,2,2,1,1,0,1],
      [1,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1]
    ]
  },
  {
    // MAP 1: The Courtyard (0 = Safe Start, 3 = Locked Vault Floor)
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,1,0,0,0,0,0,0,1,1],
      [1,0,0,0,1,1,0,0,0,1],
      [1,0,0,0,2,2,0,0,0,1],
      [1,0,1,2,3,3,2,1,0,1], // ◄── Replaced inner 0s with 3s!
      [1,0,1,2,3,3,2,1,0,1],
      [1,0,0,0,2,2,0,0,0,1],
      [1,0,0,0,1,1,0,0,0,1],
      [1,1,0,0,0,0,0,0,1,1],
      [1,1,1,1,1,1,1,1,1,1]
    ]
  }
];

// ── THE GENERATOR ──
const TILE_SIZE = 6; 
const WALL_HEIGHT = 4.5;
let floorMesh = null;

// Procedural Texture Generator (Creates a gritty, speckled concrete look)
function createGrungeTexture(size, baseColor, speckleColor) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Fill base color
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  
  // Add noise/speckles
  for (let i = 0; i < size * size * 0.15; i++) {
    ctx.fillStyle = speckleColor;
    ctx.globalAlpha = Math.random() * 0.5;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4); // Tile the texture
  return tex;
}

// Generate the textures once
const floorTex = createGrungeTexture(512, '#2a2a35', '#111118');
const wallTex = createGrungeTexture(512, '#3a3a4a', '#1a1a25');

export function buildMap(mapIndex) {
  mapMeshes.forEach(m => scene.remove(m));
  mapMeshes.length = 0; walls.length = 0; doors.length = 0;
  if (floorMesh) scene.remove(floorMesh);

  const mapData = MAP_LAYOUTS[mapIndex].grid;
  const gridRows = mapData.length; const gridCols = mapData[0].length;
  const offsetX = (gridCols * TILE_SIZE) / 2; const offsetZ = (gridRows * TILE_SIZE) / 2;

  // ── TEXTURED FLOOR ──
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.1 });
  const floorGeo = new THREE.PlaneGeometry(gridCols * TILE_SIZE, gridRows * TILE_SIZE);
  floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  scene.add(floorMesh); mapMeshes.push(floorMesh);

  // ── TEXTURED WALLS & DOORS ──
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xaa2200, transparent: true, opacity: 0.85 }); 
  const wallGeo = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE);

spawnPoints.length = 0;
lockedSpawnPoints.length = 0;

for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const tile = mapData[row][col];
      const posX = (col * TILE_SIZE) - offsetX + (TILE_SIZE / 2);
      const posZ = (row * TILE_SIZE) - offsetZ + (TILE_SIZE / 2);

      // ── SEPARATE SAFE SPAWNS FROM VAULT SPAWNS ──
      if (tile === 0 || tile === 3) {
        const pt = new THREE.Vector3(posX, 0, posZ);
        if (tile === 0) spawnPoints.push(pt);
        if (tile === 3) lockedSpawnPoints.push(pt);
      } 
      else if (tile === 1 || tile === 2) {
        const isDoor = (tile === 2);
        const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 });
        const doorMat = new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xaa2200, transparent: true, opacity: 0.85 }); 
        
        const wall = new THREE.Mesh(wallGeo, isDoor ? doorMat : wallMat);
        wall.position.set(posX, WALL_HEIGHT / 2, posZ);
        scene.add(wall); mapMeshes.push(wall);

        const wallObj = { minX: posX - TILE_SIZE / 2, maxX: posX + TILE_SIZE / 2, minZ: posZ - TILE_SIZE / 2, maxZ: posZ + TILE_SIZE / 2, isDoor: isDoor, mesh: wall, pos: new THREE.Vector3(posX, 0, posZ) };
        walls.push(wallObj);
        if (isDoor) doors.push(wallObj);
      }
    }
  }
}
// ── SCREEN SHAKE ENGINE ──
export let shakeIntensity = 0;

export function addScreenShake(amount) {
  // Add to the current shake, but cap it so the camera doesn't flip upside down!
  shakeIntensity = Math.min(shakeIntensity + amount, 0.5); 
}

export function applyScreenShake(dt) {
  if (shakeIntensity > 0) {
    // Apply violent random offsets to the camera's physical position
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity;
    camera.position.z += (Math.random() - 0.5) * shakeIntensity;
    camera.rotation.z = (Math.random() - 0.5) * shakeIntensity * 0.3; // Adds a disorienting head-tilt
    
    // Rapidly cool down the shake effect
    shakeIntensity -= dt * 2.5; 
    if (shakeIntensity <= 0) {
      shakeIntensity = 0;
      camera.rotation.z = 0; // Snap the head-tilt back to normal
    }
  }
}