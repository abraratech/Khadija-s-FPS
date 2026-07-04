// js/maps/map_registry.js

export const MAP_IDS = Object.freeze({
  GRID_BUNKER: 'grid_bunker',
  INDUSTRIAL_YARD: 'industrial_yard',
  NEON_DEPOT: 'neon_depot'
});

export const MAP_REGISTRY = Object.freeze({
  [MAP_IDS.GRID_BUNKER]: {
    id: MAP_IDS.GRID_BUNKER,
    name: 'Grid Bunker',
    subtitle: 'Cold Containment Bunker',
    description: 'A tight bunker arena with gates, corridors, and classic survival flow.',
    status: 'stable',
    playable: true,
    legacyIndex: 0
  },

  [MAP_IDS.INDUSTRIAL_YARD]: {
    id: MAP_IDS.INDUSTRIAL_YARD,
    name: 'Industrial Yard',
    subtitle: 'Dusty Container Yard',
    description: 'An open industrial arena with wider lanes, cover, traps, and warm lighting.',
    status: 'stable',
    playable: true,
    legacyIndex: 3
  },

  [MAP_IDS.NEON_DEPOT]: {
    id: MAP_IDS.NEON_DEPOT,
    name: 'Neon Depot',
    subtitle: 'Abandoned Transit Depot',
    description: 'A neon-lit depot with open lanes, security gates, side barricades, and trap zones.',
    status: 'new',
    playable: true,
    legacyIndex: 4
  }
});

export const MAP_LIST = Object.freeze(Object.values(MAP_REGISTRY));
export const MAPS = MAP_LIST;

const LEGACY_INDEX_TO_ID = Object.freeze({
  0: MAP_IDS.GRID_BUNKER,
  1: MAP_IDS.GRID_BUNKER,
  2: MAP_IDS.GRID_BUNKER,
  3: MAP_IDS.INDUSTRIAL_YARD,
  4: MAP_IDS.NEON_DEPOT
});

export function normalizeMapId(mapId) {
  if (typeof mapId === 'number') {
    return LEGACY_INDEX_TO_ID[mapId] || MAP_IDS.GRID_BUNKER;
  }

  if (typeof mapId === 'string') {
    if (MAP_REGISTRY[mapId]) return mapId;

    const maybeNumber = Number(mapId);
    if (Number.isFinite(maybeNumber) && mapId.trim() !== '') {
      return LEGACY_INDEX_TO_ID[maybeNumber] || MAP_IDS.GRID_BUNKER;
    }
  }

  return MAP_IDS.GRID_BUNKER;
}

export function getMapMeta(mapId) {
  const normalized = normalizeMapId(mapId);
  return MAP_REGISTRY[normalized] || MAP_REGISTRY[MAP_IDS.GRID_BUNKER];
}

export function getPlayableMaps() {
  return MAP_LIST.filter((map) => map.playable);
}