// POST.1A R1 - co-op integrity contract regression tests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = new URL('./', import.meta.url);
const read = (name) => readFile(new URL(name, base), 'utf8');
const [weapons, economy, hud, main, shared, revive, foundation, remotePlayers, cloud] = await Promise.all([
  read('../weapons.js'),
  read('./economy.js'),
  read('./network_hud.js'),
  read('../main.js'),
  read('./shared_world.js'),
  read('./revive.js'),
  read('./foundation.js'),
  read('./remote_players.js'),
  read('../cloud_profile.js')
]);

assert.match(weapons, /enemy\.dyingT === undefined[\s\S]*Number\(enemy\.dyingT\) < 0/);
assert.match(economy, /replaceAccountsFromSnapshot\(snapshot\)/);
assert.match(economy, /this\.accounts\.clear\(\)[\s\S]*this\.accounts\.set/);
assert.match(hud, /debugNetworkMetricsEnabled/);
assert.doesNotMatch(hud, /EPOCH \$\{snapshot\.authorityEpoch\}/);
assert.match(main, /live voice was removed from the player-facing build/);
assert.doesNotMatch(main, /import '\.\/multiplayer\/live_voice\.js'/);
assert.match(shared, /this\.revive\?\.applyAuthorityDamage/);
assert.doesNotMatch(shared, /\|\| roomPlayer\.connected === false\s*\|\| this\.isLateJoinProtected/);
assert.match(revive, /applyAuthorityDamage\(playerId, damage/);
assert.match(revive, /authoritativeHealth < Number\(this\.player\?\.health/);
assert.match(foundation, /revive: reviveManager/);
assert.match(remotePlayers, /const isAway = playerRecord\?\.connected === false/);
assert.match(cloud, /CLOUD_SERVICE_UNAVAILABLE/);
assert.match(cloud, /if \(existing\)[\s\S]*scheduleRemoteQueueRetry\(\)/);

console.log('POST.1A co-op integrity contract tests passed');
