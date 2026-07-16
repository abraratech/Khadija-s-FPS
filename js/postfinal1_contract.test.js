import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/postfinal1.css', import.meta.url), 'utf8');
const social = readFileSync(new URL('./social.js', import.meta.url), 'utf8');
const builder = readFileSync(new URL('../scripts/build_production.py', import.meta.url), 'utf8');
const release = JSON.parse(readFileSync(new URL('../multiplayer-release.json', import.meta.url), 'utf8'));

assert.match(index, /css\/postfinal1\.css/);
assert.ok(index.lastIndexOf('css/postfinal1.css') < index.indexOf('</head>'));
for (const token of [
  'body.ka-mobile-device .ka-home-live-card',
  'body.ka-mobile-device .ka-live1-hud',
  'body.ka-mobile-device .ka-content1-hud',
  'body.ka-mobile-device #ka-coop2-hud',
  'body.ka-mobile-device #multiplayer-network-hud',
  'body.ka-mobile-device #ka-quick-message-mobile-button'
]) assert.ok(css.includes(token), `Missing mobile clarity token: ${token}`);
assert.ok(css.includes('display: none !important;'));
assert.ok(social.includes('PASSKEY SESSION REQUIRED — SIGN IN AGAIN'));
assert.ok(social.includes('failure.status = response.status'));
assert.equal(release.postFinalHotfix.patch, 'post-final1-r1-mobile-clarity-social-recovery');
assert.equal(release.postFinalHotfix.mobileClarity, true);
assert.equal(release.postFinalHotfix.socialRecovery, true);
assert.ok(builder.includes('POST_FINAL_PATCH = "post-final1-r1-mobile-clarity-social-recovery"'));
console.log('POST-FINAL.1 mobile clarity and social UX contract: PASS');
