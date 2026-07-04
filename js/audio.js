// js/audio.js
const sounds = {};
let audioCtx = null; // Do NOT create it yet
const AUDIO_DEBUG = false;

export async function loadSound(name, url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`File not found at ${url}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    sounds[name] = audioBuffer;
    if (AUDIO_DEBUG) console.log(`🎵 Sound loaded: ${name}`);
  } catch (error) {
    console.error(`Failed to load sound [${name}]:`, error);
  }
}

export function playSound(name, volume = 1.0, randomizePitch = false) {
  if (!audioCtx || !sounds[name]) {
    if (AUDIO_DEBUG) console.warn(`⚠️ Cannot play "${name}": AudioContext missing or sound not loaded yet.`);
    return;
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if (AUDIO_DEBUG) console.log(`🔊 Playing: ${name}`);

  const source = audioCtx.createBufferSource();
  source.buffer = sounds[name];

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;

  if (randomizePitch) {
    source.playbackRate.value = 0.9 + Math.random() * 0.2; 
  }

  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(0);
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