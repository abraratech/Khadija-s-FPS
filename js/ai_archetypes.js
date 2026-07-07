// js/ai_archetypes.js
// C10.8 — Enemy Archetype Identity
//
// Adds bounded, type-specific behavior without changing enemy health, damage,
// base movement speed, wave totals, or the Director intensity ceiling.
//
// The module owns short-lived identity states only:
// - Runner burst pressure
// - Spitter relocation after firing
// - Brute stagger resistance and brace recovery
// - Goliath health phases
// - Exploder primed/critical warning stages

const RUNNER_BURST_MIN_WAVE = 4;
const MAX_RUNNER_BURSTS = 2;
const RUNNER_BURST_DURATION = 0.58;
const RUNNER_BURST_MIN_DISTANCE = 4.8;
const RUNNER_BURST_MAX_DISTANCE = 12.5;
const SPITTER_REPOSITION_DURATION = 1.18;
const BRUTE_BRACE_DURATION = 0.38;
const GOLIATH_PHASE_PULSE_DURATION = 1.10;

const state = {
  runActive: false,
  mapId: 'unknown',
  wave: 1,
  activeRunnerBursts: 0,
  runnerBurstsStarted: 0,
  spitterRepositioning: 0,
  spitterRepositions: 0,
  bruteBracing: 0,
  bruteResists: 0,
  goliathPhase: 0,
  goliathPhaseTransitions: 0,
  exploderPrimed: 0,
  exploderCritical: 0,
  lastEvent: 'NONE'
};

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isLiving(enemy) {
  return Boolean(enemy?.alive && enemy.dyingT < 0 && enemy.mesh?.visible !== false);
}

function getEnemySeed(enemy) {
  const seed = Number(enemy?.squadSeed);
  if (Number.isFinite(seed)) return clamp(seed);

  const id = Math.max(1, Math.round(Number(enemy?.squadId) || 1));
  return ((id * 9301 + 49297) % 233280) / 233280;
}

function setEnemyEvent(enemy, eventName, cooldown = 0.35) {
  if (!enemy || (enemy.archetypeEventCooldown || 0) > 0) return false;
  enemy.archetypeEvent = eventName;
  enemy.archetypeEventCooldown = Math.max(0.05, cooldown);
  state.lastEvent = eventName;
  return true;
}

function ensureEnemyState(enemy) {
  if (!enemy || enemy.archetypeInitialized) return;
  registerArchetypeEnemy(enemy);
}

function getGoliathPhase(enemy) {
  if (enemy?.type !== 'GOLIATH') return 0;

  const maxHealth = Math.max(1, finite(enemy.maxHealth, 1));
  const healthRatio = clamp(finite(enemy.health, maxHealth) / maxHealth);

  if (healthRatio <= 0.33) return 3;
  if (healthRatio <= 0.66) return 2;
  return 1;
}

function updateHitIdentity(enemy) {
  const hitAt = finite(enemy.lastHitAt);
  if (hitAt <= finite(enemy.archetypeLastHitAt)) return;
  enemy.archetypeLastHitAt = hitAt;

  const damage = Math.max(0, finite(enemy.lastHitDamage));

  if (enemy.type === 'BRUTE' && damage >= 16) {
    enemy.bruteBraceT = Math.max(enemy.bruteBraceT || 0, BRUTE_BRACE_DURATION);
    enemy.bruteBraceDuration = BRUTE_BRACE_DURATION;
    state.bruteResists++;
    setEnemyEvent(enemy, 'BRUTE_BRACE', 0.62);
  } else if (enemy.type === 'GOLIATH' && damage >= 28) {
    enemy.bruteBraceT = Math.max(enemy.bruteBraceT || 0, 0.26);
    enemy.bruteBraceDuration = 0.26;
  }
}

function updateRunner(enemy, dt, player, activeBurstCount) {
  enemy.runnerBurstCooldown = Math.max(0, finite(enemy.runnerBurstCooldown) - dt);
  enemy.runnerBurstT = Math.max(0, finite(enemy.runnerBurstT) - dt);

  if (enemy.runnerBurstT > 0) {
    return true;
  }

  if (
    state.wave < RUNNER_BURST_MIN_WAVE ||
    activeBurstCount >= MAX_RUNNER_BURSTS ||
    enemy.runnerBurstCooldown > 0 ||
    enemy.attackState === 'WINDUP' ||
    enemy.attackState === 'QUEUED' ||
    !player?.alive
  ) {
    return false;
  }

  const dx = finite(player.pos?.x) - finite(enemy.mesh?.position?.x);
  const dz = finite(player.pos?.z) - finite(enemy.mesh?.position?.z);
  const horizontal = Math.hypot(dx, dz);
  const vertical = Math.abs(
    finite(player.pos?.y) - finite(enemy.mesh?.position?.y)
  );

  if (
    horizontal < RUNNER_BURST_MIN_DISTANCE ||
    horizontal > RUNNER_BURST_MAX_DISTANCE ||
    vertical > 1.9
  ) {
    return false;
  }

  enemy.runnerBurstDuration = RUNNER_BURST_DURATION;
  enemy.runnerBurstT = RUNNER_BURST_DURATION;
  enemy.runnerBurstCooldown = 3.15 + getEnemySeed(enemy) * 1.45;
  state.runnerBurstsStarted++;
  setEnemyEvent(enemy, 'RUNNER_BURST', 0.45);
  return true;
}

function updateGoliath(enemy, dt) {
  const nextPhase = getGoliathPhase(enemy);
  const previousPhase = Math.max(1, Math.round(finite(enemy.goliathPhase, 1)));

  if (nextPhase > previousPhase) {
    enemy.goliathPhase = nextPhase;
    enemy.goliathPhasePulseT = GOLIATH_PHASE_PULSE_DURATION;
    enemy.goliathPhasePulseDuration = GOLIATH_PHASE_PULSE_DURATION;
    state.goliathPhaseTransitions++;
    setEnemyEvent(enemy, `GOLIATH_PHASE_${nextPhase}`, 0.75);
  } else {
    enemy.goliathPhase = nextPhase;
  }

  enemy.goliathPhasePulseT = Math.max(
    0,
    finite(enemy.goliathPhasePulseT) - dt
  );

  state.goliathPhase = Math.max(state.goliathPhase, nextPhase);
}

function updateExploderStage(enemy) {
  if (
    enemy.type !== 'EXPLODER' ||
    enemy.attackKind !== 'EXPLODER' ||
    enemy.attackState !== 'WINDUP'
  ) {
    enemy.exploderStage = 'IDLE';
    return;
  }

  const progress = clamp(enemy.attackTelegraphProgress);

  if (progress >= 0.62) {
    enemy.exploderStage = 'CRITICAL';
    state.exploderCritical++;
  } else {
    enemy.exploderStage = 'PRIMED';
    state.exploderPrimed++;
  }
}

export function resetAIArchetypeRun({ mapId = 'unknown' } = {}) {
  state.runActive = true;
  state.mapId = String(mapId || 'unknown');
  state.wave = 1;
  state.activeRunnerBursts = 0;
  state.runnerBurstsStarted = 0;
  state.spitterRepositioning = 0;
  state.spitterRepositions = 0;
  state.bruteBracing = 0;
  state.bruteResists = 0;
  state.goliathPhase = 0;
  state.goliathPhaseTransitions = 0;
  state.exploderPrimed = 0;
  state.exploderCritical = 0;
  state.lastEvent = 'RESET';
}

export function endAIArchetypeRun() {
  state.runActive = false;
  state.activeRunnerBursts = 0;
  state.spitterRepositioning = 0;
  state.bruteBracing = 0;
  state.exploderPrimed = 0;
  state.exploderCritical = 0;
  state.lastEvent = 'ENDED';
}

export function beginAIArchetypeWave(waveNumber) {
  state.wave = Math.max(1, Math.round(finite(waveNumber, 1)));
  state.lastEvent = `WAVE ${state.wave}`;
}

export function registerArchetypeEnemy(enemy) {
  if (!enemy) return;

  const seed = getEnemySeed(enemy);
  enemy.archetypeInitialized = true;
  enemy.archetypeEvent = 'NONE';
  enemy.archetypeEventCooldown = 0;
  enemy.archetypeLastHitAt = finite(enemy.lastHitAt);
  enemy.runnerBurstT = 0;
  enemy.runnerBurstDuration = RUNNER_BURST_DURATION;
  enemy.runnerBurstCooldown = 1.15 + seed * 1.85;
  enemy.spitterRepositionT = 0;
  enemy.spitterRepositionDuration = SPITTER_REPOSITION_DURATION;
  enemy.spitterRepositionSide = seed < 0.5 ? -1 : 1;
  enemy.spitterRepositionCount = 0;
  enemy.bruteBraceT = 0;
  enemy.bruteBraceDuration = BRUTE_BRACE_DURATION;
  enemy.goliathPhase = enemy.type === 'GOLIATH' ? 1 : 0;
  enemy.goliathPhasePulseT = 0;
  enemy.goliathPhasePulseDuration = GOLIATH_PHASE_PULSE_DURATION;
  enemy.exploderStage = 'IDLE';
}

export function updateAIArchetypeCoordinator(dt, {
  enemies = [],
  player = null
} = {}) {
  if (!state.runActive) return;

  const safeDt = clamp(dt, 0, 0.05);
  let activeRunnerBursts = 0;

  state.activeRunnerBursts = 0;
  state.spitterRepositioning = 0;
  state.bruteBracing = 0;
  state.goliathPhase = 0;
  state.exploderPrimed = 0;
  state.exploderCritical = 0;

  for (const enemy of enemies || []) {
    if (!isLiving(enemy)) continue;
    ensureEnemyState(enemy);

    enemy.archetypeEventCooldown = Math.max(
      0,
      finite(enemy.archetypeEventCooldown) - safeDt
    );
    enemy.spitterRepositionT = Math.max(
      0,
      finite(enemy.spitterRepositionT) - safeDt
    );
    enemy.bruteBraceT = Math.max(
      0,
      finite(enemy.bruteBraceT) - safeDt
    );

    updateHitIdentity(enemy);

    if (enemy.type === 'RUNNER') {
      if (updateRunner(enemy, safeDt, player, activeRunnerBursts)) {
        activeRunnerBursts++;
      }
    } else if (enemy.type === 'RANGED' && enemy.spitterRepositionT > 0) {
      state.spitterRepositioning++;
    } else if (enemy.type === 'BRUTE' && enemy.bruteBraceT > 0) {
      state.bruteBracing++;
    } else if (enemy.type === 'GOLIATH') {
      updateGoliath(enemy, safeDt);
    }

    updateExploderStage(enemy);
  }

  state.activeRunnerBursts = activeRunnerBursts;
}

export function recordArchetypeAttackCommitted(enemy, kind = 'NONE') {
  if (!enemy) return;

  if (kind === 'RANGED' && enemy.type === 'RANGED') {
    enemy.spitterRepositionDuration = SPITTER_REPOSITION_DURATION;
    enemy.spitterRepositionT = SPITTER_REPOSITION_DURATION;
    enemy.spitterRepositionCount = finite(enemy.spitterRepositionCount) + 1;
    enemy.spitterRepositionSide *= -1;
    state.spitterRepositions++;
    setEnemyEvent(enemy, 'SPITTER_REPOSITION', 0.40);
  }

  if (kind === 'EXPLODER') {
    state.lastEvent = 'EXPLODER DETONATED';
  }
}

export function getArchetypeMovementScale(enemy) {
  if (!enemy) return 1;

  let scale = 1;

  if (enemy.type === 'RUNNER' && enemy.runnerBurstT > 0) {
    scale *= 1.32;
  }

  if (enemy.type === 'RANGED' && enemy.spitterRepositionT > 0) {
    scale *= 1.18;
  }

  if (enemy.type === 'BRUTE' && enemy.bruteBraceT > 0) {
    scale *= 0.82;
  }

  if (enemy.type === 'GOLIATH') {
    if (enemy.goliathPhase >= 3) scale *= 1.12;
    else if (enemy.goliathPhase >= 2) scale *= 1.06;
  }

  return clamp(scale, 0.72, 1.35);
}

export function getArchetypeHitMoveScale(enemy) {
  if (enemy?.type === 'GOLIATH') {
    return enemy.goliathPhase >= 2 ? 0.92 : 0.88;
  }

  if (enemy?.type === 'BRUTE') return 0.84;
  return 0.42;
}

export function shouldArchetypeForceMove(enemy) {
  return Boolean(
    (enemy?.type === 'RANGED' && enemy.spitterRepositionT > 0) ||
    (enemy?.type === 'RUNNER' && enemy.runnerBurstT > 0)
  );
}

export function canArchetypeRequestAttack(enemy) {
  if (!enemy) return true;
  if (enemy.type === 'RANGED' && enemy.spitterRepositionT > 0) return false;
  if (enemy.type === 'BRUTE' && enemy.bruteBraceT > 0.08) return false;
  return true;
}

export function getArchetypePursuitTarget(
  enemy,
  player,
  baseTarget,
  outTarget
) {
  const out = outTarget || { x: 0, z: 0 };
  const playerX = finite(player?.pos?.x);
  const playerZ = finite(player?.pos?.z);
  const enemyX = finite(enemy?.mesh?.position?.x);
  const enemyZ = finite(enemy?.mesh?.position?.z);

  out.x = finite(baseTarget?.x, playerX);
  out.z = finite(baseTarget?.z, playerZ);

  if (!enemy) return out;

  if (enemy.type === 'RUNNER' && enemy.runnerBurstT > 0) {
    out.x = playerX + finite(player?.vel?.x) * 0.10;
    out.z = playerZ + finite(player?.vel?.z) * 0.10;
    return out;
  }

  if (enemy.type === 'RANGED' && enemy.spitterRepositionT > 0) {
    let awayX = enemyX - playerX;
    let awayZ = enemyZ - playerZ;
    const distance = Math.max(0.001, Math.hypot(awayX, awayZ));
    awayX /= distance;
    awayZ /= distance;

    const sideX = -awayZ * (enemy.spitterRepositionSide || 1);
    const sideZ = awayX * (enemy.spitterRepositionSide || 1);
    const progress = clamp(
      enemy.spitterRepositionT /
      Math.max(0.001, enemy.spitterRepositionDuration || SPITTER_REPOSITION_DURATION)
    );

    out.x = enemyX + sideX * (3.2 + progress * 1.2) + awayX * 1.0;
    out.z = enemyZ + sideZ * (3.2 + progress * 1.2) + awayZ * 1.0;
  }

  return out;
}

export function getArchetypeAttackProfile(enemy, {
  exploitPriority = 0
} = {}) {
  if (!enemy) return null;

  const pressure = clamp(exploitPriority);

  switch (enemy.type) {
    case 'RANGED':
      if (enemy.spitterRepositionT > 0) return null;
      return {
        kind: 'RANGED',
        windup: pressure > 0.65 ? 0.68 : 0.62,
        recovery: 0.38,
        priority: 1.0 + pressure * 0.55,
        globalGap: pressure > 0.75 ? 0.64 : 0.72
      };

    case 'GOLIATH': {
      const phase = Math.max(1, Math.round(finite(enemy.goliathPhase, 1)));
      return {
        kind: 'HEAVY_GOLIATH',
        windup: phase >= 3 ? 0.92 : (phase === 2 ? 0.98 : 1.05),
        recovery: phase >= 3 ? 0.62 : (phase === 2 ? 0.67 : 0.72),
        priority: 1.28 + (phase - 1) * 0.05
      };
    }

    case 'BRUTE':
      if (enemy.bruteBraceT > 0.08) return null;
      return {
        kind: 'HEAVY_BRUTE',
        windup: 0.78,
        recovery: 0.54,
        priority: 1.12
      };

    case 'CRAWLER':
      return {
        kind: 'CRAWLER',
        windup: 0.34,
        recovery: 0.24,
        priority: 0.78
      };

    case 'EXPLODER':
      return {
        kind: 'EXPLODER',
        windup: 0.96,
        recovery: 0.30,
        priority: 1.20,
        globalGap: 0.85
      };

    default:
      return null;
  }
}

export function getArchetypeAttackCooldownScale(enemy) {
  if (!enemy) return 1;
  if (enemy.type === 'RUNNER') return 1.10;
  if (enemy.type === 'RANGED') return 1.04;
  if (enemy.type === 'GOLIATH') {
    if (enemy.goliathPhase >= 3) return 0.88;
    if (enemy.goliathPhase >= 2) return 0.94;
  }
  return 1;
}

export function consumeArchetypeEvent(enemy) {
  if (!enemy || !enemy.archetypeEvent || enemy.archetypeEvent === 'NONE') {
    return null;
  }

  const event = enemy.archetypeEvent;
  enemy.archetypeEvent = 'NONE';
  return event;
}

export function getAIArchetypeSnapshot() {
  return {
    runActive: state.runActive,
    mapId: state.mapId,
    wave: state.wave,
    maxRunnerBursts: MAX_RUNNER_BURSTS,
    activeRunnerBursts: state.activeRunnerBursts,
    runnerBurstsStarted: state.runnerBurstsStarted,
    spitterRepositioning: state.spitterRepositioning,
    spitterRepositions: state.spitterRepositions,
    bruteBracing: state.bruteBracing,
    bruteResists: state.bruteResists,
    goliathPhase: state.goliathPhase,
    goliathPhaseTransitions: state.goliathPhaseTransitions,
    exploderPrimed: state.exploderPrimed,
    exploderCritical: state.exploderCritical,
    lastEvent: state.lastEvent
  };
}

if (typeof window !== 'undefined') {
  window.KAGetAIArchetypes = getAIArchetypeSnapshot;
}
