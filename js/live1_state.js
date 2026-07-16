// LIVE.1 R1 — shared server-manifest state for runtime and progression.

import {
  LIVE1_PATCH,
  normalizeLive1Manifest
} from './live1_core.js';

let manifestSnapshot = null;
let source = 'none';
let receivedAt = 0;
let serverOffsetMs = 0;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function setLive1ManifestSnapshot(value, {
  sourceName = 'worker',
  localReceivedAt = Date.now()
} = {}) {
  const normalized = normalizeLive1Manifest(value, localReceivedAt);
  manifestSnapshot = clone(normalized);
  source = String(sourceName || 'worker').slice(0, 32);
  receivedAt = Math.max(1, Number(localReceivedAt) || Date.now());
  serverOffsetMs = Number(normalized.serverNow || receivedAt) - receivedAt;
  return getLive1ManifestSnapshot();
}

export function clearLive1ManifestSnapshot() {
  manifestSnapshot = null;
  source = 'none';
  receivedAt = 0;
  serverOffsetMs = 0;
}

export function getLive1ServerNow(localNow = Date.now()) {
  return Math.max(1, Math.floor((Number(localNow) || Date.now()) + serverOffsetMs));
}

export function getLive1ManifestSnapshot() {
  if (!manifestSnapshot) return null;
  return Object.freeze({
    ...clone(manifestSnapshot),
    source,
    receivedAt,
    estimatedServerNow: getLive1ServerNow()
  });
}

export function getLive1RunDirective(mapId = 'grid_bunker') {
  const manifest = getLive1ManifestSnapshot();
  if (!manifest || manifest.patch !== LIVE1_PATCH || manifest.season?.active !== true) {
    return null;
  }
  const normalizedMap = String(mapId || 'grid_bunker').trim().toLowerCase();
  return Object.freeze({
    patch: LIVE1_PATCH,
    schema: manifest.schema,
    seasonId: manifest.season.id,
    seasonLabel: manifest.season.label,
    manifestRevision: manifest.revision,
    validUntil: manifest.validUntil,
    featuredArenaId: manifest.daily.featuredArena.id,
    featuredOperationId: manifest.weekly.featuredOperation.operationId,
    featuredOperationMapId: manifest.weekly.featuredOperation.id,
    featuredEncounterId: manifest.daily.featuredEncounter.id,
    featuredEncounterLabel: manifest.daily.featuredEncounter.label,
    isFeaturedArena: normalizedMap === manifest.daily.featuredArena.id,
    isFeaturedOperationArena: normalizedMap === manifest.weekly.featuredOperation.id
  });
}
