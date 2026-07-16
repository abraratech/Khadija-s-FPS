import assert from 'node:assert/strict';
import {
  addRecentOpponent,
  blocksPair,
  canReceiveFriendRequest,
  cleanAccountId,
  cleanFriendCode,
  cleanSocialId,
  normalizeParty,
  normalizePartyMatchmakingClaim,
  normalizePrivacy,
  normalizeSocialRecord
} from './social_core.js';

const aId = 'cloud-0123456789abcdef0123456789abcdef';
const bId = 'cloud-fedcba9876543210fedcba9876543210';
assert.equal(cleanAccountId(aId), aId);
assert.equal(cleanSocialId('social-0123456789abcdef01234567'), 'social-0123456789abcdef01234567');
assert.equal(cleanFriendCode('abcd-efg2'), 'ABCDEFG2');

const a = normalizeSocialRecord({
  accountId: aId,
  socialId: 'social-0123456789abcdef01234567',
  friendCode: 'ABCDEFG2',
  privacy: { friendRequests: 'everyone' }
}, { accountId: aId, now: 100 });
const b = normalizeSocialRecord({
  accountId: bId,
  socialId: 'social-fedcba9876543210fedcba98',
  friendCode: 'HJKLMN23'
}, { accountId: bId, now: 100 });

assert.equal(canReceiveFriendRequest(b, a), true);
a.blocks = [bId];
assert.equal(blocksPair(a, b), true);
assert.equal(canReceiveFriendRequest(b, a), false);

const recent = addRecentOpponent(
  { ...a, blocks: [] },
  bId,
  { now: 500, context: 'room:1' }
);
assert.equal(recent.recent[0].accountId, bId);
assert.equal(recent.recent[0].context, 'room:1');

const party = normalizeParty({
  partyId: 'party-1',
  partyCode: 'ABC234',
  leaderAccountId: aId,
  members: [aId, bId]
}, 100);
assert.equal(party.members.length, 2);
assert.equal(party.leaderAccountId, aId);

assert.deepEqual(normalizePrivacy({ presenceVisibility: 'invalid' }), {
  presenceVisibility: 'friends',
  friendRequests: 'everyone',
  partyInvites: 'friends',
  allowFriendJoin: false,
  showRecentPlayers: true
});


const partyClaim = normalizePartyMatchmakingClaim({
  partyId: 'party-abc',
  leaderAccountId: aId,
  leaderSocialId: 'social-0123456789abcdef01234567',
  playerId: 'player-a',
  tabId: 'tab-a',
  protocol: 6,
  build: 'm5-coop-turn-fallback-r1',
  memberAccountIds: [aId, bId],
  memberSocialIds: [
    'social-0123456789abcdef01234567',
    'social-fedcba9876543210fedcba98'
  ],
  memberCount: 2,
  createdAt: 100,
  expiresAt: 1000
}, { now: 100 });
assert.equal(partyClaim.partyId, 'party-abc');
assert.equal(partyClaim.memberCount, 2);
assert.equal(partyClaim.memberAccountIds.length, 2);

console.log('SOCIAL.1 Worker core tests: PASS');
