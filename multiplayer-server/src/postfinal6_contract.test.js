import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const opsHub = fs.readFileSync(new URL('./ops_hub.js', import.meta.url), 'utf8');
const opsCore = fs.readFileSync(new URL('./ops1_core.js', import.meta.url), 'utf8');
const adminCore = fs.readFileSync(new URL('./postfinal6_admin_core.js', import.meta.url), 'utf8');
const socialHub = fs.readFileSync(new URL('./social_hub.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const route of [
  '/ops/admin/auth/bootstrap/status',
  '/ops/admin/auth/bootstrap/options',
  '/ops/admin/auth/bootstrap/verify',
  '/ops/admin/auth/login/options',
  '/ops/admin/auth/login/verify',
  '/ops/admin/auth/enroll/options',
  '/ops/admin/auth/enroll/verify',
  '/ops/admin/auth/session',
  '/ops/admin/auth/logout',
  '/ops/admin/reports/assign',
  '/ops/admin/reports/note',
  '/ops/admin/cases',
  '/ops/admin/restrictions/action',
  '/ops/admin/audit/export',
  '/ops/admin/platform',
  '/ops/admin/staff',
  '/ops/admin/staff/invite',
  '/ops/admin/staff/role',
  '/ops/admin/staff/status',
  '/ops/admin/sessions',
  '/ops/admin/sessions/revoke',
  '/ops/admin/passkeys/register/options',
  '/ops/admin/passkeys/register/verify',
  '/ops/admin/passkeys/revoke'
]) assert.ok(opsHub.includes(route), route);

assert.ok(opsHub.includes('verifyPasskeyRegistration'));
assert.ok(opsHub.includes('verifyPasskeyAuthentication'));
assert.ok(opsHub.includes("this.requirePermission(actor, 'reports.ban')"));
assert.ok(opsHub.includes('validateDecisionConfirmation'));
assert.ok(opsHub.includes('OPS_ALERT_WEBHOOK_URL'));
assert.ok(opsHub.includes('moderationAuditCsv'));
assert.ok(adminCore.includes("'viewer'"));
assert.ok(adminCore.includes("'moderator'"));
assert.ok(adminCore.includes("'senior-moderator'"));
assert.ok(adminCore.includes("'owner'"));
assert.ok(adminCore.includes('automatic') === false);
assert.ok(socialHub.includes('/internal/social/ops/summary'));
assert.ok(index.includes('productionOperationsHardening: POST_FINAL6_SERVER_INFO'));
assert.ok(index.includes("sourceBaselineSha: CERTIFIED_FRONTEND_SHA"));
assert.ok(opsCore.includes("post-final6-r1-production-operations-hardening"));
assert.ok(packageJson.scripts.check.includes('postfinal6_admin_core.test.js'));
assert.ok(packageJson.scripts.check.includes('postfinal6_contract.test.js'));
console.log('POST-FINAL.6 Worker contract tests passed');
