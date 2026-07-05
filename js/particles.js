// js/particles.js
import * as THREE from 'three';
import { scene } from './map.js';

// ── POOL SIZES (Tweak these based on performance needs) ──
const MAX_DECALS = 110;
const MAX_BLOOD = 48;
const MAX_SHELLS = 28;
const MAX_SMOKE = 22;
const MAX_SPARKS = 52;

// ── THE RING BUFFERS ──
const pools = {
  decals: { items: [], index: 0 },
  blood: { items: [], index: 0 },
  shells: { items: [], index: 0 },
  smoke: { items: [], index: 0 },
  sparks: { items: [], index: 0 }
};

let initialized = false;
let softSmokeTexture = null;

function getSoftSmokeTexture() {
  if (softSmokeTexture) return softSmokeTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0.0, 'rgba(255,255,255,0.42)');
  grad.addColorStop(0.35, 'rgba(220,220,220,0.22)');
  grad.addColorStop(0.72, 'rgba(160,160,160,0.08)');
  grad.addColorStop(1.0, 'rgba(160,160,160,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  softSmokeTexture = new THREE.CanvasTexture(canvas);
  softSmokeTexture.needsUpdate = true;
  return softSmokeTexture;
}

// Pre-builds all particle meshes ONCE at startup and hides them
export function initParticles() {
  if (initialized) return;

  // 1. Setup Decal Pool (Bullet holes)
  const decalGeo = new THREE.PlaneGeometry(0.15, 0.15);
  const decalMat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
  for (let i = 0; i < MAX_DECALS; i++) {
    const mesh = new THREE.Mesh(decalGeo, decalMat);
    mesh.visible = false;
    scene.add(mesh);
    pools.decals.items.push(mesh);
  }

  // 2. Setup Blood Pool (Red bursts)
  const bloodGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const bloodMat = new THREE.MeshBasicMaterial({ color: 0x880000 });
  for (let i = 0; i < MAX_BLOOD; i++) {
    const mesh = new THREE.Mesh(bloodGeo, bloodMat);
    mesh.visible = false;
    scene.add(mesh);
    pools.blood.items.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }

  // 3. Setup Shell Pool (Brass casings)
  const shellGeo = new THREE.CylinderGeometry(0.01, 0.015, 0.06, 6);
  shellGeo.rotateX(Math.PI / 2);
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.8, roughness: 0.2 });
  for (let i = 0; i < MAX_SHELLS; i++) {
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.visible = false;
    scene.add(mesh);
    pools.shells.items.push({ mesh, life: 0, vel: new THREE.Vector3(), rotVel: new THREE.Vector3() });
  }

  // 4. Setup Smoke Pool (Muzzle smoke)
  // Use a soft radial sprite instead of a flat white square plane.
  const smokeMat = new THREE.SpriteMaterial({
    map: getSoftSmokeTexture(),
    color: 0xd8d8d8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true
  });
  for (let i = 0; i < MAX_SMOKE; i++) {
    const mesh = new THREE.Sprite(smokeMat.clone()); // Clone mat so opacity can fade independently
    mesh.visible = false;
    scene.add(mesh);
    pools.smoke.items.push({ mesh, life: 0, vel: new THREE.Vector3(), baseLife: 0.45, startScale: 0.18 });
  }

  // 5. Setup Spark Pool (wall / metal impact feedback)
  const sparkGeo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.95, depthWrite: false });
  for (let i = 0; i < MAX_SPARKS; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    pools.sparks.items.push({ mesh, life: 0, vel: new THREE.Vector3(), baseLife: 0.22 });
  }

  initialized = true;
  console.log("🟢 Particle Pools Initialized!");
}

// ── SPAWNER FUNCTIONS (O(1) Ring Buffer Lookups) ──

export function spawnBulletHole(pos, normal) {
  if (!initialized) initParticles();
  
  const pool = pools.decals;
  const mesh = pool.items[pool.index];
  
  const safeNormal = normal && typeof normal.clone === 'function'
    ? normal.clone().normalize()
    : new THREE.Vector3(0, 1, 0);

  // Snap just above the wall surface and align with the wall normal.
  mesh.position.copy(pos).addScaledVector(safeNormal, 0.012);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), safeNormal);
  mesh.rotateZ(Math.random() * Math.PI * 2);
  mesh.visible = true;

  // Move the ring buffer index forward, looping back to 0 if at the end
  pool.index = (pool.index + 1) % MAX_DECALS;
}

export function spawnBloodBurst(pos, intensity = 1, isHeadshot = false) {
  if (!initialized) initParticles();

  const burstPower = Math.max(0.75, Math.min(2.2, Number(intensity) || 1));
  const dropletCount = Math.min(MAX_BLOOD, isHeadshot ? 5 : Math.ceil(3 * burstPower));

  for (let i = 0; i < dropletCount; i++) {
    const pool = pools.blood;
    const item = pool.items[pool.index];

    item.mesh.position.copy(pos);
    item.mesh.scale.setScalar((isHeadshot ? 1.18 : 1.0) * burstPower);
    // Random outward trajectory
    item.vel.set(
      (Math.random() - 0.5) * 4.2 * burstPower,
      (Math.random() * 3 + 2) * burstPower,
      (Math.random() - 0.5) * 4.2 * burstPower
    );
    item.life = isHeadshot ? 1.1 : 0.9;
    item.mesh.visible = true;

    pool.index = (pool.index + 1) % MAX_BLOOD;
  }
}


export function spawnShell(pos, camDir) {
  if (!initialized) initParticles();
  
  const pool = pools.shells;
  const item = pool.items[pool.index];
  
  item.mesh.position.copy(pos);
  // Eject to the right and slightly up
  const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
  item.vel.copy(right).multiplyScalar(2.0 + Math.random()).add(new THREE.Vector3(0, 3 + Math.random(), 0));
  item.rotVel.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
  
  item.life = 1.35; 
  item.mesh.visible = true;

  pool.index = (pool.index + 1) % MAX_SHELLS;
}

export function spawnGunSmoke(pos, dir, power = 1) {
  if (!initialized) initParticles();

  const smokePower = Math.max(0.45, Math.min(1.35, Number(power) || 1));
  const pool = pools.smoke;
  const item = pool.items[pool.index];

  item.mesh.position.copy(pos);
  item.mesh.material.opacity = 0.16 * smokePower;
  item.startScale = 0.12 + smokePower * 0.055;
  item.mesh.scale.setScalar(item.startScale);
  item.vel.copy(dir).multiplyScalar(0.32).add(new THREE.Vector3(0, 0.22 * smokePower, 0));

  item.baseLife = 0.26 + smokePower * 0.08;
  item.life = item.baseLife;
  item.mesh.visible = true;

  pool.index = (pool.index + 1) % MAX_SMOKE;
}

export function spawnImpactSpark(pos, normal = null, power = 1) {
  if (!initialized) initParticles();

  const sparkPower = Math.max(0.45, Math.min(1.35, Number(power) || 1));
  const count = Math.min(MAX_SPARKS, Math.ceil(2 * sparkPower));
  const pushDir = normal && typeof normal.clone === 'function'
    ? normal.clone().normalize()
    : new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < count; i++) {
    const pool = pools.sparks;
    const item = pool.items[pool.index];

    item.mesh.position.copy(pos).addScaledVector(pushDir, 0.025);
    item.mesh.scale.setScalar(0.45 + Math.random() * 0.45 * sparkPower);
    item.mesh.material.opacity = 0.68;
    item.vel.copy(pushDir).multiplyScalar(0.85 + Math.random() * 1.15);
    item.vel.x += (Math.random() - 0.5) * 2.4 * sparkPower;
    item.vel.y += Math.random() * 1.6 * sparkPower;
    item.vel.z += (Math.random() - 0.5) * 2.4 * sparkPower;
    item.baseLife = 0.10 + Math.random() * 0.08;
    item.life = item.baseLife;
    item.mesh.visible = true;

    pool.index = (pool.index + 1) % MAX_SPARKS;
  }
}


// ── THE UPDATE LOOP (Called in tick) ──
export function updateParticles(dt) {
  if (!initialized) return;

  // Update Blood
  pools.blood.items.forEach(item => {
    if (item.life > 0) {
      item.life -= dt;
      item.vel.y -= 9.8 * dt; // Gravity
      item.mesh.position.addScaledVector(item.vel, dt);
      item.mesh.scale.multiplyScalar(0.95); // Shrink over time
      if (item.life <= 0 || item.mesh.position.y < 0.1) item.mesh.visible = false;
    }
  });

  // Update Shells
  pools.shells.items.forEach(item => {
    if (item.life > 0) {
      item.life -= dt;
      item.vel.y -= 15 * dt; // Heavy Gravity
      item.mesh.position.addScaledVector(item.vel, dt);
      item.mesh.rotation.x += item.rotVel.x * dt;
      item.mesh.rotation.y += item.rotVel.y * dt;
      
      // Floor bounce
      if (item.mesh.position.y <= 0.1) {
        item.mesh.position.y = 0.1;
        item.vel.y *= -0.3; // Dampened bounce
        item.vel.x *= 0.5;  // Friction
        item.vel.z *= 0.5;
      }
      if (item.life <= 0) item.mesh.visible = false;
    }
  });

  // Update Smoke
  pools.smoke.items.forEach(item => {
    if (item.life > 0) {
      item.life -= dt;
      item.mesh.position.addScaledVector(item.vel, dt);
      item.mesh.scale.addScalar(dt * 0.42); // Gentle expansion without a square card popping on screen
      item.mesh.material.opacity = Math.max(0, (item.life / Math.max(0.001, item.baseLife)) * 0.18); // Fade out
      if (item.life <= 0) item.mesh.visible = false;
    }
  });

  // Update Sparks
  pools.sparks.items.forEach(item => {
    if (item.life > 0) {
      item.life -= dt;
      item.vel.y -= 8.0 * dt;
      item.mesh.position.addScaledVector(item.vel, dt);
      item.mesh.material.opacity = Math.max(0, item.life / Math.max(0.001, item.baseLife));
      if (item.life <= 0) item.mesh.visible = false;
    }
  });
}

// Clears visual clutter instantly (Useful for map resets)
export function clearAllDecals() {
  if (!initialized) return;
  pools.decals.items.forEach(m => m.visible = false);
  pools.blood.items.forEach(i => i.mesh.visible = false);
  pools.shells.items.forEach(i => i.mesh.visible = false);
  pools.smoke.items.forEach(i => i.mesh.visible = false);
  pools.sparks.items.forEach(i => i.mesh.visible = false);
}