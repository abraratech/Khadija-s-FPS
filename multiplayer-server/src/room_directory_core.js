// multiplayer-server/src/room_directory_core.js
// MATCH.2 R1.1 — deterministic public-room admission, reservation and rejoin policy.

export const ROOM_DIRECTORY_SCHEMA = 1;
export const ROOM_DIRECTORY_PATCH = 'match2-public-room-admission-r1-1';
export const ROOM_DIRECTORY_TTL_MS = 90_000;
export const ROOM_DIRECTORY_MAX_RESULTS = 24;
export const ROOM_DIRECTORY_ADMISSION_TTL_MS = 15_000;

function cleanText(value, fallback = '', limit = 240) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeRoomDirectorySync(value = {}, { now = Date.now() } = {}) {
  const roomCode = cleanText(value.roomCode, '', 6).toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(roomCode)) {
    throw new TypeError('ROOM_CODE_INVALID');
  }
  const status = cleanText(value.status, 'waiting', 24).toLowerCase();
  const connectedHumans = Math.max(0, Math.trunc(finiteNumber(value.connectedHumans, 0)));
  const reservedHumans = Math.max(0, Math.trunc(finiteNumber(value.reservedHumans, 0)));
  const maxPlayers = Math.max(2, Math.min(4, Math.trunc(finiteNumber(value.maxPlayers, 2))));
  return Object.freeze({
    roomCode,
    listed: value.listed === true,
    protocol: Math.max(1, Math.trunc(finiteNumber(value.protocol, 0))),
    build: cleanText(value.build, '', 120),
    mapId: cleanText(value.mapId, 'grid_bunker', 80),
    difficulty: Math.max(0.25, Math.min(10, finiteNumber(value.difficulty, 1))),
    status: ['waiting', 'in-run'].includes(status) ? status : 'waiting',
    connectedHumans,
    reservedHumans: Math.min(maxPlayers, reservedHumans),
    maxPlayers,
    hasBot: value.hasBot === true,
    allowLateJoin: value.allowLateJoin !== false,
    locked: value.locked === true,
    hostConnected: value.hostConnected === true,
    region: cleanText(value.region, 'ZZ', 16).toUpperCase(),
    createdAt: Math.max(0, finiteNumber(value.createdAt, now)),
    updatedAt: Math.max(0, finiteNumber(value.updatedAt, now)),
    expiresAt: now + ROOM_DIRECTORY_TTL_MS
  });
}

export function roomDirectoryListingVisible(listing, { now = Date.now() } = {}) {
  if (!listing || listing.listed !== true) return false;
  if (listing.hostConnected !== true || listing.locked === true) return false;
  if (Number(listing.expiresAt) <= now) return false;
  const occupied = Number(listing.connectedHumans || 0) + Number(listing.reservedHumans || 0);
  if (occupied >= Number(listing.maxPlayers)) return false;
  if (listing.status === 'in-run' && listing.allowLateJoin !== true) return false;
  return ['waiting', 'in-run'].includes(listing.status);
}

export function publicRoomDirectoryEntry(listing, {
  requestRegion = 'ZZ',
  now = Date.now()
} = {}) {
  const region = cleanText(listing.region, 'ZZ', 16).toUpperCase();
  const normalizedRequestRegion = cleanText(requestRegion, 'ZZ', 16).toUpperCase();
  const connectedHumans = Math.max(0, Math.trunc(finiteNumber(listing.connectedHumans, 0)));
  const reservedHumans = Math.max(0, Math.trunc(finiteNumber(listing.reservedHumans, 0)));
  const maxPlayers = Math.max(2, Math.min(4, Math.trunc(finiteNumber(listing.maxPlayers, 2))));
  return Object.freeze({
    listingId: listing.listingId,
    joinToken: listing.joinToken,
    mapId: listing.mapId,
    difficulty: listing.difficulty,
    status: listing.status,
    connectedHumans,
    reservedHumans,
    maxPlayers,
    openHumanSlots: Math.max(0, maxPlayers - connectedHumans - reservedHumans),
    hasBot: listing.hasBot === true,
    allowLateJoin: listing.allowLateJoin === true,
    region,
    scope: region !== 'ZZ' && region === normalizedRequestRegion ? 'regional' : 'global',
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    ageMs: Math.max(0, now - Number(listing.createdAt || now))
  });
}

export function cleanupRoomDirectory(listings = {}, { now = Date.now() } = {}) {
  const next = {};
  let changed = false;
  Object.entries(listings || {}).forEach(([key, listing]) => {
    if (!listing || Number(listing.expiresAt) <= now) {
      changed = true;
      return;
    }
    next[key] = listing;
  });
  return Object.freeze({ changed, listings: next });
}

export function cleanupRoomAdmissionReservations(reservations = {}, { now = Date.now() } = {}) {
  const next = {};
  let changed = false;
  Object.entries(reservations || {}).forEach(([playerId, reservation]) => {
    if (!reservation || Number(reservation.expiresAt) <= now) {
      changed = true;
      return;
    }
    next[playerId] = reservation;
  });
  return Object.freeze({ changed, reservations: next });
}

export function activeRoomAdmissionReservation(reservations = {}, playerId, { now = Date.now() } = {}) {
  const normalizedPlayerId = cleanText(playerId, '', 160);
  const reservation = reservations?.[normalizedPlayerId] || null;
  if (!reservation || Number(reservation.expiresAt) <= now) return null;
  return reservation;
}

export function countActiveRoomAdmissionReservations(reservations = {}, {
  now = Date.now(),
  excludePlayerId = ''
} = {}) {
  const excluded = cleanText(excludePlayerId, '', 160);
  return Object.entries(reservations || {}).filter(([playerId, reservation]) => (
    playerId !== excluded
    && reservation
    && Number(reservation.expiresAt) > now
  )).length;
}

export function roomKickActive(kickedPlayers = {}, playerId, sessionId, { now = Date.now() } = {}) {
  const normalizedPlayerId = cleanText(playerId, '', 160);
  if (!normalizedPlayerId) return false;
  const record = kickedPlayers?.[normalizedPlayerId];
  if (!record) return false;
  if (typeof record === 'number') return record > now;
  return Boolean(
    record
    && cleanText(record.sessionId, '', 200)
    && cleanText(record.sessionId, '', 200) === cleanText(sessionId, '', 200)
  );
}

export function evaluateRoomDirectoryAdmission({ room, playerId, now = Date.now() } = {}) {
  if (!room || room.settings?.publicListing !== true) {
    return Object.freeze({ ok: false, error: 'ROOM_NOT_PUBLIC' });
  }
  const host = room.players?.[room.hostPlayerId] || null;
  if (!host || host.connected !== true) {
    return Object.freeze({ ok: false, error: 'HOST_UNAVAILABLE' });
  }
  if (room.settings?.locked === true) {
    return Object.freeze({ ok: false, error: 'ROOM_LOCKED' });
  }
  if (room.status === 'in-run' && room.settings?.allowLateJoin !== true) {
    return Object.freeze({ ok: false, error: 'LATE_JOIN_DISABLED' });
  }
  if (!['waiting', 'in-run'].includes(room.status)) {
    return Object.freeze({ ok: false, error: 'ROOM_UNAVAILABLE' });
  }
  const normalizedPlayerId = cleanText(playerId, '', 160);
  if (!normalizedPlayerId) {
    return Object.freeze({ ok: false, error: 'PLAYER_ID_REQUIRED' });
  }
  if (roomKickActive(room.kickedPlayers, normalizedPlayerId, room.sessionId, { now })) {
    return Object.freeze({ ok: false, error: 'ROOM_UNAVAILABLE' });
  }
  const existing = room.players?.[normalizedPlayerId] || null;
  const connectedHumans = Object.values(room.players || {}).filter(
    (entry) => entry?.connected === true && entry?.isBot !== true
  ).length;
  const reservedHumans = countActiveRoomAdmissionReservations(
    room.directoryAdmissions,
    { now, excludePlayerId: normalizedPlayerId }
  );
  const maxPlayers = Math.max(2, Math.min(4, Math.trunc(Number(room.settings?.maxPlayers) || 2)));
  if (!existing && connectedHumans + reservedHumans >= maxPlayers) {
    return Object.freeze({ ok: false, error: 'ROOM_FULL' });
  }
  return Object.freeze({
    ok: true,
    roomCode: room.roomCode,
    status: room.status,
    connectedHumans,
    reservedHumans,
    maxPlayers
  });
}
