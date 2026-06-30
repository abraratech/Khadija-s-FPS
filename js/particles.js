// js/particles.js
import { scene } from './map.js';

// ── DECAL MANAGEMENT ──
const MAX_HOLES = 50;
const bulletHoles = [];
const holeGeo = new THREE.PlaneGeometry(0.15, 0.15);
const holeMat = new THREE.MeshBasicMaterial({ 
  color: 0x020202, 
  transparent: true, 
  opacity: 0.9, 
  depthWrite: false 
});
const activeSmoke = [];
const smokeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
const smokeMat = new THREE.MeshBasicMaterial({
  color: 0xcccccc,
  transparent: true,
  opacity: 0.4,
  depthWrite: false
});
export function spawnBulletHole(point, normal) {
  const hole = new THREE.Mesh(holeGeo, holeMat);
  hole.position.copy(point).add(normal.clone().multiplyScalar(0.005));
  hole.lookAt(point.clone().add(normal));
  scene.add(hole);
  bulletHoles.push(hole);

  if (bulletHoles.length > MAX_HOLES) {
    const oldHole = bulletHoles.shift();
    scene.remove(oldHole);
  }
}

// Add this function to js/particles.js
export function spawnGunSmoke(barrelTipPos, cameraDirection) {
  // Spawn 3-5 individual smoke particles per shot
  const count = 3 + Math.floor(Math.random() * 3);
  
  for (let i = 0; i < count; i++) {
    const smoke = new THREE.Mesh(smokeGeo, smokeMat.clone()); // Clone so each can fade individually
    
    // Start exactly at the barrel tip with a tiny bit of random displacement
    smoke.position.copy(barrelTipPos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.02,
      (Math.random() - 0.5) * 0.02,
      (Math.random() - 0.5) * 0.02
    ));

    smoke.userData = {
      // Push forward along the camera direction, with a slight expansion outwards
      vel: new THREE.Vector3()
        .copy(cameraDirection).multiplyScalar(Math.random() * 1.5 + 1.0)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4)),
      life: 0.35,      // Lasts for 0.35 seconds
      maxLife: 0.35,
      scaleSpeed: 3.5  // Smoke expands as it dissipates
    };

    scene.add(smoke);
    activeSmoke.push(smoke);
  }
}

// ── BLOOD PARTICLES SYSTEM ──
const activeBloodParticles = [];
const bloodGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const bloodMat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });

export function spawnBloodBurst(point) {
  // Spawn a cluster of 8-12 particles per hit
  const count = 8 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(bloodGeo, bloodMat);
    p.position.copy(point);
    
    // Assign velocity with an upward and random outward trajectory
    p.userData = {
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 4
      ),
      life: 0.4 // Lasts for 0.4 seconds
    };
    
    scene.add(p);
    activeBloodParticles.push(p);
  }
}

// ── SHELL EJECTION SYSTEM ──
const activeShells = [];
const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.035, 4);
const shellMat = new THREE.MeshStandardMaterial({ color: 0xcca300, metalness: 0.8, roughness: 0.2 });

// Inside js/particles.js - Replace your spawnShell function with this:
export function spawnShell(gunPosition, cameraDirection) {
  // FALLBACK: If direction is glitched or empty, default to straight ahead
  if (!cameraDirection || cameraDirection.lengthSq() === 0) {
    cameraDirection = new THREE.Vector3(0, 0, -1);
  }

  const shell = new THREE.Mesh(shellGeo, shellMat);
  
  shell.position.copy(gunPosition).add(new THREE.Vector3(0.15, -0.1, -0.2));
  shell.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

  // Find right-vector safely
  const right = new THREE.Vector3().crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();
  if (right.lengthSq() === 0) right.set(1, 0, 0); // Failsafe if looking straight down

  shell.userData = {
    vel: new THREE.Vector3()
      .copy(right).multiplyScalar(Math.random() * 1.5 + 2) 
      .addScaledVector(new THREE.Vector3(0, 1, 0), Math.random() * 1.5 + 1.5) 
      .addScaledVector(cameraDirection, (Math.random() - 0.5) * 0.5), 
    life: 1.0
  };

  scene.add(shell);
  activeShells.push(shell);
}

// ── GLOBAL PARTICLE UPDATE ENGINE ──
export function updateParticles(dt) {
  const GRAVITY = -18;

  // Update Blood
  for (let i = activeBloodParticles.length - 1; i >= 0; i--) {
    const p = activeBloodParticles[i];
    p.userData.life -= dt;
    
    if (p.userData.life <= 0) {
      scene.remove(p);
      activeBloodParticles.splice(i, 1);
    } else {
      p.userData.vel.y += GRAVITY * dt; // Apply gravity
      p.position.addScaledVector(p.userData.vel, dt);
    }
  }

  // Update Shells
  for (let i = activeShells.length - 1; i >= 0; i--) {
    const s = activeShells[i];
    s.userData.life -= dt;
    
    if (s.userData.life <= 0) {
      scene.remove(s);
      activeShells.splice(i, 1);
    } else {
      s.userData.vel.y += GRAVITY * dt;
      s.position.addScaledVector(s.userData.vel, dt);
      
      // Give the brass shell some tumbling rotation
      s.rotation.x += 12 * dt;
      s.rotation.y += 8 * dt;

      // Bounce lightly on the floor floor collision
      if (s.position.y < 0.02) {
        s.position.y = 0.02;
        s.userData.vel.y *= -0.3; // Dampen bounce
        s.userData.vel.x *= 0.5;  // Friction friction
        s.userData.vel.z *= 0.5;
      }
    }
  }
// Inside updateParticles(dt) in js/particles.js - Add this at the bottom:
  for (let i = activeSmoke.length - 1; i >= 0; i--) {
    const sm = activeSmoke[i];
    sm.userData.life -= dt;

    if (sm.userData.life <= 0) {
      scene.remove(sm);
      sm.material.dispose(); // Clean up material clone from memory
      activeSmoke.splice(i, 1);
    } else {
      // Move smoke forward
      sm.position.addScaledVector(sm.userData.vel, dt);
      
      // Expand size over time for a realistic "puff" look
      const growth = 1.0 + (sm.userData.maxLife - sm.userData.life) * sm.userData.scaleSpeed;
      sm.scale.setScalar(growth);
      
      // Fade opacity gradually
      sm.material.opacity = (sm.userData.life / sm.userData.maxLife) * 0.4;
    }
  }
}

const MAX_DECALS = 200;
const activeDecals = [];
const decalGeo = new THREE.PlaneGeometry(1, 1);
const decalMat = new THREE.MeshStandardMaterial({ 
  color: 0x440000, // Dark, dried blood color
  roughness: 0.9, 
  transparent: true, 
  opacity: 0.85, 
  depthWrite: false // Prevents the decal from messing up other transparent objects
});

export function spawnBloodDecal(pos) {
  const decal = new THREE.Mesh(decalGeo, decalMat);
  
  // Lay the plane flat on the floor, and spin it randomly
  decal.rotation.x = -Math.PI / 2;
  decal.rotation.z = Math.random() * Math.PI * 2;
  
  // Randomize the size of the splatter
  const scale = 0.8 + Math.random() * 1.5;
  decal.scale.set(scale, scale, 1);
  
  // Place it just barely above the floor (Y=0) to prevent texture flickering (Z-fighting)
  decal.position.set(pos.x, 0.02 + (Math.random() * 0.01), pos.z);
  
  scene.add(decal);
  activeDecals.push(decal);
  
  // Memory Management: Remove the oldest decal if we exceed the limit
  if (activeDecals.length > MAX_DECALS) {
    const oldest = activeDecals.shift();
    scene.remove(oldest);
  }
}

export function clearAllDecals() {
  activeDecals.forEach(d => scene.remove(d));
  activeDecals.length = 0;
}