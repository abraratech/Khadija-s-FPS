// js/multiplayer/room_directory_core.js
// MATCH.2 R1.1 — deterministic public-room directory and admission helpers.

import { matchmakingEndpoint } from './matchmaking_core.js';

export const PUBLIC_ROOM_DIRECTORY_SCHEMA = 1;
export const PUBLIC_ROOM_DIRECTORY_PATCH = 'match2-public-room-admission-r1-1';
export const PUBLIC_ROOM_DIRECTORY_MAX_RESULTS = 24;

function cleanText(value, fallback = '', limit = 240) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function roomDirectoryEndpoint(serverUrl, path, params = null) {
  return matchmakingEndpoint(serverUrl, path, params);
}

export function normalizePublicRoomEntry(value = {}) {
  const status = cleanText(value.status, 'waiting', 24).toLowerCase();
  const connectedHumans = Math.max(0, Math.trunc(finiteNumber(value.connectedHumans, 0)));
  const reservedHumans = Math.max(0, Math.trunc(finiteNumber(value.reservedHumans, 0)));
  const maxPlayers = Math.max(2, Math.min(4, Math.trunc(finiteNumber(value.maxPlayers, 2))));
  return Object.freeze({
    listingId: cleanText(value.listingId, '', 220),
    joinToken: cleanText(value.joinToken, '', 280),
    mapId: cleanText(value.mapId, 'grid_bunker', 80),
    difficulty: Math.max(0.25, Math.min(10, finiteNumber(value.difficulty, 1))),
    status: ['waiting', 'in-run'].includes(status) ? status : 'waiting',
    connectedHumans,
    reservedHumans,
    maxPlayers,
    openHumanSlots: Math.max(0, Math.trunc(finiteNumber(
      value.openHumanSlots,
      maxPlayers - connectedHumans - reservedHumans
    ))),
    hasBot: value.hasBot === true,
    allowLateJoin: value.allowLateJoin !== false,
    region: cleanText(value.region, 'ZZ', 16).toUpperCase(),
    scope: cleanText(value.scope, 'global', 16).toLowerCase(),
    createdAt: Math.max(0, finiteNumber(value.createdAt, 0)),
    updatedAt: Math.max(0, finiteNumber(value.updatedAt, 0))
  });
}

export function normalizeRoomDirectoryResponse(value = {}) {
  const rooms = Array.isArray(value.rooms)
    ? value.rooms.map(normalizePublicRoomEntry).filter((entry) => (
      entry.listingId && entry.joinToken && entry.openHumanSlots > 0
    ))
    : [];
  return Object.freeze({
    ok: value.ok === true,
    schema: Math.max(0, Math.trunc(finiteNumber(value.schema, 0))),
    patch: cleanText(value.patch, '', 120),
    region: cleanText(value.region, 'ZZ', 16).toUpperCase(),
    rooms: Object.freeze(rooms.slice(0, PUBLIC_ROOM_DIRECTORY_MAX_RESULTS)),
    refreshedAt: Math.max(0, finiteNumber(value.refreshedAt, Date.now()))
  });
}

export function normalizeRoomAdmissionAssignment(value = {}) {
  const roomCode = cleanText(value.roomCode, '', 12).toUpperCase();
  const admissionToken = cleanText(value.admissionToken, '', 280);
  if (!/^[A-Z2-9]{6}$/.test(roomCode) || !admissionToken) {
    throw new TypeError('PUBLIC_ROOM_ADMISSION_INCOMPLETE');
  }
  return Object.freeze({
    roomCode,
    joinMode: 'join',
    admissionToken,
    admissionExpiresAt: Math.max(0, finiteNumber(value.admissionExpiresAt, 0)),
    listingId: cleanText(value.listingId, '', 220)
  });
}

export function roomDirectoryStatusPresentation(state = {}) {
  const status = cleanText(state.status, 'idle', 24).toLowerCase();
  const count = Array.isArray(state.rooms) ? state.rooms.length : 0;
  if (status === 'loading') {
    return Object.freeze({ title: 'SCANNING OPEN ROOMS', detail: 'CHECKING HOST-APPROVED PUBLIC LOBBIES', tone: 'neutral' });
  }
  if (status === 'joining') {
    return Object.freeze({ title: 'RESERVING ROOM SLOT', detail: 'VERIFYING CAPACITY, BUILD AND HOST PERMISSION', tone: 'neutral' });
  }
  if (status === 'join-rejected') {
    return Object.freeze({ title: 'ROOM CHANGED', detail: cleanText(state.error, 'REFRESHED AVAILABLE ROOMS', 180).toUpperCase(), tone: 'warning' });
  }
  if (status === 'error') {
    return Object.freeze({ title: 'ROOM BROWSER UNAVAILABLE', detail: cleanText(state.error, 'TRY REFRESHING THE LIST', 180).toUpperCase(), tone: 'danger' });
  }
  if (status === 'ready' && count === 0) {
    return Object.freeze({ title: 'NO OPEN ROOMS', detail: 'TRY QUICK MATCH OR CREATE A PUBLIC ROOM', tone: 'warning' });
  }
  if (status === 'ready') {
    return Object.freeze({ title: `${count} OPEN ROOM${count === 1 ? '' : 'S'}`, detail: 'ONLY HOST-APPROVED, COMPATIBLE ROOMS ARE SHOWN', tone: 'success' });
  }
  return Object.freeze({ title: 'OPEN PUBLIC ROOMS', detail: 'BROWSE HOST-APPROVED LOBBIES', tone: 'neutral' });
}
