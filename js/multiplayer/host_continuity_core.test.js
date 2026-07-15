// js/multiplayer/host_continuity_core.test.js
import assert from 'node:assert/strict';
import {
  chooseHostVisibilityHandoffTarget,
  shouldScheduleHostVisibilityHandoff
} from './host_continuity_core.js';

const players = [
  { playerId: 'host', connected: true, isBot: false, joinedAt: 1 },
  { playerId: 'bot-wingmate-r1', connected: true, isBot: true, joinedAt: 2 },
  { playerId: 'ally-late', connected: true, isBot: false, joinedAt: 8 },
  { playerId: 'ally-first', connected: true, isBot: false, joinedAt: 4 }
];
assert.equal(
  chooseHostVisibilityHandoffTarget(players, 'host')?.playerId,
  'ally-first'
);
assert.equal(shouldScheduleHostVisibilityHandoff({
  visibilityState: 'hidden', runActive: true, sessionMode: 'host',
  roomStatus: 'in-run', localPlayerId: 'host', hostPlayerId: 'host',
  targetPlayerId: 'ally-first', now: 5000, lastRequestedAt: 0
}), true);
assert.equal(shouldScheduleHostVisibilityHandoff({
  visibilityState: 'visible', runActive: true, sessionMode: 'host',
  roomStatus: 'in-run', localPlayerId: 'host', hostPlayerId: 'host',
  targetPlayerId: 'ally-first', now: 5000, lastRequestedAt: 0
}), false);
assert.equal(shouldScheduleHostVisibilityHandoff({
  visibilityState: 'hidden', runActive: true, sessionMode: 'client',
  roomStatus: 'in-run', localPlayerId: 'ally-first', hostPlayerId: 'host',
  targetPlayerId: 'host', now: 5000, lastRequestedAt: 0
}), false);
console.log('MATCH.2 R1.2 host continuity core tests passed');
