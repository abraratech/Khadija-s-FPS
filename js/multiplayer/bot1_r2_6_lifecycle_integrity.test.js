import { readFileSync } from 'node:fs';
import {
  BOT1_HARD_RECOVERY_DISTANCE,
  BOT1_MIN_RECOVERY_ANCHOR_DISTANCE,
  BOT1_PATCH,
  BOT1_REVIVE_HARD_RECOVERY_DISTANCE,
  BOT1_SOFT_CATCHUP_DISTANCE,
  buildSafeAnchorCandidates,
  chooseBotIntent,
  distanceSquared,
  shouldPreserveBotReservation,
  shouldRecoverBotToHost
} from './bot_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  ['bot1-wingman-lifecycle-integrity-r2-6', 'bot1-lobby-recovery-companion-slot-r2-7', 'bot1-late-join-companion-integrity-r2-8'].includes(BOT1_PATCH),
  'R2.6 lifecycle-integrity behavior must remain active'
);
assert(BOT1_SOFT_CATCHUP_DISTANCE === 15, 'soft catch-up must begin at 15 metres');
assert(BOT1_HARD_RECOVERY_DISTANCE >= 30, 'normal follow must not snap at the old 16 metre tether');
assert(BOT1_REVIVE_HARD_RECOVERY_DISTANCE >= 22, 'revive recovery must remain bounded but not snap at ordinary separation');

const clearFollow = shouldRecoverBotToHost({
  intentKind: 'FOLLOW',
  hostDistance: 16.5,
  stuckForMs: 0,
  routeClear: true,
  sinceLastRecoveryMs: 10_000
});
assert(clearFollow === false, 'a clear 15-17 metre separation must use natural catch-up, not teleport');

const combatSeparation = shouldRecoverBotToHost({
  intentKind: 'ENGAGE',
  hostDistance: 45,
  stuckForMs: 10_000,
  routeClear: false,
  sinceLastRecoveryMs: 10_000
});
assert(combatSeparation === false, 'combat pursuit must never snap the wingman back to the host');

const blockedFollow = shouldRecoverBotToHost({
  intentKind: 'FOLLOW',
  hostDistance: BOT1_HARD_RECOVERY_DISTANCE + 1,
  stuckForMs: 0,
  routeClear: false,
  sinceLastRecoveryMs: 10_000
});
assert(blockedFollow === true, 'hard unreachable separation must retain a last-resort recovery path');

const stuckFollow = shouldRecoverBotToHost({
  intentKind: 'FOLLOW',
  hostDistance: 9,
  stuckForMs: 3_000,
  routeClear: false,
  sinceLastRecoveryMs: 10_000
});
assert(stuckFollow === true, 'a genuinely stuck follow bot must recover');

const catchupIntent = chooseBotIntent({
  botPosition: { x: 0, y: 1.75, z: 0 },
  hostPosition: { x: 18, y: 1.75, z: 0 }
});
assert(catchupIntent.kind === 'FOLLOW' && catchupIntent.speed >= 5, 'separated wingman must sprint back naturally');

const anchors = buildSafeAnchorCandidates({ x: 0, y: 1.75, z: 0 }, 0);
assert(anchors.length >= 6, 'safe recovery must retain multiple candidate anchors');
assert(
  anchors.every((anchor) => Math.sqrt(distanceSquared(anchor, { x: 0, y: 1.75, z: 0 })) >= BOT1_MIN_RECOVERY_ANCHOR_DISTANCE),
  'recovery anchors must not overlap the host damage cluster'
);

assert(
  shouldPreserveBotReservation({ requested: true, reason: 'team-eliminated', connectedHumanCount: 1, roomExists: true }) === true,
  'same-room defeat must preserve the wingman for restart'
);
assert(
  shouldPreserveBotReservation({ requested: true, reason: 'restarted', connectedHumanCount: 1, roomExists: true }) === true,
  'explicit restart must preserve the wingman reservation'
);
assert(
  shouldPreserveBotReservation({ requested: true, reason: 'left-room', connectedHumanCount: 1, roomExists: true }) === false,
  'leaving the room must release the wingman reservation'
);
assert(
  shouldPreserveBotReservation({ requested: true, reason: 'run-ended', connectedHumanCount: 2, roomExists: true }) === true,
  'R2.7 companion policy must preserve the wingman alongside a human ally'
);

const runtime = readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('./foundation.js', import.meta.url), 'utf8');
assert(
  runtime.includes('this.hasVirtualReservation()')
    && runtime.includes('shouldPreserveBotReservation({')
    && runtime.includes('allowAnchorFallback: false'),
  'runtime must restore reservations and forbid host-overlap recovery'
);
assert(
  !runtime.includes('hostDistance >= BOT1_MAX_ANCHOR_DISTANCE'),
  'the old unconditional 16 metre snap tether must be removed'
);
assert(
  foundation.includes("botManager?.clearReservation?.('left-room')"),
  'room exit must explicitly clear a persistent bot reservation'
);

console.log('BOT.1 R2.6 lifecycle-integrity tests passed');
