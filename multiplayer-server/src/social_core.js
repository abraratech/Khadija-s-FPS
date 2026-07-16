// SOCIAL.1 Worker core — deterministic identifiers, privacy and bounded records.

export const SOCIAL1_SERVER_PATCH = 'social1-r1-friends-parties-player-safety';
export const SOCIAL1_SERVER_SCHEMA = 1;
export const SOCIAL1_FRIEND_LIMIT = 100;
export const SOCIAL1_BLOCK_LIMIT = 100;
export const SOCIAL1_RECENT_LIMIT = 32;
export const SOCIAL1_PARTY_LIMIT = 4;
export const SOCIAL1_PRESENCE_TTL_MS = 75_000;
export const SOCIAL1_TICKET_TTL_MS = 120_000;
export const SOCIAL_MATCH3_PATCH = 'match3-r1-party-quality-room-discovery';
export const SOCIAL_MATCH3_PARTY_TICKET_TTL_MS = 120_000;

export function cleanSocialString(value, fallback = '', maxLength = 48) {
  return String(value ?? fallback)
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength) || fallback;
}

export function cleanAccountId(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^cloud-[a-f0-9]{32}$/.test(text) ? text : '';
}

export function cleanSocialId(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^social-[a-f0-9]{24}$/.test(text) ? text : '';
}

export function cleanFriendCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : '';
}

export function cleanPartyCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : '';
}

export function normalizePrivacy(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    presenceVisibility: ['friends', 'party', 'private'].includes(source.presenceVisibility)
      ? source.presenceVisibility
      : 'friends',
    friendRequests: ['everyone', 'friends-of-friends', 'nobody'].includes(source.friendRequests)
      ? source.friendRequests
      : 'everyone',
    partyInvites: ['friends', 'nobody'].includes(source.partyInvites)
      ? source.partyInvites
      : 'friends',
    allowFriendJoin: source.allowFriendJoin === true,
    showRecentPlayers: source.showRecentPlayers !== false
  };
}

export function boundedUniqueAccountIds(value, limit = SOCIAL1_FRIEND_LIMIT) {
  const output = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    const accountId = cleanAccountId(entry);
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    output.push(accountId);
    if (output.length >= limit) break;
  }
  return output;
}

export function normalizeSocialRecord(value = {}, {
  accountId = '',
  now = Date.now()
} = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const cleanAccount = cleanAccountId(source.accountId || accountId);
  return {
    schema: SOCIAL1_SERVER_SCHEMA,
    patch: SOCIAL1_SERVER_PATCH,
    accountId: cleanAccount,
    socialId: cleanSocialId(source.socialId),
    friendCode: cleanFriendCode(source.friendCode),
    displayName: cleanSocialString(source.displayName, 'Player', 24),
    privacy: normalizePrivacy(source.privacy),
    friends: boundedUniqueAccountIds(source.friends, SOCIAL1_FRIEND_LIMIT),
    incoming: boundedUniqueAccountIds(source.incoming, SOCIAL1_FRIEND_LIMIT),
    outgoing: boundedUniqueAccountIds(source.outgoing, SOCIAL1_FRIEND_LIMIT),
    blocks: boundedUniqueAccountIds(source.blocks, SOCIAL1_BLOCK_LIMIT),
    recent: Array.isArray(source.recent)
      ? source.recent
          .map((entry) => ({
            accountId: cleanAccountId(entry?.accountId),
            lastPlayedAt: Math.max(0, Number(entry?.lastPlayedAt) || 0),
            context: cleanSocialString(entry?.context, 'co-op', 100)
          }))
          .filter((entry) => entry.accountId && entry.accountId !== cleanAccount)
          .sort((left, right) => right.lastPlayedAt - left.lastPlayedAt)
          .slice(0, SOCIAL1_RECENT_LIMIT)
      : [],
    partyId: cleanSocialString(source.partyId, '', 120).replace(/[^a-zA-Z0-9:_-]/g, ''),
    notifications: Array.isArray(source.notifications)
      ? source.notifications.slice(-24).map((entry) => ({
          id: cleanSocialString(entry?.id, '', 120),
          kind: cleanSocialString(entry?.kind, 'SOCIAL', 40),
          text: cleanSocialString(entry?.text, '', 140),
          at: Math.max(0, Number(entry?.at) || 0)
        }))
      : [],
    createdAt: Math.max(1, Number(source.createdAt) || now),
    updatedAt: Math.max(1, Number(source.updatedAt) || now)
  };
}

export function normalizePresence(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const updatedAt = Math.max(0, Number(source.updatedAt) || now);
  const expiresAt = Math.max(updatedAt, Number(source.expiresAt) || (updatedAt + SOCIAL1_PRESENCE_TTL_MS));
  return {
    online: source.online === true && expiresAt > now,
    status: ['menu', 'room', 'match', 'offline'].includes(source.status)
      ? source.status
      : 'menu',
    mapId: cleanSocialString(source.mapId, '', 80),
    difficulty: Math.max(0.25, Math.min(5, Number(source.difficulty) || 1)),
    joinable: source.joinable === true,
    room: source.room && typeof source.room === 'object'
      ? {
          roomCode: String(source.room.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
          roomId: cleanSocialString(source.room.roomId, '', 120),
          inRun: source.room.inRun === true,
          mapId: cleanSocialString(source.room.mapId, '', 80),
          difficulty: Math.max(0.25, Math.min(5, Number(source.room.difficulty) || 1))
        }
      : null,
    updatedAt,
    expiresAt
  };
}

export function addRecentOpponent(record, targetAccountId, {
  now = Date.now(),
  context = 'co-op'
} = {}) {
  const target = cleanAccountId(targetAccountId);
  const source = normalizeSocialRecord(record, { accountId: record?.accountId, now });
  if (!target || target === source.accountId || source.privacy.showRecentPlayers === false) return source;
  source.recent = [
    { accountId: target, lastPlayedAt: now, context: cleanSocialString(context, 'co-op', 100) },
    ...source.recent.filter((entry) => entry.accountId !== target)
  ].slice(0, SOCIAL1_RECENT_LIMIT);
  source.updatedAt = now;
  return source;
}

export function blocksPair(left, right) {
  const leftRecord = normalizeSocialRecord(left, { accountId: left?.accountId });
  const rightRecord = normalizeSocialRecord(right, { accountId: right?.accountId });
  return leftRecord.blocks.includes(rightRecord.accountId)
    || rightRecord.blocks.includes(leftRecord.accountId);
}

export function canReceiveFriendRequest(target, requester, {
  mutualFriends = 0
} = {}) {
  const targetRecord = normalizeSocialRecord(target, { accountId: target?.accountId });
  const requesterRecord = normalizeSocialRecord(requester, { accountId: requester?.accountId });
  if (!targetRecord.accountId || !requesterRecord.accountId) return false;
  if (targetRecord.accountId === requesterRecord.accountId) return false;
  if (blocksPair(targetRecord, requesterRecord)) return false;
  if (targetRecord.friends.includes(requesterRecord.accountId)) return false;
  if (targetRecord.privacy.friendRequests === 'nobody') return false;
  if (targetRecord.privacy.friendRequests === 'friends-of-friends' && mutualFriends <= 0) return false;
  return targetRecord.incoming.length < SOCIAL1_FRIEND_LIMIT
    && requesterRecord.outgoing.length < SOCIAL1_FRIEND_LIMIT;
}

export function normalizeParty(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const members = boundedUniqueAccountIds(source.members, SOCIAL1_PARTY_LIMIT);
  const leaderAccountId = cleanAccountId(source.leaderAccountId);
  return {
    partyId: cleanSocialString(source.partyId, '', 120).replace(/[^a-zA-Z0-9:_-]/g, ''),
    partyCode: cleanPartyCode(source.partyCode),
    leaderAccountId: members.includes(leaderAccountId) ? leaderAccountId : (members[0] || ''),
    members,
    invites: boundedUniqueAccountIds(source.invites, SOCIAL1_FRIEND_LIMIT)
      .filter((accountId) => !members.includes(accountId)),
    room: source.room && typeof source.room === 'object'
      ? {
          roomCode: String(source.room.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
          mapId: cleanSocialString(source.room.mapId, '', 80),
          difficulty: Math.max(0.25, Math.min(5, Number(source.room.difficulty) || 1)),
          inRun: source.room.inRun === true,
          updatedAt: Math.max(0, Number(source.room.updatedAt) || now),
          expiresAt: Math.max(0, Number(source.room.expiresAt) || 0)
        }
      : null,
    createdAt: Math.max(1, Number(source.createdAt) || now),
    updatedAt: Math.max(1, Number(source.updatedAt) || now)
  };
}


export function normalizePartyMatchmakingClaim(value = {}, {
  now = Date.now()
} = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const partyId = cleanSocialString(source.partyId, '', 120)
    .replace(/[^a-zA-Z0-9:_-]/g, '');
  const leaderAccountId = cleanAccountId(source.leaderAccountId);
  const leaderSocialId = cleanSocialId(source.leaderSocialId);
  const playerId = cleanSocialString(source.playerId, '', 160);
  const tabId = cleanSocialString(source.tabId, '', 160);
  const protocol = Math.max(1, Math.trunc(Number(source.protocol) || 0));
  const build = cleanSocialString(source.build, '', 120);
  const memberAccountIds = boundedUniqueAccountIds(source.memberAccountIds, 2);
  const memberSocialIds = Array.isArray(source.memberSocialIds)
    ? [...new Set(source.memberSocialIds.map(cleanSocialId).filter(Boolean))].slice(0, 2)
    : [];
  const memberCount = Math.max(
    1,
    Math.min(2, Math.trunc(Number(source.memberCount) || memberAccountIds.length || 1))
  );
  const createdAt = Math.max(1, Number(source.createdAt) || now);
  const expiresAt = Math.max(createdAt, Number(source.expiresAt) || createdAt);
  return Object.freeze({
    patch: SOCIAL_MATCH3_PATCH,
    partyId,
    leaderAccountId,
    leaderSocialId,
    playerId,
    tabId,
    protocol,
    build,
    memberAccountIds,
    memberSocialIds,
    memberCount,
    createdAt,
    expiresAt,
    consumedAt: Math.max(0, Number(source.consumedAt) || 0)
  });
}
