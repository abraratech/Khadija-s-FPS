// POST-FINAL.7 R1 — deterministic multi-stage co-op operations director.

import { POST_FINAL4_OPERATION_KINDS } from './postfinal4_objective_core.js';

export const POST_FINAL7_PATCH = 'post-final7-r1-coop-operations-expansion';
export const POST_FINAL7_SCHEMA = 1;

export const POST_FINAL7_MISSION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  DECISION: 'DECISION',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
});

export const POST_FINAL7_STAGE_TYPES = Object.freeze({
  INFILTRATE: 'INFILTRATE',
  RECOVER: 'RECOVER',
  SECONDARY: 'SECONDARY',
  DEFEND: 'DEFEND',
  HUNT: 'HUNT',
  EXTRACT: 'EXTRACT'
});

export const POST_FINAL7_RISK_CHOICES = Object.freeze({
  PENDING: 'PENDING',
  SECURE: 'SECURE',
  OVERDRIVE: 'OVERDRIVE'
});

const MAX_EVENTS = 128;
const MAX_COMPLETIONS = 16;
const DECISION_WINDOW_MS = 15000;

const MAP_MISSIONS = Object.freeze({
  grid_bunker: Object.freeze({
    missionId: 'BLACK-VAULT',
    label: 'Black Vault',
    stages: Object.freeze([
      stage('INFILTRATE', 'Breach the Bunker', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Secure the central access lane.'),
      stage('RECOVER', 'Restore Security Relay', POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT, 'Restore the bunker security relay.'),
      stage('SECONDARY', 'Recover the Trapped Survivor', POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR, 'Optional rescue before lockdown.'),
      stage('DEFEND', 'Hold the Vault Approach', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Hold the vault route while systems unlock.'),
      stage('HUNT', 'Eliminate the Vault Warden', POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET, 'Destroy the elite Warden.'),
      stage('EXTRACT', 'Exit through the North Gate', POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT, 'Hold extraction until the route is clear.')
    ])
  }),
  industrial_yard: Object.freeze({
    missionId: 'IRON-RECLAIM',
    label: 'Iron Reclaim',
    stages: Object.freeze([
      stage('INFILTRATE', 'Secure the Recovery Pad', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Establish a foothold in the yard.'),
      stage('RECOVER', 'Restart the Yard Generator', POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT, 'Bring the loading systems online.'),
      stage('SECONDARY', 'Recover the Lost Cargo', POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER, 'Optional cargo recovery for bonus rewards.'),
      stage('DEFEND', 'Defend the Loading Bay', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Protect the loading route.'),
      stage('HUNT', 'Eliminate the Yard Breaker', POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET, 'Destroy the elite Breaker.'),
      stage('EXTRACT', 'Extract through the West Gate', POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT, 'Hold the gate until extraction.')
    ])
  }),
  neon_depot: Object.freeze({
    missionId: 'NEON-CUTOFF',
    label: 'Neon Cutoff',
    stages: Object.freeze([
      stage('INFILTRATE', 'Take the Transit Platform', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Secure the depot approach.'),
      stage('RECOVER', 'Retrieve the Signal Core', POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER, 'Move the signal core to the uplink.'),
      stage('SECONDARY', 'Restore the Auxiliary Grid', POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT, 'Optional power restoration.'),
      stage('DEFEND', 'Hold the Uplink', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Defend the signal uplink.'),
      stage('HUNT', 'Eliminate the Neon Stalker', POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET, 'Destroy the elite Stalker.'),
      stage('EXTRACT', 'Hold the Departure Lane', POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT, 'Survive until the route opens.')
    ])
  }),
  parking_garage: Object.freeze({
    missionId: 'CONCRETE-LOCK',
    label: 'Concrete Lock',
    stages: Object.freeze([
      stage('INFILTRATE', 'Secure the Ramp', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Control the main vehicle ramp.'),
      stage('RECOVER', 'Retrieve the Access Module', POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER, 'Deliver the access module upstairs.'),
      stage('SECONDARY', 'Rescue the Stranded Driver', POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR, 'Optional civilian rescue.'),
      stage('DEFEND', 'Hold the Upper Deck', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Protect the extraction relay.'),
      stage('HUNT', 'Eliminate the Concrete Brute', POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET, 'Destroy the elite Brute.'),
      stage('EXTRACT', 'Extract from the Roof Ramp', POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT, 'Hold until the convoy arrives.')
    ])
  }),
  hospital_wing: Object.freeze({
    missionId: 'WHITE-OUT',
    label: 'White Out',
    stages: Object.freeze([
      stage('INFILTRATE', 'Secure Triage', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Clear and hold the triage wing.'),
      stage('RECOVER', 'Restore Emergency Power', POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT, 'Restart hospital emergency power.'),
      stage('SECONDARY', 'Escort the Field Medic', POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR, 'Optional medic rescue.'),
      stage('DEFEND', 'Hold Intensive Care', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Protect the evacuation corridor.'),
      stage('HUNT', 'Eliminate the Ward Abomination', POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET, 'Destroy the elite Abomination.'),
      stage('EXTRACT', 'Secure the Ambulance Bay', POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT, 'Hold until evacuation.')
    ])
  }),
  stormbreak_canal: Object.freeze({
    missionId: 'STORMBREAK',
    label: 'Stormbreak Lockout',
    stages: Object.freeze([
      stage('INFILTRATE', 'Secure Pump Access', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Secure the central pump approach.'),
      stage('RECOVER', 'Restore Flood Control', POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT, 'Restore the flood-control relay.'),
      stage('SECONDARY', 'Recover the Gate Engineer', POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR, 'Optional engineer rescue before lockout.'),
      stage('DEFEND', 'Hold the Control Island', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Hold while gate authority synchronizes.'),
      stage('HUNT', 'Eliminate the Canal Warden', POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET, 'Destroy the armored breach anchor.'),
      stage('EXTRACT', 'Exit through South Floodgate', POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT, 'Hold extraction while the canal seals.')
    ])
  }),
  reactor_courtyard: Object.freeze({
    missionId: 'RED-CORE',
    label: 'Red Core',
    stages: Object.freeze([
      stage('INFILTRATE', 'Secure the Cooling Yard', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Establish a safe route to the reactor.'),
      stage('RECOVER', 'Restart the Coolant Relay', POST_FINAL4_OPERATION_KINDS.RESTORE_EQUIPMENT, 'Restore coolant circulation.'),
      stage('SECONDARY', 'Recover the Control Rod', POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER, 'Optional control-rod recovery.'),
      stage('DEFEND', 'Hold the Reactor Access', POST_FINAL4_OPERATION_KINDS.DEFEND_ZONE, 'Protect the reactor approach.'),
      stage('HUNT', 'Eliminate the Core Tyrant', POST_FINAL4_OPERATION_KINDS.PRIORITY_TARGET, 'Destroy the elite Tyrant.'),
      stage('EXTRACT', 'Hold the Courtyard Exit', POST_FINAL4_OPERATION_KINDS.EXTRACTION_HOLDOUT, 'Survive the final extraction hold.')
    ])
  })
});

function stage(type, label, objectiveKind, description) {
  return Object.freeze({
    type,
    label,
    objectiveKind,
    description,
    optional: type === POST_FINAL7_STAGE_TYPES.SECONDARY
  });
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, min = -Infinity, max = Infinity) {
  return Math.max(min, Math.min(max, Math.floor(finite(value, fallback))));
}

function cleanText(value, fallback = '', max = 180) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function missionDefinition(mapId) {
  return MAP_MISSIONS[cleanText(mapId, 'grid_bunker', 80).toLowerCase()]
    || MAP_MISSIONS.grid_bunker;
}

function createStages(definition, runId) {
  const values = definition.stages.map((entry, index) => ({
    stageId: `${cleanText(runId, 'run', 120)}:${definition.missionId}:${index + 1}`,
    index,
    type: entry.type,
    label: entry.label,
    description: entry.description,
    objectiveKind: entry.objectiveKind,
    optional: entry.optional === true,
    status: index === 0 ? 'ACTIVE' : 'PENDING',
    operationId: null,
    completedAt: 0,
    failedAt: 0,
    contributors: {}
  }));
  // Deterministically vary the optional stage while preserving map identity.
  const optional = values.find((entry) => entry.type === POST_FINAL7_STAGE_TYPES.SECONDARY);
  if (optional && (hashText(`${runId}:${definition.missionId}`) % 2) === 1) {
    const alternate = optional.objectiveKind === POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR
      ? POST_FINAL4_OPERATION_KINDS.RETRIEVE_DELIVER
      : POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR;
    optional.objectiveKind = alternate;
    optional.label = alternate === POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR
      ? 'Rescue the Isolated Survivor'
      : 'Recover the Secondary Cache';
    optional.description = 'Optional randomized secondary objective.';
  }
  return values;
}

function rewardMultiplier(difficulty, playerCount, riskChoice) {
  const difficultyScale = 1 + Math.max(0, finite(difficulty, 1) - 1) * 0.35;
  const teamScale = 1 + Math.max(0, integer(playerCount, 1, 1, 4) - 1) * 0.08;
  const riskScale = riskChoice === POST_FINAL7_RISK_CHOICES.OVERDRIVE ? 1.5 : 1;
  return Number((difficultyScale * teamScale * riskScale).toFixed(3));
}

export function createPostFinal7MissionState({
  runId = 'run',
  mapId = 'grid_bunker',
  difficulty = 1,
  playerCount = 1,
  now = Date.now()
} = {}) {
  const definition = missionDefinition(mapId);
  const normalizedRunId = cleanText(runId, 'run', 160);
  const state = {
    patch: POST_FINAL7_PATCH,
    schema: POST_FINAL7_SCHEMA,
    runId: normalizedRunId,
    mapId: cleanText(mapId, 'grid_bunker', 80).toLowerCase(),
    missionId: definition.missionId,
    label: definition.label,
    status: POST_FINAL7_MISSION_STATUS.ACTIVE,
    currentStageIndex: 0,
    stages: createStages(definition, normalizedRunId),
    riskChoice: POST_FINAL7_RISK_CHOICES.PENDING,
    riskDecisionOpenedAt: 0,
    riskDecisionDeadline: 0,
    riskDecidedBy: null,
    difficulty: Math.max(0.5, Math.min(2, finite(difficulty, 1))),
    playerCount: integer(playerCount, 1, 1, 4),
    rewardMultiplier: rewardMultiplier(difficulty, playerCount, POST_FINAL7_RISK_CHOICES.SECURE),
    bossDefeated: false,
    extractionCompleted: false,
    completedStageCount: 0,
    optionalStagesCompleted: 0,
    failedStageCount: 0,
    totalContributions: {},
    roleScores: {
      VANGUARD: {},
      GUARDIAN: {},
      SPECIALIST: {},
      LIFELINE: {}
    },
    medals: [],
    completionId: null,
    completedAt: 0,
    failedAt: 0,
    lastOperationId: null,
    recentEvents: [],
    updatedAt: integer(now, Date.now())
  };
  return state;
}

function normalizeStage(entry, fallback) {
  return {
    ...fallback,
    ...clone(entry || {}),
    index: integer(entry?.index, fallback.index, 0, 20),
    optional: entry?.optional === true,
    contributors: { ...(entry?.contributors || {}) }
  };
}

export function normalizePostFinal7MissionState(value = {}, now = Date.now()) {
  const base = createPostFinal7MissionState({
    runId: value.runId,
    mapId: value.mapId,
    difficulty: value.difficulty,
    playerCount: value.playerCount,
    now
  });
  const state = {
    ...base,
    ...clone(value),
    patch: POST_FINAL7_PATCH,
    schema: POST_FINAL7_SCHEMA,
    currentStageIndex: integer(value.currentStageIndex, base.currentStageIndex, 0, base.stages.length - 1),
    playerCount: integer(value.playerCount, base.playerCount, 1, 4),
    completedStageCount: integer(value.completedStageCount, 0, 0, 20),
    optionalStagesCompleted: integer(value.optionalStagesCompleted, 0, 0, 20),
    failedStageCount: integer(value.failedStageCount, 0, 0, 20),
    totalContributions: { ...(value.totalContributions || {}) },
    roleScores: {
      VANGUARD: { ...(value.roleScores?.VANGUARD || {}) },
      GUARDIAN: { ...(value.roleScores?.GUARDIAN || {}) },
      SPECIALIST: { ...(value.roleScores?.SPECIALIST || {}) },
      LIFELINE: { ...(value.roleScores?.LIFELINE || {}) }
    },
    medals: Array.isArray(value.medals) ? clone(value.medals).slice(0, 16) : [],
    recentEvents: Array.isArray(value.recentEvents) ? clone(value.recentEvents).slice(-MAX_EVENTS) : [],
    updatedAt: integer(value.updatedAt, now)
  };
  state.stages = base.stages.map((fallback, index) => normalizeStage(value.stages?.[index], fallback));
  state.rewardMultiplier = rewardMultiplier(state.difficulty, state.playerCount, state.riskChoice);
  return state;
}

function addScore(map, playerId, amount) {
  const id = cleanText(playerId, '', 160);
  if (!id) return;
  map[id] = Math.max(0, finite(map[id]) + Math.max(0, finite(amount)));
}

function scoreRoleForStage(state, stage, contributors) {
  const role = stage.type === POST_FINAL7_STAGE_TYPES.HUNT
    ? 'VANGUARD'
    : ([POST_FINAL7_STAGE_TYPES.DEFEND, POST_FINAL7_STAGE_TYPES.INFILTRATE, POST_FINAL7_STAGE_TYPES.EXTRACT].includes(stage.type)
      ? 'GUARDIAN'
      : (stage.objectiveKind === POST_FINAL4_OPERATION_KINDS.RESCUE_SURVIVOR ? 'LIFELINE' : 'SPECIALIST'));
  Object.entries(contributors || {}).forEach(([playerId, amount]) => {
    addScore(state.totalContributions, playerId, amount);
    addScore(state.roleScores[role], playerId, amount);
  });
}

function buildMedals(state) {
  const labels = {
    VANGUARD: 'VANGUARD',
    GUARDIAN: 'GUARDIAN',
    SPECIALIST: 'SPECIALIST',
    LIFELINE: 'LIFELINE'
  };
  const medals = [];
  for (const [role, values] of Object.entries(state.roleScores)) {
    const ranked = Object.entries(values || {}).sort((left, right) => finite(right[1]) - finite(left[1]));
    if (!ranked.length || finite(ranked[0][1]) <= 0) continue;
    medals.push({
      role,
      label: labels[role] || role,
      playerId: ranked[0][0],
      score: Math.round(finite(ranked[0][1]))
    });
  }
  const overall = Object.entries(state.totalContributions)
    .sort((left, right) => finite(right[1]) - finite(left[1]));
  if (overall.length) {
    medals.unshift({
      role: 'MVP',
      label: 'MISSION MVP',
      playerId: overall[0][0],
      score: Math.round(finite(overall[0][1]))
    });
  }
  return medals.slice(0, 8);
}

export class PostFinal7MissionDirector {
  constructor(value = null) {
    this.state = normalizePostFinal7MissionState(value || createPostFinal7MissionState());
    this.pendingEvents = [];
  }

  reset(details = {}) {
    this.state = createPostFinal7MissionState(details);
    this.pendingEvents.length = 0;
    this.pendingEvents.push({
      type: 'MISSION_CHAIN_ASSIGNED',
      eventId: `${this.state.runId}:${this.state.missionId}:assigned`,
      mission: this.getSnapshot(details.now),
      at: this.state.updatedAt
    });
    return this.getSnapshot(details.now);
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (!snapshot || snapshot.patch !== POST_FINAL7_PATCH) return false;
    if (integer(snapshot.schema, 0) !== POST_FINAL7_SCHEMA) return false;
    if (this.state.runId && snapshot.runId && this.state.runId !== snapshot.runId) return false;
    this.state = normalizePostFinal7MissionState(snapshot, now);
    return true;
  }

  currentStage() {
    return this.state.stages[this.state.currentStageIndex] || null;
  }

  getObjectiveKind() {
    return this.currentStage()?.objectiveKind || POST_FINAL4_OPERATION_KINDS.SURVIVAL_FALLBACK;
  }

  bindOperation(operation, now = Date.now()) {
    const stage = this.currentStage();
    if (!stage || !operation) return false;
    if (stage.operationId === operation.operationId) return false;
    stage.operationId = cleanText(operation.operationId, '', 180) || null;
    stage.status = 'ACTIVE';
    this.state.lastOperationId = stage.operationId;
    this.state.updatedAt = integer(now, Date.now());
    return true;
  }

  chooseRisk(choice, actorId = '', now = Date.now()) {
    if (this.state.status !== POST_FINAL7_MISSION_STATUS.DECISION) return false;
    const normalized = cleanText(choice, '', 20).toUpperCase();
    if (![POST_FINAL7_RISK_CHOICES.SECURE, POST_FINAL7_RISK_CHOICES.OVERDRIVE].includes(normalized)) {
      return false;
    }
    this.state.riskChoice = normalized;
    this.state.riskDecidedBy = cleanText(actorId, 'HOST', 160);
    this.state.rewardMultiplier = rewardMultiplier(
      this.state.difficulty,
      this.state.playerCount,
      normalized
    );
    this.state.status = POST_FINAL7_MISSION_STATUS.ACTIVE;
    this.state.updatedAt = integer(now, Date.now());
    this.pendingEvents.push({
      type: 'MISSION_RISK_SELECTED',
      eventId: `${this.state.runId}:${this.state.missionId}:risk:${normalized}`,
      riskChoice: normalized,
      actorId: this.state.riskDecidedBy,
      at: this.state.updatedAt
    });
    return true;
  }

  update(now = Date.now()) {
    const timestamp = integer(now, Date.now());
    if (
      this.state.status === POST_FINAL7_MISSION_STATUS.DECISION
      && this.state.riskDecisionDeadline > 0
      && timestamp >= this.state.riskDecisionDeadline
    ) {
      this.chooseRisk(POST_FINAL7_RISK_CHOICES.SECURE, 'AUTO', timestamp);
    }
    this.state.updatedAt = timestamp;
    return this.getSnapshot(timestamp);
  }

  observeOperation(operation, now = Date.now()) {
    const stage = this.currentStage();
    if (!stage || !operation) return { accepted: false, advance: false };
    if (!stage.operationId) this.bindOperation(operation, now);
    if (stage.operationId && operation.operationId !== stage.operationId) {
      return { accepted: false, advance: false };
    }
    if (operation.status === 'ACTIVE') return { accepted: false, advance: false };
    if (stage.status === 'COMPLETE' || stage.status === 'FAILED') {
      return { accepted: false, advance: false };
    }

    const timestamp = integer(now, Date.now());
    if (operation.status === 'COMPLETE') {
      stage.status = 'COMPLETE';
      stage.completedAt = timestamp;
      stage.contributors = { ...(operation.contributors || {}) };
      this.state.completedStageCount += 1;
      if (stage.optional) this.state.optionalStagesCompleted += 1;
      if (stage.type === POST_FINAL7_STAGE_TYPES.HUNT) this.state.bossDefeated = true;
      if (stage.type === POST_FINAL7_STAGE_TYPES.EXTRACT) this.state.extractionCompleted = true;
      scoreRoleForStage(this.state, stage, stage.contributors);
      this.pendingEvents.push({
        type: 'MISSION_STAGE_COMPLETED',
        eventId: `${stage.stageId}:complete`,
        stage: clone(stage),
        at: timestamp
      });
    } else {
      stage.status = 'FAILED';
      stage.failedAt = timestamp;
      this.state.failedStageCount += 1;
      this.pendingEvents.push({
        type: 'MISSION_STAGE_FAILED',
        eventId: `${stage.stageId}:failed`,
        stage: clone(stage),
        at: timestamp
      });
      if (!stage.optional) {
        this.state.status = POST_FINAL7_MISSION_STATUS.FAILED;
        this.state.failedAt = timestamp;
        this.state.medals = buildMedals(this.state);
        return { accepted: true, advance: false, failed: true };
      }
    }

    if (stage.type === POST_FINAL7_STAGE_TYPES.HUNT) {
      this.state.currentStageIndex += 1;
      this.state.status = POST_FINAL7_MISSION_STATUS.DECISION;
      this.state.riskDecisionOpenedAt = timestamp;
      this.state.riskDecisionDeadline = timestamp + DECISION_WINDOW_MS;
      const next = this.currentStage();
      if (next) next.status = 'PENDING';
      this.pendingEvents.push({
        type: 'MISSION_RISK_DECISION_OPENED',
        eventId: `${this.state.runId}:${this.state.missionId}:risk-open`,
        deadline: this.state.riskDecisionDeadline,
        at: timestamp
      });
      return { accepted: true, advance: false, decision: true };
    }

    if (stage.type === POST_FINAL7_STAGE_TYPES.EXTRACT) {
      this.state.status = POST_FINAL7_MISSION_STATUS.COMPLETE;
      this.state.completedAt = timestamp;
      this.state.completionId = `${this.state.runId}:${this.state.missionId}:complete`;
      this.state.medals = buildMedals(this.state);
      this.pendingEvents.push({
        type: 'MISSION_CHAIN_COMPLETED',
        eventId: this.state.completionId,
        mission: this.getSnapshot(timestamp),
        at: timestamp
      });
      return { accepted: true, advance: false, complete: true };
    }

    this.state.currentStageIndex = Math.min(
      this.state.stages.length - 1,
      this.state.currentStageIndex + 1
    );
    const next = this.currentStage();
    if (next) next.status = 'ACTIVE';
    this.state.updatedAt = timestamp;
    return { accepted: true, advance: true, stage: clone(next) };
  }

  consumeEvents() {
    const events = this.pendingEvents.map(clone);
    this.pendingEvents.length = 0;
    return events;
  }

  getDirective() {
    const stage = this.currentStage();
    if (!stage || ![POST_FINAL7_MISSION_STATUS.ACTIVE, POST_FINAL7_MISSION_STATUS.DECISION].includes(this.state.status)) {
      return null;
    }
    return Object.freeze(clone({
      patch: POST_FINAL7_PATCH,
      missionId: this.state.missionId,
      missionLabel: this.state.label,
      missionStatus: this.state.status,
      stageId: stage.stageId,
      stageIndex: stage.index,
      stageCount: this.state.stages.length,
      stageType: stage.type,
      stageLabel: stage.label,
      objectiveKind: stage.objectiveKind,
      optional: stage.optional,
      bossStage: stage.type === POST_FINAL7_STAGE_TYPES.HUNT,
      extractionStage: stage.type === POST_FINAL7_STAGE_TYPES.EXTRACT,
      riskChoice: this.state.riskChoice,
      riskDecisionDeadline: this.state.riskDecisionDeadline,
      rewardMultiplier: this.state.rewardMultiplier,
      playerCount: this.state.playerCount,
      difficulty: this.state.difficulty,
      humanSquadCommandsOverride: true
    }));
  }

  getSnapshot(now = Date.now()) {
    return Object.freeze(clone(normalizePostFinal7MissionState({
      ...this.state,
      updatedAt: integer(now, Date.now())
    }, now)));
  }
}

export function getPostFinal7MissionDefinition(mapId) {
  return clone(missionDefinition(mapId));
}

export function computePostFinal7Reward({
  basePoints = 0,
  difficulty = 1,
  playerCount = 1,
  riskChoice = POST_FINAL7_RISK_CHOICES.SECURE,
  optionalStagesCompleted = 0
} = {}) {
  const multiplier = rewardMultiplier(difficulty, playerCount, riskChoice);
  const optionalBonus = Math.max(0, integer(optionalStagesCompleted, 0)) * 75;
  return Math.max(0, Math.round((Math.max(0, finite(basePoints)) + optionalBonus) * multiplier));
}
