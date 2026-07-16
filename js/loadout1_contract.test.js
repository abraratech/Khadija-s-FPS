import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const core = readFileSync(new URL('./loadout_core.js', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('./loadout.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/menu.css', import.meta.url), 'utf8');
const release = JSON.parse(readFileSync(new URL('../multiplayer-release.json', import.meta.url), 'utf8'));
const builder = readFileSync(new URL('../scripts/build_production.py', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('./cloud_profile_core.js', import.meta.url), 'utf8');
const workerCloud = readFileSync(new URL('../multiplayer-server/src/cloud_profile_core.js', import.meta.url), 'utf8');
const workerPackage = JSON.parse(readFileSync(new URL('../multiplayer-server/package.json', import.meta.url), 'utf8'));

for (const token of [
  'loadout1-r1-saved-presets-avatar-cosmetic-collections',
  'ka_loadout_profile_v1',
  'MAX_LOADOUT_PRESETS = 6',
  'MAX_AVATAR_PRESETS = 6',
  'createFrozenLoadoutSnapshot',
  'grantsCombatPower: false',
  'mergeLoadoutProfiles',
]) {
  assert.equal(core.includes(token), true, `Missing LOADOUT.1 core token: ${token}`);
}

for (const token of [
  'initializeLoadoutSystems',
  'freezeActiveLoadoutForRun',
  'clearFrozenLoadoutForRun',
  'FIELD LOADOUT COMMAND',
  'AVATAR PRESETS',
  'FAIR-PLAY POLICY',
  'ka:player-preferences-change',
]) {
  assert.equal(runtime.includes(token), true, `Missing LOADOUT.1 runtime token: ${token}`);
}

assert.equal(main.includes("from './loadout.js'"), true);
assert.equal(main.includes('freezeActiveLoadoutForRun'), true);
assert.equal(main.includes('player.loadoutPreferences = frozenLoadout'), true);
assert.equal(main.includes('clearFrozenLoadoutForRun'), true);
assert.equal(html.includes('id="ka-loadout-command"'), true);
assert.equal(html.includes('id="ka-avatar-presets"'), true);
assert.equal(css.includes('.ka-loadout-command-card'), true);
assert.equal(css.includes('.ka-avatar-preset-manager'), true);

assert.equal(release.patch, 'final2-r1-full-product-certification');
assert.equal(release.loadouts.patch, 'loadout1-r1-saved-presets-avatar-cosmetic-collections');
assert.equal(release.loadouts.patch, 'loadout1-r1-saved-presets-avatar-cosmetic-collections');
assert.equal(release.loadouts.schema, 1);
assert.equal(release.loadouts.savedWeaponPriorities, true);
assert.equal(release.loadouts.avatarPresets, true);
assert.equal(release.loadouts.cosmeticCollections, true);
assert.equal(release.loadouts.balancePolicy.startingWeapon, 'PISTOL');
assert.equal(release.loadouts.balancePolicy.grantsCombatPower, false);
assert.equal(release.loadouts.balancePolicy.weaponSelectionsArePreferences, true);

assert.equal(builder.includes('PATCH = "final2-r1-full-product-certification"'), true);
assert.equal(builder.includes('FINAL2_PRODUCTION_BUILD'), true);
assert.equal(cloud.includes("const LOADOUT_KEY = 'ka_loadout_profile_v1'"), true);
assert.equal(workerCloud.includes("const LOADOUT_KEY = 'ka_loadout_profile_v1'"), true);
assert.equal(cloud.includes('mergeLoadoutStorage'), true);
assert.equal(workerCloud.includes('mergeLoadoutStorage'), true);
assert.equal(workerPackage.scripts.check.includes('src/loadout_cloud_merge.test.js'), true);

console.log('LOADOUT.1 unified contract tests: PASS');
