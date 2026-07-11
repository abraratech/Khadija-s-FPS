import assert from 'node:assert/strict';
import {
  ADAPTIVE_MUSIC_PATCH,
  ADAPTIVE_MUSIC_STATES,
  MAP_MUSIC_PROFILES,
  calculateAdaptiveMusicMix,
  detectAdaptiveMusicEvents,
  getMusicProfile,
  normalizeMusicMapId,
  selectAdaptiveMusicState
} from './adaptive_music_core.js';

assert.equal(ADAPTIVE_MUSIC_PATCH, 'm4-adaptive-music-r1');
assert.equal(normalizeMusicMapId('Grid Bunker'), 'grid_bunker');
assert.equal(normalizeMusicMapId('industrial-yard'), 'industrial_yard');
assert.equal(normalizeMusicMapId('NeonDepot'), 'neon_depot');
assert.equal(normalizeMusicMapId('unknown-map'), 'grid_bunker');
assert.equal(getMusicProfile('hospital').id, 'hospital_wing');
assert.equal(Object.keys(MAP_MUSIC_PROFILES).length, 6);

assert.equal(selectAdaptiveMusicState({ gameState: 'menu' }), ADAPTIVE_MUSIC_STATES.MENU);
assert.equal(selectAdaptiveMusicState({ gameState: 'loading' }), ADAPTIVE_MUSIC_STATES.SILENCE);
assert.equal(selectAdaptiveMusicState({ gameState: 'paused', enemyCount: 12 }), ADAPTIVE_MUSIC_STATES.AMBIENT);
assert.equal(selectAdaptiveMusicState({ gameState: 'playing', playerAlive: false, enemyCount: 8 }), ADAPTIVE_MUSIC_STATES.SILENCE);
assert.equal(selectAdaptiveMusicState({ gameState: 'playing', enemyCount: 0, wave: 2 }), ADAPTIVE_MUSIC_STATES.AMBIENT);
assert.equal(selectAdaptiveMusicState({ gameState: 'playing', enemyCount: 3, wave: 2 }), ADAPTIVE_MUSIC_STATES.COMBAT);
assert.equal(selectAdaptiveMusicState({ gameState: 'playing', enemyCount: 1, wave: 5 }), ADAPTIVE_MUSIC_STATES.COMBAT);
assert.equal(selectAdaptiveMusicState({ gameState: 'playing', enemyCount: 0, specialRound: true }), ADAPTIVE_MUSIC_STATES.COMBAT);

assert.deepEqual(calculateAdaptiveMusicMix({ state: 'menu', masterVolume: 0.8, musicVolume: 50 }), {
  state: 'menu', output: 0.4, menu: 0.168, ambient: 0, combat: 0
});
assert.equal(calculateAdaptiveMusicMix({ state: 'combat', masterVolume: 1, musicVolume: 100 }).combat, 0.48);
assert.equal(calculateAdaptiveMusicMix({ state: 'combat', masterVolume: 1, musicVolume: 100, documentHidden: true }).output, 0);
assert.equal(calculateAdaptiveMusicMix({ state: 'bad-state' }).state, 'silence');

assert.deepEqual(detectAdaptiveMusicEvents(
  { gameState: 'playing', wave: 2, enemyCount: 0 },
  { gameState: 'playing', wave: 3, enemyCount: 8 }
), ['wave-start']);
assert.deepEqual(detectAdaptiveMusicEvents(
  { gameState: 'playing', wave: 3, enemyCount: 1 },
  { gameState: 'playing', wave: 3, enemyCount: 0 }
), ['wave-clear']);
assert.deepEqual(detectAdaptiveMusicEvents(
  { gameState: 'menu', wave: 1, enemyCount: 0 },
  { gameState: 'menu', wave: 2, enemyCount: 0 }
), []);

console.log('Adaptive music core tests passed');
