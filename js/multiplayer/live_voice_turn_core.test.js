// js/multiplayer/live_voice_turn_core.test.js
import assert from 'node:assert/strict';
import {
  LIVE_VOICE_TURN_PATCH,
  DEFAULT_VOICE_ICE_SERVERS,
  hasVoiceTurnRelay,
  normalizeVoiceIceConfig,
  normalizeVoiceIceServers,
  voiceIceConfigFresh,
  voicePeerConfiguration
} from './live_voice_turn_core.js';

assert.equal(LIVE_VOICE_TURN_PATCH, 'm5-coop-turn-fallback-r1');
const servers = normalizeVoiceIceServers([
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
  { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
  { urls: 'turn:evil.example:3478', username: 'u', credential: 'c' },
]);
assert.equal(servers.some((entry) => entry.urls.some((url) => url.includes(':53'))), false);
assert.equal(servers.some((entry) => entry.urls.some((url) => url.includes('evil.example'))), false);
assert.equal(hasVoiceTurnRelay(servers), true);
assert.equal(hasVoiceTurnRelay([{ urls: 'turn:turn.cloudflare.com:3478' }]), false);
const config = normalizeVoiceIceConfig({ iceServers: servers, turnRelayConfigured: true, generatedAt: 1000, expiresAt: 601000 }, { now: 1000 });
assert.equal(config.turnRelayConfigured, true);
assert.equal(voiceIceConfigFresh(config, 1000), true);
assert.equal(voiceIceConfigFresh(config, 400000), false);
assert.equal(voicePeerConfiguration(DEFAULT_VOICE_ICE_SERVERS).bundlePolicy, 'max-bundle');
console.log('live_voice_turn_core tests passed');
