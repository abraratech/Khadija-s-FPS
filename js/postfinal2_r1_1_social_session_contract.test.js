import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cloud = readFileSync(new URL('./cloud_profile.js', import.meta.url), 'utf8');
const social = readFileSync(new URL('./social.js', import.meta.url), 'utf8');

assert.ok(cloud.includes("new CustomEvent('ka:cloud-auth-changed', { detail })"));
assert.ok(cloud.includes("reason: 'passkey-signin'"));
assert.ok(cloud.includes("reason: 'signout'"));
assert.ok(cloud.includes("reason: 'session-expired'"));
assert.ok(cloud.includes("reason: verified.upgraded ? 'passkey-upgraded' : 'passkey-added'"));

assert.ok(social.includes('function handleCloudAuthChanged(event)'));
assert.ok(social.includes("window.addEventListener('ka:cloud-auth-changed', handleCloudAuthChanged)"));
assert.ok(social.includes("setStatus('REFRESHING SOCIAL PROFILE…', 'neutral')"));
assert.ok(social.includes('void refreshSocial({ silent: true }).then(() => publishPresence({ force: true }))'));
assert.ok(social.includes("setStatus('PASSKEY SOCIAL SIGN-IN REQUIRED', 'warning')"));

console.log('POST-FINAL.2 R1.1 frontend Social session refresh contract: PASS');
