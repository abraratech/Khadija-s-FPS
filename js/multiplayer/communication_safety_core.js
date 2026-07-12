// js/multiplayer/communication_safety_core.js
export const COMMUNICATION_SAFETY_PATCH = 'm5-coop-communication-safety-r1';
export const COMMUNICATION_SAFETY_STORAGE_KEY = 'khadijasArena.multiplayer.communicationSafety.v1';
export const COMMUNICATION_SAFETY_MAX_MUTED_PLAYERS = 64;

function cleanPlayerId(value) {
  return String(value ?? '')
    .normalize?.('NFKC')
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    ?.trim()
    ?.slice(0, 160) || '';
}

export function normalizeCommunicationSafetyState(candidate) {
  const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate
    : {};
  const unique = [];
  const seen = new Set();
  const values = Array.isArray(source.mutedTextPlayerIds) ? source.mutedTextPlayerIds : [];
  for (const raw of values) {
    const playerId = cleanPlayerId(raw);
    if (!playerId || seen.has(playerId)) continue;
    seen.add(playerId);
    unique.push(playerId);
    if (unique.length >= COMMUNICATION_SAFETY_MAX_MUTED_PLAYERS) break;
  }
  return Object.freeze({
    muteAllText: source.muteAllText === true,
    mutedTextPlayerIds: Object.freeze(unique)
  });
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export class CommunicationSafetyStore {
  constructor({ storage = defaultStorage(), storageKey = COMMUNICATION_SAFETY_STORAGE_KEY } = {}) {
    this.storage = storage;
    this.storageKey = String(storageKey || COMMUNICATION_SAFETY_STORAGE_KEY);
    this.state = normalizeCommunicationSafetyState(null);
    this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem?.(this.storageKey);
      this.state = normalizeCommunicationSafetyState(raw ? JSON.parse(raw) : null);
    } catch {
      this.state = normalizeCommunicationSafetyState(null);
    }
    return this.getSnapshot();
  }

  save() {
    try {
      this.storage?.setItem?.(this.storageKey, JSON.stringify(this.state));
      return true;
    } catch {
      return false;
    }
  }

  setMuteAllText(value) {
    this.state = normalizeCommunicationSafetyState({
      ...this.state,
      muteAllText: value === true
    });
    this.save();
    return this.getSnapshot();
  }

  setTextPlayerMuted(playerId, muted = true) {
    const normalizedId = cleanPlayerId(playerId);
    if (!normalizedId) return { changed: false, reason: 'invalid-player', snapshot: this.getSnapshot() };
    const next = new Set(this.state.mutedTextPlayerIds);
    const had = next.has(normalizedId);
    if (muted === true) next.add(normalizedId);
    else next.delete(normalizedId);
    this.state = normalizeCommunicationSafetyState({
      muteAllText: this.state.muteAllText,
      mutedTextPlayerIds: [...next]
    });
    this.save();
    return {
      changed: had !== this.state.mutedTextPlayerIds.includes(normalizedId),
      reason: muted === true ? 'muted' : 'unmuted',
      snapshot: this.getSnapshot()
    };
  }

  toggleTextPlayer(playerId) {
    const normalizedId = cleanPlayerId(playerId);
    if (!normalizedId) return { changed: false, reason: 'invalid-player', snapshot: this.getSnapshot() };
    return this.setTextPlayerMuted(normalizedId, !this.isTextPlayerMuted(normalizedId));
  }

  isTextPlayerMuted(playerId) {
    const normalizedId = cleanPlayerId(playerId);
    return Boolean(normalizedId && this.state.mutedTextPlayerIds.includes(normalizedId));
  }

  shouldHideText(playerId) {
    return this.state.muteAllText === true || this.isTextPlayerMuted(playerId);
  }

  clearTextPlayerMutes() {
    this.state = normalizeCommunicationSafetyState({
      muteAllText: this.state.muteAllText,
      mutedTextPlayerIds: []
    });
    this.save();
    return this.getSnapshot();
  }

  reset() {
    this.state = normalizeCommunicationSafetyState(null);
    try { this.storage?.removeItem?.(this.storageKey); } catch {}
    return this.getSnapshot();
  }

  getSnapshot() {
    return Object.freeze({
      patch: COMMUNICATION_SAFETY_PATCH,
      storageKey: this.storageKey,
      muteAllText: this.state.muteAllText,
      mutedTextPlayerIds: Object.freeze([...this.state.mutedTextPlayerIds])
    });
  }
}
