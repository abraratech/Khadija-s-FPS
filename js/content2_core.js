// js/content2_core.js
// CONTENT.2 R1 — Stormbreak Canal and enemy-archetype expansion.
// Pure deterministic helpers; no renderer or network dependencies.

export const CONTENT2_PATCH = 'content2-r1-new-arena-enemy-expansion';
export const CONTENT2_SCHEMA = 1;
export const CONTENT2_ARENA_ID = 'stormbreak_canal';

export const CONTENT2_ENEMY_TYPES = Object.freeze({
  WARDEN: 'WARDEN',
  STALKER: 'STALKER',
  SAPPER: 'SAPPER'
});

export const CONTENT2_ENEMY_DEFINITIONS = Object.freeze({
  WARDEN: Object.freeze({
    id: 'WARDEN',
    label: 'Warden',
    role: 'armored anchor',
    behavior: 'HEAVY_BRUTE',
    bodyDamageScale: 0.62,
    headshotDamageScale: 1,
    firstWave: 5,
    arenaWeight: 0.085,
    globalWeight: 0.035
  }),
  STALKER: Object.freeze({
    id: 'STALKER',
    label: 'Stalker',
    role: 'flanking pressure',
    behavior: 'AGILE_FLANKER',
    bodyDamageScale: 1,
    headshotDamageScale: 1,
    firstWave: 4,
    arenaWeight: 0.11,
    globalWeight: 0.045
  }),
  SAPPER: Object.freeze({
    id: 'SAPPER',
    label: 'Sapper',
    role: 'ranged area denial',
    behavior: 'RANGED_SPLASH',
    bodyDamageScale: 1,
    headshotDamageScale: 1,
    firstWave: 6,
    arenaWeight: 0.075,
    globalWeight: 0.028,
    projectileDamage: 22,
    splashDamage: 10,
    splashRadius: 2.8,
    projectileColor: 0xff9d2e
  })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
}

export function isContent2EnemyType(type) {
  return Object.prototype.hasOwnProperty.call(
    CONTENT2_ENEMY_DEFINITIONS,
    String(type || '').toUpperCase()
  );
}

export function getContent2EnemyDefinition(type) {
  return CONTENT2_ENEMY_DEFINITIONS[String(type || '').toUpperCase()] || null;
}

export function getContent2Behavior(type) {
  return getContent2EnemyDefinition(type)?.behavior || null;
}

export function getContent2IncomingDamageScale(type, { headshot = false } = {}) {
  const definition = getContent2EnemyDefinition(type);
  if (!definition) return 1;
  return clamp(
    headshot ? definition.headshotDamageScale : definition.bodyDamageScale,
    0.25,
    1.5
  );
}

export function getContent2ProjectileProfile(type) {
  const definition = getContent2EnemyDefinition(type);
  if (!definition || definition.behavior !== 'RANGED_SPLASH') {
    return Object.freeze({
      damage: 20,
      splashDamage: 0,
      splashRadius: 0,
      color: 0x00ffff,
      sourceType: 'RANGED'
    });
  }
  return Object.freeze({
    damage: Math.max(1, Math.round(finite(definition.projectileDamage, 22))),
    splashDamage: Math.max(0, Math.round(finite(definition.splashDamage, 10))),
    splashRadius: clamp(definition.splashRadius, 0, 5),
    color: Math.max(0, Math.floor(finite(definition.projectileColor, 0xff9d2e))),
    sourceType: definition.id
  });
}

export function getContent2MaxActive(type, wave = 1, isSpecialRound = false) {
  const name = String(type || '').toUpperCase();
  const currentWave = Math.max(1, Math.floor(finite(wave, 1)));
  if (name === CONTENT2_ENEMY_TYPES.WARDEN) {
    return currentWave < 10 ? 1 : 2;
  }
  if (name === CONTENT2_ENEMY_TYPES.SAPPER) {
    return currentWave < 11 ? 1 : 2;
  }
  if (name === CONTENT2_ENEMY_TYPES.STALKER) {
    return isSpecialRound
      ? Math.min(5, 2 + Math.floor(currentWave / 5))
      : Math.min(3, 1 + Math.floor(currentWave / 7));
  }
  return Number.POSITIVE_INFINITY;
}

export function getContent2SpawnWeights({
  mapId = 'grid_bunker',
  wave = 1,
  isSpecialRound = false,
  endgame = false
} = {}) {
  const normalizedMapId = String(mapId || 'grid_bunker').trim().toLowerCase();
  const currentWave = Math.max(1, Math.floor(finite(wave, 1)));
  const arenaScale = normalizedMapId === CONTENT2_ARENA_ID ? 1 : 0;
  const lateScale = currentWave >= 10 ? 1.25 : 1;
  const endgameScale = endgame === true ? 1.18 : 1;
  const specialScale = isSpecialRound === true ? 0.75 : 1;
  const weights = {};

  for (const definition of Object.values(CONTENT2_ENEMY_DEFINITIONS)) {
    if (currentWave < definition.firstWave) {
      weights[definition.id] = 0;
      continue;
    }
    const base = definition.globalWeight + definition.arenaWeight * arenaScale;
    weights[definition.id] = Number(
      (base * lateScale * endgameScale * specialScale).toFixed(6)
    );
  }
  return Object.freeze(weights);
}

export function applyContent2SpawnMix(mix = [], context = {}) {
  const weights = getContent2SpawnWeights(context);
  const normalized = Array.isArray(mix)
    ? mix.map(([config, weight]) => [config, Math.max(0, finite(weight))])
    : [];
  const byName = new Map(
    normalized.map(([config], index) => [String(config?.name || '').toUpperCase(), index])
  );

  for (const [type, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const config = context.enemyTypes?.[type];
    if (!config) continue;
    const index = byName.get(type);
    if (index === undefined) normalized.push([config, weight]);
    else normalized[index][1] += weight;
  }

  const added = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (added > 0) {
    const shambler = normalized.find(([config]) => config?.name === 'SHAMBLER');
    if (shambler) shambler[1] = Math.max(0.20, shambler[1] - added * 0.72);
  }
  return normalized;
}

export function getContent2EncounterSummary(context = {}) {
  const weights = getContent2SpawnWeights(context);
  return Object.freeze({
    patch: CONTENT2_PATCH,
    schema: CONTENT2_SCHEMA,
    arenaId: CONTENT2_ARENA_ID,
    enemyTypes: Object.freeze(Object.keys(CONTENT2_ENEMY_DEFINITIONS)),
    weights
  });
}

if (typeof window !== 'undefined') {
  window.KAGetContent2EncounterSummary = getContent2EncounterSummary;
}
