// js/enemy.js
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { scene, camera, spawnPoints, addScreenShake, mapMeshes, currentMap, barricades, walls, traps, toggleSwarmLighting } from './map.js';
import { player, damagePlayer } from './player.js';
import { updateKillsHUD, updateRoundHUD, flashWaveBanner, updateScoreHUD, spawnFloatingScore } from './ui.js';
import { spawnBloodBurst } from './particles.js';
import { giveMaxAmmo } from './weapons.js';
import { playSound } from './audio.js';
import { pushOut } from './utils.js';
import { difficultyMultiplier, ASSETS } from './main.js';
import { createProceduralZombieVisual, updateProceduralZombieStyle, updateProceduralZombieMotion} from './actors/procedural_zombie.js';

export const activeEnemies = [];
const activePowerups = [];
const groundRay = new THREE.Raycaster();
const groundRayDir = new THREE.Vector3(0, -1, 0);

// ── OPTIMIZATION: STRICT 3D MESH POOLING ──
const MAX_ZOMBIES = 40;
const MAX_PROJECTILES = 15;
const MAX_EXPLOSIONS = 15;

const zombiePool = [];
const projectilePool = { items: [], index: 0 };
const explosionPool = { items: [], index: 0 };
const materialCache = {};
let poolsInitialized = false;

function getZombieMaterial(config, baseMaterial) {
  // We append whether it has a map so the cache doesn't mix up GLBs and capsules!
  const matKey = config.name + (baseMaterial.map ? "_tex" : "_notex");
  
  if (!materialCache[matKey]) {
    const newMat = baseMaterial.clone();
    
    // Kill the shiny plastic look globally
    newMat.metalness = config.name === "GOLIATH" ? 0.2 : 0.0;
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
  
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir); camDir.y = 0; camDir.normalize();
  const toEnemy = new THREE.Vector3().subVectors(ePos, player.pos); toEnemy.y = 0; toEnemy.normalize();
  const rightVec = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
  const panX = toEnemy.dot(rightVec);
  
  const vol = Math.max(0, 1 - (dist / 18)) * (type === "GOLIATH" ? 1.5 : 0.6);
  const gain = audioCtx.createGain();
  const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

  if (panner) { panner.pan.value = panX; gain.connect(panner); panner.connect(audioCtx.destination); } 
  else { gain.connect(audioCtx.destination); }

  if (isFootstep) {
    const source = audioCtx.createBufferSource(); source.buffer = noiseBuffer;
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.value = type === "GOLIATH" ? 300 : 800; 
    source.connect(filter); filter.connect(gain);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    source.start();
  } else {
    const osc = audioCtx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(type === "GOLIATH" ? 30 : 60, audioCtx.currentTime);
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === "GOLIATH" ? 100 : 200, audioCtx.currentTime);
    filter.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 0.5);
    osc.connect(filter); filter.connect(gain);
    gain.gain.setValueAtTime(vol * 0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.start(); osc.stop(audioCtx.currentTime + 0.5);
  }
}

// ── WAVE SYSTEM ──
export let currentWave = 1; let zombiesToSpawnThisRound = 0; let zombiesSpawnedSoFar = 0; let goliathsToSpawn = 0; let spawnTimer = 0;
export let isSpecialRound = false;
let campWarningTimer = 0; // ◄── THIS IS THE MISSING VARIABLE!

const ENEMY_TYPES = {
  SHAMBLER: { name: "SHAMBLER", speed: 2.4, maxHealth: 100, damage: 15, attackCooldown: 1.4, attackRange: 1.4, colRadius: 0.45, color: 0x446644, scale: new THREE.Vector3(1, 1, 1) },
  RUNNER:   { name: "RUNNER", speed: 10.5, maxHealth: 65, damage: 10, attackCooldown: 0.8, attackRange: 1.4, colRadius: 0.40, color: 0x883333, scale: new THREE.Vector3(0.85, 1.05, 0.85) },
  GOLIATH:  { name: "GOLIATH", speed: 1.6, maxHealth: 1500, damage: 45, attackCooldown: 2.2, attackRange: 3.2, colRadius: 1.20, color: 0x1a1a1a, scale: new THREE.Vector3(1.8, 1.8, 1.8) },
  EXPLODER: { name: "EXPLODER", speed: 4.8, maxHealth: 70, damage: 45, attackCooldown: 0, attackRange: 2.5, colRadius: 0.50, color: 0xff4400, scale: new THREE.Vector3(1.15, 1.15, 1.15) },
  RANGED:   { name: "RANGED", speed: 2.0, maxHealth: 80, damage: 20, attackCooldown: 2.5, attackRange: 12.0, colRadius: 0.40, color: 0x00ffff, scale: new THREE.Vector3(0.8, 1.2, 0.8) }
};

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
  actorManager.clear();
  campWarningTimer = 0;
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

function startWave(waveNumber) {
  zombiesSpawnedSoFar = 0; spawnTimer = 0;
  isSpecialRound = (waveNumber > 0 && waveNumber % 5 === 0);
  
  // Instantly shift the map lighting!
  toggleSwarmLighting(isSpecialRound);

  if (isSpecialRound) {
    goliathsToSpawn = 0; 
    zombiesToSpawnThisRound = 8 + (waveNumber * 2); 
    flashWaveBanner(`SWARM ROUND ${waveNumber}`);
  } else {
    goliathsToSpawn = waveNumber > 5 ? Math.floor(waveNumber / 4) : 0; 
    zombiesToSpawnThisRound = 4 + (waveNumber * 2) + goliathsToSpawn; 
    flashWaveBanner(`ROUND ${waveNumber}`);
  }
  updateRoundHUD(waveNumber);
}

function spawnZombie() {
  if (zombiePool.length === 0) return; 

  let config;
  if (isSpecialRound) {
    config = ENEMY_TYPES.RUNNER; // Force only fast runners on Swarm Rounds
  }
  else if (goliathsToSpawn > 0) { config = ENEMY_TYPES.GOLIATH; goliathsToSpawn--; } 
  else { 
    const r = Math.random();
    if (currentWave >= 4 && r < 0.15) config = ENEMY_TYPES.RANGED;
    else if (currentWave >= 3 && r < 0.30) config = ENEMY_TYPES.EXPLODER;
    else if (r < Math.min(0.50, 0.10 + (currentWave * 0.05))) config = ENEMY_TYPES.RUNNER;
    else config = ENEMY_TYPES.SHAMBLER;
  }

  const recycled = zombiePool.pop();
  
  recycled.type = config.name;
  recycled.health = config.maxHealth;
  recycled.maxHealth = config.maxHealth;
  recycled.speed = config.speed + (Math.random() - 0.5) * 0.4 + (currentWave * 0.1);
  recycled.damage = config.damage;
  recycled.attackRate = config.attackCooldown;
  recycled.aiTimer = Math.random() * 0.15;
  recycled.atkCD = Math.random() * config.attackCooldown;
  recycled.attackRange = config.attackRange;
  recycled.colRadius = config.colRadius;
  recycled.walkT = Math.random() * Math.PI * 2;
  recycled.dyingT = -1;
  recycled.groundUpdateTimer = Math.random() * 0.1;
  recycled.alive = true;
  recycled.originalScale.copy(config.scale);

  if (recycled.mixer && ASSETS.enemies.zombie && ASSETS.enemies.zombie.animations.length > 0) {
    recycled.mixer.stopAllAction();
    const walkAnim = recycled.mixer.clipAction(ASSETS.enemies.zombie.animations[0]);
    walkAnim.setLoop(THREE.LoopRepeat);
    walkAnim.play();
  }

  recycled.mesh.scale.copy(config.scale);
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
        t.state = 'COOLDOWN'; t.timer = 20.0; // 20 sec cooldown
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
      if (player.pos.distanceTo(p.mesh.position) < 1.0) {
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
      flashWaveBanner(p.type.name, 2500); playSound('hit', 1.0, false);
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
  spawnTimer += dt; if (spawnTimer >= 1.0) { spawnZombie(); spawnTimer = 0; }
}

// Update procedural visual counters and optional detailed visuals.
detailedVisualCount = 0;
proceduralVisualCount = 0;

const visualCandidates = activeEnemies.filter(e => e.alive && e.dyingT < 0);

for (const e of visualCandidates) {
  e._visualDist = Math.hypot(
    player.pos.x - e.mesh.position.x,
    player.pos.z - e.mesh.position.z
  );
  e._useFullVisual = false;
}

visualCandidates.sort((a, b) => a._visualDist - b._visualDist);

let detailedSlots = DETAILED_VISUAL_BUDGET;

for (const e of visualCandidates) {
  if (detailedSlots > 0 && e._visualDist < DETAILED_VISUAL_DISTANCE) {
    e._useFullVisual = true;
    detailedSlots--;
    detailedVisualCount++;
  } else {
    proceduralVisualCount++;
  }
}

const visualAnimTime = performance.now() * 0.001;

for (let i = activeEnemies.length - 1; i >= 0; i--) {
    const e = activeEnemies[i];

    if (e.dyingT >= 0) {
      e.dyingT += dt; 
      const t = Math.min(e.dyingT / 0.6, 1);
      e.mesh.scale.y = (1 - t) * e.originalScale.y; 
      e.mesh.position.y = -t * 0.5; 
      
      if (e.dyingT >= 0.6) {
        e.mesh.visible = false;
        zombiePool.push(e);
		actorManager.unregister(e);
        activeEnemies.splice(i, 1);
        
        if (zombiesSpawnedSoFar >= zombiesToSpawnThisRound && activeEnemies.length === 0) {
          currentWave++; flashWaveBanner("ROUND CLEAR", 2500);
          setTimeout(() => { if (player.alive) startWave(currentWave); }, 5000);
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
    e.type === "RUNNER" ? 1.35 : 1.0
  );
}
    // ── ANTI-CAMPING DETECTION ──
    // If zombie is right under you, but the height gap proves you are on a box (not a balcony)
    if (horizontalDist <= 2.2 && trueVerticalDist > 1.8 && trueVerticalDist < 4.5) {
      currentlyCamping = true;
    }

    // ── CPU OPTIMIZATION: Only animate skeletons if close ──
	if (e.mixer && e._useFullVisual) {
	  e.mixer.timeScale = e.type === "RUNNER" ? 1.5 : 1.0;
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
        playSound('hurt', 0.6, true); // Wooden tearing impact proxy

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
      let currentGroundY = 0;
      // We push the look-ahead to 0.8 so they spot the next step slightly earlier
      const aheadX = e.mesh.position.x + (moveX * 0.8);
      const aheadZ = e.mesh.position.z + (moveZ * 0.8);
      groundRay.near = 0;
groundRay.far = 10;

groundRay.ray.origin.set(
    aheadX,
    e.mesh.position.y + 2.0,
    aheadZ
);

groundRay.ray.direction.copy(groundRayDir);

const hits = groundRay.intersectObjects(mapMeshes, false);
      
      if (hits.length > 0) { currentGroundY = hits[0].point.y; }
      
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
        playSound('shoot_pistol', 0.3, true); 
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
      import('./ui.js').then(({ flashWaveBanner }) => flashWaveBanner("WARNING: TOXIC SPORES! KEEP MOVING!", 1000));
      playSound('hurt', 0.5, false);
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
    playSound('shoot_shotgun', 1.0, true); 
    
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