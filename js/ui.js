// js/ui.js

// ════════════ HUD HELPERS ════════════

export function updateHealthHUD(health, maxHealth = 100) {
  const f = document.getElementById('health-fill');
  const l = document.getElementById('health-label');
  
  // Calculate true percentage so it never overflows the UI box
  const pct = Math.min(100, (health / maxHealth) * 100);
  f.style.width = pct + '%'; 
  l.textContent = health;
  f.style.background = pct > 60 ? '#22ff88' : pct > 30 ? '#ffaa00' : '#ff3322';
}

export function updateWeaponNameHUD(name) {
  const el = document.getElementById('weapon-name');
  if (el) el.textContent = name;
}

export function updateAmmoHUD(ammo, reserve) {
  document.getElementById('ammo-current').textContent = ammo;
  document.getElementById('ammo-reserve').textContent = '/ ' + reserve;
}

export function updateKillsHUD(kills) {
  document.getElementById('kills-display').textContent = kills + ' KILLS';
}

// Global UI timers for visual effects
export const uiTimers = {
  hitT: 0,
  dmgFlashT: 0
};

export function showHitMarker() {
  uiTimers.hitT = 0.14; 
  document.getElementById('hit-marker').style.opacity = '1';
}

export function triggerDamageFlash() {
  uiTimers.dmgFlashT = 0.22;
}

export function updateUIEffects(dt) {
  // Hit marker fade out
  if (uiTimers.hitT > 0) { 
    uiTimers.hitT -= dt; 
    if (uiTimers.hitT <= 0) {
      document.getElementById('hit-marker').style.opacity = '0'; 
    }
  }
  
  // Damage flash fade out
  if (uiTimers.dmgFlashT > 0) { 
    uiTimers.dmgFlashT -= dt;
    document.getElementById('damage-flash').style.opacity = Math.max(0, (uiTimers.dmgFlashT / 0.22) * 0.5);
    if (uiTimers.dmgFlashT <= 0) {
      document.getElementById('damage-flash').style.opacity = '0'; 
    }
  }
}

export function setInteractionPrompt(visible, text = "Press [E] to interact") {
  const el = document.getElementById('interaction-prompt');
  if (el) {
    el.style.display = visible ? 'block' : 'none';
    el.textContent = text;
  }
}

export function updateRoundHUD(round) {
  const el = document.getElementById('round-num');
  if (el) el.textContent = round;
}

export function flashWaveBanner(text, durationMs = 2000) {
  const el = document.getElementById('wave-banner');
  if (!el) return;
  
  el.textContent = text;
  el.style.display = 'block';
  
  setTimeout(() => {
    el.style.display = 'none';
  }, durationMs);
}

export function updateScoreHUD(score) {
  const el = document.getElementById('score-display');
  if (el) el.innerHTML = `${score} <span style="font-size: 20px; color: #fff;">PTS</span>`;
}

export function spawnFloatingScore(amount, isHeadshot) {
  const container = document.getElementById('floating-texts-container');
  if (!container) return;

  const el = document.createElement('div');
  el.textContent = isHeadshot ? `+${amount} HEADSHOT` : `+${amount}`;
  
  // Randomize the start position slightly around the center crosshair
  const offsetX = (Math.random() - 0.5) * 60;
  const offsetY = (Math.random() - 0.5) * 60;
  
  el.style.position = 'absolute';
  el.style.left = `calc(50% + ${offsetX}px)`;
  el.style.top = `calc(50% + ${offsetY}px)`;
  el.style.color = isHeadshot ? '#ff2200' : '#ffaa00'; // Red for heads, Gold for bodies
  el.style.fontSize = isHeadshot ? '26px' : '18px';
  el.style.fontWeight = 'bold';
  el.style.fontFamily = 'sans-serif';
  el.style.textShadow = '2px 2px 0 #000';
  el.style.pointerEvents = 'none';
  el.style.transition = 'all 0.6s ease-out';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.opacity = '1';

  container.appendChild(el);

  // Force browser reflow so the CSS transition triggers
  void el.offsetWidth;

  // Float up and fade away
  el.style.top = `calc(50% - 100px + ${offsetY}px)`;
  el.style.opacity = '0';
  el.style.transform = 'translate(-50%, -50%) scale(1.4)';

  // Remove element from DOM after animation completes
  setTimeout(() => {
    if (container.contains(el)) container.removeChild(el);
  }, 600);
}

export function showStatusToast(text, color = '#00d4ff', durationMs = 1800) {
  const container = document.getElementById('floating-texts-container');
  if (!container) return;

  const el = document.createElement('div');
  el.textContent = text;

  el.style.position = 'absolute';
  el.style.left = '50%';
  el.style.top = '34%';
  el.style.transform = 'translate(-50%, -50%) scale(0.96)';
  el.style.color = color;
  el.style.fontSize = '22px';
  el.style.fontWeight = 'bold';
  el.style.fontFamily = 'sans-serif';
  el.style.letterSpacing = '2px';
  el.style.textAlign = 'center';
  el.style.textShadow = '2px 2px 0 #000, 0 0 12px rgba(0,0,0,0.85)';
  el.style.pointerEvents = 'none';
  el.style.opacity = '0';
  el.style.transition = 'all 0.22s ease-out';
  el.style.zIndex = '30';

  container.appendChild(el);

  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -60%) scale(1.04)';
  }, Math.max(250, durationMs - 280));

  setTimeout(() => {
    if (container.contains(el)) container.removeChild(el);
  }, durationMs);
}

// ── 1. DIRECTIONAL DAMAGE INDICATOR (OPTIMIZED WITH POOLING) ──
const indicatorPool = [];
let poolIndex = 0;

// Create 5 reusable indicators at startup to prevent mid-game DOM creation
function initIndicatorPool() {
  const container = document.getElementById('damage-indicators-container');
  if (!container) return;
  
  for (let i = 0; i < 5; i++) {
    const arc = document.createElement('div');
    arc.style.position = 'absolute';
    arc.style.width = '80px';
    arc.style.height = '15px';
    arc.style.background = 'radial-gradient(ellipse, rgba(255,0,0,0.9) 0%, rgba(255,0,0,0) 70%)';
    arc.style.boxShadow = '0 0 15px #ff0000';
    arc.style.borderRadius = '50%';
    arc.style.opacity = '0'; // Start hidden
    arc.style.transition = 'opacity 1s ease-out';
    arc.style.pointerEvents = 'none';
    container.appendChild(arc);
    indicatorPool.push(arc);
  }
}
// Run this immediately when ui.js loads
setTimeout(initIndicatorPool, 100);

export function spawnDirectionalIndicator(enemyPos, playerPos, camDir) {
  if (indicatorPool.length === 0) return;

  const dx = enemyPos.x - playerPos.x;
  const dz = enemyPos.z - playerPos.z;
  const hitAngle = Math.atan2(dx, dz);
  const camAngle = Math.atan2(camDir.x, camDir.z);

  const diff = hitAngle - camAngle;
  const angleDeg = -(diff * 180) / Math.PI;

  // Grab the next available indicator from the pool
  const arc = indicatorPool[poolIndex];
  poolIndex = (poolIndex + 1) % indicatorPool.length;

  // Instantly remove transition to snap it to the new angle, then fade it in
  arc.style.transition = 'none';
  arc.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg) translateY(-120px)`;
  arc.style.opacity = '1';

  // Force a tiny delay before fading out so the browser registers the opacity reset
  requestAnimationFrame(() => {
    arc.style.transition = 'opacity 1s ease-out';
    arc.style.opacity = '0';
  });
}
// ── 2. BULLETPROOF RADAR UPDATE ──
export function updateMinimap(playerPos, camDir, enemies) {
  const canvas = document.getElementById('minimap');
  if (!canvas) return; 
  const ctx = canvas.getContext('2d');
  const w = canvas.width; const h = canvas.height;
  const cx = w / 2; const cy = h / 2;

  ctx.clearRect(0, 0, w, h);
  
  const radarRange = 60; 
  const camAngle = Math.atan2(camDir.x, camDir.z);

  // LOOP DIRECTLY THROUGH THE LIVE ENGINE ARRAYS
  enemies.forEach(e => {
    // Fail-safe to ensure the zombie instance and its 3D group exist and are alive
    if (!e || !e.mesh || !e.alive || e.dyingT >= 0) return;
    
    // Read the absolute world positions straight from the Three.js Group matrix
    const dx = e.mesh.position.x - playerPos.x;
    const dz = e.mesh.position.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    if (dist > radarRange) return; 

	const angle = Math.atan2(dx, dz) - camAngle;
    const radarDist = (dist / radarRange) * ((w / 2) - 10); 

    // ── FIX: CHANGED + TO - TO CORRECT MIRRORED RADAR ──
    const blipX = cx - Math.sin(angle) * radarDist; 
    const blipY = cy - Math.cos(angle) * radarDist;

    const enemyRadarColors = {
      SHAMBLER: '#ff3333',
      CRAWLER: '#d6ff33',
      RUNNER: '#ff6600',
      GOLIATH: '#dd00ff',
      EXPLODER: '#ffcc00',
      RANGED: '#00ffff'
    };

    ctx.fillStyle = enemyRadarColors[e.type] || '#ff2200';
    ctx.beginPath();
    ctx.arc(blipX, blipY, e.type === "GOLIATH" ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw Player Icon (Center triangle pointing UP)
  ctx.fillStyle = '#00ff66';
  ctx.beginPath(); 
  ctx.moveTo(cx, cy - 6); 
  ctx.lineTo(cx - 5, cy + 5); 
  ctx.lineTo(cx + 5, cy + 5); 
  ctx.fill();
}