// SOCIAL.1 — lightweight runtime bridge for multiplayer/chat integration.

let provider = null;

export function setSocialRuntimeProvider(nextProvider) {
  provider = nextProvider && typeof nextProvider === 'object'
    ? nextProvider
    : null;
}

export function getSocialRuntimeSnapshot() {
  try {
    return provider?.getSnapshot?.() || null;
  } catch {
    return null;
  }
}

export function isSocialPlayerBlocked(playerId, room = null) {
  try {
    return provider?.isPlayerBlocked?.(playerId, room) === true;
  } catch {
    return false;
  }
}

export function getSocialIdentityTicket(context = {}) {
  try {
    return Promise.resolve(provider?.getIdentityTicket?.(context) || null);
  } catch {
    return Promise.resolve(null);
  }
}


export function getSocialMatchmakingPartyContext() {
  try {
    return provider?.getMatchmakingPartyContext?.() || null;
  } catch {
    return null;
  }
}

export function getSocialPartyMatchmakingTicket(context = {}) {
  try {
    return Promise.resolve(
      provider?.getPartyMatchmakingTicket?.(context) || null
    );
  } catch {
    return Promise.resolve(null);
  }
}
