export const VISUAL_TUTORIAL_PATCH = 'm4-visual-tutorial-r1';

export const VISUAL_TUTORIAL_CUES = Object.freeze({
  MOVE: Object.freeze({ stage: 'MOVE', icon: 'ARROWS', desktopControl: 'WASD', mobileControl: 'JOYSTICK', highlightId: 'joystick-left', accent: '#00d4ff' }),
  FIRE: Object.freeze({ stage: 'FIRE', icon: 'TARGET', desktopControl: 'L-MOUSE', mobileControl: 'FIRE', highlightId: 'btn-shoot', accent: '#ff5533' }),
  RELOAD: Object.freeze({ stage: 'RELOAD', icon: 'RELOAD', desktopControl: 'R', mobileControl: 'RLD', highlightId: 'btn-reload', accent: '#ffaa00' }),
  INTERACT: Object.freeze({ stage: 'INTERACT', icon: 'HAND', desktopControl: 'E', mobileControl: 'USE', highlightId: 'btn-interact', accent: '#22ff88' }),
  SURVIVE: Object.freeze({ stage: 'SURVIVE', icon: 'SHIELD', desktopControl: 'SURVIVE', mobileControl: 'SURVIVE', highlightId: '', accent: '#aa66ff' })
});

function cleanStage(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function normalizeVisualTutorialSnapshot(snapshot = {}) {
  const stage = cleanStage(snapshot.stage);
  return Object.freeze({
    runActive: snapshot.runActive === true,
    enabled: snapshot.enabled !== false,
    complete: snapshot.complete === true,
    stage: Object.prototype.hasOwnProperty.call(VISUAL_TUTORIAL_CUES, stage) ? stage : 'COMPLETE',
    stageIndex: Math.max(0, Math.floor(Number(snapshot.stageIndex) || 0))
  });
}

export function getVisualTutorialCue(snapshot = {}, { isMobile = false } = {}) {
  const normalized = normalizeVisualTutorialSnapshot(snapshot);
  const visible = normalized.runActive && normalized.enabled && !normalized.complete && normalized.stage !== 'COMPLETE';
  if (!visible) return Object.freeze({ visible: false, stage: normalized.stage, progress: normalized.stageIndex + 1 });
  const cue = VISUAL_TUTORIAL_CUES[normalized.stage];
  return Object.freeze({
    visible: true,
    stage: cue.stage,
    icon: cue.icon,
    control: isMobile ? cue.mobileControl : cue.desktopControl,
    highlightId: isMobile ? cue.highlightId : '',
    accent: cue.accent,
    progress: normalized.stageIndex + 1,
    total: Object.keys(VISUAL_TUTORIAL_CUES).length
  });
}
