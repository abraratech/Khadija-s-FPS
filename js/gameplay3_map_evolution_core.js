// js/gameplay3_map_evolution_core.js
// GAMEPLAY.3 R1 — deterministic, host-authoritative interactive map evolution.

export const GAMEPLAY3_PATCH = 'gameplay3-r1-interactive-evolving-maps';
export const GAMEPLAY3_SCHEMA = 1;
export const GAMEPLAY3_STAGE_WAVES = Object.freeze([4, 7, 10]);
export const GAMEPLAY3_SUPPORTED_MAPS = Object.freeze([
  'grid_bunker',
  'industrial_yard',
  'hospital_wing',
  'stormbreak_canal'
]);

const CONTROL_ACTIVE_MS = 20000;
const CONTROL_COOLDOWN_MS = 45000;
const HAZARD_IDLE_MS = 7000;
const HAZARD_WARNING_MS = 2600;
const HAZARD_ACTIVE_MS = 4200;
const HAZARD_CYCLE_MS = HAZARD_IDLE_MS + HAZARD_WARNING_MS + HAZARD_ACTIVE_MS;

const MAP_PROFILES = Object.freeze({
  grid_bunker: Object.freeze({
    mapId: 'grid_bunker',
    label: 'BUNKER LOCKDOWN',
    control: Object.freeze({
      id: 'grid_lockdown_override',
      kind: 'LOCKDOWN_OVERRIDE',
      label: 'LOCKDOWN OVERRIDE',
      x: 0,
      z: -12,
      radius: 3.2
    }),
    // Aligned to the actual breakable-wall entrance columns (col 2 / col 7 -> x=-15/x=15)
    // in GRID_BUNKER_LAYOUT, so the shutter visually plugs the doorway instead of
    // floating one tile inside the room.
    routeA: Object.freeze({ id: 'grid_shutter_west', x: -15, z: 0, w: 1.25, h: 3.3, d: 8.5 }),
    routeB: Object.freeze({ id: 'grid_shutter_east', x: 15, z: 0, w: 1.25, h: 3.3, d: 8.5 }),
    cover: Object.freeze({ id: 'grid_cover', x: 0, z: 13.5, w: 8.5, h: 1.7, d: 1.35 }),
    // Recentered to the row-1 corridor lane (z=21) and radius reduced from 4.4 to 2.6
    // (diameter 5.2) so it fits inside the 6-unit-wide lane instead of a radius-4.4
    // circle (8.8 diameter) that clipped the boundary wall on one side and the row-2
    // interior wall on the other no matter where it was centered.
    hazard: Object.freeze({ id: 'grid_arc_floor', x: 0, z: 21, radius: 2.6, damage: 7 }),
    phaseLabels: Object.freeze([
      'STANDARD CONTAINMENT',
      'LOCKDOWN SHIFT',
      'EMERGENCY ROUTING',
      'CRITICAL LOCKDOWN'
    ])
  }),
  industrial_yard: Object.freeze({
    mapId: 'industrial_yard',
    label: 'YARD CRANE SHIFT',
    control: Object.freeze({
      id: 'yard_crane_override',
      kind: 'CRANE_OVERRIDE',
      label: 'CRANE ROUTE CONTROL',
      x: -20,
      z: 0,
      radius: 3.4
    }),
    routeA: Object.freeze({ id: 'yard_crane_gate_north', x: 0, z: -12, w: 13, h: 2.8, d: 1.3 }),
    routeB: Object.freeze({ id: 'yard_crane_gate_south', x: 0, z: 12, w: 13, h: 2.8, d: 1.3 }),
    cover: Object.freeze({ id: 'yard_crane_cover', x: 18, z: 0, w: 1.5, h: 2.0, d: 9.5 }),
    // Moved from (0,0) — that exact point is one of the three playerSpawnPoints
    // (confirmed by running buildIndustrialYard() and reading the real spawn
    // coordinates), so the hazard was dealing damage on top of a respawn location.
    // Recentered to (0,7) and radius trimmed 5.2->3.5, which clears the spawn point
    // by a 3.5-unit margin and still sits clean of routeB's gate geometry.
    hazard: Object.freeze({ id: 'yard_fuel_spill', x: 0, z: 7, radius: 3.5, damage: 8 }),
    phaseLabels: Object.freeze([
      'YARD FLOW STABLE',
      'CRANE SHIFT',
      'FUEL-LINE PRESSURE',
      'HEAVY LIFT CYCLE'
    ])
  }),
  stormbreak_canal: Object.freeze({
    mapId: 'stormbreak_canal',
    label: 'FLOODGATE SHIFT',
    control: Object.freeze({
      id: 'stormbreak_flood_override',
      kind: 'FLOOD_OVERRIDE',
      label: 'FLOODGATE ROUTE CONTROL',
      x: 0,
      z: -17,
      radius: 3.4
    }),
    routeA: Object.freeze({ id: 'stormbreak_gate_west', x: -18, z: -31, w: 9, h: 3.6, d: 1.2 }),
    routeB: Object.freeze({ id: 'stormbreak_gate_east', x: 18, z: 31, w: 9, h: 3.6, d: 1.2 }),
    cover: Object.freeze({ id: 'stormbreak_pump_cover', x: 0, z: 17, w: 18, h: 1.7, d: 3.2 }),
    hazard: Object.freeze({ id: 'stormbreak_arc_channel', x: 0, z: 0, radius: 5.0, damage: 8 }),
    phaseLabels: Object.freeze([
      'CANAL FLOW STABLE',
      'FLOODGATE SHIFT',
      'PUMP SURGE',
      'STORMBREAK OVERRIDE'
    ])
  }),
  hospital_wing: Object.freeze({
    mapId: 'hospital_wing',
    label: 'QUARANTINE SHIFT',
    control: Object.freeze({
      id: 'hospital_power_override',
      kind: 'POWER_OVERRIDE',
      label: 'EMERGENCY POWER CONTROL',
      // Shifted 3 units east (x:-30 -> x:-27). Traced to source: the original
      // radius overlapped the reception-desk cover block
      // (spawnBlock(7.0, 1.05, 2.0, -34, 0.52, 0, deskColor, true, false)),
      // a real solid object, not decoration.
      x: -27,
      z: 0,
      radius: 3.2
    }),
    routeA: Object.freeze({ id: 'hospital_shutter_north', x: -8, z: 0, w: 1.2, h: 3.2, d: 9.0 }),
    routeB: Object.freeze({ id: 'hospital_shutter_south', x: 8, z: 0, w: 1.2, h: 3.2, d: 9.0 }),
    cover: Object.freeze({ id: 'hospital_triage_cover', x: 0, z: 18, w: 8.0, h: 1.65, d: 1.3 }),
    // Moved from (0,-18) to (-14,-18). Traced to source: x:0 sits exactly on one
    // of the six "cross-ward room separator" walls (spawnBlock at x:0, z:-22,
    // w:1.0, d:14 -> spans z:-29 to z:-15, which contains z:-18), so the hazard's
    // center point was embedded inside a real wall rather than open floor.
    // (-14,-18) sits inside the ward room between the x:-28 and x:0 separators.
    hazard: Object.freeze({ id: 'hospital_contamination_zone', x: -14, z: -18, radius: 4.7, damage: 7 }),
    phaseLabels: Object.freeze([
      'QUARANTINE STABLE',
      'WARD LOCKDOWN',
      'POWER INSTABILITY',
      'CRITICAL QUARANTINE'
    ])
  })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  return Math.floor(finite(value, fallback));
}

function cleanText(value, fallback = '', max = 160) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, max);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hashText(text) {
  let hash = 2166136261 >>> 0;
  const source = String(text || '');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function normalizeGameMode(value) {
  const mode = cleanText(value, 'survival', 40).toLowerCase();
  return mode.includes('pvp') ? 'pvp' : 'survival';
}

function stageIndexForWave(wave) {
  const normalized = Math.max(1, integer(wave, 1));
  if (normalized >= GAMEPLAY3_STAGE_WAVES[2]) return 3;
  if (normalized >= GAMEPLAY3_STAGE_WAVES[1]) return 2;
  if (normalized >= GAMEPLAY3_STAGE_WAVES[0]) return 1;
  return 0;
}

function phaseForCycle(now, startedAt) {
  const elapsed = Math.max(0, finite(now) - finite(startedAt));
  const offset = elapsed % HAZARD_CYCLE_MS;
  if (offset < HAZARD_IDLE_MS) {
    return {
      phase: 'IDLE',
      remainingMs: HAZARD_IDLE_MS - offset
    };
  }
  if (offset < HAZARD_IDLE_MS + HAZARD_WARNING_MS) {
    return {
      phase: 'WARNING',
      remainingMs: HAZARD_IDLE_MS + HAZARD_WARNING_MS - offset
    };
  }
  return {
    phase: 'ACTIVE',
    remainingMs: HAZARD_CYCLE_MS - offset
  };
}

function normalizeProfile(mapId) {
  return MAP_PROFILES[cleanText(mapId, '', 80)] || null;
}

function baseState() {
  return {
    schema: GAMEPLAY3_SCHEMA,
    patch: GAMEPLAY3_PATCH,
    active: false,
    gameMode: 'survival',
    runId: '',
    mapId: '',
    seed: 0,
    wave: 1,
    stageIndex: 0,
    phaseId: 'BASELINE',
    phaseLabel: 'MAP STABLE',
    revision: 0,
    updatedAt: 0,
    stageStartedAt: 0,
    routeVariant: 0,
    defaultRouteVariant: 0,
    overrideActive: false,
    overrideUntil: 0,
    powerOnline: true,
    shutterClosed: false,
    coverDeployed: false,
    control: null,
    hazard: null,
    interactionCount: 0,
    lastActorId: '',
    lastEvent: 'OFFLINE'
  };
}

export function getGameplay3MapProfile(mapId) {
  const profile = normalizeProfile(mapId);
  return profile ? clone(profile) : null;
}

export function isGameplay3SupportedMap(mapId) {
  return Boolean(normalizeProfile(mapId));
}

export class Gameplay3EvolutionDirector {
  constructor() {
    this.state = baseState();
    this.events = [];
  }

  reset({
    runId = '',
    mapId = '',
    gameMode = 'survival',
    now = Date.now()
  } = {}) {
    const profile = normalizeProfile(mapId);
    const normalizedMode = normalizeGameMode(gameMode);
    const active = Boolean(profile && normalizedMode !== 'pvp');
    const seed = hashText(`${cleanText(runId, 'run', 180)}|${cleanText(mapId, '', 80)}|${GAMEPLAY3_PATCH}`);
    const startedAt = Math.max(0, finite(now, Date.now()));
    const routeVariant = seed % 2;

    this.state = {
      ...baseState(),
      active,
      gameMode: normalizedMode,
      runId: cleanText(runId, 'run', 180),
      mapId: cleanText(mapId, '', 80),
      seed,
      routeVariant,
      defaultRouteVariant: routeVariant,
      updatedAt: startedAt,
      stageStartedAt: startedAt,
      control: active && profile ? {
        id: profile.control.id,
        kind: profile.control.kind,
        label: profile.control.label,
        state: active ? 'READY' : 'OFFLINE',
        cooldownUntil: 0,
        activeUntil: 0,
        remainingMs: 0,
        interactionCount: 0
      } : null,
      hazard: active && profile ? {
        enabled: false,
        phase: 'OFFLINE',
        remainingMs: 0,
        cycle: 0,
        x: profile.hazard.x,
        z: profile.hazard.z,
        radius: profile.hazard.radius,
        damage: profile.hazard.damage
      } : null,
      lastEvent: active ? 'MAP EVOLUTION ARMED' : 'OFFLINE'
    };
    this.events.length = 0;
    return this.getSnapshot(startedAt);
  }

  isActive() {
    return this.state.active === true;
  }

  deriveStageState(now = Date.now()) {
    const profile = normalizeProfile(this.state.mapId);
    if (!profile || !this.isActive()) return;

    const stage = Math.max(0, Math.min(3, integer(this.state.stageIndex)));
    const wave = Math.max(1, integer(this.state.wave, 1));
    const alternating = (this.state.seed + wave + stage) % 2;
    this.state.defaultRouteVariant = stage <= 1
      ? this.state.seed % 2
      : alternating;

    const overrideActive = finite(this.state.overrideUntil) > finite(now);
    this.state.overrideActive = overrideActive;
    this.state.routeVariant = overrideActive
      ? 1 - this.state.defaultRouteVariant
      : this.state.defaultRouteVariant;
    this.state.powerOnline = overrideActive || stage === 0 || stage === 3;
    this.state.shutterClosed = stage >= 1 && !overrideActive;
    this.state.coverDeployed = stage >= 2 || overrideActive;

    if (this.state.control) {
      const cooldownRemaining = Math.max(0, finite(this.state.control.cooldownUntil) - finite(now));
      const activeRemaining = Math.max(0, finite(this.state.control.activeUntil) - finite(now));
      this.state.control.remainingMs = Math.max(cooldownRemaining, activeRemaining);
      if (!this.isActive()) this.state.control.state = 'OFFLINE';
      else if (activeRemaining > 0) this.state.control.state = 'ACTIVE';
      else if (cooldownRemaining > 0) this.state.control.state = 'COOLDOWN';
      else this.state.control.state = 'READY';
    }

    if (this.state.hazard) {
      const enabled = stage >= 2;
      this.state.hazard.enabled = enabled;
      if (!enabled) {
        this.state.hazard.phase = 'OFFLINE';
        this.state.hazard.remainingMs = 0;
      } else {
        const cycle = phaseForCycle(now, this.state.stageStartedAt);
        this.state.hazard.phase = cycle.phase;
        this.state.hazard.remainingMs = Math.max(0, Math.round(cycle.remainingMs));
        this.state.hazard.cycle = Math.max(
          0,
          Math.floor((Math.max(0, finite(now) - finite(this.state.stageStartedAt))) / HAZARD_CYCLE_MS)
        );
      }
    }

    this.state.phaseId = ['BASELINE', 'SHIFT_ONE', 'SHIFT_TWO', 'ESCALATION'][stage] || 'BASELINE';
    this.state.phaseLabel = profile.phaseLabels[stage] || profile.label;
    this.state.updatedAt = Math.max(0, finite(now, Date.now()));
  }

  startWave(wave = 1, now = Date.now()) {
    if (!this.isActive()) return this.getSnapshot(now);
    const normalizedWave = Math.max(1, integer(wave, 1));
    const nextStage = stageIndexForWave(normalizedWave);
    const stageChanged = nextStage !== this.state.stageIndex;
    const waveChanged = normalizedWave !== this.state.wave;

    this.state.wave = normalizedWave;
    if (stageChanged) {
      this.state.stageIndex = nextStage;
      this.state.stageStartedAt = Math.max(0, finite(now, Date.now()));
      this.state.overrideUntil = 0;
      this.state.overrideActive = false;
      if (this.state.control) {
        this.state.control.activeUntil = 0;
        this.state.control.cooldownUntil = 0;
        this.state.control.remainingMs = 0;
        this.state.control.state = 'READY';
      }
      this.state.revision += 1;
      this.state.lastEvent = `MAP SHIFT ${nextStage}`;
      this.events.push({
        type: 'GAMEPLAY3_STAGE_CHANGED',
        revision: this.state.revision,
        wave: normalizedWave,
        stageIndex: nextStage,
        phaseLabel: normalizeProfile(this.state.mapId)?.phaseLabels[nextStage] || 'MAP SHIFT'
      });
    } else if (waveChanged && nextStage >= 3) {
      this.state.revision += 1;
      this.state.lastEvent = `ESCALATION WAVE ${normalizedWave}`;
      this.events.push({
        type: 'GAMEPLAY3_ROUTE_ROTATED',
        revision: this.state.revision,
        wave: normalizedWave,
        stageIndex: nextStage
      });
    }

    this.deriveStageState(now);
    return this.getSnapshot(now);
  }

  interact({
    controlId = '',
    actorId = '',
    now = Date.now()
  } = {}) {
    if (!this.isActive()) return { accepted: false, reason: 'OFFLINE' };
    const normalizedId = cleanText(controlId, '', 120);
    if (!this.state.control || normalizedId !== this.state.control.id) {
      return { accepted: false, reason: 'INVALID CONTROL' };
    }

    this.deriveStageState(now);
    if (this.state.control.state !== 'READY') {
      return {
        accepted: false,
        reason: this.state.control.state,
        remainingMs: this.state.control.remainingMs
      };
    }

    const timestamp = Math.max(0, finite(now, Date.now()));
    this.state.overrideUntil = timestamp + CONTROL_ACTIVE_MS;
    this.state.control.activeUntil = this.state.overrideUntil;
    this.state.control.cooldownUntil = timestamp + CONTROL_COOLDOWN_MS;
    this.state.control.interactionCount += 1;
    this.state.interactionCount += 1;
    this.state.lastActorId = cleanText(actorId, 'operator', 160);
    this.state.revision += 1;
    this.state.lastEvent = 'MAP OVERRIDE ACTIVE';
    this.events.push({
      type: 'GAMEPLAY3_OVERRIDE_ACTIVE',
      revision: this.state.revision,
      actorId: this.state.lastActorId,
      controlId: this.state.control.id,
      activeMs: CONTROL_ACTIVE_MS,
      cooldownMs: CONTROL_COOLDOWN_MS
    });
    this.deriveStageState(timestamp);

    return {
      accepted: true,
      revision: this.state.revision,
      activeMs: CONTROL_ACTIVE_MS,
      cooldownMs: CONTROL_COOLDOWN_MS,
      snapshot: this.getSnapshot(timestamp)
    };
  }

  update(now = Date.now()) {
    if (!this.isActive()) return this.getSnapshot(now);
    const previouslyActive = this.state.overrideActive === true;
    const previousHazardPhase = this.state.hazard?.phase || 'OFFLINE';
    this.deriveStageState(now);

    if (previouslyActive && !this.state.overrideActive) {
      this.state.revision += 1;
      this.state.lastEvent = 'MAP OVERRIDE EXPIRED';
      this.events.push({
        type: 'GAMEPLAY3_OVERRIDE_EXPIRED',
        revision: this.state.revision,
        wave: this.state.wave
      });
      this.deriveStageState(now);
    }

    if (previousHazardPhase !== this.state.hazard?.phase) {
      const phase = this.state.hazard?.phase || 'OFFLINE';
      if (['WARNING', 'ACTIVE'].includes(phase)) {
        this.events.push({
          type: phase === 'ACTIVE'
            ? 'GAMEPLAY3_HAZARD_ACTIVE'
            : 'GAMEPLAY3_HAZARD_WARNING',
          revision: this.state.revision,
          phase,
          cycle: this.state.hazard?.cycle || 0
        });
      }
    }

    return this.getSnapshot(now);
  }

  replaceSnapshot(snapshot, now = Date.now()) {
    if (!snapshot || snapshot.patch !== GAMEPLAY3_PATCH) return false;
    if (normalizeGameMode(snapshot.gameMode) === 'pvp') {
      this.state = baseState();
      this.state.gameMode = 'pvp';
      return true;
    }
    const profile = normalizeProfile(snapshot.mapId);
    if (!profile) return false;

    const next = {
      ...baseState(),
      ...clone(snapshot),
      schema: GAMEPLAY3_SCHEMA,
      patch: GAMEPLAY3_PATCH,
      active: snapshot.active === true,
      gameMode: 'survival',
      runId: cleanText(snapshot.runId, 'run', 180),
      mapId: profile.mapId,
      seed: Math.max(0, integer(snapshot.seed)),
      wave: Math.max(1, integer(snapshot.wave, 1)),
      stageIndex: Math.max(0, Math.min(3, integer(snapshot.stageIndex))),
      revision: Math.max(0, integer(snapshot.revision)),
      updatedAt: Math.max(0, finite(snapshot.updatedAt, now)),
      stageStartedAt: Math.max(0, finite(snapshot.stageStartedAt, now)),
      overrideUntil: Math.max(0, finite(snapshot.overrideUntil)),
      control: snapshot.control ? {
        id: profile.control.id,
        kind: profile.control.kind,
        label: profile.control.label,
        state: cleanText(snapshot.control.state, 'READY', 30).toUpperCase(),
        cooldownUntil: Math.max(0, finite(snapshot.control.cooldownUntil)),
        activeUntil: Math.max(0, finite(snapshot.control.activeUntil)),
        remainingMs: Math.max(0, finite(snapshot.control.remainingMs)),
        interactionCount: Math.max(0, integer(snapshot.control.interactionCount))
      } : null,
      hazard: snapshot.hazard ? {
        enabled: snapshot.hazard.enabled === true,
        phase: cleanText(snapshot.hazard.phase, 'OFFLINE', 30).toUpperCase(),
        remainingMs: Math.max(0, finite(snapshot.hazard.remainingMs)),
        cycle: Math.max(0, integer(snapshot.hazard.cycle)),
        x: finite(snapshot.hazard.x, profile.hazard.x),
        z: finite(snapshot.hazard.z, profile.hazard.z),
        radius: Math.max(2, finite(snapshot.hazard.radius, profile.hazard.radius)),
        damage: Math.max(1, finite(snapshot.hazard.damage, profile.hazard.damage))
      } : null
    };

    this.state = next;
    this.events.length = 0;
    this.deriveStageState(now);
    return true;
  }

  consumeEvents() {
    if (this.events.length === 0) return [];
    return this.events.splice(0, this.events.length).map(clone);
  }

  getSnapshot(now = Date.now()) {
    if (this.isActive()) this.deriveStageState(now);
    const profile = this.isActive()
      ? normalizeProfile(this.state.mapId)
      : null;
    return Object.freeze({
      ...clone(this.state),
      profile: profile ? clone(profile) : null
    });
  }
}

export const GAMEPLAY3_TIMING = Object.freeze({
  controlActiveMs: CONTROL_ACTIVE_MS,
  controlCooldownMs: CONTROL_COOLDOWN_MS,
  hazardIdleMs: HAZARD_IDLE_MS,
  hazardWarningMs: HAZARD_WARNING_MS,
  hazardActiveMs: HAZARD_ACTIVE_MS,
  hazardCycleMs: HAZARD_CYCLE_MS
});