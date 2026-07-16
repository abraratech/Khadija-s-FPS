import assert from 'node:assert/strict';
import {
  addLocalRecentPlayer,
  buildSocialReport,
  normalizeParty,
  normalizePrivacy,
  normalizeSocialBootstrap,
  normalizeSocialId,
  shouldHideSocialMessage,
  socialStatusLabel
} from './social_core.js';

assert.equal(normalizeSocialId('social-0123456789abcdef01234567'), 'social-0123456789abcdef01234567');
assert.equal(normalizeSocialId('bad'), '');

assert.deepEqual(normalizePrivacy({
  presenceVisibility: 'private',
  friendRequests: 'nobody',
  partyInvites: 'nobody',
  allowFriendJoin: true,
  showRecentPlayers: false
}), {
  presenceVisibility: 'private',
  friendRequests: 'nobody',
  partyInvites: 'nobody',
  allowFriendJoin: true,
  showRecentPlayers: false
});

const now = 1_000_000;
const recent = addLocalRecentPlayer([], {
  socialId: 'social-0123456789abcdef01234567',
  displayName: '<Abrar>',
  presence: { online: true, status: 'match', expiresAt: now + 1000 }
}, { now, context: 'room:test' });
assert.equal(recent.length, 1);
assert.equal(recent[0].displayName, 'Abrar');
assert.equal(recent[0].lastContext, 'room:test');

assert.equal(shouldHideSocialMessage({
  blockedSocialIds: ['social-0123456789abcdef01234567'],
  senderSocialId: 'social-0123456789abcdef01234567'
}), true);

const report = buildSocialReport({
  targetSocialId: 'social-0123456789abcdef01234567',
  category: 'harassment',
  note: '<bad>\u0000',
  context: { roomId: 'room-1', mapId: 'grid_bunker', mode: 'match', wave: 12 },
  now
});
assert.equal(report.valid, true);
assert.equal(report.note, 'bad');
assert.equal(report.context.wave, 12);

const party = normalizeParty({
  partyId: 'party-123',
  partyCode: 'ABC234',
  leaderSocialId: 'social-0123456789abcdef01234567',
  localSocialId: 'social-0123456789abcdef01234567',
  members: [{
    socialId: 'social-0123456789abcdef01234567',
    displayName: 'Leader',
    presence: { online: true, status: 'menu', expiresAt: now + 1000 }
  }],
  room: {
    roomCode: 'A1B2C3',
    mapId: 'grid_bunker',
    expiresAt: now + 1000
  }
}, now);
assert.equal(party.isLeader, true);
assert.equal(party.room.roomCode, 'A1B2C3');

const bootstrap = normalizeSocialBootstrap({
  authenticated: true,
  accountType: 'passkey',
  self: {
    socialId: 'social-0123456789abcdef01234567',
    displayName: 'Player',
    friendCode: 'ABCDEFG2'
  },
  friends: [],
  privacy: {}
}, now);
assert.equal(bootstrap.authenticated, true);
assert.equal(bootstrap.self.friendCode, 'ABCDEFG2');
assert.equal(socialStatusLabel({ online: false }), 'OFFLINE');

console.log('SOCIAL.1 frontend core tests: PASS');
