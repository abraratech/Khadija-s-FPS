import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const weapons = fs.readFileSync(new URL('../weapons.js', import.meta.url), 'utf8');
const manager = fs.readFileSync(new URL('./pvp1.js', import.meta.url), 'utf8');
const policy = fs.readFileSync(new URL('./pvp1_core.js', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('./pvp3_rules_core.js', import.meta.url), 'utf8');
const release = JSON.parse(fs.readFileSync(new URL('../../release-version.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(new URL('../../multiplayer-release.json', import.meta.url), 'utf8'));

for (const marker of [
  'pvp3-r2-dedicated-rules-neutral-pickups',
  'PVP3_R2_ARMOR_CAP',
  'createPvp3PickupState',
  'neutral'
]) assert.ok(rules.includes(marker), `missing PVP.3 R2 rules marker: ${marker}`);

for (const marker of [
  'if (isPvpRulesRun())',
  'clearPvpPickupMeshes',
  'syncPvpPickupVisuals',
  'updatePvpPickupClaim',
  'requestPickup',
  'applyPvpRulesState',
  'ARMOR FULL'
]) assert.ok(weapons.includes(marker), `missing PVP.3 R2 weapon/pickup marker: ${marker}`);

assert.ok(weapons.indexOf('if (isPvpRulesRun())') < weapons.indexOf("spawnShop('AMMO'"), 'PvP must exit before any Co-Op shop is spawned');
assert.match(main, /while \(doors\.length > 0\) openDoor\(doors\[0\]\)/);
assert.match(main, /requestMultiplayerPvpPickup/);
assert.match(main, /applyPvpRulesState/);
assert.match(manager, /action === 'pvp-pickup-result'/);
assert.match(manager, /requestPickup\(pickupId\)/);
assert.match(policy, /unlockedWeapons/);
assert.match(policy, /localArmor/);
assert.match(policy, /pickups: normalizePvp3PickupState/);

assert.ok(release.releaseSequence >= 2026071804);
assert.equal(metadata.pvp3?.patch, 'pvp3-r2-dedicated-rules-neutral-pickups');
assert.equal(metadata.pvp3?.sourceBaselineSha, '484eccb0b96d396da839e7c25000f21cbcbc41fc');
for (const field of [
  'dedicatedPvpRuleset',
  'coopShopsDisabledInPvp',
  'coopPerksDisabledInPvp',
  'coopEconomyDisabledInPvp',
  'pvpDoorsOpenAtRoundLoad',
  'neutralWeaponPickups',
  'neutralAmmoPickups',
  'neutralArmorPickups',
  'serverAuthoritativePickupClaims',
  'serverAuthoritativeWeaponOwnership',
  'armorDamageAbsorption',
  'pickupsResetEveryRound',
  'equalPistolRoundStart',
  'workerChangeRequired',
  'frontendAndWorker'
]) assert.equal(metadata.pvp3?.[field], true, `missing PVP.3 R2 release policy: ${field}`);

console.log('PVP.3 R2 frontend dedicated ruleset and neutral pickup contract: PASS');
