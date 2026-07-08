// js/main.js
import { renderer, scene, camera, buildMap, composer, applyScreenShake, spawnPoints, playerSpawnPoints, currentMapMeta, cycleGraphicsQuality, getGraphicsQuality, getGraphicsQualityLabel, applyGraphicsQuality, autoTuneGraphicsFromFps } from './map.js';
import { player, updatePlayer, damagePlayer, EYE_H, setMouseSensitivityPercent, getMouseSensitivityPercent, setBaseFOV, getBaseFOV, getADSFOV } from './player.js';
import { initEnemies, updateEnemies, getActiveEnemies, killEnemy, currentWave, isSpecialRound, applyNetworkWaveState, configureMultiplayerEnemyAuthority } from './enemy.js';
import { updateHealthHUD, updateAmmoHUD, updateKillsHUD, updateUIEffects, updateScoreHUD, updateMinimap, setDamageIndicatorsEnabled, getDamageIndicatorsEnabled, resetCombatStatusHUD, showStatusToast, renderRunSummaryScreen } from './ui.js';
import { buildGun, updateGun, shoot, startReload, processReloadTick, cycleWeapon, checkWorldInteractions, getActiveWeapon, resetGunState, updateShops, adjustSniperScopeZoom, configureMultiplayerEconomy, prepareMultiplayerWorld, getLocalPurchaseState, validateMultiplayerInteraction, commitMultiplayerInteraction, applyLocalEconomyState, applyMultiplayerInteractionResult, buildMultiplayerWorldState, applyMultiplayerWorldState, applyMultiplayerProfile, endMultiplayerEconomy } from './weapons.js';
import { initAudio, setMasterVolume, getMasterVolumePercent, updateLowHealthHeartbeat, playUISound } from './audio.js';
import { updateParticles, clearAllDecals } from './particles.js';
import {
  resetMapGameplay,
  endMapGameplay,
  updateMapGameplay,
  consumeMapGameplayEvents
} from './map_gameplay.js';
import {
  resetAIDirectorRun,
  endAIDirectorRun,
  updateAIDirector
} from './ai_director.js';
import {
  bindAIMemoryControls,
  refreshAIMemoryControls
} from './ai_memory.js';
import {
  resetProgressionRun,
  finalizeProgressionRun,
  getProgressionSnapshot
} from './progression.js';
import { resetObjectivesRun, endObjectivesRun } from './objectives.js';
import { resetChallengesRun, endChallengesRun, getChallengesSnapshot } from './challenges.js';
import { resetRunSummary, finalizeRunSummary } from './run_summary.js';
import {
  CONTROL_ACTIONS,
  initControlsUI,
  getKeyboardAction,
  getMouseAction,
  getCanonicalCode,
  getBindingLabel,
  isKeybindingCaptureActive,
  pollGamepadInput,
  populateFrameKeys,
  getMobileLookSensitivityMultiplier,
  getMobileAutoSprintEnabled,
  triggerMobileHaptic
} from './controls.js';
import { initAccessibilityControls } from './accessibility.js';
import {
  initTutorialControls,
  resetTutorialRun,
  endTutorialRun,
  updateTutorial,
  consumeTutorialEvents,
  recordTutorialAction
} from './tutorial.js';
import { runReleaseValidation } from './release_validation.js';
import { getMapValidationSnapshot } from './map_validation.js';
import { initializeMultiplayerFoundation, beginMultiplayerRun, endMultiplayerRun, syncMultiplayerFrame, registerMultiplayerRunLauncher, registerMultiplayerRunEndHandler, notifyMultiplayerPlayerDeath, openMultiplayerLobby, isOnlineMultiplayerRun, initializeSharedMultiplayerEnemies, updateSharedMultiplayerWorld, isSharedMultiplayerWorldAuthority, initializeSharedMultiplayerEconomy, updateSharedMultiplayerEconomy, requestMultiplayerInteraction, awardMultiplayerCombat, refundMultiplayerPoints, isSharedMultiplayerEconomyAuthority, getLocalMultiplayerPlayerId, multiplayerSession } from './multiplayer/foundation.js';

const canvas = document.getElementById('c');
export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Public playable-demo build. Development cheats and AI debug hotkeys stay disabled.
export const DEV_MODE = false;

function purgePublicDebugSurfaces() {
  try {
    localStorage.removeItem('ka_ai_director_debug');
  } catch {
    // Ignore restricted/private storage failures.
  }

  ['dev-console', 'ai-director-debug'].forEach((id) => {
    document.getElementById(id)?.remove();
  });

  try {
    delete window.devConsole;
    delete window.KASetAIDirectorDebug;
  } catch {
    window.devConsole = undefined;
    window.KASetAIDirectorDebug = undefined;
  }
}

purgePublicDebugSurfaces();
initializeMultiplayerFoundation(player, {
  scene,
  worldAdapter: {
    initEnemies,
    updateEnemies,
    getActiveEnemies,
    killEnemy,
    getCurrentWave: () => currentWave,
    getSpecialRound: () => isSpecialRound,
    applyNetworkWaveState,
    configureMultiplayerEnemyAuthority,
    damagePlayer
  },
  economyAdapter: {
    prepareMultiplayerWorld,
    getLocalPurchaseState,
    validateMultiplayerInteraction,
    commitMultiplayerInteraction,
    applyLocalEconomyState,
    applyMultiplayerInteractionResult,
    buildMultiplayerWorldState,
    applyMultiplayerWorldState,
    applyMultiplayerProfile,
    endMultiplayerEconomy
  }
});
configureMultiplayerEconomy({
  isOnline: isOnlineMultiplayerRun,
  isAuthority: isSharedMultiplayerEconomyAuthority,
  getLocalPlayerId: getLocalMultiplayerPlayerId,
  requestInteraction: requestMultiplayerInteraction,
  awardCombat: awardMultiplayerCombat,
  refundPlayer: refundMultiplayerPoints
});
window.KHADIJA_MULTIPLAYER_BUILD = 'm3-shared-economy-r1';
console.info('[Multiplayer Build] m3-shared-economy-r1 · protocol 3');

function setNumericSelectValue(select, value, fallback = 1) {
  if (!select) return;

  const numericValue = Number(value);
  const match = Array.from(select.options).find((option) => (
    Number(option.value) === numericValue
  ));
  const fallbackMatch = Array.from(select.options).find((option) => (
    Number(option.value) === Number(fallback)
  ));

  select.value = match?.value
    || fallbackMatch?.value
    || select.options[0]?.value
    || '';
}

registerMultiplayerRunLauncher(({ mapId, difficulty }) => {
  const mapSelect = document.getElementById('map-select');
  const difficultySelect = document.getElementById('diff-select');

  if (mapSelect && mapId) mapSelect.value = mapId;
  setNumericSelectValue(difficultySelect, difficulty, 1);

  void beginRun({ deferPointerLock: true });
});

registerMultiplayerRunEndHandler((details) => {
  handleOnlineRunEnded(details);
});
document.body.classList.toggle('ka-mobile-device', isMobile);
renderer.info.autoReset = false;
let usePostProcessing = true;
const _minimapCamDir = new THREE.Vector3();

function setLockHintVisible(visible) {
  const lockHint = document.getElementById('lock-hint');
  if (lockHint) lockHint.style.display = visible ? 'block' : 'none';
}

function syncGraphicsQualityControls() {
  const currentValue = getGraphicsQuality();
  const currentLabel = getGraphicsQualityLabel().toUpperCase();

  const menuSelect = document.getElementById('graphics-quality-select');
  const pauseSelect = document.getElementById('pause-graphics-quality-select');

  if (menuSelect && menuSelect.value !== currentValue) {
    menuSelect.value = currentValue;
  }

  if (pauseSelect && pauseSelect.value !== currentValue) {
    pauseSelect.value = currentValue;
  }

  const menuCurrent = document.getElementById('graphics-quality-current');
  if (menuCurrent) {
    menuCurrent.textContent = currentLabel;
  }

  const pauseCurrent = document.getElementById('pause-graphics-quality-current');
  if (pauseCurrent) {
    pauseCurrent.textContent = currentLabel;
  }
}

function bindGraphicsQualitySelect(selectEl) {
  if (!selectEl) return;

  selectEl.addEventListener('change', () => {
    applyGraphicsQuality(selectEl.value, { repickAuto: selectEl.value === 'auto' });
    syncGraphicsQualityControls();
    updatePauseSummary();
    console.log(`Graphics quality changed from menu: ${getGraphicsQualityLabel()}`);
  });
}

function initGraphicsQualityControls() {
  bindGraphicsQualitySelect(document.getElementById('graphics-quality-select'));
  bindGraphicsQualitySelect(document.getElementById('pause-graphics-quality-select'));
  syncGraphicsQualityControls();
}

let performanceStatsEnabled = localStorage.getItem('ka_performance_stats') === 'on';

function setPerformanceStatsEnabled(enabled) {
  performanceStatsEnabled = enabled === true;

  try {
    localStorage.setItem('ka_performance_stats', performanceStatsEnabled ? 'on' : 'off');
  } catch {
    // Ignore storage failures in private browsing / restricted modes.
  }

  const panel = document.getElementById('performance-stats-panel');
  if (panel) {
    panel.style.display = performanceStatsEnabled ? 'block' : 'none';
  }

  return performanceStatsEnabled;
}

function syncCoreSettingsControls() {
  const volumePercent = getMasterVolumePercent();
  const damageValue = getDamageIndicatorsEnabled() ? 'on' : 'off';
  const perfValue = performanceStatsEnabled ? 'on' : 'off';
  const mouseSensitivity = getMouseSensitivityPercent();
  const baseFov = getBaseFOV();
  const adsFov = getADSFOV();

  [
    document.getElementById('master-volume-slider'),
    document.getElementById('pause-master-volume-slider')
  ].forEach((slider) => {
    if (slider && slider.value !== String(volumePercent)) {
      slider.value = String(volumePercent);
    }
  });

  [
    document.getElementById('master-volume-current'),
    document.getElementById('pause-master-volume-current')
  ].forEach((label) => {
    if (label) label.textContent = `${volumePercent}%`;
  });

  [
    document.getElementById('mouse-sensitivity-slider'),
    document.getElementById('pause-mouse-sensitivity-slider')
  ].forEach((slider) => {
    if (slider && slider.value !== String(mouseSensitivity)) {
      slider.value = String(mouseSensitivity);
    }
  });

  [
    document.getElementById('mouse-sensitivity-current'),
    document.getElementById('pause-mouse-sensitivity-current')
  ].forEach((label) => {
    if (label) label.textContent = `${mouseSensitivity}%`;
  });

  [
    document.getElementById('fov-slider'),
    document.getElementById('pause-fov-slider')
  ].forEach((slider) => {
    if (slider && slider.value !== String(baseFov)) {
      slider.value = String(baseFov);
    }
  });

  [
    document.getElementById('fov-current'),
    document.getElementById('pause-fov-current')
  ].forEach((label) => {
    if (label) label.textContent = `${baseFov}°`;
  });

  const adsLabel = document.getElementById('pause-ads-fov-current');
  if (adsLabel) adsLabel.textContent = `${adsFov}° ADS`;

  [
    document.getElementById('damage-indicators-select'),
    document.getElementById('pause-damage-indicators-select')
  ].forEach((select) => {
    if (select && select.value !== damageValue) {
      select.value = damageValue;
    }
  });

  [
    document.getElementById('performance-stats-select'),
    document.getElementById('pause-performance-stats-select')
  ].forEach((select) => {
    if (select && select.value !== perfValue) {
      select.value = perfValue;
    }
  });
}

function bindCoreSettingsControls() {
  const volumeSliders = [
    document.getElementById('master-volume-slider'),
    document.getElementById('pause-master-volume-slider')
  ];

  volumeSliders.forEach((slider) => {
    if (!slider) return;

    slider.addEventListener('input', () => {
      setMasterVolume(Number(slider.value));
      syncCoreSettingsControls();
    });
  });

  [
    document.getElementById('mouse-sensitivity-slider'),
    document.getElementById('pause-mouse-sensitivity-slider')
  ].forEach((slider) => {
    if (!slider) return;

    slider.addEventListener('input', () => {
      setMouseSensitivityPercent(Number(slider.value));
      syncCoreSettingsControls();
    });
  });

  [
    document.getElementById('fov-slider'),
    document.getElementById('pause-fov-slider')
  ].forEach((slider) => {
    if (!slider) return;

    slider.addEventListener('input', () => {
      setBaseFOV(Number(slider.value));
      syncCoreSettingsControls();
    });
  });

  [
    document.getElementById('damage-indicators-select'),
    document.getElementById('pause-damage-indicators-select')
  ].forEach((select) => {
    if (!select) return;

    select.addEventListener('change', () => {
      setDamageIndicatorsEnabled(select.value !== 'off');
      syncCoreSettingsControls();
    });
  });

  [
    document.getElementById('performance-stats-select'),
    document.getElementById('pause-performance-stats-select')
  ].forEach((select) => {
    if (!select) return;

    select.addEventListener('change', () => {
      setPerformanceStatsEnabled(select.value === 'on');
      syncCoreSettingsControls();
    });
  });

  setPerformanceStatsEnabled(performanceStatsEnabled);
  syncCoreSettingsControls();
}

function updatePerformanceStatsPanel(stats) {
  if (!performanceStatsEnabled) return;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('perf-fps', stats.fps);
  setText('perf-frame-ms', `${stats.frameMs} ms`);
  setText('perf-worst-ms', `${stats.worstFrameMs} ms`);
  setText('perf-enemies', stats.enemies);
  setText('perf-draw-calls', stats.drawCalls);
}

function updatePauseSummary() {
  const mapName = currentMapMeta?.name || 'Grid Bunker';

  const pauseMapName = document.getElementById('pause-map-name');
  if (pauseMapName) pauseMapName.textContent = mapName.toUpperCase();

  const pauseGraphicsLabel = document.getElementById('pause-graphics-label');
  if (pauseGraphicsLabel) pauseGraphicsLabel.textContent = getGraphicsQualityLabel().toUpperCase();

  const pauseFovLabel = document.getElementById('pause-fov-label');
  if (pauseFovLabel) pauseFovLabel.textContent = `${getBaseFOV()}° / ADS ${getADSFOV()}°`;

  const pauseWaveLabel = document.getElementById('pause-wave-label');
  if (pauseWaveLabel) pauseWaveLabel.textContent = String(currentWave);

  const pauseScoreLabel = document.getElementById('pause-score-label');
  if (pauseScoreLabel) pauseScoreLabel.textContent = String(player.score);

  const pauseKillsLabel = document.getElementById('pause-kills-label');
  if (pauseKillsLabel) pauseKillsLabel.textContent = String(player.kills);

  const pauseStatusLabel = document.getElementById('pause-status-label');
  if (pauseStatusLabel) pauseStatusLabel.textContent = player.alive ? 'ALIVE' : 'DOWNED';
}

function showPauseScreen() {
  setLockHintVisible(false);
  syncGraphicsQualityControls();
  syncCoreSettingsControls();
  updatePauseSummary();

  const pauseScreen = document.getElementById('pause-screen');
  if (pauseScreen) pauseScreen.style.display = 'flex';
}

function hidePauseScreen() {
  const pauseScreen = document.getElementById('pause-screen');
  if (pauseScreen) pauseScreen.style.display = 'none';
}

function updateDeathStats() {
  const finalKills = document.getElementById('final-kills');
  if (finalKills) finalKills.textContent = player.kills;

  const finalScore = document.getElementById('final-score');
  if (finalScore) finalScore.textContent = player.score;

  const finalWave = document.getElementById('final-wave');
  if (finalWave) finalWave.textContent = currentWave;

  const finalBestScore = document.getElementById('final-best-score');
  if (finalBestScore) finalBestScore.textContent = highScore;

  const finalBestWave = document.getElementById('final-best-wave');
  if (finalBestWave) finalBestWave.textContent = highWave;

  renderRunSummaryScreen();
}

function showDeathScreen() {
  setLockHintVisible(false);
  updateDeathStats();

  const deathScreen = document.getElementById('death-screen');
  if (deathScreen) deathScreen.style.display = 'flex';
}

function hideDeathScreen() {
  const deathScreen = document.getElementById('death-screen');
  if (deathScreen) deathScreen.style.display = 'none';
}

function isEditableInputTarget(target) {
  if (!(target instanceof Element)) return false;

  return target.matches(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
  );
}

window.addEventListener('keydown', (e) => {
  if (isEditableInputTarget(e.target)) return;

  if (e.code === 'F6') {
    e.preventDefault();

    cycleGraphicsQuality();
    syncGraphicsQualityControls();
    console.log(`Graphics quality switched to: ${getGraphicsQualityLabel()}`);
  }
});

initGraphicsQualityControls();
bindCoreSettingsControls();
bindAIMemoryControls();
initControlsUI();
initAccessibilityControls();
initTutorialControls();
runReleaseValidation({ phase: 'BOOT', isMobile, devMode: DEV_MODE });
console.log(`Khadija's Arena public demo loaded. Graphics quality: ${getGraphicsQualityLabel()} | Press F6 to cycle quality.`);

function renderGameFrame() {
  renderer.info.reset();

  if (usePostProcessing) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

// ════════════ INPUT STATE ════════════
const keys = {};
const frameKeys = {};
let mdx = 0, mdy = 0, locked = false, pendingShot = false, mouseADS = false;
let mobileSprintIntent = false;
let pauseTransitionAt = -Infinity;
let coOpMenuOpen = false;
let onlineDeathReportPending = false;
function isOnlineCoOpRun() {
  return multiplayerSession?.run?.active === true
    && (multiplayerSession.mode === 'host'
      || multiplayerSession.mode === 'client');
}

function setActionKeyState(action, pressed) {
  const canonical = getCanonicalCode(action);
  if (canonical) keys[canonical] = pressed === true;
}

function pauseGameplay(source = 'input') {
  if (gs !== 'playing' || !player.alive) return false;
  if (isOnlineCoOpRun() && coOpMenuOpen) return true;

  pauseTransitionAt = performance.now();
  clearInputState();
  showPauseScreen();

  if (isOnlineCoOpRun()) {
    coOpMenuOpen = true;
    if (!isMobile && document.pointerLockElement) {
      document.exitPointerLock();
    }
    console.log(`Co-op menu opened from ${source}; match remains live.`);
    return true;
  }

  gs = 'paused';
  if (!isMobile && document.pointerLockElement) {
    document.exitPointerLock();
  }
  console.log(`Game paused from ${source}.`);
  return true;
} function resumeGameplay(source = 'input') {
  if (!player.alive) return false;

  if (isOnlineCoOpRun() && coOpMenuOpen) {
    if (performance.now() - pauseTransitionAt < 180) return false;

    pauseTransitionAt = performance.now();
    coOpMenuOpen = false;
    clearInputState();
    setLockHintVisible(false);
    hidePauseScreen();

    if (!isMobile) {
      try {
        const lockResult = canvas.requestPointerLock();
        lockResult?.catch?.(() => setLockHintVisible(true));
      } catch {
        setLockHintVisible(true);
      }
    }

    console.log(`Co-op menu closed from ${source}; match stayed live.`);
    return true;
  }

  if (gs !== 'paused') return false;
  if (performance.now() - pauseTransitionAt < 180) return false;

  pauseTransitionAt = performance.now();
  resetFrameStats();
  clearInputState();
  setLockHintVisible(false);
  hidePauseScreen();
  gs = 'playing';

  if (!isMobile) {
    try {
      const lockResult = canvas.requestPointerLock();
      lockResult?.catch?.(() => setLockHintVisible(true));
    } catch {
      setLockHintVisible(true);
    }
  }

  console.log(`Game resumed from ${source}.`);
  return true;
} function togglePauseGameplay(source = 'input') {
  if (coOpMenuOpen || gs === 'paused') {
    return resumeGameplay(source);
  }
  return pauseGameplay(source);
} function triggerGameplayAction(action) {
  if (!action) return;

  if (action === CONTROL_ACTIONS.PAUSE) {
    togglePauseGameplay('control');
    return;
  }

  if (coOpMenuOpen || gs !== 'playing' || !player.alive) return;

  if (action === CONTROL_ACTIONS.FIRE) {
    pendingShot = true;
    recordTutorialAction('FIRE');
  } else if (action === CONTROL_ACTIONS.RELOAD) {
    startReload();
    recordTutorialAction('RELOAD');
  } else if (action === CONTROL_ACTIONS.SWITCH_WEAPON) {
    cycleWeapon();
    recordTutorialAction('SWITCH');
  } else if (action === CONTROL_ACTIONS.INTERACT) {
    checkWorldInteractions(true);
    recordTutorialAction('INTERACT');
  }
} window.addEventListener('keydown', e => {
  if (isEditableInputTarget(e.target) || isKeybindingCaptureActive()) return;

  const action = getKeyboardAction(e.code);

  if (coOpMenuOpen && action !== CONTROL_ACTIONS.PAUSE) {
    if (action) e.preventDefault();
    return;
  }

  if (action) {
    setActionKeyState(action, true);
    if (!e.repeat) triggerGameplayAction(action);
  }

  if (
    action === CONTROL_ACTIONS.JUMP
    || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
  ) {
    e.preventDefault();
  }
}); window.addEventListener('keyup', e => {
  if (isEditableInputTarget(e.target)) return;

  const action = getKeyboardAction(e.code);
  if (action) setActionKeyState(action, false);
});

window.addEventListener('mousemove', e => { 
  if (locked) { mdx += e.movementX; mdy += e.movementY; } 
});

window.addEventListener('mousedown', e => {
  if (isKeybindingCaptureActive()) return;
  if (gs !== 'playing' || (!locked && !isMobile) || !player.alive) return;

  const activeW = getActiveWeapon();
  if (activeW && activeW.reloading) return;

  const action = getMouseAction(e.button);
  if (!action) return;

  setActionKeyState(action, true);
  triggerGameplayAction(action);
  if (action === CONTROL_ACTIONS.AIM) mouseADS = true;
});

window.addEventListener('mouseup', e => {
  if (!locked && !isMobile) return;

  const action = getMouseAction(e.button);
  if (!action) return;

  setActionKeyState(action, false);
  if (action === CONTROL_ACTIONS.AIM) mouseADS = false;
});

window.addEventListener('wheel', e => {
  if (coOpMenuOpen || gs !== 'playing' || !player.alive) return;

  if (adjustSniperScopeZoom(e.deltaY)) {
    e.preventDefault();
  }
}, { passive: false });

window.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('pointerlockchange', () => {
  if (isMobile) return;

  locked = document.pointerLockElement === canvas;

  if (locked) {
    setLockHintVisible(false);
    return;
  }

  mouseADS = false;
  player.isADS = false;
  player.isSprinting = false;
  keys['MousedownLeft'] = false;

  if (gs === 'playing' && player.alive) {
    pauseGameplay('pointer-lock');
    return;
  }

  // Only show the click hint during real gameplay, not over pause/menu/death screens.
  setLockHintVisible(gs === 'playing' && player.alive);
});

// ── PAUSE MENU BUTTON LISTENERS ──
document.getElementById('resume-btn').addEventListener('click', () => {
  resumeGameplay('pause-menu');
});

document.getElementById('quit-btn').addEventListener('click', () => {
  returnToMenu('pause');
});

canvas.addEventListener('click', () => { 
  if (gs === 'playing' && !locked && !isMobile) canvas.requestPointerLock(); 
});

// ── MOBILE IN-GAME PAUSE BUTTON LISTENER ──
document.getElementById('btn-mobile-pause').addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (gs === 'playing' && player.alive) { togglePauseGameplay('mobile'); }
}, { passive: false });  

// ════════════ GAME LOOP ════════════

export const ASSETS = {
  // C9.6: active weapons are procedural ES modules now. Keep only enemy/model assets here.
  enemies: { zombie: null }
};

const loadingManager = new THREE.LoadingManager();
const gltfLoader = new THREE.GLTFLoader(loadingManager);

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  const pct = Math.floor((itemsLoaded / itemsTotal) * 100);
  document.getElementById('loading-bar-fill').style.width = pct + '%';
  document.getElementById('loading-pct').textContent = pct + '%';
};

function finishLoadingUI() {
  const loadingFill = document.getElementById('loading-bar-fill');
  const loadingPct = document.getElementById('loading-pct');
  const loadingContainer = document.getElementById('loading-container');
  const startBtn = document.getElementById('start-btn');

  if (loadingFill) loadingFill.style.width = '100%';
  if (loadingPct) loadingPct.textContent = '100%';
  if (loadingContainer) loadingContainer.style.display = 'none';
  if (startBtn) startBtn.style.display = 'inline-block';

  console.log("Arena assets ready.");
}

loadingManager.onLoad = finishLoadingUI;

loadingManager.onError = (url) => {
  console.error("Error loading asset from path: " + url);
};

// C9.6: weapon GLB preloads removed. Pistol, SMG, rifle, and shotgun are procedural modules.
// With no startup weapon GLBs queued, THREE.LoadingManager has no itemEnd event to trigger onLoad.
// Finish the loading UI manually when no GLB assets are queued.
queueMicrotask(() => {
  if ((loadingManager.itemsTotal || 0) === 0) {
    finishLoadingUI();
  }
});
let gs = 'menu', prev = 0;
let smoothFps = 60;
let worstFrameMs = 0;

function resetFrameStats() {
  smoothFps = 60;
  worstFrameMs = 0;
  prev = 0;
}
let highScore = localStorage.getItem('fps_hi_score') || 0;
let highWave = localStorage.getItem('fps_hi_wave') || 1;
export let difficultyMultiplier = 1.0;

let deathScreenTimer = null;
let gameLoopStarted = false;
let runTransitionInProgress = false;

function ensureGameLoopStarted() {
  if (gameLoopStarted) return;
  gameLoopStarted = true;
  requestAnimationFrame(tick);
}

function clearDeathScreenTimer() {
  if (deathScreenTimer) {
    clearTimeout(deathScreenTimer);
    deathScreenTimer = null;
  }
}

function scheduleDeathScreen() {
  clearDeathScreenTimer();
  deathScreenTimer = setTimeout(() => {
    deathScreenTimer = null;
    if (gs === 'dead' && !player.alive) {
      showDeathScreen();
    }
  }, 700);
}

function updateMenuBestStats() {
  const hiScoreEl = document.getElementById('hi-score');
  if (hiScoreEl) hiScoreEl.textContent = highScore;

  const hiWaveEl = document.getElementById('hi-wave');
  if (hiWaveEl) hiWaveEl.textContent = highWave;

  const progression = getProgressionSnapshot();
  const challenges = getChallengesSnapshot();
  const profileLevel = document.getElementById('profile-level');
  if (profileLevel) profileLevel.textContent = progression.profile.level;
  const achievementCount = document.getElementById('profile-achievements');
  if (achievementCount) achievementCount.textContent = challenges.totalUnlocked;
}

function finalizeCurrentRun(reason = 'ENDED') {
  const payload = {
    score: Number(player.score || 0),
    wave: Number(currentWave || 1),
    reason: String(reason || 'ENDED').toUpperCase()
  };
  finalizeRunSummary(payload);
  finalizeProgressionRun(payload);
  endObjectivesRun();
  endChallengesRun();
}

function saveRunRecords() {
  const score = Number(player.score || 0);
  const wave = Number(currentWave || 1);

  if (score > Number(highScore || 0)) {
    highScore = score;
    localStorage.setItem('fps_hi_score', highScore);
  }

  if (wave > Number(highWave || 1)) {
    highWave = wave;
    localStorage.setItem('fps_hi_wave', highWave);
  }

  updateMenuBestStats();
}

function clearInputState() {
  Object.keys(keys).forEach((key) => {
    keys[key] = false;
  });
  Object.keys(frameKeys).forEach((key) => {
    frameKeys[key] = false;
  });

  mdx = 0;
  mdy = 0;
  pendingShot = false;
  mouseADS = false;
  mobileSprintIntent = false;
  player.isADS = false;
  player.isSprinting = false;
}

function removeActiveWeaponMesh() {
  const activeW = getActiveWeapon();
  if (activeW?.meshGroup?.parent) {
    camera.remove(activeW.meshGroup);
  }
}

function resetPlayerRunState() {
  clearInputState();

  player.vel.set(0, 0, 0);
  player.yaw = Math.random() * Math.PI * 2;
  player.pitch = 0;
  player.onGround = false;

  player.health = 100;
  player.maxHealth = 100;
  player.reloadMult = 1.0;
  player.baseSpeed = 9.5;
  player.sprintSpeed = 15.0;
  player.adsSpeed = 4.5;

  player.kills = 0;
  player.score = 0;
  player.instaKillTimer = 0;
  player.doublePointsTimer = 0;

  player.alive = true;
}

function placePlayerAtRandomSpawn() {
  const playerStartPool = playerSpawnPoints.length > 0 ? playerSpawnPoints : spawnPoints;

  if (playerStartPool && playerStartPool.length > 0) {
    const sp = playerStartPool[Math.floor(Math.random() * playerStartPool.length)];
    player.pos.set(sp.x, EYE_H, sp.z);
  } else {
    player.pos.set(0, EYE_H, 15);
  }

  camera.position.copy(player.pos);
}

function syncHudFromPlayer() {
  const active = getActiveWeapon();

  updateHealthHUD(player.health, player.maxHealth);
  if (active) updateAmmoHUD(active.ammo, active.reserve);
  updateKillsHUD(player.kills);
  updateScoreHUD(player.score);
}

function setGameChromeVisible(isPlaying) {
  const menu = document.getElementById('menu');
  const hud = document.getElementById('hud');
  const mobileUI = document.getElementById('mobile-ui');

  if (menu) menu.style.display = isPlaying ? 'none' : 'flex';
  if (hud) hud.style.display = isPlaying ? 'block' : 'none';

  if (mobileUI) {
    mobileUI.style.display = isPlaying && isMobile ? 'block' : 'none';
  }
}

function showMenuScreen(name = 'home') {
  const screenNames = ['home', 'map', 'difficulty', 'settings'];
  const screens = Array.from(document.querySelectorAll('[data-menu-screen]'));
  const steps = Array.from(document.querySelectorAll('[data-step-dot]'));
  const activeIndex = Math.max(0, screenNames.indexOf(name));

  screens.forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.menuScreen === name);
  });

  steps.forEach((step, index) => {
    step.classList.toggle('active', step.dataset.stepDot === name);
    step.classList.toggle('done', index < activeIndex);
  });
}

async function enterGameplayPresentation({ requestPointerLock = true } = {}) {
  if (isMobile) {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }

      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (err) {
      console.warn("Fullscreen or orientation lock failed:", err);
    }
  } else if (requestPointerLock) {
    try {
      const lockResult = canvas.requestPointerLock();
      if (lockResult && typeof lockResult.then === 'function') {
        await lockResult;
      }
    } catch (error) {
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        console.info('[Input] Pointer lock is waiting for a direct player click.');
      } else {
        console.warn('[Input] Pointer lock request failed.', error);
      }
      setLockHintVisible(true);
    }
  } else {
    setLockHintVisible(true);
  }
}

async function beginRun({ fromRespawn = false, deferPointerLock = false } = {}) {
  if (runTransitionInProgress) return;

  runTransitionInProgress = true;

  try {
    clearDeathScreenTimer();
    onlineDeathReportPending = false;
    coOpMenuOpen = false;
    document.activeElement?.blur?.();
    clearInputState();
    resetCombatStatusHUD();
    hidePauseScreen();
    hideDeathScreen();
    setLockHintVisible(false);
    resetFrameStats();

    setGameChromeVisible(true);
    resetPlayerRunState();

    const chosenMap = document.getElementById('map-select')?.value || "grid_bunker";
    endMapGameplay();
    buildMap(chosenMap);

    difficultyMultiplier = parseFloat(document.getElementById('diff-select')?.value) || 1.0;

    beginMultiplayerRun({
      mapId: chosenMap,
      difficulty: difficultyMultiplier,
      fromRespawn
    });

    resetAIDirectorRun({
      mapId: chosenMap,
      difficulty: difficultyMultiplier
    });
    resetProgressionRun({ mapId: chosenMap, difficulty: difficultyMultiplier });
    resetObjectivesRun({ mapId: chosenMap });
    resetMapGameplay({ mapId: chosenMap, scene });
    resetChallengesRun();
    resetRunSummary({ mapId: chosenMap, difficulty: difficultyMultiplier });
    runReleaseValidation({ phase: 'RUN_START', mapId: chosenMap, isMobile, devMode: DEV_MODE, mapValidation: getMapValidationSnapshot() });

    placePlayerAtRandomSpawn();
    resetTutorialRun({ mapId: chosenMap, isMobile, player });

    scene.add(camera);
    initAudio();

    buildGun();
    resetGunState();
    initializeSharedMultiplayerEnemies();
    initializeSharedMultiplayerEconomy();
    clearAllDecals();

    syncHudFromPlayer();

    gs = 'playing';
    showStatusToast(`SURVIVE · ${getBindingLabel(CONTROL_ACTIONS.INTERACT)} INTERACT · ${getBindingLabel(CONTROL_ACTIONS.RELOAD)} RELOAD · ${getBindingLabel(CONTROL_ACTIONS.SWITCH_WEAPON)} SWITCH`, '#00d4ff', 3200);
    await enterGameplayPresentation({ requestPointerLock: !deferPointerLock });
    ensureGameLoopStarted();

    if (fromRespawn) {
      console.log("Arena restarted.");
    }
  } finally {
    runTransitionInProgress = false;
  }
}

function handleOnlineRunEnded(details = {}) {
  onlineDeathReportPending = false;
  coOpMenuOpen = false;

  finalizeCurrentRun(`CO-OP ${details.reason || 'ENDED'}`);
  saveRunRecords();
  endAIDirectorRun();
  endMapGameplay();
  endTutorialRun();
  refreshAIMemoryControls();
  clearDeathScreenTimer();
  clearInputState();
  removeActiveWeaponMesh();
  coOpMenuOpen = false;
  onlineDeathReportPending = false;

  gs = 'menu';
  player.alive = false;

  if (!isMobile && document.pointerLockElement) {
    document.exitPointerLock();
  }

  resetCombatStatusHUD();
  hidePauseScreen();
  hideDeathScreen();
  setLockHintVisible(false);
  setGameChromeVisible(false);
  showMenuScreen('home');

  queueMicrotask(() => openMultiplayerLobby());
  console.log(
    `Co-op run ended: ${details.reason || 'ended'}. Returned to room lobby.`
  );
}

function requestOnlineRunEnd(reason = 'ended') {
  if (onlineDeathReportPending) return true;

  onlineDeathReportPending = true;
  clearInputState();

  const sent = notifyMultiplayerPlayerDeath(reason);
  if (!sent) {
    endMultiplayerRun({
      reason: 'connection-lost',
      player,
      notifyServer: false
    });
    handleOnlineRunEnded({ reason: 'connection-lost' });
  }

  return sent;
}

function returnToMenu(source = 'pause') {
  if (isOnlineMultiplayerRun()) {
    requestOnlineRunEnd(source);
    return;
  }

  endMultiplayerRun({ reason: source, player });
  finalizeCurrentRun(source);
  saveRunRecords();
  endAIDirectorRun();
  endMapGameplay();
  endTutorialRun();
  refreshAIMemoryControls();
  clearDeathScreenTimer();
  clearInputState();
  removeActiveWeaponMesh();
  coOpMenuOpen = false;
  onlineDeathReportPending = false;

  gs = 'menu';
  player.alive = false;

  if (!isMobile && document.pointerLockElement) {
    document.exitPointerLock();
  }

  resetCombatStatusHUD();
  hidePauseScreen();
  hideDeathScreen();
  setLockHintVisible(false);
  setGameChromeVisible(false);
  showMenuScreen('home');

  console.log(`Returned to menu from ${source}.`);
}


// ── MAIN MENU SIZES SLIDER LOGIC ──
const sizeSlider = document.getElementById('btn-size-slider');
const savedSize = localStorage.getItem('mobile_btn_size') || '52';
if (sizeSlider) {
  sizeSlider.value = savedSize;
  document.documentElement.style.setProperty('--mobile-btn-size', savedSize + 'px');
  sizeSlider.addEventListener('input', (e) => {
    const newSize = e.target.value;
    document.documentElement.style.setProperty('--mobile-btn-size', newSize + 'px');
    localStorage.setItem('mobile_btn_size', newSize);
    ['joy', 'switch', 'interact', 'reload', 'jump', 'ads', 'shoot'].forEach(key => {
      document.documentElement.style.removeProperty(`--sz-${key}`);
    });
  });
}

updateMenuBestStats();

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

smoothFps = smoothFps * 0.9 + (rawDt > 0 ? 1 / rawDt : 60) * 0.1;

const rawFrameMs = rawDt * 1000;

if (gs === 'playing') {
  if (autoTuneGraphicsFromFps(smoothFps, dt)) {
    syncGraphicsQualityControls();
  }

  if (rawFrameMs > worstFrameMs) {
    worstFrameMs = rawFrameMs;
  }

}

const gamepadInput = pollGamepadInput();

if (gs !== 'playing') {
  if (gs === 'paused' && gamepadInput.pausePressed) {
    resumeGameplay('gamepad');
  }
  renderGameFrame();
  return;
}

if (gamepadInput.pausePressed) { togglePauseGameplay('gamepad'); renderGameFrame(); return; }

populateFrameKeys(keys, gamepadInput, frameKeys); if (coOpMenuOpen) { Object.keys(frameKeys).forEach((key) => { frameKeys[key] = false; }); pendingShot = false; }
player.isADS = mouseADS || Boolean(frameKeys.MousedownRight) || gamepadInput.aimHeld;

// Mobile auto-sprint replaces another large on-screen button. It activates
// only when the joystick is pushed strongly forward and immediately releases
// while aiming, moving backward, or returning the stick toward center.
if (
  isMobile &&
  getMobileAutoSprintEnabled() &&
  mobileSprintIntent &&
  !player.isADS
) {
  frameKeys.ShiftLeft = true;
}
player.isSprinting = Boolean(frameKeys.ShiftLeft);

if (!coOpMenuOpen && gamepadInput.reloadPressed) triggerGameplayAction(CONTROL_ACTIONS.RELOAD);
if (!coOpMenuOpen && gamepadInput.interactPressed) triggerGameplayAction(CONTROL_ACTIONS.INTERACT);
if (!coOpMenuOpen && gamepadInput.switchPressed) triggerGameplayAction(CONTROL_ACTIONS.SWITCH_WEAPON);
if (!coOpMenuOpen && gamepadInput.firePressed) {
  pendingShot = true;
  recordTutorialAction('FIRE');
}

mdx += gamepadInput.lookX * 1050 * dt;
mdy += gamepadInput.lookY * 1050 * dt;

const frameStart = performance.now();
let mark = frameStart;

updatePlayer(dt, frameKeys, mdx, mdy);
syncMultiplayerFrame(player, frameKeys, {
    dt,
    now: performance.now(),
    lookDeltaX: mdx,
    lookDeltaY: mdy
  });
updateLowHealthHeartbeat(player, dt);

if (isSharedMultiplayerWorldAuthority()) { updateAIDirector(dt, {
  player,
  activeWeapon: getActiveWeapon(),
  enemies: getActiveEnemies(),
  wave: currentWave
}); }

mdx = 0; mdy = 0;
const playerMs = performance.now() - mark;
mark = performance.now();

if (isSharedMultiplayerWorldAuthority()) { updateMapGameplay(dt, {
  player,
  enemies: getActiveEnemies(),
  damagePlayer,
  killEnemy
}); }

for (const event of consumeMapGameplayEvents()) {
  showStatusToast(event.text, event.color || '#ffaa00', event.duration || 1400);
  playUISound('warning', event.type === 'VENT_ACTIVE' ? 0.20 : 0.14, true, {
    cooldownKey: `map_gameplay_${event.type}`,
    cooldownMs: 800,
    pitchMin: event.type === 'VENT_ACTIVE' ? 0.70 : 0.88,
    pitchMax: event.type === 'VENT_ACTIVE' ? 0.82 : 1.02
  });
}

updateTutorial(dt, {
  player,
  wave: currentWave,
  enemies: getActiveEnemies()
});

for (const event of consumeTutorialEvents()) {
  showStatusToast(event.text, event.color || '#00d4ff', event.duration || 1900);
  playUISound('warning', 0.12, true, {
    cooldownKey: `tutorial_${event.type}`,
    cooldownMs: 500,
    pitchMin: 0.96,
    pitchMax: 1.08
  });
}

updateSharedMultiplayerWorld(dt, performance.now());
updateSharedMultiplayerEconomy(performance.now());
const enemiesMs = performance.now() - mark;
mark = performance.now();

const isMoving = (frameKeys['KeyW'] || frameKeys['KeyS'] || frameKeys['KeyA'] || frameKeys['KeyD']) && player.onGround;
updateGun(dt, frameKeys, isMoving);
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
    if (isOnlineMultiplayerRun()) {
      if (!onlineDeathReportPending) {
        requestOnlineRunEnd('player-death');
        showStatusToast(
          'OPERATIVE DOWN · RETURNING TEAM TO CO-OP LOBBY',
          '#ff5a36',
          1800
        );
      }
    } else {
      endMultiplayerRun({ reason: 'death', player });
      endAIDirectorRun();
      finalizeCurrentRun('DEATH');
      endMapGameplay();
      endTutorialRun();
      refreshAIMemoryControls();
      gs = 'dead';
      clearInputState();
      saveRunRecords();
      resetCombatStatusHUD();
      updateDeathStats();
      scheduleDeathScreen();
    }
  }
  
mark = performance.now();

_minimapCamDir.set(0, 0, -1);
camera.getWorldDirection(_minimapCamDir);
updateMinimap(player.pos, _minimapCamDir, getActiveEnemies());
applyScreenShake(dt); 

const minimapMs = performance.now() - mark;

const renderStart = performance.now();

renderGameFrame();

const renderMs = performance.now() - renderStart;
const frameMs = performance.now() - frameStart;


updatePerformanceStatsPanel({
  fps: Math.round(smoothFps),
  frameMs: frameMs.toFixed(2),
  worstFrameMs: worstFrameMs.toFixed(2),
  enemies: getActiveEnemies().length,
  drawCalls: renderer.info.render.calls
});
}

// ════════════ INIT / RESPAWN ════════════

document.getElementById('start-btn').addEventListener('click', () => {
  beginRun();
});

document.getElementById('respawn-btn').addEventListener('click', () => {
  if (
    multiplayerSession.mode === 'host'
    || multiplayerSession.mode === 'client'
  ) {
    hideDeathScreen();
    openMultiplayerLobby();
    return;
  }

  beginRun({ fromRespawn: true });
});

document.getElementById('death-quit-btn').addEventListener('click', () => {
  returnToMenu('death');
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
        mobileSprintIntent = false;
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

    const forwardStrength = Math.max(0, -dy / maxD);
    const stickStrength = Math.min(1, Math.hypot(dx, dy) / maxD);
    mobileSprintIntent = (
      keys['KeyW'] &&
      !keys['KeyS'] &&
      forwardStrength >= 0.68 &&
      stickStrength >= 0.72
    );
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

        const touchSensitivity = 0.007 * getMobileLookSensitivityMultiplier();
        player.yaw -= dx * touchSensitivity; 
        player.pitch -= dy * touchSensitivity;
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

  function bindTouchBtn(id, action, isMouse = false) {
    const el = document.getElementById(id);
    if (!el) return;

    const release = (e) => {
      if (isCustomizingLayout) return;
      e.preventDefault();
      el.classList.remove('is-held');

      if (isMouse) setActionKeyState(CONTROL_ACTIONS.FIRE, false);
      else setActionKeyState(action, false);
    };

    el.addEventListener('touchstart', (e) => {
      if (isCustomizingLayout) return;
      e.preventDefault();
      el.classList.add('is-held');
      triggerMobileHaptic(isMouse ? 9 : 12);

      if (isMouse) {
        setActionKeyState(CONTROL_ACTIONS.FIRE, true);
        pendingShot = true;
        recordTutorialAction('FIRE');
      } else {
        setActionKeyState(action, true);
        triggerGameplayAction(action);
      }
    }, { passive: false });

    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
  }

  bindTouchBtn('btn-switch', CONTROL_ACTIONS.SWITCH_WEAPON);
  bindTouchBtn('btn-jump', CONTROL_ACTIONS.JUMP);
  bindTouchBtn('btn-reload', CONTROL_ACTIONS.RELOAD);
  bindTouchBtn('btn-interact', CONTROL_ACTIONS.INTERACT);
  bindTouchBtn('btn-ads', CONTROL_ACTIONS.AIM);
  bindTouchBtn('btn-shoot', null, true);

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