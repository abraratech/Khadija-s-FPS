// MATCH.3 — deterministic party matchmaking, search quality and room filters.

export const MATCH3_SCHEMA = 2;
export const MATCH3_PATCH = 'match3-r1-party-quality-room-discovery';
export const MATCH3_MAX_GAMEPLAY_HUMANS = 2;

const REGION_PATTERN = /^[A-Z0-9_-]{2,12}$/;

function cleanText(value, fallback = '', limit = 160) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeMatch3Region(value, fallback = 'AUTO') {
  const region = cleanText(value, fallback, 12).toUpperCase();
  return REGION_PATTERN.test(region) ? region : fallback;
}

export function normalizeMatch3SearchPreferences(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const searchPriority = ['quality', 'balanced', 'fast'].includes(source.searchPriority)
    ? source.searchPriority
    : 'balanced';
  const regionPolicy = ['auto', 'regional-only', 'global'].includes(source.regionPolicy)
    ? source.regionPolicy
    : 'auto';
  const globalExpansionMs = regionPolicy === 'regional-only'
    ? 0
    : searchPriority === 'quality'
      ? 20_000
      : searchPriority === 'fast'
        ? 5_000
        : 12_000;
  return Object.freeze({
    searchPriority,
    regionPolicy,
    preferredRegion: normalizeMatch3Region(source.preferredRegion, 'AUTO'),
    globalExpansionMs,
    allowBackfill: source.allowBackfill !== false,
    joinInProgress: source.joinInProgress !== false
  });
}

export function normalizeMatch3RoomFilters(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const status = ['any', 'waiting', 'in-run'].includes(source.status)
    ? source.status
    : 'any';
  const regionScope = ['any', 'regional', 'global'].includes(source.regionScope)
    ? source.regionScope
    : 'any';
  const bot = ['any', 'with-bot', 'without-bot'].includes(source.bot)
    ? source.bot
    : 'any';
  const gameMode = ['any', 'coop', 'pvp-team-elimination'].includes(source.gameMode)
    ? source.gameMode
    : 'any';
  return Object.freeze({
    gameMode,
    mapId: cleanText(source.mapId, '', 80),
    difficulty: source.difficulty === '' || source.difficulty === null
      ? null
      : Math.max(0.25, Math.min(10, finiteNumber(source.difficulty, 1))),
    status,
    regionScope,
    bot,
    joinInProgress: source.joinInProgress !== false,
    requiredSlots: Math.max(
      1,
      Math.min(
        MATCH3_MAX_GAMEPLAY_HUMANS,
        Math.trunc(finiteNumber(source.requiredSlots, 1))
      )
    )
  });
}

export function normalizeMatch3PartyContext(snapshot = null) {
  const party = snapshot?.state?.party || snapshot?.party || (snapshot?.active === true ? snapshot : null);
  if (!party) {
    return Object.freeze({
      active: false,
      eligible: true,
      isLeader: true,
      partyId: '',
      partyCode: '',
      memberCount: 1,
      memberSocialIds: Object.freeze([]),
      reason: null
    });
  }
  const members = Array.isArray(party.members) ? party.members : [];
  const memberSocialIds = Object.freeze(
    members
      .map((entry) => cleanText(entry?.socialId, '', 48).toLowerCase())
      .filter(Boolean)
      .slice(0, 4)
  );
  const memberCount = Math.max(1, members.length || memberSocialIds.length || 1);
  const isLeader = party.isLeader === true;
  let reason = null;
  if (!isLeader) reason = 'PARTY_LEADER_REQUIRED';
  else if (memberCount > MATCH3_MAX_GAMEPLAY_HUMANS) {
    reason = 'PARTY_TOO_LARGE_FOR_CURRENT_COOP';
  }
  return Object.freeze({
    active: true,
    eligible: reason === null,
    isLeader,
    partyId: cleanText(party.partyId, '', 120),
    partyCode: cleanText(party.partyCode, '', 12).toUpperCase(),
    memberCount,
    memberSocialIds,
    reason
  });
}

export function match3QueueLabel({
  party = normalizeMatch3PartyContext(null),
  preferences = normalizeMatch3SearchPreferences({})
} = {}) {
  const memberText = party.active
    ? `${party.memberCount}-PLAYER PARTY`
    : 'SOLO OPERATIVE';
  const scopeText = preferences.regionPolicy === 'regional-only'
    ? 'REGIONAL ONLY'
    : preferences.regionPolicy === 'global'
      ? 'GLOBAL SEARCH'
      : preferences.searchPriority === 'quality'
        ? 'REGION FIRST · QUALITY'
        : preferences.searchPriority === 'fast'
          ? 'REGION FIRST · FAST EXPANSION'
          : 'REGION FIRST · BALANCED';
  return `${memberText} · ${scopeText}`;
}

export function roomEntryMatchesFilters(entry = {}, filters = {}) {
  const normalized = normalizeMatch3RoomFilters(filters);
  if (Number(entry.openHumanSlots || 0) < normalized.requiredSlots) return false;
  if (
    normalized.gameMode !== 'any'
    && String(entry.gameMode || 'coop') !== normalized.gameMode
  ) return false;
  if (normalized.mapId && String(entry.mapId || '') !== normalized.mapId) return false;
  if (
    normalized.difficulty !== null
    && Math.abs(Number(entry.difficulty || 0) - normalized.difficulty) > 0.001
  ) return false;
  if (normalized.status !== 'any' && entry.status !== normalized.status) return false;
  if (normalized.regionScope !== 'any' && entry.scope !== normalized.regionScope) return false;
  if (normalized.bot === 'with-bot' && entry.hasBot !== true) return false;
  if (normalized.bot === 'without-bot' && entry.hasBot === true) return false;
  if (!normalized.joinInProgress && entry.status === 'in-run') return false;
  return true;
}

export function roomEntryQualityScore(entry = {}, {
  filters = {},
  searchPriority = 'balanced',
  now = Date.now()
} = {}) {
  if (!roomEntryMatchesFilters(entry, filters)) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (entry.scope === 'regional') score += searchPriority === 'quality' ? 55 : 35;
  if (entry.status === 'waiting') score += 30;
  else score += searchPriority === 'fast' ? 15 : 4;
  if (entry.hasBot !== true) score += 8;
  score += Math.min(20, Math.max(0, Number(entry.openHumanSlots || 0)) * 8);
  const ageMs = Math.max(0, Number(now) - Number(entry.updatedAt || now));
  score += Math.max(0, 12 - Math.floor(ageMs / 10_000));
  return score;
}

export function sortMatch3Rooms(entries, options = {}) {
  return Object.freeze(
    (Array.isArray(entries) ? entries : [])
      .filter((entry) => roomEntryMatchesFilters(entry, options.filters || {}))
      .map((entry) => Object.freeze({
        ...entry,
        qualityScore: roomEntryQualityScore(entry, options)
      }))
      .sort((left, right) => (
        right.qualityScore - left.qualityScore
        || Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
        || String(left.listingId || '').localeCompare(String(right.listingId || ''))
      ))
  );
}

export function match3PartyErrorMessage(reason) {
  if (reason === 'PARTY_LEADER_REQUIRED') {
    return 'Only the party leader can start or cancel matchmaking.';
  }
  if (reason === 'PARTY_TOO_LARGE_FOR_CURRENT_COOP') {
    return 'Current co-op operations support two human players. Reduce the party to two before matchmaking.';
  }
  if (reason === 'PARTY_TICKET_REQUIRED') {
    return 'The party matchmaking ticket expired. Refresh Social and try again.';
  }
  if (reason === 'PARTY_OPEN_ROOM_RESERVATION_UNSUPPORTED') {
    return 'Open Room browsing is for solo operatives. Use Party Quick Match or create a room to keep the party together.';
  }
  return 'The party cannot start matchmaking right now.';
}
