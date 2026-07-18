import assert from 'node:assert/strict';
import fs from 'node:fs';
const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const authority = fs.readFileSync(new URL('./pvp1_core.js', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('./pvp3_rules_core.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const marker of [
  'pvp4-r1-competitive-maps-dynamic-hot-drops', 'dynamicHotDropRelocation',
  'consecutiveLocationReuseBlocked', 'playerProximityRelocationAvoidance',
  "competitiveMaps: ['crossfire_terminal', 'foundry_ring', 'skyline_relay']",
  'playerPositions: Object.values(this.room.players'
]) assert.ok(index.includes(marker), `missing Worker PVP.4 marker: ${marker}`);
for (const marker of ['relocatePvp4Pickup', 'CLAIMED_AND_RELOCATED', 'nextLocationId', 'revealAt']) {
  assert.ok(authority.includes(marker), `missing authority relocation marker: ${marker}`);
}
for (const marker of ['selectPvp4Relocation','PVP4_R1_MIN_RELOCATION_DISTANCE','PVP4_R1_PLAYER_SAFETY_RADIUS']) {
  assert.ok(rules.includes(marker), `missing rules relocation marker: ${marker}`);
}
assert.equal(pkg.version, '1.1.0-pvp4');
assert.ok(pkg.scripts.check.includes('src/pvp4_rules_core.test.js'));
assert.ok(pkg.scripts.check.includes('src/pvp4_contract.test.js'));
console.log('PVP.4 R1 Worker competitive map and dynamic hot-drop contract: PASS');
