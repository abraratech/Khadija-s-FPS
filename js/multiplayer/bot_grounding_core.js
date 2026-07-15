// js/multiplayer/bot_grounding_core.js
// BOT.1 R2.8.2 — independent authored-floor grounding for the AI wingman.

export const BOT1_EYE_HEIGHT = 1.75;

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function isBotGroundSupportHit(hit = {}) {
  const object = hit?.object;
  const pointY = Number(hit?.point?.y);
  if (!object || !Number.isFinite(pointY)) return false;

  const data = object.userData || {};
  if (
    data.isMapDressing === true
    || data.playerNonWalkable === true
    || data.noCollision === true
  ) {
    return false;
  }

  // Explicit metadata allows future ramps or authored multi-level surfaces to
  // opt in without making crates, vehicles, railings, or props into bot floors.
  if (data.botGroundSupport === true) return true;

  const supportTag = String(data.supportTag || '').trim().toLowerCase();
  return supportTag === 'floor' || supportTag.endsWith('_floor');
}

export function resolveBotGroundEyeY({
  hits = [],
  fallbackEyeY = BOT1_EYE_HEIGHT,
  eyeHeight = BOT1_EYE_HEIGHT
} = {}) {
  const support = Array.isArray(hits)
    ? hits.find(isBotGroundSupportHit)
    : null;
  if (!support) return finite(fallbackEyeY, BOT1_EYE_HEIGHT);
  return finite(support.point?.y) + Math.max(0.1, finite(eyeHeight, BOT1_EYE_HEIGHT));
}
