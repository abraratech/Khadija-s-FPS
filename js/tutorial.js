// js/tutorial.js
// C13 — First-run tutorial flow and persistent enemy introductions.

const TUTORIAL_COMPLETE_KEY = 'ka_tutorial_complete_v1';
const TUTORIAL_ENABLED_KEY = 'ka_tutorial_enabled_v1';
const ENEMY_INTROS_KEY = 'ka_enemy_intros_v1';

const STAGES = Object.freeze([
  { id: 'MOVE', title: 'MOVE', desktop: 'Use your movement keys to leave the spawn point.', mobile: 'Push the left joystick forward. Sprint engages automatically near the edge.' },
  { id: 'FIRE', title: 'FIRE', desktop: 'Click to fire your weapon.', mobile: 'Hold ADS for precision, then tap FIRE to shoot.' },
  { id: 'RELOAD', title: 'RELOAD', desktop: 'Reload once to confirm your control.', mobile: 'Tap RLD to reload.' },
  { id: 'INTERACT', title: 'INTERACT', desktop: 'Use Interact near a shop, door, trap, or barricade.', mobile: 'Tap the interact button near a shop, door, trap, or barricade.' },
  { id: 'SURVIVE', title: 'SURVIVE', desktop: 'Clear the first wave.', mobile: 'Clear the first wave.' }
]);

const ENEMY_INTROS = Object.freeze({
  CRAWLER: { text: 'CRAWLER · LOW PROFILE · WATCH THE FLOOR', color: '#d6ff33' },
  RUNNER: { text: 'RUNNER · FAST PRESSURE · KEEP SPACE', color: '#ff6600' },
  BRUTE: { text: 'BRUTE · HEAVY WIND-UP · INTERRUPT OR EVADE', color: '#aa55ff' },
  EXPLODER: { text: 'EXPLODER · PRIMING BLAST · BREAK LINE OR INTERRUPT', color: '#ffcc00' },
  RANGED: { text: 'SPITTER · RANGED ATTACK · USE COVER', color: '#00ffff' },
  GOLIATH: { text: 'GOLIATH · ELITE HEAVY · RESPECT THE TELEGRAPH', color: '#dd00ff' }
});

const state = {
  runActive: false,
  enabled: readEnabled(),
  complete: readComplete(),
  mapId: 'unknown',
  isMobile: false,
  stageIndex: 0,
  movedDistance: 0,
  lastX: null,
  lastZ: null,
  actions: new Set(),
  events: [],
  introduced: readIntroduced(),
  lastEvent: 'IDLE'
};

let uiBound = false;

function readEnabled() {
  try {
    return localStorage.getItem(TUTORIAL_ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

function readComplete() {
  try {
    return localStorage.getItem(TUTORIAL_COMPLETE_KEY) === 'yes';
  } catch {
    return false;
  }
}

function readIntroduced() {
  try {
    const values = JSON.parse(localStorage.getItem(ENEMY_INTROS_KEY) || '[]');
    return new Set(Array.isArray(values) ? values : []);
  } catch {
    return new Set();
  }
}

function persistIntroduced() {
  try {
    localStorage.setItem(ENEMY_INTROS_KEY, JSON.stringify([...state.introduced]));
  } catch {
    // Ignore storage failures.
  }
}

function setTutorialComplete(complete) {
  state.complete = complete === true;
  try {
    localStorage.setItem(TUTORIAL_COMPLETE_KEY, state.complete ? 'yes' : 'no');
  } catch {
    // Ignore storage failures.
  }
}

function setTutorialEnabled(enabled) {
  state.enabled = enabled !== false;
  try {
    localStorage.setItem(TUTORIAL_ENABLED_KEY, state.enabled ? 'on' : 'off');
  } catch {
    // Ignore storage failures.
  }
}

function currentStage() {
  return STAGES[state.stageIndex] || null;
}

function updateTutorialPanel() {
  const panel = document.getElementById('tutorial-panel');
  const title = document.getElementById('tutorial-title');
  const body = document.getElementById('tutorial-body');
  const progress = document.getElementById('tutorial-progress');
  const stage = currentStage();
  const visible = state.runActive && state.enabled && !state.complete && Boolean(stage);

  if (panel) panel.style.display = visible ? 'block' : 'none';
  if (!visible) return;

  if (title) title.textContent = stage.title;
  if (body) body.textContent = state.isMobile ? stage.mobile : stage.desktop;
  if (progress) progress.textContent = `${state.stageIndex + 1}/${STAGES.length}`;
}

function pushEvent(type, text, color = '#00d4ff', duration = 2100) {
  state.events.push({ type, text, color, duration });
  if (state.events.length > 8) state.events.shift();
  state.lastEvent = type;
}

function advanceStage() {
  state.stageIndex++;

  if (state.stageIndex >= STAGES.length) {
    setTutorialComplete(true);
    pushEvent('TUTORIAL_COMPLETE', 'TRAINING COMPLETE · SURVIVAL SYSTEMS ONLINE', '#22ff88', 2600);
  } else {
    const stage = currentStage();
    pushEvent('TUTORIAL_STEP', `TRAINING · ${stage.title}`, '#00d4ff', 1500);
  }

  updateTutorialPanel();
}

function updateMovement(player) {
  const x = Number(player?.pos?.x);
  const z = Number(player?.pos?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;

  if (Number.isFinite(state.lastX) && Number.isFinite(state.lastZ)) {
    state.movedDistance += Math.hypot(x - state.lastX, z - state.lastZ);
  }

  state.lastX = x;
  state.lastZ = z;
}

function checkEnemyIntroductions(enemies) {
  for (const enemy of enemies || []) {
    if (!enemy?.alive || enemy.dyingT >= 0) continue;
    const type = String(enemy.type || '');
    const intro = ENEMY_INTROS[type];
    if (!intro || state.introduced.has(type)) continue;

    state.introduced.add(type);
    persistIntroduced();
    pushEvent(`ENEMY_${type}`, intro.text, intro.color, type === 'GOLIATH' ? 3200 : 2400);
  }
}

export function initTutorialControls() {
  if (uiBound) {
    syncTutorialControls();
    return;
  }

  uiBound = true;

  document.getElementById('tutorial-prompts-select')?.addEventListener('change', (event) => {
    setTutorialEnabled(event.target.value !== 'off');
    updateTutorialPanel();
    syncTutorialControls();
  });

  document.getElementById('reset-tutorial-btn')?.addEventListener('click', () => {
    setTutorialComplete(false);
    state.introduced.clear();
    persistIntroduced();
    syncTutorialControls();
  });

  syncTutorialControls();
}

export function syncTutorialControls() {
  const select = document.getElementById('tutorial-prompts-select');
  if (select) select.value = state.enabled ? 'on' : 'off';

  const status = document.getElementById('tutorial-status');
  if (status) {
    status.textContent = state.complete
      ? `Training complete · ${state.introduced.size}/${Object.keys(ENEMY_INTROS).length} enemy types introduced`
      : 'Training available on the next run';
  }
}

export function resetTutorialRun({ mapId = 'unknown', isMobile = false, player = null } = {}) {
  state.runActive = true;
  state.mapId = String(mapId || 'unknown');
  state.isMobile = isMobile === true;
  state.stageIndex = 0;
  state.movedDistance = 0;
  state.lastX = Number(player?.pos?.x);
  state.lastZ = Number(player?.pos?.z);
  state.actions.clear();
  state.events.length = 0;
  state.lastEvent = 'RUN_START';
  state.enabled = readEnabled();
  state.complete = readComplete();
  updateTutorialPanel();
}

export function endTutorialRun() {
  state.runActive = false;
  updateTutorialPanel();
}

export function recordTutorialAction(action) {
  if (!action) return;
  state.actions.add(String(action).toUpperCase());
}

export function updateTutorial(dt, {
  player = null,
  wave = 1,
  enemies = []
} = {}) {
  if (!state.runActive) return;

  checkEnemyIntroductions(enemies);
  if (!state.enabled || state.complete) return;

  updateMovement(player);
  const stage = currentStage();
  if (!stage) return;

  if (stage.id === 'MOVE' && state.movedDistance >= 2.2) advanceStage();
  else if (stage.id === 'FIRE' && state.actions.has('FIRE')) advanceStage();
  else if (stage.id === 'RELOAD' && state.actions.has('RELOAD')) advanceStage();
  else if (stage.id === 'INTERACT' && state.actions.has('INTERACT')) advanceStage();
  else if (stage.id === 'SURVIVE' && Number(wave) >= 2) advanceStage();

  // Keep the parameter intentional so the call remains frame-loop friendly.
  void dt;
}

export function consumeTutorialEvents() {
  if (state.events.length === 0) return [];
  return state.events.splice(0, state.events.length);
}

export function getTutorialSnapshot() {
  return {
    runActive: state.runActive,
    enabled: state.enabled,
    complete: state.complete,
    mapId: state.mapId,
    stageIndex: state.stageIndex,
    stage: currentStage()?.id || 'COMPLETE',
    movedDistance: state.movedDistance,
    actions: [...state.actions],
    introducedEnemies: [...state.introduced],
    lastEvent: state.lastEvent
  };
}

if (typeof window !== 'undefined') {
  window.KAGetTutorial = getTutorialSnapshot;
  window.KAResetTutorial = () => {
    setTutorialComplete(false);
    state.introduced.clear();
    persistIntroduced();
    syncTutorialControls();
    return getTutorialSnapshot();
  };
}
