// SOCIAL.1 — deterministic social identity, privacy, party and safety helpers.

import { normalizeSocialSafety } from './social_safety_core.js';

export const SOCIAL1_PATCH = 'social1-r1-friends-parties-player-safety';
export const SOCIAL1_SCHEMA = 1;
export const SOCIAL1_RECENT_LIMIT = 32;
export const SOCIAL1_FRIEND_LIMIT = 100;
export const SOCIAL1_BLOCK_LIMIT = 100;
export const SOCIAL1_PARTY_LIMIT = 4;
export const SOCIAL1_REPORT_NOTE_LIMIT = 240;

const SOCIAL_ID_PATTERN = /^social-[a-f0-9]{24}$/i;
const FRIEND_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const PARTY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const ACCOUNT_ID_PATTERN = /^cloud-[a-f0-9]{32}$/i;

export function cleanSocialText(value, fallback = '', maxLength = 48) {
  return String(value ?? fallback)
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength) || fallback;
}

export function normalizeSocialId(value) {
  const socialId = String(value || '').trim().toLowerCase();
  return SOCIAL_ID_PATTERN.test(socialId) ? socialId : '';
}

export function normalizeAccountId(value) {
  const accountId = String(value || '').trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(accountId) ? accountId : '';
}

export function normalizeFriendCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 8);
  return FRIEND_CODE_PATTERN.test(code) ? code : '';
}

export function normalizePartyCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 6);
  return PARTY_CODE_PATTERN.test(code) ? code : '';
}

export function normalizePrivacy(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const visibility = ['friends', 'party', 'private'].includes(source.presenceVisibility)
    ? source.presenceVisibility
    : 'friends';
  const friendRequests = ['everyone', 'friends-of-friends', 'nobody'].includes(source.friendRequests)
    ? source.friendRequests
    : 'everyone';
  const partyInvites = ['friends', 'nobody'].includes(source.partyInvites)
    ? source.partyInvites
    : 'friends';
  return Object.freeze({
    presenceVisibility: visibility,
    friendRequests,
    partyInvites,
    allowFriendJoin: source.allowFriendJoin === true,
    showRecentPlayers: source.showRecentPlayers !== false
  });
}

export function normalizePresence(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const updatedAt = Math.max(0, Number(source.updatedAt) || 0);
  const expiresAt = Math.max(updatedAt, Number(source.expiresAt) || 0);
  const online = source.online === true && expiresAt > now;
  const status = ['menu', 'room', 'match', 'offline'].includes(source.status)
    ? source.status
    : (online ? 'menu' : 'offline');
  return Object.freeze({
    online,
    status: online ? status : 'offline',
    mapId: cleanSocialText(source.mapId, '', 80),
    difficulty: Math.max(0.25, Math.min(5, Number(source.difficulty) || 1)),
    joinable: online && source.joinable === true,
    updatedAt,
    expiresAt
  });
}

export function normalizeSocialPlayer(value = {}, now = Date.now()) {
  const socialId = normalizeSocialId(value.socialId);
  if (!socialId) return null;
  return Object.freeze({
    socialId,
    displayName: cleanSocialText(value.displayName, 'Player', 24),
    friendCode: normalizeFriendCode(value.friendCode),
    relationship: ['friend', 'incoming', 'outgoing', 'blocked', 'recent', 'self'].includes(value.relationship)
      ? value.relationship
      : 'recent',
    presence: normalizePresence(value.presence, now),
    lastPlayedAt: Math.max(0, Number(value.lastPlayedAt) || 0),
    lastContext: cleanSocialText(value.lastContext, '', 100),
    mutualFriends: Math.max(0, Math.min(99, Math.floor(Number(value.mutualFriends) || 0)))
  });
}

export function normalizeSocialList(value, { limit = SOCIAL1_RECENT_LIMIT, now = Date.now() } = {}) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const entry of value) {
    const normalized = normalizeSocialPlayer(entry, now);
    if (!normalized) continue;
    const previous = byId.get(normalized.socialId);
    if (!previous || normalized.lastPlayedAt >= previous.lastPlayedAt) {
      byId.set(normalized.socialId, normalized);
    }
  }
  return [...byId.values()]
    .sort((left, right) => {
      if (left.presence.online !== right.presence.online) return left.presence.online ? -1 : 1;
      return right.lastPlayedAt - left.lastPlayedAt
        || left.displayName.localeCompare(right.displayName);
    })
    .slice(0, Math.max(0, limit));
}

export function normalizeParty(value = null, now = Date.now()) {
  if (!value || typeof value !== 'object') return null;
  const partyId = String(value.partyId || '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 120);
  if (!partyId) return null;
  const members = normalizeSocialList(
    Array.isArray(value.members)
      ? value.members.map((entry) => ({ ...entry, relationship: 'friend' }))
      : [],
    { limit: SOCIAL1_PARTY_LIMIT, now }
  );
  const leaderSocialId = normalizeSocialId(value.leaderSocialId);
  const localSocialId = normalizeSocialId(value.localSocialId);
  const room = value.room && typeof value.room === 'object'
    ? Object.freeze({
        roomCode: String(value.room.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
        mapId: cleanSocialText(value.room.mapId, '', 80),
        difficulty: Math.max(0.25, Math.min(5, Number(value.room.difficulty) || 1)),
        inRun: value.room.inRun === true,
        updatedAt: Math.max(0, Number(value.room.updatedAt) || 0),
        expiresAt: Math.max(0, Number(value.room.expiresAt) || 0)
      })
    : null;
  return Object.freeze({
    partyId,
    partyCode: normalizePartyCode(value.partyCode),
    leaderSocialId,
    localSocialId,
    isLeader: Boolean(localSocialId && localSocialId === leaderSocialId),
    members,
    invites: normalizeSocialList(value.invites, { limit: SOCIAL1_PARTY_LIMIT, now }),
    room: room && room.expiresAt > now && room.roomCode.length === 6 ? room : null,
    createdAt: Math.max(0, Number(value.createdAt) || 0),
    updatedAt: Math.max(0, Number(value.updatedAt) || 0)
  });
}

export function normalizeSocialBootstrap(value = {}, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const self = normalizeSocialPlayer({ ...(source.self || {}), relationship: 'self' }, now);
  return Object.freeze({
    patch: SOCIAL1_PATCH,
    authenticated: source.authenticated === true,
    accountType: source.accountType === 'passkey' ? 'passkey' : 'guest',
    self,
    privacy: normalizePrivacy(source.privacy),
    friends: normalizeSocialList(source.friends, { limit: SOCIAL1_FRIEND_LIMIT, now }),
    incoming: normalizeSocialList(source.incoming, { limit: SOCIAL1_FRIEND_LIMIT, now }),
    outgoing: normalizeSocialList(source.outgoing, { limit: SOCIAL1_FRIEND_LIMIT, now }),
    recent: normalizeSocialList(source.recent, { limit: SOCIAL1_RECENT_LIMIT, now }),
    blocked: normalizeSocialList(source.blocked, { limit: SOCIAL1_BLOCK_LIMIT, now }),
    party: normalizeParty(source.party, now),
    partyInvites: Array.isArray(source.partyInvites)
      ? source.partyInvites.map((entry) => normalizeParty(entry, now)).filter(Boolean)
      : [],
    safety: normalizeSocialSafety(source.safety, now),
    notifications: Array.isArray(source.notifications)
      ? source.notifications.slice(-24).map((entry) => Object.freeze({
          id: cleanSocialText(entry?.id, '', 120),
          kind: cleanSocialText(entry?.kind, 'SOCIAL', 40),
          text: cleanSocialText(entry?.text, '', 140),
          at: Math.max(0, Number(entry?.at) || 0)
        }))
      : []
  });
}

export function addLocalRecentPlayer(list, candidate, {
  now = Date.now(),
  context = 'co-op'
} = {}) {
  const normalized = normalizeSocialPlayer({
    ...candidate,
    relationship: 'recent',
    lastPlayedAt: Math.max(Number(candidate?.lastPlayedAt) || 0, now),
    lastContext: cleanSocialText(context, 'co-op', 100)
  }, now);
  if (!normalized) return normalizeSocialList(list, { now });
  return normalizeSocialList([normalized, ...(Array.isArray(list) ? list : [])], {
    limit: SOCIAL1_RECENT_LIMIT,
    now
  });
}

export function shouldHideSocialMessage({
  blockedSocialIds = [],
  senderSocialId = ''
} = {}) {
  const sender = normalizeSocialId(senderSocialId);
  if (!sender) return false;
  const blocked = new Set(
    Array.isArray(blockedSocialIds)
      ? blockedSocialIds.map(normalizeSocialId).filter(Boolean)
      : []
  );
  return blocked.has(sender);
}

export function buildSocialReport({
  targetSocialId,
  category,
  note = '',
  context = {},
  now = Date.now()
} = {}) {
  const target = normalizeSocialId(targetSocialId);
  const allowedCategories = new Set([
    'harassment',
    'hate',
    'cheating',
    'griefing',
    'inappropriate-name',
    'spam',
    'other'
  ]);
  const cleanCategory = allowedCategories.has(category) ? category : 'other';
  const sourceContext = context && typeof context === 'object' ? context : {};
  if (!target) return Object.freeze({ valid: false, reason: 'TARGET_REQUIRED' });
  return Object.freeze({
    valid: true,
    targetSocialId: target,
    category: cleanCategory,
    note: cleanSocialText(note, '', SOCIAL1_REPORT_NOTE_LIMIT),
    context: Object.freeze({
      roomId: cleanSocialText(sourceContext.roomId, '', 120),
      mapId: cleanSocialText(sourceContext.mapId, '', 80),
      mode: cleanSocialText(sourceContext.mode, '', 40),
      wave: Math.max(0, Math.min(999, Math.floor(Number(sourceContext.wave) || 0)))
    }),
    createdAt: Math.max(1, Number(now) || Date.now())
  });
}

export function socialStatusLabel(presence = {}) {
  const normalized = normalizePresence(presence);
  if (!normalized.online) return 'OFFLINE';
  if (normalized.status === 'match') return 'IN MATCH';
  if (normalized.status === 'room') return 'IN LOBBY';
  return 'ONLINE';
}
