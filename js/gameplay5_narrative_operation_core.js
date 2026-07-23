// GAMEPLAY.5 R1 — deterministic text-driven narrative operations.
// Narrative delivery remains text and nonverbal presentation only.

export const GAMEPLAY5_PATCH = 'gameplay5-r1-narrative-operations';
export const GAMEPLAY5_SCHEMA = 1;

export const GAMEPLAY5_STATUS = Object.freeze({
  INACTIVE: 'INACTIVE',
  ACTIVE: 'ACTIVE',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
});

export const GAMEPLAY5_BRANCH = Object.freeze({
  UNRESOLVED: 'UNRESOLVED',
  ASSET_SECURED: 'ASSET_SECURED',
  ASSET_LOST: 'ASSET_LOST'
});

export const GAMEPLAY5_CUE = Object.freeze({
  BRIEFING: 'BRIEFING',
  OBJECTIVE: 'OBJECTIVE',
  CONSEQUENCE: 'CONSEQUENCE',
  BOSS: 'BOSS',
  WORLD: 'WORLD',
  DEBRIEF: 'DEBRIEF',
  FAILURE: 'FAILURE'
});

const MAX_TRANSMISSIONS = 48;
const MAX_DEDUPE_KEYS = 96;
const DEFAULT_DURATION_MS = 9000;

function cleanText(value, fallback = '', max = 220) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0, min = -Infinity, max = Infinity) {
  return Math.max(min, Math.min(max, Math.floor(finite(value, fallback))));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function freezeClone(value) {
  return Object.freeze(clone(value));
}

function stageLine(title, body, source = 'CONTROL') {
  return Object.freeze({ title, body, source });
}

const MAP_STORIES = Object.freeze({
  grid_bunker: Object.freeze({
    operationId: 'BLACK-VAULT-DIRECTIVE',
    title: 'Black Vault Directive',
    source: 'CONTROL',
    premise: 'The bunker is broadcasting a dormant command signal. Enter, restore the relay, and identify what is protecting the vault.',
    stages: Object.freeze([
      stageLine('BREACH AUTHORIZED', 'Secure the access lane. The signal is strongest beneath the central bunker.'),
      stageLine('RELAY RECOVERY', 'Restore the security relay. Its logs should identify the vault custodian.'),
      stageLine('SURVIVOR WINDOW', 'A trapped operative is transmitting nearby. Recovery may expose a safer route.'),
      stageLine('VAULT APPROACH', 'The relay is awake. Hold the approach while the inner locks cycle.'),
      stageLine('WARDEN CONTACT', 'The vault custodian is active. Break its attack pattern and end the signal.'),
      stageLine('NORTH GATE', 'The bunker is collapsing into lockdown. Reach the north gate and hold the route.')
    ]),
    secured: 'The recovered operative supplied a maintenance bypass. Final resistance will be reduced.',
    lost: 'The rescue window closed. The team must force the final route without local support.',
    complete: 'The command signal is silent. The Black Vault is contained.',
    failed: 'The bunker retained control of the vault. Operation Black Vault is unresolved.'
  }),
  industrial_yard: Object.freeze({
    operationId: 'IRON-RECLAIM-DIRECTIVE',
    title: 'Iron Reclaim Directive',
    source: 'FIELD OPS',
    premise: 'A recovery convoy vanished inside the yard. Reopen the loading systems and reclaim its cargo before the hostile faction moves it.',
    stages: Object.freeze([
      stageLine('RECOVERY PAD', 'Secure the pad and establish a route for the missing convoy.'),
      stageLine('GENERATOR START', 'Restart the yard generator. Crane telemetry may reveal the cargo position.'),
      stageLine('CARGO WINDOW', 'Recover the lost cargo now. Its contents can reinforce the extraction route.'),
      stageLine('LOADING BAY', 'The yard systems are online. Defend the loading bay while the convoy path is rebuilt.'),
      stageLine('BREAKER CONTACT', 'The Yard Breaker is blocking the convoy route. Neutralize it.'),
      stageLine('WEST GATE', 'Move the recovered assets through the west gate and hold until transport arrives.')
    ]),
    secured: 'The recovered cargo contains barrier cells. Extraction defenses are reinforced.',
    lost: 'The cargo was lost. The west gate must be held without additional barriers.',
    complete: 'The convoy route is restored and the yard assets are secured.',
    failed: 'The yard remains hostile and the missing convoy is unrecovered.'
  }),
  neon_depot: Object.freeze({
    operationId: 'NEON-CUTOFF-DIRECTIVE',
    title: 'Neon Cutoff Directive',
    source: 'SIGNAL CONTROL',
    premise: 'A hostile relay is using the depot to coordinate arena incursions. Seize the platform and sever the uplink.',
    stages: Object.freeze([
      stageLine('PLATFORM ENTRY', 'Take the transit platform before the relay completes another broadcast.'),
      stageLine('SIGNAL CORE', 'Move the signal core to the uplink. We need the transmission keys intact.'),
      stageLine('AUXILIARY GRID', 'Restore the auxiliary grid to preserve the recovered signal map.'),
      stageLine('UPLINK HOLD', 'The relay is exposed. Hold the uplink while the cutoff sequence runs.'),
      stageLine('STALKER CONTACT', 'The Neon Stalker is carrying the final routing key. Eliminate it.'),
      stageLine('DEPARTURE LANE', 'The cutoff is complete. Hold the departure lane until the depot goes dark.')
    ]),
    secured: 'The auxiliary grid preserved the signal map. Hostile routing is partially disabled.',
    lost: 'The auxiliary grid failed. The enemy retained part of the routing network.',
    complete: 'The depot uplink is severed and the hostile signal network is blind.',
    failed: 'The relay remains active. Neon Cutoff did not complete.'
  }),
  parking_garage: Object.freeze({
    operationId: 'CONCRETE-LOCK-DIRECTIVE',
    title: 'Concrete Lock Directive',
    source: 'CIVIL DEFENSE',
    premise: 'The garage is the last protected route out of the district. Secure its access systems and recover anyone still trapped inside.',
    stages: Object.freeze([
      stageLine('RAMP CONTROL', 'Secure the main ramp and stop hostile movement between levels.'),
      stageLine('ACCESS MODULE', 'Recover the access module. It controls the roof extraction barriers.'),
      stageLine('DRIVER SIGNAL', 'A stranded driver is transmitting from the lower deck. Rescue may preserve the convoy route.'),
      stageLine('UPPER DECK', 'Hold the upper deck while the extraction relay authenticates the module.'),
      stageLine('BRUTE CONTACT', 'The Concrete Brute is moving toward the roof ramp. Stop it before extraction.'),
      stageLine('ROOF RAMP', 'Open the roof route and hold until the convoy clears the district.')
    ]),
    secured: 'The rescued driver supplied a clean convoy path. Extraction traffic will arrive sooner.',
    lost: 'The driver signal is gone. Extraction must use the exposed roof approach.',
    complete: 'The district convoy escaped through the garage route.',
    failed: 'The garage route was lost before the convoy could escape.'
  }),
  hospital_wing: Object.freeze({
    operationId: 'WHITE-OUT-DIRECTIVE',
    title: 'White Out Directive',
    source: 'MEDICAL CONTROL',
    premise: 'Emergency systems are failing while contamination spreads through the hospital. Restore power and open an evacuation corridor.',
    stages: Object.freeze([
      stageLine('TRIAGE ENTRY', 'Secure triage. Medical Control needs a stable point for the evacuation plan.'),
      stageLine('EMERGENCY POWER', 'Restart emergency power before the isolation systems fail completely.'),
      stageLine('MEDIC WINDOW', 'A field medic is trapped beyond the quarantine line. Escort support could stabilize evacuation.'),
      stageLine('INTENSIVE CARE', 'Protect the evacuation corridor while patients are moved to the ambulance bay.'),
      stageLine('ABOMINATION CONTACT', 'The Ward Abomination is contaminating the corridor. Eliminate it.'),
      stageLine('AMBULANCE BAY', 'Hold the ambulance bay until the final medical transport departs.')
    ]),
    secured: 'The field medic restored evacuation triage. The final hold receives medical support.',
    lost: 'The medic could not be recovered. The final hold proceeds with limited medical support.',
    complete: 'The hospital corridor is open and the evacuation is complete.',
    failed: 'The hospital evacuation corridor collapsed before transport arrived.'
  }),
  stormbreak_canal: Object.freeze({
    operationId: 'STORMBREAK-DIRECTIVE',
    title: 'Stormbreak Directive',
    source: 'FLOOD CONTROL',
    premise: 'Hostile specialists seized the coastal flood-control nexus. Restore pump authority, recover the gate key, and keep the canal from becoming an invasion route.',
    stages: Object.freeze([
      stageLine('CANAL APPROACH', 'Secure the pump-house approaches and open a route to flood control.'),
      stageLine('PUMP AUTHORITY', 'Restore primary pump authority before the canal backs up.'),
      stageLine('GATE KEY WINDOW', 'Recover the floodgate key before the emergency lockout.'),
      stageLine('CONTROL ISLAND', 'Hold the control island while the gate sequence synchronizes.'),
      stageLine('WARDEN CONTACT', 'A Warden is anchoring the breach force. Eliminate it.'),
      stageLine('STORMBREAK EXIT', 'Hold the canal exit until coastal control confirms containment.')
    ]),
    secured: 'The floodgate key was recovered. Pump authority and extraction timing improve.',
    lost: 'The floodgate key was lost. The final hold proceeds under manual control.',
    complete: 'Stormbreak Canal is secured and the coastal breach route is closed.',
    failed: 'The flood-control nexus was lost before containment could be restored.'
  }),
  reactor_courtyard: Object.freeze({
    operationId: 'RED-CORE-DIRECTIVE',
    title: 'Red Core Directive',
    source: 'REACTOR CONTROL',
    premise: 'The reactor is overheating under hostile control. Restore coolant circulation, secure the control system, and prevent a courtyard breach.',
    stages: Object.freeze([
      stageLine('COOLING YARD', 'Secure the cooling yard and open a path to the reactor controls.'),
      stageLine('COOLANT RELAY', 'Restart the coolant relay. Core temperature is still climbing.'),
      stageLine('CONTROL ROD WINDOW', 'Recover the control rod before the containment cycle locks it out.'),
      stageLine('REACTOR ACCESS', 'Hold reactor access while coolant pressure stabilizes.'),
      stageLine('TYRANT CONTACT', 'The Core Tyrant is destabilizing containment. Eliminate it.'),
      stageLine('COURTYARD EXIT', 'Containment is recovering. Hold the courtyard exit until the shutdown completes.')
    ]),
    secured: 'The control rod was recovered. Shutdown pressure is stable and the exit window improves.',
    lost: 'The control rod was lost. Containment remains unstable through extraction.',
    complete: 'The reactor is stabilized and the Red Core breach is contained.',
    failed: 'Containment failed before the shutdown sequence completed.'
  })
});

function storyForMap(mapId) {
  const key = cleanText(mapId, 'grid_bunker', 80).toLowerCase();
  return MAP_STORIES[key] || MAP_STORIES.grid_bunker;
}

function isPvpMode(gameMode) {
  const normalized = cleanText(gameMode, 'survival', 40).toLowerCase();
  return normalized === 'pvp' || normalized.startsWith('pvp-');
}

function branchFromMission(mission) {
  const optional = Array.isArray(mission?.stages)
    ? mission.stages.find((entry) => entry?.optional === true || entry?.type === 'SECONDARY')
    : null;
  if (optional?.status === 'COMPLETE' || finite(mission?.optionalStagesCompleted) > 0) {
    return GAMEPLAY5_BRANCH.ASSET_SECURED;
  }
  if (optional?.status === 'FAILED') return GAMEPLAY5_BRANCH.ASSET_LOST;
  return GAMEPLAY5_BRANCH.UNRESOLVED;
}

function outcomeFor(state, mission) {
  const risk = cleanText(mission?.riskChoice, 'SECURE', 24).toUpperCase();
  if (state.branchId === GAMEPLAY5_BRANCH.ASSET_SECURED && risk === 'OVERDRIVE') {
    return { id: 'DECISIVE_VICTORY', label: 'Decisive Victory', grade: 'A' };
  }
  if (state.branchId === GAMEPLAY5_BRANCH.ASSET_SECURED) {
    return { id: 'CLEAN_EXTRACTION', label: 'Clean Extraction', grade: 'A-' };
  }
  if (state.branchId === GAMEPLAY5_BRANCH.ASSET_LOST && risk === 'OVERDRIVE') {
    return { id: 'LAST_STAND', label: 'Last Stand', grade: 'B+' };
  }
  if (state.branchId === GAMEPLAY5_BRANCH.ASSET_LOST) {
    return { id: 'COSTLY_ESCAPE', label: 'Costly Escape', grade: 'B' };
  }
  return { id: 'MISSION_RESOLVED', label: 'Mission Resolved', grade: 'B+' };
}

export function createGameplay5NarrativeState({
  runId = 'run',
  mapId = 'grid_bunker',
  missionId = '',
  gameMode = 'survival',
  now = Date.now()
} = {}) {
  const story = storyForMap(mapId);
  const active = !isPvpMode(gameMode);
  return {
    patch: GAMEPLAY5_PATCH,
    schema: GAMEPLAY5_SCHEMA,
    runId: cleanText(runId, 'run', 160),
    mapId: cleanText(mapId, 'grid_bunker', 80).toLowerCase(),
    missionId: cleanText(missionId, '', 100),
    operationId: story.operationId,
    title: story.title,
    commandSource: story.source,
    gameMode: cleanText(gameMode, 'survival', 40).toLowerCase(),
    active,
    pvpExcluded: true,
    hostAuthoritative: true,
    status: active ? GAMEPLAY5_STATUS.ACTIVE : GAMEPLAY5_STATUS.INACTIVE,
    currentStageIndex: 0,
    currentStageType: '',
    currentStageLabel: '',
    branchId: GAMEPLAY5_BRANCH.UNRESOLVED,
    branchLabel: 'UNRESOLVED',
    consequenceText: '',
    riskChoice: 'PENDING',
    outcomeId: '',
    outcomeLabel: '',
    outcomeGrade: '',
    currentTransmission: null,
    transmissions: [],
    transmissionSerial: 0,
    seenKeys: [],
    mutationSignature: '',
    gameplay3Revision: 0,
    bossPhase: 0,
    bossStatus: 'PENDING',
    completionId: null,
    completedAt: 0,
    failedAt: 0,
    updatedAt: integer(now, Date.now())
  };
}

export function normalizeGameplay5NarrativeState(value = {}, now = Date.now()) {
  const base = createGameplay5NarrativeState({
    runId: value.runId,
    mapId: value.mapId,
    missionId: value.missionId,
    gameMode: value.gameMode,
    now
  });
  const state = {
    ...base,
    ...clone(value),
    patch: GAMEPLAY5_PATCH,
    schema: GAMEPLAY5_SCHEMA,
    active: value.active === true && !isPvpMode(value.gameMode || base.gameMode),
    pvpExcluded: true,
    hostAuthoritative: true,
    currentStageIndex: integer(value.currentStageIndex, base.currentStageIndex, 0, 20),
    branchId: Object.values(GAMEPLAY5_BRANCH).includes(value.branchId)
      ? value.branchId
      : GAMEPLAY5_BRANCH.UNRESOLVED,
    transmissions: Array.isArray(value.transmissions)
      ? clone(value.transmissions).slice(-MAX_TRANSMISSIONS)
      : [],
    seenKeys: Array.isArray(value.seenKeys)
      ? value.seenKeys.map((entry) => cleanText(entry, '', 180)).filter(Boolean).slice(-MAX_DEDUPE_KEYS)
      : [],
    transmissionSerial: integer(value.transmissionSerial, 0, 0),
    gameplay3Revision: integer(value.gameplay3Revision, 0, 0),
    bossPhase: integer(value.bossPhase, 0, 0, 3),
    updatedAt: integer(value.updatedAt, now)
  };
  if (!state.active && isPvpMode(state.gameMode)) state.status = GAMEPLAY5_STATUS.INACTIVE;
  return state;
}

function narrativeTransmission(state, story, {
  key,
  cue = GAMEPLAY5_CUE.OBJECTIVE,
  title = '',
  body = '',
  source = story.source,
  durationMs = DEFAULT_DURATION_MS,
  at = Date.now()
} = {}) {
  const normalizedKey = cleanText(key, '', 180);
  if (!normalizedKey || state.seenKeys.includes(normalizedKey)) return null;
  state.seenKeys.push(normalizedKey);
  state.seenKeys = state.seenKeys.slice(-MAX_DEDUPE_KEYS);
  state.transmissionSerial += 1;
  const transmission = {
    transmissionId: `${state.runId}:gameplay5:${state.transmissionSerial}`,
    key: normalizedKey,
    cue,
    source: cleanText(source, story.source, 60).toUpperCase(),
    title: cleanText(title, story.title, 100),
    body: cleanText(body, '', 260),
    startedAt: integer(at, Date.now()),
    expiresAt: integer(at, Date.now()) + integer(durationMs, DEFAULT_DURATION_MS, 2500, 20000)
  };
  state.currentTransmission = transmission;
  state.transmissions.push(transmission);
  state.transmissions = state.transmissions.slice(-MAX_TRANSMISSIONS);
  return transmission;
}

export class Gameplay5NarrativeDirector {
  constructor(value = null) {
    this.state = normalizeGameplay5NarrativeState(value || createGameplay5NarrativeState());
    this.pendingEvents = [];
  }

  reset(details = {}) {
    this.state = createGameplay5NarrativeState(details);
    this.pendingEvents.length = 0;
    if (!this.state.active) return this.getSnapshot(details.now);
    const story = storyForMap(this.state.mapId);
    const transmission = narrativeTransmission(this.state, story, {
      key: 'briefing',
      cue: GAMEPLAY5_CUE.BRIEFING,
      title: story.title,
      body: story.premise,
      source: story.source,
      durationMs: 12000,
      at: details.now
    });
    if (transmission) this.pendingEvents.push({ type: 'GAMEPLAY5_TRANSMISSION', transmission: clone(transmission) });
    this.pendingEvents.push({
      type: 'GAMEPLAY5_OPERATION_ASSIGNED',
      operationId: this.state.operationId,
      title: this.state.title,
      at: this.state.updatedAt
    });
    return this.getSnapshot(details.now);
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (isPvpMode(this.state.gameMode)) return false;
    if (!snapshot || snapshot.patch !== GAMEPLAY5_PATCH) return false;
    if (integer(snapshot.schema, 0) !== GAMEPLAY5_SCHEMA) return false;
    if (this.state.runId && snapshot.runId && this.state.runId !== snapshot.runId) return false;
    this.state = normalizeGameplay5NarrativeState(snapshot, now);
    return true;
  }

  setBranch(branchId, now = Date.now()) {
    if (!this.state.active || !Object.values(GAMEPLAY5_BRANCH).includes(branchId)) return false;
    if (branchId === GAMEPLAY5_BRANCH.UNRESOLVED || this.state.branchId === branchId) return false;
    const story = storyForMap(this.state.mapId);
    this.state.branchId = branchId;
    this.state.branchLabel = branchId === GAMEPLAY5_BRANCH.ASSET_SECURED
      ? 'SUPPORT ASSET SECURED'
      : 'SUPPORT ASSET LOST';
    this.state.consequenceText = branchId === GAMEPLAY5_BRANCH.ASSET_SECURED
      ? story.secured
      : story.lost;
    const transmission = narrativeTransmission(this.state, story, {
      key: `branch:${branchId}`,
      cue: GAMEPLAY5_CUE.CONSEQUENCE,
      title: this.state.branchLabel,
      body: this.state.consequenceText,
      durationMs: 10000,
      at: now
    });
    if (transmission) {
      this.pendingEvents.push({
        type: 'GAMEPLAY5_BRANCH_RESOLVED',
        branchId,
        consequenceText: this.state.consequenceText,
        transmission: clone(transmission),
        at: integer(now, Date.now())
      });
    }
    return Boolean(transmission);
  }

  observeMission(mission = null, now = Date.now()) {
    if (!this.state.active || !mission) return false;
    const story = storyForMap(this.state.mapId);
    const timestamp = integer(now, Date.now());
    this.state.missionId = cleanText(mission.missionId, this.state.missionId, 100);
    this.state.riskChoice = cleanText(mission.riskChoice, this.state.riskChoice, 24).toUpperCase();

    const branch = branchFromMission(mission);
    if (branch !== GAMEPLAY5_BRANCH.UNRESOLVED) this.setBranch(branch, timestamp);

    const stageIndex = integer(mission.currentStageIndex, this.state.currentStageIndex, 0, 20);
    const stage = Array.isArray(mission.stages) ? mission.stages[stageIndex] : null;
    this.state.currentStageIndex = stageIndex;
    this.state.currentStageType = cleanText(stage?.type, '', 32).toUpperCase();
    this.state.currentStageLabel = cleanText(stage?.label, '', 100);

    const stageStory = story.stages[Math.min(stageIndex, story.stages.length - 1)] || story.stages[0];
    const stageKey = `stage:${stageIndex}:${cleanText(stage?.status, 'ACTIVE', 24)}:${this.state.branchId}`;
    const transmission = narrativeTransmission(this.state, story, {
      key: stageKey,
      cue: stageIndex === 4 ? GAMEPLAY5_CUE.BOSS : GAMEPLAY5_CUE.OBJECTIVE,
      title: stageStory.title,
      body: stageStory.body,
      source: stageStory.source,
      durationMs: stageIndex === 4 ? 11000 : 8500,
      at: timestamp
    });
    if (transmission) this.pendingEvents.push({ type: 'GAMEPLAY5_TRANSMISSION', transmission: clone(transmission), at: timestamp });

    if (mission.status === 'COMPLETE' && this.state.status !== GAMEPLAY5_STATUS.COMPLETE) {
      const outcome = outcomeFor(this.state, mission);
      this.state.status = GAMEPLAY5_STATUS.COMPLETE;
      this.state.outcomeId = outcome.id;
      this.state.outcomeLabel = outcome.label;
      this.state.outcomeGrade = outcome.grade;
      this.state.completedAt = timestamp;
      this.state.completionId = `${this.state.runId}:${this.state.operationId}:gameplay5:${outcome.id}`;
      const debrief = narrativeTransmission(this.state, story, {
        key: `complete:${outcome.id}`,
        cue: GAMEPLAY5_CUE.DEBRIEF,
        title: `${outcome.label} · ${outcome.grade}`,
        body: story.complete,
        durationMs: 14000,
        at: timestamp
      });
      this.pendingEvents.push({
        type: 'GAMEPLAY5_OPERATION_COMPLETED',
        outcome: clone(outcome),
        completionId: this.state.completionId,
        transmission: clone(debrief),
        at: timestamp
      });
    } else if (mission.status === 'FAILED' && this.state.status !== GAMEPLAY5_STATUS.FAILED) {
      this.state.status = GAMEPLAY5_STATUS.FAILED;
      this.state.failedAt = timestamp;
      const failure = narrativeTransmission(this.state, story, {
        key: 'failed',
        cue: GAMEPLAY5_CUE.FAILURE,
        title: 'OPERATION FAILED',
        body: story.failed,
        durationMs: 12000,
        at: timestamp
      });
      this.pendingEvents.push({
        type: 'GAMEPLAY5_OPERATION_FAILED',
        transmission: clone(failure),
        at: timestamp
      });
    }

    this.state.updatedAt = timestamp;
    return true;
  }

  observeWorldState({ gameplay2 = null, gameplay3 = null, gameplay4 = null } = {}, now = Date.now()) {
    if (!this.state.active) return false;
    const story = storyForMap(this.state.mapId);
    const timestamp = integer(now, Date.now());
    let changed = false;

    const mutationSignature = Array.isArray(gameplay2?.activeMutations)
      ? gameplay2.activeMutations.map((entry) => `${entry?.id || ''}:${integer(entry?.level, 1, 1, 9)}`).sort().join('|')
      : '';
    if (mutationSignature && mutationSignature !== this.state.mutationSignature) {
      this.state.mutationSignature = mutationSignature;
      const transmission = narrativeTransmission(this.state, story, {
        key: `mutation:${mutationSignature}`,
        cue: GAMEPLAY5_CUE.WORLD,
        title: 'ARENA CONDITIONS SHIFTING',
        body: 'Environmental pressure has changed. Adapt the operation route and preserve the objective.',
        durationMs: 7000,
        at: timestamp
      });
      if (transmission) this.pendingEvents.push({ type: 'GAMEPLAY5_TRANSMISSION', transmission: clone(transmission), at: timestamp });
      changed = true;
    }

    const revision = integer(gameplay3?.revision, 0, 0);
    if (revision > this.state.gameplay3Revision) {
      this.state.gameplay3Revision = revision;
      const transmission = narrativeTransmission(this.state, story, {
        key: `map-revision:${revision}`,
        cue: GAMEPLAY5_CUE.WORLD,
        title: 'ROUTE STATE UPDATED',
        body: 'The arena layout has changed. Control reports a new route, hazard, or defensive position.',
        durationMs: 7000,
        at: timestamp
      });
      if (transmission) this.pendingEvents.push({ type: 'GAMEPLAY5_TRANSMISSION', transmission: clone(transmission), at: timestamp });
      changed = true;
    }

    const bossPhase = integer(gameplay4?.phase, 0, 0, 3);
    const bossStatus = cleanText(gameplay4?.status, 'PENDING', 24).toUpperCase();
    if (bossStatus === 'ACTIVE' && bossPhase > 0 && bossPhase !== this.state.bossPhase) {
      this.state.bossPhase = bossPhase;
      this.state.bossStatus = bossStatus;
      const transmission = narrativeTransmission(this.state, story, {
        key: `boss-phase:${bossPhase}`,
        cue: GAMEPLAY5_CUE.BOSS,
        title: `BOSS PHASE ${bossPhase}`,
        body: bossPhase >= 3
          ? 'Target defenses are failing. Commit to the final vulnerability window.'
          : 'Target behavior has changed. Read the telegraph before committing damage.',
        durationMs: 7500,
        at: timestamp
      });
      if (transmission) this.pendingEvents.push({ type: 'GAMEPLAY5_TRANSMISSION', transmission: clone(transmission), at: timestamp });
      changed = true;
    } else if (bossStatus !== this.state.bossStatus) {
      this.state.bossStatus = bossStatus;
      changed = true;
    }

    this.state.updatedAt = timestamp;
    return changed;
  }

  update(now = Date.now(), context = {}) {
    if (!this.state.active) return this.getSnapshot(now);
    this.observeMission(context.mission, now);
    this.observeWorldState(context, now);
    this.state.updatedAt = integer(now, Date.now());
    return this.getSnapshot(now);
  }

  getObjectiveTuning(mission = null) {
    const stageType = cleanText(
      mission?.stages?.[mission?.currentStageIndex]?.type || this.state.currentStageType,
      '',
      32
    ).toUpperCase();
    const consequentialStage = ['DEFEND', 'EXTRACT'].includes(stageType);
    if (!consequentialStage) {
      return freezeClone({
        branchId: this.state.branchId,
        targetScale: 1,
        rewardScale: 1,
        descriptionSuffix: ''
      });
    }
    if (this.state.branchId === GAMEPLAY5_BRANCH.ASSET_SECURED) {
      return freezeClone({
        branchId: this.state.branchId,
        targetScale: 0.9,
        rewardScale: 1.08,
        descriptionSuffix: 'NARRATIVE OUTCOME: SUPPORT ASSET SECURED.'
      });
    }
    if (this.state.branchId === GAMEPLAY5_BRANCH.ASSET_LOST) {
      return freezeClone({
        branchId: this.state.branchId,
        targetScale: 1.12,
        rewardScale: 1.12,
        descriptionSuffix: 'NARRATIVE OUTCOME: SUPPORT ASSET LOST; EXPECT HEAVIER RESISTANCE.'
      });
    }
    return freezeClone({
      branchId: this.state.branchId,
      targetScale: 1,
      rewardScale: 1,
      descriptionSuffix: ''
    });
  }

  consumeEvents() {
    const events = this.pendingEvents.map(clone);
    this.pendingEvents.length = 0;
    return events;
  }

  getSnapshot(now = Date.now()) {
    return freezeClone(normalizeGameplay5NarrativeState({
      ...this.state,
      updatedAt: integer(now, Date.now())
    }, now));
  }
}

export function computeGameplay5NarrativeReward(snapshot = {}) {
  if (snapshot.status !== GAMEPLAY5_STATUS.COMPLETE || !snapshot.completionId) return 0;
  const branchBonus = snapshot.branchId === GAMEPLAY5_BRANCH.ASSET_SECURED ? 100 : 40;
  const outcomeBonus = snapshot.outcomeId === 'DECISIVE_VICTORY'
    ? 160
    : (snapshot.outcomeId === 'CLEAN_EXTRACTION' ? 120 : 80);
  return 180 + branchBonus + outcomeBonus;
}

export function getGameplay5NarrativeDefinition(mapId) {
  return clone(storyForMap(mapId));
}
