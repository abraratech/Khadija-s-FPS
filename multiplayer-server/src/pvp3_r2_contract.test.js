import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const pvp = fs.readFileSync(new URL('./pvp1_core.js', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('./pvp3_rules_core.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const marker of [
  'pvp3-r2-dedicated-rules-neutral-pickups',
  'serverAuthoritativePickupClaims',
  'serverAuthoritativeWeaponOwnership',
  "action === 'pvp-pickup'",
  "action: 'pvp-pickup-result'",
  'resolvePvp3PickupClaim',
  'mapId: this.room.settings.mapId'
]) assert.ok(index.includes(marker), `missing PVP.3 R2 Worker marker: ${marker}`);

for (const marker of [
  'WEAPON_NOT_OWNED',
  'armorAbsorbed',
  'PICKUP_OUT_OF_RANGE',
  'PICKUP_COOLDOWN',
  "entry.unlockedWeapons = ['PISTOL']",
  'state.pickups = createPvp3PickupState'
]) assert.ok(pvp.includes(marker), `missing PVP.3 R2 authority marker: ${marker}`);

assert.match(rules, /PVP3_R2_PICKUP_CLAIM_RADIUS/);
assert.match(rules, /PVP3_R2_POSE_FRESHNESS_MS/);
assert.match(rules, /createPvp3PickupState/);
assert.ok(String(packageJson.scripts?.check || '').includes('src/pvp3_rules_core.test.js'));
assert.ok(String(packageJson.scripts?.check || '').includes('src/pvp3_r2_contract.test.js'));

console.log('PVP.3 R2 Worker dedicated ruleset and neutral pickup contract: PASS');
