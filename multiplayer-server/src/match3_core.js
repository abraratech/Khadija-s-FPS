// MATCH.3 Worker core — party capacity, region policy and room quality.

export const MATCH3_SERVER_SCHEMA = 2;
export const MATCH3_SERVER_PATCH = 'match3-r1-party-quality-room-discovery';
export const MATCH3_GAMEPLAY_HUMAN_LIMIT = 2;

function cleanText(value, fallback = '', limit = 160) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeMatch3ServerPreferences(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const searchPriority = ['quality', 'balanced', 'fast'].includes(source.searchPriority)
    ? source.searchPriority
    : 'balanced';
  const regionPolicy = ['auto', 'regional-only', 'global'].includes(source.regionPolicy)
    ? source.regionPolicy
    : 'auto';
  const preferredRegion = cleanText(source.preferredRegion, 'AUTO', 12).toUpperCase();
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
    preferredRegion: /^[A-Z0-9_-]{2,12}$/.test(preferredRegion)
      ? preferredRegion
      : 'AUTO',
    globalExpansionMs,
    allowBackfill: source.allowBackfill !== false,
    joinInProgress: source.joinInProgress !== false
  });
}

export function normalizeMatch3Party(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const memberCount = Math.max(
    1,
    Math.min(
      MATCH3_GAMEPLAY_HUMAN_LIMIT,
      Math.trunc(finiteNumber(source.memberCount || source.partySize, 1))
    )
  );
  return Object.freeze({
    partyId: cleanText(source.partyId, '', 120),
    memberCount,
    leaderSocialId: cleanText(source.leaderSocialId, '', 48).toLowerCase(),
    memberSocialIds: Object.freeze(
      (Array.isArray(source.memberSocialIds) ? source.memberSocialIds : [])
        .map((entry) => cleanText(entry, '', 48).toLowerCase())
        .filter(Boolean)
        .slice(0, MATCH3_GAMEPLAY_HUMAN_LIMIT)
    )
  });
}

export function match3TicketSearchScope(ticket = {}, now = Date.now()) {
  if (ticket.regionPolicy === 'global') return 'global';
  if (ticket.regionPolicy === 'regional-only') return 'regional-only';
  const fallbackAt = Number(ticket.fallbackAt || 0);
  return fallbackAt > 0 && now >= fallbackAt ? 'global' : 'regional';
}

export function match3TicketsCapacityCompatible(a = {}, b = {}) {
  const capacity = Math.max(
    2,
    Math.min(
      MATCH3_GAMEPLAY_HUMAN_LIMIT,
      Math.trunc(Math.min(
        finiteNumber(a.maxPlayers, MATCH3_GAMEPLAY_HUMAN_LIMIT),
        finiteNumber(b.maxPlayers, MATCH3_GAMEPLAY_HUMAN_LIMIT)
      ))
    )
  );
  return Math.max(1, Number(a.partySize) || 1)
    + Math.max(1, Number(b.partySize) || 1)
    <= capacity;
}

export function match3RegionCompatible(a = {}, b = {}, now = Date.now()) {
  const sameRegion = String(a.region || 'ZZ') === String(b.region || 'ZZ');
  if (sameRegion) return Object.freeze({ compatible: true, scope: 'regional' });
  const scopeA = match3TicketSearchScope(a, now);
  const scopeB = match3TicketSearchScope(b, now);
  if (scopeA === 'regional-only' || scopeB === 'regional-only') {
    return Object.freeze({ compatible: false, scope: 'regional-only' });
  }
  if (scopeA === 'global' || scopeB === 'global') {
    return Object.freeze({ compatible: true, scope: 'global' });
  }
  return Object.freeze({ compatible: false, scope: 'regional' });
}

export function match3CandidateScore(candidate = {}, incoming = {}, {
  now = Date.now()
} = {}) {
  if (!match3TicketsCapacityCompatible(candidate, incoming)) {
    return Number.NEGATIVE_INFINITY;
  }
  const region = match3RegionCompatible(candidate, incoming, now);
  if (!region.compatible) return Number.NEGATIVE_INFINITY;
  let score = region.scope === 'regional' ? 100 : 45;
  const oldest = Math.min(
    Number(candidate.queuedAt || now),
    Number(incoming.queuedAt || now)
  );
  score += Math.min(40, Math.floor(Math.max(0, now - oldest) / 1000));
  if (candidate.searchPriority === 'quality') score += region.scope === 'regional' ? 12 : -8;
  if (incoming.searchPriority === 'quality') score += region.scope === 'regional' ? 12 : -8;
  if (candidate.searchPriority === 'fast' || incoming.searchPriority === 'fast') score += 6;
  return score;
}

export function chooseMatch3Candidate(tickets, incoming, {
  now = Date.now(),
  compatibility = () => true
} = {}) {
  const candidates = (Array.isArray(tickets) ? tickets : [])
    .filter((ticket) => (
      ticket?.status === 'queued'
      && ticket.playerId !== incoming?.playerId
      && compatibility(ticket, incoming)
    ))
    .map((ticket) => ({
      ticket,
      score: match3CandidateScore(ticket, incoming, { now }),
      region: match3RegionCompatible(ticket, incoming, now)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => (
      right.score - left.score
      || Number(left.ticket.queuedAt || 0) - Number(right.ticket.queuedAt || 0)
      || String(left.ticket.ticketId || '').localeCompare(String(right.ticket.ticketId || ''))
    ));
  if (!candidates.length) return null;
  return Object.freeze({
    ticket: candidates[0].ticket,
    scope: candidates[0].region.scope,
    qualityScore: candidates[0].score
  });
}

export function normalizeMatch3RoomFilters(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.freeze({
    mapId: cleanText(source.mapId, '', 80),
    difficulty: source.difficulty === '' || source.difficulty === null
      ? null
      : Math.max(0.25, Math.min(10, finiteNumber(source.difficulty, 1))),
    status: ['any', 'waiting', 'in-run'].includes(source.status)
      ? source.status
      : 'any',
    regionScope: ['any', 'regional', 'global'].includes(source.regionScope)
      ? source.regionScope
      : 'any',
    bot: ['any', 'with-bot', 'without-bot'].includes(source.bot)
      ? source.bot
      : 'any',
    joinInProgress: source.joinInProgress !== false && source.joinInProgress !== '0',
    requiredSlots: Math.max(
      1,
      Math.min(
        MATCH3_GAMEPLAY_HUMAN_LIMIT,
        Math.trunc(finiteNumber(source.requiredSlots, 1))
      )
    ),
    searchPriority: ['quality', 'balanced', 'fast'].includes(source.searchPriority)
      ? source.searchPriority
      : 'balanced'
  });
}

export function match3RoomVisibleForFilters(room = {}, filters = {}) {
  const normalized = normalizeMatch3RoomFilters(filters);
  if (Number(room.openHumanSlots || 0) < normalized.requiredSlots) return false;
  if (normalized.mapId && String(room.mapId || '') !== normalized.mapId) return false;
  if (
    normalized.difficulty !== null
    && Math.abs(Number(room.difficulty || 0) - normalized.difficulty) > 0.001
  ) return false;
  if (normalized.status !== 'any' && room.status !== normalized.status) return false;
  if (normalized.regionScope !== 'any' && room.scope !== normalized.regionScope) return false;
  if (normalized.bot === 'with-bot' && room.hasBot !== true) return false;
  if (normalized.bot === 'without-bot' && room.hasBot === true) return false;
  if (!normalized.joinInProgress && room.status === 'in-run') return false;
  return true;
}

export function match3RoomQualityScore(room = {}, filters = {}, {
  now = Date.now()
} = {}) {
  const normalized = normalizeMatch3RoomFilters(filters);
  if (!match3RoomVisibleForFilters(room, normalized)) {
    return Number.NEGATIVE_INFINITY;
  }
  let score = room.scope === 'regional'
    ? normalized.searchPriority === 'quality' ? 65 : 45
    : normalized.searchPriority === 'fast' ? 28 : 16;
  score += room.status === 'waiting' ? 30 : normalized.searchPriority === 'fast' ? 15 : 3;
  if (room.hasBot !== true) score += 8;
  score += Math.min(20, Math.max(0, Number(room.openHumanSlots || 0)) * 8);
  const ageMs = Math.max(0, Number(now) - Number(room.updatedAt || now));
  score += Math.max(0, 12 - Math.floor(ageMs / 10_000));
  return score;
}

export function sortMatch3RoomEntries(rooms, filters = {}, {
  now = Date.now()
} = {}) {
  return (Array.isArray(rooms) ? rooms : [])
    .filter((room) => match3RoomVisibleForFilters(room, filters))
    .map((room) => ({
      ...room,
      qualityScore: match3RoomQualityScore(room, filters, { now }),
      quality: room.scope === 'regional'
        ? room.status === 'waiting' ? 'excellent' : 'good'
        : room.status === 'waiting' ? 'compatible' : 'expanded'
    }))
    .sort((left, right) => (
      right.qualityScore - left.qualityScore
      || Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
      || String(left.listingId || '').localeCompare(String(right.listingId || ''))
    ));
}

export function estimatedMatch3WaitMs({
  queueDepth = 0,
  searchPriority = 'balanced',
  partySize = 1
} = {}) {
  if (partySize > 1) return 1_000;
  const base = searchPriority === 'fast' ? 5_000
    : searchPriority === 'quality' ? 18_000
      : 10_000;
  return Math.min(60_000, base + Math.max(0, Number(queueDepth) - 1) * 2_000);
}
