// js/ui.js

// ════════════ HUD HELPERS ════════════

export function updateHealthHUD(health, maxHealth = 100) {
  const f = document.getElementById('health-fill');
  const l = document.getElementById('health-label');
  const wrap = document.getElementById('health-wrap');
  if (!f || !l) return;

  // Calculate true percentage so it never overflows the UI box
  const pct = Math.min(100, Math.max(0, (health / Math.max(1, maxHealth)) * 100));
  f.style.width = pct + '%'; 
  l.textContent = Math.ceil(health);
  f.style.background = pct > 60 ? '#22ff88' : pct > 30 ? '#ffaa00' : '#ff3322';

  if (wrap) {
    wrap.classList.toggle('hud-low-health', pct <= 32);
    wrap.classList.toggle('hud-critical-health', pct <= 18);
  }
}

export function updateWeaponNameHUD(name) {
  const el = document.getElementById('weapon-name');
  if (el) el.textContent = name;
}

let lastAmmoValue = null;
const MAX_FLOATING_TEXTS = 24;
const MINIMAP_DRAW_INTERVAL_MS = 85;
let lastMinimapDrawAt = -Infinity;

export function updateAmmoHUD(ammo, reserve, maxAmmo = null) {
  const current = document.getElementById('ammo-current');
  const reserveEl = document.getElementById('ammo-reserve');
  const wrap = document.getElementById('ammo-wrap');

  const safeAmmo = Math.max(0, Number(ammo) || 0);
  const safeReserve = Math.max(0, Number(reserve) || 0);
  const safeMaxAmmo = Math.max(1, Number(maxAmmo) || safeAmmo || 1);

  if (current) {
    current.textContent = safeAmmo;

    if (lastAmmoValue !== null && safeAmmo < lastAmmoValue) {
      current.classList.remove('ammo-shot-pop');
      void current.offsetWidth;
      current.classList.add('ammo-shot-pop');
    }
  }

  if (reserveEl) reserveEl.textContent = '/ ' + safeReserve;

  if (wrap) {
    const ammoPct = safeAmmo / safeMaxAmmo;
    wrap.classList.toggle('ammo-low', safeAmmo > 0 && ammoPct <= 0.25);
    wrap.classList.toggle('ammo-empty', safeAmmo <= 0);
    wrap.classList.toggle('ammo-no-reserve', safeAmmo <= 0 && safeReserve <= 0);
  }

  lastAmmoValue = safeAmmo;
}

export function updateKillsHUD(kills) {
  document.getElementById('kills-display').textContent = kills + ' KILLS';
}

// Global UI timers for visual effects
export const uiTimers = {
  hitT: 0,
  dmgFlashT: 0,
  hitVariant: 'body'
};

const DAMAGE_INDICATORS_KEY = 'ka_damage_indicators';
let damageIndicatorsEnabled = readDamageIndicatorsSetting();

function readDamageIndicatorsSetting() {
  try {
    return localStorage.getItem(DAMAGE_INDICATORS_KEY) !== 'off';
  } catch {
    return true;
  }
}

function hideDamageIndicatorPool() {
  indicatorPool.forEach((arc) => {
    arc.style.opacity = '0';
  });
}

export function setDamageIndicatorsEnabled(enabled) {
  damageIndicatorsEnabled = enabled !== false;

  try {
    localStorage.setItem(DAMAGE_INDICATORS_KEY, damageIndicatorsEnabled ? 'on' : 'off');
  } catch {
    // Ignore storage failures in private browsing / restricted modes.
  }

  if (!damageIndicatorsEnabled) {
    hideDamageIndicatorPool();
  }

  return damageIndicatorsEnabled;
}

export function getDamageIndicatorsEnabled() {
  return damageIndicatorsEnabled;
}

export function showHitMarker(options = {}) {
  const marker = document.getElementById('hit-marker');
  if (!marker) return;

  const mode = typeof options === 'string'
    ? options
    : (options.kill ? 'kill' : (options.headshot ? 'headshot' : 'body'));

  uiTimers.hitVariant = mode;
  uiTimers.hitT = mode === 'kill' ? 0.22 : (mode === 'headshot' ? 0.18 : 0.13);

  marker.classList.remove('hit-body', 'hit-headshot', 'hit-kill');
  marker.classList.add(mode === 'kill' ? 'hit-kill' : (mode === 'headshot' ? 'hit-headshot' : 'hit-body'));
  marker.style.opacity = '1';
  marker.style.transform = 'translate(-50%, -50%) scale(1.22)';

  requestAnimationFrame(() => {
    marker.style.transform = 'translate(-50%, -50%) scale(1)';
  });
}

export function triggerDamageFlash() {
  uiTimers.dmgFlashT = 0.22;
}

export function updateUIEffects(dt) {
  // Hit marker fade out
  if (uiTimers.hitT > 0) {
    uiTimers.hitT -= dt;
    const marker = document.getElementById('hit-marker');
    if (marker) {
      marker.style.opacity = String(Math.max(0, uiTimers.hitT / 0.22));
      if (uiTimers.hitT <= 0) {
        marker.style.opacity = '0';
        marker.classList.remove('hit-body', 'hit-headshot', 'hit-kill');
      }
    }
  }

  // Damage flash fade out
  if (uiTimers.dmgFlashT > 0) {
    uiTimers.dmgFlashT -= dt;
    const damageFlash = document.getElementById('damage-flash');
    if (damageFlash) {
      damageFlash.style.opacity = Math.max(0, (uiTimers.dmgFlashT / 0.22) * 0.5);
      if (uiTimers.dmgFlashT <= 0) {
        damageFlash.style.opacity = '0';
      }
    }
  }
}

function getPromptTone(text = '') {
  const value = String(text).toUpperCase();

  if (value.includes('NOT ENOUGH') || value.includes('NEED ') || value.includes('RECHARGING') || value.includes('COOLDOWN') || value.includes('ROLLING') || value.includes('MOVE CLOSER')) return 'warning';
  if (value.includes('ALREADY') || value.includes('FULLY REPAIRED') || value.includes('FULL')) return 'muted';
  if (value.includes('PRESS [E]') || value.includes('TAKE')) return 'ready';

  return 'default';
}

export function setInteractionPrompt(visible, text = "Press [E] to interact") {
  const el = document.getElementById('interaction-prompt');
  if (!el) return;

  el.style.display = visible ? 'block' : 'none';

  if (!visible) {
    el.classList.remove('prompt-ready', 'prompt-warning', 'prompt-muted');
    return;
  }

  const nextText = String(text || "Press [E] to interact");
  if (el.textContent !== nextText) {
    el.textContent = nextText;
  }

  const tone = getPromptTone(nextText);
  el.classList.toggle('prompt-ready', tone === 'ready');
  el.classList.toggle('prompt-warning', tone === 'warning');
  el.classList.toggle('prompt-muted', tone === 'muted');
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

export function spawnFloatingScore(amount, isHeadshot, label = '') {
  const container = document.getElementById('floating-texts-container');
  if (!container) return;

  while (container.children.length >= MAX_FLOATING_TEXTS && container.firstElementChild) {
    container.removeChild(container.firstElementChild);
  }

  const el = document.createElement('div');
  const cleanLabel = String(label || '').trim();
  const isKillLabel = /KILL|BOUNTY|GOLIATH|BRUTE|EXPLODER|RUNNER|CRAWLER|RANGED|SPITTER/i.test(cleanLabel);

  el.textContent = cleanLabel
    ? `+${amount} ${cleanLabel}`
    : (isHeadshot ? `+${amount} HEADSHOT` : `+${amount}`);

  el.className = 'floating-score';
  if (isHeadshot) el.classList.add('headshot');
  if (isKillLabel) el.classList.add('kill');

  // Randomize the start position slightly around the center crosshair
  const offsetX = (Math.random() - 0.5) * 60;
  const offsetY = (Math.random() - 0.5) * 60;

  el.style.position = 'absolute';
  el.style.left = `calc(50% + ${offsetX}px)`;
  el.style.top = `calc(50% + ${offsetY}px)`;
  el.style.pointerEvents = 'none';
  el.style.transform = 'translate(-50%, -50%) scale(0.92)';
  el.style.opacity = '1';

  container.appendChild(el);

  // Force browser reflow so the CSS transition triggers
  void el.offsetWidth;

  // Float up and fade away
  el.style.top = `calc(50% - ${isKillLabel ? 122 : 100}px + ${offsetY}px)`;
  el.style.opacity = '0';
  el.style.transform = `translate(-50%, -50%) scale(${isHeadshot || isKillLabel ? 1.42 : 1.25})`;

  // Remove element from DOM after animation completes
  setTimeout(() => {
    if (container.contains(el)) container.removeChild(el);
  }, 680);
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


// ── SHOP / MYSTERY BOX FEEDBACK PANEL ──
let shopFeedbackTimer = null;

export function showShopFeedback({
  title = 'SHOP',
  body = '',
  tone = 'default',
  durationMs = 1800,
  progress = null
} = {}) {
  const panel = document.getElementById('shop-feedback-panel');
  const titleEl = document.getElementById('shop-feedback-title');
  const bodyEl = document.getElementById('shop-feedback-body');
  const meter = document.getElementById('shop-feedback-meter');
  const fill = document.getElementById('shop-feedback-fill');

  if (!panel || !titleEl || !bodyEl) return;

  panel.classList.remove('ready', 'warning', 'mystery');
  if (tone === 'ready' || tone === 'warning' || tone === 'mystery') panel.classList.add(tone);

  titleEl.textContent = title;
  bodyEl.textContent = body;
  panel.style.display = 'block';

  if (meter && fill) {
    if (typeof progress === 'number') {
      meter.style.display = 'block';
      fill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
    } else {
      meter.style.display = 'none';
      fill.style.width = '0%';
    }
  }

  if (shopFeedbackTimer) clearTimeout(shopFeedbackTimer);
  shopFeedbackTimer = null;

  if (durationMs > 0) {
    shopFeedbackTimer = setTimeout(() => hideShopFeedback(), durationMs);
  }
}

export function updateShopFeedbackProgress(progress, body = null) {
  const panel = document.getElementById('shop-feedback-panel');
  const bodyEl = document.getElementById('shop-feedback-body');
  const meter = document.getElementById('shop-feedback-meter');
  const fill = document.getElementById('shop-feedback-fill');

  if (!panel || panel.style.display === 'none') return;
  if (body !== null && bodyEl) bodyEl.textContent = body;

  if (meter && fill) {
    meter.style.display = 'block';
    fill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  }
}

export function hideShopFeedback() {
  const panel = document.getElementById('shop-feedback-panel');
  const meter = document.getElementById('shop-feedback-meter');
  const fill = document.getElementById('shop-feedback-fill');

  if (shopFeedbackTimer) clearTimeout(shopFeedbackTimer);
  shopFeedbackTimer = null;

  if (panel) {
    panel.style.display = 'none';
    panel.classList.remove('ready', 'warning', 'mystery');
  }
  if (meter) meter.style.display = 'none';
  if (fill) fill.style.width = '0%';
}


// ── HUD READABILITY STATUS PANEL ──
let lastCombatHudSignature = '';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTimer(seconds) {
  return `${Math.max(0, Math.ceil(seconds))}s`;
}

function setWarning(id, visible, text = '') {
  const el = document.getElementById(id);
  if (!el) return;

  el.style.display = visible ? 'block' : 'none';

  if (visible && text && el.textContent !== text) {
    el.textContent = text;
  }
}

function renderChipGroup(id, chips) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!chips.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = 'flex';
  el.innerHTML = chips.map((chip) => {
    return `<div class="hud-chip ${escapeHtml(chip.tone || '')}">
      <span>${escapeHtml(chip.label)}</span>
      <b>${escapeHtml(chip.value)}</b>
    </div>`;
  }).join('');
}

export function updateCombatStatusHUD(playerState, activeWeapon = null) {
  if (!playerState) return;

  const healthPct = playerState.maxHealth > 0 ? playerState.health / playerState.maxHealth : 1;
  const lowHealth = playerState.alive && healthPct > 0 && healthPct <= 0.32;
  const criticalHealth = playerState.alive && healthPct > 0 && healthPct <= 0.18;

  let ammoWarning = '';
  const weapon = activeWeapon;

  if (weapon && playerState.alive && !weapon.reloading) {
    const lowAmmoThreshold = Math.max(2, Math.ceil((weapon.maxAmmo || 0) * 0.22));

    if (weapon.ammo <= 0 && weapon.reserve <= 0) {
      ammoWarning = 'OUT OF AMMO';
    } else if (weapon.ammo <= 0 && weapon.reserve > 0) {
      ammoWarning = 'RELOAD';
    } else if (weapon.ammo <= lowAmmoThreshold && weapon.reserve > 0) {
      ammoWarning = 'LOW AMMO';
    }
  }

  const powerups = [];

  if ((playerState.instaKillTimer || 0) > 0) {
    powerups.push({ label: 'INSTA-KILL', value: formatTimer(playerState.instaKillTimer), tone: 'gold' });
  }

  if ((playerState.doublePointsTimer || 0) > 0) {
    powerups.push({ label: 'DOUBLE POINTS', value: formatTimer(playerState.doublePointsTimer), tone: 'yellow' });
  }

  const perks = [];

  if ((playerState.maxHealth || 100) >= 250) {
    perks.push({ label: 'JUGGERNOG', value: 'HP 250', tone: 'red' });
  }

  if ((playerState.reloadMult || 1) <= 0.55) {
    perks.push({ label: 'SPEED COLA', value: 'FAST RELOAD', tone: 'green' });
  }

  if (weapon?.isUpgraded) {
    perks.push({ label: 'PACK-A-PUNCH', value: 'ACTIVE', tone: 'purple' });
  }

  const signature = JSON.stringify({
    lowHealth,
    criticalHealth,
    ammoWarning,
    powerups,
    perks
  });

  if (signature === lastCombatHudSignature) return;
  lastCombatHudSignature = signature;

  setWarning('low-health-warning', lowHealth, criticalHealth ? 'CRITICAL HEALTH' : 'LOW HEALTH');
  setWarning('low-ammo-warning', Boolean(ammoWarning), ammoWarning);
  renderChipGroup('powerup-timers', powerups);
  renderChipGroup('perk-indicators', perks);
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
  if (!damageIndicatorsEnabled || indicatorPool.length === 0) return;

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

export function resetCombatStatusHUD() {
  lastCombatHudSignature = '';

  setInteractionPrompt(false);
  hideShopFeedback();
  setWarning('low-health-warning', false);
  setWarning('low-ammo-warning', false);
  renderChipGroup('powerup-timers', []);
  renderChipGroup('perk-indicators', []);

  uiTimers.hitT = 0;
  uiTimers.dmgFlashT = 0;
  uiTimers.hitVariant = 'body';
  lastAmmoValue = null;

  const hitMarker = document.getElementById('hit-marker');
  if (hitMarker) {
    hitMarker.style.opacity = '0';
    hitMarker.classList.remove('hit-body', 'hit-headshot', 'hit-kill');
  }

  const ammoWrap = document.getElementById('ammo-wrap');
  if (ammoWrap) ammoWrap.classList.remove('ammo-low', 'ammo-empty', 'ammo-no-reserve');

  const ammoCurrent = document.getElementById('ammo-current');
  if (ammoCurrent) ammoCurrent.classList.remove('ammo-shot-pop');

  const damageFlash = document.getElementById('damage-flash');
  if (damageFlash) damageFlash.style.opacity = '0';

  const reloadWrap = document.getElementById('reload-wrap');
  if (reloadWrap) reloadWrap.style.display = 'none';

  const reloadBar = document.getElementById('reload-bar');
  if (reloadBar) reloadBar.style.width = '0%';

  hideDamageIndicatorPool();

  const floating = document.getElementById('floating-texts-container');
  if (floating) floating.innerHTML = '';
}

// ── 2. BULLETPROOF RADAR UPDATE ──
export function updateMinimap(playerPos, camDir, enemies) {
  const now = performance.now();
  if (now - lastMinimapDrawAt < MINIMAP_DRAW_INTERVAL_MS) return;
  lastMinimapDrawAt = now;

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
      BRUTE: '#aa55ff',
      GOLIATH: '#dd00ff',
      EXPLODER: '#ffcc00',
      RANGED: '#00ffff'
    };

    ctx.fillStyle = enemyRadarColors[e.type] || '#ff2200';
    const blipRadius = e.type === "GOLIATH" ? 5 : (e.type === "BRUTE" ? 4 : 3);
    ctx.beginPath();
    ctx.arc(blipX, blipY, blipRadius, 0, Math.PI * 2);
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