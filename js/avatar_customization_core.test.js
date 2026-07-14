import assert from 'node:assert/strict';
import {
  AVATAR_PROFILE_KEY,
  AVATAR_PROFILE_VERSION,
  DEFAULT_AVATAR_PROFILE,
  avatarProfileFingerprint,
  getAvatarPalette,
  normalizeAvatarProfile,
  parseAvatarProfile,
  randomizeAvatarProfile,
  serializeAvatarProfile,
} from './avatar_customization_core.js';

assert.equal(AVATAR_PROFILE_KEY, 'ka_avatar_profile_v1');
assert.equal(AVATAR_PROFILE_VERSION, 1);
assert.deepEqual(normalizeAvatarProfile({}), DEFAULT_AVATAR_PROFILE);
assert.deepEqual(parseAvatarProfile('{bad-json'), DEFAULT_AVATAR_PROFILE);

const custom = normalizeAvatarProfile({
  skin: 'deep', suit: 'violet', armor: 'ivory', accent: 'neon-pink', hairStyle: 'cap', hairColor: 'silver',
});
assert.equal(custom.skin, 'deep');
assert.equal(custom.hairStyle, 'cap');
assert.deepEqual(parseAvatarProfile(serializeAvatarProfile(custom)), custom);
assert.match(getAvatarPalette(custom).accent, /^#[0-9a-f]{6}$/i);
assert.equal(avatarProfileFingerprint(custom).split('|').length, 6);

const values = [0.99, 0.01, 0.5, 0.34, 0.7, 0.2];
let index = 0;
const randomized = randomizeAvatarProfile(() => values[index++]);
assert.equal(randomized.version, 1);
assert.notDeepEqual(randomized, DEFAULT_AVATAR_PROFILE);

const invalid = normalizeAvatarProfile({ skin: 'not-real', suit: '<script>', hairStyle: 'mohawk' });
assert.equal(invalid.skin, DEFAULT_AVATAR_PROFILE.skin);
assert.equal(invalid.suit, DEFAULT_AVATAR_PROFILE.suit);
assert.equal(invalid.hairStyle, DEFAULT_AVATAR_PROFILE.hairStyle);

console.log('avatar customization core: PASS');
