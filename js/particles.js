// js/particles.js
import * as THREE from 'three';
import { scene } from './map.js';

// ── POOL SIZES (Tweak these based on performance needs) ──
const MAX_DECALS = 150;
const MAX_BLOOD = 60;
const MAX_SHELLS = 40;
const MAX_SMOKE = 30;

// ── THE RING BUFFERS ──
const pools = {
  decals: { items: [], index: 0 },
  blood: { items: [], index: 0 },
  shells: { items: [], index: 0 },
  smoke: { items: [], index: 0 }
};

let initialized = false;

// Pre-builds all particle meshes ONCE at startup and hides them
export function initParticles() {
  if (initialized) return;

  // 1. Setup Decal Pool (Bullet holes)
  const decalGeo = new THREE.PlaneGeometry(0.15, 0.15);
  const decalMat = new THREE.MeshBasicMaterial({ color: 0x050505, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
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
  const smokeGeo = new THREE.PlaneGeometry(0.2, 0.2);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.5, depthWrite: false });
  for (let i = 0; i < MAX_SMOKE; i++) {
    const mesh = new THREE.Mesh(smokeGeo, smokeMat.clone()); // Clone mat so opacity can fade independently
    mesh.visible = false;
    scene.add(mesh);
    pools.smoke.items.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }

  initialized = true;
  console.log("🟢 Particle Pools Initialized!");
}

// ── SPAWNER FUNCTIONS (O(1) Ring Buffer Lookups) ──

export function spawnBulletHole(pos, normal) {
  if (!initialized) initParticles();
  
  const pool = pools.decals;
  const mesh = pool.items[pool.index];
  
  // Snap to wall and align with the wall's normal facing
  mesh.position.copy(pos);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  mesh.visible = true;

  // Move the ring buffer index forward, looping back to 0 if at the end
  pool.index = (pool.index + 1) % MAX_DECALS;
}

export function spawnBloodBurst(pos) {
  if (!initialized) initParticles();
  
  // Spawn 3 blood droplets per hit
  for (let i = 0; i < 3; i++) {
    const pool = pools.blood;
    const item = pool.items[pool.index];
    
    item.mesh.position.copy(pos);
    item.mesh.scale.set(1, 1, 1);
    // Random outward trajectory
    item.vel.set((Math.random() - 0.5) * 4, Math.random() * 3 + 2, (Math.random() - 0.5) * 4);
    item.life = 1.0; // 1 second lifespan
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
  
  item.life = 2.0; 
  item.mesh.visible = true;

  pool.index = (pool.index + 1) % MAX_SHELLS;
}

export function spawnGunSmoke(pos, dir) {
  if (!initialized) initParticles();
  
  const pool = pools.smoke;
  const item = pool.items[pool.index];
  
  item.mesh.position.copy(pos);
  item.mesh.material.opacity = 0.5;
  item.mesh.scale.set(1, 1, 1);
  item.vel.copy(dir).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.5, 0)); 
  
  item.life = 0.6; 
  item.mesh.visible = true;

  pool.index = (pool.index + 1) % MAX_SMOKE;
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
      item.mesh.scale.addScalar(dt * 3.0); // Expand
      item.mesh.material.opacity = Math.max(0, (item.life / 0.6) * 0.5); // Fade out
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
}