import { readFileSync } from 'node:fs';
import {
  BOT1_PATCH,
  chooseBotIntent,
  isCriticalRescueThreat,
  resolveDownedHuman,
  selectBotRescueThreat
} from './bot_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function enemy(id, x, z, extra = {}) {
  return {
    id,
    alive: true,
    dyingT: -1,
    health: 100,
    mesh: { position: { x, y: 1.75, z } },
    ...extra
  };
}

assert(
  ['bot1-wingman-lifecycle-integrity-r2-6', 'bot1-lobby-recovery-companion-slot-r2-7', 'bot1-late-join-companion-integrity-r2-8'].includes(BOT1_PATCH),
  'R2.6 lifecycle profile must retain rescue priority'
);

const snapshotDowned = resolveDownedHuman({
  players: [
    { playerId: 'bot-wingmate-r1', lifeState: 'ACTIVE' },
    {
      playerId: 'host-1',
      connected: true,
      lifeState: 'DOWNED',
      position: { x: 10, y: 1.75, z: -2 }
    }
  ]
}, {
  hostPlayerId: 'host-1',
  hostPlayer: { alive: true, health: 100 },
  hostPosition: { x: 0, y: 1.75, z: 0 }
});
assert(
  snapshotDowned?.playerId === 'host-1'
    && snapshotDowned.position.x === 10,
  'authoritative DOWNED snapshot must lead rescue targeting'
);

const staleSnapshotFallback = resolveDownedHuman({
  players: [
    {
      playerId: 'host-1',
      connected: true,
      lifeState: 'ACTIVE',
      position: { x: 0, y: 1.75, z: 0 }
    }
  ]
}, {
  hostPlayerId: 'host-1',
  hostPlayer: {
    alive: false,
    health: 0,
    isDowned: true,
    multiplayerLifeState: 'DOWNED'
  },
  hostPosition: { x: 4, y: 1.75, z: 6 }
});
assert(
  staleSnapshotFallback?.synthetic === true
    && staleSnapshotFallback.position.z === 6,
  'local lethal state must establish rescue even during a stale ACTIVE snapshot'
);

const spectating = resolveDownedHuman(null, {
  hostPlayerId: 'host-1',
  hostPlayer: {
    alive: false,
    health: 0,
    isDowned: false,
    multiplayerLifeState: 'SPECTATING'
  },
  hostPosition: { x: 4, y: 1.75, z: 6 }
});
assert(spectating === null, 'fully eliminated host must not create a false revive target');

const downedPosition = { x: 0, y: 1.75, z: 0 };
const botPosition = { x: 2, y: 1.75, z: 0 };
const nearby = enemy('nearby', 6, 0);
const distantLastEnemy = enemy('distant-last', 30, 0);
const rescueThreat = selectBotRescueThreat(
  [distantLastEnemy, nearby],
  botPosition,
  downedPosition
);
assert(
  rescueThreat?.id === 'nearby',
  'rescue combat must select only the nearby threat, not a distant last enemy'
);
assert(
  selectBotRescueThreat(
    [distantLastEnemy],
    botPosition,
    downedPosition
  ) === null,
  'a distant enemy must not distract the wingman from revival'
);
assert(
  isCriticalRescueThreat(nearby, botPosition, downedPosition) === false,
  'a non-contact nearby threat may be fired on while approaching but must not block revive'
);
const contactThreat = enemy('contact', 3.2, 0);
assert(
  isCriticalRescueThreat(contactThreat, botPosition, downedPosition) === true,
  'an enemy in direct contact may be cleared before committing to the revive hold'
);

const intent = chooseBotIntent({
  botPosition,
  hostPosition: downedPosition,
  targetPosition: distantLastEnemy.mesh.position,
  downedTeammatePosition: downedPosition
});
assert(
  intent.kind === 'REVIVE'
    && intent.destination.x === downedPosition.x
    && intent.destination.z === downedPosition.z,
  'revive destination must outrank every combat destination'
);

const runtime = readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
assert(
  runtime.includes('const combatTarget = downed ? rescueThreat : target;')
    && runtime.includes('downed.position')
    && runtime.includes('criticalRescueThreat'),
  'runtime must approach the downed host while limiting combat to the rescue envelope'
);
assert(
  !runtime.includes('targetPosition: rescueThreat?.mesh?.position'),
  'rescue threats must never replace the downed host as the movement destination'
);

console.log('BOT.1 R2.4 rescue-priority tests passed');
