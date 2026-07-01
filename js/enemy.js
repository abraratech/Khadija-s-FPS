// js/enemy.js
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { scene, camera, spawnPoints, addScreenShake, mapMeshes } from './map.js';
import { player, damagePlayer } from './player.js';
import { updateKillsHUD, updateRoundHUD, flashWaveBanner, updateScoreHUD, spawnFloatingScore } from './ui.js';
import { spawnBloodBurst } from './particles.js';
import { giveMaxAmmo } from './weapons.js';
import { playSound } from './audio.js';
import { pushOut } from './utils.js';
import { difficultyMultiplier, ASSETS } from './main.js';

export let eMeshList = []; 
export const activeEnemies = [];
const activePowerups = [];

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
  const matKey = config.name;
  if (!materialCache[matKey]) {
    const newMat = baseMaterial.clone();
    newMat.metalness = config.name === "GOLIATH" ? 0.4 : 0.0;
    newMat.roughness = 0.8;
    newMat.transparent = false;
    newMat.depthWrite = true;
    newMat.color.setHex(0xffffff);
    newMat.emissive.setHex(config.color);
    newMat.emissiveIntensity = 0.15;
    
    if (newMat.map) {
      newMat.map.wrapS = THREE.RepeatWrapping;
      newMat.map.wrapT = THREE.RepeatWrapping;
      newMat.map.repeat.set(1, 1);
      newMat.map.needsUpdate = true;
    }
    materialCache[matKey] = newMat;
  }
  return materialCache[matKey];
}

const projGeo = new THREE.SphereGeometry(0.18, 8, 8);
const projMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
const expGeo = new THREE.SphereGeometry(1, 16, 16);
const expMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 });

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

const ENEMY_TYPES = {
  SHAMBLER: { name: "SHAMBLER", speed: 2.4, maxHealth: 100, damage: 15, attackCooldown: 1.4, attackRange: 1.4, colRadius: 0.45, color: 0x446644, scale: new THREE.Vector3(1, 1, 1) },
  RUNNER:   { name: "RUNNER", speed: 5.2, maxHealth: 65, damage: 10, attackCooldown: 0.8, attackRange: 1.4, colRadius: 0.40, color: 0x883333, scale: new THREE.Vector3(0.85, 1.05, 0.85) },
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
      mesh: g, type: "SHAMBLER", health: 100, maxHealth: 100, speed: 2.4,
      damage: 15, attackRate: 1.4, atkCD: 0, attackRange: 1.4, colRadius: 0.45, 
      walkT: 0, dyingT: -1, alive: false, mixer: null, originalScale: new THREE.Vector3(1,1,1)
    };
    g.userData.eRef = enemyInstance;

    if (ASSETS.enemies.zombie && ASSETS.enemies.zombie.clone) {
      const zombieModel = SkeletonUtils.clone(ASSETS.enemies.zombie);
      zombieModel.scale.set(0.015, 0.015, 0.015);
      zombieModel.traverse((child) => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.frustumCulled = false; child.castShadow = true; child.receiveShadow = true;
          child.userData.eRef = enemyInstance; 
          if (child.name.toLowerCase().includes("head")) child.userData.isHead = true;
        }
      });
      g.add(zombieModel);
      
      if (ASSETS.enemies.zombie.animations && ASSETS.enemies.zombie.animations.length > 0) {
        enemyInstance.mixer = new THREE.AnimationMixer(zombieModel);
        const walkAnim = enemyInstance.mixer.clipAction(ASSETS.enemies.zombie.animations[0]);
        walkAnim.setLoop(THREE.LoopRepeat);
        walkAnim.play();
      }
    } else {
      const fallbackMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x00ffaa, roughness: 0.5 }));
      fallbackMesh.position.y = 0.9; fallbackMesh.userData.eRef = enemyInstance; g.add(fallbackMesh);
    }
    
    g.visible = false;
    scene.add(g);
    zombiePool.push(enemyInstance);
  }
  
  poolsInitialized = true;
  console.log("🟢 Zombie Pools Initialized!");
}

export function initEnemies() {
  initPools();
  
  for (let i = activeEnemies.length - 1; i >= 0; i--) {
    const e = activeEnemies[i];
    e.mesh.visible = false;
    zombiePool.push(e);
  }
  
  activeEnemies.length = 0; 
  eMeshList.length = 0;
  activePowerups.forEach(p => scene.remove(p.mesh)); 
  activePowerups.length = 0;
  projectilePool.items.forEach(p => p.mesh.visible = false);
  explosionPool.items.forEach(ex => ex.mesh.visible = false);
  
  currentWave = 1; 
  startWave(currentWave);
}

function startWave(waveNumber) {
  zombiesSpawnedSoFar = 0; spawnTimer = 0;
  if (waveNumber > 0 && waveNumber % 5 === 0) {
    goliathsToSpawn = Math.floor(waveNumber / 5); 
    zombiesToSpawnThisRound = 4 + (waveNumber * 2) + goliathsToSpawn; 
    flashWaveBanner(`BOSS ROUND ${waveNumber}`);
  } else {
    goliathsToSpawn = 0; zombiesToSpawnThisRound = 4 + (waveNumber * 2); flashWaveBanner(`ROUND ${waveNumber}`);
  }
  updateRoundHUD(waveNumber);
}

function spawnZombie() {
  if (zombiePool.length === 0) return; 

  let config;
  if (goliathsToSpawn > 0) { config = ENEMY_TYPES.GOLIATH; goliathsToSpawn--; } 
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
  recycled.atkCD = Math.random() * config.attackCooldown;
  recycled.attackRange = config.attackRange;
  recycled.colRadius = config.colRadius;
  recycled.walkT = Math.random() * Math.PI * 2;
  recycled.dyingT = -1;
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

  recycled.mesh.traverse((child) => {
    if (child.isMesh && child.material) child.material = getZombieMaterial(config, child.material);
  });

  if (spawnPoints.length > 0) {
    const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    recycled.mesh.position.set(sp.x + (Math.random() - 0.5) * 2, 0, sp.z + (Math.random() - 0.5) * 2);
  } else {
    recycled.mesh.position.set(0, 0, 0); 
  }

  activeEnemies.push(recycled);
  zombiesSpawnedSoFar++;
  rebuildEMeshList();
}

function rebuildEMeshList() {
  eMeshList = [];
  activeEnemies.forEach(e => {
    if (!e.alive || e.dyingT >= 0) return;
    e.mesh.traverse(child => {
      if (child.isMesh) {
        if (!child.userData.eRef) child.userData.eRef = e;
        eMeshList.push(child);
      }
    });
  });
}

const _eToP = new THREE.Vector3();

export function updateEnemies(dt) {
  if (!player.alive) return;

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

  for (let i = activeEnemies.length - 1; i >= 0; i--) {
    const e = activeEnemies[i];

    if (e.mixer) {
      e.mixer.timeScale = e.type === "RUNNER" ? 1.5 : 1.0;
      e.mixer.update(dt);
    }

    if (e.dyingT >= 0) {
      e.dyingT += dt; 
      const t = Math.min(e.dyingT / 0.6, 1);
      e.mesh.scale.y = (1 - t) * e.originalScale.y; 
      e.mesh.position.y = -t * 0.5; 
      
      if (e.dyingT >= 0.6) {
        e.mesh.visible = false;
        zombiePool.push(e);
        activeEnemies.splice(i, 1);
        
        if (zombiesSpawnedSoFar >= zombiesToSpawnThisRound && activeEnemies.length === 0) {
          currentWave++; flashWaveBanner("ROUND CLEAR", 2500);
          setTimeout(() => { if (player.alive) startWave(currentWave); }, 5000);
        }
      }
      continue;
    }

    if (!e.alive) continue;

    // Calculate dynamic distance components
    _eToP.set(player.pos.x - e.mesh.position.x, player.pos.y - e.mesh.position.y, player.pos.z - e.mesh.position.z);
    const horizontalDist = Math.sqrt(_eToP.x * _eToP.x + _eToP.z * _eToP.z);
    const trueVerticalDist = Math.abs(_eToP.y);

    if (horizontalDist > 0.1) {
      e.mesh.lookAt(player.pos.x, e.mesh.position.y, player.pos.z);
    }

    // ── MOVEMENT & STAIRWAY ROUTING ENGINE ──
    if (horizontalDist > e.attackRange || trueVerticalDist > 1.8) {
      const oldWalk = e.walkT;
      e.walkT += dt * e.speed * 3.5;
      
      let moveX = _eToP.x / (horizontalDist || 1);
      let moveZ = _eToP.z / (horizontalDist || 1);

      // If player is upstairs (Y > 4) and zombie is down below, route them to the steps!
      if (player.pos.y > 4.0 && e.mesh.position.y < 4.0) {
        const stairEntranceZ = -10; // Corresponds directly to Map 4 staircase threshold
        const toStairsX = 0 - e.mesh.position.x;
        const toStairsZ = stairEntranceZ - e.mesh.position.z;
        const stairDist = Math.sqrt(toStairsX * toStairsX + toStairsZ * toStairsZ);

        if (stairDist > 1.2) {
          moveX = toStairsX / stairDist;
          moveZ = toStairsZ / stairDist;
        }
      }

      e.mesh.position.x += moveX * e.speed * dt;
      e.mesh.position.z += moveZ * e.speed * dt;

      // ── HEIGHT SAMPLING (No flat lock override) ──
      let currentGroundY = 0;
      const downRay = new THREE.Raycaster(new THREE.Vector3(e.mesh.position.x, e.mesh.position.y + 1.5, e.mesh.position.z), new THREE.Vector3(0, -1, 0), 0, 10);
      const hits = downRay.intersectObjects(mapMeshes);
      if (hits.length > 0) {
        currentGroundY = hits[0].point.y;
      }
      
      e.mesh.position.y = THREE.MathUtils.lerp(e.mesh.position.y, currentGroundY, dt * 12);
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
  }
}

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
  
  player.kills++; updateKillsHUD(player.kills); rebuildEMeshList(); 
  
  if (Math.random() < 0.10) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const pMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.8 }));
    pMesh.position.copy(e.mesh.position); pMesh.position.y = 0.8; scene.add(pMesh); activePowerups.push({ mesh: pMesh, type: type, life: 15.0 });
  }
}

export function getActiveEnemies() { 
  return activeEnemies; 
}