import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDefaultLoadout2MasteryProfile,
  applyLoadout2MasteryReceipt,
  mergeLoadout2MasteryProfiles
} from './loadout2_mastery_core.js';

const base = createDefaultLoadout2MasteryProfile(1000);
const local = applyLoadout2MasteryReceipt(base, {
  receiptId: 'local-loadout2', runId: 'local', gameMode: 'survival', specializationId: 'VANGUARD',
  families: { MELEE: { xp: 500, strikes: 10, hits: 8, kills: 3 } }, createdAt: 1100
}, 1200).profile;
const remote = applyLoadout2MasteryReceipt(base, {
  receiptId: 'remote-loadout2', runId: 'remote', gameMode: 'survival', specializationId: 'MARKSMAN',
  families: { SNIPER: { xp: 700, shots: 50, hits: 30, kills: 9 } }, createdAt: 1300
}, 1400).profile;
const merged = mergeLoadout2MasteryProfiles(local, remote, 1500);
assert.equal(merged.families.MELEE.xp, 500);
assert.equal(merged.families.SNIPER.xp, 700);
assert.equal(merged.receipts.length, 2);
assert.equal(merged.receipts.some((entry) => entry.receiptId === 'local-loadout2'), true);
assert.equal(merged.receipts.some((entry) => entry.receiptId === 'remote-loadout2'), true);

const cloud = readFileSync(new URL('./cloud_profile.js', import.meta.url), 'utf8');
assert.match(cloud, /mergedLoadout2/);
assert.match(cloud, /merged\.progression\.loadout2 = mergedLoadout2/);
assert.match(cloud, /progressionStorage\.loadout2 = mergedLoadout2/);

console.log('LOADOUT.2 cloud mastery merge tests passed');
