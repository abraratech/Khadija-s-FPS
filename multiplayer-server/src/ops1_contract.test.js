import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const hub = readFileSync(new URL('./ops_hub.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('./ops1_core.js', import.meta.url), 'utf8');
const social = readFileSync(new URL('./social_hub.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

for (const route of [
  '/ops/events',
  '/ops/health',
  '/ops/privacy',
  '/ops/admin/summary',
  '/ops/admin/reports',
  '/ops/admin/reports/action',
  '/ops/admin/audit',
  '/internal/ops/moderation/check'
]) {
  assert.match(hub, new RegExp(route.replaceAll('/', '\\/')));
}
assert.match(hub, /OPS_ADMIN_TOKEN/);
assert.match(hub, /x-ka-internal-ops/);
assert.match(hub, /rawIpStored: false/);
assert.match(hub, /chatTranscriptCollectedByDefault: false/);
assert.match(hub, /moderationRestrictionForAction/);
assert.match(hub, /restriction:/);
assert.match(core, /OPS1_EVENT_RETENTION_MS = 14/);
assert.match(core, /OPS1_REPORT_RETENTION_MS = 180/);
assert.match(core, /redactOpsServerText/);
assert.match(index, /OpsHub/);
assert.match(index, /proxyOpsRequest/);
assert.match(index, /observeOpsResponse/);
assert.match(index, /\/ops\//);
assert.match(social, /forwardReportToOps/);
assert.match(social, /internal\/ops\/moderation\/report/);
assert.match(social, /internal\/ops\/moderation\/check/);
assert.match(social, /SOCIAL_ACCOUNT_RESTRICTED/);
assert.match(wrangler, /"name": "OPS"/);
assert.match(wrangler, /"class_name": "OpsHub"/);
assert.match(wrangler, /"tag": "v6"/);

const check = packageJson.scripts.check;
for (const required of [
  'node --check src/ops1_core.js',
  'node --check src/ops_hub.js',
  'node src/ops1_core.test.js',
  'node src/ops1_contract.test.js'
]) {
  assert.ok(check.includes(required), required);
}

console.log('ops1 worker contract tests passed');
