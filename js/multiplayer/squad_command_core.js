// POST-FINAL.3 R1 — combined squad command and team-intelligence core.

import { TACTICAL_PING_TYPES, normalizePingType, sanitizePingText } from './tactical_ping_core.js';

export const SQUAD_COMMAND_PATCH = 'post-final3-r1-squad-command-team-intelligence';

export const SQUAD_COMMAND_STATUS = Object.freeze({
  IDLE: 'IDLE',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  ENGAGING: 'ENGAGING',
  MOVING: 'MOVING',
  DEFENDING: 'DEFENDING',
  REGROUPING: 'REGROUPING',
  ASSISTING: 'ASSISTING',
  REVIVING: 'REVIVING',
  INTERACTING: 'INTERACTING',
  COMPLETE: 'COMPLETE',
  UNAVAILABLE: 'UNAVAILABLE'
});

const PROFILE = Object.freeze({
  [TACTICAL_PING_TYPES.ENEMY]: Object.freeze({
    priority: 80,
    durationMs: 12000,
    status: SQUAD_COMMAND_STATUS.ENGAGING,
    acknowledgement: 'ENEMY PRIORITY ACKNOWLEDGED'
  }),
  [TACTICAL_PING_TYPES.MOVE]: Object.freeze({
    priority: 55,
    durationMs: 12000,
    status: SQUAD_COMMAND_STATUS.MOVING,
    acknowledgement: 'MOVING TO MARK'
  }),
  [TACTICAL_PING_TYPES.DEFEND]: Object.freeze({
    priority: 70,
    durationMs: 18000,
    status: SQUAD_COMMAND_STATUS.DEFENDING,
    acknowledgement: 'DEFEND POSITION ACKNOWLEDGED'
  }),
  [TACTICAL_PING_TYPES.REGROUP]: Object.freeze({
    priority: 75,
    durationMs: 14000,
    status: SQUAD_COMMAND_STATUS.REGROUPING,
    acknowledgement: 'REGROUPING'
  }),
  [TACTICAL_PING_TYPES.INTERACT]: Object.freeze({
    priority: 45,
    durationMs: 10000,
    status: SQUAD_COMMAND_STATUS.INTERACTING,
    acknowledgement: 'CHECKING INTERACTABLE'
  }),
  [TACTICAL_PING_TYPES.BUY_OPEN]: Object.freeze({
    priority: 45,
    durationMs: 10000,
    status: SQUAD_COMMAND_STATUS.INTERACTING,
    acknowledgement: 'CHECKING INTERACTABLE'
  }),
  [TACTICAL_PING_TYPES.REVIVE]: Object.freeze({
    priority: 100,
    durationMs: 16000,
    status: SQUAD_COMMAND_STATUS.REVIVING,
    acknowledgement: 'RESCUE PRIORITY ACKNOWLEDGED'
  }),
  [TACTICAL_PING_TYPES.REVIVE_ME]: Object.freeze({
    priority: 100,
    durationMs: 16000,
    status: SQUAD_COMMAND_STATUS.REVIVING,
    acknowledgement: 'REVIVE REQUEST ACKNOWLEDGED'
  }),
  [TACTICAL_PING_TYPES.NEED_HELP]: Object.freeze({
    priority: 90,
    durationMs: 14000,
    status: SQUAD_COMMAND_STATUS.ASSISTING,
    acknowledgement: 'ASSISTING NOW'
  }),
  [TACTICAL_PING_TYPES.FOLLOW_ME]: Object.freeze({
    priority: 65,
    durationMs: 16000,
    status: SQUAD_COMMAND_STATUS.REGROUPING,
    acknowledgement: 'FOLLOWING YOUR POSITION'
  }),
  [TACTICAL_PING_TYPES.NEED_AMMO]: Object.freeze({
    priority: 40,
    durationMs: 8000,
    status: SQUAD_COMMAND_STATUS.ASSISTING,
    acknowledgement: 'AMMO REQUEST NOTED'
  })
});

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function position(value = {}) {
  return Object.freeze({
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z)
  });
}

export function getSquadCommandProfile(value) {
  const type = normalizePingType(value);
  return type ? PROFILE[type] || null : null;
}

export function buildSquadCommandIntent(ping, {
  now = 0,
  epochNow = Date.now()
} = {}) {
  const type = normalizePingType(ping?.type);
  const profile = getSquadCommandProfile(type);
  if (!type || !profile || !ping?.pingId || !ping?.ownerPlayerId || !ping?.position) {
    return null;
  }

  const createdAt = Math.max(0, finite(now));
  return Object.freeze({
    commandId: String(ping.pingId).slice(0, 160),
    type,
    priority: profile.priority,
    status: profile.status,
    acknowledgement: profile.acknowledgement,
    ownerPlayerId: String(ping.ownerPlayerId).slice(0, 96),
    ownerName: sanitizePingText(ping.ownerName, 'OPERATIVE'),
    position: position(ping.position),
    targetId: ping.targetId ? String(ping.targetId).slice(0, 96) : null,
    createdAt,
    expiresAt: createdAt + profile.durationMs,
    createdAtEpochMs: Math.max(0, finite(epochNow, Date.now())),
    expiresAtEpochMs: Math.max(0, finite(epochNow, Date.now())) + profile.durationMs
  });
}

export function shouldAcceptSquadCommand(current, candidate, now = 0) {
  if (!candidate) return false;
  if (!current || finite(current.expiresAt) <= finite(now)) return true;
  if (candidate.commandId === current.commandId) return false;
  if (candidate.priority > current.priority) return true;
  if (candidate.priority < current.priority) return false;
  return finite(candidate.createdAt) >= finite(current.createdAt);
}

export function squadCommandIsActive(command, now = 0) {
  return Boolean(command && finite(command.expiresAt) > finite(now));
}

export function isMovementSquadCommand(value) {
  const type = normalizePingType(value);
  return [
    TACTICAL_PING_TYPES.MOVE,
    TACTICAL_PING_TYPES.DEFEND,
    TACTICAL_PING_TYPES.REGROUP,
    TACTICAL_PING_TYPES.FOLLOW_ME,
    TACTICAL_PING_TYPES.NEED_HELP,
    TACTICAL_PING_TYPES.INTERACT,
    TACTICAL_PING_TYPES.BUY_OPEN
  ].includes(type);
}

export function isRescueSquadCommand(value) {
  const type = normalizePingType(value);
  return [TACTICAL_PING_TYPES.REVIVE, TACTICAL_PING_TYPES.REVIVE_ME].includes(type);
}

export function commandReached(command, botPosition, radius = 1.8) {
  if (!command?.position || !botPosition) return false;
  const dx = finite(command.position.x) - finite(botPosition.x);
  const dz = finite(command.position.z) - finite(botPosition.z);
  return Math.hypot(dx, dz) <= Math.max(0.5, finite(radius, 1.8));
}

export function chooseCommandEnemyTarget(enemies = [], command = null) {
  if (!command || normalizePingType(command.type) !== TACTICAL_PING_TYPES.ENEMY) return null;
  const valid = enemies.filter((enemy) => (
    enemy?.alive !== false
    && Number(enemy?.dyingT) < 0
    && Number(enemy?.health || 0) > 0
    && enemy?.mesh?.position
  ));
  if (!valid.length) return null;

  if (command.targetId) {
    const exact = valid.find((enemy) => String(
      enemy.networkEnemyId || enemy.enemyId || enemy.id || enemy.mesh?.uuid || enemy.type || ''
    ) === command.targetId);
    if (exact) return exact;
  }

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  valid.forEach((enemy) => {
    const dx = finite(enemy.mesh.position.x) - finite(command.position.x);
    const dz = finite(enemy.mesh.position.z) - finite(command.position.z);
    const dist = Math.hypot(dx, dz);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = enemy;
    }
  });
  return best;
}

export function squadIntentLabel(value) {
  const type = normalizePingType(value);
  const labels = {
    [TACTICAL_PING_TYPES.ENEMY]: 'ATTACK MARK',
    [TACTICAL_PING_TYPES.MOVE]: 'MOVE HERE',
    [TACTICAL_PING_TYPES.DEFEND]: 'DEFEND HERE',
    [TACTICAL_PING_TYPES.REGROUP]: 'REGROUP',
    [TACTICAL_PING_TYPES.INTERACT]: 'INTERACT',
    [TACTICAL_PING_TYPES.BUY_OPEN]: 'INTERACT',
    [TACTICAL_PING_TYPES.REVIVE]: 'REVIVE / RESCUE',
    [TACTICAL_PING_TYPES.REVIVE_ME]: 'REVIVE ME',
    [TACTICAL_PING_TYPES.NEED_HELP]: 'NEED HELP',
    [TACTICAL_PING_TYPES.FOLLOW_ME]: 'FOLLOW ME',
    [TACTICAL_PING_TYPES.NEED_AMMO]: 'NEED AMMO'
  };
  return labels[type] || String(type || 'SQUAD COMMAND');
}
