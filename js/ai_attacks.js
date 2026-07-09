// js/ai_attacks.js
// C10.7 — Coordinated Attack Telegraph and Counterplay
//
// Centralizes special-enemy attack queues, wind-ups, interruptions, and
// recovery windows. It prevents unreadable simultaneous special attacks while
// keeping damage, health, and Director intensity unchanged.

const MAX_SPECIAL_TELEGRAPHS = 2;
const MAX_RANGED_WINDUPS = 1;
const MAX_HEAVY_WINDUPS = 1;
const MAX_EXPLODER_WINDUPS = 1;
const MAX_QUEUE_SIZE = 7;
const RANGED_GLOBAL_GAP = 0.72;
const HEAVY_GLOBAL_GAP = 0.42;
const EXPLODER_GLOBAL_GAP = 0.85;

const state = {
  runActive: false,
  wave: 1,
  queue: [],
  rangedCooldown: 0,
  heavyCooldown: 0,
  exploderCooldown: 0,
  activeTelegraphs: 0,
  activeRanged: 0,
  activeHeavy: 0,
  activeExploder: 0,
  queuedRanged: 0,
  queuedHeavy: 0,
  queuedExploder: 0,
  telegraphsStarted: 0,
  committed: 0,
  interrupted: 0,
  evaded: 0,
  denied: 0,
  projectileHits: 0,
  projectileMisses: 0,
  maxConcurrent: 0,
  lastEvent: 'NONE'
};

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isLiving(enemy) {
  return Boolean(enemy?.alive && enemy.dyingT < 0 && enemy.mesh?.visible !== false);
}

function isSpecialKind(kind) {
  return kind === 'RANGED' ||
    kind === 'HEAVY_BRUTE' ||
    kind === 'HEAVY_GOLIATH' ||
    kind === 'EXPLODER';
}

function isHeavyKind(kind) {
  return kind === 'HEAVY_BRUTE' || kind === 'HEAVY_GOLIATH';
}

function isExploderKind(kind) {
  return kind === 'EXPLODER';
}

function getDefaultOptions(kind) {
  switch (kind) {
    case 'RANGED':
      return { windup: 0.62, recovery: 0.38, priority: 1.0 };
    case 'HEAVY_GOLIATH':
      return { windup: 1.05, recovery: 0.72, priority: 1.25 };
    case 'HEAVY_BRUTE':
      return { windup: 0.78, recovery: 0.54, priority: 1.10 };
    case 'EXPLODER':
      return { windup: 0.96, recovery: 0.30, priority: 1.20, globalGap: 0.85 };
    case 'CRAWLER':
      return { windup: 0.34, recovery: 0.24, priority: 0.75 };
    default:
      return { windup: 0.22, recovery: 0.20, priority: 0.5 };
  }
}

function clearEnemyAttack(enemy) {
  if (!enemy) return;
  enemy.attackState = 'IDLE';
  enemy.attackKind = 'NONE';
  enemy.attackWindupT = 0;
  enemy.attackWindupDuration = 0;
  enemy.attackRecoveryT = 0;
  enemy.attackRequestOptions = null;
  enemy.attackTelegraphProgress = 0;
  enemy.attackQueuedAt = 0;
}

function beginWindup(enemy, kind, options = {}) {
  if (!isLiving(enemy)) return false;

  const defaults = getDefaultOptions(kind);
  const windup = Math.max(0.08, Number(options.windup) || defaults.windup);
  const recovery = Math.max(0.08, Number(options.recovery) || defaults.recovery);

  enemy.attackState = 'WINDUP';
  enemy.attackKind = kind;
  enemy.attackWindupT = windup;
  enemy.attackWindupDuration = windup;
  enemy.attackRecoveryDuration = recovery;
  enemy.attackRecoveryT = 0;
  enemy.attackRequestOptions = { ...defaults, ...options, windup, recovery };
  enemy.attackTelegraphProgress = 0;
  enemy.attackStartedAt = nowMs();
  enemy.attackLastProcessedHitAt = Number(enemy.lastHitAt) || 0;
  enemy.attackTelegraphJustStarted = true;
  enemy.attackInterruptedJustNow = false;

  state.telegraphsStarted++;
  state.lastEvent = `${kind} WINDUP`;
  return true;
}

function removeQueuedEnemy(enemy) {
  const before = state.queue.length;
  state.queue = state.queue.filter((entry) => entry.enemy !== enemy);
  return before !== state.queue.length;
}

function shouldInterrupt(enemy) {
  if (!enemy || enemy.attackState !== 'WINDUP') return false;

  const hitAt = Number(enemy.lastHitAt) || 0;
  if (hitAt <= (enemy.attackLastProcessedHitAt || 0)) return false;
  enemy.attackLastProcessedHitAt = hitAt;

  const damage = Math.max(0, Number(enemy.lastHitDamage) || 0);
  const headshot = enemy.lastHitHeadshot === true;
  const kind = enemy.attackKind;

  if (kind === 'RANGED') {
    return headshot || damage >= 68 || (enemy.hitReactT || 0) >= 0.20;
  }

  if (kind === 'HEAVY_BRUTE') {
    return damage >= 105 || (headshot && damage >= 48);
  }

  if (kind === 'HEAVY_GOLIATH') {
    return damage >= 185 || (headshot && damage >= 105);
  }

  if (kind === 'EXPLODER') {
    return headshot || damage >= 70;
  }

  if (kind === 'CRAWLER') {
    return headshot || damage >= 46;
  }

  return headshot || damage >= 75;
}

function transitionToRecovery(enemy, duration = null) {
  const configured = Number(enemy?.attackRecoveryDuration) || 0.25;
  enemy.attackState = 'RECOVERY';
  enemy.attackRecoveryT = Math.max(0.08, Number(duration) || configured);
  enemy.attackWindupT = 0;
  enemy.attackTelegraphProgress = 1;
}

function countActive(enemies = []) {
  let total = 0;
  let ranged = 0;
  let heavy = 0;
  let exploder = 0;

  for (const enemy of enemies) {
    if (!isLiving(enemy) || enemy.attackState !== 'WINDUP') continue;
    if (!isSpecialKind(enemy.attackKind)) continue;
    total++;
    if (enemy.attackKind === 'RANGED') ranged++;
    if (isHeavyKind(enemy.attackKind)) heavy++;
    if (isExploderKind(enemy.attackKind)) exploder++;
  }

  state.activeTelegraphs = total;
  state.activeRanged = ranged;
  state.activeHeavy = heavy;
  state.activeExploder = exploder;
  state.maxConcurrent = Math.max(state.maxConcurrent, total);
}

function refreshQueueCounts() {
  state.queuedRanged = state.queue.filter((entry) => entry.kind === 'RANGED').length;
  state.queuedHeavy = state.queue.filter((entry) => isHeavyKind(entry.kind)).length;
  state.queuedExploder = state.queue.filter((entry) => isExploderKind(entry.kind)).length;
}

export function resetAIAttackRun() {
  state.runActive = true;
  state.wave = 1;
  state.queue = [];
  state.rangedCooldown = 0;
  state.heavyCooldown = 0;
  state.exploderCooldown = 0;
  state.exploderCooldown = 0;
  state.activeTelegraphs = 0;
  state.activeRanged = 0;
  state.activeHeavy = 0;
  state.activeExploder = 0;
  state.queuedRanged = 0;
  state.queuedHeavy = 0;
  state.queuedExploder = 0;
  state.telegraphsStarted = 0;
  state.committed = 0;
  state.interrupted = 0;
  state.evaded = 0;
  state.denied = 0;
  state.projectileHits = 0;
  state.projectileMisses = 0;
  state.maxConcurrent = 0;
  state.lastEvent = 'RESET';
}

export function endAIAttackRun(enemies = []) {
  state.runActive = false;
  state.queue = [];
  for (const enemy of enemies || []) clearEnemyAttack(enemy);
  state.activeTelegraphs = 0;
  state.activeExploder = 0;
  state.queuedRanged = 0;
  state.queuedHeavy = 0;
  state.queuedExploder = 0;
}

export function beginAIAttackWave(waveNumber) {
  state.wave = Math.max(1, Number(waveNumber) || 1);
  state.queue = [];
  state.rangedCooldown = 0;
  state.heavyCooldown = 0;
  state.lastEvent = `WAVE ${state.wave}`;
}

export function registerAttackEnemy(enemy) {
  if (!enemy) return;
  clearEnemyAttack(enemy);
  enemy.attackTelegraphJustStarted = false;
  enemy.attackInterruptedJustNow = false;
  enemy.attackInterruptedKind = 'NONE';
  enemy.attackLastProcessedHitAt = Number(enemy.lastHitAt) || 0;
}

export function queueEnemyAttack(enemy, kind, options = {}) {
  if (!state.runActive || !isLiving(enemy)) return false;
  if (enemy.attackState && enemy.attackState !== 'IDLE') return false;

  const defaults = getDefaultOptions(kind);
  const merged = { ...defaults, ...options };

  // Crawlers use the same synchronized wind-up system but do not consume a
  // global special-attack slot.
  if (kind === 'CRAWLER') {
    return beginWindup(enemy, kind, merged);
  }

  if (!isSpecialKind(kind)) {
    return beginWindup(enemy, kind, merged);
  }

  if (state.queue.length >= MAX_QUEUE_SIZE) {
    state.denied++;
    state.lastEvent = `${kind} QUEUE FULL`;
    return false;
  }

  enemy.attackState = 'QUEUED';
  enemy.attackKind = kind;
  enemy.attackQueuedAt = nowMs();
  enemy.attackRequestOptions = merged;

  state.queue.push({
    enemy,
    kind,
    options: merged,
    priority: Number(merged.priority) || defaults.priority,
    queuedAt: enemy.attackQueuedAt
  });

  refreshQueueCounts();
  return true;
}

export function updateAIAttackCoordinator(dt, enemies = []) {
  if (!state.runActive) return;

  const safeDt = clamp(dt, 0, 0.05);
  state.rangedCooldown = Math.max(0, state.rangedCooldown - safeDt);
  state.heavyCooldown = Math.max(0, state.heavyCooldown - safeDt);
  state.exploderCooldown = Math.max(0, state.exploderCooldown - safeDt);

  state.queue = state.queue.filter((entry) => {
    if (!isLiving(entry.enemy)) {
      clearEnemyAttack(entry.enemy);
      return false;
    }
    return entry.enemy.attackState === 'QUEUED';
  });

  countActive(enemies);

  state.queue.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.queuedAt - b.queuedAt;
  });

  for (let i = 0; i < state.queue.length;) {
    const entry = state.queue[i];
    const kind = entry.kind;
    const totalOpen = state.activeTelegraphs < MAX_SPECIAL_TELEGRAPHS;
    const rangedOpen = kind !== 'RANGED' || (
      state.activeRanged < MAX_RANGED_WINDUPS && state.rangedCooldown <= 0
    );
    const heavyOpen = !isHeavyKind(kind) || (
      state.activeHeavy < MAX_HEAVY_WINDUPS && state.heavyCooldown <= 0
    );
    const exploderOpen = !isExploderKind(kind) || (
      state.activeExploder < MAX_EXPLODER_WINDUPS &&
      state.exploderCooldown <= 0
    );

    if (!totalOpen || !rangedOpen || !heavyOpen || !exploderOpen) {
      i++;
      continue;
    }

    state.queue.splice(i, 1);
    beginWindup(entry.enemy, kind, entry.options);

    state.activeTelegraphs++;
    if (kind === 'RANGED') state.activeRanged++;
    if (isHeavyKind(kind)) state.activeHeavy++;
    if (isExploderKind(kind)) state.activeExploder++;
  }

  refreshQueueCounts();
  countActive(enemies);
}

export function advanceEnemyAttack(enemy, dt, {
  canCommit = true,
  onCommit = null
} = {}) {
  if (!enemy || !state.runActive) return { state: 'IDLE' };

  const safeDt = clamp(dt, 0, 0.05);

  if (enemy.attackState === 'WINDUP') {
    if (shouldInterrupt(enemy)) {
      const interruptedKind = enemy.attackKind;
      enemy.attackInterruptedKind = interruptedKind;
      enemy.attackInterruptedJustNow = true;
      transitionToRecovery(enemy, 0.30);
      state.interrupted++;
      state.lastEvent = `${interruptedKind} INTERRUPTED`;
      return { state: 'INTERRUPTED', kind: interruptedKind };
    }

    enemy.attackWindupT = Math.max(0, enemy.attackWindupT - safeDt);
    enemy.attackTelegraphProgress = clamp(
      1 - enemy.attackWindupT / Math.max(0.001, enemy.attackWindupDuration)
    );

    if (enemy.attackWindupT <= 0) {
      const kind = enemy.attackKind;

      if (canCommit) {
        if (typeof onCommit === 'function') onCommit(kind, enemy);
        state.committed++;
        state.lastEvent = `${kind} COMMIT`;

        if (kind === 'RANGED') {
          state.rangedCooldown = Math.max(
            RANGED_GLOBAL_GAP,
            Number(enemy.attackRequestOptions?.globalGap) || 0
          );
        }
        if (isHeavyKind(kind)) {
          state.heavyCooldown = HEAVY_GLOBAL_GAP;
        }
        if (isExploderKind(kind)) {
          state.exploderCooldown = Math.max(
            EXPLODER_GLOBAL_GAP,
            Number(enemy.attackRequestOptions?.globalGap) || 0
          );
        }
      } else {
        state.evaded++;
        state.lastEvent = `${kind} EVADED`;
      }

      transitionToRecovery(enemy);
      return { state: canCommit ? 'COMMITTED' : 'EVADED', kind };
    }

    return {
      state: 'WINDUP',
      kind: enemy.attackKind,
      progress: enemy.attackTelegraphProgress
    };
  }

  if (enemy.attackState === 'RECOVERY') {
    enemy.attackRecoveryT = Math.max(0, enemy.attackRecoveryT - safeDt);

    if (enemy.attackRecoveryT <= 0) {
      clearEnemyAttack(enemy);
      return { state: 'READY' };
    }

    return { state: 'RECOVERY', kind: enemy.attackKind };
  }

  return { state: enemy.attackState || 'IDLE' };
}

export function consumeAttackTelegraphStart(enemy) {
  if (!enemy?.attackTelegraphJustStarted) return false;
  enemy.attackTelegraphJustStarted = false;
  return true;
}

export function consumeAttackInterrupted(enemy) {
  if (!enemy?.attackInterruptedJustNow) return null;
  enemy.attackInterruptedJustNow = false;
  return enemy.attackInterruptedKind || enemy.attackKind || 'UNKNOWN';
}

export function cancelEnemyAttack(enemy, reason = 'CANCELLED') {
  if (!enemy) return;
  const wasActive = enemy.attackState && enemy.attackState !== 'IDLE';
  removeQueuedEnemy(enemy);
  clearEnemyAttack(enemy);
  if (wasActive) state.lastEvent = `${reason}`;
  refreshQueueCounts();
}

export function recordAIAttackProjectileResult(hitPlayer = false) {
  if (hitPlayer) state.projectileHits++;
  else state.projectileMisses++;
}

export function getAIAttackSnapshot() {
  return {
    runActive: state.runActive,
    wave: state.wave,
    activeTelegraphs: state.activeTelegraphs,
    activeRanged: state.activeRanged,
    activeHeavy: state.activeHeavy,
    activeExploder: state.activeExploder,
    queued: state.queue.length,
    queuedRanged: state.queuedRanged,
    queuedHeavy: state.queuedHeavy,
    queuedExploder: state.queuedExploder,
    telegraphsStarted: state.telegraphsStarted,
    committed: state.committed,
    interrupted: state.interrupted,
    evaded: state.evaded,
    denied: state.denied,
    projectileHits: state.projectileHits,
    projectileMisses: state.projectileMisses,
    rangedCooldown: state.rangedCooldown,
    heavyCooldown: state.heavyCooldown,
    exploderCooldown: state.exploderCooldown,
    maxConcurrent: state.maxConcurrent,
    lastEvent: state.lastEvent
  };
}

if (typeof window !== 'undefined') {
  window.KAGetAIAttacks = getAIAttackSnapshot;
}
