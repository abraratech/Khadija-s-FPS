// js/enemy.js
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { scene, camera, spawnPoints, addScreenShake, mapMeshes, currentMap, currentMapId, barricades, walls, traps, toggleSwarmLighting, updateBarricadeRepairGhost } from './map.js';
import { player, damagePlayer } from './player.js';
import { updateKillsHUD, updateRoundHUD, flashWaveBanner, updateScoreHUD, spawnFloatingScore, showStatusToast } from './ui.js';
import {
  spawnBloodBurst,
  spawnEnemyAttackWarning,
  spawnEnemyProjectileTrail,
  spawnEnemyProjectileImpact,
  spawnEnemyAttackInterrupted,
  spawnEnemyArchetypePulse
} from './particles.js';
import { giveMaxAmmo } from './weapons.js';
import { playWorldSound, playEnemySound, playUISound, getMasterVolume } from './audio.js';
import { pushOut } from './utils.js';
import { difficultyMultiplier, ASSETS } from './main.js';
import { scaleEconomyReward } from './economy_balance.js';
import { createProceduralZombieVisual, updateProceduralZombieStyle, updateProceduralZombieMotion} from './actors/procedural_zombie.js';
import {
  beginAIDirectorWave,
  completeAIDirectorWave,
  adaptEnemySpawnMix,
  getAIDirectorTuning,
  assignEnemyDirectorRole,
  getDirectorPursuitTarget
} from './ai_director.js';
import {
  registerSquadEnemy,
  getSquadPursuitTarget,
  recordSquadEnemyDeath
} from './ai_squad.js';
import {
  registerNavigationEnemy,
  getReliableNavigationTarget,
  recordNavigationEnemyRemoved
} from './ai_navigation.js';
import {
  getAIExploitSnapshot,
  recordAIExploitRangedResponse
} from './ai_exploit.js';
import {
  registerAttackEnemy,
  queueEnemyAttack,
  updateAIAttackCoordinator,
  advanceEnemyAttack,
  consumeAttackTelegraphStart,
  consumeAttackInterrupted,
  cancelEnemyAttack,
  recordAIAttackProjectileResult
} from './ai_attacks.js';
import {
  registerArchetypeEnemy,
  updateAIArchetypeCoordinator,
  recordArchetypeAttackCommitted,
  getArchetypeMovementScale,
  getArchetypeHitMoveScale,
  shouldArchetypeForceMove,
  canArchetypeRequestAttack,
  getArchetypePursuitTarget,
  getArchetypeAttackProfile,
  getArchetypeAttackCooldownScale,
  consumeArchetypeEvent
} from './ai_archetypes.js';
import {
  registerFormationEnemy,
  updateAIFormation,
  getFormationPursuitTarget,
  getFormationMovementScale,
  recordFormationEnemyRemoved
} from './ai_formation.js';
import { getCoopScalingProfile } from './multiplayer/coop_scaling_core.js';
import {
  recordProgressionKill,
  recordProgressionWaveClear
} from './progression.js';
import {
  recordObjectiveKill,
  recordObjectiveWaveClear,
  consumeObjectiveCompletion
} from './objectives.js';
import {
  recordChallengeKill,
  recordChallengeWaveClear,
  recordChallengeObjective,
  consumeChallengeEvents
} from './challenges.js';
import {
  recordRunKill,
  recordRunWave,
  recordRunPointsEarned,
  recordRunObjective,
  recordRunChallenge
} from './run_summary.js';
import {
  createWaveWatchdogState,
  inspectEnemyReliability,
  updateWaveWatchdog
} from './gameplay_reliability_core.js';
import {
  WAVE_SPAWN_INTEGRITY_PATCH,
  buildCanonicalEnemyPool,
  createSpawnAttemptResult,
  createWaveScheduleToken,
  inspectEnemyPoolIntegrity,
  isWaveScheduleTokenCurrent,
  normalizeWaveIncident
} from './wave_spawn_integrity_core.js';

export const activeEnemies = [];
const activePowerups = [];
const groundRay = new THREE.Raycaster();
const groundRayDir = new THREE.Vector3(0, -1, 0);
const _audioCamDir = new THREE.Vector3();
const _audioToEnemy = new THREE.Vector3();
const _audioRight = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _visualCandidates = [];
const rangedSightRay = new THREE.Raycaster();
const rangedSightOrigin = new THREE.Vector3();
const rangedSightDirection = new THREE.Vector3();
const rangedSightTarget = new THREE.Vector3();
const rangedSightHits = [];
const ENEMY_GROUND_SAMPLE_NEAR = 0.055;
const ENEMY_GROUND_SAMPLE_FAR = 0.13;

// ── C10 ENEMY / ROUND PACING ──
const NORMAL_WAVE_LEAD_IN = 0.65;
const SPECIAL_WAVE_LEAD_IN = 0.35;
const EARLY_SPAWN_PLAYER_CLEARANCE = 11.0;
const LATE_SPAWN_PLAYER_CLEARANCE = 7.5;
const SPAWN_ENEMY_CLEARANCE = 2.1;
let meleeDamageGraceT = 0;


// ── OPTIMIZATION: STRICT 3D MESH POOLING ──
const MAX_ZOMBIES = 40;
const MAX_PROJECTILES = 15;
const MAX_EXPLOSIONS = 15;

const zombiePool = [];
const zombieRegistry = [];
const zombieRegistrySet = new Set();
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

function announceC11Events() {
  const notices = [];
  const objective = consumeObjectiveCompletion();
  if (objective) {
    player.score += objective.points;
    updateScoreHUD(player.score);
    spawnFloatingScore(objective.points, false, 'OBJECTIVE COMPLETE');
    recordRunPointsEarned(objective.points);
    recordRunObjective();
    recordChallengeObjective();
    notices.push({ text: `OBJECTIVE COMPLETE: ${objective.label.toUpperCase()} · +${objective.points} PTS`, color: '#22ff88', duration: 2600 });
  }

  for (const event of consumeChallengeEvents()) {
    if (event.type === 'CHALLENGE') recordRunChallenge();
    const achievement = event.type === 'ACHIEVEMENT';
    notices.push({
      text: `${achievement ? 'ACHIEVEMENT' : 'CHALLENGE'}: ${String(event.label || event.id).toUpperCase()}`,
      color: achievement ? '#ffaa00' : '#00d4ff',
      duration: 2200
    });
  }

  notices.forEach((notice, index) => {
    setTimeout(() => {
      if (player.alive) showStatusToast(notice.text, notice.color, notice.duration);
    }, index * 900);
  });
}

// ── WAVE SYSTEM ──
export let currentWave = 1;
let zombiesToSpawnThisRound = 0;
let zombiesSpawnedSoFar = 0;
let goliathsToSpawn = 0;
let spawnTimer = 0;
let nextWaveTimeout = null;
let nextWaveScheduleToken = null;
let nextWaveScheduleSerial = 0;
let enemyRunGeneration = 0;
let enemyWaveGeneration = 0;
let enemyIncidentSerial = 0;
let enemyIncidents = [];
let poolRebuilds = 0;
let spawnFailures = 0;
let spawnFailureStreak = 0;
let lastSpawnFailureIncidentAt = -Infinity;
let lastWaveTargetWaitIncidentAt = -Infinity;
let staleWaveSchedulesIgnored = 0;
let enemyReliabilityState = createWaveWatchdogState(currentWave);
let enemyReliabilitySnapshot = Object.freeze({
  patch: WAVE_SPAWN_INTEGRITY_PATCH,
  wave: currentWave,
  action: 'NONE',
  repairs: 0,
  relocated: 0,
  restoredVisuals: 0,
  recycledDying: 0,
  spawnerKicks: 0,
  forcedWaveCompletions: 0,
  counts: inspectEnemyReliability([])
});
let enemyReliabilityRepairs = 0;
let enemyReliabilityRelocated = 0;
let enemyReliabilityRestoredVisuals = 0;
let enemyReliabilityRecycledDying = 0;
let enemyReliabilitySpawnerKicks = 0;
let enemyReliabilityForcedWaveCompletions = 0;

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
    basePoints: scaleEconomyReward(
      isHeadshot ? (config.headshotScore || 100) : (config.killScore || 50),
      isHeadshot ? 'HEADSHOT_KILL' : 'KILL'
    ),
    bonusPoints: scaleEconomyReward(config.bossBounty || 0, 'BOSS_BOUNTY'),
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
    projectilePool.items.push({
      mesh: pMesh,
      dir: new THREE.Vector3(),
      prevPos: new THREE.Vector3(),
      life: 0,
      trailTimer: 0,
      elevatedResponse: false
    });
  }
  for (let i = 0; i < MAX_EXPLOSIONS; i++) {
    const eMesh = new THREE.Mesh(expGeo, expMat.clone()); eMesh.visible = false; scene.add(eMesh);
    explosionPool.items.push({ mesh: eMesh, life: 0 });
  }

for (let i = 0; i < MAX_ZOMBIES; i++) {
    const g = new THREE.Group();
const enemyInstance = { 
  poolId: `zombie-${i + 1}`,
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
  attackAnimT: 0,
  attackAnimDuration: 0.30,
  rangedLosTimer: 0,
  rangedHasLos: false,
  lastHitDamage: 0,
  lastHitHeadshot: false,
  lastHitAt: 0,
  attackState: 'IDLE',
  attackKind: 'NONE',
  attackWindupT: 0,
  attackWindupDuration: 0,
  attackRecoveryT: 0,
  attackTelegraphProgress: 0,
  archetypeInitialized: false,
  archetypeEvent: 'NONE',
  runnerBurstT: 0,
  spitterRepositionT: 0,
  bruteBraceT: 0,
  goliathPhase: 0,
  goliathPhasePulseT: 0,
  exploderStage: 'IDLE',
  dyingT: -1,
  cachedGroundY: 0,
  groundUpdateTimer: 0,
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
zombieRegistry.push(enemyInstance);
zombieRegistrySet.add(enemyInstance);
zombiePool.push(enemyInstance);
  }
  
  poolsInitialized = true;
  console.log("🟢 Zombie Pools Initialized!");
}

function getPoolIntegritySnapshot() {
  return inspectEnemyPoolIntegrity({
    registry: zombieRegistry,
    active: activeEnemies.filter((enemy) => zombieRegistrySet.has(enemy)),
    pooled: zombiePool
  });
}

function getEnemyIncidentMode() {
  return multiplayerEnemyAuthority ? 'multiplayer-authority' : 'single';
}

function recordEnemyIncident(type, details = {}) {
  enemyIncidentSerial += 1;
  const timestamp = Date.now();
  const incident = normalizeWaveIncident({
    id: `${timestamp}-${enemyRunGeneration}-${enemyIncidentSerial}`,
    serial: enemyIncidentSerial,
    type,
    timestamp,
    runGeneration: enemyRunGeneration,
    waveGeneration: enemyWaveGeneration,
    wave: currentWave,
    mapId: currentMapId,
    difficulty: getDifficultyScalar(),
    mode: getEnemyIncidentMode(),
    details: {
      ...details,
      spawned: zombiesSpawnedSoFar,
      total: zombiesToSpawnThisRound,
      activeCount: activeEnemies.length,
      poolSize: zombiePool.length,
      integrity: getPoolIntegritySnapshot()
    }
  });
  enemyIncidents.push(incident);
  if (enemyIncidents.length > 24) {
    enemyIncidents = enemyIncidents.slice(-24);
  }
  return incident;
}

function resetRegistryEnemyForPool(enemy) {
  if (!enemy || !zombieRegistrySet.has(enemy)) return false;
  cancelEnemyAttack(enemy);
  actorManager.unregister(enemy);
  enemy.alive = false;
  enemy.dyingT = -1;
  enemy.networkId = null;
  enemy.isNetworkProxy = false;
  enemy.handleNetworkHit = null;
  enemy.targetPlayerId = null;
  enemy.health = 0;
  enemy.atkCD = 0;
  enemy.attackState = 'IDLE';
  enemy.attackKind = 'NONE';
  enemy.attackWindupT = 0;
  enemy.attackRecoveryT = 0;
  enemy.attackTelegraphProgress = 0;
  if (enemy.mesh) {
    enemy.mesh.visible = false;
    enemy.mesh.rotation.set(0, 0, 0);
    enemy.mesh.scale.copy(enemy.originalScale || new THREE.Vector3(1, 1, 1));
  }
  return true;
}

function rebuildZombiePool(reason = 'manual', { record = true } = {}) {
  initPools();
  const before = getPoolIntegritySnapshot();
  const cleanedActive = [];
  const seenRegistryActive = new Set();
  let removedDuplicateActive = 0;

  for (const enemy of activeEnemies) {
    if (!zombieRegistrySet.has(enemy)) {
      cleanedActive.push(enemy);
      continue;
    }
    if (seenRegistryActive.has(enemy)) {
      removedDuplicateActive += 1;
      continue;
    }
    seenRegistryActive.add(enemy);
    cleanedActive.push(enemy);
  }

  if (cleanedActive.length !== activeEnemies.length) {
    activeEnemies.length = 0;
    activeEnemies.push(...cleanedActive);
  }

  const canonical = buildCanonicalEnemyPool({
    registry: zombieRegistry,
    active: cleanedActive
  });
  zombiePool.length = 0;
  for (const enemy of canonical.pool) {
    resetRegistryEnemyForPool(enemy);
    zombiePool.push(enemy);
  }
  poolRebuilds += 1;
  const after = getPoolIntegritySnapshot();

  if (record && (!before.invariantOk || removedDuplicateActive > 0)) {
    recordEnemyIncident('POOL_INVARIANT_REPAIRED', {
      reason: String(reason || 'manual'),
      removedDuplicateActive,
      before,
      after
    });
  }

  return Object.freeze({
    reason: String(reason || 'manual'),
    repaired: !before.invariantOk || removedDuplicateActive > 0,
    removedDuplicateActive,
    before,
    after
  });
}

function takeEnemyFromPool({ allowRepair = true, reason = 'spawn' } = {}) {
  const takeCandidate = () => {
    while (zombiePool.length > 0) {
      const candidate = zombiePool.pop();
      if (!zombieRegistrySet.has(candidate)) continue;
      if (activeEnemies.includes(candidate)) continue;
      return candidate;
    }
    return null;
  };

  let enemy = takeCandidate();
  let repaired = false;
  if (!enemy && allowRepair) {
    rebuildZombiePool(`${reason}-pool-empty`, { record: true });
    repaired = true;
    enemy = takeCandidate();
  }
  return { enemy, repaired };
}

function returnEnemyToPool(enemy, reason = 'return') {
  if (!enemy || !zombieRegistrySet.has(enemy)) return false;
  for (let index = activeEnemies.length - 1; index >= 0; index -= 1) {
    if (activeEnemies[index] === enemy) activeEnemies.splice(index, 1);
  }
  resetRegistryEnemyForPool(enemy);
  if (!zombiePool.includes(enemy)) zombiePool.push(enemy);
  const integrity = getPoolIntegritySnapshot();
  if (!integrity.invariantOk) {
    rebuildZombiePool(`${reason}-post-return`, { record: true });
  }
  return true;
}

function clearNextWaveSchedule(reason = 'cleared') {
  if (nextWaveTimeout) clearTimeout(nextWaveTimeout);
  nextWaveTimeout = null;
  nextWaveScheduleToken = null;
  nextWaveScheduleSerial += 1;
  return reason;
}

function scheduleWaveStart(delayMs, reason = 'round-clear', wave = currentWave) {
  if (nextWaveTimeout) clearTimeout(nextWaveTimeout);
  const serial = ++nextWaveScheduleSerial;
  const token = createWaveScheduleToken({
    runGeneration: enemyRunGeneration,
    waveGeneration: enemyWaveGeneration,
    wave,
    serial,
    reason
  });
  nextWaveScheduleToken = token;
  nextWaveTimeout = setTimeout(() => {
    const scheduledToken = nextWaveScheduleToken;
    nextWaveTimeout = null;
    nextWaveScheduleToken = null;
    const current = {
      runGeneration: enemyRunGeneration,
      waveGeneration: enemyWaveGeneration,
      wave: currentWave,
      serial: nextWaveScheduleSerial
    };
    if (scheduledToken !== token || !isWaveScheduleTokenCurrent(token, current)) {
      staleWaveSchedulesIgnored += 1;
      recordEnemyIncident('STALE_WAVE_SCHEDULE_IGNORED', {
        reason: token.reason,
        token,
        current
      });
      return;
    }

    if (getEnemyTargetCandidates().length > 0) {
      startWave(token.wave);
      return;
    }

    const now = performance.now();
    if (now - lastWaveTargetWaitIncidentAt >= 5000) {
      lastWaveTargetWaitIncidentAt = now;
      recordEnemyIncident('WAVE_START_WAITING_FOR_TARGET', {
        reason: token.reason,
        retryDelayMs: 500
      });
    }
    scheduleWaveStart(500, 'waiting-for-live-target', token.wave);
  }, Math.max(0, Number(delayMs) || 0));
  return token;
}

export function endEnemyRun(reason = 'ended') {
  enemyRunGeneration += 1;
  enemyWaveGeneration = 0;
  clearNextWaveSchedule(`run-ended:${reason}`);
  actorManager.clear();

  for (const enemy of [...activeEnemies]) {
    if (zombieRegistrySet.has(enemy)) {
      returnEnemyToPool(enemy, 'run-end');
    } else if (enemy?.mesh) {
      enemy.mesh.visible = false;
    }
  }
  activeEnemies.length = 0;
  activePowerups.forEach((powerup) => scene.remove(powerup.mesh));
  activePowerups.length = 0;
  projectilePool.items.forEach((projectile) => { projectile.mesh.visible = false; });
  explosionPool.items.forEach((explosion) => { explosion.mesh.visible = false; });
  rebuildZombiePool('run-end', { record: true });
  resetEnemyReliabilityState(`run-ended:${reason}`);
  return getEnemyReliabilitySnapshot();
}

export function initEnemies() {
  initPools();
  enemyRunGeneration += 1;
  enemyWaveGeneration = 0;
  clearNextWaveSchedule('run-init');

  actorManager.clear();
  campWarningTimer = 0;
  meleeDamageGraceT = 0;
  seenVariantTypesThisRun = new Set();
  spawnFailureStreak = 0;

  for (const enemy of [...activeEnemies]) {
    if (zombieRegistrySet.has(enemy)) {
      returnEnemyToPool(enemy, 'run-init');
    } else if (enemy?.mesh) {
      enemy.mesh.visible = false;
    }
  }
  activeEnemies.length = 0;
  rebuildZombiePool('run-init', { record: true });
  resetEnemyReliabilityState('init');

  activePowerups.forEach(p => scene.remove(p.mesh));
  activePowerups.length = 0;
  projectilePool.items.forEach(p => p.mesh.visible = false);
  explosionPool.items.forEach(ex => ex.mesh.visible = false);

  currentWave = 1;
  startWave(currentWave);
}

export function clearEnemiesForNetworkProxyMode() {
  initPools();
  enemyRunGeneration += 1;
  enemyWaveGeneration = 0;
  clearNextWaveSchedule('network-proxy-mode');
  actorManager.clear();
  for (let index = activeEnemies.length - 1; index >= 0; index -= 1) {
    const enemy = activeEnemies[index];
    if (enemy?.isNetworkProxy) continue;
    returnEnemyToPool(enemy, 'network-proxy-mode');
  }
  rebuildZombiePool('network-proxy-mode', { record: true });
  projectilePool.items.forEach((projectile) => {
    projectile.mesh.visible = false;
  });
  explosionPool.items.forEach((explosion) => {
    explosion.mesh.visible = false;
  });
}

export function getNetworkEnemyWaveState() {
  return {
    wave: currentWave,
    specialRound: isSpecialRound === true,
    zombiesToSpawn: Math.max(0, Number(zombiesToSpawnThisRound) || 0),
    zombiesSpawned: Math.max(0, Number(zombiesSpawnedSoFar) || 0),
    goliathsRemaining: Math.max(0, Number(goliathsToSpawn) || 0),
    spawnTimer: Number(spawnTimer) || 0,
    nextWavePending: nextWaveTimeout !== null,
    runGeneration: enemyRunGeneration,
    waveGeneration: enemyWaveGeneration,
    poolIntegrity: getPoolIntegritySnapshot()
  };
}

export function restoreNetworkEnemySnapshot(snapshot = {}) {
  initPools();
  enemyRunGeneration += 1;
  enemyWaveGeneration = 0;
  clearNextWaveSchedule('network-restore');

  actorManager.clear();
  campWarningTimer = 0;
  meleeDamageGraceT = 0;

  for (const enemy of [...activeEnemies]) {
    if (zombieRegistrySet.has(enemy)) {
      returnEnemyToPool(enemy, 'network-restore');
    } else if (enemy?.mesh) {
      enemy.mesh.visible = false;
    }
  }
  activeEnemies.length = 0;
  rebuildZombiePool('network-restore', { record: true });

  const waveState = snapshot.waveState || {};
  currentWave = Math.max(
    1,
    Math.floor(Number(waveState.wave ?? snapshot.wave) || 1)
  );
  isSpecialRound = waveState.specialRound === true
    || snapshot.specialRound === true;
  zombiesToSpawnThisRound = Math.max(
    0,
    Math.floor(Number(waveState.zombiesToSpawn) || 0)
  );
  zombiesSpawnedSoFar = Math.max(
    0,
    Math.floor(Number(waveState.zombiesSpawned) || 0)
  );
  goliathsToSpawn = Math.max(
    0,
    Math.floor(Number(waveState.goliathsRemaining) || 0)
  );
  spawnTimer = Number(waveState.spawnTimer) || 0;
  announcedTypesThisWave = new Set();
  resetEnemyReliabilityState('network-restore');

  const states = Array.isArray(snapshot.enemies)
    ? snapshot.enemies.filter((state) => state?.alive !== false)
    : [];

  if (zombiesToSpawnThisRound < states.length) {
    zombiesToSpawnThisRound = states.length;
  }
  if (zombiesSpawnedSoFar < states.length) {
    zombiesSpawnedSoFar = states.length;
  }

  states.slice(0, zombieRegistry.length).forEach((state) => {
    const config = getEnemyTypeMeta(state.type);
    const { enemy: restored } = takeEnemyFromPool({
      allowRepair: true,
      reason: 'network-restore'
    });
    if (!restored) {
      recordEnemyIncident('NETWORK_RESTORE_POOL_EXHAUSTED', {
        requestedStates: states.length
      });
      return;
    }

    restored.networkId = state.id || null;
    restored.isNetworkProxy = false;
    restored.handleNetworkHit = null;
    restored.type = config.name;
    restored.health = Math.max(1, Number(state.health) || config.maxHealth);
    restored.maxHealth = Math.max(1, Number(state.maxHealth) || config.maxHealth);
    restored.speed = (
      config.speed + getWaveSpeedBonus(config)
    ) * getAIDirectorTuning().speedScale;
    restored.directorRole = assignEnemyDirectorRole(config.name);
    restored.damage = config.damage;
    restored.attackRate = config.attackCooldown;
    restored.aiTimer = Math.random() * 0.08;
    restored.atkCD = Math.max(0, Number(state.atkCD) || 0);
    restored.attackRange = config.attackRange;
    restored.colRadius = config.colRadius;
    restored.walkT = Number(state.walkT) || 0;
    restored.hitReactT = Number(state.hitReactT) || 0;
    restored.hitReactDir = 1;
    restored.attackAnimT = Number(state.attackAnimT) || 0;
    restored.attackAnimDuration = config.name === 'CRAWLER' ? 0.46 : 0.30;
    restored.rangedLosTimer = 0;
    restored.rangedHasLos = false;
    restored.lastHitDamage = 0;
    restored.lastHitHeadshot = false;
    restored.lastHitAt = 0;
    restored.attackState = String(state.attackState || 'IDLE');
    restored.targetPlayerId = state.targetPlayerId || null;
    restored.dyingT = -1;
    restored.groundUpdateTimer = Math.random() * ENEMY_GROUND_SAMPLE_FAR;
    restored.cachedGroundY = Number(state.position?.y) || 0;
    restored.alive = true;
    restored.originalScale.copy(config.scale);
    restored.scoreReward = config.killScore || 50;
    restored.headshotReward = config.headshotScore || 100;
    restored.bossBounty = config.bossBounty || 0;
    restored.role = config.role || 'standard';

    registerAttackEnemy(restored);
    restored.mesh.scale.copy(config.scale);
    restored.mesh.rotation.set(0, Number(state.yaw) || 0, 0);
    restored.mesh.position.set(
      Number(state.position?.x) || 0,
      Number(state.position?.y) || 0,
      Number(state.position?.z) || 0
    );
    restored.mesh.visible = true;

    restored.mesh.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        if (child.userData.keepMaterial) return;
        child.material = getZombieMaterial(config, child.material);
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    updateProceduralZombieStyle(restored.lodMesh, config);
    activeEnemies.push(restored);
    registerSquadEnemy(restored);
    registerArchetypeEnemy(restored);
    registerFormationEnemy(restored);
    registerNavigationEnemy(restored);
    actorManager.register(restored);
  });

  rebuildZombiePool('network-restore-complete', { record: true });
  enemyWaveGeneration += 1;
  toggleSwarmLighting(isSpecialRound);
  updateRoundHUD(currentWave);
  beginAIDirectorWave(currentWave);
  return activeEnemies.length;
}

export function resumeNetworkWaveAfterMigration(snapshot = {}) {
  if (nextWaveTimeout) return true;

  const waveState = snapshot?.waveState || {};
  const living = activeEnemies.reduce((count, enemy) => (
    count + (enemy?.alive && enemy.dyingT < 0 ? 1 : 0)
  ), 0);
  const total = Math.max(0, Math.floor(Number(
    waveState.zombiesToSpawn
  ) || 0));
  const spawned = Math.max(0, Math.floor(Number(
    waveState.zombiesSpawned
  ) || 0));
  const waveWasCleared = living === 0 && total > 0 && spawned >= total;

  if (waveState.nextWavePending !== true && !waveWasCleared) {
    return false;
  }

  // The old host's timeout cannot survive migration. Use a generation-bound
  // schedule so a timeout from an older authority/run can never start a wave.
  scheduleWaveStart(1200, 'host-migration-resume', currentWave);
  return true;
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
  if (nextWaveTimeout || nextWaveScheduleToken) {
    clearNextWaveSchedule('wave-start');
  }
  enemyWaveGeneration += 1;
  zombiesSpawnedSoFar = 0;
  announcedTypesThisWave = new Set();
  spawnFailureStreak = 0;
  const wavePoolIntegrity = getPoolIntegritySnapshot();
  if (!wavePoolIntegrity.invariantOk) {
    rebuildZombiePool('wave-start', { record: true });
  }
  resetEnemyReliabilityState('wave-start');
  isSpecialRound = (waveNumber > 0 && waveNumber % 5 === 0);
  spawnTimer = isSpecialRound ? -SPECIAL_WAVE_LEAD_IN : -NORMAL_WAVE_LEAD_IN;
  meleeDamageGraceT = 0;
  beginAIDirectorWave(waveNumber);
  recordRunWave(waveNumber);

  // Instantly shift the map lighting.
  toggleSwarmLighting(isSpecialRound);

  const diff = getDifficultyScalar();
  const coopScaling = getCoopScalingProfile();

  if (isSpecialRound) {
    goliathsToSpawn = 0;
    zombiesToSpawnThisRound = Math.min(
      40,
      Math.round((7 + waveNumber * 1.65) * diff * coopScaling.waveCountScale)
    );
    flashWaveBanner(`SWARM ROUND ${waveNumber}`);
  } else {
    // Heavy enemies are now staged more clearly so they do not stack unfairly.
    goliathsToSpawn = waveNumber >= 8 ? Math.min(2, 1 + Math.floor((waveNumber - 8) / 8)) : 0;
    zombiesToSpawnThisRound = Math.min(
      40,
      Math.round((5 + waveNumber * 1.65) * diff * coopScaling.waveCountScale) + goliathsToSpawn
    );
    flashWaveBanner(`ROUND ${waveNumber}`);
  }

  announceWaveStart(waveNumber);
  updateRoundHUD(waveNumber);
}

function completeCurrentWave() {
  if (nextWaveTimeout) return;

  const clearedWave = currentWave;
  const directorResult = completeAIDirectorWave(clearedWave, {
    health: player.health,
    maxHealth: player.maxHealth
  });

  recordProgressionWaveClear(clearedWave);
  recordChallengeWaveClear(clearedWave);
  recordObjectiveWaveClear({ health: player.health, maxHealth: player.maxHealth });
  announceC11Events();

  currentWave++;
  recordRunWave(currentWave);

  flashWaveBanner("ROUND CLEAR", 2500);
  showStatusToast(`ROUND ${clearedWave} CLEAR · NEXT: ${getWaveBriefing(currentWave)}`, '#00d4ff', 2800);
  playUISound('waveClear', 0.62, true, {
    cooldownKey: 'wave_clear',
    cooldownMs: 1800,
    pitchMin: 1.02,
    pitchMax: 1.16
  });

  if (directorResult?.announcement) {
    setTimeout(() => {
      if (!player.alive) return;
      showStatusToast(directorResult.announcement, '#ff66ff', 2300);
    }, 2850);
  }

  scheduleWaveStart(5000, 'round-clear', currentWave);
}

function getSpawnInterval() {
  let baseInterval;

  if (isSpecialRound) {
    baseInterval = Math.max(0.84, 1.12 - currentWave * 0.015);
  } else if (currentWave <= 1) {
    baseInterval = 1.70;
  } else if (currentWave === 2) {
    baseInterval = 1.55;
  } else if (currentWave === 3) {
    baseInterval = 1.38;
  } else if (currentWave === 4) {
    baseInterval = 1.22;
  } else {
    baseInterval = Math.max(0.72, 1.18 - (currentWave - 4) * 0.045);
  }

  return baseInterval
    * getAIDirectorTuning().spawnIntervalScale
    * getCoopScalingProfile().spawnIntervalScale;
}

function getActiveZombieCap() {
  let baseCap;

  if (isSpecialRound) {
    baseCap = Math.min(16, 6 + Math.floor(currentWave * 0.85));
  } else if (currentWave <= 1) {
    baseCap = 4;
  } else if (currentWave === 2) {
    baseCap = 5;
  } else if (currentWave === 3) {
    baseCap = 7;
  } else if (currentWave === 4) {
    baseCap = 8;
  } else {
    baseCap = Math.min(20, 8 + Math.floor((currentWave - 4) * 1.05));
  }

  return Math.min(
    40,
    baseCap
      + getAIDirectorTuning().activeCapBonus
      + getCoopScalingProfile().activeCapBonus
  );
}

function getMeleeDamageGrace() {
  if (currentWave <= 3) return 0.42;
  if (currentWave <= 7) return 0.34;
  return 0.28;
}

function getBaseSpawnMixForWave(wave = currentWave) {
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

function applyMapSpawnPressure(mix, wave = currentWave) {
  if (currentMapId !== 'reactor_courtyard' || isSpecialRound) return mix;

  const adjustments = {
    CRAWLER: wave >= 2 ? 0.018 : 0,
    EXPLODER: wave >= 4 ? 0.016 : 0,
    RANGED: wave >= 5 ? 0.012 : 0
  };
  const totalAdded = Object.values(adjustments).reduce((sum, value) => sum + value, 0);

  return mix.map(([config, weight]) => {
    if (config?.name === 'SHAMBLER') {
      return [config, Math.max(0.20, Number(weight || 0) - totalAdded)];
    }
    return [config, Number(weight || 0) + (adjustments[config?.name] || 0)];
  });
}

function getSpawnMixForWave(wave = currentWave) {
  return adaptEnemySpawnMix(
    applyMapSpawnPressure(getBaseSpawnMixForWave(wave), wave),
    { wave, isSpecialRound }
  );
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

function getSpawnPlayerClearance() {
  if (currentWave <= 3) return EARLY_SPAWN_PLAYER_CLEARANCE;
  if (currentWave <= 7) return 9.0;
  return LATE_SPAWN_PLAYER_CLEARANCE;
}

function getNearestLivingEnemyDistanceSq(x, z) {
  let nearestSq = Infinity;

  for (const enemy of activeEnemies) {
    if (!enemy?.alive || enemy.dyingT >= 0) continue;

    const dx = x - enemy.mesh.position.x;
    const dz = z - enemy.mesh.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < nearestSq) nearestSq = distSq;
  }

  return nearestSq;
}

function pickSafeEnemySpawnPoint() {
  if (spawnPoints.length === 0) return null;

  const playerClearance = getSpawnPlayerClearance();
  const playerClearanceSq = playerClearance * playerClearance;
  const enemyClearanceSq = SPAWN_ENEMY_CLEARANCE * SPAWN_ENEMY_CLEARANCE;
  const safeCandidates = [];

  let bestFallback = spawnPoints[0];
  let bestFallbackScore = -Infinity;

  for (const point of spawnPoints) {
    if (!point) continue;

    const dx = point.x - player.pos.x;
    const dz = point.z - player.pos.z;
    const playerDistSq = dx * dx + dz * dz;
    const enemyDistSq = getNearestLivingEnemyDistanceSq(point.x, point.z);
    const score = Math.sqrt(playerDistSq) + Math.min(8, Math.sqrt(enemyDistSq)) * 0.35 + Math.random() * 0.65;

    if (score > bestFallbackScore) {
      bestFallbackScore = score;
      bestFallback = point;
    }

    if (playerDistSq >= playerClearanceSq && enemyDistSq >= enemyClearanceSq) {
      safeCandidates.push(point);
    }
  }

  if (safeCandidates.length > 0) {
    return safeCandidates[Math.floor(Math.random() * safeCandidates.length)];
  }

  return bestFallback;
}

function applyEnemySeparation(enemy, enemyIndex, dt) {
  if (!enemy?.alive || enemy.dyingT >= 0) return;

  for (let j = 0; j < activeEnemies.length; j++) {
    if (j === enemyIndex) continue;

    const other = activeEnemies[j];
    if (!other?.alive || other.dyingT >= 0) continue;

    let dx = enemy.mesh.position.x - other.mesh.position.x;
    let dz = enemy.mesh.position.z - other.mesh.position.z;
    let distSq = dx * dx + dz * dz;

    const desired = enemy.colRadius + other.colRadius + 0.10;
    if (distSq >= desired * desired) continue;

    if (distSq < 0.0001) {
      dx = enemyIndex % 2 === 0 ? 0.01 : -0.01;
      dz = enemyIndex % 3 === 0 ? 0.01 : -0.01;
      distSq = dx * dx + dz * dz;
    }

    const dist = Math.sqrt(distSq);
    const overlap = desired - dist;
    const correction = Math.min(0.075, overlap * 0.34) * Math.min(1, dt * 12);

    enemy.mesh.position.x += (dx / dist) * correction;
    enemy.mesh.position.z += (dz / dist) * correction;
  }
}

function spawnZombie({ reason = 'timer', allowRepair = true } = {}) {
  const take = takeEnemyFromPool({ allowRepair, reason });
  const recycled = take.enemy;

  if (!recycled) {
    spawnFailures += 1;
    spawnFailureStreak += 1;
    const now = performance.now();
    if (
      spawnFailureStreak === 1
      || now - lastSpawnFailureIncidentAt >= 5000
    ) {
      lastSpawnFailureIncidentAt = now;
      recordEnemyIncident('SPAWN_POOL_EMPTY', {
        reason,
        repaired: take.repaired,
        failureStreak: spawnFailureStreak
      });
    }
    return createSpawnAttemptResult({
      ok: false,
      reason: 'POOL_EMPTY',
      repaired: take.repaired,
      poolSize: zombiePool.length,
      activeCount: activeEnemies.length,
      spawned: zombiesSpawnedSoFar,
      total: zombiesToSpawnThisRound
    });
  }

  const config = pickEnemyTypeConfig();

  try {
    recycled.networkId = null;
    recycled.isNetworkProxy = false;
    recycled.handleNetworkHit = null;
    recycled.targetPlayerId = null;
    recycled.type = config.name;
    const coopScaling = getCoopScalingProfile();
    recycled.health = Math.max(1, Math.round(config.maxHealth * coopScaling.enemyHealthScale));
    recycled.maxHealth = recycled.health;
    const directorTuning = getAIDirectorTuning();
    recycled.speed = (
      config.speed +
      (Math.random() - 0.5) * 0.32 +
      getWaveSpeedBonus(config)
    ) * directorTuning.speedScale;
    recycled.directorRole = assignEnemyDirectorRole(config.name);
    recycled.damage = config.damage;
    recycled.attackRate = config.attackCooldown;
    recycled.aiTimer = Math.random() * 0.15;
    recycled.atkCD = Math.random() * config.attackCooldown;
    recycled.attackRange = config.attackRange;
    recycled.colRadius = config.colRadius;
    recycled.walkT = Math.random() * Math.PI * 2;
    recycled.hitReactT = 0;
    recycled.hitReactDir = 1;
    recycled.attackAnimT = 0;
    recycled.attackAnimDuration = config.name === 'CRAWLER' ? 0.46 : 0.30;
    recycled.rangedLosTimer = Math.random() * 0.12;
    recycled.rangedHasLos = false;
    recycled.lastHitDamage = 0;
    recycled.lastHitHeadshot = false;
    recycled.lastHitAt = 0;
    registerAttackEnemy(recycled);
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

    const spawnPoint = pickSafeEnemySpawnPoint();

    if (spawnPoint) {
      recycled.mesh.position.set(
        spawnPoint.x + (Math.random() - 0.5) * 1.15,
        0,
        spawnPoint.z + (Math.random() - 0.5) * 1.15
      );
    } else {
      recycled.mesh.position.set(0, 0, 0);
    }

    updateProceduralZombieStyle(recycled.lodMesh, config);
    if (!activeEnemies.includes(recycled)) activeEnemies.push(recycled);
    registerSquadEnemy(recycled);
    registerArchetypeEnemy(recycled);
    registerFormationEnemy(recycled);
    registerNavigationEnemy(recycled);
    actorManager.register(recycled);
    zombiesSpawnedSoFar += 1;
    spawnFailureStreak = 0;

    announceEnemyVariant(config);

    const integrity = getPoolIntegritySnapshot();
    if (!integrity.invariantOk) {
      rebuildZombiePool('post-spawn', { record: true });
    }

    return createSpawnAttemptResult({
      ok: true,
      reason: 'SPAWNED',
      repaired: take.repaired,
      poolSize: zombiePool.length,
      activeCount: activeEnemies.length,
      spawned: zombiesSpawnedSoFar,
      total: zombiesToSpawnThisRound
    });
  } catch (error) {
    if (config.name === 'GOLIATH') goliathsToSpawn += 1;
    spawnFailures += 1;
    spawnFailureStreak += 1;
    returnEnemyToPool(recycled, 'spawn-exception');
    recordEnemyIncident('SPAWN_EXCEPTION', {
      reason,
      message: String(error?.message || error || 'unknown').slice(0, 240)
    });
    return createSpawnAttemptResult({
      ok: false,
      reason: 'EXCEPTION',
      repaired: take.repaired,
      poolSize: zombiePool.length,
      activeCount: activeEnemies.length,
      spawned: zombiesSpawnedSoFar,
      total: zombiesToSpawnThisRound
    });
  }
}

const _eToP = new THREE.Vector3();
const _directorMoveTarget = { x: 0, z: 0 };
const _squadMoveTarget = { x: 0, z: 0 };
const _formationMoveTarget = { x: 0, z: 0 };
const _navigationMoveTarget = { x: 0, z: 0 };
const _archetypeMoveTarget = { x: 0, z: 0 };

let multiplayerEnemyAuthority = null;

export function configureMultiplayerEnemyAuthority(config = null) {
  multiplayerEnemyAuthority = config && typeof config === 'object'
    ? config
    : null;
}

function getLocalEnemyTarget() {
  return {
    playerId: multiplayerEnemyAuthority?.localPlayerId || 'local-player',
    isLocal: true,
    pos: player.pos,
    alive: player.alive === true,
    health: Number(player.health || 0),
    maxHealth: Number(player.maxHealth || 100)
  };
}

function getEnemyTargetCandidates() {
  const candidates = [];
  const localTarget = getLocalEnemyTarget();

  if (localTarget.alive) candidates.push(localTarget);

  const remoteTargets = multiplayerEnemyAuthority?.getTargets?.() || [];
  remoteTargets.forEach((target) => {
    if (
      target?.playerId
      && target?.pos
      && target.alive !== false
      && Number(target.health ?? 1) > 0
    ) {
      candidates.push(target);
    }
  });

  return candidates;
}

function findEnemyTargetById(targets, playerId) {
  if (!playerId) return null;
  return targets.find((target) => target.playerId === playerId) || null;
}

function chooseEnemyTarget(enemy, targets, targetLoads) {
  if (!targets.length) return null;

  let bestTarget = null;
  let bestScore = Number.POSITIVE_INFINITY;

  targets.forEach((target) => {
    const dx = Number(target.pos.x || 0) - enemy.mesh.position.x;
    const dz = Number(target.pos.z || 0) - enemy.mesh.position.z;
    const distance = Math.hypot(dx, dz);
    const load = targetLoads.get(target.playerId) || 0;
    const stickyBonus = enemy.targetPlayerId === target.playerId ? -2.25 : 0;
    const score = distance + load * 2.4 + stickyBonus;

    if (score < bestScore) {
      bestScore = score;
      bestTarget = target;
    }
  });

  if (bestTarget) {
    enemy.targetPlayerId = bestTarget.playerId;
    targetLoads.set(
      bestTarget.playerId,
      (targetLoads.get(bestTarget.playerId) || 0) + 1
    );
  }

  return bestTarget;
}

function damageEnemyTarget(
  target,
  damage,
  sourcePosition = null,
  damageType = 'UNKNOWN'
) {
  if (!target || target.alive === false) return false;

  if (target.isLocal || !multiplayerEnemyAuthority?.damageTarget) {
    damagePlayer(damage, sourcePosition, damageType);
    return true;
  }

  return multiplayerEnemyAuthority.damageTarget(
    target,
    damage,
    sourcePosition,
    damageType
  ) !== false;
}

function hasRangedLineOfSight(enemy, targetPosition = player.pos) {
  rangedSightOrigin.set(
    enemy.mesh.position.x,
    enemy.mesh.position.y + 1.18,
    enemy.mesh.position.z
  );
  rangedSightTarget.set(
    Number(targetPosition?.x || 0),
    Number(targetPosition?.y || 0) - 0.10,
    Number(targetPosition?.z || 0)
  );
  rangedSightDirection.subVectors(rangedSightTarget, rangedSightOrigin);

  const distance = rangedSightDirection.length();
  if (distance <= 0.3) return true;

  rangedSightDirection.multiplyScalar(1 / distance);
  rangedSightRay.near = 0.15;
  rangedSightRay.far = Math.max(0.15, distance - 0.25);
  rangedSightRay.ray.origin.copy(rangedSightOrigin);
  rangedSightRay.ray.direction.copy(rangedSightDirection);

  rangedSightHits.length = 0;
  rangedSightRay.intersectObjects(mapMeshes, false, rangedSightHits);

  for (const hit of rangedSightHits) {
    const object = hit?.object;
    if (!object) continue;

    if (
      object.userData?.isMapDressing ||
      object.userData?.playerNonBlockingProjectile
    ) {
      continue;
    }

    return false;
  }

  return true;
}

function canRangedAttackPlayer(
  enemy,
  horizontalDist,
  verticalDist,
  dt,
  targetPosition = player.pos
) {
  if (enemy.type !== 'RANGED') return false;

  const tuning = getAIDirectorTuning();
  const elevationResponse = Math.max(
    0,
    Number(tuning.rangedElevationResponse) || 0
  );
  const maxHorizontal = enemy.attackRange + elevationResponse * 3.0;
  const maxVertical = 2.2 + elevationResponse * 4.2;

  if (
    horizontalDist > maxHorizontal ||
    verticalDist > maxVertical
  ) {
    return false;
  }

  enemy.rangedLosTimer = Math.max(
    0,
    (enemy.rangedLosTimer || 0) - dt
  );

  if (enemy.rangedLosTimer <= 0) {
    enemy.rangedLosTimer = 0.12 + Math.random() * 0.08;
    enemy.rangedHasLos = hasRangedLineOfSight(enemy, targetPosition);
  }

  return enemy.rangedHasLos === true;
}


function resetEnemyReliabilityState(reason = 'reset') {
  enemyReliabilityState = createWaveWatchdogState(currentWave);
  enemyReliabilitySnapshot = Object.freeze({
    patch: WAVE_SPAWN_INTEGRITY_PATCH,
    wave: currentWave,
    reason: String(reason || 'reset'),
    action: 'NONE',
    repairs: enemyReliabilityRepairs,
    relocated: enemyReliabilityRelocated,
    restoredVisuals: enemyReliabilityRestoredVisuals,
    recycledDying: enemyReliabilityRecycledDying,
    spawnerKicks: enemyReliabilitySpawnerKicks,
    forcedWaveCompletions: enemyReliabilityForcedWaveCompletions,
    runGeneration: enemyRunGeneration,
    waveGeneration: enemyWaveGeneration,
    poolRebuilds,
    spawnFailures,
    spawnFailureStreak,
    staleWaveSchedulesIgnored,
    pool: getPoolIntegritySnapshot(),
    latestIncident: enemyIncidents[enemyIncidents.length - 1] || null,
    incidents: Object.freeze(enemyIncidents.slice(-12)),
    counts: inspectEnemyReliability(activeEnemies)
  });
}

function recycleStaleEnemy(enemy, index) {
  if (!enemy) return false;
  recordSquadEnemyDeath(enemy);
  recordNavigationEnemyRemoved(enemy);
  recordFormationEnemyRemoved(enemy);
  if (activeEnemies[index] === enemy) activeEnemies.splice(index, 1);
  const returned = returnEnemyToPool(enemy, 'stale-dying');
  if (returned) enemyReliabilityRecycledDying += 1;
  return returned;
}

function repairEnemyReliabilityState() {
  let repaired = 0;
  const safeSpawn = pickSafeEnemySpawnPoint();

  for (let index = activeEnemies.length - 1; index >= 0; index -= 1) {
    const enemy = activeEnemies[index];
    if (!enemy?.mesh) {
      activeEnemies.splice(index, 1);
      repaired += 1;
      continue;
    }

    if (enemy.alive !== true && Number(enemy.dyingT) >= 1.25) {
      if (recycleStaleEnemy(enemy, index)) repaired += 1;
      continue;
    }

    if (enemy.alive !== true || Number(enemy.dyingT) >= 0) continue;

    const position = enemy.mesh.position;
    const invalidPosition = (
      !Number.isFinite(Number(position?.x))
      || !Number.isFinite(Number(position?.y))
      || !Number.isFinite(Number(position?.z))
      || Math.abs(Number(position.x)) > 150
      || Math.abs(Number(position.z)) > 150
      || Number(position.y) < -18
      || Number(position.y) > 100
    );

    if (invalidPosition) {
      const fallback = safeSpawn || player.pos;
      position.set(
        Number(fallback?.x) || 0,
        Number(fallback?.y) || 0,
        Number(fallback?.z) || 0
      );
      enemy.cachedGroundY = Number(position.y) || 0;
      enemy.groundUpdateTimer = 0;
      enemyReliabilityRelocated += 1;
      repaired += 1;
    }

    if (enemy.mesh.visible === false) {
      enemy.mesh.visible = true;
      setEnemyVisual(enemy, enemy._useFullVisual === true);
      enemyReliabilityRestoredVisuals += 1;
      repaired += 1;
    }

    const scale = enemy.mesh.scale;
    if (
      !Number.isFinite(Number(scale?.x))
      || !Number.isFinite(Number(scale?.y))
      || !Number.isFinite(Number(scale?.z))
      || Math.abs(Number(scale.x)) < 0.01
      || Math.abs(Number(scale.y)) < 0.01
      || Math.abs(Number(scale.z)) < 0.01
    ) {
      enemy.mesh.scale.copy(enemy.originalScale || new THREE.Vector3(1, 1, 1));
      repaired += 1;
    }
  }

  const poolIntegrity = getPoolIntegritySnapshot();
  if (!poolIntegrity.invariantOk) {
    const poolRepair = rebuildZombiePool('enemy-reliability', { record: true });
    if (poolRepair.repaired) repaired += 1;
  }

  if (repaired > 0) enemyReliabilityRepairs += repaired;
  return repaired;
}

function updateEnemyReliability(dt) {
  const before = inspectEnemyReliability(activeEnemies);
  const result = updateWaveWatchdog(enemyReliabilityState, {
    wave: currentWave,
    total: zombiesToSpawnThisRound,
    spawned: zombiesSpawnedSoFar,
    living: before.living,
    dying: before.dying,
    hiddenLiving: before.hiddenLiving,
    invalidPosition: before.invalidPosition,
    staleDying: before.staleDying,
    nextWavePending: nextWaveTimeout !== null
  }, dt);

  enemyReliabilityState = result.state;

  if (result.action === 'REPAIR_ENEMIES') {
    repairEnemyReliabilityState();
  } else if (result.action === 'KICK_SPAWNER') {
    if (
      zombiesSpawnedSoFar < zombiesToSpawnThisRound
      && activeEnemies.length < getActiveZombieCap()
      && getEnemyTargetCandidates().length > 0
    ) {
      const attempt = spawnZombie({
        reason: 'watchdog-kick',
        allowRepair: true
      });
      if (attempt.ok) {
        spawnTimer = 0;
        enemyReliabilitySpawnerKicks += 1;
        enemyReliabilityState = createWaveWatchdogState(currentWave);
      } else {
        spawnTimer = Math.max(spawnTimer, getSpawnInterval());
      }
    } else {
      spawnTimer = Math.max(spawnTimer, getSpawnInterval());
    }
  } else if (result.action === 'COMPLETE_WAVE' && !nextWaveTimeout) {
    enemyReliabilityForcedWaveCompletions += 1;
    completeCurrentWave();
    enemyReliabilityState = createWaveWatchdogState(currentWave);
  }

  const after = inspectEnemyReliability(activeEnemies);
  enemyReliabilitySnapshot = Object.freeze({
    patch: WAVE_SPAWN_INTEGRITY_PATCH,
    wave: currentWave,
    action: result.action,
    repairs: enemyReliabilityRepairs,
    relocated: enemyReliabilityRelocated,
    restoredVisuals: enemyReliabilityRestoredVisuals,
    recycledDying: enemyReliabilityRecycledDying,
    spawnerKicks: enemyReliabilitySpawnerKicks,
    forcedWaveCompletions: enemyReliabilityForcedWaveCompletions,
    spawned: zombiesSpawnedSoFar,
    total: zombiesToSpawnThisRound,
    nextWavePending: nextWaveTimeout !== null,
    runGeneration: enemyRunGeneration,
    waveGeneration: enemyWaveGeneration,
    poolRebuilds,
    spawnFailures,
    spawnFailureStreak,
    staleWaveSchedulesIgnored,
    pool: getPoolIntegritySnapshot(),
    latestIncident: enemyIncidents[enemyIncidents.length - 1] || null,
    incidents: Object.freeze(enemyIncidents.slice(-12)),
    watchdog: enemyReliabilityState,
    counts: after
  });
}

export function getEnemyReliabilitySnapshot() {
  return enemyReliabilitySnapshot;
}


export function updateEnemies(dt) {
  const teamTargets = getEnemyTargetCandidates();
  if (teamTargets.length === 0) return;

  const targetLoads = new Map();

  meleeDamageGraceT = Math.max(0, meleeDamageGraceT - dt);
  updateAIAttackCoordinator(dt, activeEnemies);
  updateAIArchetypeCoordinator(dt, {
    enemies: activeEnemies,
    player
  });
  updateAIFormation(dt, {
    enemies: activeEnemies,
    player,
    tuning: {
      ...getAIDirectorTuning(),
      wave: currentWave
    }
  });
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
    if (p.life <= 0) return;

    p.prevPos.copy(p.mesh.position);
    p.mesh.position.addScaledVector(p.dir, dt * 14.0);
    p.life -= dt;
    p.trailTimer -= dt;

    if (p.trailTimer <= 0) {
      p.trailTimer = 0.045;
      spawnEnemyProjectileTrail(p.mesh.position);
    }

    const segment = rangedSightDirection.subVectors(p.mesh.position, p.prevPos);
    const segmentLength = segment.length();
    let impactedWorld = false;

    if (segmentLength > 0.001) {
      rangedSightRay.near = 0;
      rangedSightRay.far = segmentLength;
      rangedSightRay.ray.origin.copy(p.prevPos);
      rangedSightRay.ray.direction.copy(segment).multiplyScalar(1 / segmentLength);
      rangedSightHits.length = 0;
      rangedSightRay.intersectObjects(mapMeshes, false, rangedSightHits);

      for (const hit of rangedSightHits) {
        if (hit.object?.userData?.isMapDressing || hit.object?.userData?.playerNonBlockingProjectile) continue;
        spawnEnemyProjectileImpact(hit.point, false);
        recordAIAttackProjectileResult(false);
        p.life = 0;
        p.mesh.visible = false;
        p.elevatedResponse = false;
        impactedWorld = true;
        break;
      }
    }

    if (impactedWorld) return;

    const projectileTarget = findEnemyTargetById(
      teamTargets,
      p.targetPlayerId
    ) || teamTargets[0] || null;

    if (!projectileTarget) {
      p.life = 0;
      p.mesh.visible = false;
      return;
    }

    const pdx = projectileTarget.pos.x - p.mesh.position.x;
    const pdy = projectileTarget.pos.y - p.mesh.position.y;
    const pdz = projectileTarget.pos.z - p.mesh.position.z;

    if ((pdx * pdx + pdy * pdy + pdz * pdz) < 1.0) {
      damageEnemyTarget(
        projectileTarget,
        20,
        p.mesh.position,
        'RANGED'
      );
      spawnEnemyProjectileImpact(p.mesh.position, true);
      recordAIAttackProjectileResult(true);

      if (p.elevatedResponse) {
        recordAIExploitRangedResponse({ hit: true });
      }

      p.elevatedResponse = false;
      p.life = 0;
      p.mesh.visible = false;
      return;
    }

    if (p.life <= 0) {
      recordAIAttackProjectileResult(false);
      p.elevatedResponse = false;
      p.mesh.visible = false;
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
        const nukePoints = scaleEconomyReward(400, 'NUKE');
        player.score += nukePoints; updateScoreHUD(player.score); spawnFloatingScore(nukePoints, false);
        recordRunPointsEarned(nukePoints);
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
      const attempt = spawnZombie({
        reason: 'spawn-timer',
        allowRepair: true
      });
      if (attempt.ok) {
        spawnTimer = 0;
      } else {
        // Keep the timer eligible so the next frame retries instead of
        // silently waiting through another full interval.
        spawnTimer = Math.max(spawnTimer, getSpawnInterval());
      }
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
    e.attackAnimT = Math.max(0, (e.attackAnimT || 0) - dt);

    if (e.dyingT >= 0) {
      e.dyingT += dt; 
      const t = Math.min(e.dyingT / 0.75, 1);
      const fall = THREE.MathUtils.smoothstep(t, 0, 1);

      if (e.lodMesh) {
        updateProceduralZombieMotion(e.lodMesh, visualAnimTime, 0.0, {
          hitReactT: 0,
          hitReactDir: e.hitReactDir || 1,
          attackT: 0,
          attackDuration: e.attackAnimDuration || 0.30,
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
        activeEnemies.splice(i, 1);
        returnEnemyToPool(e, 'death-animation-complete');

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
        if (inX && inZ) {
          e.health = 0;
          const trapCreditPlayerId = t.activatedByPlayerId
            || multiplayerEnemyAuthority?.localPlayerId
            || null;
          killEnemy(e, {
            source: 'TRAP',
            creditPlayerId: trapCreditPlayerId,
            creditLocal: trapCreditPlayerId === multiplayerEnemyAuthority?.localPlayerId
          });
          zapped = true;
          break;
        }
      }
    }
    if (zapped) continue;

// Calculate dynamic distance components against the assigned living player.
    const enemyTarget = chooseEnemyTarget(e, teamTargets, targetLoads);
    if (!enemyTarget) continue;

    const targetPos = enemyTarget.pos;
    _eToP.set(
      targetPos.x - e.mesh.position.x,
      targetPos.y - e.mesh.position.y,
      targetPos.z - e.mesh.position.z
    );
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
      attackT: e.attackAnimT,
      attackDuration: e.attackAnimDuration || 0.30,
      attackState: e.attackState,
      attackKind: e.attackKind,
      telegraphProgress: e.attackTelegraphProgress,
      runnerBurstT: e.runnerBurstT,
      runnerBurstDuration: e.runnerBurstDuration,
      spitterRepositionT: e.spitterRepositionT,
      spitterRepositionDuration: e.spitterRepositionDuration,
      bruteBraceT: e.bruteBraceT,
      bruteBraceDuration: e.bruteBraceDuration,
      goliathPhase: e.goliathPhase,
      goliathPhasePulseT: e.goliathPhasePulseT,
      goliathPhasePulseDuration: e.goliathPhasePulseDuration,
      exploderStage: e.exploderStage,
      deathT: e.dyingT
    }
  );
}
    // Reachability/perch state is measured centrally by ai_exploit.js.
    // Valid authored elevated cover receives ranged counterplay, not spores.

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

    if (enemyTarget.isLocal) {
      getDirectorPursuitTarget(e, player, _directorMoveTarget);
      getSquadPursuitTarget(
        e,
        player,
        _directorMoveTarget,
        traps,
        _squadMoveTarget
      );

      getFormationPursuitTarget(
        e,
        player,
        _squadMoveTarget,
        _formationMoveTarget
      );

      getReliableNavigationTarget(
        e,
        player,
        _formationMoveTarget,
        walls,
        traps,
        _navigationMoveTarget,
        dt
      );

      getArchetypePursuitTarget(
        e,
        player,
        _navigationMoveTarget,
        _archetypeMoveTarget
      );
    } else {
      // Remote operatives use direct host-authoritative pursuit until the
      // navigation modules accept generic player targets.
      _archetypeMoveTarget.x = targetPos.x;
      _archetypeMoveTarget.z = targetPos.z;
    }

    if (horizontalDist > 0.1) {
      e.mesh.lookAt(_archetypeMoveTarget.x, e.mesh.position.y, _archetypeMoveTarget.z);
    }

    const rangedCanAttack = canRangedAttackPlayer(
      e,
      horizontalDist,
      trueVerticalDist,
      dt,
      targetPos
    );

    if (consumeAttackTelegraphStart(e)) {
      spawnEnemyAttackWarning(
        e.mesh.position,
        e.attackKind,
        e.attackWindupDuration
      );

      if (e.attackKind === 'RANGED') {
        playEnemySound('rangedCharge', 0.34, false, {
          cooldownKey: `spitter_charge_${e.squadId || i}`,
          cooldownMs: 500
        });
      } else if (e.attackKind === 'EXPLODER') {
        playEnemySound('exploderPrime', 0.48, false, {
          cooldownKey: `exploder_prime_${e.squadId || i}`,
          cooldownMs: 700
        });
      } else if (e.attackKind === 'CRAWLER') {
        playEnemySound('crawlerAttack', 0.22, true, {
          cooldownKey: `crawler_attack_${e.squadId || i}`,
          cooldownMs: 320,
          pitchMin: 0.92,
          pitchMax: 1.08
        });
      } else if (e.attackKind === 'HEAVY_BRUTE' || e.attackKind === 'HEAVY_GOLIATH') {
        playEnemySound('heavyWindup', e.attackKind === 'HEAVY_GOLIATH' ? 0.50 : 0.38, true, {
          cooldownKey: `heavy_windup_${e.squadId || i}`,
          cooldownMs: 650,
          pitchMin: e.attackKind === 'HEAVY_GOLIATH' ? 0.62 : 0.74,
          pitchMax: e.attackKind === 'HEAVY_GOLIATH' ? 0.74 : 0.86
        });
      }
    }

    const interruptedKind = consumeAttackInterrupted(e);
    if (interruptedKind) {
      spawnEnemyAttackInterrupted(e.mesh.position);
      playEnemySound('attackInterrupted', 0.24, true, {
        cooldownKey: 'enemy_attack_interrupted',
        cooldownMs: 120,
        pitchMin: 0.95,
        pitchMax: 1.12
      });
      e.atkCD = Math.max(e.atkCD, 0.32);
    }

    const archetypeEvent = consumeArchetypeEvent(e);
    if (archetypeEvent) {
      spawnEnemyArchetypePulse(e.mesh.position, archetypeEvent);

      if (archetypeEvent === 'RUNNER_BURST') {
        playEnemySound('runnerBurst', 0.28, true, {
          cooldownKey: 'runner_burst_identity',
          cooldownMs: 220,
          pitchMin: 0.96,
          pitchMax: 1.08
        });
      } else if (archetypeEvent === 'SPITTER_REPOSITION') {
        playEnemySound('spitterReposition', 0.24, true, {
          cooldownKey: 'spitter_reposition_identity',
          cooldownMs: 260,
          pitchMin: 0.96,
          pitchMax: 1.06
        });
      } else if (archetypeEvent === 'BRUTE_BRACE') {
        playEnemySound('bruteBrace', 0.34, true, {
          cooldownKey: 'brute_brace_identity',
          cooldownMs: 520,
          pitchMin: 0.72,
          pitchMax: 0.84
        });
      } else if (archetypeEvent.startsWith('GOLIATH_PHASE_')) {
        playEnemySound('goliathPhase', 0.54, false, {
          cooldownKey: 'goliath_phase_identity',
          cooldownMs: 900
        });
      }
    }

// ── MOVEMENT & STAIRWAY ROUTING ENGINE ──
    const attackMovementLocked = e.attackState === 'WINDUP' || (
      e.attackState === 'RECOVERY' &&
      (e.attackKind === 'HEAVY_BRUTE' || e.attackKind === 'HEAVY_GOLIATH')
    );
    const archetypeForceMove = shouldArchetypeForceMove(e);

    if (
      !attackMovementLocked &&
      (
        archetypeForceMove ||
        (
          !rangedCanAttack &&
          (horizontalDist > e.attackRange || trueVerticalDist > 1.8)
        )
      )
    ) {
      const oldWalk = e.walkT;
      const hitMoveScale = e.hitReactT > 0
        ? getArchetypeHitMoveScale(e)
        : 1.0;
      const moveSpeed = e.speed * hitMoveScale * getArchetypeMovementScale(e) * getFormationMovementScale(e);
      e.walkT += dt * moveSpeed * 3.5;
      
      const moveTargetX = _archetypeMoveTarget.x - e.mesh.position.x;
      const moveTargetZ = _archetypeMoveTarget.z - e.mesh.position.z;
      const moveTargetDistance = Math.max(0.001, Math.hypot(moveTargetX, moveTargetZ));

      let moveX = moveTargetX / moveTargetDistance;
      let moveZ = moveTargetZ / moveTargetDistance;

      // ── THE MULTISTORY NAV-MESH FIX ──
      // If player is upstairs (Y > 4) and zombie is down below, route them to the steps!
      if (currentMap === 4 && targetPos.y > 4.0 && e.mesh.position.y < 4.0) {
        
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

      e.mesh.position.x += moveX * moveSpeed * dt;
      e.mesh.position.z += moveZ * moveSpeed * dt;

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

    // Keep close enemies from occupying the same point and forming an unreadable pile.
    applyEnemySeparation(e, i, dt);
    pushOut(e.mesh.position, e.colRadius);

    // ── ATTACK TELEGRAPH, COMMIT, AND COUNTERPLAY ──
    e.atkCD -= dt;

    const canAttackNow = e.type === 'RANGED'
      ? rangedCanAttack
      : (
        horizontalDist <= e.attackRange &&
        trueVerticalDist <= 1.8
      );

    if (e.attackState === 'QUEUED' && !canAttackNow) {
      cancelEnemyAttack(e, 'TARGET MOVED');
    }

    const commitRangePadding = e.type === 'GOLIATH'
      ? 0.60
      : (e.type === 'BRUTE'
        ? 0.42
        : (e.type === 'EXPLODER' ? 0.55 : 0.26));
    const canCommitTelegraph = e.attackKind === 'RANGED'
      ? rangedCanAttack
      : (
        horizontalDist <= e.attackRange + commitRangePadding &&
        trueVerticalDist <= 1.9
      );

    advanceEnemyAttack(e, dt, {
      canCommit: canCommitTelegraph,
      onCommit: (kind) => {
        if (kind === 'RANGED') {
          e.atkCD = e.attackRate * getArchetypeAttackCooldownScale(e);
          e.attackAnimT = 0.30;
          e.attackAnimDuration = 0.30;

          const pool = projectilePool;
          const projectile = pool.items[pool.index];
          projectile.mesh.position.copy(e.mesh.position);
          projectile.mesh.position.y += 1.2;
          projectile.prevPos.copy(projectile.mesh.position);
          projectile.dir.subVectors(
            targetPos,
            projectile.mesh.position
          ).normalize();
          projectile.targetPlayerId = enemyTarget.playerId;
          projectile.life = 2.5;
          projectile.trailTimer = 0;
          projectile.elevatedResponse = trueVerticalDist > 1.8;
          projectile.mesh.visible = true;
          pool.index = (pool.index + 1) % MAX_PROJECTILES;

          if (projectile.elevatedResponse) {
            recordAIExploitRangedResponse({ hit: false });
          }

          playEnemySound('ranged', 0.32, true, {
            cooldownKey: 'ranged_enemy_shot',
            cooldownMs: 120
          });
          recordArchetypeAttackCommitted(e, kind);
          return;
        }

        if (kind === 'EXPLODER') {
          e.atkCD = 999;
          recordArchetypeAttackCommitted(e, kind);
          killEnemy(e);
          return;
        }

        if (kind === 'CRAWLER' || kind === 'HEAVY_BRUTE' || kind === 'HEAVY_GOLIATH') {
          e.atkCD = e.attackRate * getArchetypeAttackCooldownScale(e);
          meleeDamageGraceT = getMeleeDamageGrace();

          if (kind === 'CRAWLER') {
            e.attackAnimDuration = 0.46;
            e.attackAnimT = 0.46;
          } else {
            e.attackAnimDuration = kind === 'HEAVY_GOLIATH' ? 0.58 : 0.46;
            e.attackAnimT = e.attackAnimDuration;
          }

          recordArchetypeAttackCommitted(e, kind);
          damageEnemyTarget(
            enemyTarget,
            e.damage,
            e.mesh.position,
            e.type
          );
          e.mesh.position.x -= (_eToP.x / (horizontalDist || 1)) * 0.22;
          e.mesh.position.z -= (_eToP.z / (horizontalDist || 1)) * 0.22;
          pushOut(e.mesh.position, e.colRadius);
        }
      }
    });

    if (
      e.attackState === 'IDLE' &&
      canAttackNow &&
      e.atkCD <= 0 &&
      enemyTarget.alive
    ) {
      if (
        ['EXPLODER', 'RANGED', 'GOLIATH', 'BRUTE', 'CRAWLER'].includes(e.type)
      ) {
        const exploitPriority = e.type === 'RANGED'
          ? Math.max(
            0,
            Number(getAIDirectorTuning().rangedElevationResponse) || 0
          )
          : 0;
        const profile = getArchetypeAttackProfile(e, {
          exploitPriority
        });

        if (
          profile &&
          canArchetypeRequestAttack(e) &&
          (e.type !== 'CRAWLER' || meleeDamageGraceT <= 0)
        ) {
          if (e.type === 'CRAWLER') {
            meleeDamageGraceT = getMeleeDamageGrace();
          }
          queueEnemyAttack(e, profile.kind, profile);
        }
      }
      else if (meleeDamageGraceT <= 0) {
        e.atkCD = e.attackRate * getArchetypeAttackCooldownScale(e);
        meleeDamageGraceT = getMeleeDamageGrace();
        e.attackAnimDuration = 0.32;
        e.attackAnimT = 0.32;

        damageEnemyTarget(
          enemyTarget,
          e.damage,
          e.mesh.position,
          e.type
        );
        e.mesh.position.x -= (_eToP.x / (horizontalDist || 1)) * 0.22;
        e.mesh.position.z -= (_eToP.z / (horizontalDist || 1)) * 0.22;
        pushOut(e.mesh.position, e.colRadius);
      } else {
        e.attackAnimDuration = 0.18;
        e.attackAnimT = Math.max(e.attackAnimT, e.attackAnimDuration);
        e.atkCD = Math.min(e.attackRate, 0.12 + Math.random() * 0.10);
      }
    }
  } // <-- End of activeEnemies loop

  // ── LAST-RESORT EXPLOIT FALLBACK ──
  const exploit = getAIExploitSnapshot();

  if (exploit.toxicPunishEligible) {
    campWarningTimer += dt;

    if (campWarningTimer > 4.0) {
      damagePlayer(15, null, 'SPORE');
      flashWaveBanner("WARNING: TOXIC SPORES! MOVE TO VALID GROUND!", 1000);
      playEnemySound('spore', 0.16, true, {
        cooldownKey: 'toxic_spores',
        cooldownMs: 1100,
        pitchMin: 0.72,
        pitchMax: 0.90
      });
      campWarningTimer = 3.0;
    }
  } else {
    campWarningTimer = Math.max(0, campWarningTimer - dt * 1.5);
  }

  updateEnemyReliability(dt);
} // <-- End of updateEnemies function

export function killEnemy(e, context = {}) {
  if (!e.alive) return;

  const headshot = context.headshot === true;
  const distance = Math.max(
    0,
    Number(context.distance) || player.pos.distanceTo(e.mesh.position)
  );
  const localPlayerId = multiplayerEnemyAuthority?.localPlayerId || null;
  const creditPlayerId = context.creditPlayerId
    || context.playerId
    || localPlayerId;
  const onlineCredit = Boolean(
    multiplayerEnemyAuthority?.awardKill
    && creditPlayerId
  );
  const creditLocal = context.creditLocal !== false
    && (!onlineCredit || creditPlayerId === localPlayerId);

  if (creditLocal) {
    recordProgressionKill({ headshot });
    recordRunKill({ headshot });
    recordChallengeKill({ headshot, enemyType: e.type });
    recordObjectiveKill({
      headshot,
      distance,
      enemyType: e.type,
      position: e.mesh.position
    });
    announceC11Events();
  }

  cancelEnemyAttack(e, 'ENEMY REMOVED');
  recordSquadEnemyDeath(e);
  recordFormationEnemyRemoved(e);
  recordNavigationEnemyRemoved(e);
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
    
    const explosionTargets = getEnemyTargetCandidates();
    explosionTargets.forEach((target) => {
      const dx = target.pos.x - e.mesh.position.x;
      const dy = target.pos.y - e.mesh.position.y;
      const dz = target.pos.z - e.mesh.position.z;
      if ((dx * dx + dy * dy + dz * dz) < 25) {
        damageEnemyTarget(target, e.damage, e.mesh.position, 'EXPLODER');
      }
    });
  }
  
  if (onlineCredit) {
    const reward = getEnemyPointReward(e, headshot);
    const multiplier = context.doublePoints === true ? 2 : 1;
    const points = Math.max(
      0,
      (Number(reward?.basePoints) || 0)
      + (Number(reward?.bonusPoints) || 0)
    ) * multiplier;

    multiplayerEnemyAuthority.awardKill({
      playerId: creditPlayerId,
      points,
      kills: 1,
      label: headshot
        ? `${String(reward?.label || e.type).toUpperCase()} HEADSHOT`
        : String(reward?.label || e.type).toUpperCase(),
      headshot
    });
  } else {
    player.kills++;
    updateKillsHUD(player.kills);
  }
  
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

export function applyNetworkWaveState(
  waveNumber,
  specialRound = false
) {
  currentWave = Math.max(1, Math.floor(Number(waveNumber) || 1));
  isSpecialRound = specialRound === true;
  updateRoundHUD(currentWave);
}
