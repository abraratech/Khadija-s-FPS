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
  ui: 0.54,
  world: 0.68
});

const AUDIO_ROUTES = Object.freeze({
  weapon: {
    pistol: 'shoot_pistol',
    rifle: 'shoot_rifle',
    smg: 'shoot_rifle',
    shotgun: 'shoot_shotgun',
    sniper: 'shoot_sniper',
    reload: 'reload',
    reload_pistol: 'reload_pistol',
    reload_smg: 'reload_smg',
    reload_rifle: 'reload_rifle',
    reload_shotgun: 'reload_shotgun',
    reload_sniper: 'reload_sniper',
    hit: 'hit'
  },
  player: {
    hurt: 'hurt',
    heartbeat: 'lowHealthHeartbeat',
    down: 'hurt'
  },
  enemy: {
    ranged: 'shoot_pistol',
    exploder: 'shoot_shotgun',
    spore: 'hit'
  },
  ui: {
    confirm: 'hit',
    denied: 'hit',
    equip: 'hit',
    reward: 'hit',
    warning: 'hit',
    waveStart: 'roundStart',
    waveClear: 'roundClear'
  },
  world: {
    woodBreak: 'woodPlankSnap',
    plankRepair: 'hammerNailWood',
    doorOpen: 'hit',
    trapActivate: 'electricTrapHum',
    trapHum: 'electricTrapHum',
    mysteryStart: 'mysteryBoxOpen',
    mysteryTick: 'rouletteSpin',
    mysteryReady: 'boxGunChime',
    mysteryTake: 'boxGunChime',
    teddy: 'teddySqueak',
    powerup: 'boxGunChime'
  }
});

const soundCooldowns = new Map();
const missingSoundWarnings = new Set();

const optionalSoundWarnings = new Set();

const DEDICATED_SOUND_FILES = Object.freeze({
  lowHealthHeartbeat: 'assets/sounds/heartbeat_low_health.mp3',
  woodPlankSnap: 'assets/sounds/wood_plank_snap.mp3',
  hammerNailWood: 'assets/sounds/hammer_nail_wood.mp3',
  mysteryBoxOpen: 'assets/sounds/mystery_box_open.mp3',
  rouletteSpin: 'assets/sounds/roulette_spin.mp3',
  teddySqueak: 'assets/sounds/teddy_squeak.mp3',
  boxGunChime: 'assets/sounds/box_gun_chime.mp3',
  arcadeSparklePing: 'assets/sounds/arcade_sparkle_ping.mp3',
  perkRetroJingle: 'assets/sounds/perk_retro_jingle.mp3',
  electricTrapHum: 'assets/sounds/electric_trap_hum.mp3',
  roundStart: 'assets/sounds/round_start.mp3',
  roundClear: 'assets/sounds/round_clear.mp3',
  shoot_sniper: 'assets/sounds/shoot_sniper.mp3',
  reload_pistol: 'assets/sounds/reload_pistol.mp3',
  reload_smg: 'assets/sounds/reload_smg.mp3',
  reload_rifle: 'assets/sounds/reload_rifle.mp3',
  reload_shotgun: 'assets/sounds/reload_shotgun.mp3',
  reload_sniper: 'assets/sounds/reload_sniper.mp3'
});


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

export async function loadOptionalSound(name, url) {
  if (sounds[name]) return sounds[name];

  try {
    if (!audioCtx) {
      if (AUDIO_DEBUG) console.warn(`⚠️ Cannot load optional "${name}" before AudioContext is initialized.`);
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) {
      if (AUDIO_DEBUG && !optionalSoundWarnings.has(name)) {
        optionalSoundWarnings.add(name);
        console.warn(`Optional sound not found: ${name} at ${url}`);
      }
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    sounds[name] = audioBuffer;
    if (AUDIO_DEBUG) console.log(`🎵 Optional sound loaded: ${name}`);
    return audioBuffer;
  } catch (error) {
    if (AUDIO_DEBUG && !optionalSoundWarnings.has(name)) {
      optionalSoundWarnings.add(name);
      console.warn(`Optional sound failed [${name}]:`, error);
    }
    return null;
  }
}

function loadDedicatedSounds() {
  Object.entries(DEDICATED_SOUND_FILES).forEach(([name, url]) => {
    loadOptionalSound(name, url);
  });
}

function playFallbackSequence(keys, volume = 1.0, options = {}) {
  for (const key of keys) {
    if (playSound(key, volume, true, options)) return true;
  }
  return false;
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
    source.playbackRate.value = Math.max(0.35, Math.min(3.2, explicitPlaybackRate));
  } else if (randomizePitch) {
    const minPitch = Number.isFinite(Number(options.pitchMin)) ? Number(options.pitchMin) : 0.9;
    const maxPitch = Number.isFinite(Number(options.pitchMax)) ? Number(options.pitchMax) : 1.1;
    const lo = Math.max(0.35, Math.min(minPitch, maxPitch));
    const hi = Math.min(3.2, Math.max(minPitch, maxPitch));
    source.playbackRate.value = lo + Math.random() * Math.max(0.001, hi - lo);
  }

  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
  return true;
}


function getFallbackSoundsFor(name) {
  switch (name) {
    case 'lowHealthHeartbeat': return [];
    case 'woodPlankSnap': return ['hit'];
    case 'hammerNailWood': return ['hit'];
    case 'mysteryBoxOpen': return ['hit'];
    case 'rouletteSpin': return ['shoot_pistol'];
    case 'teddySqueak': return ['hit'];
    case 'boxGunChime': return ['hit'];
    case 'arcadeSparklePing': return ['hit'];
    case 'perkRetroJingle': return ['hit'];
    case 'electricTrapHum': return ['hit'];
    case 'roundStart': return [];
    case 'roundClear': return ['hit'];
    case 'shoot_sniper': return ['shoot_rifle'];
    case 'reload_pistol':
    case 'reload_smg':
    case 'reload_rifle':
    case 'reload_shotgun':
    case 'reload_sniper':
      return ['reload'];
    default: return [];
  }
}

function playRoutedSound(category, keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  const soundName = resolveSoundName(category, keyOrName);
  const adjustedVolume = volume * getRouteGain(category);

  if (sounds[soundName]) {
    return playSound(soundName, adjustedVolume, randomizePitch, {
      ...options,
      category
    });
  }

  const fallbackSounds = getFallbackSoundsFor(soundName);
  for (const fallback of fallbackSounds) {
    if (sounds[fallback]) {
      return playSound(fallback, adjustedVolume, randomizePitch, {
        ...options,
        category,
        cooldownKey: options.cooldownKey || soundName
      });
    }
  }

  return playSound(soundName, adjustedVolume, randomizePitch, {
    ...options,
    category
  });
}


export function playWeaponSound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  return playRoutedSound('weapon', keyOrName, volume, randomizePitch, options);
}

const RELOAD_SOUND_BY_FAMILY = Object.freeze({
  PISTOL: 'reload_pistol',
  SMG: 'reload_smg',
  RIFLE: 'reload_rifle',
  SHOTGUN: 'reload_shotgun',
  SNIPER: 'reload_sniper'
});

export function playWeaponReloadSound(
  weaponFamily,
  targetDuration,
  volume = 0.78,
  options = {}
) {
  const family = String(weaponFamily || 'PISTOL')
    .replace('_UPG', '')
    .toUpperCase();

  const soundName = RELOAD_SOUND_BY_FAMILY[family] || 'reload';
  const safeTargetDuration = Math.max(0.20, Number(targetDuration) || 1.0);

  // Use the decoded file's real duration. Therefore a clip that is a few
  // hundredths longer/shorter still lands its final mechanical click at the
  // end of the actual in-game reload animation.
  const dedicatedBuffer = sounds[soundName];
  const fallbackBuffer = sounds.reload;
  const selectedBuffer = dedicatedBuffer || fallbackBuffer;
  const playbackRate = selectedBuffer?.duration
    ? selectedBuffer.duration / safeTargetDuration
    : 1.0;

  return playRoutedSound('weapon', soundName, volume, false, {
    ...options,
    playbackRate,
    cooldownKey: options.cooldownKey || `reload_${family}`
  });
}

export function playPlayerSound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  return playRoutedSound('player', keyOrName, volume, randomizePitch, options);
}

export function playEnemySound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  return playRoutedSound('enemy', keyOrName, volume, randomizePitch, options);
}

export function playUISound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  return playRoutedSound('ui', keyOrName, volume, randomizePitch, options);
}

export function playWorldSound(keyOrName, volume = 1.0, randomizePitch = false, options = {}) {
  return playRoutedSound('world', keyOrName, volume, randomizePitch, options);
}


let heartbeatTimer = 0;

export function updateLowHealthHeartbeat(playerState, dt = 0.016) {
  if (!playerState?.alive || !audioCtx) {
    heartbeatTimer = 0;
    return;
  }

  const maxHealth = Math.max(1, Number(playerState.maxHealth) || 100);
  const healthPct = Math.max(0, Math.min(1, (Number(playerState.health) || 0) / maxHealth));

  if (healthPct > 0.45) {
    heartbeatTimer = 0;
    return;
  }

  const danger = 1 - (healthPct / 0.45);
  const interval = Math.max(0.62, 1.20 - danger * 0.38);
  heartbeatTimer -= dt;

  if (heartbeatTimer > 0) return;
  heartbeatTimer = interval;

  playPlayerSound('heartbeat', 0.22 + danger * 0.25, false, {
    cooldownKey: 'low_health_heartbeat',
    cooldownMs: Math.round(interval * 820),
    playbackRate: 0.88 + danger * 0.16
  });
}



if (typeof window !== 'undefined') {
  window.KAPlayHeartbeatTest = () => playPlayerSound('heartbeat', 0.55, false, {
    cooldownKey: `heartbeat_test_${Date.now()}`,
    cooldownMs: 0
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
  loadDedicatedSounds();
}