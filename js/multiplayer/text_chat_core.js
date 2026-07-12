// js/multiplayer/text_chat_core.js
export const TEXT_CHAT_PATCH = 'm5-coop-communication-safety-r1';
export const TEXT_CHAT_MAX_LENGTH = 160;
export const TEXT_CHAT_HISTORY_LIMIT = 50;

function cleanString(value, maxLength) {
  return String(value ?? '')
    .normalize?.('NFKC')
    ?.replace(/[\u0000-\u001f\u007f]/g, ' ')
    ?.replace(/\s+/g, ' ')
    ?.trim()
    ?.slice(0, maxLength) || '';
}

export function sanitizeTextChatText(value) {
  return cleanString(value, TEXT_CHAT_MAX_LENGTH);
}

export function sanitizeTextChatName(value) {
  return cleanString(value, 24) || 'Player';
}

export function normalizeTextChatMessage(candidate, { now = Date.now() } = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const messageId = cleanString(candidate.messageId, 160);
  const playerId = cleanString(candidate.playerId, 160);
  const displayName = sanitizeTextChatName(candidate.displayName);
  const text = sanitizeTextChatText(candidate.text);
  const sentAt = Number(candidate.sentAt);
  if (!messageId || !playerId || !text || !Number.isFinite(sentAt)) return null;
  if (sentAt > Number(now) + 60_000 || sentAt < Number(now) - 86_400_000) return null;
  return Object.freeze({
    messageId,
    playerId,
    displayName,
    text,
    roomCode: cleanString(candidate.roomCode, 12) || null,
    runId: cleanString(candidate.runId, 160) || null,
    sentAt
  });
}

export class TextChatStore {
  constructor({ historyLimit = TEXT_CHAT_HISTORY_LIMIT } = {}) {
    this.historyLimit = Math.max(5, Math.min(100, Math.floor(Number(historyLimit) || TEXT_CHAT_HISTORY_LIMIT)));
    this.messages = [];
    this.seen = new Set();
  }

  add(candidate, options = {}) {
    const message = normalizeTextChatMessage(candidate, options);
    if (!message) return { accepted: false, reason: 'invalid-message', message: null };
    if (this.seen.has(message.messageId)) return { accepted: false, reason: 'duplicate', message };
    this.seen.add(message.messageId);
    this.messages.push(message);
    while (this.messages.length > this.historyLimit) {
      const removed = this.messages.shift();
      if (removed) this.seen.delete(removed.messageId);
    }
    return { accepted: true, reason: 'accepted', message };
  }

  clear() {
    this.messages.length = 0;
    this.seen.clear();
  }

  getSnapshot() {
    return Object.freeze({
      patch: TEXT_CHAT_PATCH,
      historyLimit: this.historyLimit,
      messages: Object.freeze(this.messages.slice())
    });
  }
}
