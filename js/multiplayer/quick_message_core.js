// POST-FINAL.3 R1 — combined eight-command squad wheel.
import { TACTICAL_PING_TYPES, normalizePingType } from './tactical_ping_core.js';

export const QUICK_MESSAGE_PATCH = 'post-final3-r1-squad-command-wheel';

export const QUICK_MESSAGE_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: TACTICAL_PING_TYPES.ENEMY,
    label: 'Enemy priority',
    shortLabel: 'ATTACK',
    digit: '1',
    description: 'Prioritize the enemy or threat under your aim.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.MOVE,
    label: 'Move here',
    shortLabel: 'MOVE',
    digit: '2',
    description: 'Send the squad to the world position under your aim.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.DEFEND,
    label: 'Defend here',
    shortLabel: 'DEFEND',
    digit: '3',
    description: 'Hold and protect the marked position.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.REGROUP,
    label: 'Regroup',
    shortLabel: 'REGROUP',
    digit: '4',
    description: 'Rally the team around your current position.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.INTERACT,
    label: 'Interact here',
    shortLabel: 'INTERACT',
    digit: '5',
    description: 'Mark loot, a door, purchase, or objective under your aim.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.REVIVE,
    label: 'Revive / rescue',
    shortLabel: 'REVIVE',
    digit: '6',
    description: 'Prioritize a downed teammate or request your own revive.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.NEED_HELP,
    label: 'Need help',
    shortLabel: 'HELP',
    digit: '7',
    description: 'Call the squad to assist at your current position.'
  }),
  Object.freeze({
    type: TACTICAL_PING_TYPES.FOLLOW_ME,
    label: 'Follow me',
    shortLabel: 'FOLLOW',
    digit: '8',
    description: 'Ask the squad to stay with your live position.'
  })
]);

const BY_TYPE = new Map(QUICK_MESSAGE_DEFINITIONS.map((entry) => [entry.type, entry]));
const BY_DIGIT = new Map(QUICK_MESSAGE_DEFINITIONS.map((entry) => [entry.digit, entry]));

export function getQuickMessageDefinition(value) {
  const type = normalizePingType(value);
  if (!type) return null;
  if (type === TACTICAL_PING_TYPES.REVIVE_ME) return BY_TYPE.get(TACTICAL_PING_TYPES.REVIVE) || null;
  if (type === TACTICAL_PING_TYPES.BUY_OPEN) return BY_TYPE.get(TACTICAL_PING_TYPES.INTERACT) || null;
  return BY_TYPE.get(type) || null;
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
    && definition.type !== TACTICAL_PING_TYPES.REVIVE
  ) {
    return Object.freeze({ allowed: false, reason: 'downed', definition });
  }
  return Object.freeze({ allowed: true, reason: 'ready', definition });
}

export function quickMessageFeedback(result, value) {
  const definition = getQuickMessageDefinition(value);
  if (result?.accepted === true) return `${definition?.label || 'Command'} sent`;
  const reason = String(result?.reason || 'not-ready');
  if (reason === 'cooldown') return 'Squad command cooling down';
  if (reason === 'spam') return 'Too many squad commands';
  if (reason === 'downed') return 'Use Need help or Revive while downed';
  if (reason === 'offline') return 'Squad commands require an active co-op run';
  return 'Squad command is not ready';
}
