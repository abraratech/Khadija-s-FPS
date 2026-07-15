// js/multiplayer/match2_r1_2_continuity_contract.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';

const foundation = fs.readFileSync(new URL('./foundation.js', import.meta.url), 'utf8');
const lobby = fs.readFileSync(new URL('./lobby.js', import.meta.url), 'utf8');
const bot = fs.readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
const weapons = fs.readFileSync(new URL('../weapons.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../../multiplayer-server/src/index.js', import.meta.url), 'utf8');

assert.ok(foundation.includes("scheduleHostVisibilityHandoff('host-tab-hidden')"));
assert.ok(foundation.includes('botManager?.handleHostMigration?.'));
assert.ok(lobby.includes("reason: String(reason || 'manual-host-transfer')"));
assert.ok(worker.includes("'host-tab-hidden'"));
assert.ok(bot.includes('restoredForHostMigration: true'));
assert.ok(bot.includes('AI WINGMAN CONTROL TRANSFERRED TO NEW HOST'));
assert.ok(weapons.includes("getWeaponFamily(weapon) === 'SNIPER'"));
assert.ok(weapons.includes('scopeOnlyADSActive'));
console.log('MATCH.2 R1.2 continuity contract tests passed');
