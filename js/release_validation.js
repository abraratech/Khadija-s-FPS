// js/release_validation.js
// C13 — Browser-side release readiness checks and diagnostics.

const REQUIRED_DOM_IDS = Object.freeze([
  'c', 'menu', 'hud', 'start-btn', 'pause-screen', 'death-screen',
  'health-wrap', 'ammo-wrap', 'crosshair', 'minimap', 'interaction-prompt',
  'graphics-quality-select', 'master-volume-slider', 'mouse-sensitivity-slider',
  'fov-slider', 'map-select', 'diff-select', 'btn-ads'
]);

const state = {
  checkedAt: null,
  phase: 'BOOT',
  valid: false,
  errors: [],
  warnings: [],
  capabilities: {},
  duplicateIds: [],
  missingDomIds: [],
  mapId: null,
  mapValidation: null,
  build: 'C13.3 PUBLIC PLAYABLE DEMO',
  baselineCommit: '2cc8e4bab6ed3a7a4940b85fd84bec34dfe3667a',
  devMode: false,
  debugSurfaces: []
};

function testLocalStorage() {
  const key = '__ka_release_validation__';
  try {
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function getDuplicateIds() {
  const counts = new Map();
  document.querySelectorAll('[id]').forEach((el) => {
    counts.set(el.id, (counts.get(el.id) || 0) + 1);
  });
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}

function updateReleaseStatusUI() {
  const el = document.getElementById('release-validation-status');
  if (!el) return;

  if (state.valid && state.warnings.length === 0) {
    el.textContent = 'READY · ALL CORE CHECKS PASSED';
    el.dataset.state = 'ready';
  } else if (state.valid) {
    el.textContent = `READY WITH ${state.warnings.length} WARNING${state.warnings.length === 1 ? '' : 'S'}`;
    el.dataset.state = 'warning';
  } else {
    el.textContent = `BLOCKED · ${state.errors.length} ERROR${state.errors.length === 1 ? '' : 'S'}`;
    el.dataset.state = 'error';
  }
}

export function runReleaseValidation({
  phase = 'BOOT',
  mapId = null,
  isMobile = false,
  devMode = false,
  mapValidation = null
} = {}) {
  state.phase = String(phase || 'BOOT').toUpperCase();
  state.mapId = mapId ? String(mapId) : state.mapId;
  state.mapValidation = mapValidation ? {
    valid: mapValidation.valid === true,
    warnings: [...(mapValidation.warnings || [])],
    errors: [...(mapValidation.errors || [])],
    coverage: Number(mapValidation.coverage) || 0,
    reachableSpawnCount: Number(mapValidation.reachableSpawnCount) || 0
  } : state.mapValidation;
  state.checkedAt = new Date().toISOString();
  state.devMode = devMode === true;
  state.errors = [];
  state.warnings = [];
  state.missingDomIds = REQUIRED_DOM_IDS.filter((id) => !document.getElementById(id));
  state.duplicateIds = getDuplicateIds();
  state.debugSurfaces = [];

  const loadedDevScript = [...document.scripts].some((script) =>
    /(?:^|\/)dev_console\.js(?:$|[?#])/i.test(script.src || '')
  );
  if (loadedDevScript) state.debugSurfaces.push('dev_console.js script');
  if (document.getElementById('dev-console')) state.debugSurfaces.push('#dev-console');
  if (document.getElementById('ai-director-debug')) state.debugSurfaces.push('#ai-director-debug');
  if (document.getElementById('mp-recovery-diagnostics')) state.debugSurfaces.push('#mp-recovery-diagnostics');
  if (document.getElementById('mp-recovery-certification')) state.debugSurfaces.push('#mp-recovery-certification');
  if (typeof window.devConsole !== 'undefined') state.debugSurfaces.push('window.devConsole');
  try {
    if (localStorage.getItem('khadija:mp-debug') === '1') {
      state.debugSurfaces.push('khadija:mp-debug storage');
    }
  } catch {
    // Storage availability is checked separately below.
  }
  try {
    const query = new URLSearchParams(location.search);
    if (query.get('mpDebug') === '1') state.debugSurfaces.push('mpDebug query');
    if (query.get('mpFaults') === '1') state.debugSurfaces.push('mpFaults query');
  } catch {
    // Query inspection is best effort.
  }
  if (typeof window.KASetAIDirectorDebug === 'function') state.debugSurfaces.push('window.KASetAIDirectorDebug');

  try {
    if (localStorage.getItem('ka_ai_director_debug') === 'on') {
      state.debugSurfaces.push('ka_ai_director_debug storage');
    }
  } catch {
    // Storage availability is checked separately below.
  }

  const capabilities = {
    webgl: Boolean(window.WebGLRenderingContext || window.WebGL2RenderingContext),
    esModules: 'noModule' in document.createElement('script'),
    localStorage: testLocalStorage(),
    pointerLock: 'pointerLockElement' in document,
    fullscreen: Boolean(document.documentElement.requestFullscreen),
    gamepad: typeof navigator.getGamepads === 'function',
    vibration: typeof navigator.vibrate === 'function',
    secureContext: window.isSecureContext === true,
    mobile: isMobile === true
  };
  state.capabilities = capabilities;

  if (state.missingDomIds.length > 0) {
    state.errors.push(`Missing DOM IDs: ${state.missingDomIds.join(', ')}`);
  }
  if (state.duplicateIds.length > 0) {
    state.errors.push(`Duplicate DOM IDs: ${state.duplicateIds.join(', ')}`);
  }
  if (state.devMode) state.errors.push('Development mode must be disabled for the public build.');
  if (state.debugSurfaces.length > 0) {
    state.errors.push(`Developer diagnostics exposed: ${state.debugSurfaces.join(', ')}`);
  }
  if (!capabilities.webgl) state.errors.push('WebGL is not available.');
  if (!capabilities.esModules) state.errors.push('ES modules are not supported.');
  if (state.mapValidation && state.phase === 'RUN_START') {
    if (!state.mapValidation.valid) {
      state.errors.push(`Map validation failed: ${state.mapValidation.errors.join('; ') || 'unknown map error'}`);
    }
    if (state.mapValidation.warnings.length > 0) {
      state.warnings.push(...state.mapValidation.warnings.map((warning) => `Map: ${warning}`));
    }
  }
  if (!capabilities.localStorage) state.warnings.push('Persistent settings and progression may not save.');
  if (!capabilities.gamepad) state.warnings.push('Gamepad API is unavailable in this browser.');
  if (!isMobile && !capabilities.pointerLock) state.warnings.push('Pointer Lock API is unavailable.');
  if (!capabilities.secureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    state.warnings.push('Page is not running in a secure context.');
  }

  state.valid = state.errors.length === 0;
  updateReleaseStatusUI();
  return getReleaseValidationSnapshot();
}

export function getReleaseValidationSnapshot() {
  return {
    checkedAt: state.checkedAt,
    phase: state.phase,
    valid: state.valid,
    errors: [...state.errors],
    warnings: [...state.warnings],
    capabilities: { ...state.capabilities },
    duplicateIds: [...state.duplicateIds],
    missingDomIds: [...state.missingDomIds],
    mapId: state.mapId,
    mapValidation: state.mapValidation ? { ...state.mapValidation, warnings: [...state.mapValidation.warnings], errors: [...state.mapValidation.errors] } : null,
    build: state.build,
    baselineCommit: state.baselineCommit,
    devMode: state.devMode,
    debugSurfaces: [...state.debugSurfaces]
  };
}

if (typeof window !== 'undefined') {
  window.KAValidateRelease = runReleaseValidation;
  window.KAGetReleaseValidation = getReleaseValidationSnapshot;
}
