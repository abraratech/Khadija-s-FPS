import assert from 'node:assert/strict';
import {
  normalizeArenaId,
  normalizeSocialBootstrap,
  normalizeSocialPlayer
} from './social_core.js';
import { buildArenaShareUrl, createQrMatrix } from './social2_qr.js';

assert.equal(normalizeArenaId('abrar # 7k2p'), 'ABRAR#7K2P');
assert.equal(normalizeArenaId('A#1234'), '');
const player = normalizeSocialPlayer({
  socialId: 'social-0123456789abcdef01234567',
  displayName: 'Abrar',
  arenaId: 'ABRAR#7K2P',
  relationship: 'search'
}, 100);
assert.equal(player.arenaId, 'ABRAR#7K2P');
assert.equal(player.relationship, 'search');
const bootstrap = normalizeSocialBootstrap({
  authenticated: true,
  accountType: 'passkey',
  self: {
    socialId: 'social-0123456789abcdef01234567',
    displayName: 'Abrar',
    arenaId: 'ABRAR#7K2P'
  }
}, 100);
assert.equal(bootstrap.patch, 'social2-r1-arena-id-friend-discovery');
assert.equal(bootstrap.self.arenaId, 'ABRAR#7K2P');
const url = buildArenaShareUrl('ABRAR#7K2P', {
  origin: 'https://khadija-s-fps.pages.dev',
  pathname: '/'
});
assert.match(url, /friend=ABRAR%237K2P/);
const matrix = createQrMatrix(url);
assert.ok(matrix.length >= 21);
assert.equal(matrix.length, matrix[0].length);
console.log('SOCIAL.2 Arena identity and QR core tests: PASS');
