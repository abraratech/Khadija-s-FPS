// js/multiplayer/voice_readiness_core.js
export const VOICE_READINESS_PATCH = 'm5-coop-voice-reliability-r1';
export const VOICE_READINESS_STORAGE_KEY = 'khadijasArena.multiplayer.voiceReadiness.v1';
export const VOICE_PUSH_TO_TALK_CODE = 'KeyT';
export const VOICE_MAX_MUTED_PLAYERS = 64;

function cleanString(value, maxLength = 180) {
  return String(value ?? '')
    .normalize?.('NFKC')
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    ?.trim()
    ?.slice(0, maxLength) || '';
}

export function normalizeVoiceReadinessPreferences(candidate) {
  const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate
    : {};
  const muted = [];
  const seen = new Set();
  const values = Array.isArray(source.mutedVoicePlayerIds) ? source.mutedVoicePlayerIds : [];
  for (const raw of values) {
    const playerId = cleanString(raw, 160);
    if (!playerId || seen.has(playerId)) continue;
    seen.add(playerId);
    muted.push(playerId);
    if (muted.length >= VOICE_MAX_MUTED_PLAYERS) break;
  }
  return Object.freeze({
    voiceEnabled: source.voiceEnabled === true,
    selectedDeviceId: cleanString(source.selectedDeviceId, 240),
    muteAllVoice: source.muteAllVoice === true,
    mutedVoicePlayerIds: Object.freeze(muted),
    pushToTalkCode: VOICE_PUSH_TO_TALK_CODE,
  });
}

export function inspectVoiceEnvironment({
  secureContext = globalThis.isSecureContext === true,
  mediaDevices = globalThis.navigator?.mediaDevices,
} = {}) {
  if (!secureContext) {
    return Object.freeze({
      supported: false,
      canRequestMicrophone: false,
      reason: 'insecure-context',
      label: 'VOICE REQUIRES HTTPS OR LOCALHOST',
    });
  }
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    return Object.freeze({
      supported: false,
      canRequestMicrophone: false,
      reason: 'media-devices-unavailable',
      label: 'MICROPHONE API NOT AVAILABLE',
    });
  }
  return Object.freeze({
    supported: true,
    canRequestMicrophone: true,
    reason: 'ready-to-check',
    label: 'MICROPHONE READY TO CHECK',
  });
}

export function voicePermissionErrorLabel(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'MICROPHONE PERMISSION DENIED';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'NO MICROPHONE FOUND';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'MICROPHONE IS BUSY';
  if (name === 'OverconstrainedError') return 'SELECTED MICROPHONE UNAVAILABLE';
  return 'MICROPHONE CHECK FAILED';
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export class VoiceReadinessStore {
  constructor({ storage = defaultStorage(), storageKey = VOICE_READINESS_STORAGE_KEY } = {}) {
    this.storage = storage;
    this.storageKey = String(storageKey || VOICE_READINESS_STORAGE_KEY);
    this.state = normalizeVoiceReadinessPreferences(null);
    this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem?.(this.storageKey);
      this.state = normalizeVoiceReadinessPreferences(raw ? JSON.parse(raw) : null);
    } catch {
      this.state = normalizeVoiceReadinessPreferences(null);
    }
    return this.getSnapshot();
  }

  save() {
    try {
      this.storage?.setItem?.(this.storageKey, JSON.stringify(this.state));
      return true;
    } catch {
      return false;
    }
  }

  update(changes = {}) {
    this.state = normalizeVoiceReadinessPreferences({ ...this.state, ...changes });
    this.save();
    return this.getSnapshot();
  }

  setVoiceEnabled(value) { return this.update({ voiceEnabled: value === true }); }
  setSelectedDeviceId(value) { return this.update({ selectedDeviceId: value }); }
  setMuteAllVoice(value) { return this.update({ muteAllVoice: value === true }); }

  setVoicePlayerMuted(playerId, muted = true) {
    const normalizedId = cleanString(playerId, 160);
    if (!normalizedId) return { changed: false, reason: 'invalid-player', snapshot: this.getSnapshot() };
    const next = new Set(this.state.mutedVoicePlayerIds);
    const had = next.has(normalizedId);
    if (muted === true) next.add(normalizedId);
    else next.delete(normalizedId);
    this.update({ mutedVoicePlayerIds: [...next] });
    const hasNow = this.state.mutedVoicePlayerIds.includes(normalizedId);
    return {
      changed: had !== hasNow,
      reason: hasNow ? 'muted' : 'unmuted',
      snapshot: this.getSnapshot(),
    };
  }

  isVoicePlayerMuted(playerId) {
    const normalizedId = cleanString(playerId, 160);
    return Boolean(normalizedId && this.state.mutedVoicePlayerIds.includes(normalizedId));
  }

  shouldSilenceVoice(playerId) {
    return this.state.muteAllVoice === true || this.isVoicePlayerMuted(playerId);
  }

  reset() {
    this.state = normalizeVoiceReadinessPreferences(null);
    try { this.storage?.removeItem?.(this.storageKey); } catch {}
    return this.getSnapshot();
  }

  getSnapshot() {
    return Object.freeze({
      patch: VOICE_READINESS_PATCH,
      storageKey: this.storageKey,
      ...this.state,
      mutedVoicePlayerIds: Object.freeze([...this.state.mutedVoicePlayerIds]),
    });
  }
}
