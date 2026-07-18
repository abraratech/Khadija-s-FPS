import assert from 'node:assert/strict';
import fs from 'node:fs';

const mapRegistry = fs.readFileSync(new URL('../maps/map_registry.js', import.meta.url), 'utf8');
const mapRuntime = fs.readFileSync(new URL('../map.js', import.meta.url), 'utf8');
const arenas = fs.readFileSync(new URL('../maps/pvp_competitive_arenas.js', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('./pvp3_rules_core.js', import.meta.url), 'utf8');
const weapons = fs.readFileSync(new URL('../weapons.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const release = JSON.parse(fs.readFileSync(new URL('../../release-version.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(new URL('../../multiplayer-release.json', import.meta.url), 'utf8'));

for (const mapId of ['crossfire_terminal', 'foundry_ring', 'skyline_relay']) {
  assert.ok(mapRegistry.includes(mapId), `missing competitive map registry entry: ${mapId}`);
  assert.ok(rules.includes(mapId), `missing hot-drop layout for: ${mapId}`);
}
for (const marker of ['buildCrossfireTerminal', 'buildFoundryRing', 'buildSkylineRelay']) {
  assert.ok(mapRuntime.includes(marker), `map runtime missing ${marker}`);
  assert.ok(arenas.includes(marker), `competitive arena builder missing ${marker}`);
}
for (const marker of [
  'PVP4_R1_PATCH', 'selectPvp4Relocation', 'relocatePvp4Pickup',
  'PVP4_R1_MIN_RELOCATION_DISTANCE', 'PVP4_R1_PLAYER_SAFETY_RADIUS',
  'previousLocationId', 'revealAt'
]) assert.ok(rules.includes(marker), `missing dynamic hot-drop marker: ${marker}`);
for (const marker of ['pvp4PickupTelegraphed', 'pvp4PickupCountdownSeconds', 'NEW LOCATION']) {
  assert.ok(weapons.includes(marker), `missing hot-drop presentation marker: ${marker}`);
}
assert.ok(main.includes('pvp4-r1-competitive-maps-dynamic-hot-drops'));
assert.ok(release.releaseSequence >= 2026071805);
assert.equal(metadata.pvp4?.patch, 'pvp4-r1-competitive-maps-dynamic-hot-drops');
assert.equal(metadata.pvp4?.sourceBaselineSha, '1c6ef18390936d2c5c42689e728135ed393ed350');
assert.ok(release.releaseSequence >= 2026071805);
for (const field of [
  'mirroredTeamSpawns','multiLaneCombat','elevatedCoverPositions','dynamicHotDropRelocation',
  'serverAuthoritativeRelocation','consecutiveLocationReuseBlocked','nearbyLocationReuseBlocked',
  'playerProximityRelocationAvoidance','pickupOverlapAvoidance','arrivalBeaconCountdown',
  'roundInitialLocationsRotate','reconnectRelocationRestoration','workerChangeRequired','frontendAndWorker'
]) assert.equal(metadata.pvp4?.[field], true, `missing PVP.4 release policy: ${field}`);

console.log('PVP.4 R1 frontend competitive maps and dynamic hot-drop contract: PASS');
