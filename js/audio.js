// js/audio.js
const sounds = {};
let audioCtx = null; // Do NOT create it yet
const AUDIO_DEBUG = false;

const MASTER_VOLUME_KEY = 'ka_master_volume';
let masterVolume = readStoredMasterVolume();
let platformAudioMuted = false;

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

export function setPlatformAudioMuted(muted) {
  platformAudioMuted = muted === true;
  try {
    globalThis.document?.documentElement?.setAttribute?.('data-platform-audio-muted', platformAudioMuted ? 'true' : 'false');
  } catch {
    // Ignore non-browser test environments.
  }
  return platformAudioMuted;
}

export function isPlatformAudioMuted() {
  return platformAudioMuted;
}

export function getMasterVolume() {
  return platformAudioMuted ? 0 : masterVolume;
}

export function getMasterVolumePercent() {
  return Math.round(masterVolume * 100);
}

const TEAM_ALERTS_VOLUME_KEY = 'ka_team_alerts_volume';
const TEAM_ALERT_CAPTIONS_KEY = 'ka_team_alert_captions';
let teamAlertsVolume = readStoredTeamAlertsVolume();
let teamAlertCaptionsEnabled = readStoredTeamAlertCaptions();

function readStoredTeamAlertsVolume() {
  try {
    const saved = localStorage.getItem(TEAM_ALERTS_VOLUME_KEY);
    if (saved === null) return 0.85;
    const parsed = Number(saved);
    return Number.isFinite(parsed)
      ? Math.max(0, Math.min(1, parsed))
      : 0.85;
  } catch {
    return 0.85;
  }
}

function readStoredTeamAlertCaptions() {
  try {
    const saved = localStorage.getItem(TEAM_ALERT_CAPTIONS_KEY);
    return saved === null ? true : saved !== 'off';
  } catch {
    return true;
  }
}

export function setTeamAlertsVolume(value) {
  const parsed = Number(value);
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  teamAlertsVolume = Math.max(
    0,
    Math.min(1, Number.isFinite(normalized) ? normalized : 0.85)
  );
  try {
    localStorage.setItem(
      TEAM_ALERTS_VOLUME_KEY,
      String(teamAlertsVolume)
    );
  } catch {
    // Ignore restricted storage failures.
  }
  return teamAlertsVolume;
}

export function getTeamAlertsVolume() {
  return teamAlertsVolume;
}

export function getTeamAlertsVolumePercent() {
  return Math.round(teamAlertsVolume * 100);
}

export function setTeamAlertCaptionsEnabled(enabled) {
  teamAlertCaptionsEnabled = enabled !== false;
  try {
    localStorage.setItem(
      TEAM_ALERT_CAPTIONS_KEY,
      teamAlertCaptionsEnabled ? 'on' : 'off'
    );
  } catch {
    // Ignore restricted storage failures.
  }
  return teamAlertCaptionsEnabled;
}

export function areTeamAlertCaptionsEnabled() {
  return teamAlertCaptionsEnabled;
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
    rangedCharge: 'enemySpitterCharge',
    heavyWindup: 'enemyHeavyWindup',
    attackInterrupted: 'enemyAttackInterrupt',
    runnerBurst: 'enemyRunnerBurst',
    spitterReposition: 'enemySpitterReposition',
    bruteBrace: 'enemyBruteBrace',
    goliathPhase: 'enemyGoliathPhase',
    exploderPrime: 'enemyExploderPrime',
    crawlerAttack: 'enemyCrawlerAttack',
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
  reload_sniper: 'assets/sounds/reload_sniper.mp3',
  enemySpitterCharge: 'assets/sounds/enemy_spitter_charge.mp3',
  enemyHeavyWindup: 'assets/sounds/enemy_heavy_windup.mp3',
  enemyAttackInterrupt: 'assets/sounds/enemy_attack_interrupt.mp3',
  enemyRunnerBurst: 'assets/sounds/enemy_runner_burst.mp3',
  enemySpitterReposition: 'assets/sounds/enemy_spitter_reposition.mp3',
  enemyBruteBrace: 'assets/sounds/enemy_brute_brace.mp3',
  enemyGoliathPhase: 'assets/sounds/enemy_goliath_phase.mp3',
  enemyExploderPrime: 'assets/sounds/enemy_exploder_prime.mp3',
  enemyCrawlerAttack: 'assets/sounds/enemy_crawler_attack.mp3'
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

  const safeVolume = clamp01(volume, 1.0) * getMasterVolume();

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
    case 'enemySpitterCharge': return ['arcadeSparklePing', 'hit'];
    case 'enemyHeavyWindup': return ['hurt', 'hit'];
    case 'enemyAttackInterrupt': return ['hit'];
    case 'enemyRunnerBurst': return ['hurt', 'hit'];
    case 'enemySpitterReposition': return ['arcadeSparklePing', 'hit'];
    case 'enemyBruteBrace': return ['enemyHeavyWindup', 'hurt'];
    case 'enemyGoliathPhase': return ['enemyHeavyWindup', 'hurt'];
    case 'enemyExploderPrime': return ['shoot_shotgun', 'hit'];
    case 'enemyCrawlerAttack': return ['hit'];
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


const TEAM_ALERT_TONE_SHAPES = Object.freeze({
  ALLY_DOWN: Object.freeze([
    Object.freeze({ at: 0.00, duration: 0.18, from: 520, to: 360, gain: 1.00, type: 'sawtooth' }),
    Object.freeze({ at: 0.21, duration: 0.18, from: 500, to: 330, gain: 0.92, type: 'sawtooth' }),
    Object.freeze({ at: 0.44, duration: 0.24, from: 430, to: 260, gain: 0.86, type: 'triangle' })
  ]),
  ALLY_DOWN_REMINDER: Object.freeze([
    Object.freeze({ at: 0.00, duration: 0.16, from: 420, to: 320, gain: 0.75, type: 'triangle' }),
    Object.freeze({ at: 0.24, duration: 0.16, from: 420, to: 300, gain: 0.70, type: 'triangle' })
  ]),
  ALLY_REVIVED: Object.freeze([
    Object.freeze({ at: 0.00, duration: 0.14, from: 440, to: 560, gain: 0.62, type: 'sine' }),
    Object.freeze({ at: 0.16, duration: 0.22, from: 580, to: 820, gain: 0.72, type: 'sine' })
  ]),
  ENEMY_MARK: Object.freeze([
    Object.freeze({ at: 0.00, duration: 0.09, from: 1120, to: 880, gain: 0.72, type: 'square' }),
    Object.freeze({ at: 0.13, duration: 0.13, from: 920, to: 650, gain: 0.62, type: 'triangle' })
  ]),
  MOVE_MARK: Object.freeze([
    Object.freeze({ at: 0.00, duration: 0.10, from: 470, to: 620, gain: 0.58, type: 'sine' }),
    Object.freeze({ at: 0.14, duration: 0.12, from: 620, to: 820, gain: 0.64, type: 'sine' })
  ]),
  NEED_HELP: Object.freeze([
    Object.freeze({ at: 0.00, duration: 0.13, from: 680, to: 470, gain: 0.88, type: 'square' }),
    Object.freeze({ at: 0.17, duration: 0.13, from: 680, to: 430, gain: 0.84, type: 'square' }),
    Object.freeze({ at: 0.34, duration: 0.16, from: 620, to: 390, gain: 0.76, type: 'triangle' })
  ]),
  NEED_AMMO: Object.freeze([
    Object.freeze({ at: 0.00, duration: 0.08, from: 760, to: 760, gain: 0.54, type: 'square' }),
    Object.freeze({ at: 0.12, duration: 0.08, from: 760, to: 760, gain: 0.54, type: 'square' }),
    Object.freeze({ at: 0.24, duration: 0.08, from: 760, to: 760, gain: 0.54, type: 'square' })
  ]),
  FOLLOW_ME: Object.freeze([
    Object.freeze({ at: 0.00, duration: 0.10, from: 520, to: 650, gain: 0.52, type: 'sine' }),
    Object.freeze({ at: 0.13, duration: 0.15, from: 650, to: 920, gain: 0.60, type: 'sine' })
  ]),
  BUY_OPEN: Object.freeze([
    Object.freeze({ at: 0.00, duration: 0.09, from: 610, to: 610, gain: 0.52, type: 'triangle' }),
    Object.freeze({ at: 0.13, duration: 0.09, from: 820, to: 820, gain: 0.58, type: 'triangle' })
  ])
});

function connectTeamAlertOutput(gainNode, pan = 0) {
  const safePan = Math.max(-1, Math.min(1, Number(pan) || 0));
  if (typeof audioCtx?.createStereoPanner === 'function') {
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = safePan;
    gainNode.connect(panner);
    panner.connect(audioCtx.destination);
    return panner;
  }
  gainNode.connect(audioCtx.destination);
  return gainNode;
}

export function playTeamAlertCue(kind, {
  volume = 1,
  pan = 0,
  cooldownKey = '',
  cooldownMs = 0
} = {}) {
  if (!audioCtx) return false;

  const normalizedKind = String(kind || '').toUpperCase();
  const tones = TEAM_ALERT_TONE_SHAPES[normalizedKind];
  if (!tones?.length) return false;

  const nowMsValue = (
    typeof performance !== 'undefined'
    && typeof performance.now === 'function'
  ) ? performance.now() : Date.now();
  const resolvedCooldownKey = cooldownKey || `team-alert:${normalizedKind}`;
  const lastPlayed = soundCooldowns.get(resolvedCooldownKey) || -Infinity;
  if (
    Number(cooldownMs) > 0
    && nowMsValue - lastPlayed < Number(cooldownMs)
  ) {
    return false;
  }
  soundCooldowns.set(resolvedCooldownKey, nowMsValue);

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const routeVolume = clamp01(volume, 1)
    * getMasterVolume()
    * teamAlertsVolume
    * 0.42;
  if (routeVolume <= 0.001) return false;

  const startTime = audioCtx.currentTime + 0.008;
  tones.forEach((tone) => {
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const toneStart = startTime + Math.max(0, Number(tone.at) || 0);
    const toneEnd = toneStart + Math.max(0.04, Number(tone.duration) || 0.1);
    const toneGain = routeVolume * clamp01(tone.gain, 1);

    oscillator.type = tone.type || 'sine';
    oscillator.frequency.setValueAtTime(
      Math.max(60, Number(tone.from) || 440),
      toneStart
    );
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(60, Number(tone.to) || Number(tone.from) || 440),
      toneEnd
    );

    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, toneGain),
      toneStart + Math.min(0.025, (toneEnd - toneStart) * 0.25)
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

    oscillator.connect(gain);
    connectTeamAlertOutput(gain, pan);
    oscillator.start(toneStart);
    oscillator.stop(toneEnd + 0.01);
  });

  return true;
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