// js/multiplayer/matchmaking.js
// MATCH.1 R1 — browser-side public matchmaking lifecycle.

import {
  PUBLIC_MATCHMAKING_LOCK_TTL_MS,
  PUBLIC_MATCHMAKING_PATCH,
  PUBLIC_MATCHMAKING_POLL_MS,
  PUBLIC_MATCHMAKING_QUEUE_TIMEOUT_MS,
  PUBLIC_MATCHMAKING_SCHEMA,
  createQuickMatchRequest,
  matchmakingEndpoint,
  normalizeMatchmakingResponse
} from './matchmaking_core.js';

const TAB_ID_KEY = 'ka_matchmaking_tab_id';
const TICKET_STORAGE_KEY = 'ka_matchmaking_ticket_v1';
const LOCK_PREFIX = 'ka_matchmaking_lock_';

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Restricted storage is non-fatal; server duplicate protection remains.
  }
}

function removeSession(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore restricted storage.
  }
}

function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore restricted storage.
  }
}

function tabId() {
  const existing = readSession(TAB_ID_KEY);
  if (existing) return existing;
  const created = makeId('match-tab');
  writeSession(TAB_ID_KEY, created);
  return created;
}

function safeJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function cleanMessage(value, fallback = 'Quick match failed.') {
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
      `Quick match returned HTTP ${response.status}.`
    ));
    error.code = payload?.error || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export class PublicMatchmakingClient {
  constructor({
    fetchImpl = globalThis.fetch,
    onChange = null,
    onMatch = null,
    now = () => Date.now()
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.onMatch = typeof onMatch === 'function' ? onMatch : null;
    this.now = now;
    this.tabId = tabId();
    this.state = Object.freeze({
      status: 'idle',
      active: false,
      message: null,
      error: null,
      queuedAt: 0,
      elapsedMs: 0,
      fallbackAt: 0,
      region: 'ZZ',
      queueDepth: 0,
      assignment: null,
      ticketId: null
    });
    this.serverUrl = null;
    this.playerId = null;
    this.ticket = null;
    this.pollTimer = null;
    this.clockTimer = null;
    this.lockTimer = null;
    this.matchDelivered = false;
    this.abortController = null;
  }

  getSnapshot() {
    return this.state;
  }

  isActive() {
    return ['searching', 'matched', 'connecting'].includes(this.state.status);
  }

  isMatchedToRoom(roomCode) {
    return Boolean(
      roomCode
      && this.ticket?.assignment?.roomCode === String(roomCode).toUpperCase()
    );
  }

  publish(patch = {}) {
    const queuedAt = Number(
      patch.queuedAt ?? this.state.queuedAt ?? this.ticket?.queuedAt ?? 0
    );
    this.state = Object.freeze({
      ...this.state,
      ...patch,
      active: ['searching', 'matched', 'connecting'].includes(
        String(patch.status ?? this.state.status)
      ),
      queuedAt,
      elapsedMs: queuedAt > 0
        ? Math.max(0, this.now() - queuedAt)
        : Math.max(0, Number(patch.elapsedMs ?? this.state.elapsedMs) || 0)
    });
    try {
      this.onChange?.(this.state);
    } catch {
      // UI observers cannot break queue state.
    }
    return this.state;
  }

  acquireTabLock(playerId) {
    const key = `${LOCK_PREFIX}${playerId}`;
    const now = this.now();
    const existing = safeJson(readLocal(key) || 'null', null);
    if (
      existing?.tabId
      && existing.tabId !== this.tabId
      && Number(existing.expiresAt) > now
    ) {
      const error = new Error(
        'Quick Match is already active for this player in another tab.'
      );
      error.code = 'DUPLICATE_TAB_QUEUE';
      throw error;
    }
    writeLocal(key, JSON.stringify({
      tabId: this.tabId,
      expiresAt: now + PUBLIC_MATCHMAKING_LOCK_TTL_MS
    }));
    this.lockTimer = setInterval(() => {
      writeLocal(key, JSON.stringify({
        tabId: this.tabId,
        expiresAt: this.now() + PUBLIC_MATCHMAKING_LOCK_TTL_MS
      }));
    }, Math.max(2000, Math.floor(PUBLIC_MATCHMAKING_LOCK_TTL_MS / 2)));
  }

  releaseTabLock() {
    if (this.lockTimer) {
      clearInterval(this.lockTimer);
      this.lockTimer = null;
    }
    if (!this.playerId) return;
    const key = `${LOCK_PREFIX}${this.playerId}`;
    const existing = safeJson(readLocal(key) || 'null', null);
    if (!existing || existing.tabId === this.tabId) removeLocal(key);
  }

  loadResumeTicket(serverUrl, playerId) {
    const stored = safeJson(readSession(TICKET_STORAGE_KEY) || 'null', null);
    if (
      !stored
      || stored.serverUrl !== serverUrl
      || stored.playerId !== playerId
      || stored.tabId !== this.tabId
    ) {
      return null;
    }
    return stored;
  }

  saveTicket() {
    if (!this.ticket || !this.serverUrl || !this.playerId) return;
    writeSession(TICKET_STORAGE_KEY, JSON.stringify({
      serverUrl: this.serverUrl,
      playerId: this.playerId,
      tabId: this.tabId,
      ticketId: this.ticket.ticketId,
      token: this.ticket.token,
      queuedAt: this.ticket.queuedAt,
      fallbackAt: this.ticket.fallbackAt
    }));
  }

  clearStoredTicket() {
    removeSession(TICKET_STORAGE_KEY);
  }

  async start({
    serverUrl,
    playerId,
    displayName,
    protocol,
    build,
    preferences = {}
  } = {}) {
    if (this.isActive()) return this.getSnapshot();
    if (typeof this.fetchImpl !== 'function') {
      return this.fail('This browser cannot start Quick Match.');
    }

    this.stopTimers();
    this.abortController?.abort?.();
    this.abortController = new AbortController();
    this.serverUrl = String(serverUrl || '').trim();
    this.playerId = String(playerId || '').trim();
    this.matchDelivered = false;

    try {
      this.acquireTabLock(this.playerId);
      const resume = this.loadResumeTicket(this.serverUrl, this.playerId);
      const request = createQuickMatchRequest({
        playerId: this.playerId,
        displayName,
        protocol,
        build,
        tabId: this.tabId,
        resumeToken: resume?.token || '',
        preferences
      });

      this.publish({
        status: 'searching',
        message: null,
        error: null,
        queuedAt: this.now(),
        elapsedMs: 0,
        fallbackAt: this.now() + 12_000,
        assignment: null,
        ticketId: resume?.ticketId || null
      });
      this.startClock();

      const response = await this.fetchImpl(
        matchmakingEndpoint(this.serverUrl, '/matchmaking/enqueue'),
        {
          method: 'POST',
          cache: 'no-store',
          credentials: 'omit',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: this.abortController.signal
        }
      );
      const payload = normalizeMatchmakingResponse(
        await readJsonResponse(response)
      );
      this.acceptServerSnapshot(payload);
      return this.getSnapshot();
    } catch (error) {
      if (error?.name === 'AbortError') return this.getSnapshot();
      const message = error?.code === 'PLAYER_ALREADY_QUEUED'
        ? 'Quick Match is already active for this player in another tab.'
        : cleanMessage(error?.message);
      return this.fail(message, error?.code);
    }
  }

  acceptServerSnapshot(payload) {
    if (!payload?.ticketId) {
      return this.fail(
        payload?.message || payload?.error || 'Quick Match returned no ticket.'
      );
    }

    this.ticket = {
      ...payload,
      token: payload.token || this.ticket?.token || ''
    };
    if (!this.ticket.token) {
      return this.fail('Quick Match returned no ticket token.');
    }
    this.saveTicket();

    if (payload.status === 'queued') {
      this.publish({
        status: 'searching',
        queuedAt: payload.queuedAt,
        elapsedMs: payload.elapsedMs,
        fallbackAt: payload.fallbackAt,
        region: payload.region,
        queueDepth: payload.queueDepth,
        ticketId: payload.ticketId,
        assignment: null
      });
      this.schedulePoll();
      return this.getSnapshot();
    }

    if (payload.status === 'matched') {
      this.ticket.assignment = payload.assignment;
      this.publish({
        status: 'matched',
        queuedAt: payload.queuedAt,
        elapsedMs: payload.elapsedMs,
        fallbackAt: payload.fallbackAt,
        region: payload.region,
        queueDepth: payload.queueDepth,
        ticketId: payload.ticketId,
        assignment: payload.assignment
      });
      this.deliverMatch(payload.assignment);
      return this.getSnapshot();
    }

    if (payload.status === 'completed') {
      this.publish({
        status: 'completed',
        assignment: payload.assignment,
        ticketId: payload.ticketId
      });
      this.finishLifecycle({ clearTicket: true });
      return this.getSnapshot();
    }

    if (payload.status === 'cancelled' || payload.status === 'expired') {
      this.publish({
        status: payload.status,
        message: payload.reason || null,
        assignment: null,
        ticketId: payload.ticketId
      });
      this.finishLifecycle({ clearTicket: true });
      return this.getSnapshot();
    }

    return this.fail(
      payload.message || payload.error || `Unexpected queue state: ${payload.status}`
    );
  }

  deliverMatch(assignment) {
    if (!assignment?.roomCode || this.matchDelivered) return;
    this.matchDelivered = true;
    this.stopPoll();
    setTimeout(() => {
      if (!this.ticket || this.state.status !== 'matched') return;
      this.publish({ status: 'connecting', assignment });
      try {
        this.onMatch?.(assignment, this.getSnapshot());
      } catch (error) {
        this.fail(cleanMessage(error?.message));
      }
    }, Math.max(0, Number(assignment.connectAfterMs) || 0));
  }

  schedulePoll() {
    this.stopPoll();
    if (!this.ticket?.ticketId || !this.ticket?.token) return;
    this.pollTimer = setTimeout(() => {
      void this.poll();
    }, PUBLIC_MATCHMAKING_POLL_MS);
  }

  async poll() {
    if (!this.ticket || this.state.status !== 'searching') return;
    if (
      this.state.queuedAt > 0
      && this.now() - this.state.queuedAt >= PUBLIC_MATCHMAKING_QUEUE_TIMEOUT_MS
    ) {
      await this.cancel({ reason: 'client-timeout' });
      this.publish({
        status: 'expired',
        message: 'No compatible player was found before the search expired.'
      });
      return;
    }

    try {
      const response = await this.fetchImpl(
        matchmakingEndpoint(this.serverUrl, '/matchmaking/status', {
          ticketId: this.ticket.ticketId,
          token: this.ticket.token
        }),
        {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          signal: this.abortController?.signal
        }
      );
      const payload = normalizeMatchmakingResponse(
        await readJsonResponse(response)
      );
      this.acceptServerSnapshot(payload);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      this.fail(cleanMessage(error?.message), error?.code);
    }
  }

  async acknowledgeConnected() {
    if (!this.ticket?.ticketId || !this.ticket?.token) return false;
    try {
      const response = await this.fetchImpl(
        matchmakingEndpoint(this.serverUrl, '/matchmaking/ack'),
        {
          method: 'POST',
          cache: 'no-store',
          credentials: 'omit',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ticketId: this.ticket.ticketId,
            token: this.ticket.token
          })
        }
      );
      const payload = normalizeMatchmakingResponse(
        await readJsonResponse(response)
      );
      this.acceptServerSnapshot(payload);
      return true;
    } catch {
      this.finishLifecycle({ clearTicket: true });
      return false;
    }
  }

  async cancel({ reason = 'cancelled-by-player' } = {}) {
    const ticket = this.ticket;
    this.abortController?.abort?.();
    this.abortController = null;
    this.stopTimers();

    if (ticket?.ticketId && ticket?.token && this.serverUrl) {
      try {
        await this.fetchImpl(
          matchmakingEndpoint(this.serverUrl, '/matchmaking/cancel', {
            ticketId: ticket.ticketId,
            token: ticket.token,
            reason
          }),
          {
            method: 'DELETE',
            cache: 'no-store',
            credentials: 'omit'
          }
        );
      } catch {
        // Local cancellation must complete even when the network is unavailable.
      }
    }

    this.ticket = null;
    this.matchDelivered = false;
    this.publish({
      status: 'cancelled',
      message: null,
      error: null,
      assignment: null,
      ticketId: null
    });
    this.finishLifecycle({ clearTicket: true });
    return true;
  }

  fail(message, code = null) {
    this.stopTimers();
    this.abortController?.abort?.();
    this.abortController = null;
    this.ticket = null;
    this.matchDelivered = false;
    this.publish({
      status: 'error',
      message: cleanMessage(message),
      error: code || null,
      assignment: null
    });
    this.finishLifecycle({ clearTicket: true });
    return this.getSnapshot();
  }

  startClock() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = setInterval(() => {
      if (!this.isActive()) return;
      this.publish({});
    }, 1000);
  }

  stopPoll() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  stopTimers() {
    this.stopPoll();
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  finishLifecycle({ clearTicket = false } = {}) {
    this.stopTimers();
    this.releaseTabLock();
    if (clearTicket) this.clearStoredTicket();
  }

  destroy() {
    this.abortController?.abort?.();
    this.abortController = null;
    this.stopTimers();
    this.releaseTabLock();
  }
}

export const PUBLIC_MATCHMAKING_CAPABILITY = Object.freeze({
  schema: PUBLIC_MATCHMAKING_SCHEMA,
  patch: PUBLIC_MATCHMAKING_PATCH
});
