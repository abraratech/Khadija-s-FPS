import assert from 'node:assert/strict';
import { MultiplayerEventBus } from './event_bus.js';
import { MultiplayerRuntime } from './runtime.js';
import { RemotePlayerManager } from './remote_players.js';
import { createProtocolEnvelope } from './protocol.js';
import { CoopStatsCore } from './coop_stats_core.js';

const eventBus = new MultiplayerEventBus({ sourceIdProvider: () => 'test' });
const session = {
  sessionId: 'session-r28',
  hostPlayerId: 'player-host',
  mode: 'client',
  run: { active: true, runId: 'run-r28' },
  getSnapshot() { return { sessionId: this.sessionId, run: this.run }; }
};
const players = {
  localPlayerId: 'player-ally',
  getLocalPlayerSnapshot() {
    return { playerId: 'player-ally', displayName: 'ALLY', connected: true };
  },
  syncLocalPlayer() {}
};
const transport = {
  getMode: () => 'online',
  getState: () => 'connected',
  send: () => true,
  sendControl: () => true
};
const runtime = new MultiplayerRuntime({ eventBus, transport, session, players });
runtime.initialize({ localPlayerId: 'player-ally' });
runtime.room.replaceFromSnapshot({
  roomId: 'room-r28',
  roomCode: 'ABC234',
  status: 'in-run',
  hostPlayerId: 'player-host',
  settings: { maxPlayers: 2, mapId: 'grid_bunker', difficulty: 1 },
  players: [
    { playerId: 'player-host', displayName: 'HOST', connected: true, isHost: true },
    { playerId: 'player-ally', displayName: 'ALLY', connected: true, isHost: false },
    { playerId: 'bot-wingmate-r1', displayName: 'ARENA WINGMATE', connected: true, isBot: true, botProfile: 'bot1-late-join-companion-integrity-r2-8' }
  ],
  virtualPlayersAuthoritative: true,
  runId: 'run-r28',
  authorityEpoch: 0,
  revision: 1
}, 'test-room');
new RemotePlayerManager({ scene: null, eventBus, runtime, localPlayerId: 'player-ally' });

const hostEnvelope = createProtocolEnvelope({
  type: 'player-snapshot', sessionId: 'session-r28', runId: 'run-r28',
  playerId: 'player-host', sequence: 1, payload: { state: { position: { x: 1, y: 2, z: 3 } } }
});
const botEnvelope = createProtocolEnvelope({
  type: 'player-snapshot', sessionId: 'session-r28', runId: 'run-r28',
  playerId: 'bot-wingmate-r1', sequence: 1, payload: { state: { isBot: true, displayName: 'ARENA WINGMATE', botProfile: 'bot1-late-join-companion-integrity-r2-8', position: { x: 4, y: 2, z: 5 } } }
});
assert.equal(runtime.ingestRemoteEnvelope(hostEnvelope).accepted, true);
assert.equal(runtime.ingestRemoteEnvelope(botEnvelope).accepted, true);
assert.ok(runtime.sampleRemotePlayer('player-host', performance.now()));
assert.ok(runtime.sampleRemotePlayer('bot-wingmate-r1', performance.now()));
assert.equal(runtime.room.getSnapshot().players.filter((p) => p.playerId === 'player-host').length, 1);
assert.equal(runtime.room.getSnapshot().players.filter((p) => p.playerId === 'bot-wingmate-r1').length, 1);

const stats = new CoopStatsCore({ runId: 'run-r28', now: () => 1000 });
stats.applyRoom(runtime.room.getSnapshot(), 1000);
stats.applyEconomySnapshot({ accounts: [
  { playerId: 'player-host', score: 900, kills: 4 },
  { playerId: 'bot-wingmate-r1', score: 640, kills: 3 },
  { playerId: 'player-ally', score: 500, kills: 0 }
] });
const snapshot = stats.getSnapshot(1100);
const ally = snapshot.players.find((p) => p.playerId === 'player-ally');
const bot = snapshot.players.find((p) => p.playerId === 'bot-wingmate-r1');
assert.equal(ally.currentPoints, 500);
assert.equal(bot.currentPoints, 640);
assert.equal(bot.connected, true);
assert.equal(bot.lifeState, 'ACTIVE');
assert.equal(bot.role, 'COMPANION');
assert.equal(bot.isBot, true);

console.log('BOT.1 R2.8 late-join companion integrity tests passed');
