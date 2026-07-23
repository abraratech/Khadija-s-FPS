import assert from 'node:assert/strict';
import { MAP_IDS, MAP_REGISTRY, MAP_LIST, getPlayableMaps, normalizeMapId } from './map_registry.js';

assert.equal(Object.keys(MAP_REGISTRY).length, 10);
assert.equal(MAP_LIST.length, 10);
assert.equal(getPlayableMaps().length, 10);
assert.equal(MAP_REGISTRY[MAP_IDS.CROSSFIRE_TERMINAL].pvpFocused, true);
assert.equal(MAP_REGISTRY[MAP_IDS.FOUNDRY_RING].pvpFocused, true);
assert.equal(MAP_REGISTRY[MAP_IDS.SKYLINE_RELAY].pvpFocused, true);
assert.equal(normalizeMapId(8), MAP_IDS.CROSSFIRE_TERMINAL);
assert.equal(normalizeMapId(9), MAP_IDS.FOUNDRY_RING);
assert.equal(normalizeMapId(10), MAP_IDS.SKYLINE_RELAY);
assert.equal(normalizeMapId(11), MAP_IDS.STORMBREAK_CANAL);
assert.equal(MAP_REGISTRY[MAP_IDS.STORMBREAK_CANAL].content2Arena, true);
assert.equal(MAP_REGISTRY[MAP_IDS.STORMBREAK_CANAL].pvpFocused, false);
console.log('PVP.5 R1.1 map registry load contract: PASS');
