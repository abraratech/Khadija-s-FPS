// js/enemy.js
import { scene, walls, camera, spawnPoints, addScreenShake } from './map.js';
import { player, damagePlayer } from './player.js';
import { updateKillsHUD, updateRoundHUD, flashWaveBanner, updateScoreHUD, spawnFloatingScore } from './ui.js';
import { spawnBloodDecal } from './particles.js';
import { giveMaxAmmo } from './weapons.js';
import { playSound } from './audio.js';
import { difficultyMultiplier } from './main.js';

export let eMeshList = []; 
export const activeEnemies = [];
const activePowerups = [];

// ── NEW: PROJECTILE & EXPLOSION TRACKERS ──
const activeProjectiles = [];
const activeExplosions = [];
const projGeo = new THREE.SphereGeometry(0.18, 8, 8);
const projMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Cyan plasma
const expGeo = new THREE.SphereGeometry(1, 16, 16);
const expMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 }); // Orange fireball

const gBodyGeo = new THREE.BoxGeometry(0.72, 1.15, 0.46);
const gHeadGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
const gLegGeo  = new THREE.BoxGeometry(0.28, 0.58, 0.28);
const gArmGeo  = new THREE.BoxGeometry(0.2, 0.54, 0.2);
const skinMat  = new THREE.MeshStandardMaterial({ color: 0xffddaa, roughness: 0.8 });

// ── UPGRADED TEXTURED AUDIO ENGINE (CRUNCH & RUMBLE) ──
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
  GOLIATH:  { name: "GOLIATH", speed: 1.6, maxHealth: 1500, damage: 45, attackCooldown: 2.2, attackRange: 3.2, colRadius: 1.20, color: 0x1a1a1a, scale: new THREE.Vector3(2.5, 2.5, 2.5) },
  // ── NEW MUTATIONS ──
  EXPLODER: { name: "EXPLODER", speed: 4.8, maxHealth: 70, damage: 45, attackCooldown: 0, attackRange: 2.5, colRadius: 0.50, color: 0xff4400, scale: new THREE.Vector3(1.15, 1.15, 1.15) },
  RANGED:   { name: "RANGED", speed: 2.0, maxHealth: 80, damage: 20, attackCooldown: 2.5, attackRange: 12.0, colRadius: 0.40, color: 0x00ffff, scale: new THREE.Vector3(0.8, 1.2, 0.8) }
};

const POWERUP_TYPES = [
  { name: 'MAX AMMO', color: 0x00ff00 }, { name: 'INSTA-KILL', color: 0xffaa00 }, { name: 'DOUBLE POINTS', color: 0xffff00 }, { name: 'NUKE', color: 0xff0000 }
];

export function initEnemies() {
  activeEnemies.forEach(e => scene.remove(e.mesh)); activeEnemies.length = 0; eMeshList.length = 0;
  activePowerups.forEach(p => scene.remove(p.mesh)); activePowerups.length = 0;
  currentWave = 1; startWave(currentWave);
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
  let config;
  if (goliathsToSpawn > 0) { config = ENEMY_TYPES.GOLIATH; goliathsToSpawn--; } 
  else { 
    const r = Math.random();
    if (currentWave >= 4 && r < 0.15) config = ENEMY_TYPES.RANGED;
    else if (currentWave >= 3 && r < 0.30) config = ENEMY_TYPES.EXPLODER;
    else if (r < Math.min(0.50, 0.10 + (currentWave * 0.05))) config = ENEMY_TYPES.RUNNER;
    else config = ENEMY_TYPES.SHAMBLER;
  }

  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.65, metalness: config.name === "GOLIATH" ? 0.4 : 0.1 });
  
  const body = new THREE.Mesh(gBodyGeo, mat); body.position.y = 1.08; g.add(body);
  const head = new THREE.Mesh(gHeadGeo, skinMat); head.position.y = 1.9; g.add(head);
  const legL = new THREE.Mesh(gLegGeo, mat); legL.position.set(-0.17, 0.29, 0); g.add(legL);
  const legR = new THREE.Mesh(gLegGeo, mat); legR.position.set(0.17, 0.29, 0); g.add(legR);
  const armL = new THREE.Mesh(gArmGeo, mat); armL.position.set(-0.48, 1.04, 0); g.add(armL);
  const armR = new THREE.Mesh(gArmGeo, mat); armR.position.set(0.48, 1.04, 0); g.add(armR);
    
  if (spawnPoints.length > 0) {
    const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    g.position.set(sp.x + (Math.random() - 0.5) * 2, 0, sp.z + (Math.random() - 0.5) * 2);
  } else {
    g.position.set(0, 0, 0); 
  }
  
  g.scale.copy(config.scale); scene.add(g);

// Inside spawnZombie() in js/enemy.js, replace the enemyInstance block:

  // ── NEW: APPLY DIFFICULTY SCALING ──
  const diffHealth = config.maxHealth * difficultyMultiplier;
  const diffDamage = config.damage * difficultyMultiplier;

  const enemyInstance = { 
    mesh: g, 
    type: config.name, 
    health: diffHealth, 
    maxHealth: diffHealth, 
    speed: config.speed + (Math.random() - 0.5) * 0.4 + (currentWave * 0.1),
    damage: diffDamage, 
    attackRate: config.attackCooldown, 
    atkCD: Math.random() * config.attackCooldown, 
    attackRange: config.attackRange, 
    colRadius: config.colRadius, 
    walkT: Math.random() * Math.PI * 2, 
    dyingT: -1, 
    alive: true
  };

  body.userData.eRef = enemyInstance; head.userData.eRef = enemyInstance; head.userData.isHead = true;
  activeEnemies.push(enemyInstance); zombiesSpawnedSoFar++; rebuildEMeshList();
}

function rebuildEMeshList() {
  eMeshList = [];
  activeEnemies.forEach(e => {
    if (!e.alive || e.dyingT >= 0) return;
    e.mesh.children.forEach(child => { if (child.isMesh) { if (!child.userData.eRef) child.userData.eRef = e; eMeshList.push(child); } });
  });
}

const _eToP = new THREE.Vector3();

export function updateEnemies(dt) {
  if (!player.alive) return;

  // ── NEW: FIREBALL EXPLOSION LOOP ──
  for (let i = activeExplosions.length - 1; i >= 0; i--) {
    const ex = activeExplosions[i];
    ex.life -= dt;
    ex.mesh.scale.addScalar(dt * 18); // Rapidly expand sphere
    ex.mesh.material.opacity = (ex.life / 0.3) * 0.8; // Fade out
    if (ex.life <= 0) { scene.remove(ex.mesh); ex.mesh.material.dispose(); activeExplosions.splice(i, 1); }
  }

  // ── NEW: RANGED PROJECTILE LOOP ──
  for (let i = activeProjectiles.length - 1; i >= 0; i--) {
    const p = activeProjectiles[i];
    p.mesh.position.addScaledVector(p.dir, dt * 14.0); // Fly towards player
    p.life -= dt;
    
    // Check if it hits the player
    if (player.pos.distanceTo(p.mesh.position) < 1.0) {
      damagePlayer(20, p.mesh.position);
      scene.remove(p.mesh); activeProjectiles.splice(i, 1); continue;
    }
    if (p.life <= 0) { scene.remove(p.mesh); activeProjectiles.splice(i, 1); }
  }
  
  // Powerup updates
  for (let i = activePowerups.length - 1; i >= 0; i--) {
    const p = activePowerups[i];
    p.mesh.rotation.y += dt * 2.5; p.mesh.position.y = 0.8 + Math.sin(Date.now() * 0.005) * 0.15; p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); activePowerups.splice(i, 1); continue; }
    
    // Player picks up the powerup
    if (player.pos.distanceTo(p.mesh.position) < 1.6) {
      flashWaveBanner(p.type.name, 2500); playSound('hit', 1.0, false);
      
      if (p.type.name === 'MAX AMMO') giveMaxAmmo();
      if (p.type.name === 'INSTA-KILL') player.instaKillTimer = 15.0;
      if (p.type.name === 'DOUBLE POINTS') player.doublePointsTimer = 30.0;
      if (p.type.name === 'NUKE') {
        player.score += 400; updateScoreHUD(player.score); spawnFloatingScore(400, false);
        zombiesSpawnedSoFar = zombiesToSpawnThisRound; 
        const enemiesToKill = [...activeEnemies];
        enemiesToKill.forEach(z => { if (z.alive) { killEnemy(z); } });
      }
      
      scene.remove(p.mesh); 
      activePowerups.splice(i, 1);
    }
  } 

  if (zombiesSpawnedSoFar < zombiesToSpawnThisRound) {
    spawnTimer += dt; if (spawnTimer >= 1.0) { spawnZombie(); spawnTimer = 0; }
  }

  for (const e of activeEnemies) {
    if (e.dyingT >= 0) {
      e.dyingT += dt; const t = Math.min(e.dyingT / 0.45, 1);
      e.mesh.scale.y = (1 - t) * (e.type === "GOLIATH" ? 2.5 : (e.type === "RUNNER" ? 1.05 : 1)); e.mesh.position.y = -t * 0.5; continue;
    }
    if (!e.alive) continue;

    _eToP.set(player.pos.x - e.mesh.position.x, 0, player.pos.z - e.mesh.position.z);
    const dist = _eToP.length();

    if (dist > 0.1) e.mesh.lookAt(player.pos.x, e.mesh.position.y, player.pos.z);

    if (dist > e.attackRange) {
      const oldWalk = e.walkT;
      e.walkT += dt * e.speed * 3.5;
      e.mesh.position.x += (_eToP.x / dist) * e.speed * dt;
      e.mesh.position.z += (_eToP.z / dist) * e.speed * dt;
      
      for (const w of walls) {
        const ep = e.mesh.position;
        const cx = Math.max(w.minX, Math.min(ep.x, w.maxX));
        const cz = Math.max(w.minZ, Math.min(ep.z, w.maxZ));
        const ddx = ep.x - cx, ddz = ep.z - cz, d2 = ddx * ddx + ddz * ddz;
        const r = e.colRadius; 
        if (d2 < r * r) { 
          const d = Math.sqrt(d2) || 0.001; 
          ep.x += (ddx / d) * (r - d); 
          ep.z += (ddz / d) * (r - d); 
        }
      }
      
      const c = e.mesh.children; const amp = e.type === "RUNNER" ? 0.65 : 0.42;
      if (c[2]) c[2].rotation.x = Math.sin(e.walkT) * amp; if (c[3]) c[3].rotation.x = -Math.sin(e.walkT) * amp;
      if (c[4]) c[4].rotation.x = -Math.sin(e.walkT) * (amp * 0.8); if (c[5]) c[5].rotation.x = Math.sin(e.walkT) * (amp * 0.8);
      
      if (Math.floor(oldWalk / Math.PI) !== Math.floor(e.walkT / Math.PI)) playSpatialZombieSound(e.mesh.position, e.type, true);
      if (Math.random() < 0.005) playSpatialZombieSound(e.mesh.position, e.type, false);
    }

    e.atkCD -= dt;
    if (dist <= e.attackRange && e.atkCD <= 0 && player.alive) {
      e.atkCD = e.attackRate; 
      
      // ── NEW: SPECIALIZED ATTACK BEHAVIORS ──
      if (e.type === "EXPLODER") {
        killEnemy(e); // Exploders trigger their own death sequence to detonate!
      } 
      else if (e.type === "RANGED") {
        const p = new THREE.Mesh(projGeo, projMat);
        p.position.copy(e.mesh.position); p.position.y += 1.2; // Chest height
        const dir = new THREE.Vector3().subVectors(player.pos, p.position).normalize();
        scene.add(p); activeProjectiles.push({ mesh: p, dir: dir, life: 2.5 });
        playSound('shoot_pistol', 0.3, true); 
      } 
      else {
        // Standard Melee
        damagePlayer(e.damage, e.mesh.position);
        e.mesh.position.x += (_eToP.x / dist) * 0.15; e.mesh.position.z += (_eToP.z / dist) * 0.15;
      }
    }
  }
}

export function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false; e.dyingT = 0; 
  spawnBloodDecal(e.mesh.position);
  if (e.type === "EXPLODER") {
    addScreenShake(0.6); // Massive screen shake
    playSound('shoot_shotgun', 1.0, true); 
    
    // Spawn visual expanding fireball
    const boom = new THREE.Mesh(expGeo, expMat.clone());
    boom.position.copy(e.mesh.position); scene.add(boom);
    activeExplosions.push({ mesh: boom, life: 0.3 });
    
    // Deal AoE damage to player if too close!
    if (player.pos.distanceTo(e.mesh.position) < 5.0) {
      damagePlayer(e.damage, e.mesh.position);
    }
  }
  player.kills++; updateKillsHUD(player.kills); rebuildEMeshList(); 
  
  if (Math.random() < 0.10) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const pMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.8 }));
    pMesh.position.copy(e.mesh.position); pMesh.position.y = 0.8; scene.add(pMesh); activePowerups.push({ mesh: pMesh, type: type, life: 15.0 });
  }
  
  setTimeout(() => {
    scene.remove(e.mesh);
    const instanceIdx = activeEnemies.indexOf(e);
    if (instanceIdx !== -1) activeEnemies.splice(instanceIdx, 1);
    
    if (zombiesSpawnedSoFar >= zombiesToSpawnThisRound && activeEnemies.length === 0) {
      currentWave++; flashWaveBanner("ROUND CLEAR", 2500);
      setTimeout(() => { if (player.alive) startWave(currentWave); }, 5000);
    }
  }, 600);
}

export function getActiveEnemies() { 
  return activeEnemies; 
}