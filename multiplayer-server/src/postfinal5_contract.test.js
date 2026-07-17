import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const opsHub = fs.readFileSync(new URL('./ops_hub.js', import.meta.url), 'utf8');
const opsCore = fs.readFileSync(new URL('./ops1_core.js', import.meta.url), 'utf8');
const socialHub = fs.readFileSync(new URL('./social_hub.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const route of [
  '/ops/admin/summary',
  '/ops/admin/reports',
  '/ops/admin/reports/action',
  '/ops/admin/appeals',
  '/ops/admin/appeals/action',
  '/ops/admin/restrictions',
  '/ops/admin/audit'
]) assert.ok(opsHub.includes(route), route);
for (const route of [
  '/internal/ops/moderation/status',
  '/internal/ops/moderation/appeal'
]) assert.ok(opsHub.includes(route), route);
assert.ok(opsHub.includes('moderationReportGroup'));
assert.ok(opsHub.includes('moderationReporterHistory'));
assert.ok(opsCore.includes('automaticPenalty: false'));
assert.ok(socialHub.includes("report-forward:"));
assert.ok(socialHub.includes('setAlarm'));
assert.ok(socialHub.includes("'/social/safety/status'"));
assert.ok(socialHub.includes("'/social/appeals/create'"));
assert.ok(socialHub.includes('allowRestricted: true'));
assert.ok(index.includes('playerSafetyOperations: POST_FINAL5_SERVER_INFO'));
assert.ok(packageJson.scripts.check.includes('postfinal5_moderation_core.test.js'));
assert.ok(packageJson.scripts.check.includes('postfinal5_contract.test.js'));
console.log('POST-FINAL.5 Worker contract tests passed');
