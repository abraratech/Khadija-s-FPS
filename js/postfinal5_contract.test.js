import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const index = fs.readFileSync(new URL('index.html', root), 'utf8');
const social = fs.readFileSync(new URL('js/social.js', root), 'utf8');
const safetyCore = fs.readFileSync(new URL('js/social_safety_core.js', root), 'utf8');
const transport = fs.readFileSync(new URL('js/multiplayer/transport.js', root), 'utf8');
const moderation = fs.readFileSync(new URL('moderation.html', root), 'utf8');
const admin = fs.readFileSync(new URL('js/moderation_admin.js', root), 'utf8');
const build = fs.readFileSync(new URL('scripts/build_production.py', root), 'utf8');
const release = JSON.parse(fs.readFileSync(new URL('multiplayer-release.json', root), 'utf8'));

assert.ok(index.includes('id="social-report-status-list"'));
assert.ok(index.includes('id="social-appeal-form"'));
assert.ok(social.includes("'/social/appeals/create'"));
assert.ok(social.includes('renderSafety'));
assert.ok(safetyCore.includes('REVIEW COMPLETE'));
assert.ok(transport.includes("code.includes('RESTRICTED')"));
assert.ok(moderation.includes('MODERATION COMMAND'));
assert.ok(moderation.includes('noindex,nofollow,noarchive'));
assert.ok(admin.includes("sessionStorage"));
assert.ok(admin.includes('/ops/admin/reports/action'));
assert.ok(build.includes('moderation.html'));
assert.equal(release.postFinal5.patch, 'post-final5-r1-moderation-player-safety-operations');
assert.equal(release.postFinal5.workerChangeRequired, true);
assert.equal(release.protocol, 6);
console.log('POST-FINAL.5 frontend contract tests passed');
