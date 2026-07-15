import { readFileSync } from 'node:fs';
import {
  BOT1_BURST_PAUSE_MS,
  BOT1_BURST_SHOTS,
  BOT1_FIRE_INTERVAL_MS,
  BOT1_MAX_ACCURACY,
  BOT1_MIN_ACCURACY,
  BOT1_PATCH,
  BOT1_SHOT_DAMAGE,
  BOT1_TARGET_REACTION_MS,
  buildBotAuthoritySyncDetails,
  computeBotShotAccuracy,
  shouldBotFire
} from './bot_core.js';
import { ReviveAuthority } from './revive_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  ['bot1-wingman-lifecycle-integrity-r2-6', 'bot1-lobby-recovery-companion-slot-r2-7', 'bot1-late-join-companion-integrity-r2-8'].includes(BOT1_PATCH),
  'R2.6 lifecycle-integrity profile must retain R2.5 fairness and health behavior'
);

const authority = new ReviveAuthority();
authority.reset({ runId: 'bot1-r2-5-health', wave: 1 });
authority.ensurePlayer('bot-wingmate-r1', {
  connected: true,
  health: 100,
  maxHealth: 100,
  position: { x: 0, y: 1.75, z: 0 },
  now: 0
});
const damaged = authority.updatePlayer('bot-wingmate-r1', {
  health: 85,
  now: 10
});
assert(damaged.health === 85, 'test setup must reduce bot health to 85');

const steadySync = buildBotAuthoritySyncDetails({
  state: {
    health: 100,
    position: { x: 1, y: 1.75, z: 0 }
  },
  authorityExists: true,
  initialize: false,
  now: 20
});
assert(
  !Object.prototype.hasOwnProperty.call(steadySync, 'health'),
  'normal bot synchronization must never overwrite authoritative health'
);
authority.updatePlayer('bot-wingmate-r1', steadySync);
assert(
  authority.players.get('bot-wingmate-r1').health === 85,
  'enemy damage must persist instead of regenerating back to cached 100 health'
);

const initialSync = buildBotAuthoritySyncDetails({
  state: {
    health: 100,
    position: { x: 0, y: 1.75, z: 0 }
  },
  authorityExists: false,
  initialize: true,
  now: 0
});
assert(
  initialSync.health === 100,
  'full health may be seeded only when the wingman is first registered for a run'
);

assert(BOT1_SHOT_DAMAGE === 13, 'wingman shot damage must use the fair R2.5 value');
assert(BOT1_FIRE_INTERVAL_MS === 410, 'wingman cadence must be slower than R2.4');
assert(BOT1_TARGET_REACTION_MS === 260, 'new targets must have a human-like reaction delay');
assert(BOT1_BURST_SHOTS === 5 && BOT1_BURST_PAUSE_MS === 550, 'continuous perfect fire must be broken into bounded bursts');
assert(
  computeBotShotAccuracy(0) === BOT1_MAX_ACCURACY,
  'close-range accuracy must remain capped below perfect aim'
);
const longAccuracy = computeBotShotAccuracy(18);
assert(
  longAccuracy >= BOT1_MIN_ACCURACY
    && longAccuracy < computeBotShotAccuracy(6),
  'accuracy must decline with distance while retaining a bounded minimum'
);
assert(
  shouldBotFire({
    now: 200,
    lastShotAt: -1000,
    targetAcquiredAt: 0,
    burstPauseUntil: -1000
  }) === false,
  'wingman must not fire before its target-reaction delay completes'
);
assert(
  shouldBotFire({
    now: 800,
    lastShotAt: 500,
    targetAcquiredAt: 0,
    burstPauseUntil: -1000
  }) === false,
  'wingman must respect its slower shot interval'
);
assert(
  shouldBotFire({
    now: 1000,
    lastShotAt: 0,
    targetAcquiredAt: 0,
    burstPauseUntil: 1200
  }) === false,
  'wingman must respect its burst pause'
);
assert(
  shouldBotFire({
    now: 1300,
    lastShotAt: 800,
    targetAcquiredAt: 0,
    burstPauseUntil: 1200
  }) === true,
  'wingman may fire after reaction, cadence, and burst gates all clear'
);

const runtime = readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
assert(
  runtime.includes('authorityExists: Boolean(existing)')
    && runtime.includes('initialize: true')
    && runtime.includes('BOT1_SHOT_DAMAGE')
    && runtime.includes('this.burstPauseUntil = now + BOT1_BURST_PAUSE_MS'),
  'runtime must use persistent health authority and fair-combat pacing'
);
assert(
  !runtime.includes('this.damageEnemy?.(enemy, 16'),
  'R2.4 high-damage shot value must no longer be active'
);

console.log('BOT.1 R2.5 fairness and health-integrity tests passed');
