import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../../multiplayer-server/src/index.js', import.meta.url), 'utf8');
const room = read('./room.js');
const bot = read('./bot.js');
const foundation = read('./foundation.js');
const world = read('./shared_world.js');
const stats = read('./coop_stats_core.js');

assert.ok(worker.includes('resolveRelayActorIdentity'));
assert.ok(worker.includes('senderPlayerId: relayIdentity.senderPlayerId'));
assert.ok(worker.includes('virtualPlayersAuthoritative: true'));
assert.ok(worker.includes("action === 'set-virtual-companion'"));
assert.ok(room.includes('if (this.players.has(virtualId)) return null;'));
assert.ok(room.includes("if (player.isBot === true)"));
assert.ok(bot.includes('this.syncCompanionRoster(true)'));
assert.ok(bot.includes('this.syncCompanionRoster(false)'));
assert.ok(foundation.includes('publishLateJoinIntegrityBurst'));
assert.ok(foundation.includes('botManager?.publishSnapshot?.(burstNow, true)'));
assert.ok(world.includes('isAuthorizedRemoteCombatant'));
assert.ok(stats.includes("'COMPANION'"));

console.log('BOT.1 R2.8 contract tests passed');
