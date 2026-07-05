// js/audio.js
const sounds = {};
let audioCtx = null; // Do NOT create it yet
const AUDIO_DEBUG = false;

const MASTER_VOLUME_KEY = 'ka_master_volume';
let masterVolume = readStoredMasterVolume();

function readStoredMasterVolume() {
  try {
    const saved = localStorage.getItem(MASTER_VOLUME_KEY);
    if (saved === null) return 0.8;

    const parsed = Number(saved);
    if (!Number.isFinite(parsed)) return 0.8;

    return Math.max(0, Math.min(1, parsed));
  } catch {
    return 0.8;
  }
}

export function setMasterVolume(value) {
  const parsed = Number(value);
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  masterVolume = Math.max(0, Math.min(1, Number.isFinite(normalized) ? normalized : 0.8));

  try {
    localStorage.setItem(MASTER_VOLUME_KEY, String(masterVolume));
  } catch {
    // Ignore storage failures in private browsing / restricted modes.
  }

  return masterVolume;
}

export function getMasterVolume() {
  return masterVolume;
}

export function getMasterVolumePercent() {
  return Math.round(masterVolume * 100);
}


const AUDIO_ROUTE_GAIN = Object.freeze({
  weapon: 1.0,
  player: 1.0,
  enemy: 0.85,
  ui: 0.65,
  world: 0.75
});

const AUDIO_ROUTES = Object.freeze({
  weapon: {
    pistol: 'shoot_pistol',
    rifle: 'shoot_rifle',
    smg: 'shoot_rifle',
    shotgun: 'shoot_shotgun',
    reload: 'reload',
    hit: 'hit'
  },
  player: {
    hurt: 'hurt',
    down: 'hurt'
  },
  enemy: {
    ranged: 'shoot_pistol',
    exploder: 'shoot_shotgun',
    spore: 'hurt'
  },
  ui: {
    confirm: 'hit',
    denied: 'hit',
    equip: 'reload',
    reward: 'hit',
    warning: 'hurt',
    waveStart: 'reload',
    waveClear: 'hit'
  },
  world: {
    woodBreak: 'hit',
    plankRepair: 'hit',
    doorOpen: 'hit',
    trapActivate: 'hit',
    mysteryStart: 'hit',
    mysteryTick: 'shoot_pistol',
    mysteryReady: 'reload',
    mysteryTake: 'reload',
    teddy: 'hit',
    powerup: 'hit'
  }
});

const soundCooldowns = new Map();
const missingSoundWarnings = new Set();

function clamp01(value, fallback = 1.0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function resolveSoundName(category, keyOrName) {
  const route = AUDIO_ROUTES[category];
  return route?.[keyOrName] || keyOrName;
}

function getRouteGain(category) {
  return AUDIO_ROUTE_GAIN[category] ?? 1.0;
}

export function hasSound(name) {
  return Boolean(sounds[name]);
}

export async function loadSound(name, url) {
  if (sounds[name]) return sounds[name];

  try {
    if (!audioCtx) {
      if (AUDIO_DEBUG) console.warn(`⚠️ Cannot load "${name}" before AudioContext is initialized.`);
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`File not found at ${url}`);

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    sounds[name] = audioBuffer;
    if (AUDIO_DEBUG) console.log(`🎵 Sound loaded: ${name}`);
    return audioBuffer;
  } catch (error) {
    console.error(`Failed to load sound [${name}]:`, error);
    return null;
  }
}

export function playSound(name, volume = 1.0, randomizePitch = false, options = {}) {
  if (!audioCtx || !sounds[name]) {
    if (AUDIO_DEBUG && !missingSoundWarnings.has(name)) {
      missingSoundWarnings.add(name);
      console.warn(`⚠️ Cannot play "${name}": AudioContext missing or sound not loaded yet.`);
    }
    return false;
  }

  const cooldownMs = Math.max(0, Number(options.cooldownMs) || 0);
  const cooldownKey = options.cooldownKey || name;

  if (cooldownMs > 0) {
    const now = performance.now();
    const lastPlayed = soundCooldowns.get(cooldownKey) || 0;

    if (now - lastPlayed < cooldownMs) {
      return false;
    }

    soundCooldowns.set(cooldownKey, now);
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if (AUDIO_DEBUG) console.log(`🔊 Playing: ${name}`);

  const safeVolume = clamp01(volume, 1.0) * masterVolume;

  if (safeVolume <= 0.001) {
    return false;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = sounds[name];

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = safeVolume;

  const explicitPlaybackRate = Number(options.playbackRate);
  if (Number.isFinite(explicitPlaybackRate) && explicitPlaybackRate > 0) {
    source.playbackRate.value = Math.max(0.35, Math.min(2.5, explicitPlaybackRate));
  } else if (randomizePitch) {
    const minPitch = Number.isFinite(Number(options.pitchMin)) ? Number(options.pitchMin) : 0.9;
    const maxPitch = Number.isFinite(Number(options.pitchMax)) ? Number(options.pitchMax) : 1.1;
    const lo = Math.max(0.35, Math.min(minPitch, maxPitch));
    const hi = Math.min(2.5, Math.max(minPitch, maxPitch));
    source.playbackRate.value = lo + Math.random() * Math.max(0.001, hi - lo);
  }

  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
  return true;
}

export function playWeaponSound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  const soundName = resolveSoundName('weapon', keyOrName);
  return playSound(soundName, volume * getRouteGain('weapon'), randomizePitch, {
    ...options,
    category: 'weapon'
  });
}

export function playPlayerSound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  const soundName = resolveSoundName('player', keyOrName);
  return playSound(soundName, volume * getRouteGain('player'), randomizePitch, {
    ...options,
    category: 'player'
  });
}

export function playEnemySound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  const soundName = resolveSoundName('enemy', keyOrName);
  return playSound(soundName, volume * getRouteGain('enemy'), randomizePitch, {
    ...options,
    category: 'enemy'
  });
}

export function playUISound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  const soundName = resolveSoundName('ui', keyOrName);
  return playSound(soundName, volume * getRouteGain('ui'), randomizePitch, {
    ...options,
    category: 'ui'
  });
}

export function playWorldSound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  const soundName = resolveSoundName('world', keyOrName);
  return playSound(soundName, volume * getRouteGain('world'), randomizePitch, {
    ...options,
    category: 'world'
  });
}

// Called on the PLAY button click
export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (AUDIO_DEBUG) console.log("Audio Context Created & Unlocked!");
  }
  
  loadSound('shoot_rifle', 'assets/sounds/shoot_rifle.mp3');
  loadSound('shoot_shotgun', 'assets/sounds/shoot_shotgun.mp3');
  loadSound('shoot_pistol', 'assets/sounds/shoot_pistol.mp3');
  loadSound('reload', 'assets/sounds/reload.mp3');
  loadSound('hit', 'assets/sounds/hit.mp3');
  loadSound('hurt', 'assets/sounds/hurt.mp3');
}