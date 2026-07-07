// js/objectives.js
// C11 — One map-specific contract per run.

import { awardProgressionXP, recordProgressionObjective } from './progression.js';

const OBJECTIVES = Object.freeze({
  grid_bunker: Object.freeze({
    id: 'BUNKER_CLEARANCE', label: 'Bunker Clearance', description: 'Eliminate 25 enemies.', kind: 'KILLS', target: 25, points: 500, xp: 110
  }),
  industrial_yard: Object.freeze({
    id: 'YARD_MARKSMAN', label: 'Yard Marksman', description: 'Score 8 long-range eliminations (18m+).', kind: 'LONGSHOT_KILLS', target: 8, points: 650, xp: 135
  }),
  neon_depot: Object.freeze({
    id: 'NEON_PRECISION', label: 'Neon Precision', description: 'Score 10 headshot eliminations.', kind: 'HEADSHOT_KILLS', target: 10, points: 600, xp: 130
  }),
  parking_garage: Object.freeze({
    id: 'GARAGE_CLOSEOUT', label: 'Garage Closeout', description: 'Score 12 close-range eliminations (6m or less).', kind: 'CLOSE_KILLS', target: 12, points: 600, xp: 125
  }),
  hospital_wing: Object.freeze({
    id: 'TRIAGE_PROTOCOL', label: 'Triage Protocol', description: 'Clear 3 waves with at least 70% health.', kind: 'HEALTHY_WAVES', target: 3, points: 750, xp: 150
  })
});

const state = {
  active: false,
  mapId: 'unknown',
  objective: null,
  progress: 0,
  completed: false,
  completedAt: 0,
  lastEvent: 'IDLE',
  pendingCompletion: null
};

function getDefinition(mapId) {
  return OBJECTIVES[String(mapId || '')] || OBJECTIVES.grid_bunker;
}

function advance(amount = 1) {
  if (!state.active || state.completed || !state.objective) return null;
  state.progress = Math.min(state.objective.target, state.progress + Math.max(0, Number(amount) || 0));
  state.lastEvent = `${state.objective.id} ${state.progress}/${state.objective.target}`;
  if (state.progress < state.objective.target) return null;

  state.completed = true;
  state.completedAt = Date.now();
  state.lastEvent = `${state.objective.id} COMPLETE`;
  recordProgressionObjective();
  awardProgressionXP(state.objective.xp, 'OBJECTIVE');
  state.pendingCompletion = { ...state.objective };
  return { ...state.pendingCompletion };
}

export function resetObjectivesRun({ mapId = 'grid_bunker' } = {}) {
  state.active = true;
  state.mapId = String(mapId || 'grid_bunker');
  state.objective = getDefinition(state.mapId);
  state.progress = 0;
  state.completed = false;
  state.completedAt = 0;
  state.lastEvent = 'CONTRACT ASSIGNED';
  state.pendingCompletion = null;
  return getObjectiveSnapshot();
}

export function endObjectivesRun() {
  state.active = false;
}

export function recordObjectiveKill({ headshot = false, distance = 0 } = {}) {
  const kind = state.objective?.kind;
  if (kind === 'KILLS') return advance(1);
  if (kind === 'LONGSHOT_KILLS' && Number(distance) >= 18) return advance(1);
  if (kind === 'HEADSHOT_KILLS' && headshot) return advance(1);
  if (kind === 'CLOSE_KILLS' && Number(distance) <= 6) return advance(1);
  return null;
}

export function recordObjectiveWaveClear({ health = 0, maxHealth = 100 } = {}) {
  if (state.objective?.kind !== 'HEALTHY_WAVES') return null;
  const ratio = Math.max(0, Number(health) || 0) / Math.max(1, Number(maxHealth) || 100);
  return ratio >= 0.70 ? advance(1) : null;
}

export function consumeObjectiveCompletion() {
  const event = state.pendingCompletion;
  state.pendingCompletion = null;
  return event;
}

export function getObjectiveSnapshot() {
  return {
    active: state.active,
    mapId: state.mapId,
    objective: state.objective ? { ...state.objective } : null,
    progress: state.progress,
    completed: state.completed,
    completedAt: state.completedAt,
    lastEvent: state.lastEvent
  };
}

if (typeof window !== 'undefined') {
  window.KAGetObjectives = getObjectiveSnapshot;
}
