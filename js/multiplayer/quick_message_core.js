// js/multiplayer/quick_message_core.js
import { TACTICAL_PING_TYPES, normalizePingType } from './tactical_ping_core.js';

export const QUICK_MESSAGE_PATCH = 'm5-coop-quick-message-wheel-r1';

export const QUICK_MESSAGE_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: TACTICAL_PING_TYPES.ENEMY,
    label: 'Enemy here',
    shortLabel: 'ENEMY',
    digit: '1',
    description: 'Mark the enemy or world position under your aim.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.NEED_HELP,
    label: 'Need help',
    shortLabel: 'HELP',
    digit: '2',
    description: 'Mark your current position and ask the team for assistance.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.NEED_AMMO,
    label: 'Need ammo',
    shortLabel: 'AMMO',
    digit: '3',
    description: 'Mark your current position and request ammunition.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.REVIVE_ME,
    label: 'Revive me',
    shortLabel: 'REVIVE',
    digit: '4',
    description: 'Mark your downed position for teammates.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.BUY_OPEN,
    label: 'Buy / open this',
    shortLabel: 'BUY / OPEN',
    digit: '5',
    description: 'Mark the object or world position under your aim.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.FOLLOW_ME,
    label: 'Follow me',
    shortLabel: 'FOLLOW',
    digit: '6',
    description: 'Mark your current position as a rally point.'
  })
]);

const BY_TYPE = new Map(QUICK_MESSAGE_DEFINITIONS.map((entry) => [entry.type, entry]));
const BY_DIGIT = new Map(QUICK_MESSAGE_DEFINITIONS.map((entry) => [entry.digit, entry]));

export function getQuickMessageDefinition(value) {
  const type = normalizePingType(value);
  return type ? BY_TYPE.get(type) || null : null;
}

export function quickMessageTypeForDigit(value) {
  return BY_DIGIT.get(String(value || '').replace(/^Digit/, ''))?.type || null;
}

export function isQuickMessageAllowed(
  value,
  { online = false, alive = true } = {}
) {
  const definition = getQuickMessageDefinition(value);
  if (!definition) return Object.freeze({ allowed: false, reason: 'invalid-type', definition: null });
  if (online !== true) return Object.freeze({ allowed: false, reason: 'offline', definition });
  if (
    alive !== true
    && definition.type !== TACTICAL_PING_TYPES.NEED_HELP
    && definition.type !== TACTICAL_PING_TYPES.REVIVE_ME
  ) {
    return Object.freeze({ allowed: false, reason: 'downed', definition });
  }
  return Object.freeze({ allowed: true, reason: 'ready', definition });
}

export function quickMessageFeedback(result, value) {
  const definition = getQuickMessageDefinition(value);
  if (result?.accepted === true) return `${definition?.label || 'Message'} sent`;
  const reason = String(result?.reason || 'not-ready');
  if (reason === 'cooldown') return 'Quick message cooling down';
  if (reason === 'spam') return 'Too many quick messages';
  if (reason === 'downed') return 'Use Need help or Revive me while downed';
  if (reason === 'offline') return 'Quick messages require an active co-op run';
  return 'Quick message is not ready';
}
