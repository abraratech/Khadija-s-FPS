import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POST_FINAL9_COSMETIC_CATALOG,
  POST_FINAL9_FACTIONS,
  POST_FINAL9_PATCH,
  createDefaultPostFinal9Economy
} from './postfinal9_economy_core.js';
import { MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE } from './multiplayer/production_release_core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const release = JSON.parse(read('multiplayer-release.json'));
const progressionCore = read('js/progression_core.js');
const progression = read('js/progression.js');
const main = read('js/main.js');
const cloud = read('js/cloud_profile.js');
const ui = read('js/ui.js');
const index = read('index.html');
const hud = read('css/hud.css');
const builder = read('scripts/build_production.py');
const workerIndex = read('multiplayer-server/src/index.js');
const workerHub = read('multiplayer-server/src/cloud_profile_hub.js');
const workerAuthority = read('multiplayer-server/src/progression_authority_core.js');
const packageJson = JSON.parse(read('multiplayer-server/package.json'));

assert.equal(release.protocol, 6);
assert.equal(release.certifiedBaselineSha, MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE);
assert.equal(release.postFinal9.patch, POST_FINAL9_PATCH);
assert.equal(release.postFinal9.sourceBaselineSha, 'bde3ff8d8fa5f29948c82ec4fa20959685e92846');
assert.equal(release.postFinal9.certifiedFrontendBaselineSha, MULTIPLAYER_PRODUCTION_CERTIFIED_BASELINE);
assert.equal(release.postFinal9.workerChangeRequired, true);
assert.equal(release.postFinal9.frontendOnly, false);
assert.equal(release.postFinal9.protocolUnchanged, true);
assert.equal(release.postFinal9.factionReputationTracks, POST_FINAL9_FACTIONS.length);
assert.equal(release.postFinal9.deterministicCosmeticCollections, true);
assert.equal(release.postFinal9.duplicateProtection, 'convert-to-salvage');
assert.equal(release.cloudProfiles.progressionIntegrity.economyAuthorityPatch, POST_FINAL9_PATCH);

const economy = createDefaultPostFinal9Economy(Date.UTC(2026, 6, 17), 0);
assert.equal(economy.patch, POST_FINAL9_PATCH);
assert.equal(Object.keys(economy.currencies.factionTokens).length, POST_FINAL9_FACTIONS.length);
assert.ok(POST_FINAL9_COSMETIC_CATALOG.length >= 12);

assert.match(progressionCore, /PROGRESSION_VERSION = 3/);
assert.match(progressionCore, /normalizePostFinal9Economy/);
assert.match(progressionCore, /ECONOMY_COLLECTION/);
assert.match(progression, /applyPostFinal9EconomyReceipt/);
assert.match(progression, /economyReceiptFields/);
assert.match(progression, /economyAward/);
assert.match(progression, /getPostFinal9EconomyPresentation/);
assert.match(main, /loadoutId/);
assert.match(main, /primaryWeaponId/);
assert.match(cloud, /ka:postfinal9-economy-verified/);
assert.match(cloud, /value\.receipt\?\.economy/);

for (const id of [
  'progression-prestige',
  'progression-wallet',
  'final-economy-credits',
  'final-economy-salvage',
  'final-economy-tokens',
  'final-economy-reputation',
  'final-weapon-mastery',
  'final-loadout-mastery',
  'final-mission-mastery',
  'final-collection-drop',
  'final-economy-progress',
  'final-economy-goals'
]) assert.match(index, new RegExp(`id="${id}"`));
assert.match(ui, /final-economy-credits/);
assert.match(ui, /final-economy-goals/);
assert.match(hud, /progression-prestige/);
assert.match(hud, /progression-wallet/);

assert.match(workerAuthority, /applyPostFinal9EconomyReceipt/);
assert.match(workerAuthority, /POST_FINAL9_ECONOMY_RECEIPT_INVALID/);
assert.match(workerHub, /economyAuthorityPatch/);
assert.match(workerHub, /economy: result\.economy/);
assert.match(workerIndex, /economyRewardsProgression: POST_FINAL9_SERVER_INFO/);
assert.match(workerIndex, /serverAuthoritativeCurrencies: true/);
assert.match(packageJson.scripts.check, /postfinal9_economy_core\.test\.js/);
assert.match(packageJson.scripts.check, /postfinal9_contract\.test\.js/);

assert.match(builder, /POST_FINAL9_PATCH/);
assert.match(builder, /POST_FINAL9_SOURCE_BASELINE_SHA/);
assert.match(builder, /POST_FINAL9_CERTIFIED_FRONTEND_BASELINE_SHA/);
assert.match(builder, /"post_final9"/);
assert.match(builder, /"worker_change_required": True/);
assert.match(builder, /"frontend_only": False/);

console.log('POST-FINAL.9 combined release contract passed');
