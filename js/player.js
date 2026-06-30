// js/player.js
import { camera,addScreenShake } from './map.js';
import { pushOut } from './utils.js';
import { updateHealthHUD, triggerDamageFlash, spawnDirectionalIndicator } from './ui.js';
import { playSound } from './audio.js';

export const EYE_H = 1.75;
const P_RADIUS = 0.42;
const GRAVITY = -22;
const JUMP_F = 7.5;

// The central player state object
export const player = {
  pos: new THREE.Vector3(3, EYE_H, 10),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, onGround: false,
  health: 100, maxHealth: 100, // ◄── NEW: maxHealth tracking
  reloadMult: 1.0,             // ◄── NEW: Speed Cola multiplier
  ammo: 30, maxAmmo: 30, reserve: 90,
  kills: 0, alive: true,
  reloading: false, reloadT: 0, RELOAD_DUR: 1.8,
  score: 0,
  instaKillTimer: 0, doublePointsTimer: 0,
  inventory: [], currentWeaponIdx: 0,
  baseSpeed: 9.5, sprintSpeed: 15.0, adsSpeed: 4.5,
  baseFOV: 82, adsFOV: 55,
  isSprinting: false, isADS: false
};

const _fwd = new THREE.Vector3();
const _rt = new THREE.Vector3();
const _mv = new THREE.Vector3();

export function updatePlayer(dt, keys, mdx, mdy) {
  if (!player.alive) return;

  // Mouse Look
  const SENS = 0.0017;
  player.yaw -= mdx * SENS; 
  player.pitch -= mdy * SENS;
  player.pitch = Math.max(-1.54, Math.min(1.54, player.pitch));
  
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw; 
  camera.rotation.x = player.pitch;

  // Movement Vectors
  _fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _rt.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  _mv.set(0, 0, 0);

  if (keys['KeyW'] || keys['ArrowUp']) _mv.addScaledVector(_fwd, 1);
  if (keys['KeyS'] || keys['ArrowDown']) _mv.addScaledVector(_fwd, -1);
  if (keys['KeyA'] || keys['ArrowLeft']) _mv.addScaledVector(_rt, -1);
  if (keys['KeyD'] || keys['ArrowRight']) _mv.addScaledVector(_rt, 1);

  // Speed Calculation (Sprint & ADS Logic)
  let currentSpeed = player.baseSpeed;
  if (player.isADS) { 
    currentSpeed = player.adsSpeed; 
    player.isSprinting = false; 
  } 
  else if (player.isSprinting && (keys['KeyW'] || keys['ArrowUp'])) { 
    currentSpeed = player.sprintSpeed; // Only sprint if moving forward
  }

  if (_mv.lengthSq() > 0) { 
    _mv.normalize(); 
    _mv.multiplyScalar(currentSpeed); 
  }

  // Smooth Camera FOV Interpolation
  const targetFOV = player.isADS ? player.adsFOV : (player.isSprinting && currentSpeed === player.sprintSpeed ? player.baseFOV + 10 : player.baseFOV);
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, dt * 10);
  camera.updateProjectionMatrix();

  // Apply Velocity and Gravity
  player.vel.x = _mv.x; 
  player.vel.z = _mv.z;
  player.vel.y += GRAVITY * dt;

  // Jumping
  if (player.onGround && keys['Space']) { 
    player.vel.y = JUMP_F; 
    player.onGround = false; 
  }

  // Apply Position
  player.pos.x += player.vel.x * dt;
  player.pos.y += player.vel.y * dt;
  player.pos.z += player.vel.z * dt;

  // Floor collision
  if (player.pos.y < EYE_H) { 
    player.pos.y = EYE_H; 
    player.vel.y = 0; 
    player.onGround = true; 
  } else { 
    player.onGround = false; 
  }

  // Wall collision & Boundaries
  pushOut(player.pos, P_RADIUS);
  const B = 60;
  player.pos.x = Math.max(-B, Math.min(B, player.pos.x));
  player.pos.z = Math.max(-B, Math.min(B, player.pos.z));
  camera.position.copy(player.pos);
}

export function damagePlayer(dmg, sourcePos = null) {
  if (!player.alive || player.health <= 0) return;
  player.health = Math.max(0, player.health - dmg);
  
  // ── FIX: Pass both current and max health ──
  updateHealthHUD(player.health, player.maxHealth); 
  // ───────────────────────────────────────────
  
  triggerDamageFlash();
  addScreenShake(0.35);
  playSound('hurt', 0.9, true);
  
  if (sourcePos) {
    const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
    spawnDirectionalIndicator(sourcePos, player.pos, camDir);
  }
  if (player.health <= 0) { player.alive = false; document.exitPointerLock(); }
}