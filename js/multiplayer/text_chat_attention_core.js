// js/multiplayer/text_chat_attention_core.js
export const TEXT_CHAT_ATTENTION_PATCH = 'post1b-text-chat-attention-lobby-r1';
export const TEXT_CHAT_UNREAD_LIMIT = 99;
export const TEXT_CHAT_PREVIEW_LIMIT = 92;

function clean(value, limit) {
  return String(value ?? '')
    .normalize?.('NFKC')
    ?.replace(/[\u0000-\u001f\u007f]/g, ' ')
    ?.replace(/\s+/g, ' ')
    ?.trim()
    ?.slice(0, limit) || '';
}

export function shouldNotifyTextChat({
  muted = false,
  localMessage = false,
  chatOpen = false,
  lobbyVisible = false
} = {}) {
  return muted !== true
    && localMessage !== true
    && chatOpen !== true
    && lobbyVisible !== true;
}

export function nextTextChatUnreadCount(current, {
  notify = false,
  clear = false
} = {}) {
  if (clear === true) return 0;
  const value = Math.max(0, Math.floor(Number(current) || 0));
  if (notify !== true) return Math.min(TEXT_CHAT_UNREAD_LIMIT, value);
  return Math.min(TEXT_CHAT_UNREAD_LIMIT, value + 1);
}

export function formatTextChatPreview(message, limit = TEXT_CHAT_PREVIEW_LIMIT) {
  const maxLength = Math.max(24, Math.min(160, Math.floor(Number(limit) || TEXT_CHAT_PREVIEW_LIMIT)));
  const name = clean(message?.displayName, 24) || 'Player';
  const text = clean(message?.text, 160);
  const prefix = `${name}: `;
  const room = Math.max(1, maxLength - prefix.length);
  const clipped = text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text;
  return `${prefix}${clipped || 'New room message'}`.slice(0, maxLength + 1);
}
