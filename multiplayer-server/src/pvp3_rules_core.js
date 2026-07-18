// PVP.3 R2 + PVP.4 R1 — dedicated PvP rules, competitive arenas, and
// server-authoritative dynamic neutral hot drops.

export const PVP3_R2_PATCH = 'pvp3-r2-dedicated-rules-neutral-pickups';
export const PVP4_R1_PATCH = 'pvp4-r1-competitive-maps-dynamic-hot-drops';
export const PVP_ACTIVE_RULES_PATCH = PVP4_R1_PATCH;
export const PVP3_R2_SCHEMA = 2;
export const PVP3_R2_MODE = 'pvp-team-elimination';
export const PVP3_R2_ARMOR_CAP = 35;
export const PVP3_R2_PICKUP_CLAIM_RADIUS = 2.35;
export const PVP3_R2_POSE_FRESHNESS_MS = 5_000;
export const PVP4_R1_HOT_DROP_REVEAL_MS = 3_500;
export const PVP4_R1_MIN_RELOCATION_DISTANCE = 14;
export const PVP4_R1_PLAYER_SAFETY_RADIUS = 8;
export const PVP4_R1_PICKUP_SEPARATION = 5;
export const PVP3_R2_STARTER_WEAPONS = Object.freeze(['PISTOL']);
export const PVP3_R2_WEAPON_FAMILIES = Object.freeze(['PISTOL', 'SMG', 'RIFLE', 'SHOTGUN', 'SNIPER']);
export const PVP3_R2_PICKUP_KINDS = Object.freeze(['WEAPON', 'AMMO', 'ARMOR']);
export const PVP4_R1_COMPETITIVE_MAPS = Object.freeze([
  'crossfire_terminal', 'foundry_ring', 'skyline_relay'
]);

const PICKUP_LAYOUTS = Object.freeze({
  grid_bunker: Object.freeze([
    Object.freeze({ id: 'grid-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', respawnMs: 28_000 }),
    Object.freeze({ id: 'grid-shotgun', kind: 'WEAPON', weaponFamily: 'SHOTGUN', respawnMs: 28_000 }),
    Object.freeze({ id: 'grid-ammo', kind: 'AMMO', respawnMs: 18_000 }),
    Object.freeze({ id: 'grid-armor', kind: 'ARMOR', respawnMs: 24_000 })
  ]),
  industrial_yard: Object.freeze([
    Object.freeze({ id: 'yard-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', respawnMs: 28_000 }),
    Object.freeze({ id: 'yard-sniper', kind: 'WEAPON', weaponFamily: 'SNIPER', respawnMs: 32_000 }),
    Object.freeze({ id: 'yard-ammo', kind: 'AMMO', respawnMs: 18_000 }),
    Object.freeze({ id: 'yard-armor', kind: 'ARMOR', respawnMs: 24_000 })
  ]),
  neon_depot: Object.freeze([
    Object.freeze({ id: 'depot-smg', kind: 'WEAPON', weaponFamily: 'SMG', respawnMs: 25_000 }),
    Object.freeze({ id: 'depot-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', respawnMs: 28_000 }),
    Object.freeze({ id: 'depot-ammo', kind: 'AMMO', respawnMs: 18_000 }),
    Object.freeze({ id: 'depot-armor', kind: 'ARMOR', respawnMs: 24_000 })
  ]),
  parking_garage: Object.freeze([
    Object.freeze({ id: 'garage-shotgun', kind: 'WEAPON', weaponFamily: 'SHOTGUN', respawnMs: 28_000 }),
    Object.freeze({ id: 'garage-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', respawnMs: 28_000 }),
    Object.freeze({ id: 'garage-ammo', kind: 'AMMO', respawnMs: 18_000 }),
    Object.freeze({ id: 'garage-armor', kind: 'ARMOR', respawnMs: 24_000 })
  ]),
  hospital_wing: Object.freeze([
    Object.freeze({ id: 'hospital-shotgun', kind: 'WEAPON', weaponFamily: 'SHOTGUN', respawnMs: 28_000 }),
    Object.freeze({ id: 'hospital-smg', kind: 'WEAPON', weaponFamily: 'SMG', respawnMs: 25_000 }),
    Object.freeze({ id: 'hospital-ammo', kind: 'AMMO', respawnMs: 18_000 }),
    Object.freeze({ id: 'hospital-armor', kind: 'ARMOR', respawnMs: 24_000 })
  ]),
  reactor_courtyard: Object.freeze([
    Object.freeze({ id: 'reactor-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', respawnMs: 28_000 }),
    Object.freeze({ id: 'reactor-sniper', kind: 'WEAPON', weaponFamily: 'SNIPER', respawnMs: 32_000 }),
    Object.freeze({ id: 'reactor-ammo', kind: 'AMMO', respawnMs: 18_000 }),
    Object.freeze({ id: 'reactor-armor', kind: 'ARMOR', respawnMs: 24_000 })
  ]),
  crossfire_terminal: Object.freeze([
    Object.freeze({ id: 'crossfire-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', respawnMs: 29_000 }),
    Object.freeze({ id: 'crossfire-shotgun', kind: 'WEAPON', weaponFamily: 'SHOTGUN', respawnMs: 27_000 }),
    Object.freeze({ id: 'crossfire-ammo', kind: 'AMMO', respawnMs: 18_000 }),
    Object.freeze({ id: 'crossfire-armor', kind: 'ARMOR', respawnMs: 24_000 })
  ]),
  foundry_ring: Object.freeze([
    Object.freeze({ id: 'foundry-smg', kind: 'WEAPON', weaponFamily: 'SMG', respawnMs: 25_000 }),
    Object.freeze({ id: 'foundry-shotgun', kind: 'WEAPON', weaponFamily: 'SHOTGUN', respawnMs: 28_000 }),
    Object.freeze({ id: 'foundry-ammo', kind: 'AMMO', respawnMs: 18_000 }),
    Object.freeze({ id: 'foundry-armor', kind: 'ARMOR', respawnMs: 24_000 })
  ]),
  skyline_relay: Object.freeze([
    Object.freeze({ id: 'skyline-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', respawnMs: 29_000 }),
    Object.freeze({ id: 'skyline-sniper', kind: 'WEAPON', weaponFamily: 'SNIPER', respawnMs: 33_000 }),
    Object.freeze({ id: 'skyline-ammo', kind: 'AMMO', respawnMs: 18_000 }),
    Object.freeze({ id: 'skyline-armor', kind: 'ARMOR', respawnMs: 24_000 })
  ])
});

const HOT_DROP_LOCATIONS = Object.freeze({
  grid_bunker: [[0,15],[0,-20],[-15,-10],[15,15],[-20,18],[20,-18],[-6,30],[8,-32]],
  industrial_yard: [[0,0],[0,36],[-20,30],[30,-30],[-34,-10],[34,12],[-12,-36],[18,26]],
  neon_depot: [[0,-18],[0,18],[-24,-28],[24,28],[-33,8],[33,-8],[-12,34],[14,-34]],
  parking_garage: [[-12,0],[12,0],[-34,-8],[34,8],[-26,26],[26,-26],[-6,-32],[8,32]],
  hospital_wing: [[-14,2],[14,-2],[-32,-14],[32,14],[-28,18],[28,-18],[-5,30],[6,-30]],
  reactor_courtyard: [[-13,-13],[13,13],[-24,0],[24,0],[-31,24],[31,-24],[-5,32],[6,-32]],
  crossfire_terminal: [[0,0],[-43,0],[43,0],[-26,-29],[26,29],[-26,29],[26,-29],[0,28],[0,-28],[-12,0],[12,0]],
  foundry_ring: [[0,0],[-34,0],[34,0],[0,-34],[0,34],[-26,-26],[26,26],[-26,26],[26,-26],[-12,12],[12,-12]],
  skyline_relay: [[0,0],[0,-40],[0,40],[-38,-28],[38,28],[-38,28],[38,-28],[-24,20],[24,-20],[-10,-30],[10,30]]
});

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanText(value, fallback = '', limit = 120) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function locationObject(mapId, value, index) {
  const [x, z] = Array.isArray(value) ? value : [0, 0];
  return Object.freeze({
    id: `${normalizePvp3MapId(mapId)}-drop-${index + 1}`,
    x: finite(x), y: 0.55, z: finite(z), index
  });
}

export function normalizePvp3MapId(value) {
  const token = cleanText(value, 'grid_bunker', 60).toLowerCase();
  return Object.hasOwn(PICKUP_LAYOUTS, token) ? token : 'grid_bunker';
}

export function isPvp4CompetitiveMap(value) {
  return PVP4_R1_COMPETITIVE_MAPS.includes(normalizePvp3MapId(value));
}

export function isSupportedPvpRulesPatch(value) {
  const patch = cleanText(value, '', 100);
  return patch === PVP3_R2_PATCH || patch === PVP4_R1_PATCH;
}

export function normalizePvp3WeaponFamily(value, fallback = 'PISTOL') {
  const token = cleanText(value, fallback, 20).toUpperCase();
  return PVP3_R2_WEAPON_FAMILIES.includes(token) ? token : fallback;
}

export function normalizePvp3WeaponList(value = []) {
  const result = [];
  const source = Array.isArray(value) ? value : [];
  [...PVP3_R2_STARTER_WEAPONS, ...source].forEach((entry) => {
    const family = normalizePvp3WeaponFamily(entry);
    if (!result.includes(family)) result.push(family);
  });
  return Object.freeze(result.slice(0, 2));
}

export function pvp3PlayerOwnsWeapon(player, family) {
  const target = normalizePvp3WeaponFamily(family);
  return normalizePvp3WeaponList(player?.unlockedWeapons).includes(target);
}

export function getPvp3PickupDefinitions(mapId) {
  const normalizedMapId = normalizePvp3MapId(mapId);
  return PICKUP_LAYOUTS[normalizedMapId] || PICKUP_LAYOUTS.grid_bunker;
}

export function getPvp4HotDropLocations(mapId) {
  const normalizedMapId = normalizePvp3MapId(mapId);
  const source = HOT_DROP_LOCATIONS[normalizedMapId] || HOT_DROP_LOCATIONS.grid_bunker;
  return Object.freeze(source.map((entry, index) => locationObject(normalizedMapId, entry, index)));
}

export function createPvp3PickupState(mapId, { availableAt = 0, round = 1 } = {}) {
  const normalizedMapId = normalizePvp3MapId(mapId);
  const definitions = getPvp3PickupDefinitions(normalizedMapId);
  const locations = getPvp4HotDropLocations(normalizedMapId);
  const cleanRound = Math.max(1, Math.floor(finite(round, 1)));
  return definitions.map((definition, index) => {
    const location = locations[(index * 2 + cleanRound - 1) % locations.length];
    const readyAt = Math.max(0, finite(availableAt));
    return {
      ...definition,
      mapId: normalizedMapId,
      x: location.x, y: location.y, z: location.z,
      locationId: location.id,
      locationIndex: location.index,
      previousLocationId: '',
      relocationSerial: 0,
      revealAt: Math.max(0, readyAt - PVP4_R1_HOT_DROP_REVEAL_MS),
      availableAt: readyAt,
      claimedBy: '',
      claimSerial: 0,
      round: cleanRound,
      dynamicLocation: true
    };
  });
}

export function normalizePvp3Pickup(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const kindToken = cleanText(source.kind, 'AMMO', 20).toUpperCase();
  const kind = PVP3_R2_PICKUP_KINDS.includes(kindToken) ? kindToken : 'AMMO';
  const availableAt = Math.max(0, finite(source.availableAt));
  return Object.freeze({
    id: cleanText(source.id, '', 80),
    mapId: normalizePvp3MapId(source.mapId),
    kind,
    weaponFamily: kind === 'WEAPON' ? normalizePvp3WeaponFamily(source.weaponFamily, 'RIFLE') : '',
    x: finite(source.x), y: finite(source.y, 0.55), z: finite(source.z),
    locationId: cleanText(source.locationId, '', 100),
    locationIndex: Math.max(0, Math.floor(finite(source.locationIndex))),
    previousLocationId: cleanText(source.previousLocationId, '', 100),
    relocationSerial: Math.max(0, Math.floor(finite(source.relocationSerial))),
    dynamicLocation: source.dynamicLocation !== false,
    respawnMs: Math.max(4_000, Math.floor(finite(source.respawnMs, 20_000))),
    revealAt: Math.max(0, finite(source.revealAt, availableAt - PVP4_R1_HOT_DROP_REVEAL_MS)),
    availableAt,
    claimedBy: cleanText(source.claimedBy, '', 160),
    claimSerial: Math.max(0, Math.floor(finite(source.claimSerial))),
    round: Math.max(1, Math.floor(finite(source.round, 1)))
  });
}

export function normalizePvp3PickupState(value = []) {
  const source = Array.isArray(value) ? value : [];
  return Object.freeze(source.map(normalizePvp3Pickup).filter((entry) => entry.id));
}

export function pvp3PickupAvailable(pickup, now = Date.now()) {
  const normalized = normalizePvp3Pickup(pickup);
  return normalized.id !== '' && Math.max(0, finite(now)) >= normalized.availableAt;
}

export function pvp4PickupTelegraphed(pickup, now = Date.now()) {
  const normalized = normalizePvp3Pickup(pickup);
  const timestamp = Math.max(0, finite(now));
  return timestamp >= normalized.revealAt && timestamp < normalized.availableAt;
}

export function pvp4PickupCountdownSeconds(pickup, now = Date.now()) {
  const normalized = normalizePvp3Pickup(pickup);
  return Math.max(0, Math.ceil((normalized.availableAt - Math.max(0, finite(now))) / 1000));
}

export function pvp3PickupLabel(pickup) {
  const normalized = normalizePvp3Pickup(pickup);
  if (normalized.kind === 'WEAPON') return `${normalized.weaponFamily} HOT DROP`;
  if (normalized.kind === 'ARMOR') return `ARMOR +${PVP3_R2_ARMOR_CAP}`;
  return 'MAX AMMO';
}

export function pvp3FlatDistance(position, pickup) {
  const px = finite(position?.x);
  const pz = finite(position?.z);
  const normalized = normalizePvp3Pickup(pickup);
  return Math.hypot(px - normalized.x, pz - normalized.z);
}

function distanceToLocation(position, location) {
  return Math.hypot(finite(position?.x) - finite(location?.x), finite(position?.z) - finite(location?.z));
}

export function selectPvp4Relocation({
  mapId,
  pickup,
  pickups = [],
  playerPositions = [],
  runId = '',
  round = 1,
  now = Date.now()
} = {}) {
  const normalized = normalizePvp3Pickup(pickup);
  const locations = getPvp4HotDropLocations(mapId || normalized.mapId);
  const occupied = normalizePvp3PickupState(pickups).filter((entry) => entry.id !== normalized.id);
  const players = (Array.isArray(playerPositions) ? playerPositions : []).filter((entry) =>
    Number.isFinite(Number(entry?.x)) && Number.isFinite(Number(entry?.z))
  );

  const strict = locations.filter((location) => (
    location.id !== normalized.locationId
    && distanceToLocation(normalized, location) >= PVP4_R1_MIN_RELOCATION_DISTANCE
    && players.every((position) => distanceToLocation(position, location) >= PVP4_R1_PLAYER_SAFETY_RADIUS)
    && occupied.every((entry) => distanceToLocation(entry, location) >= PVP4_R1_PICKUP_SEPARATION)
  ));
  const relaxed = locations.filter((location) => (
    location.id !== normalized.locationId
    && distanceToLocation(normalized, location) >= PVP4_R1_MIN_RELOCATION_DISTANCE * 0.65
    && occupied.every((entry) => distanceToLocation(entry, location) >= 3)
  ));
  const candidates = strict.length ? strict : relaxed.length ? relaxed : locations.filter((location) => location.id !== normalized.locationId);
  const pool = candidates.length ? candidates : locations;
  const seed = `${runId}|${normalized.id}|${normalized.claimSerial + 1}|${Math.max(1, Math.floor(finite(round, 1)))}|${Math.floor(finite(now) / 1000)}`;
  return pool[stableHash(seed) % pool.length];
}

export function relocatePvp4Pickup({
  pickup,
  pickups = [],
  playerPositions = [],
  runId = '',
  round = 1,
  availableAt = Date.now()
} = {}) {
  const current = normalizePvp3Pickup(pickup);
  const next = selectPvp4Relocation({
    mapId: current.mapId,
    pickup: current,
    pickups,
    playerPositions,
    runId,
    round,
    now: availableAt
  });
  return Object.freeze({
    ...current,
    previousLocationId: current.locationId,
    locationId: next.id,
    locationIndex: next.index,
    x: next.x, y: next.y, z: next.z,
    relocationSerial: current.relocationSerial + 1,
    revealAt: Math.max(0, finite(availableAt) - PVP4_R1_HOT_DROP_REVEAL_MS),
    availableAt: Math.max(0, finite(availableAt)),
    dynamicLocation: true
  });
}
