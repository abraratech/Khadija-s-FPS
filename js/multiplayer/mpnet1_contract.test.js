import assert from 'node:assert/strict';
import fs from 'node:fs';

const [releaseText, versionText, economy, revive, network, hud, registry, weapons, foundation, main] = [
  '../../multiplayer-release.json',
  '../../release-version.json',
  './economy.js',
  './revive.js',
  './network_quality.js',
  './network_hud.js',
  './player_registry.js',
  '../weapons.js',
  './foundation.js',
  '../main.js'
].map((path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const release = JSON.parse(releaseText);
const version = JSON.parse(versionText);
assert.equal(version.releaseId, 'mpnet1-r1-relay-transaction-resupply-integrity');
assert.equal(version.releaseSequence, 2026071806);
assert.equal(release.mpnet1.atomicHealthEconomyTransactions, true);
assert.equal(release.mpnet1.transactionResultReplay, true);
assert.equal(release.mpnet1.emergencyPistolResupply, true);
assert.match(economy, /transactionResults:/);
assert.match(economy, /transaction-ack/);
assert.match(economy, /economy-transaction-timeout/);
assert.match(revive, /applyAuthorityHealthGrant/);
assert.match(foundation, /commitAuthorityResourceGrant/);
assert.match(network, /DEFAULT_WORSEN_HOLD_MS = 7000/);
assert.match(network, /sampleWindowMs/);
assert.match(hud, /ms RTT/);
assert.match(registry, /allAmmoEmpty/);
assert.match(weapons, /emergency-pistol-ammo/);
assert.match(main, /KHADIJA_MPNET_PATCH/);
console.log('MPNET.1 frontend integration contract: PASS');
