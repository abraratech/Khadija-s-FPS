// js/map.js
import * as THREE from 'three';
import { MAP_IDS, getMapMeta, normalizeMapId } from './maps/map_registry.js';
import { buildGridBunker } from './maps/grid_bunker.js';
import { buildIndustrialYard } from './maps/industrial_yard.js';
import { createMapBlock } from './maps/map_helpers.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0a11, 0.025); // Moody dark fog

export const doors = [];
export const spawnPoints = []; // Zombie spawn candidates
export const playerSpawnPoints = []; // Player start candidates
export const lockedSpawnPoints = [];
export const barricades = [];
export const traps = [];
export const mapMeshes = [];
export const walls = []; // Holds bounding metrics for mathematical pushOut collisions

export let currentMap = 0; // Legacy numeric compatibility.
export let currentMapId = MAP_IDS.GRID_BUNKER;
export let currentMapMeta = getMapMeta(MAP_IDS.GRID_BUNKER);

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

// Camera configuration with extended far clip plane to prevent disappearing floors
export const camera = new THREE.PerspectiveCamera(82, window.innerWidth / window.innerHeight, 0.1, 1000);
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

// ── ENVIRONMENT LIGHTING ──
export const ambLight = new THREE.AmbientLight(0xffffff, 1.85); 
scene.add(ambLight);
export const dirLight = new THREE.DirectionalLight(0xbbeeff, 1.2); 
dirLight.position.set(20, 40, -20);
scene.add(dirLight);

export function toggleSwarmLighting(isSwarm) {
  if (isSwarm) {
    scene.fog.color.setHex(0x220000); // Deep blood red fog
    ambLight.color.setHex(0xffaaaa);  // Reddish ambient map glow
    dirLight.color.setHex(0xff0000);  // Pure red moonlight cast
  } else {
    scene.fog.color.setHex(0x0a0a11); // Revert to moody dark fog
    ambLight.color.setHex(0xffffff);  // Revert ambient
    dirLight.color.setHex(0xbbeeff);  // Revert blue moonlight
  }
}

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

// Grid Bunker layout has moved to js/maps/grid_bunker.js
// Compatibility wrapper.
// Actual block creation now lives in js/maps/map_helpers.js.
function spawnBlock(w, h, d, x, y, z, colorOrMap, isWall = true, isDoor = false) {
  return createMapBlock(
    {
      scene,
      mapMeshes,
      walls
    },
    {
      w,
      h,
      d,
      x,
      y,
      z,
      colorOrMap,
      isWall,
      isDoor
    }
  );
}

// ── PROCEDURAL BARRICADE GENERATOR ──
export function spawnBarricade(x, z, rotY) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);

  const plankGroup = new THREE.Group();
  group.add(plankGroup);

  const barricadeObj = {
    pos: new THREE.Vector3(x, 0, z),
    rotY: rotY,
    maxPlanks: 5,
    currentPlanks: 5,
    planks: [], 
    group: group,
    plankGroup: plankGroup,
    cooldown: 0,
    wallTracker: null // Dynamic collision box reference
  };

  // Build 5 haphazardly stacked wooden planks
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4720, roughness: 0.9 }); 
  for (let i = 0; i < 5; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 0.15), woodMat);
    plank.position.set(0, 0.4 + i * 0.45, 0);
    plank.rotation.z = (Math.random() - 0.5) * 0.12; // Slight janky angle tilt
    plankGroup.add(plank);
    barricadeObj.planks.push(plank);
  }

  // Generate mathematical collision bounds based on orientation (North-South vs East-West)
  const isParallelToX = Math.abs(Math.sin(rotY)) > 0.5;
  const w = isParallelToX ? 1.0 : 4.2;
  const d = isParallelToX ? 4.2 : 1.0;

  barricadeObj.wallTracker = {
    minX: x - w / 2, maxX: x + w / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
    isBarricade: true,
    ref: barricadeObj
  };

  walls.push(barricadeObj.wallTracker);
  barricades.push(barricadeObj);
}

// ── PROCEDURAL ELECTRIC TRAP GENERATOR ──
export function spawnTrap(x, z, width, isZAxis = false) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3), poleMat);
  const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3), poleMat);

  if (isZAxis) { p1.position.z = -width/2; p2.position.z = width/2; }
  else { p1.position.x = -width/2; p2.position.x = width/2; }
  p1.position.y = 1.5; p2.position.y = 1.5;
  group.add(p1, p2);

  const switchMat = new THREE.MeshStandardMaterial({ color: 0xaa0000 });
  const switchBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), switchMat);
  switchBox.position.copy(p1.position); switchBox.position.y = 1.0;
  group.add(switchBox);

  const fieldGeo = isZAxis ? new THREE.BoxGeometry(0.5, 3, width) : new THREE.BoxGeometry(width, 3, 0.5);
  const fieldMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4, wireframe: true });
  const field = new THREE.Mesh(fieldGeo, fieldMat);
  field.position.y = 1.5; field.visible = false;
  group.add(field);

  const trapObj = { 
    pos: p1.position.clone().add(group.position).setY(0), // Interaction point
    center: new THREE.Vector3(x, 0, z), width: width, isZAxis: isZAxis, 
    group: group, field: field, switchMesh: switchBox, 
    state: 'READY', timer: 0 
  };
  traps.push(trapObj);
}

const MAP_BUILDERS = {
  [MAP_IDS.GRID_BUNKER]: buildGridBunker,
  [MAP_IDS.INDUSTRIAL_YARD]: buildIndustrialYard
};

export function buildMap(mapId = MAP_IDS.GRID_BUNKER) {
  const requestedMapId = normalizeMapId(mapId);
  const requestedMeta = getMapMeta(requestedMapId);
  const requestedBuilder = MAP_BUILDERS[requestedMapId];

  if (!requestedMeta.playable || !requestedBuilder) {
    console.warn(`Map "${requestedMapId}" is not buildable yet. Falling back to "${MAP_IDS.GRID_BUNKER}".`);
    currentMapId = MAP_IDS.GRID_BUNKER;
  } else {
    currentMapId = requestedMapId;
  }

  currentMapMeta = getMapMeta(currentMapId);
  currentMap = currentMapMeta.legacyIndex ?? 0;

  // Reset active scene elements
  barricades.forEach(b => scene.remove(b.group));
  barricades.length = 0;

  traps.forEach(t => scene.remove(t.group));
  traps.length = 0;

  mapMeshes.forEach(m => scene.remove(m));
  mapMeshes.length = 0;

	walls.length = 0;
	doors.length = 0;
	spawnPoints.length = 0;
	playerSpawnPoints.length = 0;
	lockedSpawnPoints.length = 0;

  if (floorMesh) {
    scene.remove(floorMesh);
    floorMesh = null;
  }

  const builder = MAP_BUILDERS[currentMapId] || MAP_BUILDERS[MAP_IDS.GRID_BUNKER];
	const result = builder({
	  scene,
	  mapMeshes,
	  walls,
	  doors,
	  spawnPoints,
	  playerSpawnPoints,
	  lockedSpawnPoints,
	  floorTex,
	  wallTex,
	  spawnBlock,
	  spawnBarricade,
	  spawnTrap,
	  tileSize: TILE_SIZE,
	  wallHeight: WALL_HEIGHT
	});

  floorMesh = result?.floorMesh || null;
}
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