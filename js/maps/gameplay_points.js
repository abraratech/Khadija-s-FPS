// js/maps/gameplay_points.js
// Shared map-specific gameplay placement pools.
// weapons.js and map_preview.html both read from this file.

import * as THREE from 'three';
import { MAP_IDS, normalizeMapId } from './map_registry.js';

function v(x, z) {
  return new THREE.Vector3(x, 0.4, z);
}

const GRID_BUNKER_POINTS = {
  BOX_SPAWNS: [
    v(8, 0),
    v(-15, 15),
    v(15, -15),
    v(0, 25),
    v(-10, -20)
  ],

  WALL_SPAWNS: [
    v(-4, -10),
    v(4, -10),
    v(-12, -5),
    v(12, -5),
    v(0, -20)
  ],

  AMMO_SPAWNS: [
    v(-8, 0),
    v(12, 12),
    v(-15, -10),
    v(0, 15)
  ],

  HEALTH_SPAWNS: [
    v(-21, 9),
    v(21, -9),
    v(-9, 21),
    v(9, -21)
  ],

  UPGRADE_SPAWNS: [
    v(0, 8),
    v(15, 15),
    v(-15, -15),
    v(-10, 10)
  ],

  PERK_HEALTH_SPAWNS: [
    v(-8, -8),
    v(-16, 8),
    v(16, -8),
    v(-8, 16)
  ],

  PERK_RELOAD_SPAWNS: [
    v(8, 8),
    v(16, 8),
    v(-16, -8),
    v(8, -16)
  ]
};

const INDUSTRIAL_YARD_POINTS = {
  BOX_SPAWNS: [
    v(0, 0),
    v(-18, -18),
    v(18, 18),
    v(-34, 18),
    v(34, -18)
  ],

  WALL_SPAWNS: [
    v(-36, 0),
    v(36, 20),
    v(0, 36),
    v(0, -24),
    v(-18, 36)
  ],

  AMMO_SPAWNS: [
    v(-8, -24),
    v(20, 0),
    v(-20, 30),
    v(30, 30)
  ],

  HEALTH_SPAWNS: [
    v(-30, 30),
    v(30, -30),
    v(12, 24),
    v(-12, -24)
  ],

  UPGRADE_SPAWNS: [
    v(14, 14),
    v(-14, -14),
    v(30, 22),
    v(-34, -22)
  ],

  PERK_HEALTH_SPAWNS: [
    v(-34, -12),
    v(-12, 34),
    v(18, 12),
    v(12, -34)
  ],

  PERK_RELOAD_SPAWNS: [
    v(34, 12),
    v(12, 34),
    v(-20, -20),
    v(22, -12)
  ]
};

const NEON_DEPOT_POINTS = {
  BOX_SPAWNS: [
    v(-30, 24),
    v(30, -24),
    v(0, 0),
    v(0, 34)
  ],

  WALL_SPAWNS: [
    v(-35, 12),
    v(35, -12),
    v(-12, 35),
    v(12, -35)
  ],

  AMMO_SPAWNS: [
    v(-24, -28),
    v(24, 28),
    v(0, -18),
    v(0, 18)
  ],

  HEALTH_SPAWNS: [
    v(-34, 0),
    v(34, 0),
    v(0, 32),
    v(0, -32)
  ],

  UPGRADE_SPAWNS: [
    v(0, 12),
    v(0, -12),
    v(-22, 0),
    v(22, 0)
  ],

  PERK_HEALTH_SPAWNS: [
    v(-32, -18),
    v(32, 18)
  ],

  PERK_RELOAD_SPAWNS: [
    v(-36, 18),
    v(36, -18)
  ]
};

export const MAP_GAMEPLAY_POINTS = {
  [MAP_IDS.GRID_BUNKER]: GRID_BUNKER_POINTS,
  [MAP_IDS.INDUSTRIAL_YARD]: INDUSTRIAL_YARD_POINTS,
  [MAP_IDS.NEON_DEPOT]: NEON_DEPOT_POINTS
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

// Backward-compatible default exports for older code.
// New code should use getGameplayPointsForMap(mapId).
export const BOX_SPAWNS = GRID_BUNKER_POINTS.BOX_SPAWNS;
export const WALL_SPAWNS = GRID_BUNKER_POINTS.WALL_SPAWNS;
export const AMMO_SPAWNS = GRID_BUNKER_POINTS.AMMO_SPAWNS;
export const HEALTH_SPAWNS = GRID_BUNKER_POINTS.HEALTH_SPAWNS;
export const UPGRADE_SPAWNS = GRID_BUNKER_POINTS.UPGRADE_SPAWNS;
export const PERK_HEALTH_SPAWNS = GRID_BUNKER_POINTS.PERK_HEALTH_SPAWNS;
export const PERK_RELOAD_SPAWNS = GRID_BUNKER_POINTS.PERK_RELOAD_SPAWNS;