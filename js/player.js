// js/player.js
import * as THREE from 'three';
import { camera, addScreenShake, mapMeshes } from './map.js';
import { updateHealthHUD, triggerDamageFlash, spawnDirectionalIndicator } from './ui.js';
import { playSound } from './audio.js';
import { pushOut } from './utils.js';

export const EYE_H = 1.75;
const P_RADIUS = 0.42;
const GRAVITY = -22;
const JUMP_F = 7.5;

export const player = {
  pos: new THREE.Vector3(3, EYE_H, 10),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, onGround: false,
  health: 100, maxHealth: 100,
  reloadMult: 1.0, 
  ammo: 30, maxAmmo: 30, reserve: 90,
  kills: 0, alive: true,
  reloading: false, reloadT: 0, RELOAD_DUR: 1.8,
  score: 0,
  instaKillTimer: 0, doublePointsTimer: 0,
  inventory: [], currentWeaponIdx: 0,
  baseSpeed: 9.5, sprintSpeed: 15.0, adsSpeed: 4.5,
  baseFOV: 82, adsFOV: 55,
  isSSprint: false, isADS: false
};

const _fwd = new THREE.Vector3();
const _rt = new THREE.Vector3();
const _mv = new THREE.Vector3();

export function updatePlayer(dt, keys, mdx, mdy) {
  if (!player.alive) return;

  // ── MOUSE LOOK ──
  const SENS = 0.0017;
  player.yaw -= mdx * SENS; 
  player.pitch -= mdy * SENS;
  player.pitch = Math.max(-1.54, Math.min(1.54, player.pitch));
  
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw; 
  camera.rotation.x = player.pitch;

  // ── MOVEMENT VECTORS ──
  _fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _rt.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  _mv.set(0, 0, 0);

  if (keys['KeyW'] || keys['ArrowUp']) _mv.addScaledVector(_fwd, 1);
  if (keys['KeyS'] || keys['ArrowDown']) _mv.addScaledVector(_fwd, -1);
  if (keys['KeyA'] || keys['ArrowLeft']) _mv.addScaledVector(_rt, -1);
  if (keys['KeyD'] || keys['ArrowRight']) _mv.addScaledVector(_rt, 1);

  let currentSpeed = player.baseSpeed;
  if (player.isADS) { currentSpeed = player.adsSpeed; player.isSprinting = false; } 
  else if (player.isSprinting && (keys['KeyW'] || keys['ArrowUp'])) { currentSpeed = player.sprintSpeed; }

  if (_mv.lengthSq() > 0) { _mv.normalize(); _mv.multiplyScalar(currentSpeed); }

  const targetFOV = player.isADS ? player.adsFOV : (player.isSprinting && currentSpeed === player.sprintSpeed ? player.baseFOV + 10 : player.baseFOV);
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, dt * 10);
  camera.updateProjectionMatrix();

  player.vel.x = _mv.x; 
  player.vel.z = _mv.z;
  player.vel.y += GRAVITY * dt;

  if (player.onGround && keys['Space']) { 
    player.vel.y = JUMP_F; 
    player.onGround = false; 
  }

// ── PROCEDURAL PHYSICS (MULTISTORY WITH ANTI-TUNNELING SUB-STEPPING) ──
  const STEPS = 3; 
  const stepDt = dt / STEPS;
  
  for (let i = 0; i < STEPS; i++) {
    player.pos.x += player.vel.x * stepDt;
    player.pos.y += player.vel.y * stepDt;
    player.pos.z += player.vel.z * stepDt;

    // Slide against mathematical walls instantly in micro-steps!
    pushOut(player.pos, P_RADIUS, true); 
  }

  // 1. Raycast straight down to find the highest floor/crate under the player
  let groundY = EYE_H; 
  const downRay = new THREE.Raycaster(new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z), new THREE.Vector3(0, -1, 0), 0, 50);
  const hits = downRay.intersectObjects(mapMeshes);
  
  if (hits.length > 0) {
    // Snap ground level to the top of whatever block we are standing on
    groundY = hits[0].point.y + EYE_H;
  }

  // 2. Gravity and Jump snapping
  if (player.pos.y <= groundY) { 
    player.pos.y = groundY; 
    player.vel.y = 0; 
    player.onGround = true; 
  } else {
    player.onGround = false;
  }

  // ── FAILSAFE BOUNDARY ──
  const B = 80;
  player.pos.x = Math.max(-B, Math.min(B, player.pos.x));
  player.pos.z = Math.max(-B, Math.min(B, player.pos.z));
  camera.position.copy(player.pos);
}

export function damagePlayer(dmg, sourcePos = null) {
  if (!player.alive || player.health <= 0) return;
  player.health = Math.max(0, player.health - dmg);
  
  updateHealthHUD(player.health, player.maxHealth); 
  triggerDamageFlash();
  addScreenShake(0.35);
  playSound('hurt', 0.9, true);
  
  if (sourcePos) {
    const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
    spawnDirectionalIndicator(sourcePos, player.pos, camDir);
  }
  if (player.health <= 0) { player.alive = false; document.exitPointerLock(); }
}