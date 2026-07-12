// multiplayer-server/src/text_chat_core.js
export const TEXT_CHAT_MAX_LENGTH = 160;
export const TEXT_CHAT_MIN_INTERVAL_MS = 600;
export const TEXT_CHAT_WINDOW_MS = 10_000;
export const TEXT_CHAT_MAX_PER_WINDOW = 8;

function clean(value, maxLength) {
  return String(value ?? '')
    .normalize?.('NFKC')
    ?.replace(/[\u0000-\u001f\u007f]/g, ' ')
    ?.replace(/\s+/g, ' ')
    ?.trim()
    ?.slice(0, maxLength) || '';
}

export function sanitizeTextChatText(value) {
  return clean(value, TEXT_CHAT_MAX_LENGTH);
}

export function consumeTextChatRate(state = {}, now = Date.now()) {
  const timestamp = Number(now) || Date.now();
  let windowStartedAt = Number(state.chatWindowStartedAt) || timestamp;
  let messagesInWindow = Math.max(0, Math.floor(Number(state.chatMessagesInWindow) || 0));
  const lastSentAt = Math.max(0, Number(state.chatLastSentAt) || 0);
  if (timestamp - windowStartedAt >= TEXT_CHAT_WINDOW_MS) {
    windowStartedAt = timestamp;
    messagesInWindow = 0;
  }
  if (lastSentAt && timestamp - lastSentAt < TEXT_CHAT_MIN_INTERVAL_MS) {
    return {
      allowed: false,
      reason: 'cooldown',
      retryAfterMs: TEXT_CHAT_MIN_INTERVAL_MS - (timestamp - lastSentAt),
      state: { chatWindowStartedAt: windowStartedAt, chatMessagesInWindow: messagesInWindow, chatLastSentAt: lastSentAt }
    };
  }
  if (messagesInWindow >= TEXT_CHAT_MAX_PER_WINDOW) {
    return {
      allowed: false,
      reason: 'rate-limit',
      retryAfterMs: Math.max(1, TEXT_CHAT_WINDOW_MS - (timestamp - windowStartedAt)),
      state: { chatWindowStartedAt: windowStartedAt, chatMessagesInWindow: messagesInWindow, chatLastSentAt: lastSentAt }
    };
  }
  return {
    allowed: true,
    reason: 'ready',
    retryAfterMs: 0,
    state: {
      chatWindowStartedAt: windowStartedAt,
      chatMessagesInWindow: messagesInWindow + 1,
      chatLastSentAt: timestamp
    }
  };
}

export function buildTextChatMessage({ messageId, playerId, displayName, text, roomCode, runId = null, sentAt = Date.now() } = {}) {
  const cleanText = sanitizeTextChatText(text);
  const cleanId = clean(messageId, 160);
  const cleanPlayerId = clean(playerId, 160);
  if (!cleanText || !cleanId || !cleanPlayerId) return null;
  return Object.freeze({
    messageId: cleanId,
    playerId: cleanPlayerId,
    displayName: clean(displayName, 24) || 'Player',
    text: cleanText,
    roomCode: clean(roomCode, 12) || null,
    runId: clean(runId, 160) || null,
    sentAt: Number(sentAt) || Date.now()
  });
}
