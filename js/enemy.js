// js/enemy.js
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { scene, camera, spawnPoints, addScreenShake, mapMeshes, currentMap, barricades, walls, traps, toggleSwarmLighting, updateBarricadeRepairGhost } from './map.js';
import { player, damagePlayer } from './player.js';
import { updateKillsHUD, updateRoundHUD, flashWaveBanner, updateScoreHUD, spawnFloatingScore, showStatusToast } from './ui.js';
import { spawnBloodBurst } from './particles.js';
import { giveMaxAmmo } from './weapons.js';
import { playWorldSound, playEnemySound, playUISound, getMasterVolume } from './audio.js';
import { pushOut } from './utils.js';
import { difficultyMultiplier, ASSETS } from './main.js';
import { createProceduralZombieVisual, updateProceduralZombieStyle, updateProceduralZombieMotion} from './actors/procedural_zombie.js';

export const activeEnemies = [];
const activePowerups = [];
const groundRay = new THREE.Raycaster();
const groundRayDir = new THREE.Vector3(0, -1, 0);
const _audioCamDir = new THREE.Vector3();
const _audioToEnemy = new THREE.Vector3();
const _audioRight = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _visualCandidates = [];
const ENEMY_GROUND_SAMPLE_NEAR = 0.055;
const ENEMY_GROUND_SAMPLE_FAR = 0.13;


// ── OPTIMIZATION: STRICT 3D MESH POOLING ──
const MAX_ZOMBIES = 40;
const MAX_PROJECTILES = 15;
const MAX_EXPLOSIONS = 15;

const zombiePool = [];
const projectilePool = { items: [], index: 0 };
const explosionPool = { items: [], index: 0 };
const materialCache = {};
let poolsInitialized = false;

// Safe fallback so zombie spawning does not crash if actorManager is not loaded.
const actorManager = {
  clear() {},
  register() {},
  unregister() {}
};

function getZombieMaterial(config, baseMaterial) {
  // We append whether it has a map so the cache doesn't mix up GLBs and capsules!
  const matKey = config.name + (baseMaterial.map ? "_tex" : "_notex");
  
  if (!materialCache[matKey]) {
    const newMat = baseMaterial.clone();
    
    // Kill the shiny plastic look globally
    newMat.metalness = config.name === "GOLIATH" ? 0.2 : (config.name === "BRUTE" ? 0.08 : 0.0);
    newMat.roughness = 1.0; 
    newMat.transparent = false;
    newMat.depthWrite = true;
    
    if (newMat.map) {
      // 1. IT IS THE GLB MODEL (Has a skin texture)
      newMat.color.setHex(0xffffff); // Pure white base lets the actual skin texture show perfectly
      newMat.emissive.setHex(config.color); // Subtle faction tint
      newMat.emissiveIntensity = 0.15; 
      
      newMat.map.wrapS = THREE.RepeatWrapping;
      newMat.map.wrapT = THREE.RepeatWrapping;
      newMat.map.repeat.set(1, 1);
      newMat.map.needsUpdate = true;
    } else {
      // 2. IT IS THE LOD CAPSULE (No texture, just a shape)
      newMat.color.setHex(config.color); // Paint the solid faction color
      newMat.emissive.setHex(0x000000);  // No glow needed for capsules
    }
    
    materialCache[matKey] = newMat;
  }
  return materialCache[matKey];
}

const projGeo = new THREE.SphereGeometry(0.18, 8, 8);
const projMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
const expGeo = new THREE.SphereGeometry(1, 16, 16);
const expMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 });
// ── PROCEDURAL ZOMBIE VISUALS ──
const USE_GLB_ZOMBIES = false;
const DETAILED_VISUAL_BUDGET = USE_GLB_ZOMBIES ? 6 : 0;
const DETAILED_VISUAL_DISTANCE = USE_GLB_ZOMBIES ? 14 : 0;

let detailedVisualCount = 0;
let proceduralVisualCount = 0;

function setEnemyVisual(e, useDetailedVisual) {
  if (e.fullModel) {
    e.fullModel.visible = useDetailedVisual;
  }

  if (e.lodMesh) {
    e.lodMesh.visible = !useDetailedVisual;
  }

  e.usingLod = !useDetailedVisual;
}

export function getEnemyVisualStats() {
  return {
    detailedVisuals: detailedVisualCount,
    proceduralVisuals: proceduralVisualCount
  };
}
// ── AUDIO ENGINE ──
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const noiseBufferSize = audioCtx.sampleRate * 0.15;
const noiseBuffer = audioCtx.createBuffer(1, noiseBufferSize, audioCtx.sampleRate);
const output = noiseBuffer.getChannelData(0);
for (let i = 0; i < noiseBufferSize; i++) output[i] = Math.random() * 2 - 1;

function playSpatialZombieSound(ePos, type, isFootstep = true) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const dist = player.pos.distanceTo(ePos);
  if (dist > 18) return; 
  
  camera.getWorldDirection(_audioCamDir);
  _audioCamDir.y = 0;
  _audioCamDir.normalize();

  _audioToEnemy.subVectors(ePos, player.pos);
  _audioToEnemy.y = 0;
  _audioToEnemy.normalize();

  _audioRight.crossVectors(_audioCamDir, _worldUp).normalize();
  const panX = _audioToEnemy.dot(_audioRight);
  
  const vol = Math.max(0, 1 - (dist / 18)) * ((type === "GOLIATH" ? 1.1 : (type === "BRUTE" ? 0.62 : 0.38))) * getMasterVolume();
  if (vol <= 0.001) return;

  const gain = audioCtx.createGain();
  const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

  if (panner) { panner.pan.value = panX; gain.connect(panner); panner.connect(audioCtx.destination); } 
  else { gain.connect(audioCtx.destination); }

  if (isFootstep) {
    const source = audioCtx.createBufferSource(); source.buffer = noiseBuffer;
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.value = (type === "GOLIATH" || type === "BRUTE") ? 300 : 800; 
    source.connect(filter); filter.connect(gain);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    source.start();
  } else {
    const osc = audioCtx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime((type === "GOLIATH" || type === "BRUTE") ? 30 : 60, audioCtx.currentTime);
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.setValueAtTime((type === "GOLIATH" || type === "BRUTE") ? 100 : 200, audioCtx.currentTime);
    filter.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 0.5);
    osc.connect(filter); filter.connect(gain);
    gain.gain.setValueAtTime(vol * 0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.start(); osc.stop(audioCtx.currentTime + 0.5);
  }
}

// ── WAVE SYSTEM ──
export let currentWave = 1;
let zombiesToSpawnThisRound = 0;
let zombiesSpawnedSoFar = 0;
let goliathsToSpawn = 0;
let spawnTimer = 0;
let nextWaveTimeout = null;

export let isSpecialRound = false;
let campWarningTimer = 0; // ◄── THIS IS THE MISSING VARIABLE!
let announcedTypesThisWave = new Set();
let seenVariantTypesThisRun = new Set();

const ENEMY_TYPES = {
  SHAMBLER: {
    name: "SHAMBLER", label: "Walker", role: "standard",
    speed: 2.25, maxHealth: 100, damage: 15, attackCooldown: 1.4, attackRange: 1.4, colRadius: 0.45,
    color: 0x446644, radarColor: '#ff3333', scale: new THREE.Vector3(1, 1, 1),
    killScore: 50, headshotScore: 100
  },
  CRAWLER:  {
    name: "CRAWLER", label: "Crawler", role: "low profile",
    speed: 2.15, maxHealth: 85, damage: 10, attackCooldown: 1.25, attackRange: 1.05, colRadius: 0.36,
    color: 0x667a3a, radarColor: '#d6ff33', scale: new THREE.Vector3(0.95, 0.62, 0.95),
    killScore: 65, headshotScore: 115
  },
  RUNNER:   {
    name: "RUNNER", label: "Runner", role: "fast pressure",
    speed: 7.25, maxHealth: 65, damage: 9, attackCooldown: 0.9, attackRange: 1.35, colRadius: 0.40,
    color: 0x883333, radarColor: '#ff6600', scale: new THREE.Vector3(0.85, 1.05, 0.85),
    killScore: 75, headshotScore: 125
  },
  BRUTE:    {
    name: "BRUTE", label: "Brute", role: "tank",
    speed: 1.9, maxHealth: 285, damage: 24, attackCooldown: 1.75, attackRange: 1.8, colRadius: 0.66,
    color: 0x4b275f, radarColor: '#aa55ff', scale: new THREE.Vector3(1.28, 1.28, 1.28),
    killScore: 145, headshotScore: 225,
    announce: 'BRUTE INCOMING'
  },
  GOLIATH:  {
    name: "GOLIATH", label: "Goliath", role: "elite boss",
    speed: 1.45, maxHealth: 1300, damage: 40, attackCooldown: 2.35, attackRange: 3.0, colRadius: 1.20,
    color: 0x1a1a1a, radarColor: '#dd00ff', scale: new THREE.Vector3(1.8, 1.8, 1.8),
    killScore: 200, headshotScore: 350, bossBounty: 1500,
    announce: 'GOLIATH INBOUND'
  },
  EXPLODER: {
    name: "EXPLODER", label: "Exploder", role: "suicide blast",
    speed: 3.8, maxHealth: 70, damage: 42, attackCooldown: 0, attackRange: 2.25, colRadius: 0.50,
    color: 0xff4400, radarColor: '#ffcc00', scale: new THREE.Vector3(1.15, 1.15, 1.15),
    killScore: 95, headshotScore: 150,
    announce: 'EXPLODER NEARBY'
  },
  RANGED:   {
    name: "RANGED", label: "Spitter", role: "ranged pressure",
    speed: 1.85, maxHealth: 80, damage: 18, attackCooldown: 2.7, attackRange: 12.0, colRadius: 0.40,
    color: 0x00ffff, radarColor: '#00ffff', scale: new THREE.Vector3(0.8, 1.2, 0.8),
    killScore: 110, headshotScore: 175,
    announce: 'SPITTER ACTIVE'
  }
};

const ENEMY_TYPE_BY_NAME = Object.freeze(
  Object.values(ENEMY_TYPES).reduce((lookup, config) => {
    lookup[config.name] = config;
    return lookup;
  }, {})
);


export function getEnemyTypeMeta(typeName) {
  return ENEMY_TYPE_BY_NAME[typeName] || ENEMY_TYPES.SHAMBLER;
}

export function getEnemyPointReward(enemy, isHeadshot = false) {
  const config = getEnemyTypeMeta(enemy?.type);

  return {
    label: config.label || config.name,
    basePoints: isHeadshot ? (config.headshotScore || 100) : (config.killScore || 50),
    bonusPoints: config.bossBounty || 0,
    toast: config.name === 'GOLIATH' ? 'GOLIATH ELIMINATED' : `${config.label || config.name} eliminated`,
    color: config.radarColor || '#ffaa00'
  };
}

const POWERUP_TYPES = [
  { name: 'MAX AMMO', color: 0x00ff00 }, { name: 'INSTA-KILL', color: 0xffaa00 }, { name: 'DOUBLE POINTS', color: 0xffff00 }, { name: 'NUKE', color: 0xff0000 }
];

function initPools() {
  if (poolsInitialized) return;

  for (let i = 0; i < MAX_PROJECTILES; i++) {
    const pMesh = new THREE.Mesh(projGeo, projMat); pMesh.visible = false; scene.add(pMesh);
    projectilePool.items.push({ mesh: pMesh, dir: new THREE.Vector3(), life: 0 });
  }
  for (let i = 0; i < MAX_EXPLOSIONS; i++) {
    const eMesh = new THREE.Mesh(expGeo, expMat.clone()); eMesh.visible = false; scene.add(eMesh);
    explosionPool.items.push({ mesh: eMesh, life: 0 });
  }

for (let i = 0; i < MAX_ZOMBIES; i++) {
    const g = new THREE.Group();
const enemyInstance = { 
  mesh: g,
  fullModel: null,
  lodMesh: null,
  usingLod: false,
  _useFullVisual: false,
  _visualDist: 9999,

  type: "SHAMBLER",
  health: 100,
  maxHealth: 100,
  speed: 2.4,
  damage: 15,
  attackRate: 1.4,
  atkCD: 0,
  attackRange: 1.4,
  colRadius: 0.45,
  walkT: 0,
  hitReactT: 0,
  hitReactDir: 1,
  dyingT: -1,
  alive: false,
  mixer: null,
  originalScale: new THREE.Vector3(1,1,1)
};
    g.userData.eRef = enemyInstance;

    if (USE_GLB_ZOMBIES && ASSETS.enemies.zombie && ASSETS.enemies.zombie.clone) {
      const zombieModel = SkeletonUtils.clone(ASSETS.enemies.zombie);
      zombieModel.scale.set(0.015, 0.015, 0.015);
      zombieModel.traverse((child) => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.frustumCulled = true; child.castShadow = false; child.receiveShadow = false;
          child.userData.eRef = enemyInstance; 
          if (child.name.toLowerCase().includes("head")) child.userData.isHead = true;
        }
      });
      g.add(zombieModel);
	  enemyInstance.fullModel = zombieModel;
      
      if (ASSETS.enemies.zombie.animations && ASSETS.enemies.zombie.animations.length > 0) {
        enemyInstance.mixer = new THREE.AnimationMixer(zombieModel);
        const walkAnim = enemyInstance.mixer.clipAction(ASSETS.enemies.zombie.animations[0]);
        walkAnim.setLoop(THREE.LoopRepeat); walkAnim.play();
      }
    }
    
// Primary procedural body used by normal enemy rendering
const lodMesh = createProceduralZombieVisual({
  color: 0x7fa06b
});

lodMesh.visible = false;

lodMesh.traverse((child) => {
  if (child.isMesh) {
    child.castShadow = false;
    child.receiveShadow = false;
    child.frustumCulled = true;
    child.userData.eRef = enemyInstance;
  }
});

lodMesh.userData.eRef = enemyInstance;

g.add(lodMesh);
enemyInstance.lodMesh = lodMesh;

g.visible = false;
scene.add(g);
zombiePool.push(enemyInstance);
  }
  
  poolsInitialized = true;
  console.log("🟢 Zombie Pools Initialized!");
}

export function initEnemies() {
  initPools();

  if (nextWaveTimeout) {
    clearTimeout(nextWaveTimeout);
    nextWaveTimeout = null;
  }

  actorManager.clear();
  campWarningTimer = 0;
  seenVariantTypesThisRun = new Set();
  for (let i = activeEnemies.length - 1; i >= 0; i--) {
    const e = activeEnemies[i];
    e.mesh.visible = false;
    zombiePool.push(e);
  }
  
  activeEnemies.length = 0; 
  activePowerups.forEach(p => scene.remove(p.mesh)); 
  activePowerups.length = 0;
  projectilePool.items.forEach(p => p.mesh.visible = false);
  explosionPool.items.forEach(ex => ex.mesh.visible = false);
  
  currentWave = 1; 
  startWave(currentWave);
}

function getDifficultyScalar() {
  const scalar = Number(difficultyMultiplier);
  return Number.isFinite(scalar) && scalar > 0 ? scalar : 1;
}

function getWaveBriefing(waveNumber) {
  if (waveNumber > 0 && waveNumber % 5 === 0) {
    return 'Swarm round: fast enemies, lighter tanks, guaranteed max ammo at the end.';
  }

  if (waveNumber === 1) return 'Walkers only. Build points and learn the route.';
  if (waveNumber === 2) return 'Crawlers added. Watch low angles.';
  if (waveNumber === 3) return 'Runners start testing your movement.';
  if (waveNumber === 4) return 'First heavy pressure. Brutes may appear.';
  if (waveNumber < 7) return 'Mixed horde. Prioritize runners and exploders.';
  if (waveNumber < 10) return 'Elite pressure rising. Save traps for heavy enemies.';

  return 'High threat wave. Control space, use traps, and keep moving.';
}

function announceWaveStart(waveNumber) {
  const briefing = getWaveBriefing(waveNumber);
  const color = isSpecialRound ? '#ff6633' : '#00d4ff';

  playUISound(isSpecialRound ? 'warning' : 'waveStart', isSpecialRound ? 0.18 : 0.48, true, {
    cooldownKey: 'wave_start',
    cooldownMs: 1400,
    pitchMin: isSpecialRound ? 0.86 : 0.96,
    pitchMax: isSpecialRound ? 0.98 : 1.06
  });

  setTimeout(() => {
    if (!player.alive || currentWave !== waveNumber) return;
    showStatusToast(briefing, color, isSpecialRound ? 3200 : 2600);
  }, 650);
}

function startWave(waveNumber) {
  zombiesSpawnedSoFar = 0;
  spawnTimer = 0;
  nextWaveTimeout = null;
  announcedTypesThisWave = new Set();
  isSpecialRound = (waveNumber > 0 && waveNumber % 5 === 0);

  // Instantly shift the map lighting.
  toggleSwarmLighting(isSpecialRound);

  const diff = getDifficultyScalar();

  if (isSpecialRound) {
    goliathsToSpawn = 0;
    zombiesToSpawnThisRound = Math.min(30, Math.round((7 + waveNumber * 1.65) * diff));
    flashWaveBanner(`SWARM ROUND ${waveNumber}`);
  } else {
    // Heavy enemies are now staged more clearly so they do not stack unfairly.
    goliathsToSpawn = waveNumber >= 8 ? Math.min(2, 1 + Math.floor((waveNumber - 8) / 8)) : 0;
    zombiesToSpawnThisRound = Math.min(32, Math.round((5 + waveNumber * 1.65) * diff) + goliathsToSpawn);
    flashWaveBanner(`ROUND ${waveNumber}`);
  }

  announceWaveStart(waveNumber);
  updateRoundHUD(waveNumber);
}

function completeCurrentWave() {
  if (nextWaveTimeout) return;

  const clearedWave = currentWave;
  currentWave++;

  flashWaveBanner("ROUND CLEAR", 2500);
  showStatusToast(`ROUND ${clearedWave} CLEAR · NEXT: ${getWaveBriefing(currentWave)}`, '#00d4ff', 2800);
  playUISound('waveClear', 0.62, true, {
    cooldownKey: 'wave_clear',
    cooldownMs: 1800,
    pitchMin: 1.02,
    pitchMax: 1.16
  });

  nextWaveTimeout = setTimeout(() => {
    nextWaveTimeout = null;
    if (player.alive) startWave(currentWave);
  }, 5000);
}

function getSpawnInterval() {
  if (isSpecialRound) {
    return Math.max(0.78, 1.05 - currentWave * 0.018);
  }

  // Smoother pacing after C1 variety: slightly slower ramp, fewer sudden spikes.
  return Math.max(0.62, 1.42 - currentWave * 0.065);
}

function getActiveZombieCap() {
  if (isSpecialRound) {
    return Math.min(18, 7 + Math.floor(currentWave * 1.1));
  }

  return Math.min(22, 6 + Math.floor(currentWave * 1.45));
}

function getSpawnMixForWave(wave = currentWave) {
  if (isSpecialRound) {
    return [
      [ENEMY_TYPES.RUNNER, 0.46],
      [ENEMY_TYPES.CRAWLER, 0.27],
      [ENEMY_TYPES.SHAMBLER, 0.20],
      [ENEMY_TYPES.EXPLODER, wave >= 10 ? 0.07 : 0]
    ];
  }

  if (wave < 2) {
    return [[ENEMY_TYPES.SHAMBLER, 1]];
  }

  if (wave === 2) {
    return [
      [ENEMY_TYPES.SHAMBLER, 0.80],
      [ENEMY_TYPES.CRAWLER, 0.20]
    ];
  }

  if (wave === 3) {
    return [
      [ENEMY_TYPES.SHAMBLER, 0.67],
      [ENEMY_TYPES.CRAWLER, 0.18],
      [ENEMY_TYPES.RUNNER, 0.15]
    ];
  }

  const runnerChance = Math.min(0.22, 0.06 + wave * 0.014);
  const crawlerChance = Math.min(0.18, 0.10 + wave * 0.008);
  const exploderChance = wave >= 4 ? Math.min(0.10, 0.025 + wave * 0.006) : 0;
  const rangedChance = wave >= 5 ? Math.min(0.08, 0.018 + wave * 0.005) : 0;
  const bruteChance = wave >= 4 ? Math.min(0.12, 0.025 + wave * 0.006) : 0;

  return [
    [ENEMY_TYPES.SHAMBLER, Math.max(0.30, 1 - runnerChance - crawlerChance - exploderChance - rangedChance - bruteChance)],
    [ENEMY_TYPES.CRAWLER, crawlerChance],
    [ENEMY_TYPES.RUNNER, runnerChance],
    [ENEMY_TYPES.BRUTE, bruteChance],
    [ENEMY_TYPES.EXPLODER, exploderChance],
    [ENEMY_TYPES.RANGED, rangedChance]
  ];
}

function rollWeightedEnemy(mix) {
  const total = mix.reduce((sum, [, weight]) => sum + Math.max(0, weight || 0), 0);
  if (total <= 0) return ENEMY_TYPES.SHAMBLER;

  let r = Math.random() * total;

  for (const [config, weight] of mix) {
    r -= Math.max(0, weight || 0);
    if (r <= 0) return config;
  }

  return mix[mix.length - 1]?.[0] || ENEMY_TYPES.SHAMBLER;
}

function getLivingEnemyCounts() {
  const counts = {};

  activeEnemies.forEach((e) => {
    if (!e?.alive || e.dyingT >= 0) return;
    counts[e.type] = (counts[e.type] || 0) + 1;
  });

  return counts;
}

function getMaxActiveForType(typeName) {
  if (typeName === "GOLIATH") return 1;
  if (typeName === "BRUTE") return currentWave < 8 ? 1 : 2;
  if (typeName === "RANGED") return currentWave < 9 ? 1 : 2;
  if (typeName === "EXPLODER") return isSpecialRound ? (currentWave >= 10 ? 2 : 1) : (currentWave < 8 ? 1 : 2);
  if (typeName === "RUNNER") return isSpecialRound ? Math.min(8, 3 + Math.floor(currentWave / 3)) : Math.min(5, 1 + Math.floor(currentWave / 3));

  return Infinity;
}

function canSpawnType(config, counts = getLivingEnemyCounts()) {
  if (!config?.name) return true;
  return (counts[config.name] || 0) < getMaxActiveForType(config.name);
}

function pickEnemyTypeConfig() {
  const counts = getLivingEnemyCounts();

  if (goliathsToSpawn > 0 && canSpawnType(ENEMY_TYPES.GOLIATH, counts)) {
    goliathsToSpawn--;
    return ENEMY_TYPES.GOLIATH;
  }

  const mix = getSpawnMixForWave(currentWave).filter(([config, weight]) => {
    return weight > 0 && canSpawnType(config, counts);
  });

  if (mix.length === 0) {
    return ENEMY_TYPES.SHAMBLER;
  }

  return rollWeightedEnemy(mix);
}

function getWaveSpeedBonus(config) {
  const wave = Math.max(0, currentWave - 1);

  if (config.name === "RUNNER") return Math.min(0.62, wave * 0.050);
  if (config.name === "CRAWLER") return Math.min(0.45, wave * 0.045);
  if (config.name === "BRUTE") return Math.min(0.30, wave * 0.030);
  if (config.name === "GOLIATH") return Math.min(0.22, wave * 0.018);
  if (config.name === "RANGED") return Math.min(0.28, wave * 0.028);
  if (config.name === "EXPLODER") return Math.min(0.42, wave * 0.040);

  return Math.min(0.55, wave * 0.055);
}

function getEnemyVisualMotionSpeed(e) {
  if (!e) return 1.0;

  if (e.type === "RUNNER") return 1.35;
  if (e.type === "CRAWLER") return 0.65;
  if (e.type === "BRUTE") return 0.78;
  if (e.type === "GOLIATH") return 0.58;
  if (e.type === "EXPLODER") return 1.05;
  if (e.type === "RANGED") return 0.82;

  return 1.0;
}

function announceEnemyVariant(config) {
  if (!config?.announce || announcedTypesThisWave.has(config.name)) return;

  const isFirstSightThisRun = !seenVariantTypesThisRun.has(config.name);
  announcedTypesThisWave.add(config.name);
  seenVariantTypesThisRun.add(config.name);

  const message = isFirstSightThisRun
    ? `${config.label.toUpperCase()} DETECTED · ${String(config.role || 'threat').toUpperCase()}`
    : config.announce;

  showStatusToast(message, config.radarColor || '#ffaa00', isFirstSightThisRun ? 2300 : 1600);
  playUISound('warning', config.name === "GOLIATH" ? 0.24 : 0.16, true, {
    cooldownKey: `enemy_variant_${config.name}`,
    cooldownMs: 1500
  });

  if (config.name === "GOLIATH") {
    flashWaveBanner('GOLIATH INBOUND', 1800);
  }
}

function spawnZombie() {
  if (zombiePool.length === 0) return; 

  const config = pickEnemyTypeConfig();

  const recycled = zombiePool.pop();
  
  recycled.type = config.name;
  recycled.health = config.maxHealth;
  recycled.maxHealth = config.maxHealth;
  recycled.speed = config.speed + (Math.random() - 0.5) * 0.32 + getWaveSpeedBonus(config);
  recycled.damage = config.damage;
  recycled.attackRate = config.attackCooldown;
  recycled.aiTimer = Math.random() * 0.15;
  recycled.atkCD = Math.random() * config.attackCooldown;
  recycled.attackRange = config.attackRange;
  recycled.colRadius = config.colRadius;
  recycled.walkT = Math.random() * Math.PI * 2;
  recycled.hitReactT = 0;
  recycled.hitReactDir = 1;
  recycled.dyingT = -1;
  recycled.groundUpdateTimer = Math.random() * ENEMY_GROUND_SAMPLE_FAR;
  recycled.cachedGroundY = 0;
  recycled.alive = true;
  recycled.originalScale.copy(config.scale);
  recycled.scoreReward = config.killScore || 50;
  recycled.headshotReward = config.headshotScore || 100;
  recycled.bossBounty = config.bossBounty || 0;
  recycled.role = config.role || 'standard';

  if (recycled.mixer && ASSETS.enemies.zombie && ASSETS.enemies.zombie.animations.length > 0) {
    recycled.mixer.stopAllAction();
    const walkAnim = recycled.mixer.clipAction(ASSETS.enemies.zombie.animations[0]);
    walkAnim.setLoop(THREE.LoopRepeat);
    walkAnim.play();
  }

  recycled.mesh.scale.copy(config.scale);
  recycled.mesh.rotation.set(0, 0, 0);
  recycled.mesh.position.y = 0; 
  recycled.mesh.visible = true;

recycled.mesh.traverse(child => {
  if (child.isMesh || child.isSkinnedMesh) {
    if (child.userData.keepMaterial) return;

    child.material = getZombieMaterial(config, child.material);
    child.castShadow = false;
    child.receiveShadow = false;
  }
});

  if (spawnPoints.length > 0) {
    const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    recycled.mesh.position.set(sp.x + (Math.random() - 0.5) * 2, 0, sp.z + (Math.random() - 0.5) * 2);
  } else {
    recycled.mesh.position.set(0, 0, 0); 
  }

  updateProceduralZombieStyle(recycled.lodMesh, config);
  activeEnemies.push(recycled);
  actorManager.register(recycled);
  zombiesSpawnedSoFar++;

  announceEnemyVariant(config);
}

const _eToP = new THREE.Vector3();

export function updateEnemies(dt) {
  if (!player.alive) return;
	let currentlyCamping = false; // ◄── ADD THIS FLAG
  // ── ELECTRIC TRAP LOGIC ──
  traps.forEach(t => {
    if (t.state === 'ACTIVE') {
      t.timer -= dt;
      t.field.material.opacity = 0.2 + Math.random() * 0.5; // Zap flicker
      if (t.timer <= 0) { 
        t.state = 'COOLDOWN'; t.timer = 18.0; // 18 sec cooldown
        t.field.visible = false; t.switchMesh.material.color.setHex(0x444444); 
      }
    } else if (t.state === 'COOLDOWN') {
      t.timer -= dt;
      if (t.timer <= 0) { t.state = 'READY'; t.switchMesh.material.color.setHex(0xaa0000); }
    }
  });

  explosionPool.items.forEach(ex => {
    if (ex.life > 0) {
      ex.life -= dt;
      ex.mesh.scale.addScalar(dt * 18);
      ex.mesh.material.opacity = (ex.life / 0.3) * 0.8;
      if (ex.life <= 0) ex.mesh.visible = false;
    }
  });

  projectilePool.items.forEach(p => {
    if (p.life > 0) {
      p.mesh.position.addScaledVector(p.dir, dt * 14.0);
      p.life -= dt;
      const pdx = player.pos.x - p.mesh.position.x;
      const pdy = player.pos.y - p.mesh.position.y;
      const pdz = player.pos.z - p.mesh.position.z;
      if ((pdx * pdx + pdy * pdy + pdz * pdz) < 1.0) {
        damagePlayer(20, p.mesh.position);
        p.life = 0; p.mesh.visible = false;
      }
      if (p.life <= 0) p.mesh.visible = false;
    }
  });

  for (let i = activePowerups.length - 1; i >= 0; i--) {
    const p = activePowerups[i];
    p.mesh.rotation.y += dt * 2.5; p.mesh.position.y = 0.8 + Math.sin(Date.now() * 0.005) * 0.15; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); activePowerups.splice(i, 1); continue; }
    
    if (player.pos.distanceTo(p.mesh.position) < 1.6) {
      flashWaveBanner(p.type.name, 2500);
      showStatusToast(p.type.name, '#ffaa00', 1600);
      playWorldSound('powerup', 0.72, true, { cooldownKey: 'powerup_pickup', cooldownMs: 220, pitchMin: 1.04, pitchMax: 1.18 });
      if (p.type.name === 'MAX AMMO') giveMaxAmmo();
      if (p.type.name === 'INSTA-KILL') player.instaKillTimer = 15.0;
      if (p.type.name === 'DOUBLE POINTS') player.doublePointsTimer = 30.0;
      if (p.type.name === 'NUKE') {
        player.score += 400; updateScoreHUD(player.score); spawnFloatingScore(400, false);
        zombiesSpawnedSoFar = zombiesToSpawnThisRound; 
        [...activeEnemies].forEach(z => { if (z.alive) killEnemy(z); });
      }
      scene.remove(p.mesh); activePowerups.splice(i, 1);
    }
  } 

if (zombiesSpawnedSoFar < zombiesToSpawnThisRound) {
  const activeLivingEnemies = activeEnemies.reduce((count, e) => {
    return count + (e.alive && e.dyingT < 0 ? 1 : 0);
  }, 0);

  if (activeLivingEnemies < getActiveZombieCap()) {
    spawnTimer += dt;

    if (spawnTimer >= getSpawnInterval()) {
      spawnZombie();
      spawnTimer = 0;
    }
  } else {
    spawnTimer = Math.min(spawnTimer, getSpawnInterval());
  }
}

// Update procedural visual counters and optional detailed visuals.
// C5: avoid allocating/filtering/sorting every frame when GLB visuals are disabled.
detailedVisualCount = 0;
proceduralVisualCount = 0;

if (DETAILED_VISUAL_BUDGET > 0) {
  _visualCandidates.length = 0;

  for (let vi = 0; vi < activeEnemies.length; vi++) {
    const candidate = activeEnemies[vi];
    if (!candidate?.alive || candidate.dyingT >= 0) continue;

    candidate._visualDist = Math.hypot(
      player.pos.x - candidate.mesh.position.x,
      player.pos.z - candidate.mesh.position.z
    );
    candidate._useFullVisual = false;
    _visualCandidates.push(candidate);
  }

  _visualCandidates.sort((a, b) => a._visualDist - b._visualDist);

  let detailedSlots = DETAILED_VISUAL_BUDGET;

  for (const candidate of _visualCandidates) {
    if (detailedSlots > 0 && candidate._visualDist < DETAILED_VISUAL_DISTANCE) {
      candidate._useFullVisual = true;
      detailedSlots--;
      detailedVisualCount++;
    } else {
      proceduralVisualCount++;
    }
  }
} else {
  for (let vi = 0; vi < activeEnemies.length; vi++) {
    const candidate = activeEnemies[vi];
    if (!candidate?.alive || candidate.dyingT >= 0) continue;

    candidate._visualDist = Math.hypot(
      player.pos.x - candidate.mesh.position.x,
      player.pos.z - candidate.mesh.position.z
    );
    candidate._useFullVisual = false;
    proceduralVisualCount++;
  }
}

const visualAnimTime = performance.now() * 0.001;

for (let i = activeEnemies.length - 1; i >= 0; i--) {
    const e = activeEnemies[i];
    e.hitReactT = Math.max(0, (e.hitReactT || 0) - dt);

    if (e.dyingT >= 0) {
      e.dyingT += dt; 
      const t = Math.min(e.dyingT / 0.75, 1);
      const fall = THREE.MathUtils.smoothstep(t, 0, 1);

      if (e.lodMesh) {
        updateProceduralZombieMotion(e.lodMesh, visualAnimTime, 0.0, {
          hitReactT: 0,
          hitReactDir: e.hitReactDir || 1,
          deathT: e.dyingT
        });
      }

      e.mesh.rotation.x = -fall * Math.PI * 0.48;
      e.mesh.rotation.z = (e.hitReactDir || 1) * fall * 0.18;
      e.mesh.scale.set(
        e.originalScale.x * (1 + fall * 0.04),
        e.originalScale.y * (1 - fall * 0.12),
        e.originalScale.z * (1 + fall * 0.04)
      );
      e.mesh.position.y = -fall * 0.18;
      
      if (e.dyingT >= 0.75) {
        e.mesh.visible = false;
        zombiePool.push(e);
		actorManager.unregister(e);
        activeEnemies.splice(i, 1);
        
        if (zombiesSpawnedSoFar >= zombiesToSpawnThisRound && activeEnemies.length === 0) {
          completeCurrentWave();
        }
      }
      continue;
    }

if (!e.alive) continue;

    // ── TRAP ZAP CHECK ──
    let zapped = false;
    for (const t of traps) {
      if (t.state === 'ACTIVE') {
        const inX = t.isZAxis ? Math.abs(e.mesh.position.x - t.center.x) < 0.5 : Math.abs(e.mesh.position.x - t.center.x) < t.width / 2;
        const inZ = t.isZAxis ? Math.abs(e.mesh.position.z - t.center.z) < t.width / 2 : Math.abs(e.mesh.position.z - t.center.z) < 0.5;
        if (inX && inZ) { e.health = 0; killEnemy(e); zapped = true; break; }
      }
    }
    if (zapped) continue;

// Calculate dynamic distance components
    _eToP.set(player.pos.x - e.mesh.position.x, player.pos.y - e.mesh.position.y, player.pos.z - e.mesh.position.z);
    const horizontalDist = Math.sqrt(_eToP.x * _eToP.x + _eToP.z * _eToP.z);
    const trueVerticalDist = Math.abs(_eToP.y);

	setEnemyVisual(e, e._useFullVisual);

if (e.usingLod && e.lodMesh) {
  updateProceduralZombieMotion(
    e.lodMesh,
    visualAnimTime,
    getEnemyVisualMotionSpeed(e),
    {
      hitReactT: e.hitReactT,
      hitReactDir: e.hitReactDir,
      deathT: e.dyingT
    }
  );
}
    // ── ANTI-CAMPING DETECTION ──
    // If zombie is right under you, but the height gap proves you are on a box (not a balcony)
    if (horizontalDist <= 2.2 && trueVerticalDist > 1.8 && trueVerticalDist < 4.5) {
      currentlyCamping = true;
    }

    // ── CPU OPTIMIZATION: Only animate skeletons if close ──
	if (e.mixer && e._useFullVisual) {
	  e.mixer.timeScale = e.type === "RUNNER" ? 1.5 : (e.type === "BRUTE" || e.type === "GOLIATH" ? 0.75 : 1.0);
	  e.mixer.update(dt);
	}
	
// ── BARRICADE AGGRO SEARCH (PASTE HERE) ──
    let targetBarricade = null;
    for (const b of barricades) {
      if (b.currentPlanks > 0 && e.mesh.position.distanceTo(b.pos) < 2.2) {
        targetBarricade = b;
        break;
      }
    }

    if (targetBarricade) {
      // INTERCEPT CHASE: Force zombie to stop and rip down boards!
      e.mesh.lookAt(targetBarricade.pos.x, e.mesh.position.y, targetBarricade.pos.z);
      e.atkCD -= dt;
      
      if (e.atkCD <= 0) {
        e.atkCD = e.attackRate;
        targetBarricade.currentPlanks--;
        
        // Remove plank mesh visually from group
        const plankToRemove = targetBarricade.planks[targetBarricade.currentPlanks];
        targetBarricade.plankGroup.remove(plankToRemove);
        updateBarricadeRepairGhost(targetBarricade);
        playWorldSound('woodBreak', 0.72, true, { cooldownKey: 'barricade_break', cooldownMs: 260, pitchMin: 0.86, pitchMax: 1.08 });

        // If all planks are broken, strip out the wall bounding parameters entirely so hordes pass through!
        if (targetBarricade.currentPlanks <= 0) {
          const wIdx = walls.indexOf(targetBarricade.wallTracker);
          if (wIdx > -1) walls.splice(wIdx, 1);
        }
      }
      continue; // Skip standard player movement calculations this frame
    }

    if (horizontalDist > 0.1) {
      e.mesh.lookAt(player.pos.x, e.mesh.position.y, player.pos.z);
    }

// ── MOVEMENT & STAIRWAY ROUTING ENGINE ──
    if (horizontalDist > e.attackRange || trueVerticalDist > 1.8) {
      const oldWalk = e.walkT;
      e.walkT += dt * e.speed * 3.5;
      
      let moveX = _eToP.x / (horizontalDist || 1);
      let moveZ = _eToP.z / (horizontalDist || 1);

      // ── THE MULTISTORY NAV-MESH FIX ──
      // If player is upstairs (Y > 4) and zombie is down below, route them to the steps!
      if (currentMap === 4 && player.pos.y > 4.0 && e.mesh.position.y < 4.0) {
        
        // Check if the zombie is already inside the physical staircase corridor (Z is between -9 and -26)
        const isOnStairs = e.mesh.position.x > -4 && e.mesh.position.x < 4 && e.mesh.position.z < -9 && e.mesh.position.z > -26;
        
        let targetX = 0;
        // If on stairs, push forward to the top landing! If not, run to the base.
        let targetZ = isOnStairs ? -25 : -10; 

        const toTargetX = targetX - e.mesh.position.x;
        const toTargetZ = targetZ - e.mesh.position.z;
        const distToTarget = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ);

        if (distToTarget > 0.5) {
          moveX = toTargetX / distToTarget;
          moveZ = toTargetZ / distToTarget;
        }
      }

      e.mesh.position.x += moveX * e.speed * dt;
      e.mesh.position.z += moveZ * e.speed * dt;

      // ── HEIGHT SAMPLING (Look-Ahead Stair Snap) ──
      // C5: raycasting every enemy every frame is expensive. Cache ground height
      // briefly, sampling faster near the player / on vertical gaps for stairs.
      let currentGroundY = Number.isFinite(e.cachedGroundY) ? e.cachedGroundY : 0;
      e.groundUpdateTimer = Math.max(0, (e.groundUpdateTimer || 0) - dt);

      const sampleDelay = (horizontalDist < 8 || trueVerticalDist > 1.8)
        ? ENEMY_GROUND_SAMPLE_NEAR
        : ENEMY_GROUND_SAMPLE_FAR;

      if (e.groundUpdateTimer <= 0) {
        e.groundUpdateTimer = sampleDelay + Math.random() * 0.025;

        // We push the look-ahead to 0.8 so they spot the next step slightly earlier
        const aheadX = e.mesh.position.x + (moveX * 0.8);
        const aheadZ = e.mesh.position.z + (moveZ * 0.8);
        groundRay.near = 0;
        groundRay.far = 10;
        groundRay.ray.origin.set(aheadX, e.mesh.position.y + 2.0, aheadZ);
        groundRay.ray.direction.copy(groundRayDir);

        const hits = groundRay.intersectObjects(mapMeshes, false);
        currentGroundY = hits.length > 0 ? hits[0].point.y : 0;
        e.cachedGroundY = currentGroundY;
      }

      // Snap up instantly to conquer stairs, drop smoothly if falling
      if (currentGroundY > e.mesh.position.y) {
        e.mesh.position.y = currentGroundY; 
      } else {
        e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, currentGroundY, dt * 12);
      }
      
      pushOut(e.mesh.position, e.colRadius);

      if (Math.floor(oldWalk / Math.PI) !== Math.floor(e.walkT / Math.PI)) playSpatialZombieSound(e.mesh.position, e.type, true);
      if (Math.random() < 0.005) playSpatialZombieSound(e.mesh.position, e.type, false);
    }

    // ── ATTACK AND RANGE VALIDATION ──
    e.atkCD -= dt;
    if (horizontalDist <= e.attackRange && trueVerticalDist <= 1.8 && e.atkCD <= 0 && player.alive) {
      e.atkCD = e.attackRate; 
      
      if (e.type === "EXPLODER") {
        killEnemy(e); 
      } 
      else if (e.type === "RANGED") {
        const pool = projectilePool;
        const p = pool.items[pool.index];
        p.mesh.position.copy(e.mesh.position); p.mesh.position.y += 1.2;
        p.dir.subVectors(player.pos, p.mesh.position).normalize();
        p.life = 2.5; p.mesh.visible = true;
        pool.index = (pool.index + 1) % MAX_PROJECTILES;
        playEnemySound('ranged', 0.32, true, { cooldownKey: 'ranged_enemy_shot', cooldownMs: 120 }); 
      } 
else {
        damagePlayer(e.damage, e.mesh.position);
        e.mesh.position.x += (_eToP.x / (horizontalDist || 1)) * 0.15; 
        e.mesh.position.z += (_eToP.z / (horizontalDist || 1)) * 0.15;
      }
    }
  } // <-- End of activeEnemies loop

  // ── PUNISH CAMPERS ──
  if (currentlyCamping) {
    campWarningTimer += dt;
    if (campWarningTimer > 4.0) { // 4 seconds of standing on a box
      damagePlayer(15, null);
      flashWaveBanner("WARNING: TOXIC SPORES! KEEP MOVING!", 1000);
      playEnemySound('spore', 0.16, true, { cooldownKey: 'toxic_spores', cooldownMs: 1100, pitchMin: 0.72, pitchMax: 0.90 });
      campWarningTimer = 3.0; // Ticks damage every 1 second until they jump down
    }
  } else {
    campWarningTimer = Math.max(0, campWarningTimer - dt * 1.5); // Rapidly cools down when moving
  }
} // <-- End of updateEnemies function

export function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false; e.dyingT = 0; 
  spawnBloodBurst(e.mesh.position);
  
  if (e.type === "EXPLODER") {
    addScreenShake(0.6); 
    playEnemySound('exploder', 0.72, true, { cooldownKey: 'enemy_exploder', cooldownMs: 180, pitchMin: 0.88, pitchMax: 1.02 }); 
    
    const pool = explosionPool;
    const ex = pool.items[pool.index];
    ex.mesh.position.copy(e.mesh.position);
    ex.mesh.scale.set(1, 1, 1);
    ex.life = 0.3; ex.mesh.visible = true;
    pool.index = (pool.index + 1) % MAX_EXPLOSIONS;
    
    if (player.pos.distanceTo(e.mesh.position) < 5.0) damagePlayer(e.damage, e.mesh.position);
  }
  
player.kills++; updateKillsHUD(player.kills);
  
  // ── GUARANTEED MAX AMMO ON SPECIAL ROUND COMPLETION ──
  const isLastSwarmZombie = isSpecialRound && zombiesSpawnedSoFar >= zombiesToSpawnThisRound && activeEnemies.length === 1;

  if (isLastSwarmZombie) {
    const maxAmmoType = POWERUP_TYPES.find(p => p.name === 'MAX AMMO');
    const pMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: maxAmmoType.color, emissive: maxAmmoType.color, emissiveIntensity: 0.8 }));
    pMesh.position.copy(e.mesh.position); pMesh.position.y = 0.8; scene.add(pMesh); 
    activePowerups.push({ mesh: pMesh, type: maxAmmoType, life: 15.0 });
  } 
  // ── STANDARD RANDOM POWERUP DROP ──
  else if (Math.random() < 0.10) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const pMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.8 }));
    pMesh.position.copy(e.mesh.position); pMesh.position.y = 0.8; scene.add(pMesh); 
    activePowerups.push({ mesh: pMesh, type: type, life: 15.0 });
  }
}

export function getActiveEnemies() { 
  return activeEnemies; 
}
