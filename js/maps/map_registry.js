// js/maps/map_registry.js
// Central map list for Khadija's Arena.
// Game and preview tools should both read from this registry.

export const MAP_IDS = Object.freeze({
  GRID_BUNKER: "grid_bunker",
  INDUSTRIAL_YARD: "industrial_yard",
  PARKING_GARAGE: "parking_garage",
  HOSPITAL_WING: "hospital_wing",
  ROOFTOP_SITE: "rooftop_site"
});

export const MAP_REGISTRY = Object.freeze([
  {
    id: MAP_IDS.GRID_BUNKER,
    name: "The Grid Bunker",
    subtitle: "Classic close-quarters test arena",
    description: "The original stable arena. Used as the safe fallback map while the new map system is built.",
    status: "stable",
    playable: true,
    legacyIndex: 0,
    previewKey: "grid-bunker"
  },
  {
    id: MAP_IDS.INDUSTRIAL_YARD,
    name: "Industrial Yard",
    subtitle: "Containers, barricades, traps",
    description: "Single-floor combat yard with containers, cover, barricades, and electric traps.",
    status: "stable",
    playable: true,
    legacyIndex: 1,
    previewKey: "industrial-yard"
  },
  {
    id: MAP_IDS.PARKING_GARAGE,
    name: "Parking Garage",
    subtitle: "Pillars, cars, dark lanes",
    description: "Planned single-floor garage map with controlled vertical feel.",
    status: "planned",
    playable: false,
    previewKey: "parking-garage"
  },
  {
    id: MAP_IDS.HOSPITAL_WING,
    name: "Hospital Wing",
    subtitle: "Corridors, rooms, horror lighting",
    description: "Planned single-floor horror-style corridor map.",
    status: "planned",
    playable: false,
    previewKey: "hospital-wing"
  },
  {
    id: MAP_IDS.ROOFTOP_SITE,
    name: "Rooftop Site",
    subtitle: "Construction props and skyline boundaries",
    description: "Planned single-floor rooftop map with controlled vertical props.",
    status: "planned",
    playable: false,
    previewKey: "rooftop-site"
  }
]);

export function normalizeMapId(value) {
  const raw = String(value ?? "").trim();

  if (!raw || raw === "0" || raw === MAP_IDS.GRID_BUNKER) {
    return MAP_IDS.GRID_BUNKER;
  }

  const found = MAP_REGISTRY.find((map) => map.id === raw);
  if (found) return found.id;

  console.warn(`Unknown map id "${raw}", falling back to "${MAP_IDS.GRID_BUNKER}".`);
  return MAP_IDS.GRID_BUNKER;
}

export function getMapMeta(value) {
  const id = normalizeMapId(value);
  return MAP_REGISTRY.find((map) => map.id === id) || MAP_REGISTRY[0];
}

export function getPlayableMaps() {
  return MAP_REGISTRY.filter((map) => map.playable);
}

export function getAllMaps() {
  return MAP_REGISTRY.slice();
}