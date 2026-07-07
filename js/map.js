// js/map.js
import * as THREE from 'three';
import { MAP_IDS, getMapMeta, normalizeMapId } from './maps/map_registry.js';
import { buildGridBunker } from './maps/grid_bunker.js';
import { buildIndustrialYard } from './maps/industrial_yard.js';
import { buildNeonDepot } from './maps/neon_depot.js';
import { buildParkingGarage } from './maps/parking_garage.js';
import { buildHospitalWing } from './maps/hospital_wing.js';
import { buildReactorCourtyard } from './maps/reactor_courtyard.js';
import { configureMapValidation } from './map_validation.js';
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

// ── MAP ENVIRONMENT PROFILES ──
// Each map can now control its fog, lighting, clear color, and bloom mood.
const MAP_ENVIRONMENTS = {
  [MAP_IDS.GRID_BUNKER]: {
  name: "Grid Bunker - Classic",
  fogColor: 0x07101a,
  fogDensity: 0.024,
  clearColor: 0x03070c,

  ambientColor: 0xc8e4ff,
  ambientIntensity: 1.45,

  dirColor: 0x9ed5ff,
  dirIntensity: 1.25,
  dirPosition: new THREE.Vector3(20, 40, -20),

  bloomStrength: 0.62,
  bloomRadius: 0.32,
  bloomThreshold: 0.88
},

  [MAP_IDS.INDUSTRIAL_YARD]: {
  name: "Industrial Yard - Dust",
  fogColor: 0x241207,
  fogDensity: 0.014,
  clearColor: 0x100604,

  ambientColor: 0xffc08a,
  ambientIntensity: 1.38,

  dirColor: 0xffb15c,
  dirIntensity: 1.15,
  dirPosition: new THREE.Vector3(-18, 36, 22),

  bloomStrength: 0.48,
  bloomRadius: 0.24,
  bloomThreshold: 0.92
  },
  [MAP_IDS.NEON_DEPOT]: {
  name: "Neon Depot - Pulse",
  fogColor: 0x061018,
  fogDensity: 0.018,
  clearColor: 0x03070b,

  ambientColor: 0xb8f4ff,
  ambientIntensity: 1.42,

  dirColor: 0xff77dd,
  dirIntensity: 1.08,
  dirPosition: new THREE.Vector3(-16, 34, 24),

  bloomStrength: 0.64,
  bloomRadius: 0.28,
  bloomThreshold: 0.87
  },

  [MAP_IDS.PARKING_GARAGE]: {
  name: "Parking Garage - Concrete",
  fogColor: 0x0c0f14,
  fogDensity: 0.017,
  clearColor: 0x030405,

  ambientColor: 0xbfc8d4,
  ambientIntensity: 1.28,

  dirColor: 0xffd895,
  dirIntensity: 0.88,
  dirPosition: new THREE.Vector3(18, 32, -20),

  bloomStrength: 0.48,
  bloomRadius: 0.22,
  bloomThreshold: 0.89
  },

  [MAP_IDS.HOSPITAL_WING]: {
  name: "Hospital Wing - Code Red",
  fogColor: 0x050b0b,
  fogDensity: 0.025,
  clearColor: 0x010404,

  ambientColor: 0xc8fff1,
  ambientIntensity: 1.10,

  dirColor: 0x92ffe8,
  dirIntensity: 0.55,
  dirPosition: new THREE.Vector3(-18, 28, 18),

  bloomStrength: 0.56,
  bloomRadius: 0.26,
  bloomThreshold: 0.88
  },

  [MAP_IDS.REACTOR_COURTYARD]: {
  name: "Reactor Courtyard - Coolant Surge",
  fogColor: 0x071116,
  fogDensity: 0.016,
  clearColor: 0x020609,

  ambientColor: 0xbbeeff,
  ambientIntensity: 1.30,

  dirColor: 0xffb060,
  dirIntensity: 1.02,
  dirPosition: new THREE.Vector3(22, 34, -18),

  bloomStrength: 0.60,
  bloomRadius: 0.27,
  bloomThreshold: 0.87
  }
};

const DEFAULT_MAP_ENVIRONMENT = MAP_ENVIRONMENTS[MAP_IDS.GRID_BUNKER];
let activeMapEnvironment = DEFAULT_MAP_ENVIRONMENT;

export function getActiveMapEnvironmentName() {
  return activeMapEnvironment?.name || DEFAULT_MAP_ENVIRONMENT.name;
}

// ── GRAPHICS QUALITY PROFILES ──
// Auto: chooses a safe starting profile, then can downgrade during gameplay if FPS is weak.
// Low: fewer visual extras, lower pixel ratio, no bloom.
// Medium: balanced default.
// High: higher pixel ratio and stronger visual pass.
const GRAPHICS_QUALITY_PROFILES = Object.freeze({
  low: {
    name: "Low",
    pixelRatioCap: 1.0,
    showMapDressing: false,
    fogScale: 0.72,
    bloomEnabled: false,
    bloomStrengthScale: 0.45,
    bloomRadiusScale: 0.70,
    bloomThresholdAdd: 0.08
  },

  medium: {
    name: "Medium",
    pixelRatioCap: 1.35,
    showMapDressing: true,
    fogScale: 1.0,
    bloomEnabled: true,
    bloomStrengthScale: 1.0,
    bloomRadiusScale: 1.0,
    bloomThresholdAdd: 0
  },

  high: {
    name: "High",
    pixelRatioCap: 1.75,
    showMapDressing: true,
    fogScale: 1.08,
    bloomEnabled: true,
    bloomStrengthScale: 1.12,
    bloomRadiusScale: 1.08,
    bloomThresholdAdd: -0.02
  }
});

const GRAPHICS_QUALITY_ORDER = ["auto", "low", "medium", "high"];

let autoResolvedGraphicsQuality = null;
let autoTuneTimer = 0;
let autoTuneCooldown = 0;
let autoFpsStableTimer = 0;
let autoFpsWeakTimer = 0;

function normalizeGraphicsMode(mode) {
  if (mode === "auto") return "auto";
  if (GRAPHICS_QUALITY_PROFILES[mode]) return mode;
  return "auto";
}

function guessAutoGraphicsQuality() {
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const dpr = window.devicePixelRatio || 1;

  // C5 hotfix: the first auto pick was too conservative. A desktop with
  // normal/high CPU capacity should not be locked to Low just because DPR or
  // browser-reported memory looks modest. Start sane, then let FPS promote or
  // demote during play.
  if (isMobileDevice) return "low";

  if (cores <= 4 && memory <= 4 && dpr > 1.6) {
    return "low";
  }

  if (cores >= 8 && memory >= 8 && dpr <= 2.25) {
    return "high";
  }

  if (cores >= 6 || memory >= 4) {
    return "medium";
  }

  return "low";
}

function resolveGraphicsQuality(mode = graphicsQuality) {
  const normalized = normalizeGraphicsMode(mode);

  if (normalized === "auto") {
    if (!autoResolvedGraphicsQuality) {
      autoResolvedGraphicsQuality = guessAutoGraphicsQuality();
    }

    return autoResolvedGraphicsQuality;
  }

  return normalized;
}

function getGraphicsProfile(mode = graphicsQuality) {
  const effectiveMode = resolveGraphicsQuality(mode);
  return GRAPHICS_QUALITY_PROFILES[effectiveMode] || GRAPHICS_QUALITY_PROFILES.medium;
}

export let graphicsQuality = normalizeGraphicsMode(localStorage.getItem("ka_graphics_quality") || "auto");

export function getGraphicsQuality() {
  return graphicsQuality;
}

export function getEffectiveGraphicsQuality() {
  return resolveGraphicsQuality(graphicsQuality);
}

export function getGraphicsQualityLabel() {
  if (graphicsQuality === "auto") {
    return `auto (${resolveGraphicsQuality("auto")})`;
  }

  return graphicsQuality;
}

export function applyGraphicsQuality(mode = graphicsQuality, options = {}) {
  const previousMode = graphicsQuality;
  const nextMode = normalizeGraphicsMode(mode);

  graphicsQuality = nextMode;
  localStorage.setItem("ka_graphics_quality", graphicsQuality);

  if (graphicsQuality === "auto") {
    if (previousMode !== "auto" || options.repickAuto || !autoResolvedGraphicsQuality) {
      autoResolvedGraphicsQuality = guessAutoGraphicsQuality();
      autoTuneTimer = 0;
      autoTuneCooldown = 0;
      autoFpsStableTimer = 0;
      autoFpsWeakTimer = 0;
    }
  } else {
    autoResolvedGraphicsQuality = null;
  }

  const effectiveMode = resolveGraphicsQuality(graphicsQuality);
  const profile = GRAPHICS_QUALITY_PROFILES[effectiveMode] || GRAPHICS_QUALITY_PROFILES.medium;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap));

  if (scene.fog) {
    scene.fog.density = activeMapEnvironment.fogDensity * profile.fogScale;
  }

  if (typeof bloomPass !== "undefined" && bloomPass) {
    bloomPass.enabled = profile.bloomEnabled;
    bloomPass.strength = activeMapEnvironment.bloomStrength * profile.bloomStrengthScale;
    bloomPass.radius = activeMapEnvironment.bloomRadius * profile.bloomRadiusScale;
    bloomPass.threshold = Math.max(
      0,
      Math.min(1, activeMapEnvironment.bloomThreshold + profile.bloomThresholdAdd)
    );
  }

  mapMeshes.forEach((obj) => {
    if (!obj?.userData?.isMapDressing) return;
    obj.visible = profile.showMapDressing;
  });

  if (!options.silent) {
    const label = graphicsQuality === "auto" ? `Auto → ${profile.name}` : profile.name;
    console.log(`Graphics quality: ${label}`);
  }

  return graphicsQuality;
}

export function cycleGraphicsQuality() {
  const currentIndex = GRAPHICS_QUALITY_ORDER.indexOf(graphicsQuality);
  const nextIndex = (currentIndex + 1) % GRAPHICS_QUALITY_ORDER.length;
  return applyGraphicsQuality(GRAPHICS_QUALITY_ORDER[nextIndex]);
}

function getNextHigherGraphicsQuality(mode) {
  if (mode === "low") return "medium";
  if (mode === "medium") return "high";
  return mode;
}

function getNextLowerGraphicsQuality(mode) {
  if (mode === "high") return "medium";
  if (mode === "medium") return "low";
  return mode;
}

function resetAutoFpsTuningTimers() {
  autoFpsStableTimer = 0;
  autoFpsWeakTimer = 0;
}

export function autoTuneGraphicsFromFps(fps, dt = 0) {
  if (graphicsQuality !== "auto") return false;
  if (!Number.isFinite(fps) || dt <= 0) return false;

  autoTuneTimer += dt;
  autoTuneCooldown = Math.max(0, autoTuneCooldown - dt);

  if (autoTuneTimer < 6 || autoTuneCooldown > 0) {
    return false;
  }

  const currentEffective = resolveGraphicsQuality("auto");
  const upgradeThreshold = currentEffective === "low" ? 54 : 58;
  const downgradeThreshold = currentEffective === "high" ? 42 : 34;

  if (fps >= upgradeThreshold) {
    autoFpsStableTimer += dt;
  } else {
    autoFpsStableTimer = Math.max(0, autoFpsStableTimer - dt * 1.5);
  }

  if (fps <= downgradeThreshold) {
    autoFpsWeakTimer += dt;
  } else {
    autoFpsWeakTimer = Math.max(0, autoFpsWeakTimer - dt * 2.0);
  }

  let nextEffective = currentEffective;

  // Downgrade quickly when FPS is clearly weak, but allow Auto to recover upward
  // when performance stays healthy. This fixes Auto getting stuck on Low.
  if (autoFpsWeakTimer >= 2.5) {
    nextEffective = getNextLowerGraphicsQuality(currentEffective);
  } else if (autoFpsStableTimer >= (currentEffective === "low" ? 8 : 14)) {
    nextEffective = getNextHigherGraphicsQuality(currentEffective);
  }

  if (nextEffective === currentEffective) {
    return false;
  }

  autoResolvedGraphicsQuality = nextEffective;
  autoTuneTimer = 0;
  autoTuneCooldown = nextEffective === "high" ? 18 : 12;
  resetAutoFpsTuningTimers();

  applyGraphicsQuality("auto", { silent: true });
  console.log(`Auto graphics adjusted to: ${nextEffective} at ${Math.round(fps)} FPS`);

  return true;
}

// Dev console helpers.
window.KASetGraphicsQuality = applyGraphicsQuality;
window.KAGetGraphicsQuality = getGraphicsQuality;
window.KAGetEffectiveGraphicsQuality = getEffectiveGraphicsQuality;
window.KARecheckGraphicsQuality = () => applyGraphicsQuality("auto", { repickAuto: true });

// Apply saved graphics quality after graphicsQuality and helper functions exist.
applyGraphicsQuality(graphicsQuality, { silent: true });

export function applyMapEnvironment(mapId = currentMapId) {
  const env = MAP_ENVIRONMENTS[mapId] || DEFAULT_MAP_ENVIRONMENT;
  activeMapEnvironment = env;

  if (!scene.fog) {
    scene.fog = new THREE.FogExp2(env.fogColor, env.fogDensity);
  }

  scene.fog.color.setHex(env.fogColor);
  scene.fog.density = env.fogDensity;

  renderer.setClearColor(env.clearColor, 1);

  ambLight.color.setHex(env.ambientColor);
  ambLight.intensity = env.ambientIntensity;

  dirLight.color.setHex(env.dirColor);
  dirLight.intensity = env.dirIntensity;
  dirLight.position.copy(env.dirPosition);

  bloomPass.strength = env.bloomStrength;
  bloomPass.radius = env.bloomRadius;
  bloomPass.threshold = env.bloomThreshold;

  applyGraphicsQuality(graphicsQuality, { silent: true });

  console.log(`Environment profile: ${env.name}`);
}

export function toggleSwarmLighting(isSwarm) {
  if (isSwarm) {
    scene.fog.color.setHex(0x220000);
    scene.fog.density = Math.max(activeMapEnvironment.fogDensity * 1.25, 0.028);

    ambLight.color.setHex(0xffaaaa);
    ambLight.intensity = activeMapEnvironment.ambientIntensity * 1.08;

    dirLight.color.setHex(0xff0000);
    dirLight.intensity = activeMapEnvironment.dirIntensity * 1.25;

    const profile = getGraphicsProfile();

    if (profile.bloomEnabled) {
      bloomPass.enabled = true;
      bloomPass.strength = Math.max(activeMapEnvironment.bloomStrength, 0.85) * profile.bloomStrengthScale;
      bloomPass.radius = Math.max(activeMapEnvironment.bloomRadius, 0.35) * profile.bloomRadiusScale;
      bloomPass.threshold = Math.min(activeMapEnvironment.bloomThreshold, 0.82);
    } else {
      bloomPass.enabled = false;
    }
  } else {
    applyMapEnvironment(currentMapId);
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

// ── BARRICADE REPAIR HOLOGRAM ──
function makeBarricadeGhostMaterial(color, opacity, options = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    wireframe: !!options.wireframe,
    blending: THREE.AdditiveBlending
  });
}

export function updateBarricadeRepairGhost(barricade) {
  if (!barricade?.repairGhost) return;

  const isDamaged = barricade.currentPlanks < barricade.maxPlanks;
  const isDestroyed = barricade.currentPlanks <= 0;

  barricade.repairGhost.visible = isDamaged;

  const boost = isDestroyed ? 1.6 : 1.0;

  barricade.repairGhost.traverse((child) => {
    if (!child.material) return;

    const baseOpacity = child.userData.baseGhostOpacity ?? child.material.opacity ?? 0.2;
    child.material.opacity = Math.min(0.75, baseOpacity * boost);
  });
}
export function spawnBarricade(x, z, rotY) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);

  const plankGroup = new THREE.Group();
  group.add(plankGroup);
	  // Repair locator: hidden when full, visible when damaged/destroyed.
  const repairGhost = new THREE.Group();
  repairGhost.name = 'barricade_repair_hologram';
  repairGhost.visible = false;
  group.add(repairGhost);

  const ghostFloorMat = makeBarricadeGhostMaterial(0x00d4ff, 0.18);
  const ghostFrameMat = makeBarricadeGhostMaterial(0x00d4ff, 0.24, { wireframe: true });
  const ghostCoreMat = makeBarricadeGhostMaterial(0x66ffff, 0.08);

  const ghostFloor = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.25), ghostFloorMat);
  ghostFloor.name = 'barricade_repair_floor_shadow';
  ghostFloor.rotation.x = -Math.PI / 2;
  ghostFloor.position.y = 0.035;
  ghostFloor.userData.baseGhostOpacity = 0.18;

  const ghostFrame = new THREE.Mesh(new THREE.BoxGeometry(4.35, 2.35, 0.12), ghostFrameMat);
  ghostFrame.name = 'barricade_repair_wireframe';
  ghostFrame.position.y = 1.35;
  ghostFrame.userData.baseGhostOpacity = 0.24;

  const ghostCore = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.0, 0.045), ghostCoreMat);
  ghostCore.name = 'barricade_repair_soft_panel';
  ghostCore.position.y = 1.25;
  ghostCore.userData.baseGhostOpacity = 0.08;

  repairGhost.add(ghostFloor, ghostFrame, ghostCore);
  
  const barricadeObj = {
    pos: new THREE.Vector3(x, 0, z),
    rotY: rotY,
    maxPlanks: 5,
    currentPlanks: 5,
    planks: [], 
    group: group,
    plankGroup: plankGroup,
    repairGhost: repairGhost,
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
  updateBarricadeRepairGhost(barricadeObj);
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
  [MAP_IDS.INDUSTRIAL_YARD]: buildIndustrialYard,
  [MAP_IDS.NEON_DEPOT]: buildNeonDepot,
  [MAP_IDS.PARKING_GARAGE]: buildParkingGarage,
  [MAP_IDS.HOSPITAL_WING]: buildHospitalWing,
  [MAP_IDS.REACTOR_COURTYARD]: buildReactorCourtyard
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
  applyMapEnvironment(currentMapId);

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

  configureMapValidation({
    mapId: currentMapId,
    walls,
    spawnPoints,
    playerSpawnPoints,
    lockedSpawnPoints,
    width: result?.width || 80,
    depth: result?.depth || 80,
    navigationCellSize: result?.navigationCellSize || 2.5,
    hasUnlockRoute: doors.length > 0
  });
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