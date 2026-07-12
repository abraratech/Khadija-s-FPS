// js/multiplayer/voice_readiness_core.test.js
import assert from 'node:assert/strict';
import {
  VOICE_MAX_MUTED_PLAYERS,
  VOICE_PUSH_TO_TALK_CODE,
  VOICE_READINESS_PATCH,
  VoiceReadinessStore,
  inspectVoiceEnvironment,
  normalizeVoiceReadinessPreferences,
  voicePermissionErrorLabel,
} from './voice_readiness_core.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

assert.equal(VOICE_READINESS_PATCH, 'm5-coop-voice-reliability-r1');
assert.equal(VOICE_PUSH_TO_TALK_CODE, 'KeyT');
assert.equal(inspectVoiceEnvironment({ secureContext: false, mediaDevices: {} }).reason, 'insecure-context');
assert.equal(inspectVoiceEnvironment({ secureContext: true, mediaDevices: {} }).reason, 'media-devices-unavailable');
assert.equal(inspectVoiceEnvironment({ secureContext: true, mediaDevices: { getUserMedia() {} } }).supported, true);
assert.equal(voicePermissionErrorLabel({ name: 'NotAllowedError' }), 'MICROPHONE PERMISSION DENIED');
assert.equal(voicePermissionErrorLabel({ name: 'NotFoundError' }), 'NO MICROPHONE FOUND');
assert.equal(voicePermissionErrorLabel({ name: 'NotReadableError' }), 'MICROPHONE IS BUSY');

const normalized = normalizeVoiceReadinessPreferences({
  voiceEnabled: true,
  selectedDeviceId: ' mic-1 ',
  muteAllVoice: true,
  mutedVoicePlayerIds: [' player-a ', 'player-a', '', 'player-b'],
});
assert.equal(normalized.voiceEnabled, true);
assert.equal(normalized.selectedDeviceId, 'mic-1');
assert.equal(normalized.muteAllVoice, true);
assert.deepEqual(normalized.mutedVoicePlayerIds, ['player-a', 'player-b']);
assert.equal(normalized.pushToTalkCode, 'KeyT');

const storage = new MemoryStorage();
const store = new VoiceReadinessStore({ storage, storageKey: 'voice-test' });
store.setVoiceEnabled(true);
store.setSelectedDeviceId('device-a');
store.setMuteAllVoice(true);
store.setVoicePlayerMuted('player-a', true);
assert.equal(store.shouldSilenceVoice('player-a'), true);
const reloaded = new VoiceReadinessStore({ storage, storageKey: 'voice-test' });
assert.equal(reloaded.getSnapshot().voiceEnabled, true);
assert.equal(reloaded.getSnapshot().selectedDeviceId, 'device-a');
assert.equal(reloaded.getSnapshot().muteAllVoice, true);
assert.equal(reloaded.isVoicePlayerMuted('player-a'), true);
reloaded.setMuteAllVoice(false);
for (let index = 0; index < VOICE_MAX_MUTED_PLAYERS + 10; index += 1) {
  reloaded.setVoicePlayerMuted(`player-${index}`, true);
}
assert.equal(reloaded.getSnapshot().mutedVoicePlayerIds.length, VOICE_MAX_MUTED_PLAYERS);
console.log('voice_readiness_core tests passed');
