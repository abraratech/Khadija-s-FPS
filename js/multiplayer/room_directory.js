// js/multiplayer/room_directory.js
// MATCH.2 R1.1 — race-safe browser-side open-room directory lifecycle.

import {
  normalizeRoomAdmissionAssignment,
  normalizeRoomDirectoryResponse,
  roomDirectoryEndpoint
} from './room_directory_core.js';

function cleanMessage(value, fallback = 'Public room request failed.') {
  return String(value || fallback).trim().slice(0, 240) || fallback;
}

async function readJsonResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(cleanMessage(
      payload?.message || payload?.error,
      `Public room request returned HTTP ${response.status}.`
    ));
    error.code = payload?.error || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export class PublicRoomDirectoryClient {
  constructor({ fetchImpl = null, onChange = null } = {}) {
    const providedFetch = typeof fetchImpl === 'function' ? fetchImpl : null;
    this.fetchImpl = providedFetch
      ? (...args) => Reflect.apply(providedFetch, globalThis, args)
      : typeof globalThis.fetch === 'function'
        ? (...args) => globalThis.fetch(...args)
        : null;
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.listSequence = 0;
    this.joinPromise = null;
    this.state = Object.freeze({
      status: 'idle',
      active: false,
      rooms: Object.freeze([]),
      region: 'ZZ',
      error: null,
      refreshedAt: 0,
      joiningListingId: null,
      filters: Object.freeze({}),
      searchPriority: 'balanced'
    });
  }

  getSnapshot() {
    return this.state;
  }

  publish(patch = {}) {
    const status = String(patch.status ?? this.state.status);
    this.state = Object.freeze({
      ...this.state,
      ...patch,
      status,
      active: ['loading', 'joining'].includes(status)
    });
    try { this.onChange?.(this.state); } catch { /* UI observers are non-fatal. */ }
    return this.state;
  }

  async list({ serverUrl, playerId, protocol, build, filters = {}, searchPriority = 'balanced' } = {}) {
    if (!this.fetchImpl) {
      return this.publish({ status: 'error', error: 'This browser cannot load public rooms.' });
    }
    const sequence = ++this.listSequence;
    this.publish({ status: 'loading', error: null });
    try {
      const response = await this.fetchImpl(roomDirectoryEndpoint(
        serverUrl,
        '/matchmaking/rooms/list',
        {
          playerId,
          protocol,
          build,
          gameMode: filters.gameMode || 'any',
          mapId: filters.mapId || '',
          difficulty: filters.difficulty ?? '',
          status: filters.status || 'any',
          regionScope: filters.regionScope || 'any',
          bot: filters.bot || 'any',
          joinInProgress: filters.joinInProgress === false ? '0' : '1',
          requiredSlots: filters.requiredSlots || 1,
          searchPriority
        }
      ), {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit'
      });
      const payload = normalizeRoomDirectoryResponse(
        await readJsonResponse(response),
        { filters, searchPriority }
      );
      if (sequence !== this.listSequence) return this.state;
      return this.publish({
        status: 'ready',
        rooms: payload.rooms,
        region: payload.region,
        refreshedAt: payload.refreshedAt,
        filters: payload.filters,
        searchPriority: payload.searchPriority,
        error: null,
        joiningListingId: null
      });
    } catch (error) {
      if (sequence !== this.listSequence) return this.state;
      return this.publish({
        status: 'error',
        rooms: Object.freeze([]),
        error: cleanMessage(error?.message || error),
        joiningListingId: null
      });
    }
  }

  async requestJoin(options = {}) {
    if (this.joinPromise) return this.joinPromise;
    this.joinPromise = this.performJoin(options).finally(() => {
      this.joinPromise = null;
    });
    return this.joinPromise;
  }

  async performJoin({
    serverUrl,
    playerId,
    protocol,
    build,
    listingId,
    joinToken,
    partySize = 1
  } = {}) {
    if (!this.fetchImpl) throw new Error('This browser cannot join public rooms.');
    const selectedListingId = String(listingId || '');
    this.publish({ status: 'joining', error: null, joiningListingId: selectedListingId });
    try {
      const response = await this.fetchImpl(roomDirectoryEndpoint(
        serverUrl,
        '/matchmaking/rooms/join'
      ), {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId, protocol, build, listingId, joinToken, partySize })
      });
      const payload = await readJsonResponse(response);
      const assignment = normalizeRoomAdmissionAssignment({
        ...payload?.assignment,
        listingId: selectedListingId
      });
      this.publish({ status: 'ready', error: null, joiningListingId: null });
      return assignment;
    } catch (error) {
      const remainingRooms = Object.freeze((this.state.rooms || []).filter(
        (entry) => entry.listingId !== selectedListingId
      ));
      this.publish({
        status: 'join-rejected',
        rooms: remainingRooms,
        error: cleanMessage(error?.message || error),
        joiningListingId: null
      });
      throw error;
    }
  }

  clear() {
    this.listSequence += 1;
    this.joinPromise = null;
    return this.publish({
      status: 'idle',
      rooms: Object.freeze([]),
      region: 'ZZ',
      error: null,
      refreshedAt: 0,
      joiningListingId: null,
      filters: Object.freeze({}),
      searchPriority: 'balanced'
    });
  }
}
