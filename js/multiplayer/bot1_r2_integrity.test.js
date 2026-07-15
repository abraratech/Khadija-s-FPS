import { readFileSync } from 'node:fs';
import {
  BOT1_PATCH,
  buildSafeAnchorCandidates,
  chooseCollisionSafeStep
} from './bot_core.js';
import {
  MULTIPLAYER_LIFE_STATES,
  ReviveAuthority
} from './revive_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  ['bot1-wingman-lifecycle-integrity-r2-6', 'bot1-lobby-recovery-companion-slot-r2-7', 'bot1-late-join-companion-integrity-r2-8'].includes(BOT1_PATCH),
  'BOT.1 R2.6+ lifecycle-integrity behavior must remain active'
);

const anchor = { x: 12, y: 1.75, z: -4 };
const candidates = buildSafeAnchorCandidates(anchor, 0);
assert(candidates.length >= 8, 'safe spawn resolver needs bounded fallback candidates');
assert(
  candidates.every((entry) => entry.x !== anchor.x || entry.z !== anchor.z),
  'runtime recovery candidates must not overlap the authoritative player anchor'
);
assert(
  candidates.every((entry) => entry.y === anchor.y),
  'safe spawn candidates must preserve the current playable floor height'
);

assert(
  chooseCollisionSafeStep({ full: true, xOnly: true, zOnly: true }) === 'FULL',
  'full collision-safe movement must be preferred'
);
assert(
  chooseCollisionSafeStep({ xOnly: true, zOnly: true, deltaX: 0.4, deltaZ: 0.2 }) === 'X',
  'wall slide must retain the larger safe movement axis'
);
assert(
  chooseCollisionSafeStep({}) === 'BLOCKED',
  'movement must stop when every swept candidate is blocked'
);

const authority = new ReviveAuthority({ bleedoutMs: 5_000 });
authority.reset({ runId: 'bot1-r2-test', wave: 1 });
authority.ensurePlayer('human', {
  connected: true,
  health: 100,
  position: { x: 0, y: 1.75, z: 0 },
  now: 0
});
authority.ensurePlayer('bot-wingmate-r1', {
  connected: true,
  health: 100,
  position: { x: 2, y: 1.75, z: 0 },
  now: 0
});
authority.downPlayer('human', { now: 100, wave: 1 });
let snapshot = authority.update({ now: 200, dtMs: 100, wave: 1 });
assert(snapshot.teamEliminated === false, 'downed human with active bot must not end the match');
authority.downPlayer('bot-wingmate-r1', { now: 300, wave: 1 });
snapshot = authority.update({ now: 400, dtMs: 100, wave: 1 });
assert(snapshot.teamEliminated === false, 'all-down-but-recoverable state must wait for bleedout');
snapshot = authority.update({ now: 5_500, dtMs: 250, wave: 1 });
assert(snapshot.teamEliminated === true, 'team elimination should occur after every operative bleeds out');

const botRuntime = readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
assert(
  botRuntime.includes('placeAtSafeAnchor')
    && botRuntime.includes('isRouteClear')
    && botRuntime.includes('moveWithCollision')
    && botRuntime.includes('recoverFromStuck'),
  'BOT.1 R2 runtime must enforce safe spawn, swept collision, and recovery'
);

const reviveRuntime = readFileSync(new URL('./revive.js', import.meta.url), 'utf8');
const eliminationStart = reviveRuntime.indexOf('isTeamEliminated(snapshot');
const eliminationEnd = reviveRuntime.indexOf('ensureTeamElimination(', eliminationStart);
const eliminationBlock = reviveRuntime.slice(eliminationStart, eliminationEnd);
assert(eliminationStart >= 0 && eliminationEnd > eliminationStart, 'revive elimination block must exist');
assert(
  !eliminationBlock.includes('MULTIPLAYER_LIFE_STATES.DOWNED'),
  'DOWNED must remain recoverable in runtime team-elimination checks'
);
assert(
  eliminationBlock.includes('MULTIPLAYER_LIFE_STATES.SPECTATING'),
  'runtime team elimination must require fully eliminated/spectating players'
);

console.log('BOT.1 R2 navigation and revive integrity tests passed');
