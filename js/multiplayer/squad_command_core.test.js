import assert from 'node:assert/strict';
import {
  SQUAD_COMMAND_PATCH,
  SQUAD_COMMAND_STATUS,
  buildSquadCommandIntent,
  chooseCommandEnemyTarget,
  commandReached,
  getSquadCommandProfile,
  isMovementSquadCommand,
  isRescueSquadCommand,
  shouldAcceptSquadCommand,
  squadCommandIsActive,
  squadIntentLabel
} from './squad_command_core.js';
import { TACTICAL_PING_TYPES } from './tactical_ping_core.js';

assert.equal(SQUAD_COMMAND_PATCH, 'post-final3-r1-squad-command-team-intelligence');
assert.equal(getSquadCommandProfile(TACTICAL_PING_TYPES.DEFEND).status, SQUAD_COMMAND_STATUS.DEFENDING);
assert.equal(isMovementSquadCommand(TACTICAL_PING_TYPES.REGROUP), true);
assert.equal(isRescueSquadCommand(TACTICAL_PING_TYPES.REVIVE), true);
assert.equal(squadIntentLabel(TACTICAL_PING_TYPES.INTERACT), 'INTERACT');

const move = buildSquadCommandIntent({
  pingId: 'move-1',
  type: TACTICAL_PING_TYPES.MOVE,
  ownerPlayerId: 'player-a',
  ownerName: '<Abrar>',
  position: { x: 1, y: 2, z: 3 }
}, { now: 100, epochNow: 1000 });
assert.ok(move);
assert.equal(move.ownerName, 'Abrar');
assert.equal(move.expiresAt, 12100);
assert.equal(move.expiresAtEpochMs, 13000);
assert.equal(squadCommandIsActive(move, 12099), true);
assert.equal(squadCommandIsActive(move, 12100), false);
assert.equal(commandReached(move, { x: 1.5, z: 3.5 }, 1), true);

const defend = buildSquadCommandIntent({
  pingId: 'defend-1',
  type: TACTICAL_PING_TYPES.DEFEND,
  ownerPlayerId: 'player-a',
  ownerName: 'Abrar',
  position: { x: 4, y: 2, z: 5 }
}, { now: 200, epochNow: 1200 });
assert.equal(shouldAcceptSquadCommand(move, defend, 200), true);
assert.equal(shouldAcceptSquadCommand(defend, move, 200), false);
assert.equal(shouldAcceptSquadCommand(defend, { ...defend, commandId: 'defend-2', createdAt: 201 }, 200), true);

const enemyA = { id: 'a', alive: true, dyingT: -1, health: 10, mesh: { position: { x: 20, z: 20 }, uuid: 'mesh-a' } };
const enemyB = { id: 'b', alive: true, dyingT: -1, health: 10, mesh: { position: { x: 2, z: 2 }, uuid: 'mesh-b' } };
const attack = buildSquadCommandIntent({
  pingId: 'enemy-1',
  type: TACTICAL_PING_TYPES.ENEMY,
  ownerPlayerId: 'player-a',
  ownerName: 'Abrar',
  position: { x: 1, y: 0, z: 1 },
  targetId: 'a'
}, { now: 0 });
assert.equal(chooseCommandEnemyTarget([enemyA, enemyB], attack), enemyA);
assert.equal(chooseCommandEnemyTarget([enemyB], attack), enemyB);

console.log('POST-FINAL.3 squad command core tests passed');
