import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
const runtime = fs.readFileSync('js/avatar_customization.js', 'utf8');
const core = fs.readFileSync('js/avatar_customization_core.js', 'utf8');

function once(text, fragment, label) {
  assert.equal(text.split(fragment).length - 1, 1, `${label} must appear exactly once`);
}

once(html, 'id="ka-avatar-studio-style"', 'Avatar Studio style block');
once(html, 'data-menu-screen="avatar"', 'Avatar Studio screen');
once(html, 'id="ka-avatar-preview"', 'Avatar preview');
once(html, 'id="ka-avatar-save"', 'Avatar save action');
once(html, '<script src="js/avatar_customization.js" type="module"></script>', 'Avatar runtime module');
assert.ok(html.includes('data-next-screen="avatar"'), 'Avatar navigation missing');
assert.ok(html.includes('LOCAL + CLOUD READY'), 'Cloud-ready avatar messaging missing');
assert.ok(html.includes('@media (max-height: 520px) and (orientation: landscape)'), 'Short landscape Avatar Studio layout missing');
assert.ok(html.includes('min-height: 42px'), 'Touch-friendly avatar option sizing missing');
assert.ok(core.includes("export const AVATAR_PROFILE_KEY = 'ka_avatar_profile_v1';"), 'Cloud-owned avatar storage key missing');
assert.ok(runtime.includes("getObjectByName?.('ka-third-person-avatar')"), 'Third-person avatar application missing');
assert.ok(runtime.includes("new CustomEvent('ka-avatar-profile-change'"), 'Avatar change event missing');
assert.ok(runtime.includes('window.KHADIJA_AVATAR = Object.freeze'), 'Avatar runtime API missing');

console.log('Avatar Studio UI and runtime contract: PASS');
