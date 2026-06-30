// js/main.js
import { renderer, scene, camera, buildMap, composer, applyScreenShake, spawnPoints } from './map.js';
import { player, updatePlayer, EYE_H } from './player.js';
import { initEnemies, updateEnemies, getActiveEnemies, currentWave } from './enemy.js';
import { updateHealthHUD, updateAmmoHUD, updateKillsHUD, updateUIEffects, updateScoreHUD, updateMinimap } from './ui.js';
import { buildGun, updateGun, shoot, startReload, processReloadTick, cycleWeapon, checkWorldInteractions, getActiveWeapon, resetGunState } from './weapons.js';
import { initAudio } from './audio.js';
import { updateParticles, clearAllDecals } from './particles.js';

const canvas = document.getElementById('c');
export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
// ════════════ INPUT STATE ════════════
const keys = {};
let mdx = 0, mdy = 0, locked = false, pendingShot = false;

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR' && gs === 'playing' && player.alive) startReload();
  if (e.code === 'ShiftLeft') player.isSprinting = true;
  if (e.code === 'KeyQ' && gs === 'playing' && player.alive) cycleWeapon();
  if (e.code === 'KeyE' && gs === 'playing' && player.alive) checkWorldInteractions(true); 

  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});

window.addEventListener('keyup', e => { 
  keys[e.code] = false; 
  if (e.code === 'ShiftLeft') player.isSprinting = false;
});

window.addEventListener('mousemove', e => { 
  if (locked) { mdx += e.movementX; mdy += e.movementY; } 
});


window.addEventListener('mousedown', e => { 
  // ── FIX: BYPASS THE LÓCK CHECK IF IT'S A MOBILE USER ──
  if (gs !== 'playing' || (!locked && !isMobile) || !player.alive) return;
  
  const activeW = getActiveWeapon();
  if (activeW && activeW.reloading) return; 

  if (e.button === 0) {
    keys['MousedownLeft'] = true; 
    pendingShot = true; 
  }
  if (e.button === 2) player.isADS = true; 
});

window.addEventListener('mouseup', e => { 
  // ── FIX: ALLOW MOUSEUP REGISTRATION WITHOUT POINTER LOCK ──
  if (!locked && !isMobile) return;
  
  if (e.button === 0) keys['MousedownLeft'] = false;
  if (e.button === 2) player.isADS = false; 
});

window.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('pointerlockchange', () => {
  if (isMobile) return;
  locked = document.pointerLockElement === canvas;
  document.getElementById('lock-hint').style.display = locked ? 'none' : 'block';
  
  if (!locked) { 
    player.isADS = false; player.isSprinting = false; keys['MousedownLeft'] = false; 
    
    if (gs === 'playing' && player.alive) {
      gs = 'paused';
      document.getElementById('pause-screen').style.display = 'flex';
    }
  }
});

// ── PAUSE MENU BUTTON LISTENERS ──
document.getElementById('resume-btn').addEventListener('click', () => {
  document.getElementById('pause-screen').style.display = 'none';
  gs = 'playing';
  canvas.requestPointerLock();
});

document.getElementById('quit-btn').addEventListener('click', () => {
  window.location.reload(); 
});

canvas.addEventListener('click', () => { 
  if (gs === 'playing' && !locked) canvas.requestPointerLock(); 
});

// ════════════ GAME LOOP ════════════
let gs = 'menu', prev = 0;
// ── LOCAL STORAGE INITIALIZATION ──
let highScore = localStorage.getItem('fps_hi_score') || 0;
let highWave = localStorage.getItem('fps_hi_wave') || 1;
export let difficultyMultiplier = 1.0;

document.getElementById('hi-score').textContent = highScore;
document.getElementById('hi-wave').textContent = highWave;

function tick(t = 0) {
  requestAnimationFrame(tick);
  
  const dt = Math.min((t - prev) * 0.001, 0.05); 
  prev = t;
  
  if (gs !== 'playing') { 
    composer.render(); 
    return; 
  }
  
  updatePlayer(dt, keys, mdx, mdy);
  mdx = 0; mdy = 0;

  updateEnemies(dt);
  
  const isMoving = (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD']) && player.onGround;
  updateGun(dt, keys, isMoving);
  
  checkWorldInteractions(false); 

  if (pendingShot) { 
    shoot(); 
    pendingShot = false; 
  }
  
  updateParticles(dt);
  updateUIEffects(dt);
  processReloadTick(dt);

  if (!player.alive && gs === 'playing') {
    gs = 'dead';
    document.getElementById('final-kills').textContent = player.kills;
    
    if (player.score > highScore) { 
      highScore = player.score; 
      localStorage.setItem('fps_hi_score', highScore); 
    }
    if (currentWave > highWave) { 
      highWave = currentWave; 
      localStorage.setItem('fps_hi_wave', highWave); 
    }
    
    setTimeout(() => { document.getElementById('death-screen').style.display = 'flex'; }, 700);
  }
  
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  updateMinimap(player.pos, camDir, getActiveEnemies());
  applyScreenShake(dt); 
  composer.render();
}

// ════════════ INIT / RESPAWN ════════════

// ── FIX: ADDED 'async' HERE SO AWAIT IS PERMITTED ──
document.getElementById('start-btn').addEventListener('click', async () => {
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  
  const chosenMap = parseInt(document.getElementById('map-select').value) || 0;
  buildMap(chosenMap);
  
  difficultyMultiplier = parseFloat(document.getElementById('diff-select').value) || 1.0;
  
  if (spawnPoints && spawnPoints.length > 0) {
    const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    player.pos.set(sp.x, EYE_H, sp.z);
  }

  if (isMobile) {
    gs = 'playing'; 
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (err) {
      console.warn("Fullscreen or orientation lock failed:", err);
    }
  } else {
    canvas.requestPointerLock();
  }
  
  scene.add(camera); 
  initAudio();
  
  buildGun(); // Ensure armory sets up properly
  resetGunState();
  initEnemies();
  
  updateHealthHUD(player.health); 
  updateAmmoHUD(getActiveWeapon().ammo, getActiveWeapon().reserve); 
  updateKillsHUD(player.kills);
  updateScoreHUD(player.score);
  
  gs = 'playing'; 
  requestAnimationFrame(tick); 
});

function respawnPlayer() {
  const activeW = getActiveWeapon();
  if (activeW && activeW.meshGroup) {
    camera.remove(activeW.meshGroup);
  }

  const chosenMap = parseInt(document.getElementById('map-select').value) || 0;
  buildMap(chosenMap);

  if (spawnPoints && spawnPoints.length > 0) {
    const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    player.pos.set(sp.x, EYE_H, sp.z);
  } else {
    player.pos.set(0, EYE_H, 15); 
  }
  
  player.vel.set(0, 0, 0); 
  player.yaw = Math.random() * Math.PI * 2; 
  player.health = 100; 
  player.maxHealth = 100;   // Reset Juggernog perk
  player.reloadMult = 1.0;  // Reset Speed Cola perk
  player.kills = 0; 
  player.score = 0; 
  player.instaKillTimer = 0;
  player.doublePointsTimer = 0;
  player.alive = true; 
  
  buildGun(); // Re-initialize default gun inventory
  resetGunState();
  initEnemies(); 
  clearAllDecals();
  
  updateHealthHUD(player.health, player.maxHealth); 
  updateAmmoHUD(getActiveWeapon().ammo, getActiveWeapon().reserve); 
  updateKillsHUD(player.kills);
  updateScoreHUD(player.score); 
  
  document.getElementById('damage-flash').style.opacity = '0';
  document.getElementById('death-screen').style.display = 'none';
  
  if (!isMobile) canvas.requestPointerLock();
  gs = 'playing'; 
}

document.getElementById('respawn-btn').addEventListener('click', respawnPlayer);
document.getElementById('death-quit-btn').addEventListener('click', () => {
  window.location.reload(); 
});

// ── MOBILE TOUCH ENGINE ──
if (isMobile) {
  document.getElementById('mobile-ui').style.display = 'block';
  document.getElementById('controls-grid').style.display = 'none'; 

  const joyLeft = document.getElementById('joystick-left');
  const joyKnob = document.getElementById('joystick-knob');
  let joyCenter = { x: 0, y: 0 };
  let joyTouchId = null;

  joyLeft.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    joyTouchId = touch.identifier;
    const rect = joyLeft.getBoundingClientRect();
    joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateJoy(touch);
  }, { passive: false });

  joyLeft.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId) updateJoy(e.changedTouches[i]);
    }
  }, { passive: false });

  joyLeft.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId) {
        joyTouchId = null;
        joyKnob.style.transform = `translate(-50%, -50%)`;
        keys['KeyW'] = keys['KeyS'] = keys['KeyA'] = keys['KeyD'] = false; 
      }
    }
  }, { passive: false });

  function updateJoy(touch) {
    let dx = touch.clientX - joyCenter.x;
    let dy = touch.clientY - joyCenter.y;
    const maxD = 45;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxD) { dx = (dx / dist) * maxD; dy = (dy / dist) * maxD; }
    joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const thresh = 12;
    keys['KeyW'] = dy < -thresh;
    keys['KeyS'] = dy > thresh;
    keys['KeyA'] = dx < -thresh;
    keys['KeyD'] = dx > thresh;
  }

  const lookArea = document.getElementById('touch-look-area');
  let lookTouchId = null;
  let lastLook = { x: 0, y: 0 };

  lookArea.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    lookTouchId = touch.identifier;
    lastLook = { x: touch.clientX, y: touch.clientY };
  }, { passive: false });

  lookArea.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) {
        const touch = e.changedTouches[i];
        const dx = touch.clientX - lastLook.x;
        const dy = touch.clientY - lastLook.y;
        lastLook = { x: touch.clientX, y: touch.clientY };

        player.yaw -= dx * 0.007; 
        player.pitch -= dy * 0.007;
        player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch));
      }
    }
  }, { passive: false });

  lookArea.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
    }
  }, { passive: false });

  function bindTouchBtn(id, keyStr, isMouse = false) {
    document.getElementById(id).addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (isMouse) { keys['MousedownLeft'] = true; window.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); }
      else { keys[keyStr] = true; window.dispatchEvent(new KeyboardEvent('keydown', { code: keyStr })); }
    }, { passive: false });

    document.getElementById(id).addEventListener('touchend', (e) => {
      e.preventDefault();
      if (isMouse) { keys['MousedownLeft'] = false; window.dispatchEvent(new MouseEvent('mouseup', { button: 0 })); }
      else { keys[keyStr] = false; window.dispatchEvent(new KeyboardEvent('keyup', { code: keyStr })); }
    }, { passive: false });
  }

  bindTouchBtn('btn-jump', 'Space');
  bindTouchBtn('btn-reload', 'KeyR');
  bindTouchBtn('btn-interact', 'KeyE');
  bindTouchBtn('btn-shoot', '', true);
}