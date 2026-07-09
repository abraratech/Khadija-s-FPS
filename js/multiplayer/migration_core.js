// js/multiplayer/migration_core.js

export const HOST_MIGRATION_PHASES = Object.freeze({
  STABLE: 'stable',
  ELECTING: 'electing',
  RESTORING: 'restoring',
  RESUMED: 'resumed'
});

function cleanId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).slice(0, 160);
}

function cloneJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function normalizeAuthorityEpoch(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function normalizeAuthorityCheckpoint(checkpoint = null) {
  const source = checkpoint && typeof checkpoint === 'object'
    ? checkpoint
    : {};

  return {
    runId: cleanId(source.runId),
    authorityEpoch: normalizeAuthorityEpoch(source.authorityEpoch),
    updatedAt: Math.max(0, Number(source.updatedAt) || 0),
    world: cloneJson(source.world),
    economy: cloneJson(source.economy),
    revive: cloneJson(source.revive)
  };
}

export function checkpointHasState(checkpoint = null) {
  const normalized = normalizeAuthorityCheckpoint(checkpoint);
  return Boolean(
    normalized.world
    || normalized.economy
    || normalized.revive
  );
}

export function chooseHostCandidate(players = [], {
  excludePlayerId = null
} = {}) {
  const excluded = cleanId(excludePlayerId);
  return (Array.isArray(players) ? players : [])
    .filter((entry) => (
      entry?.playerId
      && entry.connected !== false
      && entry.playerId !== excluded
    ))
    .slice()
    .sort((a, b) => {
      const joinedDelta = (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0);
      if (joinedDelta !== 0) return joinedDelta;
      return String(a.playerId).localeCompare(String(b.playerId));
    })[0] || null;
}

export function envelopeMatchesAuthorityEpoch(
  envelope,
  authorityEpoch,
  { allowFuture = false } = {}
) {
  const expected = normalizeAuthorityEpoch(authorityEpoch);
  const received = normalizeAuthorityEpoch(envelope?.authorityEpoch);
  return allowFuture ? received >= expected : received === expected;
}

export class HostMigrationState {
  constructor() {
    this.reset();
  }

  reset({ authorityEpoch = 0, hostPlayerId = null } = {}) {
    this.phase = HOST_MIGRATION_PHASES.STABLE;
    this.authorityEpoch = normalizeAuthorityEpoch(authorityEpoch);
    this.hostPlayerId = cleanId(hostPlayerId);
    this.previousHostPlayerId = null;
    this.checkpoint = normalizeAuthorityCheckpoint();
    this.migratedAt = 0;
    return this.getSnapshot();
  }

  begin({
    authorityEpoch,
    hostPlayerId,
    previousHostPlayerId = null,
    checkpoint = null,
    migratedAt = Date.now()
  } = {}) {
    const nextEpoch = normalizeAuthorityEpoch(authorityEpoch);
    if (nextEpoch < this.authorityEpoch) return false;

    this.phase = HOST_MIGRATION_PHASES.RESTORING;
    this.authorityEpoch = nextEpoch;
    this.hostPlayerId = cleanId(hostPlayerId);
    this.previousHostPlayerId = cleanId(previousHostPlayerId);
    this.checkpoint = normalizeAuthorityCheckpoint(checkpoint);
    this.migratedAt = Math.max(0, Number(migratedAt) || Date.now());
    return true;
  }

  markResumed() {
    this.phase = HOST_MIGRATION_PHASES.RESUMED;
    return this.getSnapshot();
  }

  markStable() {
    this.phase = HOST_MIGRATION_PHASES.STABLE;
    return this.getSnapshot();
  }

  getSnapshot() {
    return {
      phase: this.phase,
      authorityEpoch: this.authorityEpoch,
      hostPlayerId: this.hostPlayerId,
      previousHostPlayerId: this.previousHostPlayerId,
      checkpoint: normalizeAuthorityCheckpoint(this.checkpoint),
      migratedAt: this.migratedAt
    };
  }
}
