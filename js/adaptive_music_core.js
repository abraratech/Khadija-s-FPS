export const ADAPTIVE_MUSIC_PATCH = 'm4-adaptive-music-r1';

export const ADAPTIVE_MUSIC_STATES = Object.freeze({
  SILENCE: 'silence',
  MENU: 'menu',
  AMBIENT: 'ambient',
  COMBAT: 'combat'
});

export const MAP_MUSIC_PROFILES = Object.freeze({
  grid_bunker: Object.freeze({ id: 'grid_bunker', rootHz: 43.65, colorHz: 520, pulseBpm: 82, mode: Object.freeze([1, 1.1892, 1.4983, 1.7818]) }),
  industrial_yard: Object.freeze({ id: 'industrial_yard', rootHz: 46.25, colorHz: 410, pulseBpm: 88, mode: Object.freeze([1, 1.1225, 1.4983, 1.6818]) }),
  neon_depot: Object.freeze({ id: 'neon_depot', rootHz: 51.91, colorHz: 760, pulseBpm: 96, mode: Object.freeze([1, 1.2599, 1.4983, 1.8877]) }),
  parking_garage: Object.freeze({ id: 'parking_garage', rootHz: 41.20, colorHz: 360, pulseBpm: 78, mode: Object.freeze([1, 1.1892, 1.4142, 1.6818]) }),
  hospital_wing: Object.freeze({ id: 'hospital_wing', rootHz: 48.99, colorHz: 640, pulseBpm: 84, mode: Object.freeze([1, 1.1225, 1.3348, 1.7818]) }),
  reactor_courtyard: Object.freeze({ id: 'reactor_courtyard', rootHz: 55.00, colorHz: 900, pulseBpm: 102, mode: Object.freeze([1, 1.2599, 1.4983, 2.0000]) }),
  stormbreak_canal: Object.freeze({ id: 'stormbreak_canal', rootHz: 46.25, colorHz: 720, pulseBpm: 94, mode: Object.freeze([1, 1.1892, 1.4142, 1.7818]) })
});

const MAP_ALIASES = Object.freeze({
  bunker: 'grid_bunker',
  grid: 'grid_bunker',
  gridbunker: 'grid_bunker',
  yard: 'industrial_yard',
  industrial: 'industrial_yard',
  industrialyard: 'industrial_yard',
  depot: 'neon_depot',
  neon: 'neon_depot',
  neondepot: 'neon_depot',
  garage: 'parking_garage',
  parking: 'parking_garage',
  parkinggarage: 'parking_garage',
  hospital: 'hospital_wing',
  hospitalwing: 'hospital_wing',
  reactor: 'reactor_courtyard',
  courtyard: 'reactor_courtyard',
  reactorcourtyard: 'reactor_courtyard',
  stormbreak: 'stormbreak_canal',
  canal: 'stormbreak_canal',
  stormbreakcanal: 'stormbreak_canal'
});

function clamp(value, minimum, maximum, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
}

function cleanToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeMusicMapId(value) {
  const token = cleanToken(value);
  if (Object.prototype.hasOwnProperty.call(MAP_MUSIC_PROFILES, token)) return token;
  const compact = token.replace(/_/g, '');
  return MAP_ALIASES[token] || MAP_ALIASES[compact] || 'grid_bunker';
}

export function getMusicProfile(value) {
  return MAP_MUSIC_PROFILES[normalizeMusicMapId(value)];
}

export function selectAdaptiveMusicState({
  gameState = 'menu',
  playerAlive = true,
  enemyCount = 0,
  wave = 1,
  specialRound = false
} = {}) {
  const state = cleanToken(gameState);
  const enemies = Math.max(0, Math.floor(clamp(enemyCount, 0, 10000, 0)));
  const currentWave = Math.max(1, Math.floor(clamp(wave, 1, 10000, 1)));

  if (['loading', 'boot', 'hidden', 'suspended'].includes(state)) {
    return ADAPTIVE_MUSIC_STATES.SILENCE;
  }
  if (['menu', 'lobby', 'summary', 'dead', 'ended', 'game_over'].includes(state)) {
    return ADAPTIVE_MUSIC_STATES.MENU;
  }
  if (state === 'paused') return ADAPTIVE_MUSIC_STATES.AMBIENT;
  if (state !== 'playing') return ADAPTIVE_MUSIC_STATES.MENU;
  if (playerAlive !== true) return ADAPTIVE_MUSIC_STATES.SILENCE;
  if (specialRound === true || enemies >= 3 || (currentWave >= 5 && enemies >= 1)) {
    return ADAPTIVE_MUSIC_STATES.COMBAT;
  }
  return ADAPTIVE_MUSIC_STATES.AMBIENT;
}

export function calculateAdaptiveMusicMix({
  state = ADAPTIVE_MUSIC_STATES.SILENCE,
  masterVolume = 1,
  musicVolume = 60,
  documentHidden = false
} = {}) {
  const master = clamp(masterVolume, 0, 1, 1);
  const music = clamp(musicVolume, 0, 100, 60) / 100;
  const base = documentHidden === true ? 0 : master * music;
  const selected = Object.values(ADAPTIVE_MUSIC_STATES).includes(state)
    ? state
    : ADAPTIVE_MUSIC_STATES.SILENCE;
  return Object.freeze({
    state: selected,
    output: base,
    menu: selected === ADAPTIVE_MUSIC_STATES.MENU ? base * 0.42 : 0,
    ambient: selected === ADAPTIVE_MUSIC_STATES.AMBIENT ? base * 0.34 : 0,
    combat: selected === ADAPTIVE_MUSIC_STATES.COMBAT ? base * 0.48 : 0
  });
}

export function detectAdaptiveMusicEvents(previous = {}, current = {}) {
  const events = [];
  const previousWave = Math.max(0, Math.floor(Number(previous.wave) || 0));
  const currentWave = Math.max(0, Math.floor(Number(current.wave) || 0));
  const previousEnemies = Math.max(0, Math.floor(Number(previous.enemyCount) || 0));
  const currentEnemies = Math.max(0, Math.floor(Number(current.enemyCount) || 0));
  const state = cleanToken(current.gameState);

  if (state === 'playing' && previousWave > 0 && currentWave > previousWave) {
    events.push('wave-start');
  }
  if (state === 'playing' && previousEnemies > 0 && currentEnemies === 0 && currentWave === previousWave) {
    events.push('wave-clear');
  }
  return Object.freeze(events);
}
