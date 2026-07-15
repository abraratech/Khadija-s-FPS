import { readFileSync } from 'node:fs';
import { ReviveAuthority } from './revive_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const authority = new ReviveAuthority({ bleedoutMs: 5_000 });
authority.reset({ runId: 'bot1-r2-2', wave: 1 });
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
assert(snapshot.teamEliminated === false, 'active wingman must keep the run alive');

authority.setReviveHold('bot-wingmate-r1', 'human', {
  holding: true,
  now: 200,
  position: { x: 1.5, y: 1.75, z: 0 }
});
for (let now = 300; now <= 3_500; now += 100) {
  authority.setReviveHold('bot-wingmate-r1', 'human', {
    holding: true,
    now,
    position: { x: 1.5, y: 1.75, z: 0 }
  });
  snapshot = authority.update({ now, dtMs: 100, wave: 1 });
}
const human = snapshot.players.find((entry) => entry.playerId === 'human');
assert(human?.lifeState === 'ACTIVE', 'wingman revive hold must restore the human');
assert(snapshot.teamEliminated === false, 'successful revive must keep run active');

const mainSource = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
assert(
  mainSource.includes('function hasRecoverableMultiplayerOperative('),
  'main run-end fence must exist'
);
assert(
  mainSource.includes("entry.lifeState === 'ACTIVE'")
    && mainSource.includes("entry.lifeState === 'DOWNED'"),
  'run-end fence must recognize active and downed recovery paths'
);
const worldUpdate = mainSource.indexOf('updateSharedMultiplayerWorld(dt, frameNow);');
const earlyDownReport = mainSource.indexOf(
  'reportLocalMultiplayerDownedIfNeeded();',
  worldUpdate
);
const reviveUpdate = mainSource.indexOf('updateMultiplayerRevive(dt, frameNow', worldUpdate);
assert(
  worldUpdate >= 0 && earlyDownReport > worldUpdate && earlyDownReport < reviveUpdate,
  'local downed state must be registered before revive authority advances'
);

const reviveSource = readFileSync(new URL('./revive.js', import.meta.url), 'utf8');
const eliminationStart = reviveSource.indexOf('isTeamEliminated(snapshot');
const eliminationEnd = reviveSource.indexOf('ensureTeamElimination(', eliminationStart);
const eliminationBlock = reviveSource.slice(eliminationStart, eliminationEnd);
assert(
  !eliminationBlock.includes('snapshot.teamEliminated === true'),
  'runtime must not trust a stale teamEliminated snapshot flag'
);
assert(
  reviveSource.includes('this.teamEndRequested = requested !== false;'),
  'rejected run-end requests must remain retryable'
);
assert(
  reviveSource.includes('this.latestSnapshot = this.core.getSnapshot(nowMs());'),
  'TEAM_ELIMINATED events must be revalidated against current authority state'
);

console.log('BOT.1 R2.2 downed recovery fence tests passed');
