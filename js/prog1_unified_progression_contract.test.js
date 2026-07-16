import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const progression = readFileSync(new URL('./progression.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('./progression_core.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
const career = readFileSync(new URL('./career_achievements.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('./cloud_profile_core.js', import.meta.url), 'utf8');
const workerCloud = readFileSync(new URL('../multiplayer-server/src/cloud_profile_core.js', import.meta.url), 'utf8');

for (const token of [
  'prog1-r1-unified-progression-retention',
  'normalizeProgressionProfile',
  'applyProgressionOperationEvent',
  'calculateProgressionRunReward',
  'equipProgressionCosmetic',
  'recordProgressionRevive',
  'recentRuns',
  'dailyOperationsCompleted',
  'weeklyOperationsCompleted'
]) {
  assert.equal(progression.includes(token) || core.includes(token), true, `Missing PROG.1 token: ${token}`);
}

assert.equal(main.includes('recordProgressionRevive'), true);
assert.equal(main.includes('botAssisted: summary.botAssisted === true'), true);
assert.equal(ui.includes('final-xp-breakdown'), true);
assert.equal(career.includes('CAREER COMMAND'), true);
assert.equal(career.includes('ACTIVE OPERATIONS'), true);
assert.equal(career.includes('PROFILE REWARDS'), true);
assert.equal(html.includes('prog1-postmatch-panel'), true);
assert.equal(html.includes('profile-title'), true);
assert.equal(cloud.includes('normalizeProgressionValue'), true);
assert.equal(workerCloud.includes('normalizeProgressionValue'), true);

console.log('PROG.1 unified progression contract tests: PASS');
