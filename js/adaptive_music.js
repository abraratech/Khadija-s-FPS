import { getMasterVolume } from './audio.js';
import { getMusicVolumePercent } from './player_preferences.js';
import {
  ADAPTIVE_MUSIC_STATES,
  calculateAdaptiveMusicMix,
  detectAdaptiveMusicEvents,
  getMusicProfile,
  normalizeMusicMapId,
  selectAdaptiveMusicState
} from './adaptive_music_core.js';

const UPDATE_INTERVAL_MS = 250;
const FADE_SECONDS = 0.9;
let controller = null;

function safeRead(reader, fallback) {
  try {
    const value = typeof reader === 'function' ? reader() : fallback;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function audioContextClass() {
  return window.AudioContext || window.webkitAudioContext || null;
}

function createPadLayer(context, output, { frequencies, types, filterHz, lfoHz, baseGain, modulation }) {
  const stateGain = context.createGain();
  const toneGain = context.createGain();
  const filter = context.createBiquadFilter();
  stateGain.gain.value = 0;
  toneGain.gain.value = baseGain;
  filter.type = 'lowpass';
  filter.frequency.value = filterHz;
  filter.Q.value = 0.65;
  filter.connect(toneGain);
  toneGain.connect(stateGain);
  stateGain.connect(output);

  const oscillators = frequencies.map((frequency, index) => {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    oscillator.type = types[index % types.length];
    oscillator.frequency.value = frequency;
    oscillator.detune.value = index % 2 === 0 ? -3 : 3;
    voiceGain.gain.value = 1 / Math.max(2, frequencies.length * 1.8);
    oscillator.connect(voiceGain);
    voiceGain.connect(filter);
    oscillator.start();
    return oscillator;
  });

  const lfo = context.createOscillator();
  const lfoDepth = context.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = lfoHz;
  lfoDepth.gain.value = modulation;
  lfo.connect(lfoDepth);
  lfoDepth.connect(toneGain.gain);
  lfo.start();

  return {
    stateGain,
    filter,
    oscillators,
    setFrequencies(values) {
      const now = context.currentTime;
      oscillators.forEach((oscillator, index) => {
        const next = Number(values[index % values.length]) || values[0] || 55;
        oscillator.frequency.setTargetAtTime(next, now, 0.45);
      });
    },
    setFilter(value) {
      filter.frequency.setTargetAtTime(Math.max(120, Number(value) || 500), context.currentTime, 0.5);
    },
    stop() {
      oscillators.forEach((oscillator) => {
        try { oscillator.stop(); } catch { /* already stopped */ }
      });
      try { lfo.stop(); } catch { /* already stopped */ }
    }
  };
}

function createSynth(context) {
  const compressor = context.createDynamicsCompressor();
  const output = context.createGain();
  const stingerBus = context.createGain();
  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.02;
  compressor.release.value = 0.3;
  output.gain.value = 1;
  output.connect(compressor);
  stingerBus.gain.value = 0.32;
  stingerBus.connect(output);
  compressor.connect(context.destination);

  const menu = createPadLayer(context, output, {
    frequencies: [55, 82.5, 110],
    types: ['sine', 'triangle'],
    filterHz: 720,
    lfoHz: 0.11,
    baseGain: 0.22,
    modulation: 0.035
  });
  const ambient = createPadLayer(context, output, {
    frequencies: [43.65, 65.48, 87.3],
    types: ['sine', 'triangle'],
    filterHz: 520,
    lfoHz: 0.08,
    baseGain: 0.20,
    modulation: 0.03
  });
  const combat = createPadLayer(context, output, {
    frequencies: [87.3, 130.8, 174.6],
    types: ['sawtooth', 'square'],
    filterHz: 980,
    lfoHz: 0.34,
    baseGain: 0.12,
    modulation: 0.025
  });

  return { output, stingerBus, menu, ambient, combat };
}

function scheduleTone(context, destination, frequency, start, duration, gainValue, type = 'sine') {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playStinger(kind) {
  if (!controller?.context || !controller?.synth || controller.context.state !== 'running') return;
  const context = controller.context;
  const profile = getMusicProfile(controller.lastSnapshot?.mapId);
  const root = profile.rootHz * 2;
  const now = context.currentTime + 0.015;
  if (kind === 'wave-start') {
    [1, profile.mode[1], profile.mode[2]].forEach((ratio, index) => {
      scheduleTone(context, controller.synth.stingerBus, root * ratio, now + index * 0.09, 0.28, 0.09, 'triangle');
    });
  } else if (kind === 'wave-clear') {
    [profile.mode[2], profile.mode[1], 1].forEach((ratio, index) => {
      scheduleTone(context, controller.synth.stingerBus, root * ratio, now + index * 0.11, 0.34, 0.07, 'sine');
    });
  }
}

function scheduleCombatPulse() {
  if (!controller?.context || !controller?.synth || controller.currentState !== ADAPTIVE_MUSIC_STATES.COMBAT) return;
  if (controller.context.state !== 'running' || document.hidden) return;
  const profile = getMusicProfile(controller.lastSnapshot?.mapId);
  const step = controller.pulseStep++ % 8;
  const ratio = step % 4 === 0 ? 1 : (step % 2 === 0 ? profile.mode[1] : profile.mode[2]);
  const root = profile.rootHz * (step % 4 === 0 ? 1 : 2);
  scheduleTone(
    controller.context,
    controller.synth.combat.stateGain,
    root * ratio,
    controller.context.currentTime + 0.01,
    step % 4 === 0 ? 0.16 : 0.09,
    step % 4 === 0 ? 0.13 : 0.055,
    step % 4 === 0 ? 'square' : 'sawtooth'
  );
}

function applyProfile(mapId) {
  if (!controller?.synth) return;
  const normalized = normalizeMusicMapId(mapId);
  if (normalized === controller.currentMapId) return;
  controller.currentMapId = normalized;
  const profile = getMusicProfile(normalized);
  const ambientFrequencies = [
    profile.rootHz,
    profile.rootHz * profile.mode[1],
    profile.rootHz * profile.mode[2]
  ];
  const combatFrequencies = ambientFrequencies.map((value) => value * 2);
  controller.synth.ambient.setFrequencies(ambientFrequencies);
  controller.synth.ambient.setFilter(profile.colorHz);
  controller.synth.combat.setFrequencies(combatFrequencies);
  controller.synth.combat.setFilter(profile.colorHz * 1.45);
  const pulseMs = Math.max(110, Math.round(60000 / profile.pulseBpm / 2));
  if (controller.pulseTimer) clearInterval(controller.pulseTimer);
  controller.pulseTimer = setInterval(scheduleCombatPulse, pulseMs);
}

function applyMix(mix) {
  if (!controller?.context || !controller?.synth) return;
  const now = controller.context.currentTime;
  controller.synth.output.gain.setTargetAtTime(mix.output > 0 ? 1 : 0, now, 0.12);
  controller.synth.menu.stateGain.gain.setTargetAtTime(mix.menu, now, FADE_SECONDS / 3);
  controller.synth.ambient.stateGain.gain.setTargetAtTime(mix.ambient, now, FADE_SECONDS / 3);
  controller.synth.combat.stateGain.gain.setTargetAtTime(mix.combat, now, FADE_SECONDS / 3);
}

function snapshotState() {
  const bindings = controller?.bindings || {};
  return Object.freeze({
    gameState: String(safeRead(bindings.getGameState, 'menu')),
    mapId: normalizeMusicMapId(safeRead(bindings.getMapId, 'grid_bunker')),
    wave: Math.max(1, Math.floor(Number(safeRead(bindings.getWave, 1)) || 1)),
    enemyCount: Math.max(0, Math.floor(Number(safeRead(bindings.getEnemyCount, 0)) || 0)),
    playerAlive: safeRead(bindings.getPlayerAlive, true) === true,
    specialRound: safeRead(bindings.getSpecialRound, false) === true
  });
}

export function updateAdaptiveMusic() {
  if (!controller) return null;
  const snapshot = snapshotState();
  const state = selectAdaptiveMusicState(snapshot);
  const mix = calculateAdaptiveMusicMix({
    state,
    masterVolume: getMasterVolume(),
    musicVolume: getMusicVolumePercent(),
    documentHidden: document.hidden
  });
  applyProfile(snapshot.mapId);
  if (controller.lastSnapshot) {
    detectAdaptiveMusicEvents(controller.lastSnapshot, snapshot).forEach(playStinger);
  }
  controller.lastSnapshot = snapshot;
  controller.currentState = state;
  applyMix(mix);
  document.documentElement.dataset.kaAdaptiveMusic = controller.context ? 'ready' : 'locked';
  document.documentElement.dataset.kaMusicState = state;
  document.documentElement.dataset.kaMusicMap = snapshot.mapId;
  return Object.freeze({ snapshot, mix });
}

async function unlockAdaptiveMusic() {
  if (!controller) return false;
  const Context = audioContextClass();
  if (!Context) {
    document.documentElement.dataset.kaAdaptiveMusic = 'unsupported';
    return false;
  }
  if (!controller.context) {
    controller.context = new Context();
    controller.synth = createSynth(controller.context);
    applyProfile(controller.lastSnapshot?.mapId || 'grid_bunker');
  }
  try {
    if (controller.context.state === 'suspended') await controller.context.resume();
  } catch {
    return false;
  }
  updateAdaptiveMusic();
  return controller.context.state === 'running';
}

export function initAdaptiveMusic(bindings = {}) {
  if (controller) {
    controller.bindings = { ...controller.bindings, ...bindings };
    updateAdaptiveMusic();
    return controller;
  }
  controller = {
    bindings: { ...bindings },
    context: null,
    synth: null,
    updateTimer: null,
    pulseTimer: null,
    pulseStep: 0,
    currentMapId: '',
    currentState: ADAPTIVE_MUSIC_STATES.SILENCE,
    lastSnapshot: null
  };

  const unlock = () => { void unlockAdaptiveMusic(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  window.addEventListener('ka:player-preferences-change', updateAdaptiveMusic);
  document.addEventListener('visibilitychange', updateAdaptiveMusic);
  controller.updateTimer = setInterval(updateAdaptiveMusic, UPDATE_INTERVAL_MS);
  updateAdaptiveMusic();
  return controller;
}

export function destroyAdaptiveMusic() {
  if (!controller) return;
  if (controller.updateTimer) clearInterval(controller.updateTimer);
  if (controller.pulseTimer) clearInterval(controller.pulseTimer);
  controller.synth?.menu?.stop?.();
  controller.synth?.ambient?.stop?.();
  controller.synth?.combat?.stop?.();
  try { void controller.context?.close?.(); } catch { /* ignore */ }
  controller = null;
  document.documentElement.dataset.kaAdaptiveMusic = 'stopped';
}
