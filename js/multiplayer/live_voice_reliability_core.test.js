// js/multiplayer/live_voice_reliability_core.test.js
import assert from 'node:assert/strict';
import {
  LIVE_VOICE_RELIABILITY_PATCH,
  VOICE_DISCONNECT_GRACE_MS,
  VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS,
  classifyVoiceQuality,
  normalizeVoicePeerState,
  normalizeVoiceQualityMetrics,
  shouldRepairVoicePeer,
  summarizeVoiceHealth,
  voiceRepairDelay,
} from './live_voice_reliability_core.js';

assert.equal(LIVE_VOICE_RELIABILITY_PATCH, 'm5-coop-turn-fallback-r1');
assert.equal(normalizeVoicePeerState('connected', 'checking'), 'connected');
assert.equal(normalizeVoicePeerState('connecting', 'failed'), 'failed');
assert.equal(normalizeVoicePeerState('connected', 'disconnected'), 'connected');
assert.equal(normalizeVoicePeerState('closed', 'connected'), 'closed');
assert.deepEqual([0, 1, 2, 3, 4, 9].map(voiceRepairDelay), [0, 1600, 3200, 6400, 10000, 10000]);
assert.equal(shouldRepairVoicePeer({ active: true, online: true, state: 'failed', attempts: 0 }), true);
assert.equal(shouldRepairVoicePeer({ active: true, online: true, state: 'disconnected', disconnectedForMs: VOICE_DISCONNECT_GRACE_MS - 1 }), false);
assert.equal(shouldRepairVoicePeer({ active: true, online: true, state: 'disconnected', disconnectedForMs: VOICE_DISCONNECT_GRACE_MS }), true);
assert.equal(shouldRepairVoicePeer({ active: true, online: true, state: 'failed', attempts: VOICE_MAX_AUTOMATIC_REPAIR_ATTEMPTS }), false);
assert.equal(shouldRepairVoicePeer({ active: true, online: false, state: 'failed', attempts: 0 }), false);
assert.deepEqual(normalizeVoiceQualityMetrics({ packetsReceived: 90, packetsLost: 10, jitterMs: 20, rttMs: 80 }), {
  packetsReceived: 90,
  packetsLost: 10,
  lossPercent: 10,
  jitterMs: 20,
  rttMs: 80,
});
assert.equal(classifyVoiceQuality({ lossPercent: 0.5, jitterMs: 10, rttMs: 80 }), 'excellent');
assert.equal(classifyVoiceQuality({ lossPercent: 2, jitterMs: 45, rttMs: 220 }), 'good');
assert.equal(classifyVoiceQuality({ lossPercent: 6, jitterMs: 90, rttMs: 450 }), 'degraded');
assert.equal(classifyVoiceQuality({ lossPercent: 12, jitterMs: 150, rttMs: 900 }), 'poor');
assert.equal(summarizeVoiceHealth([], { active: false }).state, 'off');
assert.equal(summarizeVoiceHealth([{ state: 'failed', blocked: true }], { active: true }).state, 'blocked');
assert.equal(summarizeVoiceHealth([{ state: 'connected', quality: 'good' }], { active: true }).state, 'connected');
console.log('live_voice_reliability_core tests passed');
