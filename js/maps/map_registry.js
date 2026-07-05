// js/maps/map_registry.js

export const MAP_IDS = Object.freeze({
  GRID_BUNKER: 'grid_bunker',
  INDUSTRIAL_YARD: 'industrial_yard',
  NEON_DEPOT: 'neon_depot',
  PARKING_GARAGE: 'parking_garage',
  HOSPITAL_WING: 'hospital_wing'
});

export const MAP_REGISTRY = Object.freeze({
  [MAP_IDS.GRID_BUNKER]: {
    id: MAP_IDS.GRID_BUNKER,
    name: 'Grid Bunker',
    subtitle: 'Cold Containment Bunker',
    description: 'Classic containment bunker flow with tight lanes, doors, traps, and reliable survival pacing.',
    status: 'stable',
    playable: true,
    legacyIndex: 0,
    rotationRole: 'Classic baseline',
    recommendedDifficulty: 'normal',
    difficultyFeel: 'medium',
    navigation: 'simple',
    spawnProfile: 'outer + locked',
    previewSize: 'compact',
    accentColor: '#22ff88'
  },

  [MAP_IDS.INDUSTRIAL_YARD]: {
    id: MAP_IDS.INDUSTRIAL_YARD,
    name: 'Industrial Yard',
    subtitle: 'Dusty Container Yard',
    description: 'Wider outdoor-style lanes with container cover, warm lighting, traps, and room to kite enemies.',
    status: 'stable',
    playable: true,
    legacyIndex: 3,
    rotationRole: 'Open movement',
    recommendedDifficulty: 'normal',
    difficultyFeel: 'medium+',
    navigation: 'open',
    spawnProfile: 'outer lanes',
    previewSize: 'large',
    accentColor: '#ffaa00'
  },

  [MAP_IDS.NEON_DEPOT]: {
    id: MAP_IDS.NEON_DEPOT,
    name: 'Neon Depot',
    subtitle: 'Abandoned Transit Depot',
    description: 'Fast visual read, glowing transit lanes, security gates, side barricades, and outer spawn pressure.',
    status: 'stable',
    playable: true,
    legacyIndex: 4,
    rotationRole: 'Readable pressure',
    recommendedDifficulty: 'normal',
    difficultyFeel: 'medium+',
    navigation: 'open',
    spawnProfile: 'outer + locked',
    previewSize: 'transit',
    accentColor: '#00d4ff'
  },

  [MAP_IDS.PARKING_GARAGE]: {
    id: MAP_IDS.PARKING_GARAGE,
    name: 'Parking Garage',
    subtitle: 'Concrete Pillar Deck',
    description: 'Concrete deck combat with pillars, parked cars, security gate flow, and corner pressure.',
    status: 'stable',
    playable: true,
    legacyIndex: 5,
    rotationRole: 'Cover rhythm',
    recommendedDifficulty: 'normal',
    difficultyFeel: 'high',
    navigation: 'medium',
    spawnProfile: 'corners + locked',
    previewSize: 'single level',
    accentColor: '#d6dce8'
  },

  [MAP_IDS.HOSPITAL_WING]: {
    id: MAP_IDS.HOSPITAL_WING,
    name: 'Hospital Wing',
    subtitle: 'Emergency Ward',
    description: 'Dark corridor survival with treatment rooms, quarantine gate pressure, and tighter horror pacing.',
    status: 'stable',
    playable: true,
    legacyIndex: 6,
    rotationRole: 'Horror corridors',
    recommendedDifficulty: 'normal',
    difficultyFeel: 'high',
    navigation: 'corridor',
    spawnProfile: 'outer + locked',
    previewSize: 'emergency ward',
    accentColor: '#ff5555'
  }
});

export const MAP_LIST = Object.freeze(Object.values(MAP_REGISTRY));
export const MAPS = MAP_LIST;

const LEGACY_INDEX_TO_ID = Object.freeze({
  0: MAP_IDS.GRID_BUNKER,
  1: MAP_IDS.GRID_BUNKER,
  2: MAP_IDS.GRID_BUNKER,
  3: MAP_IDS.INDUSTRIAL_YARD,
  4: MAP_IDS.NEON_DEPOT,
  5: MAP_IDS.PARKING_GARAGE,
  6: MAP_IDS.HOSPITAL_WING
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

export function getMapRotationSummary() {
  return MAP_LIST
    .filter((map) => map.playable)
    .map((map) => ({
      id: map.id,
      name: map.name,
      role: map.rotationRole,
      difficulty: map.difficultyFeel,
      navigation: map.navigation
    }));
}
