// js/maps/gameplay_points.js
// Shared map-specific gameplay placement pools.
// weapons.js and map_preview.html both read from this file.

import * as THREE from 'three';
import { MAP_IDS, normalizeMapId } from './map_registry.js';

function v(x, z) {
  return new THREE.Vector3(x, 0.4, z);
}

const GRID_BUNKER_POINTS = {
  // C8: ordered by tactical intent.
  // 1st point = preferred authored placement, later points = safe relocation options.
  BOX_SPAWNS: [
    v(15, -15),   // risky corner route
    v(-15, 15),   // opposite corner rotation
    v(0, 25),     // long lane reward
    v(-10, -20),  // back route pressure
    v(8, 0)       // fallback only
  ],

  WALL_SPAWNS: [
    v(-12, -5),   // early SMG route anchor
    v(12, -5),    // shotgun counter-route
    v(-4, -10),
    v(4, -10),
    v(0, -20)
  ],

  AMMO_SPAWNS: [
    v(0, 15),     // visible mid-lane refill
    v(-15, -10),
    v(12, 12),
    v(-8, 0)
  ],

  HEALTH_SPAWNS: [
    v(-21, 9),    // edge rescue, not free center heal
    v(21, -9),
    v(-9, 21),
    v(9, -21)
  ],

  UPGRADE_SPAWNS: [
    v(15, 15),    // reward for committing to corner route
    v(-15, -15),
    v(-10, 10),
    v(0, 8)
  ],

  PERK_HEALTH_SPAWNS: [
    v(-16, 8),
    v(16, -8),
    v(-8, -8),
    v(-8, 16)
  ],

  PERK_RELOAD_SPAWNS: [
    v(16, 8),
    v(-16, -8),
    v(8, 8),
    v(8, -16)
  ]
};

const INDUSTRIAL_YARD_POINTS = {
  BOX_SPAWNS: [
    v(-34, 18),   // far yard reward
    v(34, -18),   // opposite long rotation
    v(-18, -18),
    v(18, 18),
    v(0, 0)       // fallback only
  ],

  WALL_SPAWNS: [
    v(-36, 0),    // left lane weapon anchor
    v(36, 20),    // high-risk right lane weapon anchor
    v(0, -24),
    v(0, 36),
    v(-18, 36)
  ],

  AMMO_SPAWNS: [
    v(20, 0),     // lane refill after opening routes
    v(-8, -24),
    v(-20, 30),
    v(30, 30)
  ],

  HEALTH_SPAWNS: [
    v(-30, 30),   // corner rescue
    v(30, -30),
    v(12, 24),
    v(-12, -24)
  ],

  UPGRADE_SPAWNS: [
    v(30, 22),    // exposed power position
    v(-34, -22),
    v(14, 14),
    v(-14, -14)
  ],

  PERK_HEALTH_SPAWNS: [
    v(-34, -12),
    v(18, 12),
    v(-12, 34),
    v(12, -34)
  ],

  PERK_RELOAD_SPAWNS: [
    v(34, 12),
    v(-20, -20),
    v(12, 34),
    v(22, -12)
  ]
};

const NEON_DEPOT_POINTS = {
  BOX_SPAWNS: [
    v(-30, 24),   // diagonal route reward
    v(30, -24),
    v(0, 34),
    v(0, 0)
  ],

  WALL_SPAWNS: [
    v(-35, 12),   // blue side route
    v(35, -12),   // orange side route
    v(-12, 35),
    v(12, -35)
  ],

  AMMO_SPAWNS: [
    v(0, -18),    // lower lane resource
    v(0, 18),     // upper lane fallback
    v(-24, -28),
    v(24, 28)
  ],

  HEALTH_SPAWNS: [
    v(-34, 0),    // side rescue instead of center free heal
    v(34, 0),
    v(0, 32),
    v(0, -32)
  ],

  UPGRADE_SPAWNS: [
    v(-22, 0),    // cross-lane upgrade choice
    v(22, 0),
    v(0, 12),
    v(0, -12)
  ],

  PERK_HEALTH_SPAWNS: [
    v(-32, -18),
    v(32, 18)
  ],

  PERK_RELOAD_SPAWNS: [
    v(36, -18),
    v(-36, 18)
  ]
};

const PARKING_GARAGE_POINTS = {
  BOX_SPAWNS: [
    v(-34, -18),  // lower garage risk/reward
    v(34, 18),    // opposite corner rotation
    v(-30, 4),
    v(30, -4),
    v(-12, 12),
    v(12, -12)
  ],

  WALL_SPAWNS: [
    v(-38, 24),   // outer wall SMG
    v(38, -24),   // opposite shotgun route
    v(-38, -6),
    v(38, 6),
    v(-14, 31),
    v(14, -31)
  ],

  AMMO_SPAWNS: [
    v(-34, -8),   // outer lane refill
    v(34, 8),
    v(-10, 28),
    v(10, -28),
    v(-32, 2),
    v(32, -2)
  ],

  HEALTH_SPAWNS: [
    v(-36, 18),
    v(36, -18),
    v(-24, 30),
    v(24, -30)
  ],

  UPGRADE_SPAWNS: [
    v(-8, 23),    // exposed upper route
    v(8, -23),
    v(-12, 0),
    v(12, 0)
  ],

  PERK_HEALTH_SPAWNS: [
    v(-34, 28),
    v(34, -28),
    v(-8, -28)
  ],

  PERK_RELOAD_SPAWNS: [
    v(38, 22),
    v(-38, -22),
    v(8, 28)
  ]
};

const HOSPITAL_WING_POINTS = {
  BOX_SPAWNS: [
    v(-36, 12),   // left ward risk/reward
    v(36, -12),   // right ward rotation
    v(-18, -18),
    v(18, 18),
    v(24, -2),
    v(-8, 2)
  ],

  WALL_SPAWNS: [
    v(-39, 5),    // left corridor weapon anchor
    v(39, -5),    // right corridor weapon anchor
    v(-24, 24),
    v(24, -24),
    v(-24, -24),
    v(24, 24)
  ],

  AMMO_SPAWNS: [
    v(-14, 2),    // corridor midpoint refill
    v(14, -2),
    v(-32, -14),
    v(32, 14),
    v(-16, 24),
    v(16, -24)
  ],

  HEALTH_SPAWNS: [
    v(-34, 24),   // ward rescue points
    v(34, -24),
    v(-34, -24),
    v(34, 24)
  ],

  UPGRADE_SPAWNS: [
    v(-30, 0),    // left/right power route
    v(30, 0),
    v(-6, 22),
    v(6, -22)
  ],

  PERK_HEALTH_SPAWNS: [
    v(-38, 28),
    v(30, -28),
    v(-8, -22)
  ],

  PERK_RELOAD_SPAWNS: [
    v(38, -28),
    v(-30, 28),
    v(8, 22)
  ]
};


// C8: deterministic shop spawn order. These slots make shops feel authored instead
// of randomly scattered. The safe-placement code in weapons.js still validates the
// final position against walls, doors, barricades, traps, and player distance.
export const MAP_SHOP_SPAWN_ORDER = Object.freeze({
  [MAP_IDS.GRID_BUNKER]: {
    MYSTERY_BOX: ['BOX_SPAWNS', 0, 1, 2, 3, 4],
    AMMO: ['AMMO_SPAWNS', 0, 1, 2, 3],
    HEALTH: ['HEALTH_SPAWNS', 0, 1, 2, 3],
    UPGRADE: ['UPGRADE_SPAWNS', 0, 1, 2, 3],
    PERK_HEALTH: ['PERK_HEALTH_SPAWNS', 0, 1, 2, 3],
    PERK_RELOAD: ['PERK_RELOAD_SPAWNS', 0, 1, 2, 3],
    WALL_SMG: ['WALL_SPAWNS', 0, 2, 4],
    WALL_SHOTGUN: ['WALL_SPAWNS', 1, 3, 4]
  },
  [MAP_IDS.INDUSTRIAL_YARD]: {
    MYSTERY_BOX: ['BOX_SPAWNS', 0, 1, 2, 3, 4],
    AMMO: ['AMMO_SPAWNS', 0, 1, 2, 3],
    HEALTH: ['HEALTH_SPAWNS', 0, 1, 2, 3],
    UPGRADE: ['UPGRADE_SPAWNS', 0, 1, 2, 3],
    PERK_HEALTH: ['PERK_HEALTH_SPAWNS', 0, 1, 2, 3],
    PERK_RELOAD: ['PERK_RELOAD_SPAWNS', 0, 1, 2, 3],
    WALL_SMG: ['WALL_SPAWNS', 0, 2, 4],
    WALL_SHOTGUN: ['WALL_SPAWNS', 1, 3, 4]
  },
  [MAP_IDS.NEON_DEPOT]: {
    MYSTERY_BOX: ['BOX_SPAWNS', 0, 1, 2, 3],
    AMMO: ['AMMO_SPAWNS', 0, 1, 2, 3],
    HEALTH: ['HEALTH_SPAWNS', 0, 1, 2, 3],
    UPGRADE: ['UPGRADE_SPAWNS', 0, 1, 2, 3],
    PERK_HEALTH: ['PERK_HEALTH_SPAWNS', 0, 1],
    PERK_RELOAD: ['PERK_RELOAD_SPAWNS', 0, 1],
    WALL_SMG: ['WALL_SPAWNS', 0, 2],
    WALL_SHOTGUN: ['WALL_SPAWNS', 1, 3]
  },
  [MAP_IDS.PARKING_GARAGE]: {
    MYSTERY_BOX: ['BOX_SPAWNS', 0, 1, 2, 3, 4, 5],
    AMMO: ['AMMO_SPAWNS', 0, 1, 2, 3, 4, 5],
    HEALTH: ['HEALTH_SPAWNS', 0, 1, 2, 3],
    UPGRADE: ['UPGRADE_SPAWNS', 0, 1, 2, 3],
    PERK_HEALTH: ['PERK_HEALTH_SPAWNS', 0, 1, 2],
    PERK_RELOAD: ['PERK_RELOAD_SPAWNS', 0, 1, 2],
    WALL_SMG: ['WALL_SPAWNS', 0, 2, 4],
    WALL_SHOTGUN: ['WALL_SPAWNS', 1, 3, 5]
  },
  [MAP_IDS.HOSPITAL_WING]: {
    MYSTERY_BOX: ['BOX_SPAWNS', 0, 1, 2, 3, 4, 5],
    AMMO: ['AMMO_SPAWNS', 0, 1, 2, 3, 4, 5],
    HEALTH: ['HEALTH_SPAWNS', 0, 1, 2, 3],
    UPGRADE: ['UPGRADE_SPAWNS', 0, 1, 2, 3],
    PERK_HEALTH: ['PERK_HEALTH_SPAWNS', 0, 1, 2],
    PERK_RELOAD: ['PERK_RELOAD_SPAWNS', 0, 1, 2],
    WALL_SMG: ['WALL_SPAWNS', 0, 2, 4],
    WALL_SHOTGUN: ['WALL_SPAWNS', 1, 3, 5]
  }
});

export function getOrderedGameplayPointsForShop(mapId, shopType, fallbackPoints = []) {
  const normalizedId = normalizeMapId(mapId);
  const points = getGameplayPointsForMap(normalizedId);
  const rule = MAP_SHOP_SPAWN_ORDER[normalizedId]?.[shopType];

  if (!rule) return fallbackPoints;

  const [groupKey, ...indices] = rule;
  const group = points[groupKey];

  if (!Array.isArray(group) || group.length === 0) return fallbackPoints;

  const ordered = [];
  const used = new Set();

  indices.forEach((index) => {
    const point = group[index];
    if (!point) return;

    const key = `${point.x}:${point.z}`;
    if (used.has(key)) return;

    ordered.push(point);
    used.add(key);
  });

  group.forEach((point) => {
    if (!point) return;

    const key = `${point.x}:${point.z}`;
    if (used.has(key)) return;

    ordered.push(point);
    used.add(key);
  });

  return ordered.length > 0 ? ordered : fallbackPoints;
}


export const MAP_GAMEPLAY_POINTS = {
  [MAP_IDS.GRID_BUNKER]: GRID_BUNKER_POINTS,
  [MAP_IDS.INDUSTRIAL_YARD]: INDUSTRIAL_YARD_POINTS,
  [MAP_IDS.NEON_DEPOT]: NEON_DEPOT_POINTS,
  [MAP_IDS.PARKING_GARAGE]: PARKING_GARAGE_POINTS,
  [MAP_IDS.HOSPITAL_WING]: HOSPITAL_WING_POINTS
};

export function getGameplayPointsForMap(mapId) {
  const normalizedId = normalizeMapId(mapId);
  return MAP_GAMEPLAY_POINTS[normalizedId] || MAP_GAMEPLAY_POINTS[MAP_IDS.GRID_BUNKER];
}

export function getGameplayPointGroups(mapId) {
  const points = getGameplayPointsForMap(mapId);

  return [
    {
      key: 'mystery_box',
      label: 'Mystery Box',
      points: points.BOX_SPAWNS,
      color: 0xb14cff,
      radius: 0.34,
      height: 0.18
    },
    {
      key: 'ammo',
      label: 'Ammo',
      points: points.AMMO_SPAWNS,
      color: 0xffee55,
      radius: 0.26,
      height: 0.18
    },
    {
      key: 'health',
      label: 'Health',
      points: points.HEALTH_SPAWNS,
      color: 0xffee55,
      radius: 0.26,
      height: 0.24
    },
    {
      key: 'upgrade',
      label: 'Upgrade',
      points: points.UPGRADE_SPAWNS,
      color: 0xff66cc,
      radius: 0.34,
      height: 0.20
    },
    {
      key: 'perk_health',
      label: 'Perk Health',
      points: points.PERK_HEALTH_SPAWNS,
      color: 0xff66cc,
      radius: 0.26,
      height: 0.24
    },
    {
      key: 'perk_reload',
      label: 'Perk Reload',
      points: points.PERK_RELOAD_SPAWNS,
      color: 0x66ff99,
      radius: 0.26,
      height: 0.24
    },
    {
      key: 'wall_buy',
      label: 'Wall Buy',
      points: points.WALL_SPAWNS,
      color: 0x4aa8ff,
      radius: 0.22,
      height: 0.14
    }
  ];
}


export const MAP_GAMEPLAY_FLOW = Object.freeze({
  [MAP_IDS.GRID_BUNKER]: {
    role: 'Classic survival baseline',
    shopFlow: 'corner reward loops + safer mid-lane resources',
    pressure: 'medium',
    recommendedDifficulty: 'normal'
  },
  [MAP_IDS.INDUSTRIAL_YARD]: {
    role: 'Open movement / long lanes',
    shopFlow: 'outer lane rotations with exposed upgrade routes',
    pressure: 'medium+',
    recommendedDifficulty: 'normal'
  },
  [MAP_IDS.NEON_DEPOT]: {
    role: 'Readable neon routes',
    shopFlow: 'diagonal cross-lane decisions',
    pressure: 'medium+',
    recommendedDifficulty: 'normal'
  },
  [MAP_IDS.PARKING_GARAGE]: {
    role: 'Cover rhythm / corner pressure',
    shopFlow: 'outer wall buys + corner resource runs',
    pressure: 'high',
    recommendedDifficulty: 'normal'
  },
  [MAP_IDS.HOSPITAL_WING]: {
    role: 'Horror corridors / quarantine pressure',
    shopFlow: 'corridor anchors + ward-room rewards',
    pressure: 'high',
    recommendedDifficulty: 'normal'
  }
});

export function getGameplayFlowForMap(mapId) {
  const normalizedId = normalizeMapId(mapId);
  return MAP_GAMEPLAY_FLOW[normalizedId] || MAP_GAMEPLAY_FLOW[MAP_IDS.GRID_BUNKER];
}

// Backward-compatible default exports for older code.
// New code should use getGameplayPointsForMap(mapId).
export const BOX_SPAWNS = GRID_BUNKER_POINTS.BOX_SPAWNS;
export const WALL_SPAWNS = GRID_BUNKER_POINTS.WALL_SPAWNS;
export const AMMO_SPAWNS = GRID_BUNKER_POINTS.AMMO_SPAWNS;
export const HEALTH_SPAWNS = GRID_BUNKER_POINTS.HEALTH_SPAWNS;
export const UPGRADE_SPAWNS = GRID_BUNKER_POINTS.UPGRADE_SPAWNS;
export const PERK_HEALTH_SPAWNS = GRID_BUNKER_POINTS.PERK_HEALTH_SPAWNS;
export const PERK_RELOAD_SPAWNS = GRID_BUNKER_POINTS.PERK_RELOAD_SPAWNS;