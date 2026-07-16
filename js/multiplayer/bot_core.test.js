import {
  BOT1_FILL_WAIT_MS,
  BOT1_PATCH,
  chooseBotIntent,
  computeBotVelocity,
  findDownedHuman,
  markBotAssistedSummary,
  selectBotEnemyTarget,
  shouldOfferBotFill,
  shouldReplaceBot
} from './bot_core.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  shouldOfferBotFill({
    status: 'searching',
    elapsedMs: BOT1_FILL_WAIT_MS - 1
  }) === false,
  'bot fill must not appear before the bounded wait'
);
assert(
  shouldOfferBotFill({
    status: 'searching',
    elapsedMs: BOT1_FILL_WAIT_MS
  }) === true,
  'bot fill should appear after the bounded wait'
);
assert(
  shouldOfferBotFill({
    status: 'matched',
    elapsedMs: BOT1_FILL_WAIT_MS + 5000
  }) === false,
  'bot fill must not be offered after a human match'
);

const reviveIntent = chooseBotIntent({
  botPosition: { x: 0, y: 0, z: 0 },
  hostPosition: { x: 8, y: 0, z: 8 },
  targetPosition: { x: 4, y: 0, z: 0 },
  downedTeammatePosition: { x: 2, y: 0, z: 0 }
});
assert(reviveIntent.kind === 'REVIVE', 'revive must outrank combat');

const followIntent = chooseBotIntent({
  botPosition: { x: 0, y: 0, z: 0 },
  hostPosition: { x: 10, y: 0, z: 0 }
});
assert(followIntent.kind === 'FOLLOW', 'bot should follow with no higher priority');

const commandIntent = chooseBotIntent({
  botPosition: { x: 0, y: 0, z: 0 },
  hostPosition: { x: 10, y: 0, z: 0 },
  targetPosition: { x: 3, y: 0, z: 0 },
  squadCommand: {
    type: 'DEFEND',
    position: { x: 8, y: 0, z: 4 }
  }
});
assert(commandIntent.kind === 'COMMAND_DEFEND', 'explicit defend command should guide movement before normal combat pursuit');
assert(commandIntent.destination.x === 8 && commandIntent.destination.z === 4, 'defend command destination should be preserved');

const movement = computeBotVelocity({
  position: { x: 0, y: 0, z: 0 },
  destination: { x: 10, y: 0, z: 0 },
  desiredDistance: 2,
  speed: 4,
  dt: 0.1
});
assert(movement.moving === true, 'bot should move toward distant destination');
assert(Math.abs(movement.velocity.x - 4) < 0.001, 'bot movement should honor speed');

const nearMovement = computeBotVelocity({
  position: { x: 0, y: 0, z: 0 },
  destination: { x: 1, y: 0, z: 0 },
  desiredDistance: 2,
  speed: 4,
  dt: 0.1
});
assert(nearMovement.moving === false, 'bot should plant feet inside desired range');

const enemies = [
  {
    id: 'far',
    alive: true,
    dyingT: -1,
    health: 100,
    mesh: { position: { x: 20, y: 0, z: 0 } }
  },
  {
    id: 'near',
    alive: true,
    dyingT: -1,
    health: 100,
    mesh: { position: { x: 5, y: 0, z: 0 } }
  }
];
assert(
  selectBotEnemyTarget(
    enemies,
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
  )?.id === 'near',
  'bot should prefer the nearby viable enemy'
);

const downed = findDownedHuman({
  players: [
    { playerId: 'bot-wingmate-r1', lifeState: 'ACTIVE' },
    {
      playerId: 'human-1',
      connected: true,
      lifeState: 'DOWNED',
      position: { x: 2, y: 0, z: 1 }
    }
  ]
});
assert(downed?.playerId === 'human-1', 'bot should locate a downed human');

assert(
  shouldReplaceBot({
    connectedHumanCount: 2,
    livingEnemyCount: 2,
    runActive: true
  }) === false,
  'bot must not disappear during active combat'
);
assert(
  shouldReplaceBot({
    connectedHumanCount: 2,
    livingEnemyCount: 0,
    runActive: true
  }) === true,
  'bot may yield to a human between waves'
);

const assisted = markBotAssistedSummary(
  { score: 1200 },
  {
    botProfile: BOT1_PATCH,
    activeSeconds: 42,
    replacementReason: 'human-replaced-between-waves'
  }
);
assert(assisted.botAssisted === true, 'bot-assisted run must be marked');
assert(assisted.leaderboardEligible === false, 'bot-assisted run must be ineligible');
assert(assisted.botActiveSeconds === 42, 'bot active time should be retained');

console.log('BOT.1 deterministic bot core tests passed');
