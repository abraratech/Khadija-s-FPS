// PVP.3 R2 — dedicated PvP ruleset and server-authoritative neutral pickups.

export const PVP3_R2_PATCH = 'pvp3-r2-dedicated-rules-neutral-pickups';
export const PVP3_R2_SCHEMA = 1;
export const PVP3_R2_MODE = 'pvp-team-elimination';
export const PVP3_R2_ARMOR_CAP = 35;
export const PVP3_R2_PICKUP_CLAIM_RADIUS = 2.35;
export const PVP3_R2_POSE_FRESHNESS_MS = 5_000;
export const PVP3_R2_STARTER_WEAPONS = Object.freeze(['PISTOL']);
export const PVP3_R2_WEAPON_FAMILIES = Object.freeze([
  'PISTOL', 'SMG', 'RIFLE', 'SHOTGUN', 'SNIPER'
]);
export const PVP3_R2_PICKUP_KINDS = Object.freeze([
  'WEAPON', 'AMMO', 'ARMOR'
]);

const PICKUP_LAYOUTS = Object.freeze({
  grid_bunker: Object.freeze([
    Object.freeze({ id: 'grid-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', x: 0, y: 0.55, z: 15, respawnMs: 28_000 }),
    Object.freeze({ id: 'grid-shotgun', kind: 'WEAPON', weaponFamily: 'SHOTGUN', x: 0, y: 0.55, z: -20, respawnMs: 28_000 }),
    Object.freeze({ id: 'grid-ammo', kind: 'AMMO', x: -15, y: 0.55, z: -10, respawnMs: 18_000 }),
    Object.freeze({ id: 'grid-armor', kind: 'ARMOR', x: 15, y: 0.55, z: 15, respawnMs: 24_000 })
  ]),
  industrial_yard: Object.freeze([
    Object.freeze({ id: 'yard-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', x: 0, y: 0.55, z: 0, respawnMs: 28_000 }),
    Object.freeze({ id: 'yard-sniper', kind: 'WEAPON', weaponFamily: 'SNIPER', x: 0, y: 0.55, z: 36, respawnMs: 32_000 }),
    Object.freeze({ id: 'yard-ammo', kind: 'AMMO', x: -20, y: 0.55, z: 30, respawnMs: 18_000 }),
    Object.freeze({ id: 'yard-armor', kind: 'ARMOR', x: 30, y: 0.55, z: -30, respawnMs: 24_000 })
  ]),
  neon_depot: Object.freeze([
    Object.freeze({ id: 'depot-smg', kind: 'WEAPON', weaponFamily: 'SMG', x: 0, y: 0.55, z: -18, respawnMs: 25_000 }),
    Object.freeze({ id: 'depot-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', x: 0, y: 0.55, z: 18, respawnMs: 28_000 }),
    Object.freeze({ id: 'depot-ammo', kind: 'AMMO', x: -24, y: 0.55, z: -28, respawnMs: 18_000 }),
    Object.freeze({ id: 'depot-armor', kind: 'ARMOR', x: 24, y: 0.55, z: 28, respawnMs: 24_000 })
  ]),
  parking_garage: Object.freeze([
    Object.freeze({ id: 'garage-shotgun', kind: 'WEAPON', weaponFamily: 'SHOTGUN', x: -12, y: 0.55, z: 0, respawnMs: 28_000 }),
    Object.freeze({ id: 'garage-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', x: 12, y: 0.55, z: 0, respawnMs: 28_000 }),
    Object.freeze({ id: 'garage-ammo', kind: 'AMMO', x: -34, y: 0.55, z: -8, respawnMs: 18_000 }),
    Object.freeze({ id: 'garage-armor', kind: 'ARMOR', x: 34, y: 0.55, z: 8, respawnMs: 24_000 })
  ]),
  hospital_wing: Object.freeze([
    Object.freeze({ id: 'hospital-shotgun', kind: 'WEAPON', weaponFamily: 'SHOTGUN', x: -14, y: 0.55, z: 2, respawnMs: 28_000 }),
    Object.freeze({ id: 'hospital-smg', kind: 'WEAPON', weaponFamily: 'SMG', x: 14, y: 0.55, z: -2, respawnMs: 25_000 }),
    Object.freeze({ id: 'hospital-ammo', kind: 'AMMO', x: -32, y: 0.55, z: -14, respawnMs: 18_000 }),
    Object.freeze({ id: 'hospital-armor', kind: 'ARMOR', x: 32, y: 0.55, z: 14, respawnMs: 24_000 })
  ]),
  reactor_courtyard: Object.freeze([
    Object.freeze({ id: 'reactor-rifle', kind: 'WEAPON', weaponFamily: 'RIFLE', x: -13, y: 0.55, z: -13, respawnMs: 28_000 }),
    Object.freeze({ id: 'reactor-sniper', kind: 'WEAPON', weaponFamily: 'SNIPER', x: 13, y: 0.55, z: 13, respawnMs: 32_000 }),
    Object.freeze({ id: 'reactor-ammo', kind: 'AMMO', x: -24, y: 0.55, z: 0, respawnMs: 18_000 }),
    Object.freeze({ id: 'reactor-armor', kind: 'ARMOR', x: 24, y: 0.55, z: 0, respawnMs: 24_000 })
  ])
});

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanText(value, fallback = '', limit = 120) {
  const text = String(value ?? fallback).trim();
  return (text || String(fallback || '')).slice(0, limit);
}

export function normalizePvp3MapId(value) {
  const token = cleanText(value, 'grid_bunker', 60).toLowerCase();
  return Object.hasOwn(PICKUP_LAYOUTS, token) ? token : 'grid_bunker';
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

export function createPvp3PickupState(mapId, {
  availableAt = 0,
  round = 1
} = {}) {
  return getPvp3PickupDefinitions(mapId).map((definition) => ({
    ...definition,
    mapId: normalizePvp3MapId(mapId),
    availableAt: Math.max(0, finite(availableAt)),
    claimedBy: '',
    claimSerial: 0,
    round: Math.max(1, Math.floor(finite(round, 1)))
  }));
}

export function normalizePvp3Pickup(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const kindToken = cleanText(source.kind, 'AMMO', 20).toUpperCase();
  const kind = PVP3_R2_PICKUP_KINDS.includes(kindToken) ? kindToken : 'AMMO';
  return Object.freeze({
    id: cleanText(source.id, '', 80),
    mapId: normalizePvp3MapId(source.mapId),
    kind,
    weaponFamily: kind === 'WEAPON'
      ? normalizePvp3WeaponFamily(source.weaponFamily, 'RIFLE')
      : '',
    x: finite(source.x),
    y: finite(source.y, 0.55),
    z: finite(source.z),
    respawnMs: Math.max(4_000, Math.floor(finite(source.respawnMs, 20_000))),
    availableAt: Math.max(0, finite(source.availableAt)),
    claimedBy: cleanText(source.claimedBy, '', 160),
    claimSerial: Math.max(0, Math.floor(finite(source.claimSerial))),
    round: Math.max(1, Math.floor(finite(source.round, 1)))
  });
}

export function normalizePvp3PickupState(value = []) {
  const source = Array.isArray(value) ? value : [];
  return Object.freeze(source
    .map(normalizePvp3Pickup)
    .filter((entry) => entry.id));
}

export function pvp3PickupAvailable(pickup, now = Date.now()) {
  const normalized = normalizePvp3Pickup(pickup);
  return normalized.id !== '' && Math.max(0, finite(now)) >= normalized.availableAt;
}

export function pvp3PickupLabel(pickup) {
  const normalized = normalizePvp3Pickup(pickup);
  if (normalized.kind === 'WEAPON') return `${normalized.weaponFamily} DROP`;
  if (normalized.kind === 'ARMOR') return `ARMOR +${PVP3_R2_ARMOR_CAP}`;
  return 'MAX AMMO';
}

export function pvp3FlatDistance(position, pickup) {
  const px = finite(position?.x);
  const pz = finite(position?.z);
  const normalized = normalizePvp3Pickup(pickup);
  return Math.hypot(px - normalized.x, pz - normalized.z);
}
