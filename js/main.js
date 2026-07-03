// js/main.js
import { renderer, scene, camera, buildMap, composer, applyScreenShake, spawnPoints, playerSpawnPoints } from './map.js';
import { player, updatePlayer, EYE_H } from './player.js';
import { initEnemies, updateEnemies, getActiveEnemies, currentWave, getEnemyVisualStats } from './enemy.js';
import { updateHealthHUD, updateAmmoHUD, updateKillsHUD, updateUIEffects, updateScoreHUD, updateMinimap } from './ui.js';
import { buildGun, updateGun, shoot, startReload, processReloadTick, cycleWeapon, checkWorldInteractions, getActiveWeapon, resetGunState, updateShops } from './weapons.js';
import { initAudio } from './audio.js';
import { updateParticles, clearAllDecals } from './particles.js';

const canvas = document.getElementById('c');
renderer.info.autoReset = false;
let usePostProcessing = true;

window.addEventListener('keydown', (e) => {
  if (e.code === 'F4') {
    e.preventDefault();
    usePostProcessing = !usePostProcessing;
    console.log("Post Processing:", usePostProcessing ? "ON" : "OFF");
  }
});

function renderGameFrame() {
  renderer.info.reset();

  if (usePostProcessing) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}
export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ════════════ DEVELOPER DEBUG MODE ════════════
export const DEV_MODE = true; 
// ══════════════════════════════════════════════

// ════════════ INPUT STATE ════════════
const keys = {};
let mdx = 0, mdy = 0, locked = false, pendingShot = false;

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR' && gs === 'playing' && player.alive) startReload();
  if (e.code === 'ShiftLeft') player.isSprinting = true;
  if (e.code === 'KeyQ' && gs === 'playing' && player.alive) cycleWeapon();
  if (e.code === 'KeyE' && gs === 'playing' && player.alive) checkWorldInteractions(true); 

  // ── DEV MODE: INSTANT NUKE ──
  if (DEV_MODE && e.code === 'Digit0' && gs === 'playing') {
    getActiveEnemies().forEach(enemy => { enemy.health = 0; });
    console.log("DEV MODE: NUKED ALL ZOMBIES!");
  }

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
	  resetFrameStats();
  document.getElementById('pause-screen').style.display = 'none';
  gs = 'playing';
  if (!isMobile) canvas.requestPointerLock();
});

document.getElementById('quit-btn').addEventListener('click', () => {
  window.location.reload(); 
});

canvas.addEventListener('click', () => { 
  if (gs === 'playing' && !locked && !isMobile) canvas.requestPointerLock(); 
});

// ── MOBILE IN-GAME PAUSE BUTTON LISTENER ──
document.getElementById('btn-mobile-pause').addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (gs === 'playing' && player.alive) {
    gs = 'paused';
    document.getElementById('pause-screen').style.display = 'flex';
  }
}, { passive: false });  

// ════════════ GAME LOOP ════════════

export const ASSETS = {
  weapons: { pistol: null, smg: null, rifle: null, shotgun: null },
  enemies: { zombie: null }
};

const loadingManager = new THREE.LoadingManager();
const gltfLoader = new THREE.GLTFLoader(loadingManager);

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  const pct = Math.floor((itemsLoaded / itemsTotal) * 100);
  document.getElementById('loading-bar-fill').style.width = pct + '%';
  document.getElementById('loading-pct').textContent = pct + '%';
};

loadingManager.onLoad = () => {
  document.getElementById('loading-container').style.display = 'none';
  document.getElementById('start-btn').style.display = 'inline-block'; 
  console.log("All 3D assets loaded successfully!");
};

loadingManager.onError = (url) => {
  console.error("Error loading asset from path: " + url);
};

gltfLoader.load('assets/models/pistol.glb', (gltf) => {
  ASSETS.weapons.pistol = gltf.scene;
  assetManager.addModel('pistol', gltf.scene);
});

gltfLoader.load('assets/models/smg.glb', (gltf) => {
  ASSETS.weapons.smg = gltf.scene;
  assetManager.addModel('smg', gltf.scene);
});

gltfLoader.load('assets/models/rifle.glb', (gltf) => {
  ASSETS.weapons.rifle = gltf.scene;
  assetManager.addModel('rifle', gltf.scene);
});

gltfLoader.load('assets/models/shotgun.glb', (gltf) => {
  ASSETS.weapons.shotgun = gltf.scene;
  assetManager.addModel('shotgun', gltf.scene);
});


let gs = 'menu', prev = 0;
let smoothFps = 60;
let worstFrameMs = 0;
let lastSpike = "none";

function resetFrameStats() {
  smoothFps = 60;
  worstFrameMs = 0;
  lastSpike = "none";
  prev = 0;
}
let highScore = localStorage.getItem('fps_hi_score') || 0;
let highWave = localStorage.getItem('fps_hi_wave') || 1;
export let difficultyMultiplier = 1.0;

// ── MAIN MENU SIZES SLIDER LOGIC ──
const sizeSlider = document.getElementById('btn-size-slider');
const savedSize = localStorage.getItem('mobile_btn_size') || '60';
if (sizeSlider) {
  sizeSlider.value = savedSize;
  document.documentElement.style.setProperty('--mobile-btn-size', savedSize + 'px');
  sizeSlider.addEventListener('input', (e) => {
    const newSize = e.target.value;
    document.documentElement.style.setProperty('--mobile-btn-size', newSize + 'px');
    localStorage.setItem('mobile_btn_size', newSize);
    ['joy', 'switch', 'interact', 'reload', 'jump', 'shoot'].forEach(key => {
      document.documentElement.style.removeProperty(`--sz-${key}`);
    });
  });
}

document.getElementById('hi-score').textContent = highScore;
document.getElementById('hi-wave').textContent = highWave;

function tick(t = 0) {
  requestAnimationFrame(tick);
  
if (prev === 0) prev = t;

let rawDt = (t - prev) * 0.001;
prev = t;

// Ignore fake huge gaps caused by tab switches, pause, death screen, pointer lock, etc.
if (rawDt > 0.25) {
  rawDt = 1 / 60;
}

const dt = Math.min(rawDt, 0.05);

const instantFps = rawDt > 0 ? 1 / rawDt : 60;
smoothFps = smoothFps * 0.9 + instantFps * 0.1;

const rawFrameMs = rawDt * 1000;

if (gs === 'playing') {
  if (rawFrameMs > worstFrameMs) {
    worstFrameMs = rawFrameMs;
  }

  if (rawFrameMs > 25) {
    lastSpike = `${rawFrameMs.toFixed(1)} ms`;
  }
}
  
  if (gs !== 'playing') { 
    renderGameFrame();
    return; 
  }
  
const frameStart = performance.now();
let mark = frameStart;

updatePlayer(dt, keys, mdx, mdy);
mdx = 0; mdy = 0;
const playerMs = performance.now() - mark;
mark = performance.now();

updateEnemies(dt);
const enemiesMs = performance.now() - mark;
mark = performance.now();

const isMoving = (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD']) && player.onGround;
updateGun(dt, keys, isMoving);
updateShops(dt);
checkWorldInteractions(false); 

if (pendingShot) { 
  shoot(); 
  pendingShot = false; 
}

const weaponMs = performance.now() - mark;
mark = performance.now();

updateParticles(dt);
updateUIEffects(dt);
processReloadTick(dt);
const effectsMs = performance.now() - mark;

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
  
mark = performance.now();

const camDir = new THREE.Vector3();
camera.getWorldDirection(camDir);
updateMinimap(player.pos, camDir, getActiveEnemies());
applyScreenShake(dt); 

const minimapMs = performance.now() - mark;

const renderStart = performance.now();

renderGameFrame();

const renderMs = performance.now() - renderStart;
const frameMs = performance.now() - frameStart;

devConsole.update({
    fps: Math.round(smoothFps),
	instantFps: Math.round(instantFps),
	frameMs: frameMs.toFixed(2),
	rawFrameMs: rawFrameMs.toFixed(2),
	worstFrameMs: worstFrameMs.toFixed(2),
	lastSpike: lastSpike,

    wave: currentWave,
	postProcessing: usePostProcessing ? "ON" : "OFF",
    actors: actorManager.count(),
    enemies: getActiveEnemies().length,
	...getEnemyVisualStats(),
    playerMs: playerMs.toFixed(2),
    enemiesMs: enemiesMs.toFixed(2),
    weaponMs: weaponMs.toFixed(2),
    effectsMs: effectsMs.toFixed(2),
	minimapMs: minimapMs.toFixed(2),
    renderMs: renderMs.toFixed(2),

    ...assetManager.stats(),

    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    gpuGeometries: renderer.info.memory.geometries,
    gpuTextures: renderer.info.memory.textures
});
}

// ════════════ INIT / RESPAWN ════════════

document.getElementById('start-btn').addEventListener('click', async () => {
	  resetFrameStats();
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  
  // ── PROCEDURAL MAP GENERATION (Synchronous) ──
  const chosenMap = document.getElementById('map-select')?.value || "grid_bunker";
  buildMap(chosenMap);
  
  difficultyMultiplier = parseFloat(document.getElementById('diff-select').value) || 1.0;
  
  const playerStartPool = playerSpawnPoints.length > 0 ? playerSpawnPoints : spawnPoints;

  if (playerStartPool && playerStartPool.length > 0) {
    const sp = playerStartPool[Math.floor(Math.random() * playerStartPool.length)];
    player.pos.set(sp.x, EYE_H, sp.z);
  } else {
    player.pos.set(0, EYE_H, 15);
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
  
	buildGun(); 
	resetGunState();

	initEnemies();
	clearAllDecals();

	if (DEV_MODE) {
    player.score = 999999;
    console.log("DEV MODE ACTIVE: Infinite Points & Nuke Hotkey ('0') Enabled!");
  }
  
  updateHealthHUD(player.health); 
  updateAmmoHUD(getActiveWeapon().ammo, getActiveWeapon().reserve); 
  updateKillsHUD(player.kills);
  updateScoreHUD(player.score);
  
  gs = 'playing'; 
  requestAnimationFrame(tick); 
});

async function respawnPlayer() {
	  resetFrameStats();
  const activeW = getActiveWeapon();
  if (activeW && activeW.meshGroup) {
    camera.remove(activeW.meshGroup);
  }

  // ── PROCEDURAL MAP GENERATION (Synchronous) ──
  const chosenMap = document.getElementById('map-select')?.value || "grid_bunker";
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
  player.maxHealth = 100;   
  player.reloadMult = 1.0;  
  player.kills = 0; 
  player.score = 0; 
  player.instaKillTimer = 0;
  player.doublePointsTimer = 0;
  player.alive = true; 
  
  buildGun(); 
  resetGunState();
  initEnemies(); 
  clearAllDecals();
  
  if (DEV_MODE) player.score = 999999;
  
  updateHealthHUD(player.health, player.maxHealth); 
  updateAmmoHUD(getActiveWeapon().ammo, getActiveWeapon().reserve); 
  updateKillsHUD(player.kills);
  updateScoreHUD(player.score); 
  
  document.getElementById('damage-flash').style.opacity = '0';
  document.getElementById('death-screen').style.display = 'none';
  
  if (isMobile) {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (err) {
      console.warn("Fullscreen/Orientation lock failed on respawn:", err);
    }
  } else {
    canvas.requestPointerLock();
  }
  
  gs = 'playing'; 
}

document.getElementById('respawn-btn').addEventListener('click', respawnPlayer);
document.getElementById('death-quit-btn').addEventListener('click', () => {
  window.location.reload(); 
});

// ════════════ MOBILE TOUCH ENGINE ════════════
if (isMobile) {
  document.getElementById('mobile-ui').style.display = 'block';
  document.getElementById('controls-grid').style.display = 'none'; 

  const menuSliderWrap = document.getElementById('btn-size-slider')?.parentElement;
  if (menuSliderWrap) menuSliderWrap.style.display = 'block';
  const mobileCustomBtn = document.getElementById('mobile-customize-btn');
  if (mobileCustomBtn) mobileCustomBtn.style.display = 'block';

  let isCustomizingLayout = false;
  let selectedLayoutElement = null;
  let layoutData = JSON.parse(localStorage.getItem('mobile_layout_v3')) || {};

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && gs === 'playing') {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        }
      } catch (err) {
        console.warn("Auto-orientation recovery lock failed:", err);
      }
    }
  });

  const joyLeft = document.getElementById('joystick-left');
  const joyKnob = document.getElementById('joystick-knob');
  let joyCenter = { x: 0, y: 0 };
  let joyTouchId = null;

  joyLeft.addEventListener('touchstart', (e) => {
    if (isCustomizingLayout) return; 
    e.preventDefault();
    const touch = e.changedTouches[0];
    joyTouchId = touch.identifier;
    const rect = joyLeft.getBoundingClientRect();
    joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateJoy(touch);
  }, { passive: false });

  joyLeft.addEventListener('touchmove', (e) => {
    if (isCustomizingLayout) return; 
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId) updateJoy(e.changedTouches[i]);
    }
  }, { passive: false });

  joyLeft.addEventListener('touchend', (e) => {
    if (isCustomizingLayout) return; 
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
    if (isCustomizingLayout) return; 
    e.preventDefault();
    const touch = e.changedTouches[0];
    lookTouchId = touch.identifier;
    lastLook = { x: touch.clientX, y: touch.clientY };
  }, { passive: false });

  lookArea.addEventListener('touchmove', (e) => {
    if (isCustomizingLayout) return; 
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
    if (isCustomizingLayout) return; 
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
    }
  }, { passive: false });

  function bindTouchBtn(id, keyStr, isMouse = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => {
      if (isCustomizingLayout) return; 
      e.preventDefault();
      if (isMouse) { keys['MousedownLeft'] = true; window.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); }
      else { keys[keyStr] = true; window.dispatchEvent(new KeyboardEvent('keydown', { code: keyStr })); }
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      if (isCustomizingLayout) return; 
      e.preventDefault();
      if (isMouse) { keys['MousedownLeft'] = false; window.dispatchEvent(new MouseEvent('mouseup', { button: 0 })); }
      else { keys[keyStr] = false; window.dispatchEvent(new KeyboardEvent('keyup', { code: keyStr })); }
    }, { passive: false });
  }

  bindTouchBtn('btn-switch', 'KeyQ');
  bindTouchBtn('btn-jump', 'Space');
  bindTouchBtn('btn-reload', 'KeyR');
  bindTouchBtn('btn-interact', 'KeyE');
  bindTouchBtn('btn-shoot', '', true);

  // ── PUBG-STYLE INTERACTIVE LAYOUT CONFIGURATOR ──
  function applySavedLayout() {
    Object.keys(layoutData).forEach(key => {
      const config = layoutData[key];
      const element = document.querySelector(`[data-key="${key}"]`);
      if (element) {
        if (config.left !== undefined) element.style.left = config.left;
        if (config.right !== undefined) element.style.right = config.right;
        if (config.top !== undefined) element.style.top = config.top;
        if (config.bottom !== undefined) element.style.bottom = config.bottom;
        
        if (config.size !== undefined) {
          document.documentElement.style.setProperty(`--sz-${key}`, config.size + 'px');
          element.style.width = config.size + 'px';
          element.style.height = config.size + 'px';
        }
      }
    });
  }
  applySavedLayout();

  document.getElementById('mobile-customize-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    document.getElementById('pause-screen').style.display = 'none'; 
    document.getElementById('layout-editor-bar').style.display = 'flex'; 
    isCustomizingLayout = true;
    
    document.querySelectorAll('.draggable-btn').forEach(btn => {
      btn.style.border = "2px dashed #00d4ff";
      btn.style.boxShadow = "0 0 8px rgba(0,212,255,0.4)";
    });
  });

  let activeTouchId = null;
  let touchOffset = { x: 0, y: 0 };

  document.querySelectorAll('.draggable-btn').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
      if (!isCustomizingLayout) return;
      e.preventDefault();
      
      if (selectedLayoutElement) selectedLayoutElement.style.background = ""; 
      selectedLayoutElement = btn;
      selectedLayoutElement.style.background = "rgba(0, 212, 255, 0.3)"; 
      
      const currentKey = btn.getAttribute('data-key');
      const computedSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--sz-${currentKey}`)) || btn.offsetWidth;
      document.getElementById('layout-element-size').value = computedSize;

      const touch = e.changedTouches[0];
      activeTouchId = touch.identifier;
      const rect = btn.getBoundingClientRect();
      
      touchOffset.x = touch.clientX - rect.left;
      touchOffset.y = touch.clientY - rect.top;
    }, { passive: false });

    btn.addEventListener('touchmove', (e) => {
      if (!isCustomizingLayout || !selectedLayoutElement || selectedLayoutElement !== btn) return;
      e.preventDefault();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === activeTouchId) {
          const xPct = (touch.clientX - touchOffset.x) / window.innerWidth * 100;
          const yPct = (window.innerHeight - (touch.clientY - touchOffset.y + btn.offsetHeight)) / window.innerHeight * 100;
          
          if (xPct < 50) {
            btn.style.left = `${Math.max(0, xPct).toFixed(2)}%`;
            btn.style.right = "auto";
          } else {
            btn.style.right = `${Math.max(0, 100 - xPct - (btn.offsetWidth / window.innerWidth * 100)).toFixed(2)}%`;
            btn.style.left = "auto";
          }

          if (yPct < 50) {
            btn.style.bottom = `${Math.max(0, yPct).toFixed(2)}%`;
            btn.style.top = "auto";
          } else {
            btn.style.top = `${Math.max(0, 100 - yPct - (btn.offsetHeight / window.innerHeight * 100)).toFixed(2)}%`;
            btn.style.bottom = "auto";
          }
        }
      }
    }, { passive: false });
  });

  document.getElementById('layout-element-size').addEventListener('input', (e) => {
    if (!selectedLayoutElement) return;
    const targetSize = e.target.value;
    const currentKey = selectedLayoutElement.getAttribute('data-key');
    
    document.documentElement.style.setProperty(`--sz-${currentKey}`, targetSize + 'px');
    selectedLayoutElement.style.width = targetSize + 'px';
    selectedLayoutElement.style.height = targetSize + 'px';
  });

  document.getElementById('layout-save-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    document.querySelectorAll('.draggable-btn').forEach(btn => {
      const key = btn.getAttribute('data-key');
      const computedSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--sz-${key}`)) || btn.offsetWidth;
      
      layoutData[key] = {
        left: btn.style.left,
        right: btn.style.right,
        top: btn.style.top,
        bottom: btn.style.bottom,
        size: computedSize
      };
    });
    localStorage.setItem('mobile_layout_v3', JSON.stringify(layoutData));
    closeLayoutMenu();
  });

  document.getElementById('layout-cancel-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    layoutData = JSON.parse(localStorage.getItem('mobile_layout_v3')) || {};
    applySavedLayout(); 
    closeLayoutMenu();
  });

  function closeLayoutMenu() {
    isCustomizingLayout = false;
    if (selectedLayoutElement) selectedLayoutElement.style.background = "";
    selectedLayoutElement = null;
    
    document.getElementById('layout-editor-bar').style.display = 'none';
    document.getElementById('pause-screen').style.display = 'flex'; 

    document.querySelectorAll('.draggable-btn').forEach(btn => {
      btn.style.border = "";
      btn.style.boxShadow = "";
      if (btn.getAttribute('data-key') === 'shoot') btn.style.boxShadow = "0 0 10px rgba(255,34,0,0.2)";
    });
  }
} else {
  // ── DESKTOP AUTO-HIDE PROFILE RE-STYLER ──
  const menuSliderWrap = document.getElementById('btn-size-slider')?.parentElement;
  if (menuSliderWrap) menuSliderWrap.style.display = 'none';
  
  const mobileCustomBtn = document.getElementById('mobile-customize-btn');
  if (mobileCustomBtn) mobileCustomBtn.style.display = 'none';
}